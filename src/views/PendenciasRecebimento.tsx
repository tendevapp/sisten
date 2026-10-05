/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos > Pendências > Recebimento.
 *
 * Fila das divergências e entregas parciais do recebimento do almoxarifado,
 * atribuídas ao comprador do PO. O comprador dá a devolutiva (receber o
 * parcial, assumir a NC, devolver...), o almoxarifado é notificado e confirma
 * a execução no hub dele. Regras em `lib/pendenciasRecebimento.ts`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckSquare, Clock, Loader2, PackageX, RefreshCw, Search, Send, Square, UserCheck, UserPlus, Users, X,
} from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import PendenciasSubnav from '../components/suprimentos/PendenciasSubnav';
import PendenciaRecebimentoCartao, { ChipMotivo } from '../components/suprimentos/PendenciaRecebimentoCartao';
import {
  ROTULO_MOTIVO,
  agruparPorPedido,
  abreRnc,
  decisoesComuns,
  filtrarPendencias,
  instrucaoAlmox,
  nomeComprador,
  parametrosDaRota,
  resumirPendencias,
  rotuloDecisao,
  validarDecisao,
  type DecisaoPendencia,
  type FiltroStatus,
  type MotivoPendencia,
  type PendenciaRecebimento,
} from '../lib/pendenciasRecebimento';
import {
  cancelarPendencias,
  decidirPendencias,
  listarCompradoresAtivos,
  listarPendenciasRecebimento,
  reatribuirPendencias,
  type OpcaoComprador,
} from '../lib/pendenciasRecebimentoApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ABAS_STATUS: { id: FiltroStatus; rotulo: string }[] = [
  { id: 'abertas', rotulo: 'Abertas' },
  { id: 'aguardando_comprador', rotulo: 'Aguardando comprador' },
  { id: 'aguardando_almox', rotulo: 'Aguardando almox' },
  { id: 'concluida', rotulo: 'Concluídas' },
  { id: 'cancelada', rotulo: 'Canceladas' },
  { id: 'todas', rotulo: 'Todas' },
];

const ABERTA = (p: PendenciaRecebimento) => p.status === 'aguardando_comprador' || p.status === 'aguardando_almox';

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

type ModalAberto =
  | { tipo: 'decidir'; itens: PendenciaRecebimento[] }
  | { tipo: 'reatribuir'; itens: PendenciaRecebimento[] }
  | { tipo: 'cancelar'; itens: PendenciaRecebimento[] }
  | null;

export default function PendenciasRecebimento({ user, onNavigate }: Props) {
  const toast = useToast();
  const params = useMemo(() => parametrosDaRota(window.location.hash || ''), []);
  const ehComprador = !!user.grupo_compras || user.roles.includes('comprador');

  const [lista, setLista] = useState<PendenciaRecebimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState<FiltroStatus>(
    (ABAS_STATUS.some((a) => a.id === params.status) ? params.status : 'abertas') as FiltroStatus,
  );
  const [somenteMinhas, setSomenteMinhas] = useState(ehComprador && !params.id && !params.conf);
  const [busca, setBusca] = useState('');
  const [motivos, setMotivos] = useState<Set<string>>(new Set());
  const [compradores, setCompradores] = useState<Set<string>>(new Set());
  const [conferencia, setConferencia] = useState<string | null>(params.conf);
  const [destaque, setDestaque] = useState<string | null>(params.id);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalAberto>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarPendenciasRecebimento());
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao carregar as pendências de recebimento.');
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Outra notificação clicada com a tela já aberta: a rota não muda, só o `?…`.
  useEffect(() => {
    const aoMudar = () => {
      const q = parametrosDaRota(window.location.hash || '');
      if (!q.id && !q.conf && !q.status) return;
      setDestaque(q.id);
      setConferencia(q.conf);
      if (q.status && ABAS_STATUS.some((a) => a.id === q.status)) setStatus(q.status as FiltroStatus);
      if (q.id || q.conf) setSomenteMinhas(false);
      void carregar();
    };
    window.addEventListener('hashchange', aoMudar);
    return () => window.removeEventListener('hashchange', aoMudar);
  }, [carregar]);

  // Deep-link da notificação: garante que a pendência apareça e rola até ela.
  useEffect(() => {
    if (!destaque || lista.length === 0) return;
    const alvo = lista.find((p) => p.id === destaque);
    if (!alvo) return;
    if (!ABERTA(alvo)) setStatus('todas');
    const t = setTimeout(() => document.getElementById(`pend-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [destaque, lista]);

  const filtradas = useMemo(() => {
    const base = conferencia ? lista.filter((p) => p.conferencia_id === conferencia) : lista;
    return filtrarPendencias(base, {
      status, somenteMinhas, usuarioId: user.id, busca,
      motivos: motivos as Set<MotivoPendencia>, compradores,
    });
  }, [lista, conferencia, status, somenteMinhas, user.id, busca, motivos, compradores]);

  const grupos = useMemo(() => agruparPorPedido(filtradas), [filtradas]);
  const resumo = useMemo(() => resumirPendencias(lista), [lista]);
  const minhasAguardando = useMemo(
    () => lista.filter((p) => p.status === 'aguardando_comprador' && (p.comprador_id === user.id || !p.comprador_id)).length,
    [lista, user.id],
  );
  const opcoesComprador = useMemo(() => [...new Set(lista.map(nomeComprador))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [lista]);
  const codigoConferencia = conferencia ? lista.find((p) => p.conferencia_id === conferencia)?.conferencia_codigo : null;

  const itensSelecionados = useMemo(() => lista.filter((p) => selecionados.has(p.id) && ABERTA(p)), [lista, selecionados]);

  const alternar = (id: string) => setSelecionados((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const alternarGrupo = (itens: PendenciaRecebimento[]) => {
    const abertas = itens.filter(ABERTA).map((p) => p.id);
    const todas = abertas.every((id) => selecionados.has(id));
    setSelecionados((s) => {
      const n = new Set(s);
      abertas.forEach((id) => (todas ? n.delete(id) : n.add(id)));
      return n;
    });
  };

  const abrirDecisao = (itens: PendenciaRecebimento[]) => {
    const abertas = itens.filter(ABERTA);
    if (abertas.length === 0) return;
    if (decisoesComuns(abertas.map((p) => p.motivo)).length === 0) {
      toast.error('Os itens selecionados não têm decisão em comum — responda separadamente.');
      return;
    }
    setModal({ tipo: 'decidir', itens: abertas });
  };

  const assumir = async (itens: PendenciaRecebimento[]) => {
    try {
      await reatribuirPendencias(itens.map((p) => p.id), user.id);
      toast.success('Pendência atribuída a você.');
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao assumir a pendência.');
    }
  };

  const aposAcao = async (msg: string) => {
    setModal(null);
    setSelecionados(new Set());
    toast.success(msg);
    await carregar();
  };

  const limparFiltros = () => {
    setStatus('abertas'); setSomenteMinhas(false); setBusca(''); setMotivos(new Set()); setCompradores(new Set());
    setConferencia(null); setDestaque(null);
  };

  return (
    <div className="space-y-5 text-left w-full pb-28">
      <PendenciasSubnav user={user} atual="sup_pendencias_recebimento" onNavigate={onNavigate} contagem={{ sup_pendencias_recebimento: minhasAguardando }} />

      <div className="reveal">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <PackageX className="h-7 w-7" style={{ color: 'var(--ink-muted)' }} />
          Pendências de Recebimento
        </h2>
        <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
          Avaria, falta, excedente e entrega parcial apontados na conferência do almoxarifado, por comprador do PO.
          Dê a devolutiva — o almoxarifado é avisado e confirma a execução.
        </p>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Indicador icon={UserCheck} rotulo="Aguardando você" valor={minhasAguardando} tom="var(--status-critical)"
          onClick={() => { setStatus('aguardando_comprador'); setSomenteMinhas(true); }} />
        <Indicador icon={AlertTriangle} rotulo="Atrasadas (+48 h)" valor={resumo.atrasadas} tom="var(--status-critical)"
          onClick={() => { setStatus('aguardando_comprador'); setSomenteMinhas(false); }} />
        <Indicador icon={Clock} rotulo="Aguardando almox" valor={resumo.aguardandoAlmox} tom="var(--status-serious)"
          onClick={() => { setStatus('aguardando_almox'); setSomenteMinhas(false); }} />
        <Indicador icon={Users} rotulo="Sem comprador" valor={resumo.semComprador} tom="var(--ink-secondary)"
          onClick={() => { setStatus('abertas'); setSomenteMinhas(false); setCompradores(new Set(['Sem comprador'])); }} />
        <Indicador icon={CheckSquare} rotulo="Concluídas (90 d)" valor={resumo.concluidas} tom="var(--status-good)"
          onClick={() => { setStatus('concluida'); setSomenteMinhas(false); }} />
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border p-1 w-fit max-w-full overflow-x-auto" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {ABAS_STATUS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setStatus(a.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap"
              style={status === a.id
                ? { background: 'var(--surface-card)', color: 'var(--brand)', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.06)' }
                : { color: 'var(--ink-muted)' }}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="PO, material, fornecedor, conferência…"
              className={`${inputCls} pl-9`}
            />
          </label>
          <MultiSelectFilter label="Motivo" options={Object.keys(ROTULO_MOTIVO)} selected={motivos} onChange={setMotivos}
            renderOption={(o) => ROTULO_MOTIVO[o as MotivoPendencia]} />
          <MultiSelectFilter label="Comprador" options={opcoesComprador} selected={compradores} onChange={setCompradores} icon={Users} />
          <button
            type="button"
            onClick={() => setSomenteMinhas((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"
            style={{
              borderColor: somenteMinhas ? 'var(--brand)' : 'var(--hairline)',
              color: somenteMinhas ? 'var(--brand)' : 'var(--ink-secondary)',
            }}
          >
            {somenteMinhas ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} Só as minhas
          </button>
          <button
            type="button"
            onClick={() => void carregar()}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
        {(conferencia || destaque) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {conferencia && (
              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                Conferência {codigoConferencia || ''}
                <button type="button" onClick={() => setConferencia(null)} aria-label="Tirar filtro de conferência"><X className="h-3 w-3" /></button>
              </span>
            )}
            <button type="button" onClick={limparFiltros} className="font-bold" style={{ color: 'var(--brand)' }}>Limpar filtros</button>
          </div>
        )}
      </div>

      {/* Lista agrupada por PO */}
      {carregando && lista.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando pendências…
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-xl border py-14 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {lista.length === 0
            ? 'Nenhuma pendência de recebimento. Divergências e entregas parciais da conferência aparecem aqui.'
            : 'Nada com esses filtros.'}
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const abertas = g.itens.filter(ABERTA);
            const todasSel = abertas.length > 0 && abertas.every((p) => selecionados.has(p.id));
            return (
              <section key={g.chave} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                        {g.nroPedido ? `PO ${g.nroPedido}` : 'Sem PO'}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>{g.fornecedor || ''}</span>
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      Comprador: <span className="font-bold">{g.comprador}</span> · {g.itens.length} item(ns)
                      {abertas.length > 0 && ` · ${abertas.length} aberto(s)`}
                    </div>
                  </div>
                  {abertas.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => alternarGrupo(g.itens)} className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
                        {todasSel ? 'Desmarcar' : 'Selecionar abertos'}
                      </button>
                      {abertas.length > 1 && (
                        <BotaoPrimario onClick={() => abrirDecisao(abertas)}><Send className="h-3.5 w-3.5" /> Responder o PO</BotaoPrimario>
                      )}
                    </div>
                  )}
                </header>
                <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {g.itens.map((p) => (
                    <PendenciaRecebimentoCartao
                      key={p.id}
                      p={p}
                      destacar={p.id === destaque}
                      selecionavel={ABERTA(p)}
                      selecionado={selecionados.has(p.id)}
                      onAlternar={() => alternar(p.id)}
                      acoes={ABERTA(p) && (
                        <>
                          {!p.comprador_id && (
                            <BotaoSecundario onClick={() => void assumir([p])}><UserPlus className="h-3.5 w-3.5" /> Assumir</BotaoSecundario>
                          )}
                          <BotaoSecundario onClick={() => setModal({ tipo: 'reatribuir', itens: [p] })}><Users className="h-3.5 w-3.5" /> Reatribuir</BotaoSecundario>
                          <BotaoSecundario onClick={() => setModal({ tipo: 'cancelar', itens: [p] })}><Ban className="h-3.5 w-3.5" /> Cancelar</BotaoSecundario>
                          <BotaoPrimario onClick={() => abrirDecisao([p])}>
                            <Send className="h-3.5 w-3.5" /> {p.status === 'aguardando_almox' ? 'Alterar decisão' : 'Responder'}
                          </BotaoPrimario>
                        </>
                      )}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Barra da seleção */}
      {itensSelecionados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{itensSelecionados.length} selecionada(s)</span>
            <div className="flex flex-wrap items-center gap-2">
              <BotaoSecundario onClick={() => setSelecionados(new Set())}>Limpar</BotaoSecundario>
              <BotaoSecundario onClick={() => setModal({ tipo: 'reatribuir', itens: itensSelecionados })}><Users className="h-3.5 w-3.5" /> Reatribuir</BotaoSecundario>
              <BotaoSecundario onClick={() => setModal({ tipo: 'cancelar', itens: itensSelecionados })}><Ban className="h-3.5 w-3.5" /> Cancelar</BotaoSecundario>
              <BotaoPrimario onClick={() => abrirDecisao(itensSelecionados)}><Send className="h-3.5 w-3.5" /> Responder</BotaoPrimario>
            </div>
          </div>
        </div>
      )}

      {modal?.tipo === 'decidir' && (
        <ModalDecisao itens={modal.itens} onClose={() => setModal(null)} onFeito={(n, ncs) => aposAcao(`${n} pendência(s) respondida(s). O almoxarifado foi avisado.${ncs.length ? ` RNC ${ncs.join(', ')} aberta.` : ''}`)} />
      )}
      {modal?.tipo === 'reatribuir' && (
        <ModalReatribuir itens={modal.itens} onClose={() => setModal(null)} onFeito={(n) => aposAcao(`${n} pendência(s) reatribuída(s).`)} />
      )}
      {modal?.tipo === 'cancelar' && (
        <ModalCancelar itens={modal.itens} onClose={() => setModal(null)} onFeito={(n) => aposAcao(`${n} pendência(s) cancelada(s).`)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Indicador({
  icon: Icon, rotulo, valor, tom, onClick,
}: { icon: typeof Clock; rotulo: string; valor: number; tom: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all hover:-translate-y-0.5"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tom} 14%, transparent)`, color: tom }}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold tabular-nums leading-none" style={{ color: 'var(--ink-primary)' }}>{valor}</span>
        <span className="block text-[11px] font-semibold mt-1" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      </span>
    </button>
  );
}

function BotaoPrimario({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      style={{ background: 'var(--brand)' }}
    >
      {children}
    </button>
  );
}

function BotaoSecundario({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold"
      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
    >
      {children}
    </button>
  );
}

function ResumoItens({ itens }: { itens: PendenciaRecebimento[] }) {
  return (
    <ul className="max-h-40 overflow-y-auto space-y-1 rounded-lg border p-2" style={{ borderColor: 'var(--hairline)' }}>
      {itens.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
          <span className="font-mono font-bold">{p.codigo}</span>
          <ChipMotivo motivo={p.motivo} />
          <span className="truncate">{p.material_code ? `${p.material_code} · ` : ''}{p.descricao}</span>
          {p.nro_pedido && <span style={{ color: 'var(--ink-muted)' }}>PO {p.nro_pedido}</span>}
        </li>
      ))}
    </ul>
  );
}

function ModalDecisao({
  itens, onClose, onFeito,
}: { itens: PendenciaRecebimento[]; onClose: () => void; onFeito: (n: number, ncs: string[]) => void }) {
  const opcoes = useMemo(() => decisoesComuns(itens.map((p) => p.motivo)), [itens]);
  const motivoUnico = itens.every((p) => p.motivo === itens[0].motivo) ? itens[0].motivo : null;
  const anterior = itens.length === 1 ? itens[0].decisao : null;
  const [decisao, setDecisao] = useState<DecisaoPendencia | null>(anterior && opcoes.includes(anterior) ? anterior : null);
  const [obs, setObs] = useState(itens.length === 1 ? itens[0].decisao_obs || '' : '');
  const [pedido, setPedido] = useState(itens.length === 1 ? itens[0].pedido_vinculado || '' : '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    const e = validarDecisao({ decisao, obs, pedido });
    if (e) { setErro(e); return; }
    setEnviando(true);
    try {
      const r = await decidirPendencias(itens.map((p) => p.id), decisao!, obs, pedido);
      onFeito(r?.decididas ?? itens.length, r?.ncs_abertas ?? []);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao registrar a decisão.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel="Devolutiva ao almoxarifado">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Devolutiva ao almoxarifado</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{itens.length} pendência(s) · a mesma decisão vale para todas</p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <ResumoItens itens={itens} />
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>Decisão</legend>
          {opcoes.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5"
              style={{
                borderColor: decisao === d ? 'var(--brand)' : 'var(--hairline)',
                background: decisao === d ? 'color-mix(in srgb, var(--brand) 6%, transparent)' : undefined,
              }}
            >
              <input type="radio" name="decisao" checked={decisao === d} onChange={() => { setDecisao(d); setErro(null); }} className="mt-1" />
              <span>
                <span className="block text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>{rotuloDecisao(d, motivoUnico)}</span>
                <span className="block text-xs" style={{ color: 'var(--ink-muted)' }}>{instrucaoAlmox(d)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {abreRnc(decisao) && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            A RNC é aberta automaticamente em Almoxarifado → Recebimento → Não conformidades
            (se a conferência já tiver NCR, a tratativa é registrada nela).
          </p>
        )}
        {decisao === 'vincular_po' && (
          <label className="block">
            <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>PO a vincular</span>
            <input value={pedido} onChange={(e) => setPedido(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} placeholder="4100…" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
            Orientação ao almoxarifado {decisao === 'outro' ? '(obrigatória)' : '(opcional)'}
          </span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Ex.: fornecedor confirmou o envio do saldo até 10/10; coleta da devolução na quinta."
          />
        </label>
        {erro && <p className="text-xs font-semibold" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
      </ModalBody>
      <ModalFooter>
        <BotaoSecundario onClick={onClose}>Voltar</BotaoSecundario>
        <BotaoPrimario onClick={() => void enviar()} disabled={enviando}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Enviar devolutiva
        </BotaoPrimario>
      </ModalFooter>
    </Modal>
  );
}

function ModalReatribuir({
  itens, onClose, onFeito,
}: { itens: PendenciaRecebimento[]; onClose: () => void; onFeito: (n: number) => void }) {
  const [opcoes, setOpcoes] = useState<OpcaoComprador[] | null>(null);
  const [escolhido, setEscolhido] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarCompradoresAtivos().then(setOpcoes).catch((e) => { setOpcoes([]); setErro(e?.message || 'Falha ao listar compradores.'); });
  }, []);

  const enviar = async () => {
    if (!escolhido) { setErro('Escolha o comprador.'); return; }
    setEnviando(true);
    try {
      const r = await reatribuirPendencias(itens.map((p) => p.id), escolhido);
      onFeito(r?.reatribuidas ?? itens.length);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao reatribuir.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Reatribuir pendência">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Reatribuir</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>O novo comprador é notificado.</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <ResumoItens itens={itens} />
        {opcoes === null ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</div>
        ) : (
          <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={inputCls}>
            <option value="">Escolha o comprador…</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}{o.grupo ? ` — grupo ${o.grupo}` : ''}</option>
            ))}
          </select>
        )}
        {erro && <p className="text-xs font-semibold" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
      </ModalBody>
      <ModalFooter>
        <BotaoSecundario onClick={onClose}>Voltar</BotaoSecundario>
        <BotaoPrimario onClick={() => void enviar()} disabled={enviando}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Reatribuir
        </BotaoPrimario>
      </ModalFooter>
    </Modal>
  );
}

function ModalCancelar({
  itens, onClose, onFeito,
}: { itens: PendenciaRecebimento[]; onClose: () => void; onFeito: (n: number) => void }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    if (!motivo.trim()) { setErro('Informe o motivo.'); return; }
    setEnviando(true);
    try {
      const r = await cancelarPendencias(itens.map((p) => p.id), motivo);
      onFeito(r?.canceladas ?? itens.length);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao cancelar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Cancelar pendência">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Cancelar pendência</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Para lançamento duplicado ou por engano. Para recusar o material, use “Responder”.</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <ResumoItens itens={itens} />
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputCls} placeholder="Motivo do cancelamento" />
        {erro && <p className="text-xs font-semibold" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
      </ModalBody>
      <ModalFooter>
        <BotaoSecundario onClick={onClose}>Voltar</BotaoSecundario>
        <BotaoPrimario onClick={() => void enviar()} disabled={enviando}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Cancelar pendência
        </BotaoPrimario>
      </ModalFooter>
    </Modal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos > Pendências > RNC.
 *
 * O que virou RNC (NCR do Recebimento do Almoxarifado) por decisão do comprador:
 * "Abrir RNC e verificar com o fornecedor", devolução e devolução com reposição.
 * Aqui o comprador acompanha a verificação com o fornecedor, registra o
 * andamento na própria NCR e a encerra. A fila de quem ainda precisa decidir
 * fica em Pendências > Recebimento.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp, Loader2, MessageSquarePlus, RefreshCw, Search, ShieldAlert, Square } from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import PendenciasSubnav from '../components/suprimentos/PendenciasSubnav';
import PendenciaRecebimentoCartao, { Chip } from '../components/suprimentos/PendenciaRecebimentoCartao';
import { formatDateTimeBR } from '../lib/format';
import {
  ROTULO_STATUS_NCR,
  filtrarRnc,
  rncEmAberto,
  type FiltroRnc,
  type PendenciaRnc,
} from '../lib/pendenciasRecebimento';
import { listarPendenciasRnc, registrarAndamentoRnc } from '../lib/pendenciasRecebimentoApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ABAS: { id: FiltroRnc; rotulo: string }[] = [
  { id: 'abertas', rotulo: 'Em verificação' },
  { id: 'resolvidas', rotulo: 'Resolvidas' },
  { id: 'todas', rotulo: 'Todas' },
];

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

export default function PendenciasRecebimentoRnc({ user, onNavigate }: Props) {
  const toast = useToast();
  const ehComprador = !!user.grupo_compras || user.roles.includes('comprador');

  const [lista, setLista] = useState<PendenciaRnc[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [status, setStatus] = useState<FiltroRnc>('abertas');
  const [somenteMinhas, setSomenteMinhas] = useState(ehComprador);
  const [busca, setBusca] = useState('');
  const [andamento, setAndamento] = useState<PendenciaRnc | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarPendenciasRnc());
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao carregar as RNC.');
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtradas = useMemo(
    () => filtrarRnc(lista, { status, somenteMinhas, usuarioId: user.id, busca }),
    [lista, status, somenteMinhas, user.id, busca],
  );
  const emVerificacao = useMemo(() => lista.filter(rncEmAberto).length, [lista]);

  return (
    <div className="space-y-5 text-left w-full pb-16">
      <PendenciasSubnav user={user} atual="sup_pendencias_recebimento_rnc" onNavigate={onNavigate} versao={lista} />

      <div className="reveal">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <ShieldAlert className="h-7 w-7" style={{ color: 'var(--ink-muted)' }} />
          RNC de Recebimento
        </h2>
        <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
          Pendências que viraram RNC no Almoxarifado — verificação com o fornecedor e devoluções.
          Registre o andamento e encerre a RNC quando o fornecedor resolver.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border p-1 w-fit max-w-full overflow-x-auto" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setStatus(a.id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap"
              style={status === a.id
                ? { background: 'var(--surface-card)', color: 'var(--brand)', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.06)' }
                : { color: 'var(--ink-muted)' }}
            >
              {a.rotulo}
              {a.id === 'abertas' && emVerificacao > 0 && (
                <span className="rounded-full px-1.5 text-[10px] font-extrabold text-white" style={{ background: 'var(--status-critical)' }}>{emVerificacao}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="RNC, PO, material, fornecedor…"
              className={`${inputCls} pl-9`}
            />
          </label>
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
      </div>

      {carregando && lista.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando RNC…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border py-14 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {lista.length === 0
            ? 'Nenhuma RNC ainda. Ao responder uma pendência com "Abrir RNC" ou devolução, ela aparece aqui.'
            : 'Nada com esses filtros.'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          {filtradas.map((p) => (
            <div key={p.id}>
              <PendenciaRecebimentoCartao
                p={p}
                acoes={(
                  <>
                    <Chip texto={`${p.nc_codigo ?? 'RNC'} · ${ROTULO_STATUS_NCR[p.ncr_status]}`} tom={p.ncr_status === 'resolvida' ? 'ok' : p.ncr_status === 'em_tratativa' ? 'atencao' : 'alerta'} />
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Comprador: {p.comprador_nome || 'não identificado'}</span>
                    {rncEmAberto(p) && (
                      <button
                        type="button"
                        onClick={() => setAndamento(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                        style={{ background: 'var(--brand)' }}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5" /> Registrar andamento
                      </button>
                    )}
                  </>
                )}
              />
              <TratativaRnc p={p} />
            </div>
          ))}
        </div>
      )}

      {andamento && (
        <ModalAndamento
          user={user}
          p={andamento}
          onClose={() => setAndamento(null)}
          onFeito={async (resolvida) => {
            setAndamento(null);
            toast.success(resolvida ? 'RNC encerrada.' : 'Andamento registrado na RNC.');
            await carregar();
          }}
        />
      )}
    </div>
  );
}

/** Andamento já registrado na NCR (ações de Suprimentos, Almoxarifado e do comprador), do mais recente ao mais antigo. */
function TratativaRnc({ p }: { p: PendenciaRnc }) {
  const [aberto, setAberto] = useState(false);
  const acoes = useMemo(
    () => [...p.ncr_acoes].filter((a) => a?.texto).sort((a, b) => b.em.localeCompare(a.em)),
    [p.ncr_acoes],
  );
  if (acoes.length === 0 && !p.ncr_resolucao) return null;
  return (
    <div className="px-4 pb-3 sm:px-5 -mt-1 space-y-1.5">
      {p.ncr_status === 'resolvida' && p.ncr_resolucao && (
        <p className="text-[11px]" style={{ color: 'var(--status-good)' }}><span className="font-bold">Resolução: </span>{p.ncr_resolucao}</p>
      )}
      {acoes.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold"
            style={{ color: 'var(--ink-muted)' }}
          >
            Tratativa na RNC ({acoes.length}) {aberto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {aberto && (
            <ol className="space-y-1.5 border-l pl-3" style={{ borderColor: 'var(--hairline)' }}>
              {acoes.map((a, i) => (
                <li key={i} className="text-[11px] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                  <span className="font-bold">{formatDateTimeBR(a.em)}</span>
                  {a.por_nome ? ` · ${a.por_nome}` : ''} — {a.texto}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

function ModalAndamento({
  user, p, onClose, onFeito,
}: { user: Profile; p: PendenciaRnc; onClose: () => void; onFeito: (resolvida: boolean) => void | Promise<void> }) {
  const [texto, setTexto] = useState('');
  const [resolver, setResolver] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    if (!p.nc_id) return;
    setEnviando(true);
    try {
      await registrarAndamentoRnc(p.nc_id, texto, resolver, { id: user.id, nome: user.name });
      await onFeito(resolver);
    } catch (err: any) {
      setErro(err?.message || 'Falha ao registrar o andamento.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Andamento da RNC">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Andamento da RNC {p.nc_codigo}</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{p.codigo} · PO {p.nro_pedido || '—'} · {p.fornecedor || 'sem fornecedor'}</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>
            {resolver ? 'Resolução' : 'O que foi tratado com o fornecedor'}
          </span>
          <textarea
            value={texto}
            onChange={(e) => { setTexto(e.target.value); setErro(null); }}
            rows={4}
            className={inputCls}
            placeholder="Ex.: fornecedor aceitou repor as 2 unidades; coleta agendada para quinta."
          />
        </label>
        <label className="flex items-start gap-2 text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={resolver} onChange={(e) => setResolver(e.target.checked)} className="mt-0.5" />
          <span>Encerrar a RNC (marcar como resolvida)</span>
        </label>
        {erro && <p className="text-xs font-semibold" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Voltar
        </button>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {resolver ? 'Encerrar RNC' : 'Registrar'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário "Logística - Expedição".
 *
 * Duas telas em um arquivo: a lista de carregamentos e a edição de um deles.
 * O que dita o desenho é o fato de o formulário ser preenchido em três visitas
 * ao longo do dia — portaria de manhã, pátio ao meio-dia, expedição à tarde —
 * quase sempre pelo celular, em pé, no pátio. Daí a lista existir (é preciso
 * reencontrar o carregamento aberto), os tramos serem recolhíveis, e o
 * registro nascer no banco antes de ter qualquer campo preenchido.
 *
 * Ao final, "Salvar e enviar" monta o e-mail no formato que a equipe já usa e
 * abre o Outlook — ver `expedicaoEmail.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronRight, Loader2, Mail, Plus, Save, Trash2, Truck, AlertCircle, Check,
} from 'lucide-react';
import type {
  EtapaExpedicao, ExpedicaoCarregamentoCompleto, ExpedicaoCarregamentoResumo,
  ExpedicaoFoto, ExpedicaoLogEnvio, ExpedicaoTramo, Profile,
} from '../types';
import * as api from '../lib/expedicaoApi';
import { podeEditarFormulario } from '../lib/permissoesFormularios';
import {
  ASSUNTO_CHEGADA_PADRAO, ASSUNTO_PADRAO, cabeNoMailto,
  montarAssuntoExpedicao, montarCorpoEmail, montarCorpoEmailChegada, montarMailto,
} from '../lib/expedicaoEmail';
import type { FotoComUrl } from '../lib/expedicaoEmail';
import { obterConfigEmail } from '../lib/emailConfigApi';
import { formatDateBR, formatDateTimeBR } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  MostrarExcluidosToggle,
  BadgeExcluido,
  RestaurarButton,
  classeLinhaExcluida,
} from '../components/ui/ExcluidosControls';
import TramoCard from '../components/expedicao/TramoCard';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function LogisticaExpedicao({ user, onNavigate }: Props) {
  const [carregamentoId, setCarregamentoId] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('?')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const idParam = params.get('id');
      if (idParam) {
        setCarregamentoId(idParam);
      }
    }
  }, []);

  return carregamentoId
    ? <Edicao user={user} id={carregamentoId} onVoltar={() => setCarregamentoId(null)} />
    : <Lista user={user} onAbrir={setCarregamentoId} onNavigate={onNavigate} />;
}

// =====================================================================
// Lista
// =====================================================================

function Lista({ user, onAbrir, onNavigate }: { user: Profile; onAbrir: (id: string) => void; onNavigate: (p: string) => void }) {
  const toast = useToast();
  const isAdmin = Boolean(user.roles?.includes('admin'));
  const [itens, setItens] = useState<ExpedicaoCarregamentoResumo[] | null>(null);
  const [sequencias, setSequencias] = useState<Record<string, number>>({});
  const [criando, setCriando] = useState(false);
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);
  const [itemParaExcluir, setItemParaExcluir] = useState<ExpedicaoCarregamentoResumo | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      const [lista, seq] = await Promise.all([
        api.listarCarregamentos(mostrarExcluidos),
        // A numeracao e acessoria: se falhar, a lista continua util sem ela.
        api.listarSequenciasTramo().catch(() => ({} as Record<string, number>)),
      ]);
      setItens(lista);
      setSequencias(seq);
    } catch (e) {
      toast.error(`Falha ao carregar a lista: ${(e as Error).message}`);
      setItens([]);
    }
  }, [mostrarExcluidos, toast]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const handleConfirmarExclusao = async () => {
    if (!itemParaExcluir) return;
    setExcluindo(true);
    try {
      await api.excluirCarregamento(itemParaExcluir.id, user.id);
      toast.success(`Carregamento ${itemParaExcluir.numero} excluído.`);
      setItemParaExcluir(null);
      void recarregar();
    } catch (e) {
      toast.error(`Erro ao excluir: ${(e as Error).message}`);
    } finally {
      setExcluindo(false);
    }
  };

  const handleRestaurar = async (c: ExpedicaoCarregamentoResumo) => {
    try {
      await api.restaurarCarregamento(c.id);
      toast.success(`Carregamento ${c.numero} restaurado.`);
      void recarregar();
    } catch (e) {
      toast.error(`Erro ao restaurar: ${(e as Error).message}`);
    }
  };

  const novo = async () => {
    setCriando(true);
    try {
      const c = await api.criarCarregamento({ usuarioId: user.id, usuarioNome: user.name });
      onAbrir(c.id);
    } catch (e) {
      toast.error(`Não foi possível criar o carregamento: ${(e as Error).message}`);
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para Módulos de Formulários</span>
          </button>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            Logística - Expedição
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Registro de carregamento de tramos: dados do veículo, os três horários e as fotos de cada etapa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MostrarExcluidosToggle
            visivel={isAdmin}
            checked={mostrarExcluidos}
            onChange={setMostrarExcluidos}
          />
          <button
            type="button"
            onClick={novo}
            disabled={criando}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto cursor-pointer"
          >
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Novo carregamento
          </button>
        </div>
      </div>

      {itens === null ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center dark:border-slate-700">
          <Truck className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum carregamento registrado</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Crie um ao chegar o primeiro caminhão — os horários podem ser preenchidos aos poucos.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {itens.map(c => {
            const etapasPreenchidas = c.tramos.reduce(
              (n, t) => n + [t.hora_chegada_portaria, t.hora_entrada_patio, t.hora_expedicao].filter(Boolean).length, 0,
            );
            const etapasTotais = c.tramos.length * 3;
            // O tramo é o que a equipe procura primeiro na lista, então vai no
            // título, antes da transportadora. Carregamentos antigos podem ter
            // mais de um; os novos, sempre exatamente um.
            const rotuloTramos = c.tramos.map(t => t.tramo).join(' + ');
            // Distingue os carregamentos que, sem ela, teriam título idêntico:
            // "1º T4 - TRANSPES" e "2º T4 - TRANSPES".
            const ordinal = sequencias[c.id];
            const prefixo = [ordinal ? `${ordinal}º` : '', rotuloTramos].filter(Boolean).join(' ');
            const podeEditar = podeEditarFormulario(user, c);

            return (
              <li key={c.id}>
                <div
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-400/50 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40 ${classeLinhaExcluida(c.excluido_em)}`}
                >
                  <div
                    onClick={() => onAbrir(c.id)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-400">{c.numero}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.status === 'enviado'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}>
                        {c.status === 'enviado' ? 'Enviado' : 'Aberto'}
                      </span>
                      {c.excluido_em && <BadgeExcluido em={c.excluido_em} />}
                    </div>

                    <p className="mt-1 flex items-baseline gap-1.5 text-base font-bold text-slate-900 dark:text-slate-50">
                      {prefixo && (
                        <span className="shrink-0 text-blue-600 dark:text-blue-400">{prefixo} -</span>
                      )}
                      <span className="truncate">{c.empresa?.trim() || 'Empresa não informada'}</span>
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {c.tramos.length === 0 && (
                        <span className="text-xs text-slate-400">Sem tramos</span>
                      )}
                      {etapasTotais > 0 && (
                        <span className="text-[11px] font-medium text-slate-400">
                          {etapasPreenchidas}/{etapasTotais} horários
                        </span>
                      )}
                      {c.total_fotos > 0 && (
                        <span className="text-[11px] font-medium text-slate-400">· {c.total_fotos} foto{c.total_fotos > 1 ? 's' : ''}</span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                      <span>Criado por {c.criado_por_nome} em {formatDateBR(c.created_at)}</span>
                      {c.enviado_em && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            Enviado por {c.enviado_por_nome || c.criado_por_nome} em {formatDateTimeBR(c.enviado_em)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {c.excluido_em ? (
                      podeEditar && <RestaurarButton onClick={() => handleRestaurar(c)} />
                    ) : (
                      podeEditar && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemParaExcluir(c);
                          }}
                          className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 cursor-pointer"
                          title="Excluir carregamento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => onAbrir(c.id)}
                      className="p-1 text-slate-300 transition-transform hover:text-blue-500 dark:text-slate-600 cursor-pointer"
                      title="Abrir carregamento"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {itemParaExcluir && (
        <ConfirmDialog
          titulo={`Excluir carregamento ${itemParaExcluir.numero}?`}
          mensagem="Este carregamento será desativado e ocultado das listagens operacionais. O registro permanecerá salvo no banco de dados com a marcação de quem e quando foi excluído, podendo ser auditado ou restaurado por um administrador."
          confirmarLabel="Sim, Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={handleConfirmarExclusao}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}
    </div>
  );
}

/**
 * Card exibido no topo do formulário detalhando o status e o histórico de envios
 * de e-mail da expedição, com nome do usuário que disparou e timestamps.
 */
function LogEnviosCard({
  carregamento,
}: {
  carregamento: ExpedicaoCarregamentoCompleto;
}) {
  const [expandido, setExpandido] = useState(false);
  const logs = carregamento.historico_envios || [];
  const temEnvio = carregamento.status === 'enviado' || Boolean(carregamento.enviado_em) || logs.length > 0;

  if (!temEnvio) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs text-slate-500 dark:border-slate-800/80 dark:bg-slate-900/40 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-slate-400 shrink-0" />
          <span>
            Status do e-mail: <strong className="font-semibold text-slate-700 dark:text-slate-300">Pendente de envio</strong>. O e-mail de expedição será registrado aqui assim que for disparado pelo atendente.
          </span>
        </div>
      </div>
    );
  }

  const enviadoPor = carregamento.enviado_por_nome || carregamento.criado_por_nome || 'Usuário';
  const dataEnvioFormatada = carregamento.enviado_em ? formatDateTimeBR(carregamento.enviado_em) : null;

  return (
    <div className="mt-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/40 p-4 transition-all dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 shrink-0 shadow-2xs">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Log de Envio do E-mail
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                {logs.length > 0 ? `${logs.length} registro(s)` : 'Enviado'}
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
              Enviado por <strong className="font-bold text-slate-900 dark:text-slate-100">{enviadoPor}</strong>
              {dataEnvioFormatada && <span> em <span className="font-semibold">{dataEnvioFormatada}</span></span>}
            </p>
          </div>
        </div>

        {logs.length > 1 && (
          <button
            type="button"
            onClick={() => setExpandido(prev => !prev)}
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
          >
            {expandido ? 'Recolher histórico' : `Ver histórico completo (${logs.length})`}
          </button>
        )}
      </div>

      {/* Lista detalhada dos envios */}
      {logs.length > 0 && (expandido || logs.length === 1) && (
        <div className="mt-3 space-y-2 border-t border-emerald-200/60 pt-2.5 dark:border-emerald-900/40">
          {logs.map((log, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 rounded-xl bg-white/80 p-2.5 text-xs text-slate-700 shadow-2xs dark:bg-slate-900/70 dark:text-slate-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-slate-400">#{idx + 1}</span>
                  {log.tipo === 'expedicao_completa' ? 'E-mail de Expedição (Final)' : 'Aviso de Chegada (Portaria)'}
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {formatDateTimeBR(log.enviado_em)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Disparado por: <strong className="text-slate-800 dark:text-slate-200">{log.usuario_nome}</strong>
              </p>
              {log.assunto && (
                <p className="text-[11px] truncate text-slate-500 dark:text-slate-400 font-mono">
                  Assunto: {log.assunto}
                </p>
              )}
              {log.destinatarios && (
                <p className="text-[11px] truncate text-slate-500 dark:text-slate-400">
                  Para: {log.destinatarios}
                </p>
              )}
              {log.detalhes && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  {log.detalhes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Edição
// =====================================================================

function Edicao({ user, id, onVoltar }: { user: Profile; id: string; onVoltar: () => void }) {
  const toast = useToast();

  const [dados, setDados] = useState<ExpedicaoCarregamentoCompleto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [statusAutoSave, setStatusAutoSave] = useState<'ocioso' | 'salvando' | 'salvo' | 'erro'>('ocioso');
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [confirmacao, setConfirmacao] = useState<
    | { tipo: 'voltar' }
    | { tipo: 'excluir-tramo'; tramoId: string; rotulo: string }
    | { tipo: 'excluir-carregamento' }
    | { tipo: 'enviar-sem-nf-tramo'; pendencias: string[] }
    | null
  >(null);
  const [excluindo, setExcluindo] = useState(false);
  /** Posição do carregamento na sequência do seu tramo — vai no assunto do e-mail. */
  const [sequencia, setSequencia] = useState<number | null>(null);

  const timerAutoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const dadosRef = useRef<ExpedicaoCarregamentoCompleto | null>(dados);

  useEffect(() => {
    dadosRef.current = dados;
  }, [dados]);

  useEffect(() => {
    let ativo = true;
    api.obterCarregamento(id)
      .then(async c => {
        if (!ativo) return;
        if (!c) { setErro('Carregamento não encontrado.'); return; }
        // Um carregamento é sempre um tramo só. O recém-criado nasce sem
        // nenhum, então o primeiro é aberto aqui — nunca há botão de adicionar.
        let carregamento = c;
        if (carregamento.tramos.length === 0) {
          const novo = await api.criarTramo({ carregamentoId: carregamento.id, tramo: 'T1', ordem: 0 });
          if (!ativo) return;
          carregamento = { ...carregamento, tramos: [novo] };
        }
        setDados(carregamento);
        dadosRef.current = carregamento;
        // Um tramo só abre sozinho; nos carregamentos antigos, com vários,
        // todos começam recolhidos para a tela caber na mão.
        setAbertos(carregamento.tramos.length === 1 ? { [carregamento.tramos[0].id]: true } : {});
      })
      .catch(e => { if (ativo) setErro((e as Error).message); });

    // Acessória ao formulário: só compõe o assunto do e-mail, então uma falha
    // aqui não pode impedir a tela de abrir.
    api.listarSequenciasTramo()
      .then(seq => { if (ativo) setSequencia(seq[id] ?? null); })
      .catch(() => { /* assunto sai sem a sequência */ });

    return () => { ativo = false; };
  }, [id]);

  // Rede de segurança para o fechar-aba/atualizar; a navegação interna é
  // interceptada pelo ConfirmDialog de "sair".
  useEffect(() => {
    if (!sujo) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sujo]);

  const executarPersistencia = useCallback(async (dadosParaSalvar: ExpedicaoCarregamentoCompleto): Promise<boolean> => {
    try {
      await api.salvarCarregamento(dadosParaSalvar.id, {
        empresa: dadosParaSalvar.empresa,
        observacoes: dadosParaSalvar.observacoes,
      });
      await Promise.all(dadosParaSalvar.tramos.map(t => api.salvarTramo(t.id, {
        tramo: t.tramo,
        numero_tramo: t.numero_tramo,
        numero_nf: t.numero_nf,
        motorista: t.motorista,
        cnh: t.cnh,
        cavalo_placa: t.cavalo_placa,
        cavalo_uf: t.cavalo_uf,
        carreta_placa: t.carreta_placa,
        carreta_uf: t.carreta_uf,
        dolly_placa: t.dolly_placa,
        dolly_uf: t.dolly_uf,
        data: t.data,
        data_chegada_portaria: t.data_chegada_portaria,
        data_entrada_patio: t.data_entrada_patio,
        data_expedicao: t.data_expedicao,
        hora_chegada_portaria: t.hora_chegada_portaria,
        hora_entrada_patio: t.hora_entrada_patio,
        hora_expedicao: t.hora_expedicao,
        obs_chegada_portaria: t.obs_chegada_portaria,
        obs_entrada_patio: t.obs_entrada_patio,
        obs_expedicao: t.obs_expedicao,
        ordem: t.ordem,
      })));
      return true;
    } catch (e) {
      console.error('Falha ao persistir carregamento:', e);
      return false;
    }
  }, []);

  const dispararAutoSave = useCallback((novosDados: ExpedicaoCarregamentoCompleto) => {
    setStatusAutoSave('salvando');
    setSujo(true);
    if (timerAutoSaveRef.current) {
      clearTimeout(timerAutoSaveRef.current);
    }
    timerAutoSaveRef.current = setTimeout(async () => {
      const ok = await executarPersistencia(novosDados);
      if (ok) {
        setStatusAutoSave('salvo');
        setSujo(false);
      } else {
        setStatusAutoSave('erro');
      }
    }, 800);
  }, [executarPersistencia]);

  useEffect(() => {
    return () => {
      if (timerAutoSaveRef.current) {
        clearTimeout(timerAutoSaveRef.current);
      }
    };
  }, []);

  const alterarCarregamento = (patch: Partial<ExpedicaoCarregamentoCompleto>) => {
    setDados(d => {
      if (!d) return d;
      const atualizado = { ...d, ...patch };
      dispararAutoSave(atualizado);
      return atualizado;
    });
  };

  const alterarTramo = (tramoId: string, patch: Partial<ExpedicaoTramo>) => {
    setDados(d => {
      if (!d) return d;
      const atualizado = {
        ...d,
        tramos: d.tramos.map(t => (t.id === tramoId ? { ...t, ...patch } : t)),
      };
      dispararAutoSave(atualizado);
      return atualizado;
    });
  };

  /** Persiste cabeçalho e tramos imediatamente. */
  const salvar = useCallback(async (silencioso = false): Promise<boolean> => {
    if (!dados) return false;
    if (timerAutoSaveRef.current) {
      clearTimeout(timerAutoSaveRef.current);
    }
    setSalvando(true);
    setStatusAutoSave('salvando');
    try {
      const ok = await executarPersistencia(dados);
      if (ok) {
        setSujo(false);
        setStatusAutoSave('salvo');
        if (!silencioso) toast.success('Carregamento salvo.');
        return true;
      } else {
        setStatusAutoSave('erro');
        toast.error('Falha ao salvar o carregamento.');
        return false;
      }
    } finally {
      setSalvando(false);
    }
  }, [dados, executarPersistencia, toast]);

  const anexarFoto = async (tramoId: string, etapa: EtapaExpedicao, arquivos: FileList) => {
    if (!dados) return;
    const lista = Array.from(arquivos);
    for (const file of lista) {
      try {
        const foto = await api.enviarFoto({
          file, carregamentoId: dados.id, tramoId, etapa, usuarioId: user.id,
        });
        setDados(d => (d ? { ...d, fotos: [...d.fotos, foto] } : d));
      } catch (e) {
        toast.error(`Falha ao enviar "${file.name}": ${(e as Error).message}`);
      }
    }
  };

  const excluirFoto = async (foto: ExpedicaoFoto) => {
    try {
      await api.excluirFoto(foto);
      setDados(d => (d ? { ...d, fotos: d.fotos.filter(f => f.id !== foto.id) } : d));
    } catch (e) {
      toast.error(`Falha ao excluir a foto: ${(e as Error).message}`);
    }
  };

  const confirmarExclusao = async () => {
    if (!confirmacao || !dados) return;
    setExcluindo(true);
    try {
      if (confirmacao.tipo === 'excluir-tramo') {
        await api.excluirTramo(confirmacao.tramoId, user.id);
        setDados(d => (d ? {
          ...d,
          tramos: d.tramos.filter(t => t.id !== confirmacao.tramoId),
          fotos: d.fotos.filter(f => f.tramo_id !== confirmacao.tramoId),
        } : d));
        setConfirmacao(null);
      } else if (confirmacao.tipo === 'excluir-carregamento') {
        await api.excluirCarregamento(dados.id, user.id);
        toast.success('Carregamento excluído.');
        onVoltar();
      }
    } catch (e) {
      toast.error(`Falha ao excluir: ${(e as Error).message}`);
    } finally {
      setExcluindo(false);
    }
  };


  /** Assina as URLs das fotos com validade longa — só valem se abrirem dias depois, no e-mail. */
  const assinarFotos = useCallback(async (fotos: ExpedicaoFoto[]): Promise<FotoComUrl[]> => (
    Promise.all(fotos.map(async f => ({ ...f, url: await api.urlFoto(f.storage_path, api.TTL_EMAIL_SEGUNDOS) })))
  ), []);

  /**
   * Abre o Outlook com a mensagem pronta. Acima do limite do handler do
   * Windows o corpo chegaria truncado sem aviso — nesse caso o texto íntegro
   * vai pela área de transferência e o e-mail abre só com o endereçamento.
   */
  const abrirOutlook = useCallback(async (
    assunto: string,
    corpo: string,
    opcoes?: { destinatario?: string; copia?: string; copiaOculta?: string }
  ) => {
    const mailto = montarMailto({
      assunto,
      corpo,
      destinatario: opcoes?.destinatario,
      copia: opcoes?.copia,
      copiaOculta: opcoes?.copiaOculta,
    });
    if (cabeNoMailto(mailto)) {
      window.location.href = mailto;
      return;
    }
    await navigator.clipboard.writeText(corpo).catch(() => null);
    window.location.href = montarMailto({
      assunto,
      corpo: '',
      destinatario: opcoes?.destinatario,
      copia: opcoes?.copia,
      copiaOculta: opcoes?.copiaOculta,
    });
    toast.warning('E-mail longo demais para preenchimento automático: o conteúdo foi copiado — cole no Outlook com Ctrl+V.');
  }, [toast]);

  /**
   * Aviso parcial de um tramo, disparado da própria etapa de portaria. Salva
   * antes para o e-mail não sair com dado mais velho que a tela, e não mexe no
   * status do carregamento: chegar na portaria não é concluir a expedição.
   */
  const enviarChegada = async (tramoId: string) => {
    if (!dados) return;
    if (!(await salvar(true))) return;

    const tramo = dados.tramos.find(t => t.id === tramoId);
    if (!tramo) return;

    try {
      const configChegada = await obterConfigEmail('expedicao_chegada');
      const corpo = montarCorpoEmailChegada({
        empresa: dados.empresa,
        tramo,
        fotos: await assinarFotos(dados.fotos.filter(f => f.tramo_id === tramoId)),
      });
      const assunto = montarAssuntoExpedicao({
        prefixo: configChegada?.assunto_padrao || ASSUNTO_CHEGADA_PADRAO,
        sequencia,
        tramo: tramo.tramo,
        carretaPlaca: tramo.carreta_placa,
        numeroTramo: tramo.numero_tramo,
        numeroNf: tramo.numero_nf,
      });

      await abrirOutlook(assunto, corpo, {
        destinatario: configChegada?.destinatarios,
        copia: configChegada?.copia || undefined,
        copiaOculta: configChegada?.copia_oculta || undefined,
      });

      // Registra evento no histórico de envios
      const agoraISO = new Date().toISOString();
      const novoLog: ExpedicaoLogEnvio = {
        tipo: 'aviso_chegada',
        usuario_id: user.id,
        usuario_nome: user.name,
        enviado_em: agoraISO,
        assunto,
        destinatarios: configChegada?.destinatarios,
        detalhes: `Aviso de chegada: ${tramo.tramo}${tramo.numero_tramo ? ` (Nº ${tramo.numero_tramo})` : ''}`,
      };
      const enviosAtualizados = await api.registrarEnvioEmail(
        dados.id,
        novoLog,
        false,
        dados.historico_envios
      );
      setDados(d => (d ? { ...d, historico_envios: enviosAtualizados } : d));
      toast.success('Aviso de chegada aberto no Outlook e registrado no log.');
    } catch (e) {
      toast.error(`Falha ao gerar o aviso de chegada: ${(e as Error).message}`);
    }
  };

  /**
   * Salva e abre o Outlook já preenchido. Os links das fotos são assinados
   * aqui, com validade longa, porque só nesta hora se sabe quais fotos entram.
   */
  const executarEnvioFinal = async () => {
    if (!dados) return;
    if (dados.tramos.length === 0) {
      toast.warning('Adicione ao menos um tramo antes de enviar.');
      return;
    }
    if (!(await salvar(true))) return;

    setSalvando(true);
    try {
      const configTramos = await obterConfigEmail('expedicao_tramos');
      const corpo = montarCorpoEmail({
        empresa: dados.empresa,
        observacoes: dados.observacoes,
        tramos: dados.tramos,
        fotos: await assinarFotos(dados.fotos),
      });

      // Nos carregamentos novos há um tramo só; nos antigos, os rótulos e as
      // placas entram juntos para o assunto seguir identificando o caminhão.
      const tramosComNum = dados.tramos.map(t => t.numero_tramo).filter(Boolean);
      const tramosComNf = dados.tramos.map(t => t.numero_nf).filter(Boolean);

      const assunto = montarAssuntoExpedicao({
        prefixo: configTramos?.assunto_padrao || ASSUNTO_PADRAO,
        sequencia,
        tramo: dados.tramos.map(t => t.tramo).join(' + '),
        carretaPlaca: [...new Set(
          dados.tramos.map(t => (t.carreta_placa || '').trim().toUpperCase()).filter(Boolean),
        )].join(' + '),
        numeroTramo: tramosComNum.length > 0 ? tramosComNum.join(' + ') : undefined,
        numeroNf: tramosComNf.length > 0 ? tramosComNf.join(' + ') : undefined,
      });

      await abrirOutlook(assunto, corpo, {
        destinatario: configTramos?.destinatarios,
        copia: configTramos?.copia || undefined,
        copiaOculta: configTramos?.copia_oculta || undefined,
      });

      const agoraISO = new Date().toISOString();
      const novoLog: ExpedicaoLogEnvio = {
        tipo: 'expedicao_completa',
        usuario_id: user.id,
        usuario_nome: user.name,
        enviado_em: agoraISO,
        assunto,
        destinatarios: configTramos?.destinatarios,
        detalhes: `E-mail de expedição final: ${dados.tramos.map(t => t.tramo).join(' + ')}`,
      };

      const enviosAtualizados = await api.registrarEnvioEmail(
        dados.id,
        novoLog,
        true,
        dados.historico_envios
      );

      setDados(d => (d ? {
        ...d,
        status: 'enviado',
        enviado_em: agoraISO,
        enviado_por: user.id,
        enviado_por_nome: user.name,
        historico_envios: enviosAtualizados,
      } : d));
      toast.success('E-mail de expedição aberto no Outlook e registrado no log.');
    } catch (e) {
      toast.error(`Falha ao gerar o e-mail: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const salvarEEnviar = async () => {
    if (!dados) return;
    if (dados.tramos.length === 0) {
      toast.warning('Adicione ao menos um tramo antes de enviar.');
      return;
    }

    const pendencias: string[] = [];
    for (const t of dados.tramos) {
      const faltantes: string[] = [];
      if (!t.numero_tramo || !t.numero_tramo.trim()) faltantes.push('Nº do Tramo');
      if (!t.numero_nf || !t.numero_nf.trim()) faltantes.push('Número da NF');
      if (faltantes.length > 0) {
        pendencias.push(`${t.tramo}: sem ${faltantes.join(' e ')}`);
      }
    }

    if (pendencias.length > 0) {
      setConfirmacao({ tipo: 'enviar-sem-nf-tramo', pendencias });
      return;
    }

    await executarEnvioFinal();
  };

  const voltar = () => {
    setConfirmacao({ tipo: 'voltar' });
  };

  const resumoTramos = useMemo(
    () => (dados ? dados.tramos.map(t => t.tramo).join(', ') : ''),
    [dados],
  );

  // Só o autor do carregamento (ou admin) edita; os demais consultam.
  // A RLS (`form_pode_editar`) recusa gravações de terceiros.
  const podeEditar = podeEditarFormulario(user, dados);
  const bloqueado = salvando || !podeEditar;

  const temTramos = Boolean(dados && dados.tramos.length > 0);
  const todosTramosComExpedicao = useMemo(() => {
    if (!dados || dados.tramos.length === 0) return false;
    return dados.tramos.every(t => Boolean(t.hora_expedicao && t.hora_expedicao.trim().length > 0));
  }, [dados]);
  const podeEnviar = temTramos && todosTramosComExpedicao;

  if (erro) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900 dark:bg-rose-950/30">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-2 text-sm font-semibold text-rose-800 dark:text-rose-300">{erro}</p>
        <button type="button" onClick={onVoltar} className="mt-4 text-sm font-semibold text-blue-600 hover:underline">
          Voltar para a lista
        </button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="flex justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl pb-24">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={voltar}
            className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-xs transition-colors hover:border-blue-400 hover:text-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para lista
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              {dados.empresa?.trim() || 'Novo carregamento'}
            </h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              dados.status === 'enviado'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
            }`}>
              {dados.status === 'enviado' ? 'Enviado' : 'Aberto'}
            </span>

            {statusAutoSave === 'salvando' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                <Loader2 className="h-3 w-3 animate-spin" />
                Salvando rascunho...
              </span>
            )}
            {statusAutoSave === 'salvo' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <Check className="h-3 w-3" />
                Rascunho salvo
              </span>
            )}
            {statusAutoSave === 'erro' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertCircle className="h-3 w-3" />
                Erro ao salvar
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
            {dados.numero}{resumoTramos && ` · ${resumoTramos}`}
          </p>
        </div>

        {podeEditar ? (
          <button
            type="button"
            onClick={() => setConfirmacao({ tipo: 'excluir-carregamento' })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Somente leitura — carregamento de outro usuário
          </span>
        )}
      </div>

      {/* Log de Envio do E-mail */}
      <LogEnviosCard carregamento={dados} />

      {/* Dados do carregamento */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label htmlFor="empresa" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Empresa transportadora
            </label>
            <input
              id="empresa"
              type="text"
              value={dados.empresa}
              disabled={bloqueado}
              placeholder="Ex.: TRANSMAQUINAS"
              autoCapitalize="characters"
              onChange={e => alterarCarregamento({ empresa: e.target.value.toUpperCase() })}
              className="mt-1.5 h-11 w-full uppercase rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
          <div>
            <label htmlFor="observacoes" className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Observações
            </label>
            <textarea
              id="observacoes"
              rows={2}
              value={dados.observacoes || ''}
              disabled={bloqueado}
              placeholder="Ex.: Motoristas com escolta – SERIDÓ"
              onChange={e => alterarCarregamento({ observacoes: e.target.value ? e.target.value.toUpperCase() : null })}
              className="mt-1.5 w-full uppercase resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
        </div>
      </section>

      {/* Tramos */}
      <div className="mt-5 space-y-3">
        {dados.tramos.map(t => (
          <TramoCard
            key={t.id}
            tramo={t}
            fotos={dados.fotos.filter(f => f.tramo_id === t.id)}
            aberto={Boolean(abertos[t.id])}
            somenteLeitura={bloqueado}
            onAlternar={() => setAbertos(a => ({ ...a, [t.id]: !a[t.id] }))}
            onChange={patch => alterarTramo(t.id, patch)}
            onExcluir={dados.tramos.length > 1
              ? () => setConfirmacao({ tipo: 'excluir-tramo', tramoId: t.id, rotulo: t.tramo })
              : undefined}
            onAnexarFoto={(etapa, arquivos) => anexarFoto(t.id, etapa, arquivos)}
            onExcluirFoto={excluirFoto}
            onEnviarChegada={() => enviarChegada(t.id)}
          />
        ))}
      </div>

      {/* Barra de ações inferior fixa com botão Voltar e Salvar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur-xs sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={voltar}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            {podeEditar && (
              <button
                type="button"
                onClick={() => setConfirmacao({ tipo: 'excluir-carregamento' })}
                disabled={salvando || excluindo}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-40 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400"
                title="Excluir todo este carregamento"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Excluir</span>
              </button>
            )}
          </div>

          {podeEditar && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => salvar()}
              disabled={salvando}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {statusAutoSave === 'salvo' && !sujo ? 'Salvo' : 'Salvar rascunho'}
            </button>

            <div className="flex flex-col items-stretch sm:items-end">
              <button
                type="button"
                onClick={salvarEEnviar}
                disabled={salvando || !podeEnviar}
                title={
                  !temTramos
                    ? 'Adicione ao menos um tramo'
                    : !todosTramosComExpedicao
                    ? 'Preencha o horário de expedição de todos os tramos para habilitar o envio'
                    : 'Salvar e abrir Outlook'
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-60 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                <Mail className="h-4 w-4" />
                Salvar e enviar e-mail
              </button>
              {!todosTramosComExpedicao && temTramos && (
                <span className="mt-1 text-center text-[11px] font-medium text-amber-600 dark:text-amber-400 sm:text-right">
                  Informe o horário de expedição para liberar o envio
                </span>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      {confirmacao?.tipo === 'voltar' && (
        <Modal onClose={() => setConfirmacao(null)} maxWidth="max-w-md" ariaLabel="Deseja salvar antes de voltar?">
          <ModalBody className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Save className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
                  Deseja salvar antes de voltar?
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Você está saindo deste carregamento. Deseja salvar as alterações realizadas antes de retornar para a lista?
                </p>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Cancelar
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onVoltar}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Sair sem salvar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await salvar(true);
                    onVoltar();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar e voltar
                </button>
              </div>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {confirmacao?.tipo === 'excluir-tramo' && (
        <ConfirmDialog
          titulo={`Remover o tramo ${confirmacao.rotulo}?`}
          mensagem="Os horários e as fotos deste tramo serão excluídos. A ação não pode ser desfeita."
          confirmarLabel="Remover"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setConfirmacao(null)}
        />
      )}

      {confirmacao?.tipo === 'excluir-carregamento' && (
        <ConfirmDialog
          titulo="Excluir o carregamento?"
          mensagem="Este carregamento será desativado e ocultado das listagens operacionais. O registro permanecerá salvo no banco de dados com a marcação de quem e quando foi excluído."
          confirmarLabel="Sim, Excluir"
          cancelarLabel="Cancelar"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setConfirmacao(null)}
        />
      )}

      {confirmacao?.tipo === 'enviar-sem-nf-tramo' && (
        <ConfirmDialog
          titulo="Enviar e-mail sem Nº do Tramo ou NF?"
          mensagem={
            <div className="space-y-2.5">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Os seguintes dados de faturamento/identificação não foram preenchidos:
              </p>
              <ul className="list-inside list-disc rounded-xl bg-amber-50/90 p-2.5 text-xs font-semibold text-amber-900 border border-amber-200/60 dark:bg-amber-950/40 dark:border-amber-900/40 dark:text-amber-200 space-y-1">
                {confirmacao.pendencias.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deseja abrir o Outlook e realizar o envio mesmo sem essas informações?
              </p>
            </div>
          }
          confirmarLabel="Sim, enviar assim mesmo"
          cancelarLabel="Voltar e preencher"
          variante="padrao"
          confirmando={salvando}
          onConfirmar={async () => {
            setConfirmacao(null);
            await executarEnvioFinal();
          }}
          onCancelar={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}

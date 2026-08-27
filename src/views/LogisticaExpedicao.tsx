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
  ExpedicaoFoto, ExpedicaoTramo, Profile, Tramo,
} from '../types';
import { TRAMOS } from '../types';
import * as api from '../lib/expedicaoApi';
import {
  assuntoChegada, cabeNoMailto,
  montarCorpoEmail, montarCorpoEmailChegada, montarMailto,
} from '../lib/expedicaoEmail';
import type { FotoComUrl } from '../lib/expedicaoEmail';
import { formatDateBR } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TramoCard from '../components/expedicao/TramoCard';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function LogisticaExpedicao({ user, onNavigate }: Props) {
  const [carregamentoId, setCarregamentoId] = useState<string | null>(null);

  return carregamentoId
    ? <Edicao user={user} id={carregamentoId} onVoltar={() => setCarregamentoId(null)} />
    : <Lista user={user} onAbrir={setCarregamentoId} onNavigate={onNavigate} />;
}

// =====================================================================
// Lista
// =====================================================================

function Lista({ user, onAbrir, onNavigate }: { user: Profile; onAbrir: (id: string) => void; onNavigate: (p: string) => void }) {
  const toast = useToast();
  const [itens, setItens] = useState<ExpedicaoCarregamentoResumo[] | null>(null);
  const [criando, setCriando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setItens(await api.listarCarregamentos());
    } catch (e) {
      toast.error(`Falha ao carregar a lista: ${(e as Error).message}`);
      setItens([]);
    }
  }, [toast]);

  useEffect(() => { void recarregar(); }, [recarregar]);

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
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Formulários
          </button>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            Logística - Expedição
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Registro de carregamento de tramos: dados do veículo, os três horários e as fotos de cada etapa.
          </p>
        </div>

        <button
          type="button"
          onClick={novo}
          disabled={criando}
          className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60 sm:w-auto"
        >
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Novo carregamento
        </button>
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
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onAbrir(c.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-lg hover:shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-400">{c.numero}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        c.status === 'enviado'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                      }`}>
                        {c.status === 'enviado' ? 'Enviado' : 'Aberto'}
                      </span>
                    </div>

                    <p className="mt-1 truncate text-base font-bold text-slate-900 dark:text-slate-50">
                      {c.empresa?.trim() || 'Empresa não informada'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {c.tramos.length === 0 ? (
                        <span className="text-xs text-slate-400">Sem tramos</span>
                      ) : (
                        c.tramos.map(t => (
                          <span key={t.id} className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-bold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                            {t.tramo}
                          </span>
                        ))
                      )}
                      {etapasTotais > 0 && (
                        <span className="ml-1 text-[11px] font-medium text-slate-400">
                          {etapasPreenchidas}/{etapasTotais} horários
                        </span>
                      )}
                      {c.total_fotos > 0 && (
                        <span className="text-[11px] font-medium text-slate-400">· {c.total_fotos} foto{c.total_fotos > 1 ? 's' : ''}</span>
                      )}
                    </div>

                    <p className="mt-2 text-[11px] text-slate-400">
                      Criado por {c.criado_por_nome} em {formatDateBR(c.created_at)}
                    </p>
                  </div>

                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </button>
              </li>
            );
          })}
        </ul>
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
    | null
  >(null);
  const [excluindo, setExcluindo] = useState(false);

  const timerAutoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const dadosRef = useRef<ExpedicaoCarregamentoCompleto | null>(dados);

  useEffect(() => {
    dadosRef.current = dados;
  }, [dados]);

  useEffect(() => {
    let ativo = true;
    api.obterCarregamento(id)
      .then(c => {
        if (!ativo) return;
        if (!c) { setErro('Carregamento não encontrado.'); return; }
        setDados(c);
        dadosRef.current = c;
        // Um tramo só abre sozinho; com vários, todos começam recolhidos para
        // a tela caber na mão.
        setAbertos(c.tramos.length === 1 ? { [c.tramos[0].id]: true } : {});
      })
      .catch(e => { if (ativo) setErro((e as Error).message); });
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
        motorista: t.motorista,
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

  const adicionarTramo = async () => {
    if (!dados) return;
    // Sugere o próximo tramo ainda não usado — no caso comum (T1, depois T2)
    // isso já deixa o campo certo, sem toque extra.
    const usados = new Set(dados.tramos.map(t => t.tramo));
    const sugerido = (TRAMOS.find(t => !usados.has(t)) ?? 'T1') as Tramo;
    try {
      const novo = await api.criarTramo({ carregamentoId: dados.id, tramo: sugerido, ordem: dados.tramos.length });
      setDados(d => (d ? { ...d, tramos: [...d.tramos, novo] } : d));
      setAbertos(a => ({ ...a, [novo.id]: true }));
    } catch (e) {
      toast.error(`Não foi possível adicionar o tramo: ${(e as Error).message}`);
    }
  };

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
        await api.excluirTramo(confirmacao.tramoId);
        setDados(d => (d ? {
          ...d,
          tramos: d.tramos.filter(t => t.id !== confirmacao.tramoId),
          fotos: d.fotos.filter(f => f.tramo_id !== confirmacao.tramoId),
        } : d));
        setConfirmacao(null);
      } else if (confirmacao.tipo === 'excluir-carregamento') {
        await api.excluirCarregamento(dados.id);
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
      const assunto = configChegada?.assunto_padrao
        ? `${configChegada.assunto_padrao} - ${tramo.tramo}${dados.empresa ? ` ${dados.empresa.trim()}` : ''}`
        : assuntoChegada(dados.empresa, tramo.tramo);

      await abrirOutlook(assunto, corpo, {
        destinatario: configChegada?.destinatarios,
        copia: configChegada?.copia || undefined,
        copiaOculta: configChegada?.copia_oculta || undefined,
      });
    } catch (e) {
      toast.error(`Falha ao gerar o aviso de chegada: ${(e as Error).message}`);
    }
  };

  /**
   * Salva e abre o Outlook já preenchido. Os links das fotos são assinados
   * aqui, com validade longa, porque só nesta hora se sabe quais fotos entram.
   */
  const salvarEEnviar = async () => {
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

      const assunto = configTramos?.assunto_padrao || ASSUNTO_PADRAO;

      await abrirOutlook(assunto, corpo, {
        destinatario: configTramos?.destinatarios,
        copia: configTramos?.copia || undefined,
        copiaOculta: configTramos?.copia_oculta || undefined,
      });

      await api.salvarCarregamento(dados.id, { status: 'enviado', enviado_em: new Date().toISOString() });
      setDados(d => (d ? { ...d, status: 'enviado' } : d));
    } catch (e) {
      toast.error(`Falha ao gerar o e-mail: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  const voltar = () => {
    setConfirmacao({ tipo: 'voltar' });
  };

  const resumoTramos = useMemo(
    () => (dados ? dados.tramos.map(t => t.tramo).join(', ') : ''),
    [dados],
  );

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

        <button
          type="button"
          onClick={() => setConfirmacao({ tipo: 'excluir-carregamento' })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </button>
      </div>

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
              disabled={salvando}
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
              disabled={salvando}
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
            somenteLeitura={salvando}
            onAlternar={() => setAbertos(a => ({ ...a, [t.id]: !a[t.id] }))}
            onChange={patch => alterarTramo(t.id, patch)}
            onExcluir={() => setConfirmacao({ tipo: 'excluir-tramo', tramoId: t.id, rotulo: t.tramo })}
            onAnexarFoto={(etapa, arquivos) => anexarFoto(t.id, etapa, arquivos)}
            onExcluirFoto={excluirFoto}
            onEnviarChegada={() => enviarChegada(t.id)}
          />
        ))}

        <button
          type="button"
          onClick={adicionarTramo}
          disabled={salvando}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-4 text-sm font-semibold text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500"
        >
          <Plus className="h-4 w-4" />
          Adicionar tramo
        </button>
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
          </div>

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
          mensagem="Todos os tramos, horários e fotos deste carregamento serão excluídos. A ação não pode ser desfeita."
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setConfirmacao(null)}
        />
      )}
    </div>
  );
}

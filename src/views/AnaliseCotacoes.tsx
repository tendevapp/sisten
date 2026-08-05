/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise de Cotações — fecha o ciclo aberto pela Central de Compras
 * (SuppliersNoPO): o comprador cola as propostas de fornecedores recebidas
 * por e-mail (convertidas de PDF para markdown), a IA extrai e sugere o
 * vínculo com os itens da RM, o comprador confirma e o mapa de cotação sai
 * pronto para decisão e export.
 *
 * Fluxo em 4 passos, guiado pelo `status` do lote:
 *   1. Lote      — itens canônicos (das RMs selecionadas ou avulsos)
 *   2. Colar      — markdown das propostas, extraído em paralelo por fornecedor
 *   3. Vincular   — confirma/troca o vínculo sugerido, imposto e DDP
 *   4. Mapa       — matriz item × fornecedor, decisão, export
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Scale, Plus, Trash2, ClipboardPaste, Loader2, CheckCircle2, AlertTriangle,
  ArrowRight, ArrowLeft, FileDown, FileSpreadsheet, Info, X, Check,
} from 'lucide-react';

import { localDb } from '../db/localDb';
import { Profile, CotacaoLote, CotacaoItem, CotacaoProposta, CotacaoPropostaItem } from '../types';
import { formatBRL, formatQtd, formatDateBR, EMPTY } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td } from '../components/ui/DataTable';

import * as api from '../lib/cotacao/api';
import type { CodigoDDP, CodigoImposto } from '../lib/cotacao/matching';
import { compararItem, compararTotais, type ItemComparado } from '../lib/cotacao/calculo';
import { exportarExcel, exportarPdf, type MapaExportData } from '../lib/cotacao/export';

interface AnaliseCotacoesProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Passo = 'carregando' | 'lote' | 'colar' | 'vincular' | 'mapa';

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
const corFornecedor = (indice: number) => SERIES[indice % SERIES.length];

function parseQuery(): URLSearchParams {
  const q = (window.location.hash || '').split('?')[1];
  return new URLSearchParams(q || '');
}

export default function AnaliseCotacoes({ onNavigate }: AnaliseCotacoesProps) {
  const toast = useToast();
  const [passo, setPasso] = useState<Passo>('carregando');
  const [lote, setLote] = useState<CotacaoLote | null>(null);
  const [itensCanonicos, setItensCanonicos] = useState<CotacaoItem[]>([]);
  const [propostas, setPropostas] = useState<CotacaoProposta[]>([]);
  const [itensPorProposta, setItensPorProposta] = useState<Record<string, CotacaoPropostaItem[]>>({});
  const [catalogoDdp, setCatalogoDdp] = useState<CodigoDDP[]>([]);
  const [catalogoImpostos, setCatalogoImpostos] = useState<CodigoImposto[]>([]);
  const [risIniciais, setRisIniciais] = useState<string[]>([]);

  const recarregarPropostas = useCallback(async (loteId: string) => {
    const props = await api.listarPropostas(loteId);
    setPropostas(props);
    const mapa: Record<string, CotacaoPropostaItem[]> = {};
    await Promise.all(props.map(async p => { mapa[p.id] = await api.listarItensProposta(p.id); }));
    setItensPorProposta(mapa);
    return props;
  }, []);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const query = parseQuery();
      const loteId = query.get('lote');
      const risParam = query.get('ris');

      const [ddp, impostos] = await Promise.all([api.buscarCatalogoDDP(), api.buscarCatalogoImpostos()]);
      if (cancelado) return;
      setCatalogoDdp(ddp);
      setCatalogoImpostos(impostos);

      if (loteId) {
        const loteCarregado = await api.buscarLote(loteId);
        if (cancelado) return;
        if (!loteCarregado) {
          toast.error('Cotação não encontrada.');
          setPasso('lote');
          return;
        }
        const itens = await api.listarItensLote(loteId);
        const props = await recarregarPropostas(loteId);
        if (cancelado) return;
        setLote(loteCarregado);
        setItensCanonicos(itens);
        if (loteCarregado.status === 'decidido') setPasso('mapa');
        else if (props.length === 0) setPasso('colar');
        else setPasso('vincular');
        return;
      }

      if (risParam) setRisIniciais(risParam.split(',').filter(Boolean));
      setPasso('lote');
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const irParaLote = useCallback((loteCriado: CotacaoLote) => {
    setLote(loteCriado);
    onNavigate(`/suprimentos/analise-cotacoes?lote=${loteCriado.id}`);
    setPasso('colar');
  }, [onNavigate]);

  const aposExtracao = useCallback(async () => {
    if (!lote) return;
    await recarregarPropostas(lote.id);
    setPasso('vincular');
  }, [lote, recarregarPropostas]);

  const irParaMapa = useCallback(async () => {
    if (!lote) return;
    if (lote.status !== 'em_analise' && lote.status !== 'decidido') {
      await api.atualizarStatusLote(lote.id, 'em_analise');
      setLote({ ...lote, status: 'em_analise' });
    }
    setPasso('mapa');
  }, [lote]);

  if (passo === 'carregando') {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--brand)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 select-text max-w-[1600px] mx-auto pb-12">
      <div className="flex items-center justify-between gap-3 border-b pb-5 reveal" style={{ borderColor: 'var(--hairline)' }}>
        <div>
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <Scale className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Análise de Cotações
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-secondary)' }}>
            {lote ? `${lote.numero ?? ''} · ${lote.titulo}` : 'Cole as propostas dos fornecedores e compare com os itens da RM.'}
          </p>
        </div>
        {lote && <Passos atual={passo} loteStatus={lote.status} />}
      </div>

      {passo === 'lote' && (
        <PassoLote risIniciais={risIniciais} onCriado={irParaLote} toast={toast} />
      )}

      {passo === 'colar' && lote && (
        <PassoColar
          lote={lote}
          itensCanonicos={itensCanonicos}
          onConcluido={aposExtracao}
          toast={toast}
        />
      )}

      {passo === 'vincular' && lote && (
        <PassoVincular
          lote={lote}
          itensCanonicos={itensCanonicos}
          propostas={propostas}
          itensPorProposta={itensPorProposta}
          catalogoDdp={catalogoDdp}
          catalogoImpostos={catalogoImpostos}
          onColarMais={() => setPasso('colar')}
          onAtualizarItensProposta={(propostaId, itens) => setItensPorProposta(prev => ({ ...prev, [propostaId]: itens }))}
          onAtualizarProposta={(propostaAtualizada) => setPropostas(prev => prev.map(p => (p.id === propostaAtualizada.id ? propostaAtualizada : p)))}
          onIrParaMapa={irParaMapa}
          toast={toast}
        />
      )}

      {passo === 'mapa' && lote && (
        <PassoMapa
          lote={lote}
          itensCanonicos={itensCanonicos}
          propostas={propostas}
          itensPorProposta={itensPorProposta}
          onVoltarVincular={() => setPasso('vincular')}
          onFechado={(loteAtualizado) => setLote(loteAtualizado)}
          toast={toast}
        />
      )}
    </div>
  );
}

/* ========================================================================== */
/* Indicador de passos                                                        */
/* ========================================================================== */

function Passos({ atual, loteStatus }: { atual: Passo; loteStatus: CotacaoLote['status'] }) {
  const passos: { id: Passo; label: string }[] = [
    { id: 'lote', label: 'Lote' },
    { id: 'colar', label: 'Colar' },
    { id: 'vincular', label: 'Vincular' },
    { id: 'mapa', label: 'Mapa' },
  ];
  const indiceAtual = passos.findIndex(p => p.id === atual);
  return (
    <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold shrink-0">
      {passos.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && <div className="w-4 h-px" style={{ background: 'var(--hairline)' }} />}
          <span
            className="px-2.5 py-1 rounded-full"
            style={{
              color: i <= indiceAtual ? 'var(--brand)' : 'var(--ink-muted)',
              background: i === indiceAtual ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'transparent',
            }}
          >
            {p.label}
          </span>
        </React.Fragment>
      ))}
      {loteStatus === 'decidido' && (
        <span className="ml-1 px-2 py-0.5 rounded-full text-[10px]" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
          Fechada
        </span>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Passo 1 — Lote                                                             */
/* ========================================================================== */

interface ItemFormulario {
  ri?: string | null;
  rm?: string | null;
  item_reqc?: string | null;
  material_code?: string | null;
  descricao_canonica: string;
  texto_tecnico?: string | null;
  unidade?: string | null;
  quantidade: number | null;
}

function PassoLote({ risIniciais, onCriado, toast }: { risIniciais: string[]; onCriado: (l: CotacaoLote) => void; toast: ReturnType<typeof useToast> }) {
  const [titulo, setTitulo] = useState('');
  const [itens, setItens] = useState<ItemFormulario[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (risIniciais.length === 0) return;
    const registros = localDb.getEnrichedSAPRequisicoes().filter(r => risIniciais.includes(r.ri));
    setItens(registros.map(r => ({
      ri: r.ri,
      rm: r.requisicao_de_compra,
      item_reqc: r.item_reqc,
      material_code: r.material_code,
      descricao_canonica: r.texto_breve,
      unidade: r.unidade_medida,
      quantidade: r.qtd_requisicao,
    })));
    if (registros.length > 0) {
      const rms = Array.from(new Set(registros.map(r => r.requisicao_de_compra)));
      setTitulo(`Cotação RM ${rms.join(', ')}`);
    }
  }, [risIniciais]);

  const adicionarItemAvulso = () => {
    setItens(prev => [...prev, { descricao_canonica: '', unidade: 'UN', quantidade: 1 }]);
  };

  const removerItem = (indice: number) => setItens(prev => prev.filter((_, i) => i !== indice));

  const atualizarItem = (indice: number, campo: keyof ItemFormulario, valor: string | number) => {
    setItens(prev => prev.map((it, i) => (i === indice ? { ...it, [campo]: valor } : it)));
  };

  const criar = async () => {
    if (!titulo.trim()) { toast.warning('Dê um título para a cotação.'); return; }
    if (itens.length === 0) { toast.warning('Adicione ao menos um item.'); return; }
    if (itens.some(i => !i.descricao_canonica.trim())) { toast.warning('Todo item precisa de uma descrição.'); return; }
    setSalvando(true);
    try {
      const criado = await api.criarLote(titulo.trim(), itens);
      toast.success(`Cotação ${criado.numero} criada.`);
      onCriado(criado);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao criar a cotação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border p-5 sm:p-6" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
      <div>
        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Título da cotação</label>
        <input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="Ex.: Cotação RM 4500123 — ferramentas manuais"
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border focus:outline-none"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
          Itens ({itens.length})
        </span>
        <button
          onClick={adicionarItemAvulso}
          className="text-xs font-bold flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-raised)] transition-colors"
          style={{ color: 'var(--brand)' }}
        >
          <Plus className="h-3.5 w-3.5" /> Item avulso
        </button>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          Nenhum item ainda. Volte à Central de Compras e use "Criar Cotação" com itens selecionados, ou adicione um item avulso.
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
              <input
                value={item.descricao_canonica}
                onChange={e => atualizarItem(i, 'descricao_canonica', e.target.value)}
                placeholder="Descrição do item"
                className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
              />
              {item.rm && (
                <span className="text-[10px] font-mono px-2 py-1 rounded-md" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
                  RM {item.rm}/{item.item_reqc}
                </span>
              )}
              <input
                type="number"
                value={item.quantidade ?? ''}
                onChange={e => atualizarItem(i, 'quantidade', Number(e.target.value))}
                className="w-20 px-2 py-1.5 text-xs rounded-lg border tabular focus:outline-none"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
              />
              <input
                value={item.unidade ?? ''}
                onChange={e => atualizarItem(i, 'unidade', e.target.value)}
                className="w-16 px-2 py-1.5 text-xs rounded-lg border focus:outline-none"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
              />
              <button onClick={() => removerItem(i)} className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)]" style={{ color: 'var(--ink-muted)' }}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={criar}
          disabled={salvando}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Criar cotação e colar propostas
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Passo 2 — Colar propostas                                                  */
/* ========================================================================== */

function PassoColar({ lote, itensCanonicos, onConcluido, toast }: {
  lote: CotacaoLote;
  itensCanonicos: CotacaoItem[];
  onConcluido: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [markdown, setMarkdown] = useState('');
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<api.ProgressoExtracao[]>([]);

  const processar = async () => {
    if (!markdown.trim()) { toast.warning('Cole o conteúdo das propostas antes de extrair.'); return; }
    setProcessando(true);
    setProgresso([]);
    try {
      await api.processarDocumentoColado(lote.id, markdown, p => {
        setProgresso(prev => {
          const semEste = prev.filter(x => x.propostaId !== p.propostaId && x.fornecedorDetectado !== p.fornecedorDetectado);
          return [...semEste, p];
        });
      });
      toast.success('Propostas extraídas. Revise o vínculo com os itens da RM.');
      onConcluido();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao extrair as propostas.');
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-5 sm:p-6 space-y-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          Cole o conteúdo em markdown das propostas (uma ou várias juntas — a extração separa por fornecedor automaticamente). {itensCanonicos.length} item(ns) do lote serão usados para sugerir o vínculo.
        </div>
        <textarea
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          disabled={processando}
          placeholder="Cole aqui o conteúdo das propostas dos fornecedores..."
          className="w-full h-72 px-3 py-2.5 text-xs font-mono rounded-lg border focus:outline-none resize-y"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
        />
        <div className="flex justify-end">
          <button
            onClick={processar}
            disabled={processando}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPaste className="h-4 w-4" />}
            {processando ? 'Extraindo…' : 'Extrair propostas'}
          </button>
        </div>
      </div>

      {progresso.length > 0 && (
        <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          {progresso.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
              <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{p.fornecedorDetectado}</span>
              <span className="flex items-center gap-1.5" style={{ color: p.status === 'erro' ? '#dc2626' : p.status === 'concluido' ? 'var(--brand)' : 'var(--ink-muted)' }}>
                {p.status === 'extraindo' && <><Loader2 className="h-3 w-3 animate-spin" /> extraindo…</>}
                {p.status === 'reprocessando' && <><Loader2 className="h-3 w-3 animate-spin" /> soma não fechou, revisando…</>}
                {p.status === 'concluido' && <><CheckCircle2 className="h-3 w-3" /> extraído</>}
                {p.status === 'erro' && <><AlertTriangle className="h-3 w-3" /> {p.erro ?? 'falhou — preencha manualmente'}</>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Passo 3 — Revisão de vínculo                                               */
/* ========================================================================== */

function PassoVincular({
  lote, itensCanonicos, propostas, itensPorProposta, catalogoDdp, catalogoImpostos,
  onColarMais, onAtualizarItensProposta, onAtualizarProposta, onIrParaMapa, toast,
}: {
  lote: CotacaoLote;
  itensCanonicos: CotacaoItem[];
  propostas: CotacaoProposta[];
  itensPorProposta: Record<string, CotacaoPropostaItem[]>;
  catalogoDdp: CodigoDDP[];
  catalogoImpostos: CodigoImposto[];
  onColarMais: () => void;
  onAtualizarItensProposta: (propostaId: string, itens: CotacaoPropostaItem[]) => void;
  onAtualizarProposta: (p: CotacaoProposta) => void;
  onIrParaMapa: () => Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const [propostaAtivaId, setPropostaAtivaId] = useState(propostas[0]?.id ?? '');
  useEffect(() => {
    if (!propostaAtivaId && propostas[0]) setPropostaAtivaId(propostas[0].id);
  }, [propostas, propostaAtivaId]);

  const propostaAtiva = propostas.find(p => p.id === propostaAtivaId);
  const itensAtivos = useMemo(() => {
    const lista = itensPorProposta[propostaAtivaId] ?? [];
    return [...lista].sort((a, b) => {
      if (a.divergente !== b.divergente) return a.divergente ? -1 : 1;
      return (a.match_confianca ?? 1) - (b.match_confianca ?? 1);
    });
  }, [itensPorProposta, propostaAtivaId]);

  const coberturaPorItem = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const lista of Object.values(itensPorProposta)) {
      for (const it of lista) {
        if (it.cotacao_item_id) contagem.set(it.cotacao_item_id, (contagem.get(it.cotacao_item_id) ?? 0) + 1);
      }
    }
    return contagem;
  }, [itensPorProposta]);

  const trocarVinculo = async (propostaItem: CotacaoPropostaItem, cotacaoItemId: string | null) => {
    try {
      await api.atualizarVinculoManual(propostaItem.id, cotacaoItemId);
      onAtualizarItensProposta(propostaAtivaId, (itensPorProposta[propostaAtivaId] ?? []).map(it =>
        it.id === propostaItem.id ? { ...it, cotacao_item_id: cotacaoItemId, vinculo_origem: 'usuario' } : it,
      ));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar vínculo.');
    }
  };

  const trocarImposto = async (propostaItem: CotacaoPropostaItem, codigo: string) => {
    try {
      await api.atualizarImpostoItem(propostaItem.id, codigo || null);
      onAtualizarItensProposta(propostaAtivaId, (itensPorProposta[propostaAtivaId] ?? []).map(it =>
        it.id === propostaItem.id ? { ...it, imposto_codigo: codigo || null, imposto_confirmado: true } : it,
      ));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar imposto.');
    }
  };

  const trocarDdp = async (codigo: string) => {
    if (!propostaAtiva) return;
    try {
      await api.atualizarDdpProposta(propostaAtiva.id, codigo || null);
      onAtualizarProposta({ ...propostaAtiva, ddp_codigo: codigo || null, ddp_confirmado: true, ddp_pendente: !codigo });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao atualizar condição de pagamento.');
    }
  };

  const origemLabel = (it: CotacaoPropostaItem) => {
    if (it.vinculo_origem === 'referencia') return `por referência${it.referencia ? ` "${it.referencia}"` : ''}`;
    if (it.vinculo_origem === 'ncm_descricao') return 'por descrição parecida';
    if (it.vinculo_origem === 'ia') return 'sugestão da IA';
    if (it.vinculo_origem === 'usuario') return 'definido manualmente';
    return 'sem correspondência';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {propostas.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setPropostaAtivaId(p.id)}
            className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5"
            style={{
              borderColor: p.id === propostaAtivaId ? corFornecedor(i) : 'var(--hairline)',
              background: p.id === propostaAtivaId ? `color-mix(in srgb, ${corFornecedor(i)} 14%, transparent)` : 'var(--surface-card)',
              color: p.id === propostaAtivaId ? corFornecedor(i) : 'var(--ink-secondary)',
            }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: corFornecedor(i) }} />
            {p.fornecedor_nome}
            {p.validacao_status === 'divergente' && <AlertTriangle className="h-3 w-3" style={{ color: '#d97706' }} />}
          </button>
        ))}
        <button
          onClick={onColarMais}
          className="px-3 py-1.5 rounded-full text-xs font-bold border border-dashed flex items-center gap-1.5 hover:bg-[var(--surface-raised)]"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}
        >
          <Plus className="h-3.5 w-3.5" /> Colar mais
        </button>
      </div>

      {propostaAtiva && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div className="rounded-xl border p-3 space-y-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <p className="text-[11px] font-bold uppercase tracking-wide px-1 mb-1" style={{ color: 'var(--ink-muted)' }}>
              Itens do lote ({itensCanonicos.length})
            </p>
            {itensCanonicos.map(ic => (
              <div key={ic.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs" style={{ background: 'var(--surface-sunken)' }}>
                <span className="truncate" style={{ color: 'var(--ink-secondary)' }} title={ic.descricao_canonica}>{ic.descricao_canonica}</span>
                <span className="shrink-0 tabular font-bold" style={{ color: 'var(--ink-muted)' }}>
                  {coberturaPorItem.get(ic.id) ?? 0}/{propostas.length}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border p-3 flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Condição de pagamento:</span>
              <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>"{propostaAtiva.condicao_pagamento_texto ?? EMPTY}"</span>
              <select
                value={propostaAtiva.ddp_codigo ?? ''}
                onChange={e => trocarDdp(e.target.value)}
                className="text-xs rounded-lg border py-1.5 px-2.5 focus:outline-none"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
              >
                <option value="">Selecionar código DDP…</option>
                {catalogoDdp.map(d => <option key={d.ddp} value={d.ddp}>{d.ddp} · {d.descricao}</option>)}
              </select>
              {propostaAtiva.ddp_pendente && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'color-mix(in srgb, #d97706 15%, transparent)', color: '#d97706' }}>
                  <AlertTriangle className="h-3 w-3" /> pendente — confirmar com o fornecedor
                </span>
              )}
              {propostaAtiva.validacao_status === 'divergente' && (
                <span className="text-[11px]" style={{ color: '#d97706' }} title={propostaAtiva.validacao_detalhe ?? ''}>
                  ⚠ {propostaAtiva.validacao_detalhe}
                </span>
              )}
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
              {itensAtivos.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>Nenhum item extraído desta proposta.</div>
              ) : itensAtivos.map(it => (
                <div key={it.id} className="p-3 border-b last:border-b-0 space-y-2" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {it.numero_item_original ? `${it.numero_item_original} · ` : ''}{it.descricao_bruta}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                        {formatQtd(it.quantidade)} {it.unidade} · {formatBRL(it.preco_unitario_efetivo)} · vínculo {origemLabel(it)}
                        {it.match_confianca != null && ` (${Math.round(it.match_confianca * 100)}%)`}
                      </p>
                      {it.divergente && (
                        <p className="text-[11px] font-bold mt-1 flex items-center gap-1" style={{ color: '#d97706' }}>
                          <AlertTriangle className="h-3 w-3" /> {it.divergencia_atributo}: {it.divergencia_detalhe}
                        </p>
                      )}
                    </div>
                    <select
                      value={it.cotacao_item_id ?? ''}
                      onChange={e => trocarVinculo(it, e.target.value || null)}
                      className="text-xs rounded-lg border py-1.5 px-2 max-w-[220px] focus:outline-none"
                      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
                    >
                      <option value="">Sem correspondência</option>
                      {itensCanonicos.map(ic => <option key={ic.id} value={ic.id}>{ic.descricao_canonica}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Imposto</span>
                    <select
                      value={it.imposto_codigo ?? ''}
                      onChange={e => trocarImposto(it, e.target.value)}
                      className="text-[11px] rounded-lg border py-1 px-2 max-w-[280px] focus:outline-none"
                      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
                    >
                      <option value="">Selecionar…</option>
                      {catalogoImpostos.map(c => <option key={c.incoterms} value={c.incoterms}>{c.incoterms} · {c.descricao}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onIrParaMapa}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs flex items-center gap-2 transition-all active:scale-95"
          style={{ background: 'var(--brand)' }}
        >
          Ver mapa de cotação <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Passo 4 — Mapa de cotação + decisão                                        */
/* ========================================================================== */

interface DecisaoLocal {
  propostaItemId: string;
  justificativa: string;
}

function PassoMapa({ lote, itensCanonicos, propostas, itensPorProposta, onVoltarVincular, onFechado, toast }: {
  lote: CotacaoLote;
  itensCanonicos: CotacaoItem[];
  propostas: CotacaoProposta[];
  itensPorProposta: Record<string, CotacaoPropostaItem[]>;
  onVoltarVincular: () => void;
  onFechado: (l: CotacaoLote) => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [decisoes, setDecisoes] = useState<Record<string, DecisaoLocal>>({});
  const [fechando, setFechando] = useState(false);
  const somenteLeitura = lote.status === 'decidido';

  const comparacaoPorItem = useMemo(() => {
    const mapa = new Map<string, { comparacao: ReturnType<typeof compararItem>; itensPorProposta: Map<string, CotacaoPropostaItem> }>();
    for (const ic of itensCanonicos) {
      const itensComparados: ItemComparado[] = [];
      const porProposta = new Map<string, CotacaoPropostaItem>();
      for (const proposta of propostas) {
        const item = (itensPorProposta[proposta.id] ?? []).find(it => it.cotacao_item_id === ic.id);
        if (!item) continue;
        porProposta.set(proposta.id, item);
        itensComparados.push({
          propostaId: proposta.id,
          itemExtraido: item as unknown as ItemComparado['itemExtraido'],
          precoEfetivo: item.preco_unitario_efetivo ?? null,
          custoTotal: item.custo_total_unitario ?? null,
          divergente: item.divergente,
        });
      }
      mapa.set(ic.id, { comparacao: compararItem(ic.id, itensComparados), itensPorProposta: porProposta });
    }
    return mapa;
  }, [itensCanonicos, propostas, itensPorProposta]);

  const totais = useMemo(() => {
    return propostas.map(p => {
      const soma = (itensPorProposta[p.id] ?? []).reduce((acc, it) => acc + (it.custo_total_unitario ?? 0) * (it.quantidade ?? 0), 0);
      const frete = p.frete_valor ?? 0;
      return { propostaId: p.id, somaItens: soma, freteValor: frete, totalComFrete: soma + frete };
    });
  }, [propostas, itensPorProposta]);

  const { vencedorPorSomaItensId, vencedorPorTotalId, divergenciaFreteTotal } = useMemo(() => compararTotais(totais), [totais]);

  const definirDecisao = (item: CotacaoItem, propostaItem: CotacaoPropostaItem, vencedor: { propostaVencedoraId: string | null }) => {
    const ehMenor = propostaItem.proposta_id === vencedor.propostaVencedoraId;
    if (!ehMenor || propostaItem.divergente) {
      setDecisoes(prev => ({ ...prev, [item.id]: { propostaItemId: propostaItem.id, justificativa: prev[item.id]?.propostaItemId === propostaItem.id ? prev[item.id].justificativa : '' } }));
    } else {
      setDecisoes(prev => ({ ...prev, [item.id]: { propostaItemId: propostaItem.id, justificativa: '' } }));
    }
  };

  const fechar = async () => {
    const faltando = itensCanonicos.filter(ic => {
      const d = decisoes[ic.id];
      if (!d) return true;
      const item = itensPorProposta[propostas.find(p => (itensPorProposta[p.id] ?? []).some(it => it.id === d.propostaItemId))?.id ?? '']?.find(it => it.id === d.propostaItemId);
      const info = comparacaoPorItem.get(ic.id);
      const propostaItem = info ? Array.from(info.itensPorProposta.values()).find(it => it.id === d.propostaItemId) : undefined;
      const ehMenor = propostaItem?.proposta_id === info?.comparacao.propostaVencedoraId;
      const precisaJustificar = !ehMenor || propostaItem?.divergente;
      return precisaJustificar && !d.justificativa.trim();
    });
    if (faltando.length > 0) {
      toast.warning(`Justifique a escolha de "${faltando[0].descricao_canonica}" — não é o menor custo total ou é um item divergente.`);
      return;
    }

    setFechando(true);
    try {
      const linhas: api.DecisaoItem[] = itensCanonicos
        .filter(ic => decisoes[ic.id])
        .map(ic => {
          const d = decisoes[ic.id];
          const info = comparacaoPorItem.get(ic.id);
          const propostaItem = info ? Array.from(info.itensPorProposta.values()).find(it => it.id === d.propostaItemId) : undefined;
          return {
            cotacaoItemId: ic.id,
            propostaItemId: d.propostaItemId,
            quantidadeAdjudicada: ic.quantidade ?? null,
            ehMenorPreco: propostaItem?.proposta_id === info?.comparacao.propostaVencedoraId,
            aceitaDivergencia: !!propostaItem?.divergente,
            justificativa: d.justificativa || null,
          };
        });
      await api.fecharCotacao(lote.id, linhas);
      toast.success('Cotação fechada. Itens adjudicados movidos para Aguardando Aprovação PO.');
      onFechado({ ...lote, status: 'decidido' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao fechar a cotação.');
    } finally {
      setFechando(false);
    }
  };

  const montarDadosExport = (): MapaExportData => ({
    lote,
    fornecedores: propostas.map(p => {
      const total = totais.find(t => t.propostaId === p.id);
      return {
        propostaId: p.id,
        nome: p.fornecedor_nome ?? 'Fornecedor',
        totalComFrete: total?.totalComFrete ?? null,
        freteValor: p.frete_valor ?? null,
        pagamentoLabel: p.ddp_pendente ? 'A combinar' : (p.condicao_pagamento_texto ?? EMPTY),
        validadeLabel: p.validade_texto ?? EMPTY,
        faturamentoMinimoLabel: p.faturamento_minimo != null ? formatBRL(p.faturamento_minimo) : EMPTY,
        vencedorPorTotal: p.id === vencedorPorTotalId,
        validacaoStatus: p.validacao_status,
      };
    }),
    linhas: itensCanonicos.map(ic => {
      const info = comparacaoPorItem.get(ic.id);
      const porFornecedor: MapaExportData['linhas'][number]['porFornecedor'] = {};
      for (const p of propostas) {
        const item = info?.itensPorProposta.get(p.id);
        porFornecedor[p.id] = {
          custoTotal: item?.custo_total_unitario ?? null,
          precoEfetivo: item?.preco_unitario_efetivo ?? null,
          naoCotado: !item,
          divergente: !!item?.divergente,
          divergenciaDetalhe: item?.divergencia_detalhe ?? null,
          vencedor: !!item && info?.comparacao.propostaVencedoraId === p.id,
          deltaPercentual: item ? (info?.comparacao.deltaPercentual[p.id] ?? null) : null,
        };
      }
      return { descricao: ic.descricao_canonica, referencia: ic.referencia ?? '', ri: ic.ri ?? '', quantidade: ic.quantidade ?? null, unidade: ic.unidade ?? '', porFornecedor };
    }),
    detalheFiscal: propostas.flatMap(p => (itensPorProposta[p.id] ?? []).map(it => ({
      fornecedor: p.fornecedor_nome ?? '',
      item: it.descricao_bruta,
      numeroOriginal: it.numero_item_original ?? '',
      ncm: it.ncm ?? '',
      cst: it.cst ?? '',
      cfop: it.cfop ?? '',
      ipiPercentual: it.ipi_percentual ?? null,
      icmsPercentual: it.icms_percentual ?? null,
      icmsReducaoPercentual: it.icms_reducao_percentual ?? null,
      stPercentual: it.st_percentual ?? null,
      pisPercentual: it.pis_percentual ?? null,
      cofinsPercentual: it.cofins_percentual ?? null,
      precoEfetivo: it.preco_unitario_efetivo ?? null,
      custoTotal: it.custo_total_unitario ?? null,
    }))),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onVoltarVincular} className="text-xs font-bold flex items-center gap-1.5" style={{ color: 'var(--ink-muted)' }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para vínculo
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportarExcel(montarDadosExport())}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 hover:bg-[var(--surface-raised)]"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </button>
          <button
            onClick={() => exportarPdf(montarDadosExport())}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 hover:bg-[var(--surface-raised)]"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <FileDown className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>

      {divergenciaFreteTotal && (
        <div className="rounded-lg px-4 py-2.5 text-xs font-bold flex items-center gap-2" style={{ background: 'color-mix(in srgb, #d97706 12%, transparent)', color: '#d97706' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          O fornecedor com menor soma de itens não é o mais barato no total — o frete muda o resultado.
        </div>
      )}

      <TableShell maxHeight="65vh">
        <table className="w-full text-xs">
          <TableHeadRow>
            <Th label="Item" width="min-w-[260px]" />
            {propostas.map((p, i) => (
              <Th key={p.id} align="right">
                <span className="flex items-center gap-1.5 justify-end">
                  <span className="w-2 h-2 rounded-full" style={{ background: corFornecedor(i) }} />
                  {p.fornecedor_nome}
                  {p.validacao_status === 'divergente' && <AlertTriangle className="h-3 w-3" style={{ color: '#d97706' }} />}
                </span>
              </Th>
            ))}
          </TableHeadRow>
          <TableBody>
            {itensCanonicos.map(ic => {
              const info = comparacaoPorItem.get(ic.id);
              return (
                <Tr key={ic.id}>
                  <Td>
                    <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{ic.descricao_canonica}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {ic.material_code ? `${ic.material_code} · ` : ''}{formatQtd(ic.quantidade)} {ic.unidade}
                      {ic.ri ? ` · RM ${ic.rm}/${ic.item_reqc}` : ''}
                    </p>
                  </Td>
                  {propostas.map((p, i) => {
                    const item = info?.itensPorProposta.get(p.id);
                    const vencedor = !!item && info?.comparacao.propostaVencedoraId === p.id;
                    const delta = item ? info?.comparacao.deltaPercentual[p.id] : null;
                    const decisao = decisoes[ic.id];
                    const escolhido = decisao?.propostaItemId === item?.id;
                    return (
                      <Td key={p.id} align="right">
                        {!item ? (
                          <span style={{ color: 'var(--ink-muted)' }}>não cotado</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {vencedor && !item.divergente && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: 'var(--brand)' }} />}
                              <span className="font-bold tabular" style={{ color: 'var(--ink-primary)' }}>{formatBRL(item.custo_total_unitario)}</span>
                            </div>
                            {item.divergente ? (
                              <p className="text-[10px] font-bold" style={{ color: '#d97706' }}>⚠ {item.divergencia_atributo}</p>
                            ) : delta != null && delta > 0 ? (
                              <div className="flex items-center justify-end gap-1">
                                <div className="h-1 rounded-full" style={{ width: `${Math.min(40, delta)}px`, background: corFornecedor(i) }} />
                                <span className="text-[10px] tabular" style={{ color: 'var(--ink-muted)' }}>+{delta.toFixed(1)}%</span>
                              </div>
                            ) : null}
                            {!somenteLeitura && (
                              <button
                                onClick={() => definirDecisao(ic, item, { propostaVencedoraId: info?.comparacao.propostaVencedoraId ?? null })}
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  color: escolhido ? '#fff' : 'var(--brand)',
                                  background: escolhido ? 'var(--brand)' : 'transparent',
                                }}
                              >
                                {escolhido ? 'Vencedor ✓' : 'Definir vencedor'}
                              </button>
                            )}
                          </div>
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              );
            })}
          </TableBody>
        </table>
      </TableShell>

      {Object.entries(decisoes).some(([itemId, d]) => {
        const info = comparacaoPorItem.get(itemId);
        const propostaItem = info ? Array.from(info.itensPorProposta.values()).find(it => it.id === d.propostaItemId) : undefined;
        return propostaItem?.proposta_id !== info?.comparacao.propostaVencedoraId || propostaItem?.divergente;
      }) && (
        <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Justificativas</p>
          {itensCanonicos.map(ic => {
            const d = decisoes[ic.id];
            if (!d) return null;
            const info = comparacaoPorItem.get(ic.id);
            const propostaItem = info ? Array.from(info.itensPorProposta.values()).find(it => it.id === d.propostaItemId) : undefined;
            const precisa = propostaItem?.proposta_id !== info?.comparacao.propostaVencedoraId || propostaItem?.divergente;
            if (!precisa) return null;
            return (
              <div key={ic.id} className="flex items-center gap-2">
                <span className="text-xs w-56 truncate shrink-0" style={{ color: 'var(--ink-secondary)' }}>{ic.descricao_canonica}</span>
                <input
                  value={d.justificativa}
                  onChange={e => setDecisoes(prev => ({ ...prev, [ic.id]: { ...prev[ic.id], justificativa: e.target.value } }))}
                  placeholder="Por que não é o menor custo total / por que aceitar a divergência…"
                  disabled={somenteLeitura}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-page)', color: 'var(--ink-primary)' }}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
        <table className="w-full text-xs">
          <tbody>
            {[
              { label: 'TOTAL DA PROPOSTA (com frete)', render: (p: CotacaoProposta) => {
                const t = totais.find(x => x.propostaId === p.id);
                return <span className="font-extrabold tabular" style={{ color: p.id === vencedorPorTotalId ? 'var(--brand)' : 'var(--ink-primary)' }}>{formatBRL(t?.totalComFrete)}{p.id === vencedorPorTotalId ? ' ✓' : ''}</span>;
              } },
              { label: 'Frete', render: (p: CotacaoProposta) => <span className="tabular">{formatBRL(p.frete_valor ?? 0)}</span> },
              { label: 'Pagamento', render: (p: CotacaoProposta) => p.ddp_pendente ? <span style={{ color: '#d97706' }}>⚠ a combinar</span> : <span>{p.condicao_pagamento_texto ?? EMPTY}</span> },
              { label: 'Validade', render: (p: CotacaoProposta) => <span>{p.validade_texto ?? EMPTY}</span> },
              { label: 'Faturamento mínimo', render: (p: CotacaoProposta) => <span>{p.faturamento_minimo != null ? formatBRL(p.faturamento_minimo) : EMPTY}</span> },
            ].map(linha => (
              <tr key={linha.label} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                <td className="px-3 py-2 font-bold" style={{ color: 'var(--ink-muted)' }}>{linha.label}</td>
                {propostas.map(p => <td key={p.id} className="px-3 py-2 text-right" style={{ color: 'var(--ink-secondary)' }}>{linha.render(p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!somenteLeitura && (
        <div className="flex justify-end pt-2">
          <button
            onClick={fechar}
            disabled={fechando || Object.keys(decisoes).length === 0}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {fechando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Fechar cotação
          </button>
        </div>
      )}
    </div>
  );
}

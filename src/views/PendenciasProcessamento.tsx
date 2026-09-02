/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela do Suprimentos para dar baixa nas notas fiscais pendentes de
 * processamento, abertas via chamado (Nova Solicitação → Chamado → destino
 * Suprimentos → categoria "Pendência de Processamento").
 *
 * Cada chamado traz uma relação de NFS-e (tabela `sup_pend_processamento_nf`).
 * O atendente conclui cada nota com uma nota de resolução; o solicitante é
 * notificado a cada conclusão e o Outlook é aberto para envio de e-mail de
 * notificação para victor.oliveira@ten.ind.br (individual ou consolidado em lote).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReceiptText,
  Loader2,
  RefreshCw,
  Check,
  RotateCcw,
  ChevronRight,
  CircleCheck,
  Search,
  X,
  User,
  Building2,
  Truck,
  Calendar,
  FileSpreadsheet,
  BarChart3,
  Mail,
  MessageSquareText,
  CheckSquare,
  Square,
  CheckCheck,
} from 'lucide-react';
import type { Profile, SupPendenciaProcessamentoNF } from '../types';
import { formatBRL, formatDateTimeBR } from '../lib/format';
import { useToast } from '../components/ui/Toast';
import { localDb } from '../db/localDb';
import MultiSelectFilter from '../components/ui/MultiSelectFilter';
import DateRangeFilter, { type DateRangeValue } from '../components/ui/DateRangeFilter';
import { obterConfigEmail, montarMailtoComConfig } from '../lib/emailConfigApi';
import {
  camposExibicao,
  rotuloNumero,
  rotuloModelo,
  montarAssuntoEmailConclusao,
  montarCorpoEmailConclusao,
  type ItemConcluidoEmail,
} from '../lib/supPendenciasProcessamento';
import {
  listarPendenciasAgrupadas,
  concluirPendencia,
  concluirPendenciasEmLote,
  reabrirPendencia,
  type GrupoPendencia,
} from '../lib/supPendenciasApi';
import PendenciasProcessamentoAnalise from './PendenciasProcessamentoAnalise';

interface PendenciasProcessamentoProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

const cardStyle: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-card)',
  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
};

/** Miniaturas das imagens do chamado "Ajuste de Pedido" — busca as URLs assinadas e abre em tamanho real ao clicar. */
function ImagensAjustePedido({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    if (paths.length === 0) { setUrls([]); return; }
    let vivo = true;
    Promise.all(paths.map(p => localDb.getAttachmentUrl(p))).then(u => { if (vivo) setUrls(u); });
    return () => { vivo = false; };
  }, [paths.join('|')]);

  if (paths.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((p, i) => (
        urls[i] ? (
          <a key={p} href={urls[i] as string} target="_blank" rel="noreferrer" className="inline-block">
            <img
              src={urls[i] as string}
              alt={`Imagem ${i + 1} do ajuste de pedido`}
              className="max-h-40 rounded-lg border object-contain"
              style={{ borderColor: 'var(--hairline)' }}
            />
          </a>
        ) : (
          <span key={p} className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando imagem…</span>
        )
      ))}
    </div>
  );
}

/** Normaliza para a lista de caminhos de imagem (formato novo `imagem_paths`, com fallback ao antigo `imagem_path`). */
function caminhosImagem(l: { imagem_paths?: string[] | null; imagem_path?: string | null }): string[] {
  if (l.imagem_paths && l.imagem_paths.length > 0) return l.imagem_paths;
  return l.imagem_path ? [l.imagem_path] : [];
}

const EMAIL_DESTINATARIO_PADRAO = 'victor.oliveira@ten.ind.br';

/** Rótulos de `camposExibicao` que carregam a observação/demanda — exibidos em destaque, fora da grade de metadados. */
const OBS_LABELS = ['Observação', 'Observações', 'Demanda'];
/** Rótulos que não entram na grade de metadados da linha (já aparecem no título ou no bloco de observação). */
const OMITIR_GRID = ['Nome do Fornecedor', 'Fornecedor', 'Número da NF', ...OBS_LABELS];

export default function PendenciasProcessamento({ user, onNavigate }: PendenciasProcessamentoProps) {
  const toast = useToast();
  const [grupos, setGrupos] = useState<GrupoPendencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<'fila' | 'analise'>('fila');
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [salvandoLote, setSalvandoLote] = useState(false);
  const [resolucoes, setResolucoes] = useState<Record<string, string>>({});

  // Seleção múltipla para ações em lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [resolucaoLote, setResolucaoLote] = useState('');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pendentes' | 'todos' | 'concluidos'>('pendentes');
  const [modeloFilter, setModeloFilter] = useState<Set<string>>(new Set());
  const [solicitanteFilter, setSolicitanteFilter] = useState<Set<string>>(new Set());
  const [setorFilter, setSetorFilter] = useState<Set<string>>(new Set());
  const [fornecedorFilter, setFornecedorFilter] = useState<Set<string>>(new Set());
  const [causaFilter, setCausaFilter] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateRangeValue>({ from: '', to: '', preset: 'all' });

  // Mapa de setores
  const sectorMap = useMemo(() => {
    return new Map(localDb.getSectors().map(s => [s.id, s.name]));
  }, []);

  const getSectorName = useCallback((id?: string) => {
    return id ? sectorMap.get(id) || 'Sem setor' : 'Sem setor';
  }, [sectorMap]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // Carrega todos os chamados para permitir filtragem reativa instantanea no cliente
      setGrupos(await listarPendenciasAgrupadas(false));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Opções para os filtros dropdown
  const solicitanteOptions = useMemo(() => {
    const set = new Set<string>();
    grupos.forEach(g => {
      if (g.solicitante_name && g.solicitante_name !== '—') set.add(g.solicitante_name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos]);

  const setorOptions = useMemo(() => {
    const set = new Set<string>();
    grupos.forEach(g => {
      const nome = getSectorName(g.solicitante_sector_id);
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos, getSectorName]);

  const fornecedorOptions = useMemo(() => {
    const set = new Set<string>();
    grupos.forEach(g => {
      g.linhas.forEach(l => {
        if (l.nome_fornecedor) set.add(l.nome_fornecedor.trim());
        else if (l.fornecedor) set.add(l.fornecedor.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos]);

  const causaOptions = useMemo(() => {
    const set = new Set<string>();
    grupos.forEach(g => { if (g.classif_causa) set.add(g.classif_causa); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [grupos]);

  // Filtragem combinada de grupos e linhas
  const gruposFiltrados = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return grupos.map(g => {
      // 1. Filtro de Status
      if (statusFilter === 'pendentes' && g.concluidas === g.total) return null;
      if (statusFilter === 'concluidos' && g.concluidas < g.total) return null;

      // 2. Filtro de Modelo
      if (modeloFilter.size > 0 && !modeloFilter.has(rotuloModelo(g.modelo))) return null;

      // 3. Filtro de Solicitante
      if (solicitanteFilter.size > 0 && !solicitanteFilter.has(g.solicitante_name)) return null;

      // 4. Filtro de Setor
      const sectorName = getSectorName(g.solicitante_sector_id);
      if (setorFilter.size > 0 && !setorFilter.has(sectorName)) return null;

      // 4b. Filtro de Causa
      if (causaFilter.size > 0 && !(g.classif_causa && causaFilter.has(g.classif_causa))) return null;

      // 5. Filtro de Data de Abertura
      const recordDate = g.created_at ? g.created_at.slice(0, 10) : '';
      if (dateFilter.preset === 'no_date') {
        if (recordDate) return null;
      } else {
        if (dateFilter.from && recordDate < dateFilter.from) return null;
        if (dateFilter.to && recordDate > dateFilter.to) return null;
      }

      // 6. Linhas correspondentes dentro do chamado
      const matchingLines = g.linhas.filter(l => {
        // Fornecedor
        if (fornecedorFilter.size > 0) {
          const forn = (l.nome_fornecedor || l.fornecedor || '').trim();
          if (!forn || !fornecedorFilter.has(forn)) return false;
        }

        // Pesquisa textual
        if (!q) return true;

        const groupMatches = (
          g.protocolo.toLowerCase().includes(q) ||
          g.numero.toLowerCase().includes(q) ||
          g.solicitante_name.toLowerCase().includes(q) ||
          Boolean(g.classif_causa && g.classif_causa.toLowerCase().includes(q)) ||
          Boolean(g.classif_responsavel && g.classif_responsavel.toLowerCase().includes(q)) ||
          Boolean(g.observacao_chamado && g.observacao_chamado.toLowerCase().includes(q))
        );
        if (groupMatches) return true;

        return (
          (l.numero_nfse && l.numero_nfse.toLowerCase().includes(q)) ||
          (l.nome_fornecedor && l.nome_fornecedor.toLowerCase().includes(q)) ||
          (l.fornecedor && l.fornecedor.toLowerCase().includes(q)) ||
          (l.observacao && l.observacao.toLowerCase().includes(q)) ||
          (l.documento_compras && l.documento_compras.toLowerCase().includes(q)) ||
          (l.comprador && l.comprador.toLowerCase().includes(q)) ||
          (l.resolucao && l.resolucao.toLowerCase().includes(q)) ||
          (l.documento_status && l.documento_status.toLowerCase().includes(q))
        );
      });

      if (matchingLines.length === 0) return null;

      return {
        ...g,
        linhas: matchingLines,
      };
    }).filter((g): g is GrupoPendencia => g !== null);
  }, [
    grupos,
    searchQuery,
    statusFilter,
    modeloFilter,
    solicitanteFilter,
    setorFilter,
    fornecedorFilter,
    causaFilter,
    dateFilter,
    getSectorName,
  ]);

  const totais = useMemo(() => {
    const notas = gruposFiltrados.reduce((s, g) => s + g.total, 0);
    const pendentes = gruposFiltrados.reduce((s, g) => s + (g.total - g.concluidas), 0);
    const totalGeralChamados = grupos.length;
    return {
      chamados: gruposFiltrados.length,
      totalGeralChamados,
      notas,
      pendentes,
    };
  }, [grupos, gruposFiltrados]);

  // Contagem de pendentes visíveis para seleção
  const totalPendentesVisiveis = useMemo(() => {
    let count = 0;
    gruposFiltrados.forEach(g => {
      g.linhas.forEach(l => {
        if (l.status !== 'concluido') count++;
      });
    });
    return count;
  }, [gruposFiltrados]);

  const hasActiveFilters = useMemo(() => {
    return (
      Boolean(searchQuery.trim()) ||
      statusFilter !== 'pendentes' ||
      modeloFilter.size > 0 ||
      solicitanteFilter.size > 0 ||
      setorFilter.size > 0 ||
      fornecedorFilter.size > 0 ||
      causaFilter.size > 0 ||
      (dateFilter.preset && dateFilter.preset !== 'all') ||
      Boolean(dateFilter.from) ||
      Boolean(dateFilter.to)
    );
  }, [searchQuery, statusFilter, modeloFilter, solicitanteFilter, setorFilter, fornecedorFilter, causaFilter, dateFilter]);

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('pendentes');
    setModeloFilter(new Set());
    setSolicitanteFilter(new Set());
    setSetorFilter(new Set());
    setFornecedorFilter(new Set());
    setCausaFilter(new Set());
    setDateFilter({ from: '', to: '', preset: 'all' });
  };

  // Funções de seleção múltipla
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGrupo = (g: GrupoPendencia) => {
    const pendentesGrupo = g.linhas.filter(l => l.status !== 'concluido').map(l => l.id);
    if (pendentesGrupo.length === 0) return;

    const todosJaSelecionados = pendentesGrupo.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (todosJaSelecionados) {
        pendentesGrupo.forEach(id => next.delete(id));
      } else {
        pendentesGrupo.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const toggleSelectTodosVisiveis = () => {
    const pendentesIds: string[] = [];
    gruposFiltrados.forEach(g => {
      g.linhas.forEach(l => {
        if (l.status !== 'concluido') pendentesIds.push(l.id);
      });
    });

    if (pendentesIds.length === 0) return;

    const todosJaSelecionados = pendentesIds.every(id => selectedIds.has(id));
    if (todosJaSelecionados) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendentesIds));
    }
  };

  // Disparo do e-mail consolidado ou individual diretamente no corpo do Outlook
  const dispararEmailConclusao = async (itensEmail: ItemConcluidoEmail[]) => {
    if (itensEmail.length === 0) return;

    const configEmail = await obterConfigEmail('pendencia_processamento_conclusao');
    const destinatarios = configEmail?.destinatarios || EMAIL_DESTINATARIO_PADRAO;
    const copia = configEmail?.copia;
    const copiaOculta = configEmail?.copia_oculta;

    const assunto = montarAssuntoEmailConclusao(itensEmail);
    const corpo = montarCorpoEmailConclusao({
      itens: itensEmail,
      usuarioAtendente: user?.name || 'Suprimentos',
      origemUrl: `${window.location.origin}/#/suprimentos/pendencias-processamento`,
    });

    const mailtoUrl = montarMailtoComConfig({
      destinatarios,
      copia,
      copiaOculta,
      assunto,
      corpo,
    });

    window.location.href = mailtoUrl;
  };

  // Concluir único item
  const handleConcluir = async (l: SupPendenciaProcessamentoNF, g: GrupoPendencia) => {
    setSalvandoId(l.id);
    const resTexto = resolucoes[l.id] || '';
    const ok = await concluirPendencia(l.id, resTexto);
    setSalvandoId(null);
    if (!ok) {
      toast.error('Não foi possível concluir a nota. Tente novamente.');
      return;
    }

    setResolucoes(prev => { const p = { ...prev }; delete p[l.id]; return p; });
    setSelectedIds(prev => {
      const p = new Set(prev);
      p.delete(l.id);
      return p;
    });
    toast.success('Nota concluída. Abrindo Outlook para envio de e-mail...');

    await dispararEmailConclusao([{
      linha: l,
      protocolo: g.protocolo,
      numeroChamado: g.numero,
      solicitanteNome: g.solicitante_name,
      resolucao: resTexto,
    }]);

    carregar();
  };

  // Concluir itens selecionados em lote
  const handleConcluirEmLote = async () => {
    if (selectedIds.size === 0) return;

    const itensParaConcluir: {
      id: string;
      resolucao: string;
      itemEmail: ItemConcluidoEmail;
    }[] = [];

    grupos.forEach(g => {
      g.linhas.forEach(l => {
        if (selectedIds.has(l.id) && l.status !== 'concluido') {
          const res = resolucaoLote.trim() || resolucoes[l.id] || '';
          itensParaConcluir.push({
            id: l.id,
            resolucao: res,
            itemEmail: {
              linha: l,
              protocolo: g.protocolo,
              numeroChamado: g.numero,
              solicitanteNome: g.solicitante_name,
              resolucao: res,
            },
          });
        }
      });
    });

    if (itensParaConcluir.length === 0) {
      toast.warning('Nenhum item pendente selecionado.');
      return;
    }

    setSalvandoLote(true);
    try {
      const ok = await concluirPendenciasEmLote(itensParaConcluir.map(i => ({ id: i.id, resolucao: i.resolucao })));
      if (!ok) {
        toast.error('Não foi possível concluir os itens selecionados.');
        return;
      }

      toast.success(`${itensParaConcluir.length} item(ns) concluído(s). Abrindo Outlook consolidado...`);

      await dispararEmailConclusao(itensParaConcluir.map(i => i.itemEmail));

      setSelectedIds(new Set());
      setResolucaoLote('');
      carregar();
    } finally {
      setSalvandoLote(false);
    }
  };

  const handleReabrir = async (id: string) => {
    setSalvandoId(id);
    const ok = await reabrirPendencia(id);
    setSalvandoId(null);
    if (!ok) {
      toast.error('Não foi possível reabrir a nota.');
      return;
    }
    carregar();
  };

  return (
    <div className="space-y-6 text-left w-full pb-24">
      <div className="reveal">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <ReceiptText className="h-7 w-7" style={{ color: 'var(--ink-muted)' }} />
          Pendências de Processamento
        </h2>
        <p className="mt-1 text-base" style={{ color: 'var(--ink-secondary)' }}>
          Notas fiscais aguardando processamento, abertas por chamado. Dê baixa em cada uma com a resolução e notifique por e-mail no Outlook.
        </p>
      </div>

      {/* Abas: fila de baixa x análise dos dados */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 w-fit border border-slate-200/50 dark:border-slate-800 reveal">
        <button
          type="button"
          onClick={() => setAba('fila')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            aba === 'fila'
              ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <ReceiptText className="h-3.5 w-3.5" /> Fila
        </button>
        <button
          type="button"
          onClick={() => setAba('analise')}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            aba === 'analise'
              ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Análise
        </button>
      </div>

      {aba === 'analise' && (
        <PendenciasProcessamentoAnalise grupos={grupos} carregando={carregando} onRecarregar={carregar} />
      )}

      {aba === 'fila' && (
      <>
      {/* Resumo de Indicadores, Ações Globais e Botão Atualizar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--ink-secondary)' }}>
          <span>
            <strong style={{ color: 'var(--ink-primary)' }}>{totais.chamados}</strong>
            {hasActiveFilters && totais.chamados !== totais.totalGeralChamados
              ? ` de ${totais.totalGeralChamados} chamado(s)`
              : ' chamado(s)'}
          </span>
          <span><strong style={{ color: 'var(--ink-primary)' }}>{totais.notas}</strong> nota(s)</span>
          <span><strong style={{ color: 'var(--status-serious)' }}>{totais.pendentes}</strong> pendente(s)</span>
        </div>

        <div className="flex items-center gap-2">
          {totalPendentesVisiveis > 0 && (
            <button
              type="button"
              onClick={toggleSelectTodosVisiveis}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold cursor-pointer transition-colors hover:bg-[var(--surface-raised)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <CheckCheck className="h-3.5 w-3.5 text-blue-600" />
              {selectedIds.size === totalPendentesVisiveis ? 'Desmarcar todos' : `Selecionar ${totalPendentesVisiveis} pendentes`}
            </button>
          )}

          <button
            type="button"
            onClick={carregar}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold cursor-pointer transition-colors hover:bg-[var(--surface-raised)] disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* Painel de Filtros */}
      <div className="rounded-xl border p-4 space-y-3 reveal" style={cardStyle}>
        {/* Linha 1: Campo de Busca e Toggle de Status */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por protocolo, chamado, nº nota/documento, fornecedor, observação..."
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-[#0056c6] focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status Pills */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 shrink-0 border border-slate-200/50 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setStatusFilter('pendentes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'pendentes'
                  ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Com Pendências
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'todos'
                  ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('concluidos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                statusFilter === 'concluidos'
                  ? 'bg-white dark:bg-slate-800 text-[#0056c6] dark:text-[#3b82f6] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              Concluídos
            </button>
          </div>
        </div>

        {/* Linha 2: Dropdowns MultiSelect, DateRangeFilter e Limpar */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible pt-1">
          <MultiSelectFilter
            label="Modelo"
            icon={FileSpreadsheet}
            options={['NFS-e', 'Lançamentos SAP', 'Ajuste de Pedido']}
            selected={modeloFilter}
            onChange={setModeloFilter}
            className="shrink-0 w-[140px] sm:w-auto sm:min-w-[140px]"
          />
          <MultiSelectFilter
            label="Solicitante"
            icon={User}
            options={solicitanteOptions}
            selected={solicitanteFilter}
            onChange={setSolicitanteFilter}
            className="shrink-0 w-[150px] sm:w-auto sm:min-w-[150px]"
          />
          <MultiSelectFilter
            label="Setor"
            icon={Building2}
            options={setorOptions}
            selected={setorFilter}
            onChange={setSetorFilter}
            className="shrink-0 w-[140px] sm:w-auto sm:min-w-[140px]"
          />
          <MultiSelectFilter
            label="Fornecedor"
            icon={Truck}
            options={fornecedorOptions}
            selected={fornecedorFilter}
            onChange={setFornecedorFilter}
            panelClassName="w-80"
            className="shrink-0 w-[160px] sm:w-auto sm:min-w-[160px]"
          />
          <MultiSelectFilter
            label="Causa"
            icon={Search}
            options={causaOptions}
            selected={causaFilter}
            onChange={setCausaFilter}
            panelClassName="w-80"
            className="shrink-0 w-[140px] sm:w-auto sm:min-w-[140px]"
          />
          <DateRangeFilter
            label="Abertura"
            icon={Calendar}
            value={dateFilter}
            onChange={setDateFilter}
            className="shrink-0 w-[160px] sm:w-auto sm:min-w-[160px]"
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1.5 cursor-pointer shrink-0 ml-auto"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Lista de Chamados e Notas */}
      {carregando ? (
        <div className="flex items-center justify-center py-16" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      ) : gruposFiltrados.length === 0 ? (
        <div className="rounded-xl border p-10 text-center reveal" style={cardStyle}>
          <CircleCheck className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--status-good)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>
            {hasActiveFilters
              ? 'Nenhuma pendência encontrada para os filtros selecionados.'
              : 'Nada pendente por aqui.'}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearAllFilters}
                className="text-[#0056c6] dark:text-[#3b82f6] font-bold hover:underline cursor-pointer"
              >
                Limpar todos os filtros para ver outros registros
              </button>
            ) : (
              'Novos chamados de pendência de processamento aparecem nesta lista.'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4 stagger">
          {gruposFiltrados.map(g => {
            const totalValor = g.linhas.reduce((s, l) => s + (l.valor_nfse ?? 0), 0);
            const isDoc = g.modelo === 'documento';
            const isAjuste = g.modelo === 'ajuste_pedido';
            const impactoAlto = /^\s*alto/i.test(g.classif_impacto || '');
            const pendentesGrupo = g.linhas.filter(l => l.status !== 'concluido');
            const todosGrupoSelecionados = pendentesGrupo.length > 0 && pendentesGrupo.every(l => selectedIds.has(l.id));

            return (
              <div key={g.request_id} className="rounded-xl border overflow-hidden reveal" style={cardStyle}>
                {/* Cabeçalho do Chamado */}
                <div className="px-5 py-3 border-b flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ borderColor: 'var(--hairline)' }}>
                  {pendentesGrupo.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleSelectGrupo(g)}
                      title={todosGrupoSelecionados ? 'Desmarcar notas deste chamado' : 'Selecionar notas pendentes deste chamado'}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer mr-1"
                    >
                      {todosGrupoSelecionados ? (
                        <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  )}

                  <span className="font-bold font-mono text-sm" style={{ color: 'var(--ink-primary)' }}>{g.protocolo}</span>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/solicitacoes?id=${g.request_id}`)}
                    className="text-[12px] font-bold inline-flex items-center gap-0.5 cursor-pointer hover:underline"
                    style={{ color: 'var(--brand)' }}
                  >
                    Chamado #{g.numero} <ChevronRight className="h-3 w-3" />
                  </button>
                  <span className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>{g.solicitante_name}</span>
                  {g.solicitante_sector_id && (
                    <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}>
                      {getSectorName(g.solicitante_sector_id)}
                    </span>
                  )}
                  <span className="text-[12px] inline-flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                    <Calendar className="h-3 w-3" />
                    Aberto em {formatDateTimeBR(g.created_at)}
                  </span>
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
                    {rotuloModelo(g.modelo)}
                  </span>
                  <span className="text-[12px] ml-auto font-semibold" style={{ color: g.concluidas === g.total ? 'var(--status-good)' : 'var(--ink-secondary)' }}>
                    {g.concluidas}/{g.total} concluído(s)
                  </span>
                  {!isDoc && !isAjuste && (
                    <span className="text-[12px] font-semibold tabular" style={{ color: 'var(--ink-primary)' }}>
                      {formatBRL(totalValor)}
                    </span>
                  )}
                </div>

                {/* Classificação da demanda + observação do chamado */}
                {(g.classif_causa || g.classif_responsavel || g.classif_impacto || g.classif_recorrencia || g.observacao_chamado) && (
                  <div className="px-5 py-2.5 border-b flex flex-col gap-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      {g.classif_causa && (
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--status-serious) 14%, transparent)', color: 'var(--status-serious)' }}>
                          Causa: {g.classif_causa}
                        </span>
                      )}
                      {g.classif_responsavel && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-card)', color: 'var(--ink-secondary)' }}>
                          Resp.: {g.classif_responsavel}
                        </span>
                      )}
                      {g.classif_impacto && (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded"
                          style={
                            impactoAlto
                              ? { background: 'color-mix(in srgb, var(--status-critical) 15%, transparent)', color: 'var(--status-critical)', fontWeight: 700 }
                              : { background: 'var(--surface-card)', color: 'var(--ink-secondary)' }
                          }
                        >
                          Impacto: {g.classif_impacto}
                        </span>
                      )}
                      {g.classif_recorrencia && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-card)', color: 'var(--ink-secondary)' }}>
                          {g.classif_recorrencia}
                        </span>
                      )}
                    </div>
                    {g.observacao_chamado && (
                      <div className="rounded-lg border-l-2 px-3 py-2" style={{ borderColor: 'var(--brand)', background: 'var(--surface-card)' }}>
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--ink-muted)' }}>
                          <MessageSquareText className="h-3 w-3" />
                          Observação do solicitante
                        </span>
                        <p className="text-[13px] leading-snug whitespace-pre-wrap break-words" style={{ color: 'var(--ink-primary)' }}>
                          {g.observacao_chamado}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Linhas de Notas Fiscais / Documentos */}
                <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {g.linhas.map(l => {
                    const concluido = l.status === 'concluido';
                    const isSelected = selectedIds.has(l.id);
                    const camposLinha = camposExibicao(l);
                    const obsLinha = camposLinha.find(f => OBS_LABELS.includes(f.label) && f.value.trim());
                    const gridLinha = camposLinha.filter(f => !OMITIR_GRID.includes(f.label) && f.value);

                    return (
                      <div
                        key={l.id}
                        className="px-5 py-3 grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-3 items-start transition-colors"
                        style={
                          concluido
                            ? { background: 'color-mix(in srgb, var(--status-good) 5%, transparent)' }
                            : isSelected
                            ? { background: 'color-mix(in srgb, var(--brand) 6%, transparent)' }
                            : undefined
                        }
                      >
                        {/* Checkbox de Seleção */}
                        <div className="pt-0.5">
                          {!concluido ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(l.id)}
                              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-[#0056c6] focus:ring-[#0056c6] cursor-pointer"
                              style={{ accentColor: 'var(--brand)' }}
                            />
                          ) : (
                            <div className="w-4 h-4 flex items-center justify-center">
                              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            </div>
                          )}
                        </div>

                        {/* Conteúdo do Registro */}
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="font-mono font-bold text-sm" style={{ color: 'var(--ink-primary)' }}>
                              {rotuloNumero(l.modelo)} {l.numero_nfse}
                            </span>
                            {l.nome_fornecedor && (
                              <span className="text-[12px]" style={{ color: 'var(--ink-secondary)' }}>{l.nome_fornecedor}</span>
                            )}
                            {isDoc && l.documento_status && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'color-mix(in srgb, var(--status-serious) 15%, transparent)', color: 'var(--status-serious)' }}>
                                {l.documento_status}
                              </span>
                            )}
                            {!isDoc && l.nfse_cancelada && /^s/i.test(l.nfse_cancelada) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase" style={{ background: 'color-mix(in srgb, var(--status-critical) 15%, transparent)', color: 'var(--status-critical)' }}>
                                Cancelada
                              </span>
                            )}
                          </div>
                          {/* Observação da linha — o que o comprador precisa resolver. Vem antes dos metadados secundários. */}
                          {obsLinha && (
                            <div
                              className="rounded-lg border-l-2 px-3 py-2"
                              style={{
                                borderColor: concluido ? 'var(--status-good)' : 'var(--status-serious)',
                                background: concluido
                                  ? 'color-mix(in srgb, var(--status-good) 6%, transparent)'
                                  : 'color-mix(in srgb, var(--status-serious) 9%, transparent)',
                              }}
                            >
                              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'var(--ink-muted)' }}>
                                <MessageSquareText className="h-3 w-3" />
                                {obsLinha.label === 'Demanda' ? 'Demanda' : 'Observação — ação necessária'}
                              </span>
                              <p className="text-[13px] leading-snug whitespace-pre-wrap break-words" style={{ color: 'var(--ink-primary)' }}>
                                {obsLinha.value}
                              </p>
                            </div>
                          )}
                          {gridLinha.length > 0 && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                              {gridLinha.map(f => (
                                <div key={f.label} className="min-w-0">
                                  <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--ink-muted)' }}>{f.label}</span>
                                  <span className="text-[12px] break-words" style={{ color: 'var(--ink-primary)' }}>{f.value}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {l.modelo === 'ajuste_pedido' && (
                            <ImagensAjustePedido paths={caminhosImagem(l)} />
                          )}
                          {concluido && (
                            <p className="text-[12px]" style={{ color: 'var(--status-good)' }}>
                              Baixado{l.resolvido_em ? ` em ${formatDateTimeBR(l.resolvido_em)}` : ''}
                              {l.resolucao ? ` · ${l.resolucao}` : ''}
                            </p>
                          )}
                        </div>

                        {/* Ações por Linha */}
                        <div className="flex items-center gap-2">
                          {concluido ? (
                            <button
                              type="button"
                              onClick={() => handleReabrir(l.id)}
                              disabled={salvandoId === l.id}
                              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-bold cursor-pointer disabled:opacity-50 transition-colors hover:bg-[var(--surface-raised)]"
                              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                            </button>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="Resolução (opcional)"
                                value={resolucoes[l.id] || ''}
                                onChange={(e) => setResolucoes(prev => ({ ...prev, [l.id]: e.target.value }))}
                                className="rounded-lg border py-1.5 px-2.5 text-[12px] w-44 sm:w-56 transition-colors focus:outline-2 focus:outline-offset-1"
                                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                              />
                              <button
                                type="button"
                                onClick={() => handleConcluir(l, g)}
                                disabled={salvandoId === l.id || salvandoLote}
                                title="Concluir esta nota e abrir e-mail no Outlook para victor.oliveira@ten.ind.br"
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-white cursor-pointer disabled:opacity-50 transition-transform active:scale-[0.98] shadow-xs"
                                style={{ background: 'var(--brand)' }}
                              >
                                {salvandoId === l.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-3.5 w-3.5" />
                                    <Mail className="h-3.5 w-3.5 opacity-80" />
                                  </>
                                )}
                                Concluir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Barra Flutuante de Ação em Lote */}
      {aba === 'fila' && selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-3xl w-[calc(100%-2rem)] bg-slate-900/95 dark:bg-slate-900/95 backdrop-blur-md text-white border border-slate-700 shadow-2xl rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold shrink-0">
              {selectedIds.size} selecionado(s)
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-400 hover:text-white underline cursor-pointer shrink-0"
            >
              Desmarcar
            </button>
          </div>

          <div className="flex flex-1 items-center gap-2 min-w-0">
            <input
              type="text"
              placeholder="Resolução em lote (opcional para todos)"
              value={resolucaoLote}
              onChange={(e) => setResolucaoLote(e.target.value)}
              className="flex-1 min-w-0 rounded-xl bg-slate-800 border border-slate-700 text-xs px-3 py-2 text-white placeholder-slate-400 focus:outline-blue-500"
            />
            <button
              type="button"
              onClick={handleConcluirEmLote}
              disabled={salvandoLote}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-transform active:scale-95 shrink-0 shadow-md cursor-pointer"
            >
              {salvandoLote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <Mail className="h-4 w-4" />
                </>
              )}
              Concluir {selectedIds.size} e Abrir Outlook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Requisição no Balcão (FRM.ALM-0014).
 *
 * Substitui a folha "Formulário de Retirada de Materiais do Almoxarifado"
 * preenchida à mão. O almoxarife registra cada atendimento: quem retira
 * (`rh_pessoas`), para qual aplicação (centro de custo/PEP da lista fixa
 * `alm_balcao_aplicacoes`), se é saída ou transferência, e os itens — só os
 * que têm saldo na ZL0024. O depósito de saída vem do primeiro item escolhido.
 *
 * As requisições salvas saem numa planilha de baixa para o SAP (mesmo
 * processo do Abrir RM: seleciona, exporta, o lote fica no histórico e pode
 * ser reaberto). Depois de lançar no SAP, o almoxarife informa o nº do
 * documento (antes, "Baixa nº ..." no rodapé da folha).
 *
 * Feito para velocidade no balcão: tipo e turno ficam lembrados entre
 * requisições, a busca de material aceita código ou descrição e o Enter
 * percorre busca → quantidade → adicionar.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowLeftRight, Check, ChevronDown, Download, FileCheck2, History, Loader2, LogOut, Plus,
  RefreshCw, RotateCcw, Search, Trash2, Upload, User, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { localDb } from '../../db/localDb';
import {
  DEPOSITO_DESCRICAO, formatDeposito, isDepositoInativo, ordenarDepositos,
} from '../../lib/almoxarifado';
import {
  PREFIXO_REQ_BALCAO, ROTULO_TIPO_MOVIMENTO, adicionarLinha, buscarMateriaisEmDepositos, chaveDeposito, erroDaLinha,
  indexarEstoquePorDeposito, reaplicarSaldos, ultimaAplicacaoPorColaborador,
  validarRequisicao, type LinhaBalcao, type MaterialDisponivel, type MaterialNoDeposito, type PepAplicacao, type TipoMovimentoBalcao,
} from '../../lib/requisicaoBalcao';
import {
  excluirRequisicaoBalcao, importarSapBalcao, informarDocSap, listarAlteracoesBalcao, listarAplicacoesBalcao,
  listarExportacoesBalcao, listarRequisicoesBalcao, reabrirExportacaoBalcao, registrarExportacaoBalcao,
  salvarRequisicaoBalcao,
  type ReqBalcaoAlteracao, type ReqBalcaoExportacao, type ReqBalcaoRow,
} from '../../lib/requisicaoBalcaoApi';
import {
  classificarImportacao, exportarPlanilhaBalcao, lerPlanilhaBalcaoConcluida,
  type LeituraPlanilhaBalcao, type SituacaoImportacao,
} from '../../lib/requisicaoBalcaoPlanilha';
import { listarRhPessoas, listarRhTurnos } from '../../lib/rhApi';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import type { EstoqueItem, Profile, RhPessoa, RhTurno } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm font-medium focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

function Campo({ rotulo, children, obrigatorio }: { rotulo: string; children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>
        {rotulo} {obrigatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Tipo/turno/destino lembrados entre requisições — conveniência do aparelho do balcão.
// O depósito não: ele vem do primeiro item escolhido.
const CHAVE_PREFERENCIAS = 'sisten_req_balcao_cabecalho';
interface Preferencias { tipo: TipoMovimentoBalcao; turno: string; destino: string }

function lerPreferencias(): Partial<Preferencias> {
  try { return JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}'); } catch { return {}; }
}
function gravarPreferencias(p: Preferencias): void {
  try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p)); } catch { /* sem storage: só não lembra */ }
}

type FiltroExportacao = 'nao_exportadas' | 'exportadas' | 'todas';
const ROTULO_FILTRO_EXPORTACAO: Record<FiltroExportacao, string> = {
  nao_exportadas: 'Não exportadas',
  exportadas: 'Exportadas',
  todas: 'Todas',
};

// ===========================================================================
// Tela
// ===========================================================================

export default function RequisicaoBalcao({ user, onNavigate }: Props) {
  const toast = useToast();
  const [requisicoes, setRequisicoes] = useState<ReqBalcaoRow[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [pessoas, setPessoas] = useState<RhPessoa[]>([]);
  const [peps, setPeps] = useState<PepAplicacao[]>([]);
  const [turnos, setTurnos] = useState<RhTurno[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ registro?: ReqBalcaoRow } | null>(null);
  const [detalhe, setDetalhe] = useState<ReqBalcaoRow | null>(null);
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [docSapAberto, setDocSapAberto] = useState<string[] | null>(null);
  const [filtroExportacao, setFiltroExportacao] = useState<FiltroExportacao>('nao_exportadas');
  const [exportacoes, setExportacoes] = useState<ReqBalcaoExportacao[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [importacao, setImportacao] = useState<{ arquivo: string; leitura: LeituraPlanilhaBalcao } | null>(null);
  const arquivoImportRef = useRef<HTMLInputElement>(null);

  const recarregarRequisicoes = useCallback(async () => {
    try {
      const [reqs, lotes] = await Promise.all([
        listarRequisicoesBalcao(),
        listarExportacoesBalcao().catch(() => [] as ReqBalcaoExportacao[]),
      ]);
      setRequisicoes(reqs);
      setExportacoes(lotes);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar as requisições.');
    }
  }, [toast]);

  const recarregar = useCallback(async (forcarEstoque = false) => {
    setLoading(true);
    try {
      const [est, pes, pep, tur] = await Promise.all([
        localDb.fetchEstoque(forcarEstoque),
        listarRhPessoas().catch(() => [] as RhPessoa[]),
        listarAplicacoesBalcao().catch(() => [] as PepAplicacao[]),
        listarRhTurnos().catch(() => [] as RhTurno[]),
        recarregarRequisicoes(),
      ]);
      setEstoque(est);
      setPessoas(pes.filter((p) => p.ativo));
      setPeps(pep);
      setTurnos(tur);
    } finally {
      setLoading(false);
    }
  }, [recarregarRequisicoes]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const estoquePorDeposito = useMemo(() => indexarEstoquePorDeposito(estoque), [estoque]);
  const importadoEm = useMemo(
    () => estoque.reduce<string | undefined>((max, r) => (r.imported_at && (!max || r.imported_at > max) ? r.imported_at : max), undefined),
    [estoque],
  );

  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    return requisicoes.filter((r) => {
      if (soPendentes && r.doc_sap) return false;
      if (filtroExportacao === 'nao_exportadas' && r.exportacao_id) return false;
      if (filtroExportacao === 'exportadas' && !r.exportacao_id) return false;
      if (!t) return true;
      const alvo = semAcento([
        r.codigo, r.colaborador_nome, r.colaborador_registro, r.aplicacao_pep, r.aplicacao, r.doc_sap, r.deposito_origem,
        ...r.itens.flatMap((i) => [i.material, i.descricao]),
      ].filter(Boolean).join(' '));
      return t.split(/\s+/).every((p) => alvo.includes(p));
    });
  }, [requisicoes, busca, soPendentes, filtroExportacao]);

  const porDia = useMemo(() => {
    const grupos = new Map<string, ReqBalcaoRow[]>();
    for (const r of filtradas) {
      const lista = grupos.get(r.data) ?? [];
      lista.push(r);
      grupos.set(r.data, lista);
    }
    return [...grupos.entries()];
  }, [filtradas]);

  const hoje = hojeISO();
  const qtdHoje = requisicoes.filter((r) => r.data === hoje).length;
  const qtdPendentes = requisicoes.filter((r) => !r.doc_sap).length;
  const qtdNaoExportadas = requisicoes.filter((r) => !r.exportacao_id).length;
  const contagemFiltro: Record<FiltroExportacao, number> = {
    nao_exportadas: qtdNaoExportadas,
    exportadas: requisicoes.length - qtdNaoExportadas,
    todas: requisicoes.length,
  };

  const exportar = async () => {
    const sel = requisicoes.filter((r) => selecionadas.has(r.id));
    if (sel.length === 0) return;
    const jaExportadas = sel.filter((r) => r.exportacao_id).length;
    if (jaExportadas > 0
        && !window.confirm(`${jaExportadas} das selecionadas já foram exportadas. Exportar de novo mesmo assim?`)) return;
    setExportando(true);
    try {
      const { arquivo, linhas } = exportarPlanilhaBalcao(sel);
      await registrarExportacaoBalcao(sel.map((r) => r.id), arquivo, user.name);
      toast.success(`${arquivo}: ${sel.length} requisição(ões), ${linhas} linha(s).`);
      setSelecionadas(new Set());
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'A planilha foi gerada, mas o registro da exportação falhou.');
    } finally {
      setExportando(false);
    }
  };

  const lerArquivoImportacao = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
      setImportacao({ arquivo: file.name, leitura: lerPlanilhaBalcaoConcluida(matriz) });
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ler a planilha.');
    } finally {
      if (arquivoImportRef.current) arquivoImportRef.current.value = '';
    }
  };

  const reabrir = async (ids: string[], rotulo: string) => {
    if (ids.length === 0) return;
    if (!window.confirm(`Reabrir ${rotulo}? Volta para "Não exportadas" e poderá ser editada e exportada de novo.`)) return;
    try {
      const n = await reabrirExportacaoBalcao(ids);
      toast.success(`${n} requisição(ões) de volta à fila de exportação.`);
      setDetalhe(null);
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao reabrir.');
    }
  };

  const alternarSelecao = (ids: string[], marcar: boolean) => {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  };

  /**
   * Requisição exportada não se altera (a planilha já saiu com ela). Em vez de
   * esconder o botão, pergunta e reabre a exportação antes — é o que o
   * almoxarife faria em dois passos.
   */
  const liberarExportada = async (r: ReqBalcaoRow, acao: string): Promise<boolean> => {
    if (!r.exportacao_id) return true;
    if (!window.confirm(`${r.codigo} já foi exportada. Para ${acao}, ela volta para "Não exportadas" e precisará ser exportada de novo. Continuar?`)) return false;
    try {
      await reabrirExportacaoBalcao([r.id]);
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao reabrir a exportação.');
      return false;
    }
  };

  const editar = async (r: ReqBalcaoRow) => {
    if (!(await liberarExportada(r, 'editar'))) return;
    setDetalhe(null);
    setForm({ registro: { ...r, exportacao_id: null } });
    if (r.exportacao_id) void recarregarRequisicoes();
  };

  const excluir = async (r: ReqBalcaoRow) => {
    if (!r.exportacao_id && !window.confirm(`Excluir a requisição ${r.codigo}? Sai da tela, mas permanece no banco.`)) return;
    if (!(await liberarExportada(r, 'excluir'))) return;
    try {
      await excluirRequisicaoBalcao(r.id, user.name);
      toast.success(`${r.codigo} excluída.`);
      setDetalhe(null);
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao excluir.');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado')}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Voltar para Almoxarifado
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>Requisição no Balcão</h1>
            <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)', color: 'var(--ink-muted)' }}>
              FRM.ALM-0014
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            Retirada de material do estoque (ZL0024) por colaborador e aplicação.
            {importadoEm && <> Saldos importados em {formatDateTimeBR(importadoEm)}.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void recarregar(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <input
            ref={arquivoImportRef}
            type="file"
            accept=".xlsx,.xls,.xlsm"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerArquivoImportacao(f); }}
          />
          <button
            onClick={() => arquivoImportRef.current?.click()}
            title="Planilha exportada daqui, devolvida com o nº do documento SAP na última coluna"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <Upload className="h-3.5 w-3.5" /> Importar planilha concluída
          </button>
          <button
            onClick={() => setForm({})}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="h-4 w-4" /> Nova requisição
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Indicador rotulo="Requisições hoje" valor={qtdHoje} />
        <Indicador
          rotulo="Não exportadas"
          valor={qtdNaoExportadas}
          destaque={qtdNaoExportadas > 0}
          onClick={() => setFiltroExportacao('nao_exportadas')}
          ativo={filtroExportacao === 'nao_exportadas'}
        />
        <Indicador
          rotulo="Sem documento SAP"
          valor={qtdPendentes}
          destaque={qtdPendentes > 0}
          onClick={() => setSoPendentes((v) => !v)}
          ativo={soPendentes}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }}>
          {(Object.keys(ROTULO_FILTRO_EXPORTACAO) as FiltroExportacao[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroExportacao(f)}
              className="rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={filtroExportacao === f ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
            >
              {ROTULO_FILTRO_EXPORTACAO[f]} ({contagemFiltro[f]})
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por código, colaborador, aplicação, material ou doc. SAP"
            className={`${inputCls} pl-8 text-xs`}
          />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={soPendentes} onChange={(e) => setSoPendentes(e.target.checked)} />
          Só sem doc. SAP
        </label>
      </div>

      {selecionadas.size > 0 && (
        <div
          className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-sm"
          style={{ borderColor: 'var(--brand)', background: 'var(--surface-raised)' }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
            {selecionadas.size} requisição(ões) selecionada(s)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSelecionadas(new Set())} className="text-[11px] font-bold hover:underline" style={{ color: 'var(--ink-muted)' }}>
              Limpar
            </button>
            <button
              onClick={() => setDocSapAberto([...selecionadas])}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold"
              style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
            >
              <FileCheck2 className="h-3.5 w-3.5" /> Informar doc. SAP
            </button>
            <button
              onClick={() => void exportar()}
              disabled={exportando}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Exportar planilha
            </button>
          </div>
        </div>
      )}

      {loading && requisicoes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : porDia.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {requisicoes.length === 0 ? 'Nenhuma requisição registrada ainda.' : 'Nada encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="space-y-5">
          {porDia.map(([data, lista]) => {
            const idsDia = lista.map((r) => r.id);
            const todasMarcadas = idsDia.every((id) => selecionadas.has(id));
            return (
              <section key={data} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1" style={{ borderColor: 'var(--hairline)' }}>
                  <h2 className="text-xs font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-secondary)' }}>
                    {data === hoje ? 'Hoje' : formatDateBR(data)} · {lista.length} requisição(ões)
                  </h2>
                  <button
                    onClick={() => alternarSelecao(idsDia, !todasMarcadas)}
                    className="text-[11px] font-bold hover:underline"
                    style={{ color: 'var(--brand)' }}
                  >
                    {todasMarcadas ? 'Desmarcar o dia' : `Selecionar o dia (${idsDia.length})`}
                  </button>
                </div>
                {lista.map((r) => (
                  <CartaoRequisicao
                    key={r.id}
                    r={r}
                    selecionada={selecionadas.has(r.id)}
                    podeEditar={podeEditarFormulario(user, r)}
                    onSelecionar={(v) => alternarSelecao([r.id], v)}
                    onAbrir={() => setDetalhe(r)}
                    onEditar={() => void editar(r)}
                    onExcluir={() => void excluir(r)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}

      <HistoricoExportacoes
        aberto={historicoAberto}
        onAlternar={() => setHistoricoAberto((v) => !v)}
        exportacoes={exportacoes}
        requisicoes={requisicoes}
        onReabrir={(lote, ids) => void reabrir(ids, `o lote ${lote.arquivo} (${ids.length} requisição(ões))`)}
      />

      {form && (
        <ModalRequisicao
          user={user}
          registro={form.registro}
          estoquePorDeposito={estoquePorDeposito}
          pessoas={pessoas}
          peps={peps}
          turnos={turnos}
          historico={requisicoes}
          onClose={() => setForm(null)}
          onSalvo={async (continuar) => {
            if (!continuar) setForm(null);
            await recarregarRequisicoes();
          }}
        />
      )}

      {detalhe && (
        <ModalDetalhe
          r={detalhe}
          podeEditar={podeEditarFormulario(user, detalhe)}
          exportacao={exportacoes.find((e) => e.id === detalhe.exportacao_id) ?? null}
          onReabrir={() => void reabrir([detalhe.id], detalhe.codigo)}
          onClose={() => setDetalhe(null)}
          onEditar={() => void editar(detalhe)}
          onExcluir={() => void excluir(detalhe)}
          onDocSap={() => setDocSapAberto([detalhe.id])}
        />
      )}

      {importacao && (
        <ModalImportacaoSap
          arquivo={importacao.arquivo}
          leitura={importacao.leitura}
          requisicoes={requisicoes}
          onClose={() => setImportacao(null)}
          onConfirmar={async (linhas) => {
            try {
              const r = await importarSapBalcao(
                linhas.map((l) => ({ codigo: l.codigo, material: l.material, doc_sap: l.docSap, status: l.status })),
                importacao.arquivo,
                user.name,
              );
              toast.success(`Doc. SAP gravado em ${r.itens} item(ns) de ${r.requisicoes} requisição(ões).`);
              if (r.nao_encontrados?.length) toast.error(`Não encontrados: ${r.nao_encontrados.join(', ')}`);
              setImportacao(null);
              await recarregarRequisicoes();
            } catch (err: any) {
              toast.error(err?.message || 'Falha ao importar.');
            }
          }}
        />
      )}

      {docSapAberto && (
        <ModalDocSap
          quantidade={docSapAberto.length}
          atual={docSapAberto.length === 1 ? requisicoes.find((r) => r.id === docSapAberto[0])?.doc_sap ?? '' : ''}
          onClose={() => setDocSapAberto(null)}
          onSalvar={async (doc) => {
            try {
              const n = await informarDocSap(docSapAberto, doc, user.name);
              toast.success(doc ? `Doc. SAP ${doc} informado em ${n} requisição(ões).` : 'Doc. SAP removido.');
              setDocSapAberto(null);
              setSelecionadas(new Set());
              setDetalhe(null);
              await recarregarRequisicoes();
            } catch (err: any) {
              toast.error(err?.message || 'Falha ao gravar o doc. SAP.');
            }
          }}
        />
      )}
    </div>
  );
}

function Indicador({
  rotulo, valor, destaque, onClick, ativo,
}: { rotulo: string; valor: number; destaque?: boolean; onClick?: () => void; ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-xl border px-4 py-3 text-left disabled:cursor-default"
      style={{
        borderColor: ativo ? 'var(--brand)' : 'var(--hairline)',
        background: 'var(--surface-raised)',
      }}
    >
      <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      <span className="block text-2xl font-extrabold tabular-nums" style={{ color: destaque ? 'var(--status-serious)' : 'var(--ink-primary)' }}>
        {valor}
      </span>
    </button>
  );
}

function ChipTipo({ tipo }: { tipo: TipoMovimentoBalcao }) {
  const Icon = tipo === 'saida' ? LogOut : ArrowLeftRight;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
    >
      <Icon className="h-3 w-3" /> {ROTULO_TIPO_MOVIMENTO[tipo]}
    </span>
  );
}

function ChipDocSap({ doc }: { doc: string | null }) {
  const token = doc ? 'var(--status-good)' : 'var(--status-serious)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${token} 14%, transparent)`, color: token }}
    >
      {doc ? <><Check className="h-3 w-3" /> SAP {doc}</> : 'Sem doc. SAP'}
    </span>
  );
}

function ChipExportada() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: 'color-mix(in srgb, var(--ink-muted) 14%, transparent)', color: 'var(--ink-secondary)' }}
    >
      <Download className="h-3 w-3" /> Exportada
    </span>
  );
}

function CartaoRequisicao({
  r, selecionada, podeEditar, onSelecionar, onAbrir, onEditar, onExcluir,
}: {
  r: ReqBalcaoRow;
  selecionada: boolean;
  podeEditar: boolean;
  onSelecionar: (v: boolean) => void;
  onAbrir: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const acao = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div
      onClick={onAbrir}
      className="flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors hover:border-[var(--brand)]"
      style={{ borderColor: selecionada ? 'var(--brand)' : 'var(--hairline)', background: 'var(--surface-raised)' }}
    >
      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          aria-label={`Selecionar ${r.codigo}`}
          checked={selecionada}
          onChange={(e) => onSelecionar(e.target.checked)}
          className="h-4 w-4 cursor-pointer"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{r.codigo}</span>
          <ChipTipo tipo={r.tipo_movimento} />
          <ChipDocSap doc={r.doc_sap} />
          {r.exportacao_id && <ChipExportada />}
        </div>
        <div className="text-sm font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
          {r.colaborador_nome}
          <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>
            {' · '}{r.aplicacao}
          </span>
        </div>
        <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Dep. {formatDeposito(r.deposito_origem)}
          {r.deposito_destino && <> → {formatDeposito(r.deposito_destino)}</>}
          {' · '}{r.itens.length} item(ns)
          {r.turno && <> · {r.turno}</>}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'var(--ink-secondary)' }}>
          {r.itens.map((i) => `${formatQtd(i.quantidade)} ${i.unidade ?? ''} ${i.descricao ?? i.material}`).join(' · ')}
        </div>
        <div className="flex gap-4 pt-1">
          <button onClick={acao(onAbrir)} className="text-[11px] font-bold hover:underline" style={{ color: 'var(--ink-muted)' }}>Detalhes</button>
          {podeEditar && (
            <>
              <button onClick={acao(onEditar)} className="text-[11px] font-bold hover:underline" style={{ color: 'var(--brand)' }}>Editar</button>
              <button onClick={acao(onExcluir)} className="text-[11px] font-bold hover:underline" style={{ color: 'var(--status-critical)' }}>Excluir</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Formulário
// ===========================================================================

function ModalRequisicao({
  user, registro, estoquePorDeposito, pessoas, peps, turnos, historico, onClose, onSalvo,
}: {
  user: Profile;
  registro?: ReqBalcaoRow;
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>;
  pessoas: RhPessoa[];
  peps: PepAplicacao[];
  turnos: RhTurno[];
  historico: ReqBalcaoRow[];
  onClose: () => void;
  onSalvo: (continuar: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const pref = useMemo(lerPreferencias, []);

  const [data, setData] = useState(registro?.data ?? hojeISO());
  const [turno, setTurno] = useState(registro?.turno ?? pref.turno ?? '');
  const [tipo, setTipo] = useState<TipoMovimentoBalcao>(registro?.tipo_movimento ?? pref.tipo ?? 'saida');
  // Vem do primeiro item escolhido (a busca de material já traz o depósito).
  const [deposito, setDeposito] = useState(() => (registro ? chaveDeposito(registro.deposito_origem) : ''));
  const [destino, setDestino] = useState(registro?.deposito_destino ?? pref.destino ?? '');
  const [colaborador, setColaborador] = useState<{ id: string | null; nome: string; registro: string | null }>(
    registro
      ? { id: registro.colaborador_id, nome: registro.colaborador_nome, registro: registro.colaborador_registro }
      : { id: null, nome: '', registro: null },
  );
  const [aplicacao, setAplicacao] = useState<PepAplicacao | null>(
    registro?.aplicacao_pep ? { wbs: registro.aplicacao_pep, nome: registro.aplicacao } : null,
  );
  const [observacao, setObservacao] = useState(registro?.observacao ?? '');
  const [linhas, setLinhas] = useState<LinhaBalcao[]>(() =>
    (registro?.itens ?? []).map((i) => ({
      material: i.material,
      descricao: i.descricao ?? '',
      unidade: i.unidade ?? '',
      quantidade: Number(i.quantidade),
      saldo: estoquePorDeposito.get(chaveDeposito(registro!.deposito_origem))?.get(i.material)?.saldo ?? 0,
    })),
  );
  const [salvando, setSalvando] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const disponiveis = estoquePorDeposito.get(deposito);
  const ultimaAplicacao = useMemo(() => ultimaAplicacaoPorColaborador(historico), [historico]);
  const buscaMaterialRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLinhas((l) => reaplicarSaldos(l, disponiveis)); }, [disponiveis]);
  // Removeu todos os itens: libera o depósito para o próximo item escolher.
  useEffect(() => { if (linhas.length === 0 && !registro) setDeposito(''); }, [linhas.length, registro]);

  const destinosPossiveis = useMemo(
    () => ordenarDepositos(Object.keys(DEPOSITO_DESCRICAO).filter((d) => !isDepositoInativo(d) && d !== deposito)),
    [deposito],
  );

  const erros = validarRequisicao(
    { tipoMovimento: tipo, depositoOrigem: deposito, depositoDestino: destino, colaboradorNome: colaborador.nome, aplicacao: aplicacao?.wbs ?? '' },
    linhas,
  );

  const escolherColaborador = (p: { id: string | null; nome: string; registro: string | null }) => {
    setColaborador(p);
    if (p.id && !aplicacao) {
      const ult = ultimaAplicacao.get(p.id);
      if (ult) setAplicacao(ult);
    }
  };

  const salvar = async (continuar: boolean) => {
    setTentouSalvar(true);
    if (erros.length > 0) {
      toast.error(erros[0]);
      return;
    }
    setSalvando(true);
    try {
      const codigo = await salvarRequisicaoBalcao(
        registro?.id ?? null,
        {
          data,
          turno: turno || null,
          tipo_movimento: tipo,
          deposito_origem: deposito,
          deposito_destino: tipo === 'transferencia' ? destino || null : null,
          colaborador_id: colaborador.id,
          colaborador_nome: colaborador.nome,
          colaborador_registro: colaborador.registro,
          aplicacao_pep: aplicacao!.wbs,
          observacao: observacao || null,
          criado_por_nome: user.name,
        },
        linhas.map((l) => ({ material: l.material, quantidade: l.quantidade })),
      );
      gravarPreferencias({ tipo, turno, destino });
      toast.success(registro ? `${codigo} atualizada.` : `${codigo} registrada.`);
      await onSalvo(continuar);
      if (continuar) {
        // Mantém o cabeçalho do balcão; limpa quem retirou e o que retirou.
        setColaborador({ id: null, nome: '', registro: null });
        setAplicacao(null);
        setObservacao('');
        setLinhas([]);
        setTentouSalvar(false);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar a requisição.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Requisição no balcão" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          {registro ? `Editar ${registro.codigo}` : 'Nova requisição no balcão'}
        </h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {registro ? 'Os itens serão regravados com o saldo atual da ZL0024.' : `Código ${PREFIXO_REQ_BALCAO}-DDMMAA-NN gerado ao salvar.`}
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          {/* Movimento */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Tipo de movimento" obrigatorio>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)' }}>
                {(['saida', 'transferencia'] as TipoMovimentoBalcao[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="rounded-md py-1.5 text-xs font-bold transition-colors"
                    style={tipo === t
                      ? { background: 'var(--brand)', color: 'white' }
                      : { color: 'var(--ink-secondary)' }}
                  >
                    {ROTULO_TIPO_MOVIMENTO[t]}
                  </button>
                ))}
              </div>
            </Campo>
            <Campo rotulo="Data" obrigatorio>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Turno">
              <select value={turno} onChange={(e) => setTurno(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {turnos.map((t) => <option key={t.id} value={t.nome}>{t.nome}</option>)}
              </select>
            </Campo>
          </div>

          {tipo === 'transferencia' && (
            <Campo rotulo="Depósito de destino">
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className={inputCls}>
                <option value="">Definir no SAP</option>
                {destinosPossiveis.map((d) => <option key={d} value={d}>{formatDeposito(d)}</option>)}
              </select>
            </Campo>
          )}

          {/* Quem e para quê */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Colaborador que retira" obrigatorio>
              <SeletorColaborador pessoas={pessoas} valor={colaborador} onChange={escolherColaborador} />
            </Campo>
            <Campo rotulo="Aplicação (centro de custo / PEP)" obrigatorio>
              <select
                value={aplicacao?.wbs ?? ''}
                onChange={(e) => setAplicacao(peps.find((p) => p.wbs === e.target.value) ?? null)}
                className={inputCls}
              >
                <option value="">Selecione…</option>
                {aplicacao && !peps.some((p) => p.wbs === aplicacao.wbs) && (
                  <option value={aplicacao.wbs}>{aplicacao.nome} — {aplicacao.wbs}</option>
                )}
                {peps.map((p) => <option key={p.wbs} value={p.wbs}>{p.nome} — {p.wbs}</option>)}
              </select>
            </Campo>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                Itens <span className="text-rose-500">*</span>
              </span>
              {linhas.length > 0 && (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                  {linhas.length} item(ns) · saída do depósito {formatDeposito(deposito)}
                </span>
              )}
            </div>
            <AdicionarItem
              refBusca={buscaMaterialRef}
              estoquePorDeposito={estoquePorDeposito}
              // Sem itens, busca em todos os depósitos e o item escolhido define o
              // depósito de saída; depois do primeiro, fica presa a ele.
              depositoFixo={linhas.length > 0 ? deposito : null}
              jaLancado={(m) => linhas.find((l) => l.material === m)?.quantidade ?? 0}
              onAdicionar={(item, qtd) => {
                if (item.deposito !== deposito) setDeposito(item.deposito);
                setLinhas((l) => adicionarLinha(l, item, qtd));
              }}
            />

            {linhas.length > 0 && (
              <div className="divide-y rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                {linhas.map((l, i) => {
                  const erro = erroDaLinha(l);
                  return (
                    <div key={l.material} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                      <span className="w-5 text-[11px] font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>{i + 1}</span>
                      <div className="min-w-0 flex-1 basis-48">
                        <div className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.descricao || l.material}</div>
                        <div className="text-[11px]" style={{ color: erro ? 'var(--status-critical)' : 'var(--ink-muted)' }}>
                          <span className="font-mono">{l.material}</span> · saldo {formatQtd(l.saldo)} {l.unidade}
                          {erro && <> · {erro}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={Number.isFinite(l.quantidade) ? l.quantidade : ''}
                          onChange={(e) => {
                            const q = parseFloat(e.target.value);
                            setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, quantidade: q } : x)));
                          }}
                          aria-label={`Quantidade de ${l.material}`}
                          className={`${inputCls} w-24 text-right tabular-nums`}
                          style={erro ? { borderColor: 'var(--status-critical)' } : undefined}
                        />
                        <span className="w-8 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{l.unidade}</span>
                        <button
                          type="button"
                          onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                          aria-label={`Remover ${l.material}`}
                          className="rounded-md p-1.5 hover:bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)]"
                          style={{ color: 'var(--status-critical)' }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Campo rotulo="Observação">
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls} />
          </Campo>

          {tentouSalvar && erros.length > 0 && (
            <ul className="rounded-lg px-3 py-2 text-xs space-y-0.5" style={{ background: 'color-mix(in srgb, var(--status-critical) 10%, transparent)', color: 'var(--status-critical)' }}>
              {erros.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            Cancelar
          </button>
          {!registro && (
            <button
              onClick={() => void salvar(true)}
              disabled={salvando}
              className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
            >
              Salvar e nova
            </button>
          )}
          <button
            onClick={() => void salvar(false)}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Busca de colaborador em `rh_pessoas` por nome ou matrícula. Aceita nome
 * digitado de quem ainda não está no cadastro (terceiro, recém-admitido) —
 * mesmo desenho da ASE: sem `id`, com o nome gravado.
 */
function SeletorColaborador({
  pessoas, valor, onChange,
}: {
  pessoas: RhPessoa[];
  valor: { id: string | null; nome: string; registro: string | null };
  onChange: (v: { id: string | null; nome: string; registro: string | null }) => void;
}) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);

  const sugestoes = useMemo(() => {
    const t = semAcento(texto.trim());
    if (!t) return [];
    const termos = t.split(/\s+/);
    return pessoas
      .filter((p) => {
        const alvo = semAcento(`${p.nome} ${p.registro ?? ''} ${p.chave_nome ?? ''}`);
        return termos.every((x) => alvo.includes(x));
      })
      .slice(0, 8);
  }, [pessoas, texto]);

  if (valor.nome) {
    return (
      <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <User className="h-4 w-4 shrink-0" style={{ color: 'var(--ink-muted)' }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{valor.nome}</div>
          <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            {valor.id ? `Matrícula ${valor.registro ?? '—'}` : 'Não cadastrado no RH'}
          </div>
        </div>
        <button type="button" onClick={() => { onChange({ id: null, nome: '', registro: null }); setTexto(''); }} aria-label="Trocar colaborador" className="p-1" style={{ color: 'var(--ink-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const escolher = (i: number) => {
    const p = sugestoes[i];
    if (p) onChange({ id: p.id, nome: p.nome, registro: p.registro });
    else if (texto.trim()) onChange({ id: null, nome: texto.trim().toUpperCase(), registro: null });
    setAberto(false);
  };

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); escolher(ativo); }
        }}
        placeholder="Nome ou matrícula"
        className={inputCls}
      />
      {aberto && texto.trim() && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {sugestoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); escolher(i); }}
                className="block w-full px-3 py-2 text-left text-xs"
                style={{ background: i === ativo ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined, color: 'var(--ink-primary)' }}
              >
                <span className="font-bold">{p.nome}</span>
                <span style={{ color: 'var(--ink-muted)' }}> · {p.registro}{p.cargo ? ` · ${p.cargo}` : ''}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); escolher(sugestoes.length); }}
              className="block w-full px-3 py-2 text-left text-xs italic"
              style={{ background: ativo === sugestoes.length ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined, color: 'var(--ink-secondary)' }}
            >
              Usar “{texto.trim().toUpperCase()}” (não cadastrado)
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * Linha de entrada rápida: busca (código ou descrição) → Enter escolhe →
 * quantidade → Enter adiciona e devolve o foco à busca. O resultado mostra o
 * depósito de cada saldo; escolher o item preenche o depósito de saída.
 */
function AdicionarItem({
  refBusca, estoquePorDeposito, depositoFixo, jaLancado, onAdicionar,
}: {
  refBusca: React.RefObject<HTMLInputElement | null>;
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>;
  depositoFixo: string | null;
  jaLancado: (material: string) => number;
  onAdicionar: (item: MaterialNoDeposito, quantidade: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [escolhido, setEscolhido] = useState<MaterialNoDeposito | null>(null);
  const [qtd, setQtd] = useState('');
  const qtdRef = useRef<HTMLInputElement>(null);

  const resultados = useMemo(
    () => buscarMateriaisEmDepositos(estoquePorDeposito, texto, depositoFixo, isDepositoInativo),
    [estoquePorDeposito, texto, depositoFixo],
  );
  const totalMateriais = depositoFixo
    ? estoquePorDeposito.get(depositoFixo)?.size ?? 0
    : new Set([...estoquePorDeposito.values()].flatMap((m) => [...m.keys()])).size;

  const escolher = (m: MaterialNoDeposito | undefined) => {
    if (!m) return;
    setEscolhido(m);
    setTexto('');
    setAberto(false);
    setQtd('');
    setTimeout(() => qtdRef.current?.focus(), 0);
  };

  const quantidade = parseFloat(qtd.replace(',', '.'));
  const restante = escolhido ? escolhido.saldo - jaLancado(escolhido.material) : 0;
  const qtdInvalida = !(quantidade > 0) || quantidade > restante;

  const adicionar = () => {
    if (!escolhido || qtdInvalida) return;
    onAdicionar(escolhido, quantidade);
    setEscolhido(null);
    setQtd('');
    setTimeout(() => refBusca.current?.focus(), 0);
  };

  if (escolhido) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 5%, transparent)' }}>
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{escolhido.descricao}</div>
          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <span className="font-mono">{escolhido.material}</span> · Dep. {formatDeposito(escolhido.deposito)} · disponível {formatQtd(restante)} {escolhido.unidade}
          </div>
        </div>
        <input
          ref={qtdRef}
          type="text"
          inputMode="decimal"
          value={qtd}
          onChange={(e) => setQtd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); adicionar(); }
            if (e.key === 'Escape') { e.preventDefault(); setEscolhido(null); refBusca.current?.focus(); }
          }}
          placeholder="Qtd"
          aria-label="Quantidade"
          className={`${inputCls} w-24 text-right tabular-nums`}
          style={qtd && qtdInvalida ? { borderColor: 'var(--status-critical)' } : undefined}
        />
        <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{escolhido.unidade}</span>
        <button
          type="button"
          onClick={adicionar}
          disabled={qtdInvalida}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--brand)' }}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
        <button type="button" onClick={() => setEscolhido(null)} aria-label="Cancelar item" className="p-1.5" style={{ color: 'var(--ink-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
      <input
        ref={refBusca}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); escolher(resultados[ativo]); }
        }}
        placeholder={depositoFixo
          ? `Código ou descrição do material (${totalMateriais} com saldo em ${depositoFixo})`
          : `Código ou descrição do material (${totalMateriais} com saldo) — o depósito vem do item`}
        className={`${inputCls} pl-8`}
      />
      {aberto && texto.trim() && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
              {depositoFixo ? `Nenhum material com saldo no depósito ${depositoFixo}.` : 'Nenhum material com saldo na ZL0024.'}
            </li>
          ) : resultados.map((m, i) => (
            <li key={`${m.deposito}-${m.material}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); escolher(m); }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs"
                style={{ background: i === ativo ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined }}
              >
                <span className="min-w-0">
                  <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{m.material}</span>
                  <span style={{ color: 'var(--ink-secondary)' }}> · {m.descricao}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular-nums font-bold" style={{ color: 'var(--ink-muted)' }}>
                    {formatQtd(m.saldo)} {m.unidade}
                  </span>
                  <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{formatDeposito(m.deposito)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===========================================================================
// Histórico de exportações
// ===========================================================================

function HistoricoExportacoes({
  aberto, onAlternar, exportacoes, requisicoes, onReabrir,
}: {
  aberto: boolean;
  onAlternar: () => void;
  exportacoes: ReqBalcaoExportacao[];
  requisicoes: ReqBalcaoRow[];
  onReabrir: (lote: ReqBalcaoExportacao, ids: string[]) => void;
}) {
  if (exportacoes.length === 0) return null;
  return (
    <section className="rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <button type="button" onClick={onAlternar} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          Histórico de exportações ({exportacoes.length})
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} style={{ color: 'var(--ink-muted)' }} />
      </button>
      {aberto && (
        <ul className="divide-y border-t" style={{ borderColor: 'var(--hairline)' }}>
          {exportacoes.map((lote) => {
            // Só as que ainda estão neste lote — reabertas saíram dele.
            const vigentes = requisicoes.filter((r) => r.exportacao_id === lote.id).map((r) => r.id);
            return (
              <li key={lote.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" style={{ borderColor: 'var(--hairline)' }}>
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{lote.arquivo}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    {formatDateTimeBR(lote.created_at)} · {lote.exportado_por_nome ?? '—'} · {lote.total_requisicoes} requisição(ões), {lote.total_itens} item(ns)
                    {vigentes.length < lote.total_requisicoes && <> · {lote.total_requisicoes - vigentes.length} reaberta(s)</>}
                  </div>
                  <div className="truncate text-[10px] font-mono" style={{ color: 'var(--ink-muted)' }}>{lote.codigos.join(', ')}</div>
                </div>
                {vigentes.length > 0 && (
                  <button
                    onClick={() => onReabrir(lote, vigentes)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline"
                    style={{ color: 'var(--brand)' }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ===========================================================================
// Detalhe e doc. SAP
// ===========================================================================

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-xs">
      <span className="w-32 shrink-0 font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      <span className="min-w-0 flex-1" style={{ color: 'var(--ink-primary)' }}>{valor || '—'}</span>
    </div>
  );
}

function ModalDetalhe({
  r, podeEditar, exportacao, onClose, onEditar, onExcluir, onDocSap, onReabrir,
}: {
  r: ReqBalcaoRow;
  podeEditar: boolean;
  exportacao: ReqBalcaoExportacao | null;
  onReabrir: () => void;
  onClose: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onDocSap: () => void;
}) {
  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel={`Detalhes de ${r.codigo}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>{r.codigo}</h2>
          <ChipTipo tipo={r.tipo_movimento} />
          <ChipDocSap doc={r.doc_sap} />
          {r.exportacao_id && <ChipExportada />}
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div>
            <Linha rotulo="Data / turno" valor={`${formatDateBR(r.data)}${r.turno ? ` · ${r.turno}` : ''}`} />
            <Linha rotulo="Colaborador" valor={`${r.colaborador_nome}${r.colaborador_registro ? ` · ${r.colaborador_registro}` : ''}`} />
            <Linha rotulo="Aplicação (PEP)" valor={r.aplicacao_pep ? <>{r.aplicacao} · <span className="font-mono">{r.aplicacao_pep}</span></> : r.aplicacao} />
            <Linha rotulo="Depósito de saída" valor={formatDeposito(r.deposito_origem)} />
            {r.tipo_movimento === 'transferencia' && (
              <Linha rotulo="Depósito de destino" valor={r.deposito_destino ? formatDeposito(r.deposito_destino) : 'Definir no SAP'} />
            )}
            <Linha rotulo="Observação" valor={r.observacao} />
            <Linha rotulo="Doc. SAP" valor={r.doc_sap ? `${r.doc_sap} · ${r.doc_sap_por ?? ''} em ${formatDateTimeBR(r.doc_sap_em)}` : null} />
            <Linha rotulo="Registrado por" valor={`${r.criado_por_nome ?? '—'} em ${formatDateTimeBR(r.created_at)}`} />
            <Linha
              rotulo="Exportação"
              valor={exportacao ? `${exportacao.arquivo} · ${exportacao.exportado_por_nome ?? '—'} em ${formatDateTimeBR(exportacao.created_at)}` : r.exportacao_id ? 'Exportada' : 'Não exportada'}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--ink-muted)' }}>
                  <th className="px-3 py-2 text-left font-bold">#</th>
                  <th className="px-3 py-2 text-left font-bold">Código</th>
                  <th className="px-3 py-2 text-left font-bold">Descrição</th>
                  <th className="px-3 py-2 text-right font-bold">Qtd</th>
                  <th className="px-3 py-2 text-left font-bold">Un</th>
                  <th className="px-3 py-2 text-left font-bold">Doc. SAP</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i, n) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                    <td className="px-3 py-2 tabular-nums">{n + 1}</td>
                    <td className="px-3 py-2 font-mono">{i.material}</td>
                    <td className="px-3 py-2">{i.descricao}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{formatQtd(i.quantidade)}</td>
                    <td className="px-3 py-2">{i.unidade}</td>
                    <td className="px-3 py-2 font-mono">
                      {i.doc_sap ?? '—'}
                      {i.status_processamento && <span className="block font-sans text-[10px]" style={{ color: 'var(--ink-muted)' }}>{i.status_processamento}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <LogAlteracoes requisicaoId={r.id} />
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full flex-wrap justify-end gap-2">
          {r.exportacao_id && (
            <button onClick={onReabrir} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              <RotateCcw className="h-3.5 w-3.5" /> Reabrir exportação
            </button>
          )}
          {podeEditar && (
            <>
              <button onClick={onExcluir} className="rounded-lg px-3 py-2 text-xs font-bold" style={{ color: 'var(--status-critical)' }}>Excluir</button>
              <button onClick={onEditar} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Editar</button>
            </>
          )}
          <button onClick={onDocSap} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
            <FileCheck2 className="h-3.5 w-3.5" /> {r.doc_sap ? 'Alterar doc. SAP' : 'Informar doc. SAP'}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

const ROTULO_ACAO: Record<ReqBalcaoAlteracao['acao'], string> = {
  criacao: 'Criação',
  edicao: 'Edição',
  exclusao: 'Exclusão',
  doc_sap: 'Doc. SAP',
  exportacao: 'Exportação',
  reabertura: 'Reabertura',
  importacao_sap: 'Importação SAP',
};

/** Log de alterações da requisição — carregado ao abrir o detalhe. */
function LogAlteracoes({ requisicaoId }: { requisicaoId: string }) {
  const [log, setLog] = useState<ReqBalcaoAlteracao[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    listarAlteracoesBalcao(requisicaoId)
      .then((l) => { if (vivo) setLog(l); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Falha ao carregar o log.'); });
    return () => { vivo = false; };
  }, [requisicaoId]);

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
        <History className="h-3.5 w-3.5" /> Log de alterações
      </h3>
      {erro ? (
        <p className="text-[11px]" style={{ color: 'var(--status-critical)' }}>{erro}</p>
      ) : log === null ? (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando…</p>
      ) : log.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Nenhum registro (requisição anterior ao log).</p>
      ) : (
        <ol className="space-y-2">
          {log.map((a) => (
            <li key={a.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {ROTULO_ACAO[a.acao] ?? a.acao}{a.resumo && <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}> · {a.resumo}</span>}
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>{a.alterado_por_nome ?? '—'} · {formatDateTimeBR(a.created_at)}</span>
              </div>
              {a.alteracoes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {a.alteracoes.map((d, k) => (
                    <li key={k}>
                      <span className="font-semibold">{d.campo}:</span>{' '}
                      <span className="line-through" style={{ color: 'var(--ink-muted)' }}>{d.de ?? '—'}</span>
                      {' → '}<span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{d.para ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const ROTULO_SITUACAO: Record<SituacaoImportacao, { texto: string; token: string }> = {
  novo: { texto: 'Novo', token: 'var(--status-good)' },
  diferente: { texto: 'Substitui', token: 'var(--status-serious)' },
  igual: { texto: 'Já gravado', token: 'var(--ink-muted)' },
  nao_encontrado: { texto: 'Não encontrado', token: 'var(--status-critical)' },
};

/**
 * Prévia da importação: mostra o que cada linha faz antes de gravar. Só vão
 * para o banco as linhas "Novo" e "Substitui".
 */
function ModalImportacaoSap({
  arquivo, leitura, requisicoes, onClose, onConfirmar,
}: {
  arquivo: string;
  leitura: LeituraPlanilhaBalcao;
  requisicoes: ReqBalcaoRow[];
  onClose: () => void;
  onConfirmar: (linhas: LeituraPlanilhaBalcao['linhas']) => Promise<void>;
}) {
  const [gravando, setGravando] = useState(false);
  const classificadas = useMemo(() => classificarImportacao(leitura.linhas, requisicoes), [leitura, requisicoes]);
  const aGravar = classificadas.filter((l) => l.situacao === 'novo' || l.situacao === 'diferente');
  const conta = (s: SituacaoImportacao) => classificadas.filter((l) => l.situacao === s).length;

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Importar planilha concluída">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Importar planilha concluída</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {arquivo} · doc. SAP lido da coluna “{leitura.colunaSap}” · {leitura.totalLinhas} linha(s)
          {leitura.semDocSap > 0 && <> · {leitura.semDocSap} sem doc. SAP</>}
          {leitura.semCodigo > 0 && <> · {leitura.semCodigo} sem código RQB</>}
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(ROTULO_SITUACAO) as SituacaoImportacao[]).map((s) => (
            <span
              key={s}
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: `color-mix(in srgb, ${ROTULO_SITUACAO[s].token} 14%, transparent)`, color: ROTULO_SITUACAO[s].token }}
            >
              {ROTULO_SITUACAO[s].texto}: {conta(s)}
            </span>
          ))}
        </div>
        {classificadas.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhuma linha com doc. SAP para importar.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--ink-muted)' }}>
                  <th className="px-3 py-2 text-left font-bold">Requisição</th>
                  <th className="px-3 py-2 text-left font-bold">Material</th>
                  <th className="px-3 py-2 text-left font-bold">Doc. SAP</th>
                  <th className="px-3 py-2 text-left font-bold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {classificadas.map((l, k) => (
                  <tr key={k} className="border-t" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                    <td className="px-3 py-2 font-mono">{l.codigo}</td>
                    <td className="px-3 py-2 font-mono">{l.material}</td>
                    <td className="px-3 py-2 font-mono">
                      {l.situacao === 'diferente' && <span className="line-through mr-1" style={{ color: 'var(--ink-muted)' }}>{l.docAtual}</span>}
                      {l.docSap || '—'}
                      {l.status && <span className="block font-sans text-[10px]" style={{ color: 'var(--ink-muted)' }}>{l.status}</span>}
                    </td>
                    <td className="px-3 py-2 font-bold" style={{ color: ROTULO_SITUACAO[l.situacao].token }}>{ROTULO_SITUACAO[l.situacao].texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
          <button
            onClick={async () => { setGravando(true); try { await onConfirmar(aGravar); } finally { setGravando(false); } }}
            disabled={gravando || aGravar.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Gravar {aGravar.length} item(ns)
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

function ModalDocSap({
  quantidade, atual, onClose, onSalvar,
}: { quantidade: number; atual: string; onClose: () => void; onSalvar: (doc: string) => Promise<void> }) {
  const [doc, setDoc] = useState(atual);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try { await onSalvar(doc.trim()); } finally { setSalvando(false); }
  };
  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Documento SAP" zIndexClassName="z-[110]">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Documento SAP</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Nº do documento da baixa/transferência lançada no SAP para {quantidade} requisição(ões).
        </p>
      </ModalHeader>
      <ModalBody>
        <Campo rotulo="Nº do documento">
          <input
            autoFocus
            inputMode="numeric"
            value={doc}
            // Dígitos e " / " — a importação junta documentos distintos assim.
            onChange={(e) => setDoc(e.target.value.replace(/[^\d\s/]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }}
            placeholder="Ex.: 4904066308"
            className={`${inputCls} font-mono`}
          />
        </Campo>
        {atual && <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>Deixe vazio para remover o documento.</p>}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
          <button
            onClick={() => void salvar()}
            disabled={salvando || (!doc && !atual)}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--brand)' }}
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Gravar
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

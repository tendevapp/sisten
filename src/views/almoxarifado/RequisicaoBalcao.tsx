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

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowLeftRight, BarChart3, Check, CheckSquare, ChevronDown, Download, FileCheck2, FolderPlus, History, Layers, ListChecks, Loader2, LogOut, Plus,
  QrCode, RefreshCw, RotateCcw, Search, Square, Trash2, Upload, X,
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
  ORIGEM_RETIRADA_SEM_SALDO, PREFIXO_REQ_BALCAO, ROTULO_TIPO_MOVIMENTO, adicionarGrupoPep, adicionarItemAoGrupo, adicionarLinha,
  alertaDaLinha, alertasRequisicao, achatarGruposPep, agruparLinhasPorDeposito, agruparLinhasPorDestino, agruparLinhasPorPep, buscarMateriaisEmDepositos, chaveDeposito, localizarMaterialParaSaida, semDepositosSemSaida, somenteComSaldo,
  criarGrupoPep, definirDepositoDoGrupo, definirDestinoDoGrupo, definirPepDoGrupo, erroDaLinha, indexarEstoquePorDeposito, reaplicarSaldos, removerGrupoPep,
  removerItemDoGrupo, atualizarQtdItemDoGrupo, ultimaAplicacaoPorColaborador, validarRequisicao,
  MENSAGEM_EPI_PELA_FICHA, episRecusados, origemLiberaEpi,
  type GrupoPepBalcao, type LinhaBalcao, type MaterialDisponivel, type MaterialNoDeposito, type PepAplicacao, type TipoMovimentoBalcao,
} from '../../lib/requisicaoBalcao';
import {
  buscarEstoqueBalcao, buscarRequisicaoBalcaoPorCodigo, excluirRequisicaoBalcao, importarSapBalcao, informarDocSap, listarAlteracoesBalcao, listarAplicacoesBalcao,
  listarExportacoesBalcao, listarRequisicoesBalcao, reabrirExportacaoBalcao, registrarExportacaoBalcao,
  buscarRequisicoesBalcaoNoHistorico, listarRequisicoesBalcaoDoPeriodo,
  buscarOriginalExportacaoBalcao, originalBalcaoDisponivel,
  salvarRequisicaoBalcao, carregarCodigosEpiBook,
  type ReqBalcaoAlteracao, type ReqBalcaoExportacao, type ReqBalcaoRow,
} from '../../lib/requisicaoBalcaoApi';
import {
  baixarPlanilhaBalcao, classificarImportacao, gerarPlanilhaBalcao, lerArquivoBalcaoConcluido,
  type LeituraPlanilhaBalcao, type SituacaoImportacao,
} from '../../lib/requisicaoBalcaoPlanilha';
import { listarRhPessoas, listarRhTurnos } from '../../lib/rhApi';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { CHAVE_ABRIR_REQUISICAO_BALCAO } from '../../lib/fichaEpiRequisicao';
import { EVENTO_ITEM_QR_BALCAO, codigoDoQr, consumirItemQrPendente, hashSemItem, itemDaRota } from '../../lib/etiquetaMaterial';
import LeitorQrModal from '../../components/ui/LeitorQrModal';
import SeletorColaborador from '../../components/almoxarifado/SeletorColaborador';
import { BotaoRelatorioSolExtra } from '../../components/almoxarifado/RelatorioSolExtra';
import type { EstoqueItem, Profile, RhPessoa, RhTurno } from '../../types';
import { confirmar } from '../../lib/confirmar';
import LogAlteracoes from '../../components/almoxarifado/LogRequisicaoBalcao';
import { canAccessPage } from '../../lib/pages';
import FiltroPeriodoRequisicao from '../../components/almoxarifado/FiltroPeriodoRequisicao';
import ConferenciaImportacao from '../../components/almoxarifado/auditoriaRqb/ConferenciaImportacao';
import ConferenciaImportacoesModal from '../../components/almoxarifado/auditoriaRqb/ConferenciaImportacoesModal';
import ProgressoGravacao, { type FaseGravacao } from '../../components/almoxarifado/auditoriaRqb/ProgressoGravacao';
import { documentosDaPlanilha, linhasComDocumento } from '../../lib/requisicaoBalcaoAuditoria';
import { etapaSapBalcao, itensSemDocParcial, type EtapaSapBalcao } from '../../lib/requisicaoBalcaoEtapa';
import { formatarIntervalo } from '../../lib/logRequisicaoBalcao';
import { PERIODO_VAZIO, dataLocalDeTimestamp, dentroDoPeriodo, type FiltroPeriodo } from '../../lib/requisicaoBalcaoAuditoria';
import {
  DICA_SITUACAO_SEM_SAP, ROTULO_SITUACAO_SEM_SAP, type ConferenciaSemSap, type SituacaoSemSap,
} from '../../lib/requisicaoBalcaoDocProvavel';
import { sugerirDocsExportadasSemSap } from '../../lib/requisicaoBalcaoAuditoriaApi';
import { buscaNoHistorico, faixaForaDaLista, lotesNoPeriodo, mesclarRequisicoes } from '../../lib/requisicaoBalcaoHistorico';
import { useDebounce } from '../../lib/useDebounce';

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

const DESTINO_PADRAO_TRANSFERENCIA = '0105';

/**
 * Abas no caminho até o SAP: não exportada → exportada (alerta: ainda sem
 * doc. SAP) → Concluído SAP (a planilha concluída voltou com o doc.).
 */
type FiltroExportacao = 'aguardando' | 'nao_exportadas' | 'exportadas' | 'concluidas' | 'todas';
const ROTULO_FILTRO_EXPORTACAO: Record<FiltroExportacao, string> = {
  aguardando: 'Aguardando confirmação',
  nao_exportadas: 'Não exportadas',
  exportadas: 'Exportadas · sem SAP',
  concluidas: 'Concluído SAP',
  todas: 'Todas',
};
const ETAPA_DO_FILTRO: Partial<Record<FiltroExportacao, EtapaSapBalcao>> = {
  aguardando: 'aguardando',
  nao_exportadas: 'nao_exportada',
  exportadas: 'exportada',
  concluidas: 'concluida',
};

/** Exportada há mais que isso sem doc. SAP: o alerta fica vermelho. */
const ALERTA_EXPORTADA_MS = 24 * 3600 * 1000;

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
  // Item do QR da etiqueta lido pela câmera comum (link `?item=` ou guardado
  // antes do login). `n` muda a cada leitura: o mesmo código lido duas vezes entra de novo.
  const [itemQr, setItemQr] = useState<{ codigo: string; n: number } | null>(null);
  const [detalhe, setDetalhe] = useState<ReqBalcaoRow | null>(null);
  const [busca, setBusca] = useState('');
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [docSapAberto, setDocSapAberto] = useState<string[] | null>(null);
  const [filtroExportacao, setFiltroExportacao] = useState<FiltroExportacao>('nao_exportadas');
  // Período pela criação da requisição ou pela exportação (= data de lançamento na MB51).
  const [periodo, setPeriodo] = useState<FiltroPeriodo>(PERIODO_VAZIO);
  // "Exportadas · sem SAP": qual documento da MB51 é o de cada uma (casado linha a linha nos dois sentidos).
  const [filtroSemSap, setFiltroSemSap] = useState<SituacaoSemSap | 'todas'>('todas');
  const [confSemSap, setConfSemSap] = useState<{ mapa: Map<string, ConferenciaSemSap>; ate: string | null; ultimo: string | null } | null>(null);
  const [erroConfSemSap, setErroConfSemSap] = useState('');
  const [exportacoes, setExportacoes] = useState<ReqBalcaoExportacao[]>([]);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [importacao, setImportacao] = useState<{ arquivo: string; leitura: LeituraPlanilhaBalcao } | null>(null);
  /** Conferência das últimas importações com a MB51, fora do fluxo de importação. */
  const [conferirImportacoes, setConferirImportacoes] = useState(false);
  const arquivoImportRef = useRef<HTMLInputElement>(null);
  /** Data a partir da qual a lista tem todas ('' = tem todas); antes disso, busca e período vão ao banco. */
  const [completoDesde, setCompletoDesde] = useState('');
  /** Muda a cada recarga: o que veio do histórico é buscado de novo por cima da lista nova. */
  const [versaoLista, setVersaoLista] = useState(0);
  const [buscandoHistorico, setBuscandoHistorico] = useState(false);

  const recarregarRequisicoes = useCallback(async () => {
    try {
      const [reqs, lotes] = await Promise.all([
        listarRequisicoesBalcao(),
        // Todos os lotes: a data da exportação de cada requisição sai daqui (filtro de período).
        listarExportacoesBalcao(1000).catch(() => [] as ReqBalcaoExportacao[]),
      ]);
      setRequisicoes(reqs.linhas);
      setCompletoDesde(reqs.completoDesde);
      setVersaoLista((v) => v + 1);
      setExportacoes(lotes);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar as requisições.');
    }
  }, [toast]);

  const recarregar = useCallback(async (forcarEstoque = true) => {
    setLoading(true);
    try {
      const [est, pes, pep, tur] = await Promise.all([
        buscarEstoqueBalcao(forcarEstoque),
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

  useEffect(() => { void recarregar(true); }, [recarregar]);

  const estoquePorDeposito = useMemo(() => indexarEstoquePorDeposito(estoque, true), [estoque]);
  const importadoEm = useMemo(
    () => estoque.reduce<string | undefined>((max, r) => (r.imported_at && (!max || r.imported_at > max) ? r.imported_at : max), undefined),
    [estoque],
  );

  /** Lote → dia da exportação (horário local), que é a data de lançamento na MB51. */
  const dataExportacaoPorLote = useMemo(
    () => new Map(exportacoes.map((e) => [e.id, dataLocalDeTimestamp(e.created_at)])),
    [exportacoes],
  );
  /**
   * Fora da lista (concluída e mais antiga que as 500 recentes): busca por código
   * RQB ou doc. SAP e o período anterior vão ao banco e entram na lista.
   */
  const buscaAdiada = useDebounce(busca, 400);
  const lotesDoPeriodo = useMemo(() => lotesNoPeriodo(periodo, exportacoes).join(','), [periodo, exportacoes]);
  useEffect(() => {
    const alvo = buscaNoHistorico(buscaAdiada);
    const faixa = faixaForaDaLista(periodo, completoDesde);
    const lotes = completoDesde && lotesDoPeriodo ? lotesDoPeriodo.split(',') : [];
    if (!alvo && !faixa && lotes.length === 0) { setBuscandoHistorico(false); return; }
    let cancelado = false;
    setBuscandoHistorico(true);
    Promise.all([
      alvo ? buscarRequisicoesBalcaoNoHistorico(alvo) : Promise.resolve([] as ReqBalcaoRow[]),
      faixa ? listarRequisicoesBalcaoDoPeriodo(faixa) : Promise.resolve([] as ReqBalcaoRow[]),
      lotes.length > 0 ? listarRequisicoesBalcaoDoPeriodo({ ate: completoDesde, lotes }) : Promise.resolve([] as ReqBalcaoRow[]),
    ])
      .then(([porBusca, porData, porLote]) => {
        if (cancelado) return;
        const extras = [...porBusca, ...porData, ...porLote];
        if (extras.length > 0) setRequisicoes((lista) => mesclarRequisicoes(lista, extras));
      })
      .catch((err: any) => { if (!cancelado) toast.error(err?.message || 'Não foi possível buscar no histórico de requisições.'); })
      .finally(() => { if (!cancelado) setBuscandoHistorico(false); });
    return () => { cancelado = true; };
  }, [buscaAdiada, periodo, completoDesde, lotesDoPeriodo, versaoLista, toast]);

  const noPeriodo = useMemo(
    () => requisicoes.filter((r) => dentroDoPeriodo(
      periodo, r.data, r.exportacao_id ? dataExportacaoPorLote.get(r.exportacao_id) ?? null : null,
    )),
    [requisicoes, periodo, dataExportacaoPorLote],
  );

  /**
   * Na aba "Exportadas · sem SAP", o documento mais provável de cada uma na MB51:
   * casado linha a linha nos dois sentidos — o item tem de estar no documento e o
   * documento não recebe mais do que tem (linha já de outra RQB não serve).
   * Roda com a aba aberta e de novo a cada recarga da lista.
   */
  useEffect(() => {
    if (filtroExportacao !== 'exportadas') return;
    let cancelado = false;
    setErroConfSemSap('');
    sugerirDocsExportadasSemSap()
      .then((r) => { if (!cancelado) setConfSemSap(r); })
      .catch((e: any) => { if (!cancelado) setErroConfSemSap(e?.message || 'Não foi possível conferir com a MB51.'); });
    return () => { cancelado = true; };
  }, [filtroExportacao, versaoLista]);

  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    return noPeriodo.filter((r) => {
      const etapa = ETAPA_DO_FILTRO[filtroExportacao];
      if (etapa && etapaSapBalcao(r) !== etapa) return false;
      if (filtroExportacao === 'exportadas' && filtroSemSap !== 'todas' && confSemSap
        && confSemSap.mapa.get(r.id)?.situacao !== filtroSemSap) return false;
      if (!t) return true;
      const alvo = semAcento([
        r.codigo, r.colaborador_nome, r.colaborador_registro, r.aplicacao_pep, r.aplicacao, r.doc_sap, r.deposito_origem,
        ...r.itens.flatMap((i) => [i.material, i.descricao, i.aplicacao_pep, i.aplicacao]),
      ].filter(Boolean).join(' '));
      return t.split(/\s+/).every((p) => alvo.includes(p));
    });
  }, [noPeriodo, busca, filtroExportacao, filtroSemSap, confSemSap]);

  /** Contagem por situação na MB51 das exportadas sem SAP do período. */
  const contagemSemSap = useMemo(() => {
    const c: Record<SituacaoSemSap, number> = { doc_confere: 0, doc_provavel: 0, em_parte: 0, nao_encontrada: 0, mb51_pendente: 0 };
    if (!confSemSap) return c;
    for (const r of noPeriodo) {
      if (etapaSapBalcao(r) !== 'exportada') continue;
      const s = confSemSap.mapa.get(r.id)?.situacao;
      if (s) c[s] += 1;
    }
    return c;
  }, [noPeriodo, confSemSap]);

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
  // Contagens no período escolhido (sem período = tudo).
  const porEtapa = useMemo(() => {
    const c: Record<EtapaSapBalcao, number> = { aguardando: 0, nao_exportada: 0, exportada: 0, concluida: 0 };
    for (const r of noPeriodo) c[etapaSapBalcao(r)] += 1;
    return c;
  }, [noPeriodo]);
  const qtdAguardando = porEtapa.aguardando;
  const qtdNaoExportadas = porEtapa.nao_exportada;
  const qtdExportadasSemSap = porEtapa.exportada;
  const contagemFiltro: Record<FiltroExportacao, number> = {
    aguardando: qtdAguardando,
    nao_exportadas: qtdNaoExportadas,
    exportadas: qtdExportadasSemSap,
    concluidas: porEtapa.concluida,
    todas: noPeriodo.length,
  };
  const exportadaEmPorLote = useMemo(() => new Map(exportacoes.map((e) => [e.id, e.created_at])), [exportacoes]);

  // Link do QR: tira o `?item=` do endereço (F5 não repete) e consome o pendente do login.
  useEffect(() => {
    const lerQr = () => {
      const doEndereco = itemDaRota(window.location.hash || '');
      if (doEndereco) window.history.replaceState(null, '', hashSemItem(window.location.hash));
      const pendente = consumirItemQrPendente();
      const codigo = doEndereco ?? pendente;
      if (codigo) setItemQr((atual) => ({ codigo, n: (atual?.n ?? 0) + 1 }));
    };
    lerQr();
    window.addEventListener('hashchange', lerQr);
    // Botão "Ler QR" do cabeçalho (baixa de estoque) com esta tela já aberta.
    window.addEventListener(EVENTO_ITEM_QR_BALCAO, lerQr);
    return () => {
      window.removeEventListener('hashchange', lerQr);
      window.removeEventListener(EVENTO_ITEM_QR_BALCAO, lerQr);
    };
  }, []);

  // Com a tela carregada, abre uma requisição nova (ou usa a aberta) para o item lido.
  useEffect(() => {
    if (loading || !itemQr) return;
    setForm((f) => f ?? {});
  }, [loading, itemQr]);

  // A ficha de EPI e o "Dar baixa" da retirada sem saldo deixam o código da
  // requisição: ao chegar aqui, abre direto para o almoxarife conferir e confirmar.
  // Fora da lista carregada, busca pelo código uma vez (antes recarregava a lista
  // sem parar e o formulário nunca abria).
  useEffect(() => {
    if (loading) return;
    let codigo: string | null = null;
    try { codigo = sessionStorage.getItem(CHAVE_ABRIR_REQUISICAO_BALCAO); } catch { /* sem storage */ }
    if (!codigo) return;
    try { sessionStorage.removeItem(CHAVE_ABRIR_REQUISICAO_BALCAO); } catch { /* sem storage */ }
    const abrir = (alvo: ReqBalcaoRow) => {
      setFiltroExportacao(alvo.pendente_confirmacao ? 'aguardando' : 'todas');
      setForm({ registro: alvo });
    };
    const naLista = requisicoes.find((r) => r.codigo === codigo);
    if (naLista) { abrir(naLista); return; }
    const alvoCodigo = codigo;
    buscarRequisicaoBalcaoPorCodigo(alvoCodigo)
      .then((alvo) => {
        if (!alvo) { toast.error(`Requisição ${alvoCodigo} não encontrada.`); return; }
        setRequisicoes((lista) => (lista.some((r) => r.id === alvo.id) ? lista : [alvo, ...lista]));
        abrir(alvo);
      })
      .catch((err) => toast.error(`Não foi possível abrir a requisição ${alvoCodigo}: ${err instanceof Error ? err.message : String(err)}`));
  }, [loading, requisicoes, toast]);

  const exportar = async () => {
    const sel = requisicoes.filter((r) => selecionadas.has(r.id));
    if (sel.length === 0) return;
    const aguardando = sel.filter((r) => r.pendente_confirmacao);
    if (aguardando.length > 0) {
      toast.error(`Pendente de confirmação, não pode exportar: ${aguardando.map((r) => r.codigo).join(', ')}. Abra, confirme o PEP e libere.`);
      return;
    }
    const jaExportadas = sel.filter((r) => r.exportacao_id).length;
    if (jaExportadas > 0
        && !await confirmar({ titulo: 'Exportar de novo?', mensagem: `${jaExportadas} das selecionadas já foram exportadas. Exportar de novo mesmo assim?`, confirmarLabel: 'Exportar de novo' })) return;

    // Alerta de itens sem saldo na ZL0024 para confirmação prévia antes de importar no SAP
    const comSemSaldo = sel.filter((r) =>
      r.itens.some((i) => (i.saldo_zl0024 != null && i.saldo_zl0024 <= 0) || i.sem_saldo),
    );
    if (comSemSaldo.length > 0) {
      const itensSemSaldo = comSemSaldo.flatMap((r) =>
        r.itens
          .filter((i) => (i.saldo_zl0024 != null && i.saldo_zl0024 <= 0) || i.sem_saldo)
          .map((i) => `• [${r.codigo}] Material ${i.material} - ${i.descricao || ''} (Qtd: ${i.quantidade}, Saldo ZL0024: ${i.saldo_zl0024 ?? 0})`),
      );
      const conf = await confirmar({
        titulo: 'Itens sem saldo na ZL0024',
        confirmarLabel: 'Exportar mesmo assim',
        cancelarLabel: 'Voltar e revisar',
        mensagem:
        `Foram selecionadas ${comSemSaldo.length} requisição(ões) contendo ${itensSemSaldo.length} item(ns) sem saldo na ZL0024 (possível defasagem de importação):\n\n` +
        itensSemSaldo.slice(0, 6).join('\n') +
        (itensSemSaldo.length > 6 ? `\n... e mais ${itensSemSaldo.length - 6} item(ns)` : '') +
        `\n\nConfirme se estes itens estão autorizados antes de importar no SAP. Deseja prosseguir com a exportação da planilha?`,
      });
      if (!conf) return;
    }

    setExportando(true);
    try {
      const planilha = gerarPlanilhaBalcao(sel);
      await registrarExportacaoBalcao(sel.map((r) => r.id), planilha, user.name);
      baixarPlanilhaBalcao(planilha.blob, planilha.arquivo);
      toast.success(`${planilha.arquivo}: ${sel.length} requisição(ões), ${planilha.linhas} linha(s).`);
      setSelecionadas(new Set());
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível exportar a planilha.');
    } finally {
      setExportando(false);
    }
  };

  const lerArquivoImportacao = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      setImportacao({ arquivo: file.name, leitura: lerArquivoBalcaoConcluido(wb) });
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ler a planilha.');
    } finally {
      if (arquivoImportRef.current) arquivoImportRef.current.value = '';
    }
  };

  const reabrir = async (ids: string[], rotulo: string) => {
    if (ids.length === 0) return;
    if (!await confirmar({ titulo: 'Reabrir requisição?', mensagem: `Reabrir ${rotulo}? Volta para "Não exportadas" e poderá ser editada e exportada de novo.`, confirmarLabel: 'Reabrir' })) return;
    try {
      const n = await reabrirExportacaoBalcao(ids);
      toast.success(`${n} requisição(ões) de volta à fila de exportação.`);
      setDetalhe(null);
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao reabrir.');
    }
  };

  /** Selecionadas que já saíram na planilha e não voltaram com doc. SAP — podem voltar para "Não exportadas". */
  const selecionadasEstornaveis = useMemo(
    () => requisicoes.filter((r) => selecionadas.has(r.id) && r.exportacao_id && !r.doc_sap).map((r) => r.id),
    [requisicoes, selecionadas],
  );
  const estornarExportacao = async () => {
    const ids = selecionadasEstornaveis;
    if (ids.length === 0) return;
    if (!await confirmar({
      titulo: 'Estornar para "Não exportadas"?',
      mensagem: `${ids.length} requisição(ões) voltam para "Não exportadas" e precisarão ser exportadas de novo. Use quando a planilha não foi processada no SAP.`,
      confirmarLabel: 'Estornar',
    })) return;
    try {
      const n = await reabrirExportacaoBalcao(ids);
      toast.success(`${n} requisição(ões) de volta para "Não exportadas".`);
      setSelecionadas(new Set());
      await recarregarRequisicoes();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao estornar a exportação.');
    }
  };

  const alternarSelecao = (ids: string[], marcar: boolean) => {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  };

  // Pendente de confirmação não se seleciona: não pode ir para a planilha do SAP.
  const idsFiltradas = useMemo(() => filtradas.filter((r) => !r.pendente_confirmacao).map((r) => r.id), [filtradas]);
  const todasFiltradasSelecionadas = idsFiltradas.length > 0 && idsFiltradas.every((id) => selecionadas.has(id));
  const alternarSelecionarTodas = () => {
    alternarSelecao(idsFiltradas, !todasFiltradasSelecionadas);
  };

  /**
   * Requisição exportada não se altera (a planilha já saiu com ela). Em vez de
   * esconder o botão, pergunta e reabre a exportação antes — é o que o
   * almoxarife faria em dois passos.
   */
  const liberarExportada = async (r: ReqBalcaoRow, acao: string): Promise<boolean> => {
    if (!r.exportacao_id) return true;
    if (!await confirmar({ titulo: 'Requisição já exportada', mensagem: `${r.codigo} já foi exportada. Para ${acao}, ela volta para "Não exportadas" e precisará ser exportada de novo. Continuar?`, confirmarLabel: 'Continuar' })) return false;
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
    // Requisição de Ficha de EPI é a baixa do EPI entregue: o banco só deixa sair
    // com a ficha cancelada (cancelar a ficha no SSMA já a exclui junto).
    if (r.origem === 'ficha_epi') {
      await confirmar({
        titulo: `${r.codigo} é a baixa da ficha ${r.origem_ref ?? ''}`.trim(),
        mensagem: 'O EPI desta ficha foi entregue e assinado: a requisição não é excluída aqui. Se a entrega não aconteceu ou a ficha está errada, peça ao SSMA para cancelar a ficha — a requisição sai junto. Item sem saldo vai pela Retirada sem Saldo vinculada à ficha.',
        confirmarLabel: 'Entendi',
        cancelarLabel: 'Fechar',
      });
      return;
    }
    if (!r.exportacao_id && !await confirmar({ titulo: 'Excluir requisição?', mensagem: `Excluir a requisição ${r.codigo}? Sai da tela, mas permanece no banco.`, confirmarLabel: 'Excluir', variante: 'perigo' })) return;
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
        <div className="flex flex-wrap items-center gap-2">
          {canAccessPage(user, 'almox_requisicao_balcao_relatorio') && (
            <button
              type="button"
              onClick={() => onNavigate('/almoxarifado/requisicao-balcao-relatorio')}
              title="Requisições por item, datas, totais e conferência com a MB51"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Relatório × MB51
            </button>
          )}
          <BotaoRelatorioSolExtra
            user={user}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer border-[var(--hairline)] text-[var(--ink-secondary)]"
          />
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
            onClick={() => setConferirImportacoes(true)}
            title="Conferir de novo, com a MB51 atual, as últimas importações da planilha concluída"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ListChecks className="h-3.5 w-3.5" /> Conferir × MB51
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="Requisições hoje" valor={qtdHoje} />
        <Indicador
          rotulo="Aguardando confirmação"
          valor={qtdAguardando}
          destaque={qtdAguardando > 0}
          onClick={() => setFiltroExportacao('aguardando')}
          ativo={filtroExportacao === 'aguardando'}
        />
        <Indicador
          rotulo="Não exportadas"
          valor={qtdNaoExportadas}
          destaque={qtdNaoExportadas > 0}
          onClick={() => setFiltroExportacao('nao_exportadas')}
          ativo={filtroExportacao === 'nao_exportadas'}
        />
        <Indicador
          rotulo="Exportadas sem doc. SAP"
          valor={qtdExportadasSemSap}
          destaque={qtdExportadasSemSap > 0}
          alerta={qtdExportadasSemSap > 0}
          onClick={() => setFiltroExportacao('exportadas')}
          ativo={filtroExportacao === 'exportadas'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Etapa até o SAP">
          {(Object.keys(ROTULO_FILTRO_EXPORTACAO) as FiltroExportacao[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroExportacao(f)}
              aria-pressed={filtroExportacao === f}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={filtroExportacao === f
                ? { background: f === 'exportadas' && contagemFiltro[f] > 0 ? 'var(--status-serious)' : 'var(--brand)', color: 'white' }
                : { color: f === 'exportadas' && contagemFiltro[f] > 0 ? 'var(--status-serious)' : 'var(--ink-secondary)' }}
            >
              {f === 'exportadas' && contagemFiltro[f] > 0 && <AlertTriangle className="h-3 w-3" />}
              {f === 'concluidas' && <Check className="h-3 w-3" />}
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
            aria-label="Buscar requisições"
            className={`${inputCls} pl-8 text-xs ${buscandoHistorico ? 'pr-8' : ''}`}
          />
          {buscandoHistorico && (
            <Loader2
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin"
              style={{ color: 'var(--ink-muted)' }}
              aria-label="Buscando no histórico"
            />
          )}
        </div>
        <FiltroPeriodoRequisicao valor={periodo} onChange={setPeriodo} />
        {filtradas.length > 0 && (
          <button
            type="button"
            onClick={alternarSelecionarTodas}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer hover:opacity-90 active:scale-95 ml-auto"
            style={{
              borderColor: todasFiltradasSelecionadas ? 'var(--brand)' : 'var(--hairline)',
              background: todasFiltradasSelecionadas ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : 'var(--surface-raised)',
              color: todasFiltradasSelecionadas ? 'var(--brand)' : 'var(--ink-secondary)',
            }}
            title={todasFiltradasSelecionadas ? 'Desmarcar todas as requisições listadas' : `Selecionar todas as ${filtradas.length} requisições listadas`}
          >
            {todasFiltradasSelecionadas ? (
              <CheckSquare className="h-3.5 w-3.5 text-[var(--brand)]" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            {todasFiltradasSelecionadas ? 'Desmarcar todos' : `Selecionar todos (${filtradas.length})`}
          </button>
        )}
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
            {selecionadasEstornaveis.length > 0 && (
              <button
                onClick={() => void estornarExportacao()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold"
                style={{ borderColor: 'var(--status-serious)', color: 'var(--status-serious)' }}
                title="Volta as selecionadas para Não exportadas"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Estornar para não exportada ({selecionadasEstornaveis.length})
              </button>
            )}
            <button
              onClick={() => void exportar()}
              disabled={exportando}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Exportar planilha SAP
            </button>
          </div>
        </div>
      )}

      {filtroExportacao === 'exportadas' && qtdExportadasSemSap > 0 && (
        <div
          className="flex items-start gap-2 rounded-xl border px-3 py-2 text-xs"
          style={{ borderColor: 'var(--status-serious)', background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)', color: 'var(--ink-primary)' }}
          role="status"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-serious)' }} />
          <span>
            {qtdExportadasSemSap} requisição(ões) já saíram na planilha e ainda não voltaram com doc. SAP. Importe a planilha
            concluída (ou informe o doc.) para irem para <strong>Concluído SAP</strong>. Em vermelho, exportadas há mais de 24 h.
          </span>
        </div>
      )}

      {filtroExportacao === 'exportadas' && qtdExportadasSemSap > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação na MB51">
          <span className="text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>Na MB51:</span>
          {!confSemSap && !erroConfSemSap ? (
            <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-3 w-3 animate-spin" /> Conferindo com a MB51…
            </span>
          ) : erroConfSemSap ? (
            <span className="text-[11px]" style={{ color: 'var(--status-critical)' }}>{erroConfSemSap}</span>
          ) : (
            <>
              {(['todas', 'doc_confere', 'doc_provavel', 'em_parte', 'nao_encontrada', 'mb51_pendente'] as const).map((f) => {
                const qtd = f === 'todas' ? qtdExportadasSemSap : contagemSemSap[f];
                if (f === 'mb51_pendente' && qtd === 0) return null;
                const ativo = filtroSemSap === f;
                const cor = f === 'todas' ? 'var(--ink-secondary)' : COR_SITUACAO_SEM_SAP[f];
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltroSemSap(f)}
                    aria-pressed={ativo}
                    title={f === 'todas' ? undefined : DICA_SITUACAO_SEM_SAP[f]}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-bold"
                    style={ativo
                      ? { borderColor: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }
                      : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  >
                    {f === 'todas' ? 'Todas' : ROTULO_SITUACAO_SEM_SAP[f]} ({qtd})
                  </button>
                );
              })}
              <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                Casado linha a linha (material, depósito, quantidade e PEP); documento já usado por outra RQB não conta
                {confSemSap?.ultimo ? ` · MB51 até ${formatDateTimeBR(confSemSap.ultimo)}` : confSemSap?.ate ? ` · MB51 até ${confSemSap.ate.split('-').reverse().join('/')}` : ''}
              </span>
            </>
          )}
        </div>
      )}
      {filtroExportacao === 'exportadas' && filtroSemSap !== 'todas' && confSemSap && (
        <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{DICA_SITUACAO_SEM_SAP[filtroSemSap]}</p>
      )}

      {loading && requisicoes.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : porDia.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {buscandoHistorico ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Buscando no histórico…</span>
          ) : requisicoes.length === 0 ? 'Nenhuma requisição registrada ainda.' : 'Nada encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="space-y-5">
          {porDia.map(([data, lista]) => {
            const idsDia = lista.filter((r) => !r.pendente_confirmacao).map((r) => r.id);
            const todasMarcadas = idsDia.length > 0 && idsDia.every((id) => selecionadas.has(id));
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
                    exportadaEm={r.exportacao_id ? exportadaEmPorLote.get(r.exportacao_id) ?? null : null}
                    conferenciaMb51={confSemSap?.mapa.get(r.id) ?? null}
                    selecionada={selecionadas.has(r.id)}
                    podeEditar={podeEditarFormulario(user, r) || !!r.pendente_confirmacao}
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
          itemQr={itemQr}
          onClose={() => { setForm(null); setItemQr(null); }}
          onSalvo={async (continuar) => {
            if (!continuar) { setForm(null); setItemQr(null); }
            await recarregarRequisicoes();
          }}
        />
      )}

      {detalhe && (
        <ModalDetalhe
          r={detalhe}
          podeEditar={podeEditarFormulario(user, detalhe) || !!detalhe.pendente_confirmacao}
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
          visivel={!detalhe}
          arquivo={importacao.arquivo}
          leitura={importacao.leitura}
          requisicoes={requisicoes}
          podeImportarMb51={canAccessPage(user, 'almox_importar_planilhas')}
          podeAbrirRelatorio={canAccessPage(user, 'almox_requisicao_balcao_relatorio')}
          onAbrirRelatorio={() => { setImportacao(null); onNavigate('/almoxarifado/requisicao-balcao-relatorio?visao=documento'); }}
          onAbrirRequisicao={async (id, codigo) => {
            try {
              const r = requisicoes.find((x) => x.id === id) ?? await buscarRequisicaoBalcaoPorCodigo(codigo);
              if (r) setDetalhe(r); else toast.error(`${codigo} não encontrada (excluída?).`);
            } catch (err: any) {
              toast.error(err?.message || `Não foi possível abrir ${codigo}.`);
            }
          }}
          onClose={() => setImportacao(null)}
          onConfirmar={async (linhas, naoEnviadas, onFase) => {
            try {
              const { leitura } = importacao;
              onFase('gravando');
              const r = await importarSapBalcao(
                linhas.map((l) => ({ codigo: l.codigo, material: l.material, doc_sap: l.docSap, status: l.status })),
                importacao.arquivo,
                user.name,
                {
                  coluna_sap: leitura.colunaSap,
                  total_linhas: leitura.totalLinhas,
                  sem_codigo: leitura.semCodigo,
                  sem_doc_sap: leitura.semDocSap,
                  nao_enviadas: [
                    ...naoEnviadas.map((l) => ({ codigo: l.codigo, material: l.material, doc_sap: l.docSap, status: l.status, situacao: l.situacao })),
                    ...leitura.linhasSemDoc.map((l) => ({ ...l, doc_sap: '', status: '', situacao: 'sem_doc' })),
                    ...leitura.linhasBloqueadas.map((l) => ({
                      codigo: l.codigo, material: l.material, doc_sap: l.docSap, status: l.status,
                      situacao: [l.motivo, l.conferenciaSap?.mensagem].filter(Boolean).join(' '),
                    })),
                  ],
                },
              );
              toast.success(r.itens > 0
                ? `Doc. SAP gravado em ${r.itens} item(ns) de ${r.requisicoes} requisição(ões). A importação ficou no log.`
                : 'Nada gravado. A leitura da planilha ficou no log da importação.');
              if (r.nao_encontrados?.length) toast.error(`Não encontrados: ${r.nao_encontrados.join(', ')}`);
              onFase('atualizando');
              await recarregarRequisicoes();
              return true;
            } catch (err: any) {
              toast.error(err?.message || 'Falha ao importar.');
              return false;
            }
          }}
        />
      )}

      {conferirImportacoes && (
        <ConferenciaImportacoesModal
          visivel={!detalhe}
          podeImportarMb51={canAccessPage(user, 'almox_importar_planilhas')}
          podeAbrirRelatorio={canAccessPage(user, 'almox_requisicao_balcao_relatorio')}
          onAbrirRelatorio={() => { setConferirImportacoes(false); onNavigate('/almoxarifado/requisicao-balcao-relatorio?visao=documento'); }}
          onAbrirRequisicao={async (id, codigo) => {
            try {
              const r = requisicoes.find((x) => x.id === id) ?? await buscarRequisicaoBalcaoPorCodigo(codigo);
              if (r) setDetalhe(r); else toast.error(`${codigo} não encontrada (excluída?).`);
            } catch (err: any) {
              toast.error(err?.message || `Não foi possível abrir ${codigo}.`);
            }
          }}
          onClose={() => setConferirImportacoes(false)}
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
  rotulo, valor, destaque, onClick, ativo, alerta,
}: { rotulo: string; valor: number; destaque?: boolean; onClick?: () => void; ativo?: boolean; alerta?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="rounded-xl border px-4 py-3 text-left disabled:cursor-default"
      style={{
        borderColor: ativo ? 'var(--brand)' : alerta ? 'var(--status-serious)' : 'var(--hairline)',
        background: alerta ? 'color-mix(in srgb, var(--status-serious) 6%, var(--surface-raised))' : 'var(--surface-raised)',
      }}
    >
      <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: alerta ? 'var(--status-serious)' : 'var(--ink-muted)' }}>
        {alerta && <AlertTriangle className="h-3 w-3" />}{rotulo}
      </span>
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

function ChipDocSap({ doc, semDocParcial = 0 }: { doc: string | null; semDocParcial?: number }) {
  const token = semDocParcial > 0 ? 'var(--status-serious)' : doc ? 'var(--status-good)' : 'var(--status-serious)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${token} 14%, transparent)`, color: token }}
      title={semDocParcial > 0 ? `${semDocParcial} item(ns) ainda sem doc. SAP` : undefined}
    >
      {semDocParcial > 0
        ? <><AlertTriangle className="h-3 w-3" /> SAP parcial · faltam {semDocParcial}</>
        : doc ? <><Check className="h-3 w-3" /> SAP {doc}</> : 'Sem doc. SAP'}
    </span>
  );
}

/** Exportada e ainda sem doc. SAP: há quanto tempo a planilha saiu. */
function ChipAguardandoSap({ exportadaEm }: { exportadaEm: string | null }) {
  const ms = exportadaEm ? Date.now() - new Date(exportadaEm).getTime() : null;
  const token = ms != null && ms > ALERTA_EXPORTADA_MS ? 'var(--status-critical)' : 'var(--status-serious)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${token} 14%, transparent)`, color: token }}
      title={exportadaEm ? `Exportada em ${formatDateTimeBR(exportadaEm)} — falta importar a planilha concluída` : undefined}
    >
      <AlertTriangle className="h-3 w-3" /> Aguardando SAP{ms != null && ms > 0 ? ` · há ${formatarIntervalo(ms)}` : ''}
    </span>
  );
}

const COR_SITUACAO_SEM_SAP: Record<SituacaoSemSap, string> = {
  doc_confere: 'var(--status-good)',
  doc_provavel: 'var(--status-warning)',
  em_parte: 'var(--status-serious)',
  nao_encontrada: 'var(--status-critical)',
  mb51_pendente: 'var(--ink-secondary)',
};

/** Exportada sem doc. SAP: o documento mais provável na MB51 e se a conta fecha nos dois sentidos. */
function ChipConferenciaMb51({ c }: { c: ConferenciaSemSap }) {
  const token = COR_SITUACAO_SEM_SAP[c.situacao];
  const docs = c.docs.length ? ` · ${c.docs.slice(0, 2).join(', ')}${c.docs.length > 2 ? ` +${c.docs.length - 2}` : ''}` : '';
  const parte = c.situacao === 'em_parte' ? ` · ${c.encontrados}/${c.itens} itens` : '';
  const porque = c.situacao === 'doc_provavel'
    ? (c.sobraNoDoc > 0 ? ` · doc. com ${c.sobraNoDoc} linha(s) sem RQB`
      : c.ambigua ? ' · outro doc. também serve'
        : c.pepDiferente > 0 ? ' · PEP diferente' : '')
    : '';
  const detalhe = [
    DICA_SITUACAO_SEM_SAP[c.situacao],
    c.docs.length ? `Documento(s): ${c.docs.join(', ')}` : '',
    c.minutosAposExportacao != null ? `Lançado ${Math.round(c.minutosAposExportacao)} min depois da exportação.` : c.docs.length ? 'Lançado antes da exportação (baixa à mão?).' : '',
    c.docs.length ? (c.docFecha ? 'Conta inversa: todas as linhas do documento têm requisição.' : `Conta inversa: o documento tem ${c.sobraNoDoc} linha(s) que nenhuma requisição explica.`) : '',
    c.pepDiferente > 0 ? `${c.pepDiferente} item(ns) casado(s) com PEP diferente.` : '',
    c.alternativas.length ? `Também caberia em: ${c.alternativas.join(', ')}${c.ambigua ? ' (tão provável quanto)' : ' (menos provável)'}.` : '',
  ].filter(Boolean).join('\n');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: `color-mix(in srgb, ${token} 14%, transparent)`, color: token }}
      title={detalhe}
    >
      {c.situacao === 'doc_confere' ? <Check className="h-3 w-3" /> : <Search className="h-3 w-3" />}
      {ROTULO_SITUACAO_SEM_SAP[c.situacao]}{parte}{docs}{porque}
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

/** Gerada por outro formulário (ex.: Ficha de EPI) e ainda não liberada pelo almoxarifado. */
function ChipPendenteConfirmacao({ origemRef }: { origemRef?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={{ background: 'color-mix(in srgb, var(--status-serious) 16%, transparent)', color: 'var(--status-serious)' }}
      title="Não entra na exportação até o almoxarifado confirmar o PEP e liberar"
    >
      <AlertTriangle className="h-3 w-3" /> Pendente de confirmação{origemRef ? ` · ${origemRef}` : ''}
    </span>
  );
}

function CartaoRequisicao({
  r, exportadaEm, conferenciaMb51, selecionada, podeEditar, onSelecionar, onAbrir, onEditar, onExcluir,
}: {
  r: ReqBalcaoRow;
  exportadaEm: string | null;
  /** Exportada sem doc. SAP: o que a MB51 tem (só na aba "Exportadas · sem SAP"). */
  conferenciaMb51?: ConferenciaSemSap | null;
  selecionada: boolean;
  podeEditar: boolean;
  onSelecionar: (v: boolean) => void;
  onAbrir: () => void;
  onEditar: () => void;
  onExcluir: () => void;
}) {
  const acao = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const temSemSaldo = r.itens.some((i) => (i.saldo_zl0024 != null && i.saldo_zl0024 <= 0) || i.sem_saldo);
  const isTransferencia = r.tipo_movimento === 'transferencia';
  const pepsDistintos = isTransferencia ? [] : Array.from(new Set(r.itens.map((i) => i.aplicacao_pep || r.aplicacao_pep).filter(Boolean)));
  const depositosDistintos = Array.from(new Set(r.itens.map((i) => i.deposito || r.deposito_origem).filter(Boolean)));
  const destinosDistintos = isTransferencia ? Array.from(new Set(r.itens.map((i) => i.deposito_destino || r.deposito_destino).filter(Boolean))) : [];

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
          checked={selecionada && !r.pendente_confirmacao}
          disabled={!!r.pendente_confirmacao}
          title={r.pendente_confirmacao ? 'Pendente de confirmação: abra e libere antes de exportar' : undefined}
          onChange={(e) => onSelecionar(e.target.checked)}
          className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{r.codigo}</span>
          <ChipTipo tipo={r.tipo_movimento} />
          {r.pendente_confirmacao && <ChipPendenteConfirmacao origemRef={r.origem_ref} />}
          {etapaSapBalcao(r) === 'exportada' ? (
            <>
              <ChipAguardandoSap exportadaEm={exportadaEm} />
              {itensSemDocParcial(r) > 0 && <ChipDocSap doc={r.doc_sap} semDocParcial={itensSemDocParcial(r)} />}
              {conferenciaMb51 && <ChipConferenciaMb51 c={conferenciaMb51} />}
            </>
          ) : (
            <>
              <ChipDocSap doc={r.doc_sap} />
              {r.exportacao_id && <ChipExportada />}
            </>
          )}
          {temSemSaldo && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
              title="Contém itens sem saldo na ZL0024"
            >
              <AlertTriangle className="h-3 w-3" /> Sem saldo ZL0024
            </span>
          )}
          {pepsDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
              title={`Itens distribuídos em ${pepsDistintos.length} PEPs`}
            >
              <Layers className="h-3 w-3" /> {pepsDistintos.length} PEPs
            </span>
          )}
          {depositosDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
              title={`Itens saindo de ${depositosDistintos.length} depósitos distintos`}
            >
              <Layers className="h-3 w-3" /> {depositosDistintos.length} dep. de saída
            </span>
          )}
          {destinosDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
              title={`Itens destinados a ${destinosDistintos.length} depósitos distintos`}
            >
              <Layers className="h-3 w-3" /> {destinosDistintos.length} destinos
            </span>
          )}
        </div>
        <div className="text-sm font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
          {r.colaborador_nome}
          <span className="font-medium" style={{ color: 'var(--ink-muted)' }}>
            {' · '}
            {isTransferencia
              ? 'Transferência entre depósitos'
              : pepsDistintos.length > 1
                ? `${r.aplicacao} (+${pepsDistintos.length - 1} PEPs)`
                : r.aplicacao}
          </span>
        </div>
        <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {isTransferencia ? (
            <>
              {depositosDistintos.length > 1 ? depositosDistintos.map((d) => formatDeposito(d)).join(', ') : `Dep. ${formatDeposito(r.deposito_origem)}`}
              {' → '}
              {destinosDistintos.length > 1 ? destinosDistintos.map((d) => formatDeposito(d)).join(', ') : (r.deposito_destino ? formatDeposito(r.deposito_destino) : 'Definir no SAP')}
            </>
          ) : (
            <>{depositosDistintos.length > 1 ? depositosDistintos.map((d) => formatDeposito(d)).join(', ') : `Dep. ${formatDeposito(r.deposito_origem)}`}</>
          )}
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
              <button onClick={acao(onEditar)} className="text-[11px] font-bold hover:underline" style={{ color: r.pendente_confirmacao ? 'var(--status-serious)' : 'var(--brand)' }}>
                {r.pendente_confirmacao ? 'Conferir e confirmar' : 'Editar'}
              </button>
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
  user, registro, estoquePorDeposito, pessoas, peps, turnos, historico, itemQr, onClose, onSalvo,
}: {
  user: Profile;
  registro?: ReqBalcaoRow;
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>;
  pessoas: RhPessoa[];
  peps: PepAplicacao[];
  turnos: RhTurno[];
  historico: ReqBalcaoRow[];
  /** Item do QR lido pela câmera comum — fica escolhido no 1º grupo, esperando a quantidade. */
  itemQr?: { codigo: string; n: number } | null;
  onClose: () => void;
  onSalvo: (continuar: boolean) => Promise<void>;
}) {
  const toast = useToast();
  const pref = useMemo(lerPreferencias, []);

  // Sincronização em tempo real do estoque da ZL0024 diretamente do Supabase
  const [atualizandoEstoque, setAtualizandoEstoque] = useState(false);
  const [estoqueModal, setEstoqueModal] = useState<EstoqueItem[]>([]);
  const estoquePorDepositoModal = useMemo(
    () => (estoqueModal.length > 0 ? indexarEstoquePorDeposito(estoqueModal, true) : estoquePorDeposito),
    [estoqueModal, estoquePorDeposito],
  );

  const sincronizarEstoqueSupabase = useCallback(async () => {
    setAtualizandoEstoque(true);
    try {
      const dados = await buscarEstoqueBalcao(true);
      if (dados && dados.length > 0) {
        setEstoqueModal(dados);
      }
    } catch (err: any) {
      console.warn('Falha ao sincronizar saldos da ZL0024 do Supabase no modal:', err);
    } finally {
      setAtualizandoEstoque(false);
    }
  }, []);

  useEffect(() => {
    void sincronizarEstoqueSupabase();
  }, [sincronizarEstoqueSupabase]);

  const [data, setData] = useState(registro?.data ?? hojeISO());
  const [turno, setTurno] = useState(registro?.turno ?? pref.turno ?? '');
  const [tipo, setTipo] = useState<TipoMovimentoBalcao>(registro?.tipo_movimento ?? pref.tipo ?? 'saida');
  const [depositoSaida, setDepositoSaida] = useState(() => (registro ? chaveDeposito(registro.deposito_origem) : ''));
  const [colaborador, setColaborador] = useState<{ id: string | null; nome: string; registro: string | null }>(
    registro
      ? { id: registro.colaborador_id, nome: registro.colaborador_nome, registro: registro.colaborador_registro }
      : { id: null, nome: '', registro: null },
  );
  const [observacao, setObservacao] = useState(registro?.observacao ?? '');

  // EPI só sai pela Ficha de EPI: saída manual recusa EPI do Book (o banco confere igual).
  const [codigosEpi, setCodigosEpi] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    carregarCodigosEpiBook().then((c) => { if (vivo) setCodigosEpi(c); });
    return () => { vivo = false; };
  }, []);
  const travaEpi = !origemLiberaEpi(registro?.origem);
  const materiaisJaGravados = useMemo(() => (registro?.itens ?? []).map((i) => i.material), [registro]);

  const depositosAtivos = useMemo(
    () => ordenarDepositos(Object.keys(DEPOSITO_DESCRICAO).filter((d) => !isDepositoInativo(d))),
    [],
  );

  // Estados separados para Saída e Transferência (evita contaminação e campos travados).
  // Na edição, os dois nascem com os itens gravados: trocar o tipo de uma
  // requisição existente (ex.: a baixa de uma retirada sem saldo que na verdade
  // é transferência) mantém os itens e o vínculo com a origem.
  const [gruposSaida, setGruposSaida] = useState<GrupoPepBalcao[]>(() => {
    if (registro && registro.itens && registro.itens.length > 0) {
      const ehSaida = registro.tipo_movimento === 'saida';
      const pepPadrao = ehSaida && registro.aplicacao_pep ? { wbs: registro.aplicacao_pep, nome: registro.aplicacao } : null;
      return agruparLinhasPorPep(
        registro.itens.map((i) => ({
          material: i.material,
          descricao: i.descricao ?? '',
          unidade: i.unidade ?? '',
          quantidade: Number(i.quantidade),
          saldo: estoquePorDeposito.get(chaveDeposito(i.deposito || registro.deposito_origem))?.get(i.material)?.saldo ?? 0,
          aplicacao_pep: ehSaida ? (i.aplicacao_pep || registro.aplicacao_pep) : null,
          aplicacao: ehSaida ? (i.aplicacao || registro.aplicacao) : null,
          deposito: i.deposito || registro.deposito_origem,
          deposito_destino: null,
        })),
        peps,
        pepPadrao,
      );
    }
    return [criarGrupoPep('grupo-1', null, null)];
  });

  const [gruposTransferencia, setGruposTransferencia] = useState<GrupoPepBalcao[]>(() => {
    if (registro && registro.itens && registro.itens.length > 0) {
      const destinoPadrao = registro.deposito_destino || DESTINO_PADRAO_TRANSFERENCIA;
      return agruparLinhasPorDestino(
        registro.itens.map((i) => ({
          material: i.material,
          descricao: i.descricao ?? '',
          unidade: i.unidade ?? '',
          quantidade: Number(i.quantidade),
          saldo: estoquePorDeposito.get(chaveDeposito(i.deposito || registro.deposito_origem))?.get(i.material)?.saldo ?? 0,
          aplicacao_pep: null,
          aplicacao: null,
          deposito: i.deposito || registro.deposito_origem,
          deposito_destino: i.deposito_destino || destinoPadrao,
        })),
        destinoPadrao,
      );
    }
    // Destino padrão da transferência: 0105 (Transferência Produção), o mais usado no balcão.
    const destInicial = DESTINO_PADRAO_TRANSFERENCIA;
    return [criarGrupoPep('grupo-1', null, destInicial)];
  });

  const grupos = tipo === 'saida' ? gruposSaida : gruposTransferencia;
  const setGrupos = (updater: GrupoPepBalcao[] | ((gs: GrupoPepBalcao[]) => GrupoPepBalcao[])) => {
    if (tipo === 'saida') {
      setGruposSaida(updater);
    } else {
      setGruposTransferencia(updater);
    }
  };
  const deposito = depositoSaida;
  const setDeposito = setDepositoSaida;

  const [salvando, setSalvando] = useState(false);
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const todasLinhas = useMemo(
    () => achatarGruposPep(grupos, tipo, tipo === 'saida' ? depositoSaida : undefined),
    [grupos, tipo, depositoSaida],
  );
  const ultimaAplicacao = useMemo(() => ultimaAplicacaoPorColaborador(historico), [historico]);
  const depositosSaida = useMemo(
    () => Array.from(new Set(todasLinhas.map((l) => chaveDeposito(l.deposito)).filter(Boolean))),
    [todasLinhas],
  );

  const trocarTipo = (novoTipo: TipoMovimentoBalcao) => {
    if (novoTipo === tipo) return;
    setTipo(novoTipo);
    setTentouSalvar(false);
  };

  useEffect(() => {
    setGruposSaida((gs) =>
      gs.map((g) => ({
        ...g,
        itens: g.itens.map((it) => ({
          ...it,
          saldo: estoquePorDepositoModal.get(chaveDeposito(it.deposito || depositoSaida))?.get(it.material)?.saldo ?? it.saldo ?? 0,
        })),
      })),
    );
  }, [estoquePorDepositoModal, depositoSaida]);

  useEffect(() => {
    setGruposTransferencia((gs) =>
      gs.map((g) => ({
        ...g,
        itens: g.itens.map((it) => {
          const depDoItem = it.deposito || '0004';
          const disp = estoquePorDepositoModal.get(chaveDeposito(depDoItem));
          return {
            ...it,
            saldo: disp?.get(it.material)?.saldo ?? it.saldo ?? 0,
          };
        }),
      })),
    );
  }, [estoquePorDepositoModal]);

  // Removeu todos os itens na saida: libera o deposito para o proximo item escolher.
  useEffect(() => {
    if (tipo === 'saida' && todasLinhas.length === 0 && !registro) setDepositoSaida('');
  }, [todasLinhas.length, registro, tipo]);

  const escolherColaborador = (p: { id: string | null; nome: string; registro: string | null }) => {
    setColaborador(p);
    if (p.id && tipo === 'saida') {
      const ult = ultimaAplicacao.get(p.id);
      if (ult && gruposSaida.length === 1 && !gruposSaida[0].pep) {
        setGruposSaida((gs) => definirPepDoGrupo(gs, gs[0].id, ult));
      }
    }
  };

  const adicionarNovoGrupo = () => {
    if (tipo === 'transferencia') {
      const destsUsados = new Set(gruposTransferencia.map((g) => g.deposito_destino).filter(Boolean));
      const proximoDest = depositosAtivos.find((d) => !destsUsados.has(d)) || depositosAtivos[0] || '0005';
      setGruposTransferencia((gs) => adicionarGrupoPep(gs, null, proximoDest));
    } else {
      setGruposSaida((gs) => adicionarGrupoPep(gs, null));
    }
  };

  const removerGrupo = (grupoId: string) => {
    setGrupos((gs) => removerGrupoPep(gs, grupoId));
  };

  const alterarPepDoGrupo = (grupoId: string, pep: PepAplicacao | null) => {
    setGruposSaida((gs) => definirPepDoGrupo(gs, grupoId, pep));
  };

  const alterarDestinoDoGrupo = (grupoId: string, novoDest: string) => {
    setGruposTransferencia((gs) => definirDestinoDoGrupo(gs, grupoId, novoDest));
  };

  const adicionarItemNoGrupo = (grupoId: string, item: MaterialNoDeposito, qtd: number) => {
    if (tipo === 'saida' && travaEpi && episRecusados([item.material], codigosEpi, materiaisJaGravados).length > 0) {
      toast.error(`${item.material} é EPI do Book. ${MENSAGEM_EPI_PELA_FICHA}`);
      return;
    }
    if (tipo === 'transferencia') {
      setGruposTransferencia((gs) => adicionarItemAoGrupo(gs, grupoId, item, qtd, 'transferencia'));
    } else {
      // O cabeçalho leva o depósito do 1º item; os demais itens guardam o próprio.
      if (!depositoSaida) setDepositoSaida(item.deposito);
      setGruposSaida((gs) => adicionarItemAoGrupo(gs, grupoId, item, qtd, 'saida'));
    }
  };

  const removerItemDoGrupoIdx = (grupoId: string, itemIdx: number) => {
    setGrupos((gs) => removerItemDoGrupo(gs, grupoId, itemIdx));
  };

  const alterarQtdItemNoGrupo = (grupoId: string, itemIdx: number, qtd: number) => {
    setGrupos((gs) => atualizarQtdItemDoGrupo(gs, grupoId, itemIdx, qtd));
  };

  const primeiroPep = tipo === 'saida' ? (gruposSaida.find((g) => g.pep)?.pep ?? null) : null;
  const gruposSemPep = tipo === 'saida' ? gruposSaida.filter((g) => g.itens.length > 0 && !g.pep) : [];
  const gruposSemDestino = tipo === 'transferencia' ? gruposTransferencia.filter((g) => !g.deposito_destino) : [];
  const primeiroDestino = tipo === 'transferencia' ? (gruposTransferencia.find((g) => g.deposito_destino)?.deposito_destino || gruposTransferencia[0]?.deposito_destino || '') : '';
  const depOrigemCabecalho = tipo === 'transferencia'
    ? (todasLinhas.find((l) => l.deposito)?.deposito || '0004')
    : (todasLinhas.find((l) => l.deposito)?.deposito || depositoSaida);

  const erros = [
    ...validarRequisicao(
      {
        tipoMovimento: tipo,
        depositoOrigem: depOrigemCabecalho,
        depositoDestino: primeiroDestino,
        colaboradorNome: colaborador.nome,
        aplicacao: tipo === 'transferencia' ? 'TRANSFERENCIA' : (primeiroPep?.wbs ?? ''),
      },
      todasLinhas,
    ),
    ...(gruposSemPep.length > 0 ? [`${gruposSemPep.length} grupo(s) com itens sem PEP selecionado.`] : []),
    ...(gruposSemDestino.length > 0 ? [`${gruposSemDestino.length} grupo(s) sem depósito de destino definido.`] : []),
    ...(() => {
      if (tipo !== 'saida' || !travaEpi) return [];
      const epis = episRecusados(todasLinhas.map((l) => l.material), codigosEpi, materiaisJaGravados);
      return epis.length > 0 ? [`EPI do Book na saída (${epis.join(', ')}). ${MENSAGEM_EPI_PELA_FICHA}`] : [];
    })(),
  ];

  const alertas = alertasRequisicao(todasLinhas);

  const pendenteConfirmacao = !!registro?.pendente_confirmacao;
  // Retirada sem saldo (Solicitação Extraordinária): só confirma com saldo na
  // ZL0024 cobrindo cada item no depósito escolhido — é o que mostra que a NF
  // entrou. O banco recusa igual (alm_req_balcao_salvar).
  const daRetiradaSemSaldo = registro?.origem === ORIGEM_RETIRADA_SEM_SALDO;
  /** Requisição gerada pela Ficha de EPI: o banco só aceita os itens da ficha. */
  const daFichaEpi = registro?.origem === 'ficha_epi';
  const itensAindaSemSaldo = daRetiradaSemSaldo ? todasLinhas.filter((l) => !(l.saldo >= l.quantidade)) : [];
  const confirmacaoBloqueada = pendenteConfirmacao && itensAindaSemSaldo.length > 0;

  /** `confirmar`: só vale em requisição pendente — libera para exportação. */
  const salvar = async (continuar: boolean, confirmar = false) => {
    setTentouSalvar(true);
    if (erros.length > 0) {
      toast.error(erros[0]);
      return;
    }
    if (confirmar && confirmacaoBloqueada) {
      toast.error(`Ainda sem saldo na ZL0024: ${itensAindaSemSaldo.map((l) => l.material).join(', ')}. Confirme quando a NF for lançada.`);
      return;
    }
    setSalvando(true);
    try {
      const pepCompatibilidade = peps.find((p) => p.nome.toUpperCase().includes('ALMOXARIFADO'))?.wbs ?? peps[0]?.wbs ?? 'TEN001201016505';

      if (tipo === 'saida') {
        const pepPrincipal = primeiroPep ?? peps[0];
        const codigo = await salvarRequisicaoBalcao(
          registro?.id ?? null,
          {
            data,
            turno: turno || null,
            tipo_movimento: 'saida',
            deposito_origem: depOrigemCabecalho,
            deposito_destino: null,
            colaborador_id: colaborador.id,
            colaborador_nome: colaborador.nome,
            colaborador_registro: colaborador.registro,
            aplicacao_pep: pepPrincipal.wbs,
            aplicacao: pepPrincipal.nome,
            observacao: observacao || null,
            criado_por_nome: user.name,
            confirmar: pendenteConfirmacao && confirmar ? true : undefined,
          },
          todasLinhas.map((l) => ({
            material: l.material,
            quantidade: l.quantidade,
            aplicacao_pep: l.aplicacao_pep || pepPrincipal.wbs,
            aplicacao: l.aplicacao || pepPrincipal.nome,
            descricao: l.descricao,
            unidade: l.unidade,
            deposito: l.deposito || depOrigemCabecalho,
          })),
        );
        gravarPreferencias({ tipo, turno, destino: '' });
        toast.success(
          pendenteConfirmacao && confirmar
            ? `${codigo} confirmada — liberada para exportação.`
            : registro ? `${codigo} atualizada.` : `${codigo} registrada.`,
        );
      } else {
        // Transferência: envios individuais
        if (registro) {
          // Edição de um registro existente
          const depOrigemEfetivo = todasLinhas.find((l) => l.deposito)?.deposito || registro.deposito_origem || '0004';
          const depDestinoEfetivo = gruposTransferencia.find((g) => g.deposito_destino)?.deposito_destino || registro.deposito_destino || DESTINO_PADRAO_TRANSFERENCIA;
          const codigo = await salvarRequisicaoBalcao(
            registro.id,
            {
              data,
              turno: turno || null,
              tipo_movimento: 'transferencia',
              deposito_origem: depOrigemEfetivo,
              deposito_destino: depDestinoEfetivo,
              colaborador_id: colaborador.id,
              colaborador_nome: colaborador.nome,
              colaborador_registro: colaborador.registro,
              aplicacao_pep: pepCompatibilidade,
              aplicacao: 'Transferência entre depósitos',
              observacao: observacao || null,
              criado_por_nome: user.name,
              confirmar: pendenteConfirmacao && confirmar ? true : undefined,
            },
            todasLinhas.map((l) => ({
              material: l.material,
              quantidade: l.quantidade,
              aplicacao_pep: pepCompatibilidade,
              aplicacao: 'Transferência entre depósitos',
              descricao: l.descricao,
              unidade: l.unidade,
              deposito: l.deposito || depOrigemEfetivo,
              deposito_destino: l.deposito_destino || depDestinoEfetivo,
            })),
          );
          gravarPreferencias({ tipo, turno, destino: depDestinoEfetivo });
          toast.success(pendenteConfirmacao && confirmar ? `${codigo} confirmada — liberada para exportação.` : `${codigo} atualizada.`);
        } else {
          // Criação: envios individuais por grupo de destino e por depósito de origem
          const codigosCriados: string[] = [];

          for (const grupo of gruposTransferencia) {
            if (grupo.itens.length === 0) continue;
            const destGrupo = grupo.deposito_destino || DESTINO_PADRAO_TRANSFERENCIA;

            // Agrupa itens do grupo por origem
            const porOrigem = new Map<string, typeof grupo.itens>();
            for (const item of grupo.itens) {
              const orig = item.deposito || '0004';
              if (!porOrigem.has(orig)) porOrigem.set(orig, []);
              porOrigem.get(orig)!.push(item);
            }

            for (const [depOrig, itensOrig] of porOrigem) {
              const codigo = await salvarRequisicaoBalcao(
                null,
                {
                  data,
                  turno: turno || null,
                  tipo_movimento: 'transferencia',
                  deposito_origem: depOrig,
                  deposito_destino: destGrupo,
                  colaborador_id: colaborador.id,
                  colaborador_nome: colaborador.nome,
                  colaborador_registro: colaborador.registro,
                  aplicacao_pep: pepCompatibilidade,
                  aplicacao: 'Transferência entre depósitos',
                  observacao: observacao || null,
                  criado_por_nome: user.name,
                },
                itensOrig.map((l) => ({
                  material: l.material,
                  quantidade: l.quantidade,
                  aplicacao_pep: pepCompatibilidade,
                  aplicacao: 'Transferência entre depósitos',
                  descricao: l.descricao,
                  unidade: l.unidade,
                  deposito: depOrig,
                  deposito_destino: destGrupo,
                })),
              );
              codigosCriados.push(codigo);
            }
          }

          const ultimoDestino = gruposTransferencia[0]?.deposito_destino || '';
          gravarPreferencias({ tipo, turno, destino: ultimoDestino });
          if (codigosCriados.length === 1) {
            toast.success(`${codigosCriados[0]} registrada.`);
          } else if (codigosCriados.length > 1) {
            toast.success(`${codigosCriados.length} transferências registradas: ${codigosCriados.join(', ')}.`);
          }
        }
      }

      await onSalvo(continuar);
      if (continuar) {
        setColaborador({ id: null, nome: '', registro: null });
        if (tipo === 'transferencia') {
          setGruposTransferencia([criarGrupoPep('grupo-1', null, DESTINO_PADRAO_TRANSFERENCIA)]);
        } else {
          setGruposSaida([criarGrupoPep('grupo-1', null, null)]);
          setDepositoSaida('');
        }
        setObservacao('');
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
        <div className="flex w-full items-start justify-between gap-3 pr-2">
          <div>
            <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              {registro ? `Editar ${registro.codigo}` : 'Nova requisição no balcão'}
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              {registro ? 'Os itens serão regravados com o saldo atual da ZL0024.' : `Código ${PREFIXO_REQ_BALCAO}-DDMMAA-NN gerado ao salvar.`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void sincronizarEstoqueSupabase()}
            disabled={atualizandoEstoque}
            className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--brand)', background: 'var(--surface-raised)' }}
            title="Atualizar saldos da ZL0024 diretamente do Supabase"
          >
            <RefreshCw className={`h-3 w-3 ${atualizandoEstoque ? 'animate-spin' : ''}`} />
            {atualizandoEstoque ? 'Sincronizando…' : 'ZL0024 Supabase'}
          </button>
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-5">
          {daFichaEpi && (
            <div
              className="rounded-lg border px-3 py-2.5 text-xs"
              style={{ borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 8%, transparent)', color: 'var(--ink-primary)' }}
              role="note"
            >
              <p className="font-bold">Itens iguais aos da ficha {registro?.origem_ref} (assinada pelo colaborador)</p>
              <p className="mt-0.5">
                Depósito, PEP e turno podem mudar; <strong>material e quantidade não</strong>. Entregou outro tamanho ou outra
                quantidade: o SSMA cancela e refaz a ficha. Item sem saldo: sai pela Retirada sem Saldo vinculada à ficha.
              </p>
            </div>
          )}
          {pendenteConfirmacao && (
            <div
              className="rounded-lg border px-3 py-2.5 text-xs"
              style={{ borderColor: 'var(--status-serious)', background: 'color-mix(in srgb, var(--status-serious) 10%, transparent)', color: 'var(--ink-primary)' }}
            >
              <p className="font-bold" style={{ color: 'var(--status-serious)' }}>
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Pendente de confirmação{registro?.origem_ref ? ` — gerada ${daRetiradaSemSaldo ? 'pela retirada sem saldo' : 'pela ficha'} ${registro.origem_ref}` : ''}
              </p>
              {daRetiradaSemSaldo ? (
                <p className="mt-0.5">
                  O material saiu antes da NF ser lançada. Quando o item tiver saldo na ZL0024, escolha o depósito e o <strong>PEP</strong>
                  (ou troque para <strong>Transferência</strong> e escolha o destino) e <strong>confirme</strong> — a retirada fica baixada e a
                  requisição entra na exportação para o SAP.
                </p>
              ) : (
                <p className="mt-0.5">
                  Confira o depósito e, principalmente, o <strong>PEP</strong> (sugerido pelo setor do colaborador).
                  Só depois de <strong>Confirmar e liberar</strong> ela entra na exportação para o SAP.
                </p>
              )}
              {confirmacaoBloqueada && (
                <p className="mt-1.5 font-bold" style={{ color: 'var(--status-critical)' }}>
                  Ainda sem saldo na ZL0024 — não dá para confirmar:{' '}
                  {itensAindaSemSaldo.map((l) => `${l.material} (precisa ${formatQtd(l.quantidade)}, saldo ${formatQtd(l.saldo)} no ${formatDeposito(l.deposito)})`).join('; ')}.
                </p>
              )}
            </div>
          )}

          {/* Movimento */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Tipo de movimento" obrigatorio>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)' }}>
                {(['saida', 'transferencia'] as TipoMovimentoBalcao[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => trocarTipo(t)}
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

          {/* Colaborador que retira */}
          <Campo rotulo="Colaborador que retira" obrigatorio>
            <SeletorColaborador pessoas={pessoas} valor={colaborador} onChange={escolherColaborador} />
          </Campo>

          {/* Grupos e Itens */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {tipo === 'transferencia' ? 'Grupos por Depósito de Destino e Itens' : 'Grupos de PEP e Itens'}{' '}
                  <span className="text-rose-500">*</span>
                </span>
                <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  {tipo === 'transferencia'
                    ? 'Cada grupo define o depósito de destino dos materiais. O depósito de saída vem de cada item selecionado.'
                    : 'Lance os materiais dentro de cada PEP. Você pode adicionar múltiplos PEPs no mesmo formulário.'}
                </p>
              </div>
              {todasLinhas.length > 0 && (
                <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                  {todasLinhas.length} item(ns)
                  {tipo === 'saida' && depositosSaida.length === 1 && ` · saída do depósito ${formatDeposito(depositosSaida[0])}`}
                  {tipo === 'saida' && depositosSaida.length > 1 && ` · saída de ${depositosSaida.length} depósitos`}
                </span>
              )}
            </div>

            {grupos.map((grupo, gIdx) => {
              const semPepErro = tipo === 'saida' && tentouSalvar && grupo.itens.length > 0 && !grupo.pep;
              const semDestErro = tipo === 'transferencia' && tentouSalvar && !grupo.deposito_destino;
              return (
                <div
                  key={grupo.id}
                  className="rounded-xl border p-3.5 space-y-3 transition-colors"
                  style={{
                    borderColor: semPepErro || semDestErro ? 'var(--status-critical)' : 'var(--hairline)',
                    background: 'var(--surface-raised)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="flex items-center gap-2 min-w-0 flex-1 basis-64">
                      <span
                        className="inline-flex items-center justify-center h-6 w-6 rounded-md text-xs font-black"
                        style={{ background: 'color-mix(in srgb, var(--brand) 15%, transparent)', color: 'var(--brand)' }}
                      >
                        {gIdx + 1}
                      </span>
                      {tipo === 'transferencia' ? (
                        <div className="min-w-0 flex-1">
                          <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                            Depósito de Destino {gIdx + 1} <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={grupo.deposito_destino ?? ''}
                            onChange={(e) => alterarDestinoDoGrupo(grupo.id, e.target.value)}
                            className={inputCls}
                            style={semDestErro ? { borderColor: 'var(--status-critical)' } : undefined}
                          >
                            <option value="">Selecione o depósito de destino…</option>
                            {depositosAtivos.map((d) => (
                              <option key={d} value={d}>
                                {formatDeposito(d)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <label className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                            Aplicação / PEP {gIdx + 1} <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={grupo.pep?.wbs ?? ''}
                            onChange={(e) => alterarPepDoGrupo(grupo.id, peps.find((p) => p.wbs === e.target.value) ?? null)}
                            className={inputCls}
                            style={semPepErro ? { borderColor: 'var(--status-critical)' } : undefined}
                          >
                            <option value="">Selecione o PEP…</option>
                            {grupo.pep && !peps.some((p) => p.wbs === grupo.pep!.wbs) && (
                              <option value={grupo.pep.wbs}>{grupo.pep.nome} — {grupo.pep.wbs}</option>
                            )}
                            {peps.map((p) => <option key={p.wbs} value={p.wbs}>{p.nome} — {p.wbs}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                        {grupo.itens.length} item(ns)
                      </span>
                      {grupos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removerGrupo(grupo.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold hover:bg-[color-mix(in_srgb,var(--status-critical)_12%,transparent)]"
                          style={{ color: 'var(--status-critical)' }}
                          title={tipo === 'transferencia' ? 'Remover este destino' : 'Remover este grupo de PEP'}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> {tipo === 'transferencia' ? 'Remover destino' : 'Remover PEP'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Input de Adicionar Item ao Grupo */}
                  <AdicionarItem
                    codigoLido={gIdx === 0 ? itemQr : null}
                    estoquePorDeposito={estoquePorDepositoModal}
                    depositoFixo={null}
                    depositoPadrao={tipo === 'saida' ? depOrigemCabecalho || null : null}
                    jaLancado={(m, dep) => todasLinhas
                      .filter((l) => l.material === m && chaveDeposito(l.deposito) === chaveDeposito(dep))
                      .reduce((acc, cur) => acc + cur.quantidade, 0)}
                    onAdicionar={(item, qtd) => adicionarItemNoGrupo(grupo.id, item, qtd)}
                  />

                  {/* Lista de itens deste grupo */}
                  {grupo.itens.length > 0 && (
                    <div className="divide-y rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                      {grupo.itens.map((l, i) => {
                        const erro = erroDaLinha(l);
                        const alerta = alertaDaLinha(l);
                        const conflitoDestino = tipo === 'transferencia' && l.deposito && grupo.deposito_destino && chaveDeposito(l.deposito) === chaveDeposito(grupo.deposito_destino);
                        return (
                          <div key={`${l.material}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                            <span className="w-5 text-[11px] font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>{i + 1}</span>
                            <div className="min-w-0 flex-1 basis-48">
                              <div className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.descricao || l.material}</div>
                              <div className="text-[11px]" style={{ color: erro || conflitoDestino ? 'var(--status-critical)' : alerta ? 'var(--status-serious)' : 'var(--ink-muted)' }}>
                                <span className="font-mono">{l.material}</span>
                                {l.deposito && (tipo === 'transferencia' || depositosSaida.length > 1) && (
                                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {' '}· saída de {formatDeposito(l.deposito)}
                                  </span>
                                )}
                                {' '}· saldo {formatQtd(l.saldo)} {l.unidade}
                                {alerta && (
                                  <span className="inline-flex items-center gap-0.5 ml-1 font-bold text-amber-700 dark:text-amber-300">
                                    · ⚠️ {alerta}
                                  </span>
                                )}
                                {conflitoDestino && (
                                  <span className="inline-flex items-center gap-0.5 ml-1 font-bold text-rose-600 dark:text-rose-400">
                                    · ⚠️ saída igual ao destino ({l.deposito})
                                  </span>
                                )}
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
                                onChange={(e) => alterarQtdItemNoGrupo(grupo.id, i, parseFloat(e.target.value) || 0)}
                                aria-label={`Quantidade de ${l.material}`}
                                className={`${inputCls} w-24 text-right tabular-nums`}
                                style={erro || conflitoDestino ? { borderColor: 'var(--status-critical)' } : alerta ? { borderColor: 'var(--status-serious)' } : undefined}
                              />
                              <span className="w-8 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{l.unidade}</span>
                              <button
                                type="button"
                                onClick={() => removerItemDoGrupoIdx(grupo.id, i)}
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
              );
            })}

            {/* Botão para adicionar outro grupo */}
            <button
              type="button"
              onClick={adicionarNovoGrupo}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-xs font-bold transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'transparent' }}
            >
              <FolderPlus className="h-4 w-4" /> {tipo === 'transferencia' ? 'Adicionar outro destino' : 'Adicionar outro PEP'}
            </button>
          </div>

          <Campo rotulo="Observação">
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls} />
          </Campo>

          {/* Alertas de itens sem saldo */}
          {alertas.length > 0 && (
            <div className="rounded-lg p-2.5 text-xs flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-bold">Aviso de saldo na ZL0024:</span>
                <p className="text-[11px] mt-0.5">
                  Há itens com quantidade acima do saldo ou sem saldo positivo na ZL0024. Eles serão registrados normalmente
                  (possível defasagem na importação da planilha) e deverão ser conferidos antes da importação no SAP.
                </p>
              </div>
            </div>
          )}

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
          {pendenteConfirmacao ? (
            <>
              <button
                onClick={() => void salvar(false)}
                disabled={salvando}
                className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50"
                style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
                title="Grava os ajustes e continua pendente"
              >
                Salvar sem liberar
              </button>
              <button
                onClick={() => void salvar(false, true)}
                disabled={salvando || confirmacaoBloqueada}
                title={confirmacaoBloqueada ? 'Item ainda sem saldo na ZL0024 — confirme quando a NF for lançada' : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirmar e liberar para exportação
              </button>
            </>
          ) : (
            <button
              onClick={() => void salvar(false)}
              disabled={salvando}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar
            </button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Linha de entrada rápida: busca (código ou descrição) → Enter escolhe →
 * quantidade → Enter adiciona e devolve o foco à busca.
 * Permite adicionar itens com ou sem saldo na ZL0024 (sinalizados como alerta).
 */
function AdicionarItem({
  refBusca, codigoLido, estoquePorDeposito, depositoFixo, depositoPadrao, jaLancado, onAdicionar,
}: {
  refBusca?: React.RefObject<HTMLInputElement | null>;
  /** Código vindo do link do QR (fora deste seletor); `n` muda a cada leitura. */
  codigoLido?: { codigo: string; n: number } | null;
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>;
  depositoFixo: string | null;
  /** Depósito do item digitado sem saldo na ZL0024 (o do 1º item da requisição). */
  depositoPadrao?: string | null;
  /** Quantidade já lançada deste material saindo deste depósito. */
  jaLancado: (material: string, deposito: string) => number;
  onAdicionar: (item: MaterialNoDeposito, quantidade: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [escolhido, setEscolhido] = useState<MaterialNoDeposito | null>(null);
  const [qtd, setQtd] = useState('');
  const [lendoQr, setLendoQr] = useState(false);
  const toast = useToast();
  const qtdRef = useRef<HTMLInputElement>(null);
  const inputRefLocal = useRef<HTMLInputElement>(null);
  const inputEfetivo = refBusca ?? inputRefLocal;

  // 0105 (Transferência Produção) é só destino: nunca há saída dele, então não é opção de item.
  const estoqueComSaida = useMemo(() => semDepositosSemSaida(estoquePorDeposito), [estoquePorDeposito]);
  // A lista de escolha não mostra material com saldo 0 na ZL0024 (o QR e o "Adicionar sem saldo" seguem aceitando).
  const estoqueComSaldo = useMemo(() => somenteComSaldo(estoqueComSaida), [estoqueComSaida]);
  const resultados = useMemo(
    () => buscarMateriaisEmDepositos(estoqueComSaldo, texto, depositoFixo, isDepositoInativo),
    [estoqueComSaldo, texto, depositoFixo],
  );
  const totalMateriais = depositoFixo
    ? estoqueComSaldo.get(depositoFixo)?.size ?? 0
    : new Set([...estoqueComSaldo.values()].flatMap((m) => [...m.keys()])).size;

  const escolher = (m: MaterialNoDeposito | undefined) => {
    if (!m) return;
    setEscolhido(m);
    setTexto('');
    setAberto(false);
    setQtd('');
    setTimeout(() => qtdRef.current?.focus(), 0);
  };

  /**
   * QR da etiqueta de prateleira: escolhe o item (no depósito com saldo) e leva
   * o cursor para a quantidade. Código fora da ZL0024 entra como o digitado
   * "sem saldo", com o mesmo alerta.
   */
  const escolherPorCodigo = (codigo: string) => {
    const achado = localizarMaterialParaSaida(estoqueComSaida, codigo, depositoFixo || depositoPadrao, isDepositoInativo);
    if (achado) {
      escolher(achado);
      return;
    }
    toast.warning(`Item ${codigo} não está na ZL0024 — entra sem saldo (alerta).`);
    escolher({
      material: codigo,
      descricao: `Material ${codigo}`,
      unidade: 'UN',
      saldo: 0,
      deposito: depositoFixo || depositoPadrao || '0002',
    });
  };

  const aoLerQr = (texto: string) => {
    setLendoQr(false);
    const codigo = codigoDoQr(texto);
    if (!codigo) {
      toast.error('Este QR não é de etiqueta de material do SISTEN.');
      return;
    }
    escolherPorCodigo(codigo);
  };

  // Link do QR aberto pela câmera comum: escolhe assim que o estoque carregar.
  const codigoAplicado = useRef(0);
  useEffect(() => {
    if (!codigoLido || codigoLido.n <= codigoAplicado.current || estoqueComSaida.size === 0) return;
    codigoAplicado.current = codigoLido.n;
    escolherPorCodigo(codigoLido.codigo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoLido, estoqueComSaida]);

  const leitor = lendoQr && (
    <LeitorQrModal onLido={aoLerQr} onClose={() => setLendoQr(false)} />
  );

  const quantidade = parseFloat(qtd.replace(',', '.'));
  const restante = escolhido ? escolhido.saldo - jaLancado(escolhido.material, escolhido.deposito) : 0;
  const semSaldo = restante <= 0;
  const qtdAcimaSaldo = quantidade > restante && restante > 0;
  const qtdInvalida = !(quantidade > 0);

  const adicionar = () => {
    if (!escolhido || qtdInvalida) return;
    onAdicionar(escolhido, quantidade);
    setEscolhido(null);
    setQtd('');
    setTimeout(() => inputEfetivo.current?.focus(), 0);
  };

  if (escolhido) {
    return (
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
        style={{
          borderColor: semSaldo ? 'var(--status-serious)' : 'var(--brand)',
          background: semSaldo ? 'color-mix(in srgb, var(--status-serious) 6%, transparent)' : 'color-mix(in srgb, var(--brand) 5%, transparent)',
        }}
      >
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{escolhido.descricao}</div>
          <div className="text-[11px] flex flex-wrap items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
            <span className="font-mono font-semibold">{escolhido.material}</span>
            <span>· Dep. {formatDeposito(escolhido.deposito)}</span>
            {semSaldo ? (
              <span className="inline-flex items-center gap-0.5 font-bold text-amber-700 dark:text-amber-300">
                · ⚠️ sem saldo ZL0024 (alerta)
              </span>
            ) : (
              <span>· disponível {formatQtd(restante)} {escolhido.unidade}</span>
            )}
            {qtdAcimaSaldo && (
              <span className="inline-flex items-center gap-0.5 font-bold text-amber-700 dark:text-amber-300">
                · ⚠️ acima do saldo ({formatQtd(restante)} disp.)
              </span>
            )}
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
            if (e.key === 'Escape') { e.preventDefault(); setEscolhido(null); inputEfetivo.current?.focus(); }
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

  const temSugestaoAvulsa = texto.trim().length > 0;
  const maxAtivo = resultados.length + (temSugestaoAvulsa ? 0 : -1);

  return (
    <div className="flex items-stretch gap-2">
    {leitor}
    <button
      type="button"
      onClick={() => setLendoQr(true)}
      title="Ler o QR da etiqueta da prateleira com a câmera"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white"
      style={{ background: 'var(--brand)' }}
    >
      <QrCode className="h-4 w-4" />
      <span>Ler QR</span>
    </button>
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
      <input
        ref={inputEfetivo}
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); setAtivo(0); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, maxAtivo)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (ativo < resultados.length) {
              escolher(resultados[ativo]);
            } else if (temSugestaoAvulsa) {
              escolher({
                material: texto.trim().toUpperCase(),
                descricao: `Material ${texto.trim().toUpperCase()}`,
                unidade: 'UN',
                saldo: 0,
                deposito: depositoFixo || depositoPadrao || '0002',
              });
            }
          }
        }}
        placeholder={depositoFixo
          ? `Código ou descrição do material (${totalMateriais} materiais em ${depositoFixo})`
          : `Código ou descrição do material (${totalMateriais} materiais) — o depósito vem do item`}
        className={`${inputCls} pl-8`}
      />
      {aberto && texto.trim() && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          {resultados.map((m, i) => (
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
                  <span className={`block tabular-nums font-bold ${m.saldo <= 0 ? 'text-amber-700 dark:text-amber-400' : ''}`} style={{ color: m.saldo <= 0 ? undefined : 'var(--ink-muted)' }}>
                    {m.saldo <= 0 ? '0 UN (sem saldo)' : `${formatQtd(m.saldo)} ${m.unidade}`}
                  </span>
                  <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{formatDeposito(m.deposito)}</span>
                </span>
              </button>
            </li>
          ))}
          {temSugestaoAvulsa && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher({
                    material: texto.trim().toUpperCase(),
                    descricao: `Material ${texto.trim().toUpperCase()}`,
                    unidade: 'UN',
                    saldo: 0,
                    deposito: depositoFixo || depositoPadrao || '0002',
                  });
                }}
                className="block w-full px-3 py-2 text-left text-xs italic"
                style={{
                  background: ativo === resultados.length ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : undefined,
                  color: 'var(--ink-secondary)',
                }}
              >
                Adicionar “{texto.trim().toUpperCase()}” sem saldo na ZL0024
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
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
  const toast = useToast();
  const [baixando, setBaixando] = useState<string | null>(null);

  async function baixarOriginal(lote: ReqBalcaoExportacao) {
    setBaixando(lote.id);
    try {
      baixarPlanilhaBalcao(await buscarOriginalExportacaoBalcao(lote), lote.arquivo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível baixar o arquivo original.');
    } finally {
      setBaixando(null);
    }
  }

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
                <div className="flex flex-wrap items-center gap-3">
                  {originalBalcaoDisponivel(lote) ? (
                    <button
                      type="button"
                      onClick={() => void baixarOriginal(lote)}
                      disabled={baixando !== null}
                      aria-label={`Baixar original ${lote.arquivo}`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-bold hover:underline disabled:opacity-50"
                      style={{ color: 'var(--brand)' }}
                    >
                      {baixando === lote.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Baixar original
                    </button>
                  ) : (
                    <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {lote.original_path ? 'Prazo de download encerrado' : 'Original não arquivado'}
                    </span>
                  )}
                  {vigentes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onReabrir(lote, vigentes)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline"
                      style={{ color: 'var(--brand)' }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                    </button>
                  )}
                </div>
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
  const temSemSaldo = r.itens.some((i) => (i.saldo_zl0024 != null && i.saldo_zl0024 <= 0) || i.sem_saldo);
  const isTransferencia = r.tipo_movimento === 'transferencia';
  const pepsDistintos = isTransferencia ? [] : Array.from(new Set(r.itens.map((i) => i.aplicacao_pep || r.aplicacao_pep).filter(Boolean)));
  const depositosDistintos = Array.from(new Set(r.itens.map((i) => i.deposito || r.deposito_origem).filter(Boolean)));
  const destinosDistintos = isTransferencia ? Array.from(new Set(r.itens.map((i) => i.deposito_destino || r.deposito_destino).filter(Boolean))) : [];

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel={`Detalhes de ${r.codigo}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>{r.codigo}</h2>
          <ChipTipo tipo={r.tipo_movimento} />
          {r.pendente_confirmacao && <ChipPendenteConfirmacao origemRef={r.origem_ref} />}
          <ChipDocSap doc={r.doc_sap} semDocParcial={itensSemDocParcial(r)} />
          {r.exportacao_id && <ChipExportada />}
          {temSemSaldo && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
              title="Contém itens sem saldo na ZL0024"
            >
              <AlertTriangle className="h-3 w-3" /> Sem saldo ZL0024
            </span>
          )}
          {pepsDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
            >
              <Layers className="h-3 w-3" /> {pepsDistintos.length} grupos de PEP
            </span>
          )}
          {depositosDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
            >
              <Layers className="h-3 w-3" /> {depositosDistintos.length} depósitos de saída
            </span>
          )}
          {destinosDistintos.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}
            >
              <Layers className="h-3 w-3" /> {destinosDistintos.length} depósitos de destino
            </span>
          )}
        </div>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          {temSemSaldo && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Esta requisição contém itens lançados sem saldo registrado na ZL0024. Confirme o estoque físico antes de processar no SAP.</span>
            </div>
          )}

          <div>
            <Linha rotulo="Data / turno" valor={`${formatDateBR(r.data)}${r.turno ? ` · ${r.turno}` : ''}`} />
            <Linha rotulo="Colaborador" valor={`${r.colaborador_nome}${r.colaborador_registro ? ` · ${r.colaborador_registro}` : ''}`} />
            {isTransferencia ? (
              <Linha rotulo="Finalidade" valor="Transferência entre depósitos (sem PEP)" />
            ) : (
              <Linha
                rotulo="Aplicação (PEP)"
                valor={
                  pepsDistintos.length > 1 ? (
                    <span>
                      {pepsDistintos.length} grupos de PEP distintos (detalhes na tabela abaixo)
                    </span>
                  ) : r.aplicacao_pep ? (
                    <>{r.aplicacao} · <span className="font-mono">{r.aplicacao_pep}</span></>
                  ) : (
                    r.aplicacao
                  )
                }
              />
            )}
            <Linha
              rotulo="Depósito de saída"
              valor={depositosDistintos.length > 1 ? depositosDistintos.map((d) => formatDeposito(d)).join(', ') : formatDeposito(r.deposito_origem)}
            />
            {r.tipo_movimento === 'transferencia' && (
              <Linha
                rotulo="Depósito de destino"
                valor={destinosDistintos.length > 1 ? destinosDistintos.map((d) => formatDeposito(d)).join(', ') : (r.deposito_destino ? formatDeposito(r.deposito_destino) : 'Definir no SAP')}
              />
            )}
            <Linha rotulo="Observação" valor={r.observacao} />
            <Linha rotulo="Doc. SAP" valor={r.doc_sap ? `${r.doc_sap} · ${r.doc_sap_por ?? ''} em ${formatDateTimeBR(r.doc_sap_em)}` : null} />
            <Linha rotulo="Origem" valor={r.origem === 'ficha_epi' ? `Ficha de EPI ${r.origem_ref ?? ''}`.trim() : r.origem === ORIGEM_RETIRADA_SEM_SALDO ? `Retirada sem saldo ${r.origem_ref ?? ''}`.trim() : null} />
            <Linha rotulo="Confirmação" valor={r.confirmada_em ? `${r.confirmada_por ?? '—'} em ${formatDateTimeBR(r.confirmada_em)}` : r.pendente_confirmacao ? 'Pendente — não entra na exportação' : null} />
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
                  <th className="px-3 py-2 text-left font-bold">{isTransferencia ? 'Dep. Saída' : 'PEP / Aplicação'}</th>
                  {isTransferencia && <th className="px-3 py-2 text-left font-bold">Dep. Destino</th>}
                  <th className="px-3 py-2 text-right font-bold">Qtd</th>
                  <th className="px-3 py-2 text-left font-bold">Un</th>
                  <th className="px-3 py-2 text-left font-bold">Doc. SAP</th>
                </tr>
              </thead>
              <tbody>
                {r.itens.map((i, n) => {
                  const pepItem = i.aplicacao_pep || r.aplicacao_pep;
                  const descPep = i.aplicacao || r.aplicacao;
                  const itemSemSaldo = (i.saldo_zl0024 != null && i.saldo_zl0024 <= 0) || i.sem_saldo;
                  return (
                    <tr key={i.id} className="border-t" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                      <td className="px-3 py-2 tabular-nums">{n + 1}</td>
                      <td className="px-3 py-2 font-mono">
                        {i.material}
                        {itemSemSaldo && (
                          <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            ⚠️ Sem saldo ZL0024
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{i.descricao}</td>
                      <td className="px-3 py-2">
                        {isTransferencia ? (
                          <span className="font-mono font-semibold">{formatDeposito(i.deposito || r.deposito_origem)}</span>
                        ) : pepItem ? (
                          <div>
                            <span className="font-medium">{descPep || '—'}</span>
                            <span className="block font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{pepItem}</span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      {isTransferencia && (
                        <td className="px-3 py-2">
                          <span className="font-mono font-semibold">{formatDeposito(i.deposito_destino || r.deposito_destino || '') || '—'}</span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{formatQtd(i.quantidade)}</td>
                      <td className="px-3 py-2">{i.unidade}</td>
                      <td className="px-3 py-2 font-mono">
                        {i.doc_sap ?? '—'}
                        {i.status_processamento && <span className="block font-sans text-[10px]" style={{ color: 'var(--ink-muted)' }}>{i.status_processamento}</span>}
                      </td>
                    </tr>
                  );
                })}
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
              {r.pendente_confirmacao ? (
                <button onClick={onEditar} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
                  <Check className="h-3.5 w-3.5" /> Conferir e confirmar
                </button>
              ) : (
                <button onClick={onEditar} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Editar</button>
              )}
            </>
          )}
          {!r.pendente_confirmacao && (
            <button onClick={onDocSap} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
              <FileCheck2 className="h-3.5 w-3.5" /> {r.doc_sap ? 'Alterar doc. SAP' : 'Informar doc. SAP'}
            </button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}

const ROTULO_SITUACAO: Record<SituacaoImportacao, { texto: string; token: string }> = {
  novo: { texto: 'Novo', token: 'var(--status-good)' },
  diferente: { texto: 'Substitui', token: 'var(--status-serious)' },
  igual: { texto: 'Já gravado', token: 'var(--ink-muted)' },
  nao_encontrado: { texto: 'Não encontrado', token: 'var(--status-critical)' },
};

type EtapaImportacao = 'previa' | 'conferencia';

const ROTULO_ETAPA: Record<EtapaImportacao, string> = {
  previa: '1. Prévia',
  conferencia: '2. Conferência com a MB51',
};

function ConferenciaMb03Planilha({ dados }: { dados: NonNullable<LeituraPlanilhaBalcao['linhas'][number]['conferenciaSap']> }) {
  return (
    <details className="max-w-sm text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
      <summary className="cursor-pointer font-bold">{dados.resultado || 'Pendente'}</summary>
      <div className="mt-1 space-y-1">
        <p>Pronto? {dados.pronto || '—'} · Ano {dados.ano || '—'}</p>
        <p>Conferido em {dados.conferidoEm || '—'} · Tempo {dados.tempoSegundos || '—'} s</p>
        {dados.mensagem && <p className="whitespace-normal break-words">{dados.mensagem}</p>}
      </div>
    </details>
  );
}

/**
 * Importação da planilha concluída em duas etapas (a MB51 não precisa estar
 * atualizada antes — o que ela ainda não tem aparece como "sem MB51" na
 * conferência, que pode ser refeita depois):
 * 1. Prévia — o que cada linha faz antes de gravar; só vão para o banco as
 *    linhas "Novo" e "Substitui". Baixas SAP exige CONFIRMADO na MB03.
 * 2. Conferência — depois de gravar, cada documento × material da planilha
 *    contra a MB51, com o que falta para correção.
 * `visivel` = false esconde a janela sem perder a etapa (enquanto o detalhe
 * de uma requisição está aberto por cima).
 */
function ModalImportacaoSap({
  visivel, arquivo, leitura, requisicoes, podeImportarMb51, podeAbrirRelatorio, onAbrirRelatorio, onAbrirRequisicao,
  onClose, onConfirmar,
}: {
  visivel: boolean;
  arquivo: string;
  leitura: LeituraPlanilhaBalcao;
  requisicoes: ReqBalcaoRow[];
  podeImportarMb51: boolean;
  podeAbrirRelatorio: boolean;
  onAbrirRelatorio: () => void;
  onAbrirRequisicao: (requisicaoId: string, codigo: string) => void;
  onClose: () => void;
  /** Devolve true quando gravou — aí segue para a conferência. `onFase` move a barra de progresso. */
  onConfirmar: (
    linhas: LeituraPlanilhaBalcao['linhas'],
    naoEnviadas: (LeituraPlanilhaBalcao['linhas'][number] & { situacao: SituacaoImportacao })[],
    onFase: (fase: FaseGravacao) => void,
  ) => Promise<boolean>;
}) {
  const [etapa, setEtapa] = useState<EtapaImportacao>('previa');
  const [gravando, setGravando] = useState(false);
  const [fase, setFase] = useState<FaseGravacao | null>(null);

  // Gravando: fechar a aba/recarregar pede confirmação (interromperia a importação).
  useEffect(() => {
    if (!gravando) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [gravando]);
  const fechar = () => { if (!gravando) onClose(); };
  const docs = useMemo(() => documentosDaPlanilha(leitura.linhas), [leitura]);
  const classificadas = useMemo(() => classificarImportacao(leitura.linhas, requisicoes), [leitura, requisicoes]);
  const aGravar = classificadas.filter((l) => l.situacao === 'novo' || l.situacao === 'diferente');
  const naoEnviadas = classificadas.filter((l) => l.situacao !== 'novo' && l.situacao !== 'diferente');
  const conta = (s: SituacaoImportacao) => classificadas.filter((l) => l.situacao === s).length;

  const gravar = async () => {
    setGravando(true);
    setFase('preparando');
    try {
      if (await onConfirmar(aGravar, naoEnviadas, setFase)) {
        setFase('concluido');
        await new Promise((ok) => setTimeout(ok, 600));
        setEtapa('conferencia');
      }
    } finally {
      setGravando(false);
      setFase(null);
    }
  };

  if (!visivel) return null;

  return (
    <Modal
      onClose={fechar}
      maxWidth={etapa === 'conferencia' ? 'max-w-6xl' : leitura.exigeConferenciaSap ? 'max-w-5xl' : 'max-w-3xl'}
      ariaLabel="Importar planilha concluída"
      disableOutsideClose={gravando}
    >
      <ModalHeader onClose={gravando ? undefined : fechar}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Importar planilha concluída</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {arquivo} · doc. SAP lido da coluna “{leitura.colunaSap}” · {leitura.totalLinhas} linha(s)
          {leitura.semDocSap > 0 && <> · {leitura.semDocSap} sem doc. SAP</>}
          {leitura.semCodigo > 0 && <> · {leitura.semCodigo} sem código RQB</>}
        </p>
        <ol className="mt-1.5 flex flex-wrap gap-1" aria-label="Etapas da importação">
          {(Object.keys(ROTULO_ETAPA) as EtapaImportacao[]).map((e) => (
            <li
              key={e}
              aria-current={etapa === e ? 'step' : undefined}
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={etapa === e
                ? { background: 'var(--brand)', color: '#fff' }
                : { background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)', color: 'var(--ink-secondary)' }}
            >
              {ROTULO_ETAPA[e]}
            </li>
          ))}
        </ol>
      </ModalHeader>
      <ModalBody>
        {etapa === 'conferencia' && (
          <ConferenciaImportacao docs={docs} linhasPlanilha={linhasComDocumento(leitura.linhas)} podeImportarMb51={podeImportarMb51} onAbrirRequisicao={onAbrirRequisicao} />
        )}
        {etapa === 'previa' && fase && <ProgressoGravacao fase={fase} linhas={aGravar.length + naoEnviadas.length} />}
        {etapa === 'previa' && !fase && <>
        {leitura.exigeConferenciaSap && (
          <p className="mb-3 text-xs" style={{ color: 'var(--ink-secondary)' }}>
            Conferência MB03 lida da planilha Baixas SAP. Só entram na gravação as linhas com documento SAP e Conferência SAP igual a CONFIRMADO.
          </p>
        )}
        {leitura.linhasBloqueadas.length > 0 && (
          <div className="mb-3 rounded-lg border p-3" style={{ borderColor: 'var(--status-serious)', color: 'var(--ink-primary)' }}>
            <p className="text-xs font-bold">{leitura.linhasBloqueadas.length} linha(s) bloqueada(s) na conferência MB03</p>
            <ul className="mt-2 space-y-2 text-xs">
              {leitura.linhasBloqueadas.map((l, k) => (
                <li key={k}>
                  <p><span className="font-mono">{l.codigo} · {l.material} · SAP {l.docSap || '—'}</span> · {l.motivo}</p>
                  {l.conferenciaSap && <ConferenciaMb03Planilha dados={l.conferenciaSap} />}
                </li>
              ))}
            </ul>
          </div>
        )}
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
                  {leitura.exigeConferenciaSap && <th className="px-3 py-2 text-left font-bold">Conferência MB03</th>}
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
                    {leitura.exigeConferenciaSap && (
                      <td className="px-3 py-2">{l.conferenciaSap && <ConferenciaMb03Planilha dados={l.conferenciaSap} />}</td>
                    )}
                    <td className="px-3 py-2 font-bold" style={{ color: ROTULO_SITUACAO[l.situacao].token }}>{ROTULO_SITUACAO[l.situacao].texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full flex-wrap justify-end gap-2">
          {etapa === 'previa' && (
            <>
              <button onClick={onClose} disabled={gravando} className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
              <button
                onClick={() => void gravar()}
                disabled={gravando || leitura.totalLinhas === 0}
                title={aGravar.length === 0 ? 'Nada a gravar — registra a leitura no log da importação' : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                {gravando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {aGravar.length > 0 ? `Gravar ${aGravar.length} item(ns)` : 'Só registrar no log'}
              </button>
            </>
          )}
          {etapa === 'conferencia' && (
            <>
              {podeAbrirRelatorio && (
                <button onClick={onAbrirRelatorio} className="mr-auto rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                  Abrir Relatório × MB51
                </button>
              )}
              <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Pode fechar: confira de novo depois em <strong>Conferir × MB51</strong>.
              </span>
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>Fechar</button>
            </>
          )}
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Abrir RM.
 *
 * Fila das solicitações de compra já aprovadas, prontas para virar RM no SAP.
 * O almoxarife marca as que vai abrir, exporta a planilha padrão (uma linha
 * por item) e o lote fica registrado — daí em diante a solicitação aparece
 * como "Exportada", e o filtro "Não exportadas" mostra só o que ainda falta.
 *
 * Reexportar é legítimo (planilha perdida, RM recusada no SAP), então o
 * histórico permite reabrir um lote inteiro ou uma solicitação só: ela volta
 * para a fila carregando a observação de que já saiu, por quem e quando.
 *
 * Reabertura manual (o almoxarife decide reexportar) e reabertura automática
 * (o solicitante editou a compra depois que ela já tinha saído — ver
 * `saveRequestEdit` em `db/localDb.ts`) são coisas diferentes: a primeira
 * volta para a fila normal, pronta para um novo export; a segunda cai no
 * grupo em destaque "Editar no SAP", porque o RM já pode existir lá e o
 * ajuste é manual, não uma nova planilha. A distinção é só a presença de
 * `reaberto_motivo` na marca (`lib/almoxarifadoRmApi.ts`).
 *
 * As regras de conversão para a planilha (depósito, classificação, campo Z,
 * texto de cabeçalho) estão em `lib/almoxarifadoRm.ts`; o log, em
 * `lib/almoxarifadoRmApi.ts`; o diff de edição, em `lib/solicitacoesDiff.ts`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Calendar, Check, CheckSquare,
  ChevronDown, ChevronRight, Copy, Download, FileSpreadsheet, Hash, History, Info,
  Link2, Loader2, MessageSquare, MinusCircle, PackageSearch, Pencil, PlusCircle,
  RefreshCw, Search, Square, Tag, Upload, User, HelpCircle, Bug, Lightbulb,
  Filter, ClipboardCheck, RotateCcw, Wrench, type LucideIcon,
} from 'lucide-react';
import { localDb } from '../db/localDb';
import type {
  AlmoxRmExportacao, AlmoxRmExportacaoSolicitacao, Profile, Request, RequestItem, Sector,
} from '../types';
import { formatDateBR, formatDateTimeBR } from '../lib/format';
import { rotuloCriticidade } from '../lib/solicitacoes';
import { classificarMudanca, dividirMudancas, type TipoMudanca } from '../lib/solicitacoesDiff';
import {
  RM_CENTRO, RM_GRUPO_COMPRAS_PADRAO, campoZRm, classificacaoRm, classificarVinculoRm,
  depositoRm, escolherAbaRmPreenchida, exportarPlanilhaRm, grupoComprasRm, itensSemCodigoSap,
  itensSemGrupoComprador, lerPlanilhaRmPreenchida, montarLinhasRm, nomeArquivoRm, RM_COLUNAS,
  requisitanteRm, type ContextoRm, type LinhaRm, type SolicitacaoRm,
} from '../lib/almoxarifadoRm';
import {
  agruparMarcasPorExportacao, buscarGruposMercadoriaPorCodigosSap, concluirAjusteSapRm,
  indexarExportacaoVigente, indexarUltimaExportacao, liberarParaExportarRm, listarExportacoesRm,
  listarMarcasExportacaoRm, reabrirExportacaoRm, reabrirSolicitacaoExportadaRm,
  registrarExportacaoRm,
} from '../lib/almoxarifadoRmApi';
import { mapaGrupoComprasPorMercadoria } from '../lib/grupoCompradorApi';
import { useToast } from '../components/ui/Toast';
import { TableEmpty } from '../components/ui/DataTable';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../components/ui/Modal';
import TourSpotlight from '../components/help/TourSpotlight';
import { usePageTour } from '../components/help/TourRegistryContext';
import type { TourStep } from '../components/help/types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ABRIR_RM_TOUR_STEPS: TourStep[] = [
  {
    icon: ClipboardCheck,
    title: 'Da solicitação aprovada para a RM',
    description: 'Esta tela reúne todas as solicitações de compra já aprovadas pelo gestor e ainda sem RM. Selecione as que vão para o SAP e exporte a planilha padrão de abertura.',
  },
  {
    target: 'abrir-rm-abas',
    icon: FileSpreadsheet,
    title: 'Duas abas: Para Abrir e Abertas',
    description: '"Para Abrir" é a fila de quem ainda não saiu no SAP. "Abertas" reúne o que já foi exportado, para você digitar (ou importar de uma planilha) o número da RM de volta.',
  },
  {
    target: 'abrir-rm-kpis',
    icon: PackageSearch,
    title: 'Quanto ainda falta abrir',
    description: 'Aprovadas no total, quantas ainda não foram exportadas, e o tamanho da seleção atual em solicitações e itens — cada item vira uma linha da planilha.',
  },
  {
    target: 'abrir-rm-editar-sap',
    icon: Wrench,
    title: 'Editar no SAP: alterada depois de exportada',
    description: 'Quando o solicitante edita uma compra que já saiu numa planilha, ela reabre sozinha e cai neste grupo em destaque — o RM já pode existir no SAP, então o ajuste é manual lá. A lista mostra exatamente o que mudou, item por item. Selecione e clique em "Concluído" depois de corrigir no SAP, ou em "Habilitar Exportar" se a RM nunca chegou a ser criada — ela volta para a fila normal.',
  },
  {
    target: 'abrir-rm-filtros',
    icon: Filter,
    title: 'Filtros e o status de exportação',
    description: 'Busque por número, solicitante ou material e recorte por setor, classificação e depósito. O filtro "Não exportadas" é o que mostra a fila real de trabalho.',
  },
  {
    target: 'abrir-rm-lista',
    icon: CheckSquare,
    title: 'Seleção e conferência item a item',
    description: 'Marque as solicitações que vão no lote. Abra a linha para conferir código SAP, quantidade e observação de cada item antes de exportar.',
  },
  {
    target: 'abrir-rm-exportar',
    icon: Download,
    title: 'Exportar e registrar o lote',
    description: 'A planilha sai com uma linha por item, já com depósito, centro, grupo de compras, requisitante e texto de cabeçalho preenchidos. O lote fica gravado no log.',
  },
  {
    target: 'abrir-rm-historico',
    icon: History,
    title: 'Histórico de exportações',
    description: 'Todo lote exportado fica registrado com arquivo, responsável, data e volume. Abra "Solicitações" para ver os números que compuseram a planilha, e use "Reabrir" para devolver o lote (ou uma solicitação só) à fila e exportar de novo — o registro anterior continua no histórico.',
  },
  {
    target: 'abrir-rm-vincular-upload',
    icon: Upload,
    title: 'Trazer a RM de volta em lote',
    description: 'Na aba Abertas, importe a mesma planilha que você exportou (ou o controle do comprador, mesmo em .xlsm com macro — lê a aba "BD" quando existe), agora com a coluna "Status / Nº da RM" preenchida. O sistema casa cada linha pela solicitação e só atualiza o que for novo ou diferente.',
  },
  {
    target: 'help-button',
    icon: HelpCircle,
    title: 'Reabra o tour a qualquer momento',
    description: 'Clique neste botão no canto inferior e escolha "Tour guiado desta página" para rever estas dicas.',
  },
  {
    target: 'help-button',
    icon: Bug,
    title: 'Encontrou um erro nesta tela?',
    description: 'No mesmo botão, escolha "Reportar um erro" — o histórico técnico recente da sessão vai junto para o time responsável.',
  },
  {
    target: 'help-button',
    icon: Lightbulb,
    title: 'Tem uma ideia de melhoria?',
    description: 'Escolha "Enviar sugestão" no mesmo botão para propor uma melhoria sem sair da tela.',
  },
];

type FiltroExportacao = 'nao_exportadas' | 'exportadas' | 'todas';

/** Ícone e cor de cada categoria de mudança — a mesma frase de `descreverAlteracoesCompra`, olhada de outro jeito. */
const ICONE_MUDANCA: Record<TipoMudanca, { Icon: LucideIcon; cor: string }> = {
  item_incluido: { Icon: PlusCircle, cor: 'var(--status-good)' },
  item_removido: { Icon: MinusCircle, cor: 'var(--status-critical)' },
  quantidade_aumentada: { Icon: ArrowUpCircle, cor: 'var(--status-serious)' },
  quantidade_reduzida: { Icon: ArrowDownCircle, cor: 'var(--status-serious)' },
  codigo_sap: { Icon: Hash, cor: 'var(--ink-secondary)' },
  descricao: { Icon: Pencil, cor: 'var(--ink-secondary)' },
  observacao: { Icon: MessageSquare, cor: 'var(--ink-secondary)' },
  marca: { Icon: Tag, cor: 'var(--ink-secondary)' },
  criticidade: { Icon: AlertTriangle, cor: 'var(--status-serious)' },
  tipo_compra: { Icon: PackageSearch, cor: 'var(--ink-secondary)' },
  data_necessidade: { Icon: Calendar, cor: 'var(--ink-secondary)' },
  justificativa: { Icon: FileSpreadsheet, cor: 'var(--ink-secondary)' },
  outro: { Icon: Info, cor: 'var(--ink-muted)' },
};

/** Lista visual (ícone + frase) do que mudou numa edição — usada no alerta "Editar no SAP" e no histórico. */
function ListaMudancas({ motivo }: { motivo?: string | null }) {
  const mudancas = dividirMudancas(motivo);
  if (mudancas.length === 0) return null;

  return (
    <ul className="space-y-1">
      {mudancas.map((m, idx) => {
        const { Icon, cor } = ICONE_MUDANCA[classificarMudanca(m)];
        return (
          <li key={idx} className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
            <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: cor }} />
            <span>{m}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Campo de texto para digitar o número da RM de uma solicitação "Aberta".
 *
 * Estado local próprio, não controlado pelo pai — salva no blur/Enter, sem
 * gravar a cada tecla. A prop `chave` (id da solicitação + valor atual)
 * remonta o campo quando o valor muda por fora (upload em lote, ou outra
 * aba), sem perder o que o usuário está digitando no meio da edição — ela só
 * muda quando `valor` muda, e `valor` só muda depois que o campo já salvou.
 */
function CampoRmVinculo({ valor, onSalvar }: { valor: string; onSalvar: (novoValor: string) => Promise<void> }) {
  const [texto, setTexto] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Não salva sozinho ao sair do campo: só quando o texto realmente muda,
  // aparece o botão de confirmar — editar de leve e clicar fora não deve
  // disparar gravação sem o usuário pedir.
  const alterado = texto.trim() !== (valor || '').trim();

  const salvar = async () => {
    if (!alterado || salvando) return;
    setSalvando(true);
    try {
      await onSalvar(texto.trim());
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    const rm = texto.trim();
    if (!rm) return;
    try {
      await navigator.clipboard.writeText(rm);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Clipboard API pode não estar disponível (permissão, contexto sem
      // HTTPS) — sem isso ser crítico o bastante para um toast de erro.
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') salvar();
            if (e.key === 'Escape') setTexto(valor);
          }}
          placeholder="Nº da RM"
          disabled={salvando}
          className="w-36 pl-2.5 pr-7 py-1.5 rounded-lg border text-xs font-mono font-semibold outline-none focus:ring-2 focus:ring-[var(--brand)] disabled:opacity-50"
          style={{
            borderColor: alterado ? 'var(--brand)' : 'var(--hairline)',
            background: 'var(--surface)',
            color: 'var(--ink-primary)',
          }}
        />
        {texto.trim() && (
          <button
            type="button"
            onClick={copiar}
            title={copiado ? 'Copiado!' : 'Copiar número da RM'}
            aria-label="Copiar número da RM"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: copiado ? 'var(--status-good)' : 'var(--ink-muted)' }}
          >
            {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {alterado && (
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          title="Confirmar e salvar a RM"
          aria-label="Confirmar RM"
          className="inline-flex items-center justify-center h-7 w-7 rounded-lg shrink-0 cursor-pointer text-white hover:opacity-90 active:scale-95 disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

export default function AbrirRm({ user, onNavigate }: Props) {
  const toast = useToast();
  const tour = usePageTour('almoxarifado-abrir-rm', ABRIR_RM_TOUR_STEPS.length);

  const [requests, setRequests] = useState<Request[]>([]);
  const [itensPorRequest, setItensPorRequest] = useState<Record<string, RequestItem[]>>({});
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [grupoMercadoriaPorMaterial, setGrupoMercadoriaPorMaterial] = useState<Map<string, string>>(new Map());
  const [grupoComprasPorMercadoria, setGrupoComprasPorMercadoria] = useState<Map<string, string>>(new Map());

  const [marcas, setMarcas] = useState<AlmoxRmExportacaoSolicitacao[]>([]);
  const [exportacoes, setExportacoes] = useState<AlmoxRmExportacao[]>([]);
  const [carregandoLog, setCarregandoLog] = useState(true);
  const [erroLog, setErroLog] = useState('');

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [expandida, setExpandida] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  // Seleção do grupo "Editar no SAP" — própria, não a mesma de exportar:
  // aqui a ação é "Concluído", não "Exportar planilha".
  const [selecionadasAjusteSap, setSelecionadasAjusteSap] = useState<Set<string>>(new Set());
  const [concluindoAjusteSap, setConcluindoAjusteSap] = useState(false);
  const [liberandoAjusteSap, setLiberandoAjusteSap] = useState(false);

  const [busca, setBusca] = useState('');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [filtroClassificacao, setFiltroClassificacao] = useState('todas');
  const [filtroDeposito, setFiltroDeposito] = useState('todos');
  const [filtroExportacao, setFiltroExportacao] = useState<FiltroExportacao>('nao_exportadas');
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null);
  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const [modalPreviewAberto, setModalPreviewAberto] = useState(false);

  // Aba "Abertas": solicitações já exportadas, aguardando o número da RM
  // voltar do SAP — por digitação avulsa ou pela planilha reimportada.
  const [aba, setAba] = useState<'para_abrir' | 'abertas'>('para_abrir');
  const [buscaAbertas, setBuscaAbertas] = useState('');
  const [importandoRm, setImportandoRm] = useState(false);
  const inputArquivoRmRef = useRef<HTMLInputElement>(null);

  /* Carga ---------------------------------------------------------------- */

  // Solicitação e itens saem do cache local (localDb), que já é o que a
  // Central de Solicitações e as Aprovações leem; só o log de exportação vem
  // direto do Supabase, porque nasceu nesta tela.
  const carregarLocal = () => {
    const todas = localDb.getRequests().filter(r => r.type === 'compra' && r.status === 'aprovada');
    setRequests(todas);
    const itensMap: Record<string, RequestItem[]> = {};
    const todosItens: RequestItem[] = [];
    for (const r of todas) {
      const its = localDb.getRequestItems(r.id);
      itensMap[r.id] = its;
      todosItens.push(...its);
    }
    setItensPorRequest(itensMap);
    setSectors(localDb.getSectors());

    // Primeiro preenche com qualquer dado presente no cache local
    const porMaterial = new Map<string, string>();
    for (const m of localDb.getMaterials()) {
      const grupo = (m.grupo_mercadoria_codigo || '').trim();
      if (m.material_code && grupo) porMaterial.set(m.material_code.trim(), grupo);
    }
    setGrupoMercadoriaPorMaterial(porMaterial);

    // Como o catálogo SAP tem mais de 450k itens e não fica em cache local,
    // busca sob demanda no Supabase para os códigos SAP presentes nas solicitações
    const codigosSap = todosItens.map(it => (it.sap_code || '').trim()).filter(Boolean);
    if (codigosSap.length > 0) {
      buscarGruposMercadoriaPorCodigosSap(codigosSap)
        .then(mapaSap => {
          setGrupoMercadoriaPorMaterial(atual => {
            const mesclado = new Map(atual);
            mapaSap.forEach((grupo, mat) => mesclado.set(mat, grupo));
            return mesclado;
          });
        })
        .catch(err => {
          console.warn('Erro ao buscar grupos de mercadorias no catálogo SAP:', err);
        });
    }
  };

  const carregarLog = async () => {
    setCarregandoLog(true);
    setErroLog('');
    try {
      // O segundo salto (grupo de mercadorias → comprador) vem junto: sem ele
      // a planilha sai com o EKGRP errado, então é carga obrigatória e não
      // um enfeite que pode falhar em silêncio.
      const [marcasDb, lotes, compradores] = await Promise.all([
        listarMarcasExportacaoRm(),
        listarExportacoesRm(),
        mapaGrupoComprasPorMercadoria(),
      ]);
      setMarcas(marcasDb);
      setExportacoes(lotes);
      setGrupoComprasPorMercadoria(compradores);
    } catch (err: any) {
      // Sem o log, a tela ainda serve para exportar — só perde o "já saiu".
      setErroLog(err?.message || 'Não foi possível carregar o log de exportações.');
    } finally {
      setCarregandoLog(false);
    }
  };

  useEffect(() => {
    carregarLocal();
    carregarLog();
    const unsubscribe = localDb.subscribe(carregarLocal);
    return () => unsubscribe();
  }, []);

  /* Derivados ------------------------------------------------------------ */

  // Duas leituras da mesma lista: a vigente decide o status e o filtro; a
  // última (reaberta ou não) é o que sustenta o aviso "já foi exportada".
  const exportacaoVigentePorRequest = useMemo(() => indexarExportacaoVigente(marcas), [marcas]);
  const ultimaExportacaoPorRequest = useMemo(() => indexarUltimaExportacao(marcas), [marcas]);
  const marcasPorLote = useMemo(() => agruparMarcasPorExportacao(marcas), [marcas]);
  const loteById = useMemo(() => new Map(exportacoes.map(e => [e.id, e])), [exportacoes]);

  const contexto: ContextoRm = useMemo(
    () => ({ sectors, grupoMercadoriaPorMaterial, grupoComprasPorMercadoria }),
    [sectors, grupoMercadoriaPorMaterial, grupoComprasPorMercadoria],
  );

  const nomeSetor = (id?: string) => (id ? sectors.find(s => s.id === id)?.name || id : '—');
  const setorPorId = useMemo(() => new Map(sectors.map(s => [s.id, s])), [sectors]);

  /**
   * Solicitações que voltaram sozinhas para a fila porque foram editadas
   * depois de já terem saído numa planilha — a exportação anterior não
   * bate mais com o que está aprovado. Diferem da reabertura manual (o
   * almoxarife decide reexportar, sem motivo registrado): aqui o RM pode já
   * existir no SAP, e é ele que precisa de ajuste manual, não uma reexportação
   * automática — daí o grupo à parte, com destaque, em vez de misturar com o
   * que nunca saiu.
   */
  const idsPendentesAjusteSap = useMemo(() => {
    const ids = new Set<string>();
    for (const [reqId, ultima] of ultimaExportacaoPorRequest) {
      if (exportacaoVigentePorRequest.has(reqId)) continue; // reexportada depois do ajuste: resolvido
      if (ultima.concluido_em) continue; // já confirmado como corrigido no SAP: some para o histórico
      if (ultima.liberado_exportar_em) continue; // RM nunca existiu no SAP: liberada de volta para a fila normal
      if (ultima.reaberto_em && ultima.reaberto_motivo) ids.add(reqId);
    }
    return ids;
  }, [ultimaExportacaoPorRequest, exportacaoVigentePorRequest]);

  /**
   * Já concluídas ("Editar no SAP" resolvido sem reexportar): não voltam para
   * a fila comum — o RM já foi corrigido manualmente, não há o que exportar
   * de novo. Só aparecem no histórico do lote de origem.
   */
  const idsConcluidos = useMemo(() => {
    const ids = new Set<string>();
    for (const [reqId, ultima] of ultimaExportacaoPorRequest) {
      if (exportacaoVigentePorRequest.has(reqId)) continue;
      if (ultima.reaberto_em && ultima.concluido_em) ids.add(reqId);
    }
    return ids;
  }, [ultimaExportacaoPorRequest, exportacaoVigentePorRequest]);

  const filtradas = useMemo(() => {
    let lista = requests;

    if (filtroExportacao !== 'todas') {
      const querExportadas = filtroExportacao === 'exportadas';
      lista = lista.filter(r => exportacaoVigentePorRequest.has(r.id) === querExportadas);
    }
    if (filtroSetor !== 'todos') {
      lista = lista.filter(r => r.solicitante_sector_id === filtroSetor);
    }
    if (filtroClassificacao !== 'todas') {
      lista = lista.filter(r => classificacaoRm(r.criticality) === filtroClassificacao);
    }
    if (filtroDeposito !== 'todos') {
      lista = lista.filter(r => depositoRm(r.tipo_compra) === filtroDeposito);
    }
    if (busca.trim()) {
      const termo = busca.toLowerCase().trim();
      lista = lista.filter(r => {
        if (r.number.toLowerCase().includes(termo)) return true;
        if ((r.solicitante_name || '').toLowerCase().includes(termo)) return true;
        if ((r.justificativa || '').toLowerCase().includes(termo)) return true;
        return (itensPorRequest[r.id] || []).some(
          it =>
            it.description.toLowerCase().includes(termo) ||
            (it.sap_code || '').toLowerCase().includes(termo),
        );
      });
    }

    // Urgente primeiro, depois a mais antiga — quem esperou mais abre antes.
    return [...lista].sort((a, b) => {
      if (b.criticality !== a.criticality) return b.criticality - a.criticality;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [
    requests, itensPorRequest, exportacaoVigentePorRequest, filtroExportacao,
    filtroSetor, filtroClassificacao, filtroDeposito, busca,
  ]);

  /** A lista de sempre, sem quem precisa de ajuste manual no SAP — esses têm grupo próprio. */
  const filtradasPrincipais = useMemo(
    () => filtradas.filter(r => !idsPendentesAjusteSap.has(r.id) && !idsConcluidos.has(r.id)),
    [filtradas, idsPendentesAjusteSap, idsConcluidos],
  );

  /** Mesmo recorte de busca/setor/classificação/depósito, só os que precisam de ajuste manual no SAP. */
  const filtradasAjusteSap = useMemo(
    () => filtradas.filter(r => idsPendentesAjusteSap.has(r.id)),
    [filtradas, idsPendentesAjusteSap],
  );

  /** Só as solicitações selecionadas que continuam visíveis no recorte atual. */
  // Base é a lista principal, não `filtradas` inteira: quem está em "Editar
  // no SAP" tem seleção e ação própria (Concluir), não entra na exportação —
  // as duas coisas resolvem o mesmo alerta de jeitos diferentes, e misturar
  // as caixinhas faria selecionar para "Concluir" também contar como
  // "Selecionadas" para exportar.
  const selecaoVisivel = useMemo(
    () => filtradasPrincipais.filter(r => selecionadas.has(r.id)),
    [filtradasPrincipais, selecionadas],
  );

  const selecaoRm: SolicitacaoRm[] = useMemo(
    () => selecaoVisivel.map(r => ({ request: r, itens: itensPorRequest[r.id] || [] })),
    [selecaoVisivel, itensPorRequest],
  );

  const totalItensSelecionados = useMemo(
    () => selecaoRm.reduce((acc, s) => acc + s.itens.length, 0),
    [selecaoRm],
  );

  const semCodigoSap = useMemo(() => itensSemCodigoSap(selecaoRm), [selecaoRm]);

  const semGrupoComprador = useMemo(
    () => itensSemGrupoComprador(selecaoRm, contexto),
    [selecaoRm, contexto],
  );

  const linhasPrevistas: LinhaRm[] = useMemo(() => {
    if (!modalPreviewAberto || selecaoRm.length === 0) return [];
    return montarLinhasRm(selecaoRm, contexto);
  }, [modalPreviewAberto, selecaoRm, contexto]);

  const itensPrevistos = useMemo(() => {
    if (!modalPreviewAberto || selecaoRm.length === 0) return [];
    return selecaoRm.flatMap(s => s.itens);
  }, [modalPreviewAberto, selecaoRm]);

  const totalGenericosPrevistos = useMemo(() => {
    return itensPrevistos.filter(it => it.is_generic).length;
  }, [itensPrevistos]);

  const naoExportadas = useMemo(
    () => requests.filter(r =>
      !exportacaoVigentePorRequest.has(r.id) && !idsPendentesAjusteSap.has(r.id) && !idsConcluidos.has(r.id),
    ).length,
    [requests, exportacaoVigentePorRequest, idsPendentesAjusteSap, idsConcluidos],
  );

  const totalAjusteSap = idsPendentesAjusteSap.size;

  const todasVisiveisMarcadas =
    filtradasPrincipais.length > 0 && filtradasPrincipais.every(r => selecionadas.has(r.id));

  /* Aba "Abertas" ---------------------------------------------------------- */

  /** Exportadas e vigentes — o que já saiu no SAP e ainda pode não ter RM de volta. */
  const abertas = useMemo(() => {
    let lista = requests.filter(r => exportacaoVigentePorRequest.has(r.id));
    if (buscaAbertas.trim()) {
      const termo = buscaAbertas.toLowerCase().trim();
      lista = lista.filter(r =>
        r.number.toLowerCase().includes(termo) ||
        (r.solicitante_name || '').toLowerCase().includes(termo) ||
        (r.linked_rm_number || '').toLowerCase().includes(termo),
      );
    }
    // Sem RM primeiro — é o que falta resolver.
    return [...lista].sort((a, b) => {
      const aSemRm = a.linked_rm_number ? 1 : 0;
      const bSemRm = b.linked_rm_number ? 1 : 0;
      if (aSemRm !== bSemRm) return aSemRm - bSemRm;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [requests, exportacaoVigentePorRequest, buscaAbertas]);

  const abertasComRm = useMemo(() => abertas.filter(r => r.linked_rm_number).length, [abertas]);
  const abertasSemRm = abertas.length - abertasComRm;

  /* Ações ---------------------------------------------------------------- */

  const alternar = (id: string) => {
    setSelecionadas(prev => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const alternarTodas = () => {
    setSelecionadas(prev => {
      const proximo = new Set(prev);
      if (todasVisiveisMarcadas) filtradasPrincipais.forEach(r => proximo.delete(r.id));
      else filtradasPrincipais.forEach(r => proximo.add(r.id));
      return proximo;
    });
  };

  const alternarAjusteSap = (id: string) => {
    setSelecionadasAjusteSap(prev => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  };

  const todasAjusteSapMarcadas =
    filtradasAjusteSap.length > 0 && filtradasAjusteSap.every(r => selecionadasAjusteSap.has(r.id));

  const alternarTodasAjusteSap = () => {
    setSelecionadasAjusteSap(prev => {
      const proximo = new Set(prev);
      if (todasAjusteSapMarcadas) filtradasAjusteSap.forEach(r => proximo.delete(r.id));
      else filtradasAjusteSap.forEach(r => proximo.add(r.id));
      return proximo;
    });
  };

  /**
   * Confirma que uma ou mais solicitações do grupo "Editar no SAP" foram
   * corrigidas manualmente lá. Não mexe na solicitação nem exige nova
   * exportação — só fecha o sinalizador, e a marca migra para o histórico.
   */
  const handleConcluirAjusteSap = async () => {
    const ids = filtradasAjusteSap.filter(r => selecionadasAjusteSap.has(r.id)).map(r => r.id);
    if (ids.length === 0) return;

    setConcluindoAjusteSap(true);
    try {
      const total = await concluirAjusteSapRm(ids, { id: user.id, nome: user.name });
      if (total === 0) {
        toast.info('Nenhuma das solicitações selecionadas ainda precisava de conclusão — alguém já deve ter concluído ou reexportado antes de você.');
      } else {
        toast.success(
          `${total} ${total === 1 ? 'solicitação concluída' : 'solicitações concluídas'}. ` +
          'Saíram do grupo "Editar no SAP" e ficam registradas no histórico de exportações.',
        );
      }
      setSelecionadasAjusteSap(new Set());
      await carregarLog();
    } catch (err: any) {
      toast.error('Erro ao concluir o ajuste no SAP: ' + (err?.message || ''));
    } finally {
      setConcluindoAjusteSap(false);
    }
  };

  /**
   * A outra saída do grupo "Editar no SAP": a RM nunca chegou a ser criada
   * no SAP, então não há nada para corrigir lá — só devolve a solicitação
   * para a fila normal de exportação, como um "Reabrir" comum.
   */
  const handleHabilitarExportarAjusteSap = async () => {
    const ids = filtradasAjusteSap.filter(r => selecionadasAjusteSap.has(r.id)).map(r => r.id);
    if (ids.length === 0) return;

    setLiberandoAjusteSap(true);
    try {
      const total = await liberarParaExportarRm(ids, { id: user.id, nome: user.name });
      if (total === 0) {
        toast.info('Nenhuma das solicitações selecionadas ainda estava pendente de ajuste — alguém já deve ter concluído ou liberado antes de você.');
      } else {
        toast.success(
          `${total} ${total === 1 ? 'solicitação liberada' : 'solicitações liberadas'} para exportação. ` +
          `${total === 1 ? 'Ela voltou' : 'Elas voltaram'} para a fila "Para Abrir".`,
        );
      }
      setSelecionadasAjusteSap(new Set());
      await carregarLog();
    } catch (err: any) {
      toast.error('Erro ao liberar para exportar: ' + (err?.message || ''));
    } finally {
      setLiberandoAjusteSap(false);
    }
  };

  const handleReabrirLote = async (lote: AlmoxRmExportacao) => {
    setReabrindo(lote.id);
    try {
      const reabertas = await reabrirExportacaoRm(lote.id, { id: user.id, nome: user.name });
      if (reabertas === 0) {
        toast.info(`Todas as solicitações de ${lote.arquivo} já estavam reabertas.`);
      } else {
        toast.success(
          `${reabertas} ${reabertas === 1 ? 'solicitação voltou' : 'solicitações voltaram'} para a fila. ` +
          'O registro da exportação anterior continua no histórico.',
        );
      }
      await carregarLog();
    } catch (err: any) {
      toast.error('Erro ao reabrir a exportação: ' + (err?.message || ''));
    } finally {
      setReabrindo(null);
    }
  };

  const handleReabrirSolicitacao = async (marca: AlmoxRmExportacaoSolicitacao) => {
    setReabrindo(marca.id);
    try {
      await reabrirSolicitacaoExportadaRm(marca.id, { id: user.id, nome: user.name });
      toast.success(`Solicitação #${marca.request_number} de volta à fila.`);
      await carregarLog();
    } catch (err: any) {
      toast.error('Erro ao reabrir a solicitação: ' + (err?.message || ''));
    } finally {
      setReabrindo(null);
    }
  };

  const handleAbrirPreview = () => {
    if (selecaoRm.length === 0) {
      toast.warning('Selecione ao menos uma solicitação para exportar.');
      return;
    }
    const semItem = selecaoRm.filter(s => s.itens.length === 0);
    if (semItem.length === selecaoRm.length) {
      toast.warning('As solicitações selecionadas não têm itens — não há o que abrir no SAP.');
      return;
    }
    setModalPreviewAberto(true);
  };

  const handleConfirmarExportacao = async () => {
    setExportando(true);
    try {
      const { arquivo, linhas } = exportarPlanilhaRm(selecaoRm, contexto);

      // O log grava só quem de fato virou linha: solicitação sem item não sai
      // na planilha e não pode aparecer como exportada.
      const comItem = selecaoRm.filter(s => s.itens.length > 0);
      const semItem = selecaoRm.filter(s => s.itens.length === 0);
      try {
        await registrarExportacaoRm({
          arquivo,
          exportado_por_id: user.id,
          exportado_por_nome: user.name,
          solicitacoes: comItem.map(s => ({
            request_id: s.request.id,
            request_number: s.request.number,
            total_itens: s.itens.length,
          })),
        });
        toast.success(
          `${linhas.length} ${linhas.length === 1 ? 'linha exportada' : 'linhas exportadas'} ` +
          `em ${comItem.length} ${comItem.length === 1 ? 'solicitação' : 'solicitações'} (${arquivo}).`,
        );
        setSelecionadas(new Set());
        setModalPreviewAberto(false);
        await carregarLog();
      } catch (err: any) {
        // A planilha já foi baixada; o que falhou foi só o registro. Dizer
        // isso é melhor que um "erro ao exportar" que faz refazer o download.
        toast.warning(
          `A planilha ${arquivo} foi gerada, mas o log não pôde ser gravado: ` +
          `${err?.message || 'falha de comunicação'}. As solicitações seguem como não exportadas.`,
        );
        setModalPreviewAberto(false);
      }
      if (semItem.length > 0) {
        toast.info(
          `${semItem.length} ${semItem.length === 1 ? 'solicitação ficou' : 'solicitações ficaram'} ` +
          'de fora por não ter item cadastrado.',
        );
      }
    } catch (err: any) {
      toast.error('Erro ao gerar a planilha: ' + (err?.message || ''));
    } finally {
      setExportando(false);
    }
  };

  /**
   * Vincula (ou remove, se `rmNumber` vier vazio) o número de RM de uma
   * solicitação. `linked_rm_number` já existe em `Request` — esta tela é a
   * primeira a expor essa gravação numa UI.
   */
  const vincularRm = async (request: Request, rmNumber: string) => {
    const limpo = rmNumber.trim();
    const ok = await localDb.updateLinkedRM(request.id, limpo || null);
    if (ok) {
      toast.success(
        limpo
          ? `RM #${limpo} vinculada à solicitação #${request.number}.`
          : `Vínculo de RM removido da solicitação #${request.number}.`,
      );
    } else {
      toast.warning('Vínculo salvo localmente, mas não sincronizou com o servidor agora.');
    }
  };

  /**
   * Lê a planilha reimportada (mesmas colunas exportadas, "Status / Nº da
   * RM" agora preenchida) e vincula cada solicitação encontrada entre as
   * "Abertas" — o upload não inventa vínculo em solicitação que a aba não
   * está mostrando aqui.
   *
   * Aceita `.xlsm`: a planilha de controle do comprador costuma ser um
   * arquivo com macro, não o `.xlsx` simples que esta tela exporta — e o
   * dado real mora na aba "BD" dela (`escolherAbaRmPreenchida`), não
   * necessariamente na primeira aba do arquivo.
   *
   * Nunca escreve à toa: compara o número lido com o que a solicitação já
   * tinha (`classificarVinculoRm`) e só grava quando é novo ou diferente —
   * o resumo final separa vinculadas, alteradas e as que já estavam certas.
   */
  const handleImportarPlanilhaRm = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xlsm', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Selecione um arquivo .xlsx, .xlsm, .xls ou .csv.');
      return;
    }

    setImportandoRm(true);
    const reader = new FileReader();

    reader.onload = async ev => {
      try {
        const dados = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(dados, { type: 'array' });
        const nomeAba = escolherAbaRmPreenchida(wb.SheetNames);
        if (!nomeAba) throw new Error('Nenhuma planilha encontrada no arquivo.');
        const ws = wb.Sheets[nomeAba];
        const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const lido = lerPlanilhaRmPreenchida(linhas);

        if (lido.porSolicitacao.size === 0) {
          toast.warning(
            lido.linhasSemIdReq === lido.totalLinhas
              ? `Não encontrei a coluna "ID Req" na aba "${nomeAba}" — confira se é a planilha certa.`
              : `Nenhuma linha da aba "${nomeAba}" trouxe número de RM preenchido.`,
          );
          return;
        }

        const porNumero = new Map(abertas.map(r => [r.number, r]));
        let vinculadas = 0;
        let alteradas = 0;
        let jaEstavaCerto = 0;
        let semCorrespondencia = 0;

        for (const [numero, rm] of lido.porSolicitacao) {
          const request = porNumero.get(numero);
          if (!request) { semCorrespondencia++; continue; }

          const situacao = classificarVinculoRm(request.linked_rm_number, rm);
          if (situacao === 'inalterado') { jaEstavaCerto++; continue; }

          const ok = await localDb.updateLinkedRM(request.id, rm);
          if (ok && situacao === 'novo') vinculadas++;
          else if (ok && situacao === 'alterado') alteradas++;
        }

        const partes: string[] = [];
        if (vinculadas > 0) partes.push(`${vinculadas} ${vinculadas === 1 ? 'solicitação vinculada' : 'solicitações vinculadas'}`);
        if (alteradas > 0) partes.push(`${alteradas} com RM ${alteradas === 1 ? 'atualizada' : 'atualizadas'} (era outro número)`);
        if (jaEstavaCerto > 0) partes.push(`${jaEstavaCerto} já ${jaEstavaCerto === 1 ? 'estava' : 'estavam'} com essa RM`);
        if (semCorrespondencia > 0) partes.push(`${semCorrespondencia} não ${semCorrespondencia === 1 ? 'encontrada' : 'encontradas'} entre as "Abertas"`);
        if (lido.linhasSemNumeroRm > 0) partes.push(`${lido.linhasSemNumeroRm} ${lido.linhasSemNumeroRm === 1 ? 'linha' : 'linhas'} sem número de RM`);

        const resumo = (partes.length > 0 ? partes.join('; ') : 'Nada para atualizar nesta planilha') + '.';
        (vinculadas > 0 || alteradas > 0 ? toast.success : toast.info)(resumo);
      } catch (err: any) {
        toast.error('Erro ao ler a planilha: ' + (err?.message || ''));
      } finally {
        setImportandoRm(false);
        if (inputArquivoRmRef.current) inputArquivoRmRef.current.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Erro ao ler o arquivo.');
      setImportandoRm(false);
    };

    reader.readAsArrayBuffer(file);
  };

  /* Render --------------------------------------------------------------- */

  const kpis = [
    { rotulo: 'Aprovadas', valor: requests.length, icone: ClipboardCheck, alerta: false },
    { rotulo: 'A exportar', valor: naoExportadas, icone: PackageSearch, alerta: false },
    { rotulo: 'Editar no SAP', valor: totalAjusteSap, icone: Wrench, alerta: true },
    { rotulo: 'Selecionadas', valor: selecaoVisivel.length, icone: CheckSquare, alerta: false },
    { rotulo: 'Linhas da planilha', valor: totalItensSelecionados, icone: FileSpreadsheet, alerta: false },
  ];

  return (
    <div className="space-y-5 select-text max-w-[1600px] mx-auto pb-12">
      {/* Cabeçalho */}
      <div
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold flex items-center gap-2.5" style={{ color: 'var(--ink-primary)' }}>
            <Boxes className="h-7 w-7" style={{ color: 'var(--brand)' }} />
            Abrir RM
          </h2>
          <p className="text-xs sm:text-sm mt-1.5" style={{ color: 'var(--ink-secondary)' }}>
            {aba === 'para_abrir'
              ? 'Solicitações de compra aprovadas, prontas para virar requisição no SAP. Selecione, exporte a planilha padrão e o lote fica registrado no log.'
              : 'Solicitações já exportadas. Digite o número da RM que voltou do SAP, ou importe a planilha reenviada com a coluna preenchida.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { carregarLocal(); carregarLog(); }}
            disabled={carregandoLog}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${carregandoLog ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          {aba === 'para_abrir' && (
            <button
              data-tour="abrir-rm-exportar"
              onClick={handleAbrirPreview}
              disabled={exportando || selecaoVisivel.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer text-white hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--brand)' }}
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar planilha
              {selecaoVisivel.length > 0 && (
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-extrabold">
                  {selecaoVisivel.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div
        data-tour="abrir-rm-abas"
        className="flex items-center gap-1 rounded-xl border p-1 w-fit"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        <button
          type="button"
          onClick={() => setAba('para_abrir')}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
          style={
            aba === 'para_abrir'
              ? { background: 'var(--brand)', color: 'white' }
              : { color: 'var(--ink-secondary)' }
          }
        >
          Para Abrir
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-black"
            style={
              aba === 'para_abrir'
                ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                : { background: 'color-mix(in srgb, var(--ink-muted) 16%, transparent)', color: 'var(--ink-secondary)' }
            }
          >
            {naoExportadas + totalAjusteSap}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAba('abertas')}
          className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
          style={
            aba === 'abertas'
              ? { background: 'var(--brand)', color: 'white' }
              : { color: 'var(--ink-secondary)' }
          }
        >
          Abertas
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-black"
            style={
              aba === 'abertas'
                ? { background: 'rgba(255,255,255,0.25)', color: 'white' }
                : { background: 'color-mix(in srgb, var(--ink-muted) 16%, transparent)', color: 'var(--ink-secondary)' }
            }
          >
            {abertas.length}
          </span>
        </button>
      </div>

      {aba === 'para_abrir' && (
      <>
      {/* KPIs */}
      <div data-tour="abrir-rm-kpis" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => {
          const emAlerta = k.alerta && k.valor > 0;
          return (
            <div
              key={k.rotulo}
              className="rounded-xl border p-3.5"
              style={{
                borderColor: emAlerta ? 'var(--status-serious)' : 'var(--hairline)',
                background: emAlerta
                  ? 'color-mix(in srgb, var(--status-serious) 10%, var(--surface-raised))'
                  : 'var(--surface-raised)',
              }}
            >
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: emAlerta ? 'var(--status-serious)' : 'var(--ink-muted)' }}
              >
                <k.icone className="h-3.5 w-3.5" />
                {k.rotulo}
              </div>
              <div
                className="text-2xl font-extrabold mt-1"
                style={{ color: emAlerta ? 'var(--status-serious)' : 'var(--ink-primary)' }}
              >
                {k.valor}
              </div>
            </div>
          );
        })}
      </div>

      {/* Editadas depois de exportadas: o RM já pode existir no SAP, então a
          correção é manual lá — não uma reexportação automática. Grupo
          separado, com destaque, para não se perder entre as nunca exportadas. */}
      {filtradasAjusteSap.length > 0 && (
        <div
          data-tour="abrir-rm-editar-sap"
          className="rounded-xl border-2 overflow-hidden"
          style={{ borderColor: 'var(--status-serious)' }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
            style={{ background: 'color-mix(in srgb, var(--status-serious) 14%, transparent)' }}
          >
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" style={{ color: 'var(--status-serious)' }} />
              <span className="text-xs font-extrabold uppercase tracking-wider" style={{ color: 'var(--status-serious)' }}>
                Editar no SAP — {filtradasAjusteSap.length} {filtradasAjusteSap.length === 1 ? 'solicitação alterada' : 'solicitações alteradas'} após a exportação
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={alternarTodasAjusteSap}
                className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                style={{ color: 'var(--status-serious)' }}
              >
                {todasAjusteSapMarcadas
                  ? <CheckSquare className="h-3.5 w-3.5" />
                  : <Square className="h-3.5 w-3.5" />}
                {todasAjusteSapMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
              </button>

              <button
                type="button"
                onClick={handleHabilitarExportarAjusteSap}
                disabled={liberandoAjusteSap || selecionadasAjusteSap.size === 0}
                title="A RM ainda não existe no SAP — devolve a solicitação para a fila normal de exportação, como um Reabrir."
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--status-serious)', color: 'var(--status-serious)', background: 'var(--surface-raised)' }}
              >
                {liberandoAjusteSap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Habilitar Exportar
                {selecionadasAjusteSap.size > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-extrabold"
                    style={{ background: 'color-mix(in srgb, var(--status-serious) 18%, transparent)' }}
                  >
                    {selecionadasAjusteSap.size}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={handleConcluirAjusteSap}
                disabled={concluindoAjusteSap || selecionadasAjusteSap.size === 0}
                title="Confirma que a RM foi corrigida manualmente no SAP — sem gerar uma nova planilha."
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-white hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--status-serious)' }}
              >
                {concluindoAjusteSap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Concluído
                {selecionadasAjusteSap.size > 0 && (
                  <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-extrabold">
                    {selecionadasAjusteSap.size}
                  </span>
                )}
              </button>
            </div>
          </div>

          <ul>
            {filtradasAjusteSap.map(r => {
              const itens = itensPorRequest[r.id] || [];
              const marcada = selecionadasAjusteSap.has(r.id);
              const ultima = ultimaExportacaoPorRequest.get(r.id);
              const lote = ultima ? loteById.get(ultima.exportacao_id) : undefined;

              return (
                <li
                  key={r.id}
                  className="border-t px-3 py-3 space-y-2"
                  style={{
                    borderColor: 'var(--status-serious)',
                    background: 'color-mix(in srgb, var(--status-serious) 6%, transparent)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => alternarAjusteSap(r.id)}
                      aria-label={marcada ? `Desmarcar solicitação ${r.number}` : `Marcar solicitação ${r.number}`}
                      className="mt-0.5 cursor-pointer shrink-0"
                    >
                      {marcada
                        ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--status-serious)' }} />
                        : <Square className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          #{r.number}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{
                            color: 'var(--status-serious)',
                            background: 'color-mix(in srgb, var(--status-serious) 18%, transparent)',
                          }}
                        >
                          <Wrench className="h-3 w-3" />
                          Editar no SAP
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3 opacity-70" />
                          {requisitanteRm(r.solicitante_name)}
                        </span>
                        <span>{nomeSetor(r.solicitante_sector_id)}</span>
                        <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                      </div>

                      {ultima && (
                        <p className="text-[11px] mt-1" style={{ color: 'var(--status-serious)' }}>
                          Exportada {lote ? `em ${lote.arquivo} ` : ''}por {lote?.exportado_por_nome || 'usuário não identificado'} em{' '}
                          {formatDateTimeBR(ultima.created_at)}. Editada por {ultima.reaberto_por_nome || 'usuário não identificado'} em{' '}
                          {ultima.reaberto_em ? formatDateTimeBR(ultima.reaberto_em) : '—'} — o RM já pode existir no SAP;
                          ajuste manualmente com base nas mudanças abaixo.
                        </p>
                      )}
                    </div>
                  </div>

                  <div
                    className="rounded-lg border p-2.5 ml-7"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                  >
                    <ListaMudancas motivo={ultima?.reaberto_motivo} />
                  </div>

                  {itens.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border ml-7" style={{ borderColor: 'var(--hairline)' }}>
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr style={{ background: 'var(--surface)' }}>
                            {['Item', 'MATNR', 'Descrição', 'Qtd.', 'Un.'].map(h => (
                              <th
                                key={h}
                                className="text-left font-bold uppercase tracking-wider px-2 py-1.5 text-[10px] whitespace-nowrap"
                                style={{ color: 'var(--ink-muted)' }}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((it, idx) => (
                            <tr key={it.id} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                              <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--ink-secondary)' }}>{idx + 1}</td>
                              <td className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap">{it.sap_code || 'sem código'}</td>
                              <td className="px-2 py-1.5" style={{ color: 'var(--ink-primary)' }}>{it.description}</td>
                              <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{it.quantity}</td>
                              <td className="px-2 py-1.5" style={{ color: 'var(--ink-secondary)' }}>{it.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {erroLog && (
        <div className="flex items-start gap-3 p-4 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">
            {erroLog} A exportação continua funcionando, mas o status "Exportada" não pode ser
            conferido nem gravado agora.
          </span>
        </div>
      )}

      {semCodigoSap > 0 && (
        <div className="flex items-start gap-3 p-4 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">
            {semCodigoSap} {semCodigoSap === 1 ? 'item selecionado está' : 'itens selecionados estão'} sem
            código SAP. {semCodigoSap === 1 ? 'A linha vai sair' : 'As linhas vão sair'} com o MATNR em
            branco e a RM não abre assim — cadastre o material antes ou tire esses itens do lote.
          </span>
        </div>
      )}

      {semGrupoComprador > 0 && (
        <div className="flex items-start gap-3 p-4 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">
            {semGrupoComprador} {semGrupoComprador === 1 ? 'item selecionado está' : 'itens selecionados estão'} sem
            comprador responsável no cadastro — o material não está no catálogo SAP ou o grupo de
            mercadorias dele ainda não tem comprador vinculado.
            {semGrupoComprador === 1 ? ' A linha vai sair' : ' As linhas vão sair'} com o grupo de
            compras {RM_GRUPO_COMPRAS_PADRAO}. Ajuste em Administração → Cadastros Gerais →
            Grupos Compradores.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div
        data-tour="abrir-rm-filtros"
        className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Número, solicitante, material ou código SAP"
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
          />
        </div>

        <select
          value={filtroExportacao}
          onChange={e => setFiltroExportacao(e.target.value as FiltroExportacao)}
          className="px-3 py-2 rounded-lg border text-sm font-semibold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
        >
          <option value="nao_exportadas">Não exportadas</option>
          <option value="exportadas">Exportadas</option>
          <option value="todas">Todas</option>
        </select>

        <select
          value={filtroSetor}
          onChange={e => setFiltroSetor(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
        >
          <option value="todos">Todos os setores</option>
          {sectors.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filtroClassificacao}
          onChange={e => setFiltroClassificacao(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
        >
          <option value="todas">Toda classificação</option>
          <option value="Urgente">Urgente</option>
          <option value="Normal">Normal</option>
        </select>

        <select
          value={filtroDeposito}
          onChange={e => setFiltroDeposito(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm cursor-pointer"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
        >
          <option value="todos">Todo depósito</option>
          <option value="0001">0001 — estoque</option>
          <option value="0050">0050 — direta</option>
        </select>
      </div>

      {/* Lista */}
      <div
        data-tour="abrir-rm-lista"
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        <div
          className="flex items-center gap-3 px-3 py-2.5 border-b"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <button
            type="button"
            onClick={alternarTodas}
            disabled={filtradasPrincipais.length === 0}
            className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer disabled:opacity-40"
            style={{ color: 'var(--ink-secondary)' }}
          >
            {todasVisiveisMarcadas
              ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--brand)' }} />
              : <Square className="h-4 w-4" />}
            {todasVisiveisMarcadas ? 'Desmarcar todas' : 'Marcar todas'}
          </button>
          <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            {filtradasPrincipais.length} {filtradasPrincipais.length === 1 ? 'solicitação' : 'solicitações'} no recorte
          </span>
        </div>

        {filtradasPrincipais.length === 0 ? (
          <TableEmpty
            icon={PackageSearch}
            title="Nada para abrir aqui"
            hint={
              filtroExportacao === 'nao_exportadas'
                ? 'Nenhuma solicitação aprovada aguardando exportação neste recorte. Troque o filtro para "Todas" para ver as que já saíram.'
                : 'Nenhuma solicitação aprovada bate com os filtros escolhidos.'
            }
          />
        ) : (
          <ul>
            {filtradasPrincipais.map(r => {
              const itens = itensPorRequest[r.id] || [];
              const marcada = selecionadas.has(r.id);
              const aberta = expandida === r.id;
              // Vigente = está exportada agora. Última = já saiu alguma vez,
              // mesmo que tenha sido reaberta — é o que vira a observação.
              const vigente = exportacaoVigentePorRequest.get(r.id);
              const exportacao = ultimaExportacaoPorRequest.get(r.id);
              const reaberta = !vigente && exportacao ? exportacao : null;
              const loteReaberto = reaberta ? loteById.get(reaberta.exportacao_id) : undefined;
              const setor = setorPorId.get(r.solicitante_sector_id);
              const urgente = classificacaoRm(r.criticality) === 'Urgente';

              return (
                <li key={r.id} className="border-b last:border-b-0" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="flex items-start gap-3 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => alternar(r.id)}
                      aria-label={marcada ? `Desmarcar solicitação ${r.number}` : `Marcar solicitação ${r.number}`}
                      className="mt-0.5 cursor-pointer shrink-0"
                    >
                      {marcada
                        ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                        : <Square className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                          #{r.number}
                        </span>
                        <span
                          className="text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide"
                          style={{
                            color: urgente ? 'var(--status-serious)' : 'var(--ink-secondary)',
                            background: urgente
                              ? 'color-mix(in srgb, var(--status-serious) 14%, transparent)'
                              : 'color-mix(in srgb, var(--ink-muted) 12%, transparent)',
                          }}
                          title={rotuloCriticidade(r.criticality)}
                        >
                          {urgente ? 'Urgente' : 'Normal'}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded font-mono"
                          style={{
                            color: 'var(--ink-secondary)',
                            background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)',
                          }}
                          title={r.tipo_compra === 'Estoque' ? 'Compra para estoque' : 'Compra direta'}
                        >
                          Dep. {depositoRm(r.tipo_compra)}
                        </span>
                        {vigente && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                            style={{
                              color: 'var(--status-good)',
                              background: 'color-mix(in srgb, var(--status-good) 14%, transparent)',
                            }}
                            title={`Exportada em ${formatDateTimeBR(vigente.created_at)}`}
                          >
                            <FileSpreadsheet className="h-3 w-3" />
                            Exportada
                          </span>
                        )}
                        {reaberta && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                            style={{
                              color: 'var(--status-serious)',
                              background: 'color-mix(in srgb, var(--status-serious) 16%, transparent)',
                            }}
                            title={
                              `Reaberta por ${exportacao.reaberto_por_nome || 'usuário desconhecido'}` +
                              ` em ${exportacao.reaberto_em ? formatDateTimeBR(exportacao.reaberto_em) : '—'}` +
                              (exportacao.reaberto_motivo ? ` — ${exportacao.reaberto_motivo}` : '')
                            }
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reaberta
                          </span>
                        )}

                        {itens.some(it => it.is_generic) && (
                          <span
                            className="inline-flex items-center text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-2xs bg-rose-100 text-rose-900 border border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700"
                            title="Esta solicitação possui item(ns) genérico(s)"
                          >
                            Item Genérico
                          </span>
                        )}
                      </div>

                      {reaberta && (
                        <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--status-serious)' }}>
                          Já exportada por {loteReaberto?.exportado_por_nome || 'usuário não identificado'} em{' '}
                          {formatDateTimeBR(reaberta.created_at)}
                          {loteReaberto?.arquivo ? ` (${loteReaberto.arquivo})` : ''}. Reaberta por{' '}
                          {reaberta.reaberto_por_nome || 'usuário não identificado'} em{' '}
                          {reaberta.reaberto_em ? formatDateTimeBR(reaberta.reaberto_em) : '—'}
                          {reaberta.reaberto_motivo ? `: ${reaberta.reaberto_motivo}` : '.'}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3 opacity-70" />
                          {requisitanteRm(r.solicitante_name)}
                        </span>
                        <span>{nomeSetor(r.solicitante_sector_id)} ({campoZRm(setor) || '—'})</span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 opacity-70" />
                          {formatDateBR(r.created_at)}
                        </span>
                        <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                      </div>

                      {r.justificativa && (
                        <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--ink-muted)' }}>
                          {r.justificativa}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandida(aberta ? null : r.id)}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold cursor-pointer hover:opacity-80"
                      style={{ color: 'var(--brand)' }}
                    >
                      {aberta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {aberta ? 'Fechar' : 'Itens'}
                    </button>
                  </div>

                  {aberta && (
                    <div className="px-3 pb-3 pl-10">
                      {itens.length === 0 ? (
                        <p className="text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>
                          Sem itens cadastrados — esta solicitação não gera linha na planilha.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr style={{ background: 'var(--surface)' }}>
                                {['Item', 'MATNR', 'Descrição', 'Qtd.', 'Un.', 'EKGRP', 'Observação'].map(h => (
                                  <th
                                    key={h}
                                    className="text-left font-bold uppercase tracking-wider px-2 py-1.5 text-[10px] whitespace-nowrap"
                                    style={{ color: 'var(--ink-muted)' }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {itens.map((it, idx) => {
                                const matnr = (it.sap_code || '').trim();
                                const grupoMercadoria = matnr ? contexto.grupoMercadoriaPorMaterial.get(matnr) : null;
                                const ekgrp = grupoComprasRm(it, contexto);
                                const ehGen = Boolean(it.is_generic);

                                return (
                                  <tr
                                    key={it.id}
                                    className={`border-t transition-colors ${
                                      ehGen
                                        ? 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 font-medium'
                                        : ''
                                    }`}
                                    style={{ borderColor: 'var(--hairline)' }}
                                  >
                                    <td className="px-2 py-1.5 font-mono" style={{ color: ehGen ? 'var(--status-critical)' : 'var(--ink-secondary)' }}>
                                      {(idx + 1) * 10}
                                    </td>
                                    <td className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap">
                                      {it.sap_code ? (
                                        <div>
                                          <div className={ehGen ? 'text-rose-900 dark:text-rose-200 font-bold' : ''}>{it.sap_code}</div>
                                          {grupoMercadoria && (
                                            <div className="text-[10px] font-normal tracking-tight" style={{ color: 'var(--ink-muted)' }} title={`Grupo de Mercadorias SAP: ${grupoMercadoria}`}>
                                              {grupoMercadoria}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--status-serious)' }}>
                                          <AlertTriangle className="h-3 w-3" /> sem código
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5" style={{ color: ehGen ? 'var(--status-critical)' : 'var(--ink-primary)' }}>
                                      {ehGen ? (
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-black uppercase tracking-wide text-rose-700 dark:text-rose-300">
                                            {it.description.toUpperCase()}
                                          </span>
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-600 text-white shadow-2xs">
                                            GENÉRICO
                                          </span>
                                        </div>
                                      ) : (
                                        it.description
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5 font-semibold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{it.quantity}</td>
                                    <td className="px-2 py-1.5" style={{ color: 'var(--ink-secondary)' }}>{it.unit}</td>
                                    <td
                                      className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap"
                                      style={{ color: ekgrp ? 'var(--ink-primary)' : 'var(--status-serious)' }}
                                      title={
                                        ekgrp
                                          ? `Grupo de Mercadoria: ${grupoMercadoria || '—'} — Comprador: ${ekgrp}`
                                          : grupoMercadoria
                                            ? `Grupo ${grupoMercadoria} sem comprador ativo no cadastro — sai como ${RM_GRUPO_COMPRAS_PADRAO}`
                                            : `Material não localizado no catálogo SAP — sai como ${RM_GRUPO_COMPRAS_PADRAO}`
                                      }
                                    >
                                      {ekgrp || `${RM_GRUPO_COMPRAS_PADRAO} *`}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      {ehGen ? (
                                        <span className="font-bold uppercase text-rose-800 dark:text-rose-200 not-italic">
                                          {it.observation ? it.observation.toUpperCase() : '—'}
                                        </span>
                                      ) : (
                                        <span className="italic" style={{ color: 'var(--ink-muted)' }}>
                                          {it.observation || '—'}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <p className="text-[10px] mt-2" style={{ color: 'var(--ink-muted)' }}>
                        Sai como centro {RM_CENTRO}, requisitante {requisitanteRm(r.solicitante_name) || '—'} e
                        campo Z {campoZRm(setor) || '—'}. O grupo de compras é por item, pelo comprador
                        responsável no cadastro; o asterisco marca o que caiu no padrão {RM_GRUPO_COMPRAS_PADRAO}.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Histórico de exportações */}
      <div
        data-tour="abrir-rm-historico"
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        <button
          type="button"
          onClick={() => setHistoricoAberto(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-secondary)' }}>
            <History className="h-4 w-4" />
            Histórico de exportações ({exportacoes.length})
          </span>
          {historicoAberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {historicoAberto && (
          <div className="border-t" style={{ borderColor: 'var(--hairline)' }}>
            {exportacoes.length === 0 ? (
              <p className="px-3 py-4 text-xs italic" style={{ color: 'var(--ink-muted)' }}>
                Nenhuma planilha de RM exportada ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr style={{ background: 'var(--surface)' }}>
                      {['Arquivo', 'Exportado por', 'Data', 'Solicitações', 'Linhas', 'Ações'].map(h => (
                        <th
                          key={h}
                          className={`font-bold uppercase tracking-wider px-3 py-1.5 text-[10px] whitespace-nowrap ${h === 'Ações' ? 'text-right' : 'text-left'}`}
                          style={{ color: 'var(--ink-muted)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exportacoes.map(e => {
                      const doLote = marcasPorLote.get(e.id) || [];
                      const vigentesNoLote = doLote.filter(m => !m.reaberto_em);
                      const abertoAqui = loteExpandido === e.id;
                      const ocupado = reabrindo === e.id;

                      return (
                        <React.Fragment key={e.id}>
                          <tr className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                            <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--ink-primary)' }}>{e.arquivo}</td>
                            <td className="px-3 py-1.5" style={{ color: 'var(--ink-secondary)' }}>{e.exportado_por_nome}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{formatDateTimeBR(e.created_at)}</td>
                            <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--ink-primary)' }}>
                              {e.total_solicitacoes}
                              {vigentesNoLote.length < doLote.length && (
                                <span className="ml-1 font-sans font-semibold text-[10px]" style={{ color: 'var(--status-serious)' }}>
                                  ({doLote.length - vigentesNoLote.length} reaberta{doLote.length - vigentesNoLote.length === 1 ? '' : 's'})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-semibold" style={{ color: 'var(--ink-primary)' }}>{e.total_itens}</td>
                            <td className="px-3 py-1.5">
                              <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                                {doLote.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setLoteExpandido(abertoAqui ? null : e.id)}
                                    className="inline-flex items-center gap-1 font-semibold cursor-pointer hover:opacity-80"
                                    style={{ color: 'var(--brand)' }}
                                  >
                                    {abertoAqui ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                    {abertoAqui ? 'Ocultar' : 'Solicitações'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleReabrirLote(e)}
                                  disabled={ocupado || vigentesNoLote.length === 0}
                                  title={
                                    vigentesNoLote.length === 0
                                      ? 'Todas as solicitações deste lote já foram reabertas.'
                                      : 'Devolve as solicitações deste lote à fila para exportar de novo. O registro do lote continua aqui.'
                                  }
                                  className="inline-flex items-center gap-1 font-semibold cursor-pointer hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={{ color: 'var(--status-serious)' }}
                                >
                                  {ocupado
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <RotateCcw className="h-3.5 w-3.5" />}
                                  Reabrir
                                </button>
                              </div>
                            </td>
                          </tr>

                          {abertoAqui && (
                            <tr style={{ background: 'var(--surface)' }}>
                              <td colSpan={6} className="px-3 py-2.5">
                                <div className="space-y-2">
                                  {doLote.map(m => {
                                    const marcaOcupada = reabrindo === m.id;
                                    // Itens de agora, não os de quando saiu na planilha: a
                                    // solicitação não muda de item depois de aprovada, mas
                                    // buscar direto do localDb (em vez do recorte "aprovada"
                                    // da tela) evita sumir se o status mudar entretanto.
                                    const itensDaMarca = localDb.getRequestItems(m.request_id);
                                    return (
                                      <div
                                        key={m.id}
                                        className="rounded-lg border overflow-hidden"
                                        style={{
                                          borderColor: 'var(--hairline)',
                                          background: 'var(--surface-raised)',
                                          opacity: m.reaberto_em ? 0.7 : 1,
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b" style={{ borderColor: 'var(--hairline)' }}>
                                          <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--ink-primary)' }}>
                                            #{m.request_number}
                                            <span className="ml-1 font-sans font-normal" style={{ color: 'var(--ink-muted)' }}>
                                              ({m.total_itens} {m.total_itens === 1 ? 'item' : 'itens'})
                                            </span>
                                          </span>
                                          {m.concluido_em ? (
                                            <span
                                              className="inline-flex items-center gap-1 font-semibold text-[10px]"
                                              style={{ color: 'var(--status-good)' }}
                                              title={`Concluído por ${m.concluido_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(m.concluido_em)}`}
                                            >
                                              <Check className="h-3 w-3" />
                                              Concluído por {m.concluido_por_nome || 'usuário não identificado'} em {formatDateTimeBR(m.concluido_em)}
                                            </span>
                                          ) : m.liberado_exportar_em ? (
                                            <span
                                              className="inline-flex items-center gap-1 font-semibold text-[10px]"
                                              style={{ color: 'var(--ink-secondary)' }}
                                              title={`Liberada para exportar por ${m.liberado_exportar_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(m.liberado_exportar_em)}`}
                                            >
                                              <RotateCcw className="h-3 w-3" />
                                              Liberada para exportar por {m.liberado_exportar_por_nome || 'usuário não identificado'} em {formatDateTimeBR(m.liberado_exportar_em)}
                                            </span>
                                          ) : m.reaberto_em ? (
                                            <span
                                              className="inline-flex items-center gap-1 font-semibold text-[10px]"
                                              style={{ color: 'var(--status-serious)' }}
                                              title={`Reaberta por ${m.reaberto_por_nome || 'usuário não identificado'} em ${formatDateTimeBR(m.reaberto_em)}`}
                                            >
                                              <RotateCcw className="h-3 w-3" />
                                              Reaberta por {m.reaberto_por_nome || 'usuário não identificado'} em {formatDateTimeBR(m.reaberto_em)}
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleReabrirSolicitacao(m)}
                                              disabled={marcaOcupada}
                                              title={`Reabrir só a #${m.request_number}`}
                                              className="inline-flex items-center gap-1 font-semibold text-[10px] cursor-pointer hover:opacity-80 disabled:opacity-40"
                                              style={{ color: 'var(--status-serious)' }}
                                            >
                                              {marcaOcupada
                                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                                : <RotateCcw className="h-3 w-3" />}
                                              Reabrir
                                            </button>
                                          )}
                                        </div>

                                        {m.reaberto_em && m.reaberto_motivo && (
                                          <div
                                            className="px-2.5 py-1.5 border-b"
                                            style={{
                                              borderColor: 'var(--hairline)',
                                              background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)',
                                            }}
                                          >
                                            <ListaMudancas motivo={m.reaberto_motivo} />
                                          </div>
                                        )}

                                        {itensDaMarca.length === 0 ? (
                                          <p className="px-2.5 py-1.5 text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>
                                            Itens não encontrados no cache local.
                                          </p>
                                        ) : (
                                          <ul>
                                            {itensDaMarca.map((it, idx) => (
                                              <li
                                                key={it.id}
                                                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-2.5 py-1 text-[11px] border-t first:border-t-0"
                                                style={{ borderColor: 'color-mix(in srgb, var(--hairline) 50%, transparent)' }}
                                              >
                                                <span className="font-mono" style={{ color: 'var(--ink-muted)' }}>{idx + 1}.</span>
                                                <span className="font-mono font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                                                  {it.sap_code || 'sem código'}
                                                </span>
                                                <span style={{ color: 'var(--ink-primary)' }}>{it.description}</span>
                                                <span style={{ color: 'var(--ink-muted)' }}>
                                                  {it.quantity} {it.unit}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {aba === 'abertas' && (
      <>
      {/* KPIs da aba Abertas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { rotulo: 'Abertas', valor: abertas.length, icone: FileSpreadsheet, alerta: false },
          { rotulo: 'Com RM', valor: abertasComRm, icone: Link2, alerta: false },
          { rotulo: 'Sem RM', valor: abertasSemRm, icone: AlertTriangle, alerta: true },
        ].map(k => {
          const emAlerta = k.alerta && k.valor > 0;
          return (
            <div
              key={k.rotulo}
              className="rounded-xl border p-3.5"
              style={{
                borderColor: emAlerta ? 'var(--status-serious)' : 'var(--hairline)',
                background: emAlerta
                  ? 'color-mix(in srgb, var(--status-serious) 10%, var(--surface-raised))'
                  : 'var(--surface-raised)',
              }}
            >
              <div
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: emAlerta ? 'var(--status-serious)' : 'var(--ink-muted)' }}
              >
                <k.icone className="h-3.5 w-3.5" />
                {k.rotulo}
              </div>
              <div
                className="text-2xl font-extrabold mt-1"
                style={{ color: emAlerta ? 'var(--status-serious)' : 'var(--ink-primary)' }}
              >
                {k.valor}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload da planilha reimportada */}
      <div
        data-tour="abrir-rm-vincular-upload"
        className="rounded-xl border p-3.5"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        <label
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors"
          style={{
            borderColor: importandoRm ? 'var(--brand)' : 'var(--hairline)',
            background: importandoRm ? 'color-mix(in srgb, var(--brand) 6%, transparent)' : 'transparent',
          }}
        >
          <input
            ref={inputArquivoRmRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            disabled={importandoRm}
            onChange={e => {
              if (e.target.files?.[0]) handleImportarPlanilhaRm(e.target.files[0]);
            }}
            className="hidden"
          />
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--brand) 14%, transparent)' }}
          >
            {importandoRm
              ? <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand)' }} />
              : <Upload className="h-5 w-5" style={{ color: 'var(--brand)' }} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              {importandoRm ? 'Lendo a planilha…' : 'Importar planilha com a RM preenchida'}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              A mesma planilha exportada daqui, ou o controle do comprador (inclusive .xlsm com
              macro — lê a aba "BD" quando existe), com a coluna "Status / Nº da RM" preenchida.
              Só atualiza o que for novo ou diferente do que a solicitação já tinha. Aceita .xlsx,
              .xlsm, .xls ou .csv.
            </p>
          </div>
        </label>
      </div>

      {erroLog && (
        <div className="flex items-start gap-3 p-4 border border-amber-200 dark:border-amber-900/50 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span className="text-sm font-medium">
            {erroLog} A vinculação de RM continua funcionando, mas a lista de "Abertas" pode não
            estar completa agora.
          </span>
        </div>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
        <input
          value={buscaAbertas}
          onChange={e => setBuscaAbertas(e.target.value)}
          placeholder="Número, solicitante ou RM"
          className="w-full max-w-md pl-9 pr-3 py-2 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
        />
      </div>

      {/* Lista de Abertas */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
      >
        {abertas.length === 0 ? (
          <TableEmpty
            icon={FileSpreadsheet}
            title="Nada exportado ainda"
            hint='Nenhuma solicitação exportada bate com a busca. Exporte pela aba "Para Abrir" ou troque o termo buscado.'
          />
        ) : (
          <ul>
            {abertas.map(r => {
              const itens = itensPorRequest[r.id] || [];
              const vigente = exportacaoVigentePorRequest.get(r.id);
              const lote = vigente ? loteById.get(vigente.exportacao_id) : undefined;
              const temRm = !!r.linked_rm_number;

              return (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-3 py-3 border-b last:border-b-0"
                  style={{ borderColor: 'var(--hairline)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
                        #{r.number}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide"
                        style={{
                          color: temRm ? 'var(--status-good)' : 'var(--status-serious)',
                          background: temRm
                            ? 'color-mix(in srgb, var(--status-good) 14%, transparent)'
                            : 'color-mix(in srgb, var(--status-serious) 14%, transparent)',
                        }}
                      >
                        {temRm ? <Link2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {temRm ? `RM ${r.linked_rm_number}` : 'Sem RM'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] mt-1" style={{ color: 'var(--ink-secondary)' }}>
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3 opacity-70" />
                        {requisitanteRm(r.solicitante_name)}
                      </span>
                      <span>{nomeSetor(r.solicitante_sector_id)}</span>
                      <span>{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                      {lote && (
                        <span>
                          Exportada em {lote.arquivo} · {formatDateTimeBR(vigente!.created_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <CampoRmVinculo
                    key={`${r.id}-${r.linked_rm_number || ''}`}
                    valor={r.linked_rm_number || ''}
                    onSalvar={novo => vincularRm(r, novo)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
      </>
      )}

      {/* Modal de Prévia da Planilha */}
      {modalPreviewAberto && (
        <Modal
          onClose={() => !exportando && setModalPreviewAberto(false)}
          maxWidth="max-w-6xl"
          ariaLabel="Prévia da Planilha de Abertura de RM"
        >
          <ModalHeader onClose={() => !exportando && setModalPreviewAberto(false)}>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
                  Prévia da Planilha de Abertura de RM (SAP)
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                  Confira as colunas e linhas antes de exportar. A planilha segue rigorosamente a ordem exigida para importação no SAP.
                </p>
              </div>
            </div>
          </ModalHeader>

          <ModalBody className="p-0 flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Barra de resumo da exportação */}
            <div
              className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
            >
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--ink-primary)' }}>
                  <Boxes className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {selecaoRm.length} {selecaoRm.length === 1 ? 'solicitação selecionada' : 'solicitações selecionadas'}
                </span>
                <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: 'var(--ink-primary)' }}>
                  <FileSpreadsheet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {linhasPrevistas.length} {linhasPrevistas.length === 1 ? 'linha a gerar' : 'linhas a gerar'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {totalGenericosPrevistos > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-[11px] font-bold">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    {totalGenericosPrevistos} {totalGenericosPrevistos === 1 ? 'item genérico' : 'itens genéricos'}
                  </span>
                )}
                {semCodigoSap > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {semCodigoSap} sem código SAP
                  </span>
                )}
                {semGrupoComprador > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 text-[11px] font-bold">
                    {semGrupoComprador} com grupo compras {RM_GRUPO_COMPRAS_PADRAO}*
                  </span>
                )}
                {semCodigoSap === 0 && semGrupoComprador === 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold">
                    ✓ Todos os dados e compradores validados
                  </span>
                )}
              </div>
            </div>

            {/* Tabela de Planilha */}
            <div className="flex-1 overflow-auto max-h-[55vh]">
              <table className="w-full text-[11px] border-collapse">
                <thead className="sticky top-0 z-10 shadow-2xs" style={{ background: 'var(--surface)' }}>
                  <tr>
                    {RM_COLUNAS.map(col => (
                      <th
                        key={col}
                        className="text-left font-bold uppercase tracking-wider px-3 py-2 text-[10px] whitespace-nowrap border-b border-r"
                        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasPrevistas.map((l, idx) => {
                    const itemOrigem = itensPrevistos[idx];
                    const ehGenerico = Boolean(itemOrigem?.is_generic);
                    const matnr = String(l['Material (MATNR)'] || '').trim();
                    const ekgrp = String(l['Grupo Compras (EKGRP)'] || '').trim();
                    const semMatnr = !matnr;
                    const fallbackEkgrp = ekgrp === RM_GRUPO_COMPRAS_PADRAO;

                    return (
                      <tr
                        key={idx}
                        className={`border-b transition-colors ${
                          ehGenerico
                            ? 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 hover:bg-rose-100/80 dark:hover:bg-rose-900/50 font-medium'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                        style={{ borderColor: 'var(--hairline)' }}
                      >
                        <td className="px-3 py-2 font-mono font-bold whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: ehGenerico ? 'var(--status-critical)' : 'var(--ink-primary)' }}>
                          <div className="flex items-center gap-1.5">
                            <span>{l['ID Req']}</span>
                            {ehGenerico && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-600 text-white shadow-2xs">
                                GENÉRICO
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)' }}>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            l['Classificação'] === 'Urgente'
                              ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            {l['Classificação']}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-center border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                          {l['Item']}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)' }}>
                          {semMatnr ? (
                            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-bold">
                              <AlertTriangle className="h-3 w-3" /> Sem código
                            </span>
                          ) : (
                            <span style={{ color: ehGenerico ? 'var(--status-critical)' : 'var(--ink-primary)' }} className={ehGenerico ? 'font-bold' : ''}>
                              {matnr}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-right whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                          {l['Quantidade (MENGE)']}
                        </td>
                        <td className="px-3 py-2 font-mono text-center whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                          {l['Depósito (LGOBE)']}
                        </td>
                        <td className="px-3 py-2 font-mono text-center whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                          {l['Centro (NAME1)']}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)' }}>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            fallbackEkgrp
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          }`}>
                            {ekgrp}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                          {l['Requisitante (AFNAM)']}
                        </td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                          {l['Campo Z (ZZKOKRS)']}
                        </td>
                        <td className="px-3 py-2 font-mono text-center border-r" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                          {l['Cat. Remessa (ELPEI)']}
                        </td>
                        <td
                          className={`px-3 py-2 max-w-xs truncate border-r text-[10px] ${
                            ehGenerico ? 'font-bold text-rose-900 dark:text-rose-200' : ''
                          }`}
                          style={{ borderColor: 'var(--hairline)', color: ehGenerico ? undefined : 'var(--ink-muted)' }}
                          title={String(l['Texto Cabeçalho (Justificativa)'] || '')}
                        >
                          {l['Texto Cabeçalho (Justificativa)']}
                        </td>
                        <td className="px-3 py-2 italic text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                          —
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ModalBody>

          <ModalFooter className="flex items-center justify-between gap-3 px-6 py-3 border-t">
            <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Ao confirmar, o arquivo Excel (.xlsx) será baixado e as solicitações registradas no histórico.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setModalPreviewAberto(false)}
                disabled={exportando}
                className="px-4 py-2 rounded-xl border text-xs font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarExportacao}
                disabled={exportando || linhasPrevistas.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer text-white hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'var(--brand)' }}
              >
                {exportando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Confirmar e Exportar Planilha
              </button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {tour.isOpen && (
        <TourSpotlight
          steps={ABRIR_RM_TOUR_STEPS}
          stepIndex={tour.stepIndex}
          onNext={tour.next}
          onBack={tour.back}
          onClose={tour.close}
        />
      )}
    </div>
  );
}

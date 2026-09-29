import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardCheck, Eye, FileDown, FileText, History, Inbox, Loader2, Lock,
  PenTool, Plus, RotateCcw, Save, Search, Signature, Trash2, UserCheck, Users, WifiOff, X,
} from 'lucide-react';
import type {
  Profile, QuaChecklistAssinaturaTipo, QuaChecklistExpedicao,
  QuaChecklistPapel, QuaChecklistResposta, QuaChecklistStatus,
} from '../../types';
import { localDb } from '../../db/localDb';
import * as api from '../../lib/qualidadeChecklistExpedicao';
import {
  comCache, guardarCache, lerCache, mesclarComPendencias, novaPendencia, obterPendencia, prepararAssinaturaOffline,
  prepararFotoOffline, removerPendencia, salvarPendencia, urlLocal,
  type ArquivoOffline, type RemocaoOffline, type ResultadoSincronizacao,
} from '../../lib/qualidadeOffline';
import { gerarUUID } from '../../lib/ids';
import { estaOffline, pareceFalhaDeRede } from '../../lib/rede';
import { exportQualidadeChecklistExpedicaoPdf, gerarQualidadeChecklistExpedicaoPdf } from '../../lib/pdfExport/exportQualidadeChecklistExpedicaoPdf';
import Bilingue from '../../components/qualidade/Bilingue';
import ColetaAssinaturaTablet, { type AssinaturaColetada, type ModoColeta } from '../../components/qualidade/ColetaAssinaturaTablet';
import FormularioPdfPreview from '../../components/qualidade/FormularioPdfPreview';
import { ChipSincronizacao, PainelSincronizacao, useSincronizacaoOffline } from '../../components/qualidade/SincronizacaoOffline';
import { useLightbox } from '../../components/ui/Lightbox';
import { useToast } from '../../components/ui/Toast';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const MODULO = 'qua_expedicao' as const;
/** Detalhes guardados no aparelho para abrir sem rede; limite para não baixar a fila inteira. */
const MAX_DETALHES_OFFLINE = 20;

type Tela = 'inicio' | 'formulario' | 'assinaturas' | 'historico';
type FiltroHistorico = QuaChecklistStatus | 'TODOS';
type HeaderKey = 'cliente' | 'projeto' | 'tramo_sequencial' | 'numero_serie' | 'data_expedicao' | 'site' | 'inspetor_qualidade';
type Checklist = api.ChecklistExpedicaoTela;
type FotoRascunho = Partial<api.FotoExpedicaoTela> & { localUrl?: string; id: string; item_chave: string };
type Observacao = api.ChecklistObservacao;
/** Destino da próxima assinatura capturada: um checklist ou vários (lote). */
type AlvoAssinatura = { papel: QuaChecklistPapel; nome: string; ids: string[] };
/** Coleta aberta no tablet; `sequencia` avança sozinho para o próximo papel pendente. */
type ColetaTablet = { papel: QuaChecklistPapel; ids: string[]; nomeInicial: string; modo: ModoColeta; sequencia: boolean; contexto: string; local?: boolean };
/** Assinatura coletada durante o preenchimento — sobe junto com o salvar/fechar. */
type AssinaturaPendente = AssinaturaColetada & { url: string };

const HEADERS: { key: HeaderKey; pt: string; en: string; type?: string }[] = [
  { key: 'cliente', pt: 'Cliente', en: 'Client' },
  { key: 'projeto', pt: 'Projeto', en: 'Project' },
  { key: 'tramo_sequencial', pt: 'Tramo / Sequencial', en: 'Section / Sequential' },
  { key: 'numero_serie', pt: 'Número de série', en: 'Serial number' },
  { key: 'data_expedicao', pt: 'Data de expedição', en: 'Shipping date', type: 'date' },
  { key: 'site', pt: 'Site', en: 'Site' },
  { key: 'inspetor_qualidade', pt: 'Inspetor de qualidade', en: 'Quality inspector' },
];

const STATUS_INFO: Record<QuaChecklistStatus, { label: string; className: string }> = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  AGUARDANDO_ASSINATURAS: { label: 'Aguardando assinaturas', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  FINALIZADO: { label: 'Finalizado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
};

const RESPOSTAS: { value: QuaChecklistResposta; label: string; active: string }[] = [
  { value: 'OK', label: 'OK', active: 'border-emerald-600 bg-emerald-600 text-white' },
  { value: 'NA', label: 'N/A', active: 'border-slate-600 bg-slate-600 text-white' },
  { value: 'NOK', label: 'NOK', active: 'border-red-600 bg-red-600 text-white' },
];

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900';
const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';
const botaoPrimario = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60';
const botaoSecundario = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

const formatDate = (value?: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '-';
function fmtDataHora(value?: string | null): string {
  if (!value) return '-';
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function novoCabecalho(user: Profile): Record<HeaderKey, string> {
  return { cliente: api.CHECKLIST_CLIENTE_PADRAO, projeto: '', tramo_sequencial: '', numero_serie: '', data_expedicao: api.hojeLocal(), site: api.CHECKLIST_SITE_PADRAO, inspetor_qualidade: user.name };
}
function respostasVazias(): Record<string, QuaChecklistResposta | null> {
  return Object.fromEntries(api.CHECKLIST_ITENS.map(item => [item.chave, null]));
}
function observacoesVazias(): Record<string, Observacao> {
  return Object.fromEntries(api.CHECKLIST_OBSERVACOES.map(item => [item.chave, { resposta: null, texto: '' }]));
}
function nomesVazios(): Record<QuaChecklistPapel, string> {
  return { QUALIDADE: '', PRODUCAO: '', CLIENTE: '', TRANSPORTADOR: '' };
}
function agruparFotos(fotos: api.FotoExpedicaoTela[]): Record<string, FotoRascunho[]> {
  return fotos.reduce<Record<string, FotoRascunho[]>>((acc, foto) => {
    (acc[foto.item_chave] ||= []).push(foto);
    return acc;
  }, {});
}
const rotuloPapel = (papel: QuaChecklistPapel) => api.CHECKLIST_PAPEIS.find(item => item.papel === papel)?.label || papel;

/** Registro do servidor com o que está só no aparelho aplicado por cima. */
const aplicar = (base: QuaChecklistExpedicao | null, p: api.PendenciaExpedicao): Checklist =>
  api.aplicarPendenciaExpedicao(base, p, (arquivo: ArquivoOffline) => urlLocal(arquivo, p.id));

function tituloPendencia(p: api.PendenciaExpedicao): string {
  const dados = p.input || p.base;
  return `${p.base?.codigo_registro || 'Novo checklist'}${dados?.tramo_sequencial ? ` · ${dados.tramo_sequencial}` : ''}${dados?.numero_serie ? ` · Série ${dados.numero_serie}` : ''}`;
}

const semCodigo = <span className="font-sans font-semibold italic text-slate-400">Código gerado ao sincronizar</span>;

function StatusBadge({ status }: { status: QuaChecklistStatus }) {
  const info = STATUS_INFO[status] || STATUS_INFO.RASCUNHO;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${info.className}`}>{info.label}</span>;
}

function RespostaBotoes({ value, onChange, disabled }: { value: QuaChecklistResposta | null | undefined; onChange: (value: QuaChecklistResposta) => void; disabled?: boolean }) {
  if (disabled) {
    const opcao = RESPOSTAS.find(item => item.value === value);
    return opcao
      ? <span className={`inline-flex rounded-lg border px-3 py-1 text-xs font-bold ${opcao.active}`}>{opcao.label}</span>
      : <span className="inline-flex rounded-lg border border-dashed border-slate-300 px-3 py-1 text-xs font-semibold text-slate-400 dark:border-slate-700">Sem resposta</span>;
  }
  return <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Verificação final">
    {RESPOSTAS.map(opcao => <button key={opcao.value} type="button" aria-pressed={value === opcao.value} onClick={() => onChange(opcao.value)} className={`min-h-[40px] rounded-xl border text-xs font-bold transition ${value === opcao.value ? opcao.active : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>{opcao.label}</button>)}
  </div>;
}

/** Área de imagem do item: a foto registrada ocupa o lugar; sem foto, convite para fotografar. */
function FotosItem({ fotos, editavel, onAdd, onRemove, onOpen, imagemNa }: { fotos: FotoRascunho[]; editavel: boolean; onAdd: (files: FileList) => void; onRemove: (foto: FotoRascunho) => void; onOpen: (indice: number) => void; imagemNa?: string | null }) {
  if (imagemNa) {
    // Marcado N/A: a imagem "Not Available" ocupa o lugar da foto (igual ao PDF).
    return <div className="space-y-2">
      <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700"><img src={imagemNa} alt="Não aplicável" className="h-full object-contain" /></div>
      {editavel && fotos.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">Fotos anteriores (não vão para o PDF):</span>
        {fotos.map(foto => <div key={foto.id} className="relative h-10 w-12 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <img src={foto.localUrl || foto.preview_url} alt="" className="h-full w-full object-cover opacity-60" />
          <button type="button" onClick={() => onRemove(foto)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/75 p-0.5 text-white" aria-label="Remover foto"><X className="h-3 w-3" /></button>
        </div>)}
      </div>}
    </div>;
  }
  const capa = fotos[0]?.localUrl || fotos[0]?.preview_url;
  return <div className="space-y-2">
    {capa ? <button type="button" onClick={() => onOpen(0)} className="relative block h-40 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" aria-label="Ampliar foto">
      <img src={capa} alt="Evidência" className="h-full w-full object-cover" />
      {fotos.length > 1 && <span className="absolute bottom-2 right-2 rounded-md bg-slate-950/75 px-2 py-0.5 text-[11px] font-bold text-white">+{fotos.length - 1}</span>}
    </button> : editavel ? <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-200 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-900/60 dark:text-blue-300 dark:hover:bg-blue-950/20">
      <Camera className="h-5 w-5" /> Tirar foto
      <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={event => { if (event.target.files?.length) onAdd(event.target.files); event.target.value = ''; }} />
    </label> : <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 dark:border-slate-700">Sem foto</div>}
    {(fotos.length > 1 || (editavel && fotos.length > 0)) && <div className="flex flex-wrap items-center gap-1.5">
      {fotos.map((foto, indice) => <div key={foto.id} className="relative h-12 w-14 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <button type="button" onClick={() => onOpen(indice)} className="h-full w-full" aria-label="Ampliar foto"><img src={foto.localUrl || foto.preview_url} alt="" className="h-full w-full object-cover" /></button>
        {editavel && <button type="button" onClick={() => onRemove(foto)} className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/75 p-0.5 text-white" aria-label="Remover foto"><X className="h-3 w-3" /></button>}
      </div>)}
      {editavel && <label className="inline-flex h-12 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-blue-300 px-2.5 text-[11px] font-bold text-blue-700 dark:border-blue-800 dark:text-blue-300"><Camera className="h-3.5 w-3.5" /> Foto<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={event => { if (event.target.files?.length) onAdd(event.target.files); event.target.value = ''; }} /></label>}
    </div>}
  </div>;
}

function ChipsAssinaturas({ checklist }: { checklist: Checklist }) {
  const assinados = api.papeisAssinados(checklist);
  return <div className="flex flex-wrap gap-1">
    {api.CHECKLIST_PAPEIS.map(({ papel, label }) => {
      const ok = assinados.has(papel);
      return <span key={papel} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <span className="h-2 w-2 rounded-full border border-current" />}{label.split(' / ')[0].replace('Responsável ', '')}
      </span>;
    })}
  </div>;
}

function ResumoCard({ item, acoes, detalhe, selecionado, onSelecionar }: { item: Checklist; acoes: React.ReactNode; detalhe?: React.ReactNode; selecionado?: boolean; onSelecionar?: () => void }) {
  const nok = Object.values(item.respostas || {}).filter(valor => valor === 'NOK').length + Object.values(item.observacoes || {}).filter(valor => valor?.resposta === 'NOK').length;
  return <div className={`${cardClass} flex flex-col gap-3 p-4 ${selecionado ? 'ring-2 ring-blue-500' : ''} ${item.offline ? 'border-amber-300 dark:border-amber-800' : ''}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{item.codigo_registro || semCodigo} <ChipSincronizacao offline={item.offline} /></p>
        <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-slate-50">{item.tramo_sequencial} <span className="font-normal text-slate-400">· Série {item.numero_serie}</span></p>
        <p className="truncate text-xs text-slate-500">{item.cliente} · {item.projeto}</p>
      </div>
      {onSelecionar ? <input type="checkbox" checked={!!selecionado} onChange={onSelecionar} className="mt-1 h-5 w-5 accent-blue-600" aria-label={`Selecionar ${item.codigo_registro}`} /> : <StatusBadge status={item.status} />}
    </div>
    <div className="space-y-1.5 text-[11px] text-slate-500">
      <p>Expedição {formatDate(item.data_expedicao)} · {item.site}</p>
      {detalhe}
      {item.status !== 'RASCUNHO' && <ChipsAssinaturas checklist={item} />}
      {nok > 0 && <p className="font-semibold text-red-600 dark:text-red-400">{nok} {nok === 1 ? 'item NOK' : 'itens NOK'}</p>}
    </div>
    {acoes && <div className="mt-auto flex flex-wrap gap-2">{acoes}</div>}
  </div>;
}

export default function QualidadeChecklistExpedicaoView({ user, onNavigate }: Props) {
  const toast = useToast();
  const lightbox = useLightbox();
  const ehAdmin = user.roles.includes('admin');
  const setores = useMemo(() => localDb.getSectors(), []);

  const [tela, setTela] = useState<Tela>('inicio');
  const [aberto, setAberto] = useState<Checklist | null>(null);
  /** Id do checklist novo em preenchimento — gerado no aparelho, vira o id definitivo no servidor. */
  const [idNovo, setIdNovo] = useState(() => gerarUUID());
  const [cabecalho, setCabecalho] = useState<Record<HeaderKey, string>>(() => novoCabecalho(user));
  const [respostas, setRespostas] = useState<Record<string, QuaChecklistResposta | null>>(respostasVazias);
  const [observacoes, setObservacoes] = useState<Record<string, Observacao>>(observacoesVazias);
  const [fotos, setFotos] = useState<Record<string, FotoRascunho[]>>({});
  /** Fotos/assinaturas do servidor removidas no formulário — saem ao salvar. */
  const [fotosRemovidas, setFotosRemovidas] = useState<RemocaoOffline[]>([]);
  const [assinaturasRemovidas, setAssinaturasRemovidas] = useState<string[]>([]);
  const [nomes, setNomes] = useState<Record<QuaChecklistPapel, string>>(nomesVazios);
  const [opcoes, setOpcoes] = useState<Record<string, string[]>>({});
  const [lista, setLista] = useState<QuaChecklistExpedicao[]>([]);
  const [listaSalvaEm, setListaSalvaEm] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroHistorico>('FINALIZADO');
  const [soMeus, setSoMeus] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [tablet, setTablet] = useState<ColetaTablet | null>(null);
  const [pendentes, setPendentes] = useState<Partial<Record<QuaChecklistPapel, AssinaturaPendente>>>({});
  const [assinando, setAssinando] = useState<{ papel: QuaChecklistPapel; feitos: number; total: number } | null>(null);
  const [lote, setLote] = useState<{ papel: QuaChecklistPapel; nome: string; ids: Set<string> } | null>(null);
  const [verRespostas, setVerRespostas] = useState(false);
  const [pdfAlvo, setPdfAlvo] = useState<Checklist | null>(null);
  const [imagemNa, setImagemNa] = useState<string | null>(null);

  useEffect(() => { api.urlImagemNaoAplicavel().then(setImagemNa); }, []);

  const podeColetar = useCallback((checklist: Checklist) => api.podeColetarAssinaturas(user, checklist, setores), [user, setores]);
  const podeEditar = (checklist: Checklist | null) => !checklist || (checklist.status === 'RASCUNHO' && (checklist.criado_por === user.id || ehAdmin));

  /**
   * Guarda no aparelho o detalhe do que o usuário provavelmente vai precisar
   * sem rede: os próprios rascunhos e a fila de assinaturas que ele coleta.
   * Só baixa de novo o que mudou no servidor desde a última cópia.
   */
  const guardarDetalhesOffline = useCallback(async (rows: QuaChecklistExpedicao[]) => {
    const alvos = rows
      .filter(row => (row.status === 'RASCUNHO' && row.criado_por === user.id) || (row.status === 'AGUARDANDO_ASSINATURAS' && api.podeColetarAssinaturas(user, row, setores)))
      .slice(0, MAX_DETALHES_OFFLINE);
    for (const row of alvos) {
      const cache = await lerCache<QuaChecklistExpedicao>(MODULO, `det:${row.id}`);
      if (cache && Date.parse(cache.salvoEm) >= Date.parse(row.updated_at)) continue;
      try {
        await guardarCache(MODULO, `det:${row.id}`, await api.obterChecklist(row.id));
      } catch {
        return; // caiu a rede no meio — tenta na próxima carga
      }
    }
  }, [user, setores]);

  const carregarLista = useCallback(async () => {
    try {
      const resultado = await comCache(MODULO, 'lista', api.listarChecklists);
      setLista(resultado.valor);
      setListaSalvaEm(resultado.doCache ? resultado.salvoEm : null);
      if (!resultado.doCache) void guardarDetalhesOffline(resultado.valor);
    } catch (error: any) {
      if (!pareceFalhaDeRede(error)) toast.error(`Erro ao carregar checklists: ${error.message || ''}`);
    } finally {
      setCarregando(false);
    }
  }, [toast, guardarDetalhesOffline]);

  // A rodada automática pode enviar o checklist aberto na fila de assinaturas
  // (lá não há edição em andamento): a tela troca a cópia do aparelho pela do servidor.
  const telaRef = useRef(tela);
  telaRef.current = tela;
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  const onResultadoSync = useCallback((resultado: ResultadoSincronizacao, automatico: boolean) => {
    if (resultado.enviados.length) void carregarLista();
    if (!automatico) return;
    const emTela = abertoRef.current;
    if (emTela && telaRef.current !== 'formulario' && resultado.enviados.includes(emTela.id)) {
      api.obterChecklist(emTela.id).then(atualizado => { if (abertoRef.current?.id === emTela.id) setAberto(atualizado); }).catch(() => {});
    }
    if (resultado.enviados.length) toast.success(`${resultado.enviados.length === 1 ? '1 checklist guardado no aparelho foi enviado' : `${resultado.enviados.length} checklists guardados no aparelho foram enviados`} ao servidor.`);
    if (resultado.erros.length) toast.error(`O servidor recusou ${resultado.erros.length === 1 ? '1 checklist' : `${resultado.erros.length} checklists`} guardado(s) no aparelho: ${resultado.erros[0].mensagem}`);
  }, [carregarLista, toast]);

  const sync = useSincronizacaoOffline<api.PendenciaExpedicao>({
    modulo: MODULO,
    usuarioId: user.id,
    sincronizar: api.sincronizarPendenciaExpedicao,
    abertoId: tela === 'formulario' ? aberto?.id || null : null,
    onResultado: onResultadoSync,
  });

  useEffect(() => {
    carregarLista();
    Promise.all(api.CHECKLIST_CAMPOS_CABECALHO.map(async campo => [campo, await api.listarOpcoesCabecalho(campo)] as const))
      .then(async entries => {
        const valores = Object.fromEntries(entries);
        const vazio = entries.every(([, itens]) => !itens.length);
        if (vazio) {
          const cache = await lerCache<Record<string, string[]>>(MODULO, 'opcoes');
          setOpcoes(cache?.valor || valores);
        } else {
          setOpcoes(valores);
          void guardarCache(MODULO, 'opcoes', valores);
        }
      }).catch(() => {});
  }, [carregarLista]);

  const listaTela = useMemo(() => mesclarComPendencias<Checklist, api.PendenciaExpedicao>(lista, sync.pendencias, aplicar), [lista, sync.pendencias]);

  const fila = useMemo(() => {
    const todos = api.filaAssinaturas(listaTela);
    return soMeus ? todos.filter(item => item.criado_por === user.id || item.fechado_por === user.id) : todos;
  }, [listaTela, soMeus, user.id]);
  const rascunhos = useMemo(() => listaTela.filter(item => item.status === 'RASCUNHO' && (item.criado_por === user.id || ehAdmin)), [listaTela, user.id, ehAdmin]);

  const preencher = (checklist: Checklist | null) => {
    setAberto(checklist);
    setVerRespostas(false);
    setFotosRemovidas([]);
    setAssinaturasRemovidas([]);
    setPendentes(prev => {
      Object.values(prev).forEach(item => item && URL.revokeObjectURL(item.url));
      return {};
    });
    if (!checklist) {
      setIdNovo(gerarUUID());
      setCabecalho(novoCabecalho(user)); setRespostas(respostasVazias()); setObservacoes(observacoesVazias()); setFotos({}); setNomes(nomesVazios());
      return;
    }
    setCabecalho({ cliente: checklist.cliente, projeto: checklist.projeto, tramo_sequencial: checklist.tramo_sequencial, numero_serie: checklist.numero_serie, data_expedicao: checklist.data_expedicao, site: checklist.site, inspetor_qualidade: checklist.inspetor_qualidade });
    setRespostas({ ...respostasVazias(), ...checklist.respostas });
    setObservacoes({ ...observacoesVazias(), ...checklist.observacoes });
    setNomes({ ...nomesVazios(), ...checklist.validacao_nomes });
    setFotos(agruparFotos(checklist.fotos));
  };

  const irPara = (novaTela: Tela) => {
    setTela(novaTela);
    window.scrollTo({ top: 0 });
  };

  const novoChecklist = () => { preencher(null); irPara('formulario'); };
  const voltarInicio = () => {
    if (Object.keys(pendentes).length && !window.confirm('Há assinaturas coletadas que ainda não foram salvas. Sair mesmo assim?')) return;
    preencher(null);
    irPara('inicio');
    carregarLista();
  };

  /**
   * Checklist completo para a tela: o do servidor (ou a cópia guardada no
   * aparelho, sem rede) com as pendências locais aplicadas. Checklist que
   * nasceu offline nem consulta o servidor.
   */
  const carregarCompleto = async (id: string): Promise<Checklist> => {
    const pendencia = await obterPendencia<api.PendenciaExpedicao>(MODULO, id);
    let base: QuaChecklistExpedicao | null = null;
    if (!pendencia?.novo) {
      try {
        base = (await comCache(MODULO, `det:${id}`, () => api.obterChecklist(id))).valor;
      } catch (error) {
        if (!pendencia) throw pareceFalhaDeRede(error) ? new Error('sem conexão, e este checklist ainda não foi baixado neste aparelho.') : error;
        base = pendencia.base;
      }
    }
    return pendencia ? aplicar(base, pendencia) : base as Checklist;
  };

  const abrir = async (id: string, destino?: Tela) => {
    setAbrindoId(id);
    try {
      const checklist = await carregarCompleto(id);
      preencher(checklist);
      const padrao: Tela = checklist.status === 'AGUARDANDO_ASSINATURAS' ? 'assinaturas' : 'formulario';
      irPara(destino || padrao);
    } catch (error: any) {
      toast.error(`Erro ao abrir checklist: ${error.message || ''}`);
    } finally {
      setAbrindoId(null);
    }
  };

  const verPdf = async (id: string) => {
    setAbrindoId(id);
    try { setPdfAlvo(await carregarCompleto(id)); } catch (error: any) { toast.error(`Erro ao gerar PDF: ${error.message || ''}`); } finally { setAbrindoId(null); }
  };
  const gerarPdf = useMemo(() => pdfAlvo ? () => gerarQualidadeChecklistExpedicaoPdf(pdfAlvo) : null, [pdfAlvo]);

  /** Comprime já na captura e guarda o blob — sobrevive a ficar sem rede. */
  const adicionarFotos = async (itemChave: string, files: FileList) => {
    const imagens = Array.from(files).filter(file => file.type.startsWith('image/'));
    const donoId = aberto?.id || idNovo;
    for (const file of imagens) {
      try {
        const local = await prepararFotoOffline(itemChave, file);
        const nova: FotoRascunho = { id: local.id, item_chave: itemChave, local, localUrl: urlLocal(local, donoId) };
        setFotos(prev => ({ ...prev, [itemChave]: [...(prev[itemChave] || []), nova] }));
      } catch (error: any) {
        toast.error(`Não foi possível processar a foto ${file.name}: ${error.message || ''}`);
      }
    }
  };

  const removerFoto = (itemChave: string, foto: FotoRascunho) => {
    if (foto.path) setFotosRemovidas(prev => [...prev, { id: foto.id, path: foto.path }]);
    setFotos(prev => ({ ...prev, [itemChave]: (prev[itemChave] || []).filter(item => item.id !== foto.id) }));
  };

  const abrirFotos = (itemChave: string, legenda: string, indice: number) => {
    lightbox.abrir((fotos[itemChave] || []).map(foto => ({ url: foto.localUrl || foto.preview_url || '', legenda })), indice);
  };

  const faltas = useMemo(() => api.faltasParaFechar(respostas, observacoes), [respostas, observacoes]);
  const respondidos = api.CHECKLIST_ITENS.length + api.CHECKLIST_OBSERVACOES.length - faltas.itens.length - faltas.observacoes.length;
  const totalPerguntas = api.CHECKLIST_ITENS.length + api.CHECKLIST_OBSERVACOES.length;

  /** Assinaturas do checklist aberto que continuam valendo no formulário. */
  const assinaturasVisiveis = useMemo(() => (aberto?.assinaturas || []).filter(item => !assinaturasRemovidas.includes(item.id)), [aberto, assinaturasRemovidas]);

  /**
   * Sobe a pendência na hora, se houver rede. Devolve o checklist do
   * servidor quando tudo subiu; `null` quando ficou no aparelho (sem rede ou
   * recusado — o motivo já foi avisado).
   */
  const enviarAgora = async (ids: string[]): Promise<{ resultado: ResultadoSincronizacao | null }> => {
    if (estaOffline()) return { resultado: null };
    return { resultado: await sync.sincronizarAgora({ ids, incluirAberto: true }) };
  };

  const salvar = async (fechar: boolean) => {
    const vazios = HEADERS.filter(field => !cabecalho[field.key].trim()).map(field => field.pt);
    if (vazios.length) { toast.error(`Preencha o cabeçalho: ${vazios.join(', ')}.`); return; }
    if (fechar && (faltas.itens.length || faltas.observacoes.length)) {
      const partes = [faltas.itens.length ? `itens ${faltas.itens.join(', ')}` : '', faltas.observacoes.length ? `observações ${faltas.observacoes.join(', ')}` : ''].filter(Boolean);
      toast.error(`Para fechar, responda: ${partes.join(' e ')}.`);
      return;
    }
    setSalvando(true);
    const id = aberto?.id || idNovo;
    try {
      // 1. Guarda no aparelho — a partir daqui nada se perde, com ou sem rede.
      const existente = await obterPendencia<api.PendenciaExpedicao>(MODULO, id);
      const removidasServidor = (aberto?.assinaturas || [])
        .filter(item => assinaturasRemovidas.includes(item.id) && !item.local)
        .map(item => ({ id: item.id, path: item.path }));
      const assinaturasNovas = [
        ...assinaturasVisiveis.filter(item => item.local && !pendentes[item.papel]).map(item => item.local!),
        ...(Object.entries(pendentes) as [QuaChecklistPapel, AssinaturaPendente | undefined][])
          .filter(([, pendente]) => !!pendente)
          .map(([papel, pendente]) => prepararAssinaturaOffline(papel, pendente!, { coletadoPorNome: user.name })),
      ];
      await salvarPendencia(novaPendencia<api.ChecklistInput, api.AcaoExpedicaoOffline, QuaChecklistExpedicao>(MODULO, id, user, {
        ...(existente || {}),
        novo: existente ? existente.novo : !aberto,
        base: existente?.base ?? (aberto && !aberto.offline ? aberto : null),
        input: { ...cabecalho, etiqueta_secao: aberto?.etiqueta_secao || '', respostas, observacoes, validacao_nomes: nomes },
        acao: fechar ? 'fechar' : existente?.acao ?? null,
        fotosNovas: Object.values(fotos).flat().filter(foto => foto.local).map(foto => foto.local!),
        fotosRemovidas: [...(existente?.fotosRemovidas || []), ...fotosRemovidas],
        assinaturasNovas,
        assinaturasRemovidas: [...(existente?.assinaturasRemovidas || []), ...removidasServidor],
      }));

      // 2. Com rede, sobe na hora e segue o fluxo de sempre.
      const { resultado } = await enviarAgora([id]);
      if (resultado?.enviados.includes(id)) {
        const completo = await carregarCompleto(id);
        preencher(completo);
        await carregarLista();
        if (completo.status === 'FINALIZADO') {
          toast.success(`${completo.codigo_registro} fechado com as 4 assinaturas e finalizado.`);
          irPara('formulario');
          setPdfAlvo(completo);
        } else if (fechar) {
          const faltam = api.papeisPendentes(completo).length;
          toast.success(`${completo.codigo_registro} fechado. ${faltam === 1 ? 'Falta 1 assinatura' : `Faltam ${faltam} assinaturas`} — colete agora ou depois, pela fila.`);
          irPara('assinaturas');
        } else {
          toast.success('Rascunho salvo e sincronizado.');
        }
        return;
      }

      // 3. Ficou no aparelho: reabre a cópia local e avisa o porquê.
      const recusa = resultado?.erros.find(erro => erro.id === id);
      if (recusa) toast.error(`Salvo neste aparelho, mas o servidor recusou: ${recusa.mensagem}`);
      else toast.info(`Sem conexão: ${fechar ? 'checklist fechado' : 'rascunho salvo'} neste aparelho. Ele sobe sozinho quando a rede voltar.`);
      const local = await carregarCompleto(id);
      preencher(local);
      if (fechar) irPara(api.papeisPendentes(local).length ? 'assinaturas' : 'inicio');
    } catch (error: any) {
      toast.error(`Erro ao salvar checklist: ${error.message || ''}`);
    } finally {
      setSalvando(false);
    }
  };

  const reabrir = async () => {
    if (!aberto) return;
    try {
      const pendencia = await obterPendencia<api.PendenciaExpedicao>(MODULO, aberto.id);
      if (pendencia?.acao === 'fechar' && (pendencia.novo || pendencia.base?.status === 'RASCUNHO')) {
        // Fechado só no aparelho: desfaz aqui mesmo, sem precisar de rede.
        await salvarPendencia({ ...pendencia, acao: null });
      } else {
        await api.reabrirChecklist(aberto.id);
      }
      const completo = await carregarCompleto(aberto.id);
      preencher(completo);
      await carregarLista();
      toast.success('Checklist reaberto para edição.');
      irPara('formulario');
    } catch (error: any) {
      toast.error(pareceFalhaDeRede(error) ? 'Reabrir um checklist já enviado precisa de conexão.' : `Não foi possível reabrir: ${error.message || ''}`);
    }
  };

  /**
   * Altera a pendência de um checklist já existente (assinaturas coletadas
   * pela fila), criando-a se preciso. A base é o detalhe guardado no aparelho.
   */
  const alterarPendencia = async (id: string, alterar: (p: api.PendenciaExpedicao) => Partial<api.PendenciaExpedicao>) => {
    const existente = await obterPendencia<api.PendenciaExpedicao>(MODULO, id);
    const registro = aberto?.id === id ? aberto : listaTela.find(item => item.id === id);
    const base = existente?.base
      ?? (await lerCache<QuaChecklistExpedicao>(MODULO, `det:${id}`))?.valor
      ?? (registro && !registro.offline ? registro : null);
    const atual = existente || novaPendencia<api.ChecklistInput, api.AcaoExpedicaoOffline, QuaChecklistExpedicao>(MODULO, id, user, { base });
    await salvarPendencia({ ...atual, ...alterar(atual) });
  };

  /** Grava a assinatura capturada em um ou vários checklists — no aparelho primeiro, depois no servidor. */
  const gravarAssinatura = async (alvo: AlvoAssinatura, tipo: QuaChecklistAssinaturaTipo, file: File, assinadoEm: string) => {
    setAssinando({ papel: alvo.papel, feitos: 0, total: alvo.ids.length });
    const falhas: string[] = [];
    for (const [indice, id] of alvo.ids.entries()) {
      try {
        const nova = prepararAssinaturaOffline(alvo.papel, { nome: alvo.nome.trim(), tipo, arquivo: file, assinadoEm }, { coletadoPorNome: user.name });
        await alterarPendencia(id, atual => ({ assinaturasNovas: [...atual.assinaturasNovas.filter(item => item.papel !== alvo.papel), nova] }));
      } catch (error: any) {
        falhas.push(`${listaTela.find(item => item.id === id)?.codigo_registro || id}: ${error.message || 'erro'}`);
      }
      setAssinando({ papel: alvo.papel, feitos: indice + 1, total: alvo.ids.length });
    }
    const { resultado } = await enviarAgora(alvo.ids);
    for (const erro of resultado?.erros || []) {
      falhas.push(`${listaTela.find(item => item.id === erro.id)?.codigo_registro || 'Checklist'}: ${erro.mensagem}`);
    }
    let finalizados = 0;
    let ultimo: Checklist | null = null;
    for (const id of alvo.ids) {
      try {
        const atualizado = await carregarCompleto(id);
        ultimo = atualizado;
        if (atualizado.status === 'FINALIZADO') finalizados++;
        if (aberto?.id === id) preencher(atualizado);
      } catch { /* segue com os demais */ }
    }
    setAssinando(null);
    await carregarLista();
    if (falhas.length) toast.error(`Assinatura não gravada em ${falhas.length}: ${falhas.join('; ')}`);
    const gravadas = alvo.ids.length - falhas.length;
    const noAparelho = !resultado || resultado.semRede.length > 0;
    if (gravadas) {
      toast.success(noAparelho
        ? `Assinatura de ${alvo.nome.trim()} guardada neste aparelho${alvo.ids.length > 1 ? ` para ${gravadas} checklists` : ''}. Sobe sozinha quando a rede voltar.`
        : `Assinatura de ${alvo.nome.trim()} gravada${alvo.ids.length > 1 ? ` em ${gravadas} checklists` : ''}.${finalizados ? ` ${finalizados} ${finalizados === 1 ? 'checklist finalizado' : 'checklists finalizados'} com as 4 assinaturas.` : ''}`);
    }
    return { falhas: falhas.length, finalizados, ultimo };
  };

  const contextoDe = (checklist: Checklist) => `${checklist.codigo_registro || 'Checklist no aparelho'} · ${checklist.tramo_sequencial} · Série ${checklist.numero_serie}`;

  /** Abre a coleta em tela cheia para um papel do checklist aberto. */
  const coletarNoTablet = (papel: QuaChecklistPapel, modo: ModoColeta, sequencia = false) => {
    if (!aberto) return;
    setTablet({ papel, ids: [aberto.id], nomeInicial: nomes[papel] || aberto.validacao_nomes?.[papel] || '', modo, sequencia, contexto: contextoDe(aberto) });
  };

  const coletarLoteNoTablet = (alvo: AlvoAssinatura, modo: ModoColeta) => {
    if (!alvo.ids.length) { toast.error('Selecione ao menos um checklist.'); return; }
    setTablet({ papel: alvo.papel, ids: alvo.ids, nomeInicial: alvo.nome, modo, sequencia: false, contexto: `Assinatura para ${alvo.ids.length} ${alvo.ids.length === 1 ? 'checklist' : 'checklists'}` });
  };

  /** Coleta durante o preenchimento: fica pendente e sobe ao salvar ou fechar. */
  const coletarNoFormulario = (papel: QuaChecklistPapel, modo: ModoColeta) => {
    const contexto = aberto ? contextoDe(aberto) : `Novo checklist${cabecalho.tramo_sequencial ? ` · ${cabecalho.tramo_sequencial}` : ''}${cabecalho.numero_serie ? ` · Série ${cabecalho.numero_serie}` : ''}`;
    setTablet({ papel, ids: aberto ? [aberto.id] : [], nomeInicial: nomes[papel] || '', modo, sequencia: false, contexto, local: true });
  };

  const descartarPendente = (papel: QuaChecklistPapel) => setPendentes(prev => {
    const { [papel]: removida, ...resto } = prev;
    if (removida) URL.revokeObjectURL(removida.url);
    return resto;
  });

  const confirmarTablet = async ({ nome, tipo, arquivo, assinadoEm }: AssinaturaColetada) => {
    if (!tablet) return;
    setNomes(prev => ({ ...prev, [tablet.papel]: nome }));
    if (tablet.local) {
      descartarPendente(tablet.papel);
      setPendentes(prev => ({ ...prev, [tablet.papel]: { nome, tipo, arquivo, assinadoEm, url: URL.createObjectURL(arquivo) } }));
      setTablet(null);
      toast.info(`Assinatura de ${nome} coletada. Ela é gravada ao salvar o rascunho ou fechar o checklist.`);
      return;
    }
    const resultado = await gravarAssinatura({ papel: tablet.papel, nome, ids: tablet.ids }, tipo, arquivo, assinadoEm);
    if (resultado.falhas) return; // mantém a tela aberta para tentar de novo
    const atual = resultado.ultimo;
    if (tablet.sequencia && atual?.status === 'AGUARDANDO_ASSINATURAS') {
      const proximo = api.papeisPendentes(atual)[0];
      if (proximo) {
        setTablet({ ...tablet, papel: proximo, nomeInicial: atual.validacao_nomes?.[proximo] || '', modo: 'DESENHO' });
        return;
      }
    }
    setTablet(null);
    setLote(null);
    if (tablet.ids.length === 1 && atual?.status === 'FINALIZADO' && aberto?.id === atual.id) {
      irPara('formulario');
      setPdfAlvo(atual);
    }
  };

  /** Refazer na fila de assinaturas: tira a assinatura já coletada (no aparelho primeiro). */
  const removerAssinatura = async (assinatura: api.AssinaturaExpedicaoTela) => {
    if (!aberto) return;
    try {
      await alterarPendencia(aberto.id, atual => assinatura.local
        ? { assinaturasNovas: atual.assinaturasNovas.filter(item => item.id !== assinatura.id) }
        : { assinaturasRemovidas: [...atual.assinaturasRemovidas, { id: assinatura.id, path: assinatura.path }] });
      const { resultado } = await enviarAgora([aberto.id]);
      const recusa = resultado?.erros.find(erro => erro.id === aberto.id);
      if (recusa) toast.error(`Não foi possível remover a assinatura no servidor: ${recusa.mensagem}`);
      preencher(await carregarCompleto(aberto.id));
      await carregarLista();
    } catch (error: any) {
      toast.error(`Erro ao remover assinatura: ${error.message || ''}`);
    }
  };

  /** Refazer no formulário: some da tela agora, sai do servidor ao salvar. */
  const marcarAssinaturaRemovida = (assinatura: api.AssinaturaExpedicaoTela) => {
    setAssinaturasRemovidas(prev => [...prev, assinatura.id]);
  };

  const descartarDoAparelho = async (p: api.PendenciaExpedicao) => {
    await removerPendencia(MODULO, p.id);
    if (aberto?.id === p.id) { preencher(null); irPara('inicio'); }
    toast.success('Cópia do aparelho descartada.');
    await carregarLista();
  };

  const historico = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return listaTela
      .filter(item => filtro === 'TODOS' || item.status === filtro)
      .filter(item => !termo || [item.codigo_registro, item.cliente, item.projeto, item.tramo_sequencial, item.numero_serie, item.site, item.inspetor_qualidade, item.criado_por_nome || '']
        .some(value => value.toLowerCase().includes(termo)));
  }, [busca, filtro, listaTela]);

  const contagem = useMemo(() => ({
    FINALIZADO: listaTela.filter(item => item.status === 'FINALIZADO').length,
    AGUARDANDO_ASSINATURAS: listaTela.filter(item => item.status === 'AGUARDANDO_ASSINATURAS').length,
    RASCUNHO: listaTela.filter(item => item.status === 'RASCUNHO').length,
    TODOS: listaTela.length,
  }), [listaTela]);

  const acoes = (item: Checklist) => {
    const carregandoItem = abrindoId === item.id;
    const spinner = <Loader2 className="h-4 w-4 animate-spin" />;
    const pdf = <button type="button" disabled={carregandoItem} onClick={() => verPdf(item.id)} className={botaoSecundario}><FileText className="h-4 w-4" /> Ver PDF</button>;
    if (item.status === 'RASCUNHO') {
      return podeEditar(item)
        ? <button type="button" disabled={carregandoItem} onClick={() => abrir(item.id)} className={botaoPrimario}>{carregandoItem ? spinner : <ClipboardCheck className="h-4 w-4" />} Continuar</button>
        : <button type="button" disabled={carregandoItem} onClick={() => abrir(item.id, 'formulario')} className={botaoSecundario}><Eye className="h-4 w-4" /> Ver respostas</button>;
    }
    if (item.status === 'AGUARDANDO_ASSINATURAS' && podeColetar(item)) {
      return <><button type="button" disabled={carregandoItem} onClick={() => abrir(item.id, 'assinaturas')} className={botaoPrimario}>{carregandoItem ? spinner : <PenTool className="h-4 w-4" />} Coletar assinaturas</button>{pdf}</>;
    }
    return <><button type="button" disabled={carregandoItem} onClick={() => abrir(item.id, 'formulario')} className={botaoSecundario}>{carregandoItem ? spinner : <Eye className="h-4 w-4" />} Ver respostas</button>{pdf}</>;
  };

  const renderInicio = () => {
    const filaColetavel = api.filaAssinaturas(listaTela).filter(podeColetar);
    return <div className="space-y-6">
      <button type="button" onClick={novoChecklist} className={`${cardClass} flex w-full items-center gap-4 p-4 text-left transition hover:border-blue-400 hover:shadow-md`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><Plus className="h-6 w-6" /></span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-900 dark:text-slate-50">Novo checklist de expedição</span>
          <span className="block text-xs text-slate-500">Preencha, fotografe e feche. As assinaturas podem ser coletadas depois, pela fila.</span>
        </span>
      </button>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Inbox className="h-5 w-5 text-amber-500" /> Pendentes de assinatura {api.filaAssinaturas(listaTela).length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-white">{api.filaAssinaturas(listaTela).length}</span>}</h2>
            <p className="text-xs text-slate-500">Checklists fechados, esperando Qualidade, Produção, Cliente e Transportador. Com a 4ª assinatura ele vai para o histórico.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"><input type="checkbox" checked={soMeus} onChange={event => setSoMeus(event.target.checked)} className="h-4 w-4 accent-blue-600" /> Só os que eu fiz</label>
            {filaColetavel.length > 1 && <button type="button" onClick={() => setLote({ papel: 'CLIENTE', nome: '', ids: new Set() })} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"><Users className="h-4 w-4" /> Assinar vários de uma vez</button>}
          </div>
        </div>
        {fila.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {fila.map(item => <ResumoCard key={item.id} item={item} acoes={acoes(item)} detalhe={<p className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-amber-500" /> Fechado por <b className="text-slate-700 dark:text-slate-200">{item.fechado_por_nome || item.criado_por_nome || '-'}</b> · {fmtDataHora(item.fechado_em)}</p>} />)}
        </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{carregando ? 'Carregando…' : 'Nenhum checklist aguardando assinatura.'}</div>}
      </section>

      {rascunhos.length > 0 && <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">Rascunhos em preenchimento</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rascunhos.map(item => <ResumoCard key={item.id} item={item} acoes={acoes(item)} detalhe={<p className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" /> {item.criado_por_nome || '-'} · {fmtDataHora(item.updated_at)}</p>} />)}
        </div>
      </section>}
    </div>;
  };

  const renderHistorico = () => <div className="space-y-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar por código, cliente, projeto, tramo, série, site ou inspetor…" className={`${inputClass} pl-9`} /></div>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([['FINALIZADO', 'Finalizados'], ['AGUARDANDO_ASSINATURAS', 'Aguardando assinaturas'], ['RASCUNHO', 'Rascunhos'], ['TODOS', 'Todos']] as const).map(([valor, label]) => <button key={valor} type="button" onClick={() => setFiltro(valor)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${filtro === valor ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}>{label} <span className="text-slate-400">{contagem[valor]}</span></button>)}
      </div>
    </div>
    {historico.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {historico.map(item => <ResumoCard key={item.id} item={item} acoes={acoes(item)} detalhe={item.status === 'FINALIZADO' ? <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Finalizado {fmtDataHora(item.finalizado_em)} · inspetor {item.inspetor_qualidade}</p> : <p>Inspetor {item.inspetor_qualidade}</p>} />)}
    </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Nenhum checklist encontrado.</div>}
  </div>;

  /** Itens + observações; editável no rascunho, leitura nos demais estados. */
  const renderConteudo = (editavel: boolean) => <>
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Verificação final" en="Final check" /></h2>
        <span className="text-[11px] text-slate-400">{api.CHECKLIST_ITENS.length} itens fotográficos</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {api.CHECKLIST_ITENS.map(item => <article key={item.chave} className={`${cardClass} flex flex-col gap-3 p-4 ${respostas[item.chave] === 'NOK' ? 'border-red-200 dark:border-red-900/60' : ''}`}>
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white dark:bg-slate-100 dark:text-slate-900">{item.numero}</span>
            <div className="min-w-0 space-y-0.5"><Bilingue texto={item.descricao} ptClass="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50" enClass="text-[13px] leading-snug" /></div>
          </div>
          <FotosItem imagemNa={respostas[item.chave] === 'NA' ? imagemNa : null} fotos={fotos[item.chave] || []} editavel={editavel} onAdd={files => adicionarFotos(item.chave, files)} onRemove={foto => removerFoto(item.chave, foto)} onOpen={indice => abrirFotos(item.chave, `Item ${item.numero}`, indice)} />
          <RespostaBotoes disabled={!editavel} value={respostas[item.chave]} onChange={value => setRespostas(prev => ({ ...prev, [item.chave]: value }))} />
        </article>)}
      </div>
    </section>

    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Observações fora da listagem" en="Observations outside the listing" /></h2>
      <div className="grid gap-3 md:grid-cols-2">
        {api.CHECKLIST_OBSERVACOES.map(item => {
          const valor = observacoes[item.chave];
          return <article key={item.chave} className={`${cardClass} flex flex-col gap-3 p-4 ${valor?.resposta === 'NOK' ? 'border-red-200 dark:border-red-900/60' : ''}`}>
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{item.numero}</span>
              <div className="min-w-0 space-y-0.5"><Bilingue texto={item.descricao} ptClass="text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100" enClass="text-xs leading-snug" /></div>
            </div>
            <RespostaBotoes disabled={!editavel} value={valor?.resposta} onChange={value => setObservacoes(prev => ({ ...prev, [item.chave]: { ...(prev[item.chave] || { texto: '' }), resposta: value } }))} />
            {editavel
              ? <textarea value={valor?.texto || ''} onChange={event => setObservacoes(prev => ({ ...prev, [item.chave]: { ...(prev[item.chave] || { resposta: null }), texto: event.target.value } }))} placeholder="Observação / Observation" rows={2} className={`${inputClass} text-xs`} />
              : valor?.texto && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">{valor.texto}</p>}
            {(editavel || valor?.resposta === 'NA' || (fotos[item.chave] || []).length > 0) && <FotosItem imagemNa={valor?.resposta === 'NA' ? imagemNa : null} fotos={fotos[item.chave] || []} editavel={editavel} onAdd={files => adicionarFotos(item.chave, files)} onRemove={foto => removerFoto(item.chave, foto)} onOpen={indice => abrirFotos(item.chave, `Observação ${item.numero}`, indice)} />}
          </article>;
        })}
      </div>
    </section>
  </>;

  const renderCabecalho = (editavel: boolean) => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {HEADERS.map(field => <label key={field.key} className="block text-xs text-slate-600 dark:text-slate-300">
      <Bilingue inline pt={field.pt} en={field.en} ptClass="font-semibold" /> {editavel && <span className="text-red-500">*</span>}
      <input disabled={!editavel} type={field.type || 'text'} list={field.type === 'date' ? undefined : `expedicao-${field.key}`} value={cabecalho[field.key]} onChange={event => setCabecalho(prev => ({ ...prev, [field.key]: event.target.value }))} className={`${inputClass} mt-1.5 font-semibold`} />
      {field.type !== 'date' && <datalist id={`expedicao-${field.key}`}>{(opcoes[field.key] || []).map(option => <option key={option} value={option} />)}</datalist>}
    </label>)}
  </div>;

  const renderAssinaturasLeitura = () => aberto && aberto.status !== 'RASCUNHO' && <section className={`${cardClass} p-4 sm:p-5`}>
    <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Validação" en="Validation" /></h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {api.CHECKLIST_PAPEIS.map(({ papel, label }) => {
        const assinatura = aberto.assinaturas.find(item => item.papel === papel);
        return <div key={papel} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs"><Bilingue inline texto={label} ptClass="font-bold text-slate-700 dark:text-slate-200" /></p>
          {assinatura?.preview_url ? <img src={assinatura.preview_url} alt={`Assinatura ${label}`} className="mt-2 h-16 w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" /> : <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400 dark:border-slate-700">Pendente</p>}
          <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-100">{assinatura?.nome || aberto.validacao_nomes?.[papel] || '-'}</p>
          {assinatura && <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Assinado em {fmtDataHora(assinatura.assinado_em || assinatura.created_at)}</p>}
          {assinatura?.coletado_por_nome && <p className="text-[11px] text-slate-500">Coletada por {assinatura.coletado_por_nome}</p>}
        </div>;
      })}
    </div>
  </section>;

  const renderFormulario = () => {
    const editavel = podeEditar(aberto);
    const totalAssinadas = api.CHECKLIST_PAPEIS.filter(({ papel }) => pendentes[papel] || assinaturasVisiveis.some(item => item.papel === papel)).length;
    return <div className="space-y-5">
      <section className={`${cardClass} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {aberto && <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{aberto.codigo_registro || semCodigo}</span>}
              <StatusBadge status={aberto?.status || 'RASCUNHO'} />
              {aberto && <ChipSincronizacao offline={aberto.offline} />}
              {!editavel && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800">Somente leitura</span>}
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Cabeçalho" en="Header" /></h2>
            {editavel && <p className="text-xs text-slate-500">Os valores digitados ficam como sugestão nos próximos checklists.</p>}
          </div>
          {aberto && aberto.status !== 'RASCUNHO' && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPdfAlvo(aberto)} className={botaoSecundario}><FileText className="h-4 w-4" /> Ver PDF</button>
            <button type="button" onClick={() => exportQualidadeChecklistExpedicaoPdf(aberto).catch((error: any) => toast.error(`Erro ao exportar: ${error.message || ''}`))} className={botaoSecundario}><FileDown className="h-4 w-4" /> Baixar</button>
            {aberto.status === 'AGUARDANDO_ASSINATURAS' && podeColetar(aberto) && <button type="button" onClick={() => irPara('assinaturas')} className={botaoPrimario}><PenTool className="h-4 w-4" /> Coletar assinaturas</button>}
          </div>}
        </div>
        {renderCabecalho(editavel)}
      </section>

      {renderConteudo(editavel)}
      {renderAssinaturasLeitura()}

      {editavel && <section className={`${cardClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Validação" en="Validation" /></h2>
            <p className="mt-1 text-xs text-slate-500">Colete agora se as pessoas estiverem presentes, ou feche e assine depois pela fila de pendentes. Com as 4 assinaturas, fechar já finaliza o checklist.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{totalAssinadas}/4 assinaturas</span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {api.CHECKLIST_PAPEIS.map(({ papel, label }) => {
            const gravada = assinaturasVisiveis.find(item => item.papel === papel);
            const pendente = pendentes[papel];
            const imagem = pendente?.url || gravada?.preview_url;
            return <div key={papel} className={`flex flex-col gap-2 rounded-xl border p-3 ${imagem ? 'border-emerald-200 dark:border-emerald-900/60' : 'border-slate-200 dark:border-slate-800'}`}>
              <p className="text-xs"><Bilingue inline texto={label} ptClass="font-bold text-slate-700 dark:text-slate-200" /></p>
              {imagem ? <>
                <img src={imagem} alt={`Assinatura ${label}`} className="h-20 w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{pendente?.nome || gravada?.nome}</p>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Assinado em {fmtDataHora(pendente?.assinadoEm || gravada?.assinado_em || gravada?.created_at)}</p>
                {(pendente || gravada?.local) && <p className="text-[11px] font-semibold text-amber-600">{pendente ? 'Grava ao salvar ou fechar' : 'Guardada no aparelho'}</p>}
                <button type="button" onClick={() => pendente ? descartarPendente(papel) : gravada && marcarAssinaturaRemovida(gravada)} className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:border-slate-700"><Trash2 className="h-3.5 w-3.5" /> Refazer</button>
              </> : <>
                <input value={nomes[papel]} onChange={event => setNomes(prev => ({ ...prev, [papel]: event.target.value }))} placeholder="Nome (opcional)" className={`${inputClass} text-xs`} />
                <div className="mt-auto grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => coletarNoFormulario(papel, 'DESENHO')} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"><PenTool className="h-4 w-4" /> Assinar</button>
                  <button type="button" onClick={() => coletarNoFormulario(papel, 'SELFIE')} className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><Camera className="h-4 w-4" /> Selfie</button>
                </div>
              </>}
            </div>;
          })}
        </div>
      </section>}

      {editavel && <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-end dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex items-center gap-2 sm:mr-auto">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-blue-600 transition-all" style={{ width: `${(respondidos / totalPerguntas) * 100}%` }} /></div>
          <p className="text-xs text-slate-500">{respondidos} de {totalPerguntas} respondidos</p>
          {!sync.online && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"><WifiOff className="h-3 w-3" /> Sem conexão — salva no aparelho</span>}
        </div>
        <button type="button" onClick={() => salvar(false)} disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"><Save className="h-4 w-4" /> Salvar rascunho</button>
        <button type="button" onClick={() => salvar(true)} disabled={salvando} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white shadow-sm disabled:opacity-60 ${totalAssinadas === 4 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : totalAssinadas === 4 ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {totalAssinadas === 4 ? 'Fechar e finalizar' : totalAssinadas ? `Fechar — faltam ${4 - totalAssinadas} assinaturas` : 'Fechar e assinar depois'}</button>
      </div>}
    </div>;
  };

  const renderAssinaturas = () => {
    if (!aberto) return null;
    const coletar = podeColetar(aberto);
    const assinados = aberto.assinaturas.length;
    const proximo = api.filaAssinaturas(listaTela).filter(podeColetar).find(item => item.id !== aberto.id);
    return <div className="space-y-5">
      <section className={`${cardClass} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{aberto.codigo_registro || semCodigo}</span><StatusBadge status={aberto.status} /><ChipSincronizacao offline={aberto.offline} /></div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-50">{aberto.tramo_sequencial} <span className="text-sm font-normal text-slate-400">· Série {aberto.numero_serie}</span></h2>
            <p className="text-xs text-slate-500">{aberto.cliente} · {aberto.projeto} · Expedição {formatDate(aberto.data_expedicao)} · {aberto.site}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Lock className="h-3.5 w-3.5 text-amber-500" /> Fechado por {aberto.fechado_por_nome || aberto.criado_por_nome || '-'} · {fmtDataHora(aberto.fechado_em)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setVerRespostas(valor => !valor)} className={botaoSecundario}><Eye className="h-4 w-4" /> {verRespostas ? 'Ocultar respostas' : 'Ver respostas'}</button>
            <button type="button" onClick={() => setPdfAlvo(aberto)} className={botaoSecundario}><FileText className="h-4 w-4" /> Ver PDF</button>
            {assinados === 0 && (aberto.criado_por === user.id || ehAdmin) && <button type="button" onClick={reabrir} className={botaoSecundario}><RotateCcw className="h-4 w-4" /> Reabrir para edição</button>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(assinados / 4) * 100}%` }} /></div>
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{assinados}/4 assinaturas</span>
        </div>
        {coletar && assinados < 4 && <button type="button" onClick={() => coletarNoTablet(api.papeisPendentes(aberto)[0], 'DESENHO', true)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-base font-bold text-white shadow-sm hover:bg-emerald-700">
          <Signature className="h-5 w-5" /> Coletar no tablet — {4 - assinados} {4 - assinados === 1 ? 'assinatura pendente' : 'assinaturas pendentes'}
        </button>}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {api.CHECKLIST_PAPEIS.map(({ papel, label }) => {
          const assinatura = aberto.assinaturas.find(item => item.papel === papel);
          return <div key={papel} className={`${cardClass} space-y-3 p-4 ${assinatura ? 'border-emerald-200 dark:border-emerald-900/60' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm"><Bilingue inline texto={label} ptClass="font-bold text-slate-800 dark:text-slate-100" /></p>
              {assinatura && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
            </div>
            {assinatura ? <>
              <img src={assinatura.preview_url} alt={`Assinatura ${label}`} className="h-24 w-full rounded-xl border border-slate-200 bg-white object-contain dark:border-slate-700" />
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{assinatura.nome}</p>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Assinado em {fmtDataHora(assinatura.assinado_em || assinatura.created_at)}</p>
                  {assinatura.coletado_por_nome && <p className="text-[11px] text-slate-500">Coletada por {assinatura.coletado_por_nome}</p>}
                  {assinatura.local && <p className="text-[11px] font-semibold text-amber-600">Guardada no aparelho — sobe ao sincronizar</p>}
                </div>
                {coletar && <button type="button" onClick={() => removerAssinatura(assinatura)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:border-slate-700"><Trash2 className="h-3.5 w-3.5" /> Refazer</button>}
              </div>
            </> : coletar ? <>
              {(nomes[papel] || aberto.validacao_nomes?.[papel]) && <p className="text-xs text-slate-500">Previsto: <b className="text-slate-700 dark:text-slate-200">{nomes[papel] || aberto.validacao_nomes?.[papel]}</b></p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!!assinando} onClick={() => coletarNoTablet(papel, 'DESENHO')} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"><PenTool className="h-4 w-4" /> Assinar</button>
                <button type="button" disabled={!!assinando} onClick={() => coletarNoTablet(papel, 'SELFIE')} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"><Camera className="h-4 w-4" /> Tirar selfie</button>
              </div>
            </> : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400 dark:border-slate-700">Pendente{aberto.validacao_nomes?.[papel] ? ` — ${aberto.validacao_nomes[papel]}` : ''}</p>}
          </div>;
        })}
      </div>

      {!coletar && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900">As assinaturas são coletadas por quem fez o checklist, pelo setor Qualidade ou por um admin.</p>}
      {proximo && <button type="button" onClick={() => abrir(proximo.id, 'assinaturas')} className={`${cardClass} flex w-full items-center justify-between gap-3 p-4 text-left hover:border-blue-400`}>
        <span className="text-xs text-slate-500">Próximo da fila: <b className="text-slate-800 dark:text-slate-100">{proximo.codigo_registro || 'Checklist no aparelho'}</b> · {proximo.tramo_sequencial} · faltam {api.papeisPendentes(proximo).length}</span>
        <PenTool className="h-4 w-4 text-blue-600" />
      </button>}

      {verRespostas && <>
        <section className={`${cardClass} p-4 sm:p-5`}>{renderCabecalho(false)}</section>
        {renderConteudo(false)}
      </>}
    </div>;
  };

  const renderLote = () => {
    if (!lote) return null;
    const candidatos = api.filaAssinaturas(listaTela).filter(podeColetar).filter(item => !api.papeisAssinados(item).has(lote.papel));
    const alvo: AlvoAssinatura = { papel: lote.papel, nome: lote.nome, ids: [...lote.ids].filter(id => candidatos.some(item => item.id === id)) };
    const alternar = (id: string) => setLote(prev => {
      if (!prev) return prev;
      const ids = new Set(prev.ids);
      if (ids.has(id)) ids.delete(id); else ids.add(id);
      return { ...prev, ids };
    });
    return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget && !assinando) setLote(null); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-lote" className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <h2 id="titulo-lote" className="text-sm font-bold text-slate-900 dark:text-slate-50">Assinar vários checklists</h2>
            <p className="text-xs text-slate-500">A mesma pessoa assina uma vez e a assinatura vai para cada checklist marcado.</p>
          </div>
          <button type="button" disabled={!!assinando} onClick={() => setLote(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {api.CHECKLIST_PAPEIS.map(({ papel, label }) => <button key={papel} type="button" onClick={() => setLote(prev => prev && { ...prev, papel, ids: new Set() })} className={`rounded-xl border px-3 py-2 text-left text-xs ${lote.papel === papel ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}><Bilingue texto={label} ptClass="font-bold" enClass="text-[11px]" /></button>)}
          </div>
          <input value={lote.nome} onChange={event => setLote(prev => prev && { ...prev, nome: event.target.value })} placeholder={`Nome de quem assina como ${rotuloPapel(lote.papel).split(' / ')[0]} (pode digitar no tablet)`} className={inputClass} />
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{candidatos.length} {candidatos.length === 1 ? 'checklist sem' : 'checklists sem'} essa assinatura</p>
            {candidatos.length > 0 && <button type="button" onClick={() => setLote(prev => prev && { ...prev, ids: alvo.ids.length === candidatos.length ? new Set() : new Set(candidatos.map(item => item.id)) })} className="text-xs font-bold text-blue-700 dark:text-blue-300">{alvo.ids.length === candidatos.length ? 'Desmarcar todos' : 'Marcar todos'}</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {candidatos.map(item => <ResumoCard key={item.id} item={item} acoes={null} selecionado={lote.ids.has(item.id)} onSelecionar={() => alternar(item.id)} />)}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-end dark:border-slate-800">
          <p className="text-xs text-slate-500 sm:mr-auto">{assinando ? `Gravando ${assinando.feitos}/${assinando.total}…` : `${alvo.ids.length} selecionado(s)`}</p>
          <button type="button" disabled={!!assinando || !alvo.ids.length} onClick={() => coletarLoteNoTablet(alvo, 'SELFIE')} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"><Camera className="h-4 w-4" /> Tirar selfie</button>
          <button type="button" disabled={!!assinando || !alvo.ids.length} onClick={() => coletarLoteNoTablet(alvo, 'DESENHO')} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">{assinando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Signature className="h-4 w-4" />} Assinar {alvo.ids.length > 1 ? `${alvo.ids.length} checklists` : ''}</button>
        </div>
      </div>
    </div>;
  };

  const tituloAba = tela === 'formulario' ? (aberto ? aberto.codigo_registro || 'Checklist no aparelho' : 'Novo checklist') : tela === 'assinaturas' ? 'Assinaturas' : 'Checklists';
  const pendentesTotal = api.filaAssinaturas(listaTela).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button type="button" onClick={() => tela === 'inicio' || tela === 'historico' ? onNavigate('/qualidade') : voltarInicio()} className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> {tela === 'inicio' || tela === 'historico' ? 'Voltar para Qualidade' : 'Voltar para a lista'}</button>
          <div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">FRM.QUA-0030</span><span className="text-xs text-slate-400">Rev. 14</span></div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Checklist de expedição de tramos</h1>
          <p className="text-sm italic text-slate-500 dark:text-slate-400">Checklist for sections dispatch</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <button type="button" onClick={() => { if (tela === 'historico') setTela('inicio'); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tela !== 'historico' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}><ClipboardCheck className="h-4 w-4" /> {tituloAba}{tela !== 'formulario' && tela !== 'assinaturas' && pendentesTotal > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendentesTotal}</span>}</button>
          <button type="button" onClick={() => { setTela('historico'); carregarLista(); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tela === 'historico' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}><History className="h-4 w-4" /> Histórico</button>
        </div>
      </div>

      {(tela === 'inicio' || tela === 'historico') && <PainelSincronizacao
        online={sync.online}
        pendencias={sync.pendencias}
        sincronizando={sync.sincronizando}
        ultimaSincronizacao={sync.ultimaSincronizacao}
        listaSalvaEm={listaSalvaEm}
        rotulosAcao={api.ROTULOS_ACAO_EXPEDICAO}
        titulo={tituloPendencia}
        onSincronizar={() => sync.sincronizarAgora()}
        onDescartar={descartarDoAparelho}
        onAbrir={p => abrir(p.id)}
      />}
      {tela !== 'inicio' && tela !== 'historico' && !sync.online && <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200"><WifiOff className="h-4 w-4 shrink-0" /> Sem conexão. O que você salvar fica guardado neste aparelho e sobe sozinho quando a rede voltar.</p>}

      {tela === 'historico' ? renderHistorico() : tela === 'formulario' ? renderFormulario() : tela === 'assinaturas' ? renderAssinaturas() : renderInicio()}

      {renderLote()}
      <ColetaAssinaturaTablet
        aberto={!!tablet}
        papel={tablet ? rotuloPapel(tablet.papel) : ''}
        contexto={tablet?.contexto}
        nomeInicial={tablet?.nomeInicial}
        modoInicial={tablet?.modo}
        passo={tablet?.sequencia && aberto ? `${aberto.assinaturas.length + 1} de 4` : undefined}
        onConfirmar={confirmarTablet}
        onFechar={() => setTablet(null)}
      />
      {gerarPdf && <FormularioPdfPreview gerar={gerarPdf} onClose={() => setPdfAlvo(null)} />}
      {lightbox.elemento}
    </div>
  );
}

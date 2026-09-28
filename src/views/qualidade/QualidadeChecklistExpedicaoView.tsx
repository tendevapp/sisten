import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardCheck, Eye, FileDown, FileText, History, Inbox, Loader2, Lock,
  PenTool, Plus, RotateCcw, Save, Search, Signature, Trash2, UserCheck, Users, X,
} from 'lucide-react';
import type {
  Profile, QuaChecklistAssinatura, QuaChecklistAssinaturaTipo, QuaChecklistExpedicao,
  QuaChecklistFoto, QuaChecklistPapel, QuaChecklistResposta, QuaChecklistStatus,
} from '../../types';
import { localDb } from '../../db/localDb';
import * as api from '../../lib/qualidadeChecklistExpedicao';
import { exportQualidadeChecklistExpedicaoPdf, gerarQualidadeChecklistExpedicaoPdf } from '../../lib/pdfExport/exportQualidadeChecklistExpedicaoPdf';
import Bilingue from '../../components/qualidade/Bilingue';
import ColetaAssinaturaTablet, { type AssinaturaColetada, type ModoColeta } from '../../components/qualidade/ColetaAssinaturaTablet';
import FormularioPdfPreview from '../../components/qualidade/FormularioPdfPreview';
import { useLightbox } from '../../components/ui/Lightbox';
import { useToast } from '../../components/ui/Toast';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Tela = 'inicio' | 'formulario' | 'assinaturas' | 'historico';
type FiltroHistorico = QuaChecklistStatus | 'TODOS';
type HeaderKey = 'cliente' | 'projeto' | 'tramo_sequencial' | 'numero_serie' | 'data_expedicao' | 'site' | 'inspetor_qualidade' | 'etiqueta_secao';
type FotoRascunho = Partial<QuaChecklistFoto> & { localFile?: File; localUrl?: string; id: string; item_chave: string };
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
  { key: 'etiqueta_secao', pt: 'Nº etiqueta seção', en: 'Section number TAG' },
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
  return { cliente: '', projeto: '', tramo_sequencial: '', numero_serie: '', data_expedicao: api.hojeLocal(), site: '', inspetor_qualidade: user.name, etiqueta_secao: '' };
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
function idLocal(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function agruparFotos(fotos: QuaChecklistFoto[]): Record<string, FotoRascunho[]> {
  return fotos.reduce<Record<string, FotoRascunho[]>>((acc, foto) => {
    (acc[foto.item_chave] ||= []).push(foto);
    return acc;
  }, {});
}
const rotuloPapel = (papel: QuaChecklistPapel) => api.CHECKLIST_PAPEIS.find(item => item.papel === papel)?.label || papel;

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
function FotosItem({ fotos, editavel, onAdd, onRemove, onOpen }: { fotos: FotoRascunho[]; editavel: boolean; onAdd: (files: FileList) => void; onRemove: (foto: FotoRascunho) => void; onOpen: (indice: number) => void }) {
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

function ChipsAssinaturas({ checklist }: { checklist: QuaChecklistExpedicao }) {
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

function ResumoCard({ item, acoes, detalhe, selecionado, onSelecionar }: { item: QuaChecklistExpedicao; acoes: React.ReactNode; detalhe?: React.ReactNode; selecionado?: boolean; onSelecionar?: () => void }) {
  const nok = Object.values(item.respostas || {}).filter(valor => valor === 'NOK').length + Object.values(item.observacoes || {}).filter(valor => valor?.resposta === 'NOK').length;
  return <div className={`${cardClass} flex flex-col gap-3 p-4 ${selecionado ? 'ring-2 ring-blue-500' : ''}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{item.codigo_registro}</p>
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
  const [aberto, setAberto] = useState<QuaChecklistExpedicao | null>(null);
  const [cabecalho, setCabecalho] = useState<Record<HeaderKey, string>>(() => novoCabecalho(user));
  const [respostas, setRespostas] = useState<Record<string, QuaChecklistResposta | null>>(respostasVazias);
  const [observacoes, setObservacoes] = useState<Record<string, Observacao>>(observacoesVazias);
  const [fotos, setFotos] = useState<Record<string, FotoRascunho[]>>({});
  const [nomes, setNomes] = useState<Record<QuaChecklistPapel, string>>(nomesVazios);
  const [opcoes, setOpcoes] = useState<Record<string, string[]>>({});
  const [lista, setLista] = useState<QuaChecklistExpedicao[]>([]);
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
  const [pdfAlvo, setPdfAlvo] = useState<QuaChecklistExpedicao | null>(null);

  const carregarLista = useCallback(async () => {
    try { setLista(await api.listarChecklists()); } catch (error: any) { toast.error(`Erro ao carregar checklists: ${error.message || ''}`); } finally { setCarregando(false); }
  }, [toast]);

  useEffect(() => {
    carregarLista();
    Promise.all(api.CHECKLIST_CAMPOS_CABECALHO.map(async campo => [campo, await api.listarOpcoesCabecalho(campo)] as const))
      .then(entries => setOpcoes(Object.fromEntries(entries))).catch(() => {});
  }, [carregarLista]);

  const podeColetar = useCallback((checklist: QuaChecklistExpedicao) => api.podeColetarAssinaturas(user, checklist, setores), [user, setores]);
  const podeEditar = (checklist: QuaChecklistExpedicao | null) => !checklist || (checklist.status === 'RASCUNHO' && (checklist.criado_por === user.id || ehAdmin));

  const fila = useMemo(() => {
    const todos = api.filaAssinaturas(lista);
    return soMeus ? todos.filter(item => item.criado_por === user.id || item.fechado_por === user.id) : todos;
  }, [lista, soMeus, user.id]);
  const rascunhos = useMemo(() => lista.filter(item => item.status === 'RASCUNHO' && (item.criado_por === user.id || ehAdmin)), [lista, user.id, ehAdmin]);

  const preencher = (checklist: QuaChecklistExpedicao | null) => {
    setAberto(checklist);
    setVerRespostas(false);
    setPendentes(prev => {
      Object.values(prev).forEach(item => item && URL.revokeObjectURL(item.url));
      return {};
    });
    if (!checklist) {
      setCabecalho(novoCabecalho(user)); setRespostas(respostasVazias()); setObservacoes(observacoesVazias()); setFotos({}); setNomes(nomesVazios());
      return;
    }
    setCabecalho({ cliente: checklist.cliente, projeto: checklist.projeto, tramo_sequencial: checklist.tramo_sequencial, numero_serie: checklist.numero_serie, data_expedicao: checklist.data_expedicao, site: checklist.site, inspetor_qualidade: checklist.inspetor_qualidade, etiqueta_secao: checklist.etiqueta_secao });
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

  const abrir = async (id: string, destino?: Tela) => {
    setAbrindoId(id);
    try {
      const checklist = await api.obterChecklist(id);
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
    try { setPdfAlvo(await api.obterChecklist(id)); } catch (error: any) { toast.error(`Erro ao gerar PDF: ${error.message || ''}`); } finally { setAbrindoId(null); }
  };
  const gerarPdf = useMemo(() => pdfAlvo ? () => gerarQualidadeChecklistExpedicaoPdf(pdfAlvo) : null, [pdfAlvo]);

  const adicionarFotos = (itemChave: string, files: FileList) => {
    const novos = Array.from(files).filter(file => file.type.startsWith('image/')).map(file => ({ id: idLocal('foto'), item_chave: itemChave, localFile: file, localUrl: URL.createObjectURL(file) }));
    if (novos.length) setFotos(prev => ({ ...prev, [itemChave]: [...(prev[itemChave] || []), ...novos] }));
  };

  const removerFoto = async (itemChave: string, foto: FotoRascunho) => {
    if (foto.path) {
      try { await api.removerChecklistFoto(foto as QuaChecklistFoto); } catch (error: any) { toast.error(`Erro ao remover foto: ${error.message || ''}`); return; }
    }
    if (foto.localUrl) URL.revokeObjectURL(foto.localUrl);
    setFotos(prev => ({ ...prev, [itemChave]: (prev[itemChave] || []).filter(item => item.id !== foto.id) }));
  };

  const abrirFotos = (itemChave: string, legenda: string, indice: number) => {
    lightbox.abrir((fotos[itemChave] || []).map(foto => ({ url: foto.localUrl || foto.preview_url || '', legenda })), indice);
  };

  const faltas = useMemo(() => api.faltasParaFechar(respostas, observacoes), [respostas, observacoes]);
  const respondidos = api.CHECKLIST_ITENS.length + api.CHECKLIST_OBSERVACOES.length - faltas.itens.length - faltas.observacoes.length;
  const totalPerguntas = api.CHECKLIST_ITENS.length + api.CHECKLIST_OBSERVACOES.length;

  const salvar = async (fechar: boolean) => {
    const vazios = HEADERS.filter(field => !cabecalho[field.key].trim()).map(field => field.pt);
    if (vazios.length) { toast.error(`Preencha o cabeçalho: ${vazios.join(', ')}.`); return; }
    if (fechar && (faltas.itens.length || faltas.observacoes.length)) {
      const partes = [faltas.itens.length ? `itens ${faltas.itens.join(', ')}` : '', faltas.observacoes.length ? `observações ${faltas.observacoes.join(', ')}` : ''].filter(Boolean);
      toast.error(`Para fechar, responda: ${partes.join(' e ')}.`);
      return;
    }
    setSalvando(true);
    try {
      const salvo = await api.salvarChecklist({ ...cabecalho, respostas, observacoes, validacao_nomes: nomes }, user, aberto?.id);
      for (const [itemChave, listaFotos] of Object.entries(fotos)) {
        for (const foto of listaFotos) {
          if (foto.localFile) await api.uploadChecklistFoto(salvo.id, itemChave, foto.localFile);
        }
      }
      // Assinaturas coletadas no preenchimento sobem ainda com o rascunho aberto.
      for (const [papel, pendente] of Object.entries(pendentes) as [QuaChecklistPapel, AssinaturaPendente | undefined][]) {
        if (pendente) await api.salvarChecklistAssinatura(salvo.id, papel, pendente.nome, pendente.tipo, pendente.arquivo, user, pendente.assinadoEm);
      }
      if (fechar) await api.fecharChecklist(salvo.id, user);
      const completo = await api.obterChecklist(salvo.id);
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
        toast.success('Rascunho salvo.');
      }
    } catch (error: any) {
      toast.error(`Erro ao salvar checklist: ${error.message || ''}`);
    } finally {
      setSalvando(false);
    }
  };

  const reabrir = async () => {
    if (!aberto) return;
    try {
      await api.reabrirChecklist(aberto.id);
      const completo = await api.obterChecklist(aberto.id);
      preencher(completo);
      await carregarLista();
      toast.success('Checklist reaberto para edição.');
      irPara('formulario');
    } catch (error: any) {
      toast.error(`Não foi possível reabrir: ${error.message || ''}`);
    }
  };

  /** Grava a assinatura capturada em um ou vários checklists. */
  const gravarAssinatura = async (alvo: AlvoAssinatura, tipo: QuaChecklistAssinaturaTipo, file: File, assinadoEm: string) => {
    setAssinando({ papel: alvo.papel, feitos: 0, total: alvo.ids.length });
    const falhas: string[] = [];
    let finalizados = 0;
    let ultimo: QuaChecklistExpedicao | null = null;
    for (const [indice, id] of alvo.ids.entries()) {
      try {
        await api.salvarChecklistAssinatura(id, alvo.papel, alvo.nome.trim(), tipo, file, user, assinadoEm);
        const atualizado = await api.obterChecklist(id);
        ultimo = atualizado;
        if (atualizado.status === 'FINALIZADO') finalizados++;
        if (aberto?.id === id) preencher(atualizado);
      } catch (error: any) {
        falhas.push(`${lista.find(item => item.id === id)?.codigo_registro || id}: ${error.message || 'erro'}`);
      }
      setAssinando({ papel: alvo.papel, feitos: indice + 1, total: alvo.ids.length });
    }
    setAssinando(null);
    await carregarLista();
    if (falhas.length) toast.error(`Assinatura não gravada em ${falhas.length}: ${falhas.join('; ')}`);
    const gravadas = alvo.ids.length - falhas.length;
    if (gravadas) toast.success(`Assinatura de ${alvo.nome.trim()} gravada${alvo.ids.length > 1 ? ` em ${gravadas} checklists` : ''}.${finalizados ? ` ${finalizados} ${finalizados === 1 ? 'checklist finalizado' : 'checklists finalizados'} com as 4 assinaturas.` : ''}`);
    return { falhas: falhas.length, finalizados, ultimo };
  };

  const contextoDe = (checklist: QuaChecklistExpedicao) => `${checklist.codigo_registro} · ${checklist.tramo_sequencial} · Série ${checklist.numero_serie}`;

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

  const removerAssinatura = async (assinatura: QuaChecklistAssinatura) => {
    try {
      await api.removerChecklistAssinatura(assinatura);
      if (aberto) preencher(await api.obterChecklist(aberto.id));
      await carregarLista();
    } catch (error: any) {
      toast.error(`Erro ao remover assinatura: ${error.message || ''}`);
    }
  };

  const historico = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista
      .filter(item => filtro === 'TODOS' || item.status === filtro)
      .filter(item => !termo || [item.codigo_registro, item.cliente, item.projeto, item.tramo_sequencial, item.numero_serie, item.site, item.inspetor_qualidade, item.criado_por_nome || '']
        .some(value => value.toLowerCase().includes(termo)));
  }, [busca, filtro, lista]);

  const contagem = useMemo(() => ({
    FINALIZADO: lista.filter(item => item.status === 'FINALIZADO').length,
    AGUARDANDO_ASSINATURAS: lista.filter(item => item.status === 'AGUARDANDO_ASSINATURAS').length,
    RASCUNHO: lista.filter(item => item.status === 'RASCUNHO').length,
    TODOS: lista.length,
  }), [lista]);

  const acoes = (item: QuaChecklistExpedicao) => {
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
    const filaColetavel = api.filaAssinaturas(lista).filter(podeColetar);
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
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Inbox className="h-5 w-5 text-amber-500" /> Pendentes de assinatura {api.filaAssinaturas(lista).length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-white">{api.filaAssinaturas(lista).length}</span>}</h2>
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
          <FotosItem fotos={fotos[item.chave] || []} editavel={editavel} onAdd={files => adicionarFotos(item.chave, files)} onRemove={foto => removerFoto(item.chave, foto)} onOpen={indice => abrirFotos(item.chave, `Item ${item.numero}`, indice)} />
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
            {(editavel || (fotos[item.chave] || []).length > 0) && <FotosItem fotos={fotos[item.chave] || []} editavel={editavel} onAdd={files => adicionarFotos(item.chave, files)} onRemove={foto => removerFoto(item.chave, foto)} onOpen={indice => abrirFotos(item.chave, `Observação ${item.numero}`, indice)} />}
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
    const totalAssinadas = api.CHECKLIST_PAPEIS.filter(({ papel }) => pendentes[papel] || aberto?.assinaturas.some(item => item.papel === papel)).length;
    return <div className="space-y-5">
      <section className={`${cardClass} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {aberto && <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{aberto.codigo_registro}</span>}
              <StatusBadge status={aberto?.status || 'RASCUNHO'} />
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
            const gravada = aberto?.assinaturas.find(item => item.papel === papel);
            const pendente = pendentes[papel];
            const imagem = pendente?.url || gravada?.preview_url;
            return <div key={papel} className={`flex flex-col gap-2 rounded-xl border p-3 ${imagem ? 'border-emerald-200 dark:border-emerald-900/60' : 'border-slate-200 dark:border-slate-800'}`}>
              <p className="text-xs"><Bilingue inline texto={label} ptClass="font-bold text-slate-700 dark:text-slate-200" /></p>
              {imagem ? <>
                <img src={imagem} alt={`Assinatura ${label}`} className="h-20 w-full rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{pendente?.nome || gravada?.nome}</p>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Assinado em {fmtDataHora(pendente?.assinadoEm || gravada?.assinado_em || gravada?.created_at)}</p>
                {pendente && <p className="text-[11px] font-semibold text-amber-600">Grava ao salvar ou fechar</p>}
                <button type="button" onClick={() => pendente ? descartarPendente(papel) : gravada && removerAssinatura(gravada)} className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-600 dark:border-slate-700"><Trash2 className="h-3.5 w-3.5" /> Refazer</button>
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
    const proximo = api.filaAssinaturas(lista).filter(podeColetar).find(item => item.id !== aberto.id);
    return <div className="space-y-5">
      <section className={`${cardClass} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{aberto.codigo_registro}</span><StatusBadge status={aberto.status} /></div>
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
        <span className="text-xs text-slate-500">Próximo da fila: <b className="text-slate-800 dark:text-slate-100">{proximo.codigo_registro}</b> · {proximo.tramo_sequencial} · faltam {api.papeisPendentes(proximo).length}</span>
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
    const candidatos = api.filaAssinaturas(lista).filter(podeColetar).filter(item => !api.papeisAssinados(item).has(lote.papel));
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

  const tituloAba = tela === 'formulario' ? (aberto ? aberto.codigo_registro : 'Novo checklist') : tela === 'assinaturas' ? 'Assinaturas' : 'Checklists';
  const pendentesTotal = api.filaAssinaturas(lista).length;

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

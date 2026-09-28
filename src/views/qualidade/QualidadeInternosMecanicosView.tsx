import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardCheck, Clock, Eye, FileDown, FileText, History, Inbox, Loader2,
  PenTool, Plus, Save, Search, Send, ShieldCheck, Trash2, UserCheck, X,
} from 'lucide-react';
import type { Profile } from '../../types';
import { localDb } from '../../db/localDb';
import * as api from '../../lib/qualidadeInternosMecanicos';
import { exportQualidadeInternosMecanicosPdf, gerarQualidadeInternosMecanicosPdf } from '../../lib/pdfExport/exportQualidadeInternosMecanicosPdf';
import Bilingue from '../../components/qualidade/Bilingue';
import ColetaAssinaturaTablet, { formatarDataHoraAssinatura, type ModoColeta } from '../../components/qualidade/ColetaAssinaturaTablet';
import FormularioPdfPreview from '../../components/qualidade/FormularioPdfPreview';
import { useLightbox } from '../../components/ui/Lightbox';
import { useToast } from '../../components/ui/Toast';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Tela = 'inicio' | 'formulario' | 'historico';
type FiltroHistorico = 'FINALIZADO' | 'AGUARDANDO_QUALIDADE' | 'RASCUNHO' | 'TODOS';
type HeaderKey = 'projeto' | 'tramo' | 'sequencial' | 'responsavel_producao' | 'responsavel_qualidade' | 'instrumentos_utilizados';
type FotoRascunho = Partial<api.InternosFoto> & { id: string; item_chave: string; localFile?: File; localUrl?: string };
type AssinaturaRascunho = Partial<api.InternosAssinatura> & { papel: api.InternosPapel; tipo: api.InternosAssinaturaTipo; localFile?: File; localUrl?: string; assinadoEm?: string };
type Acao = 'rascunho' | 'concluir' | 'finalizar';

const VERSAO_FORMULARIO = 'FRM.ENG-0240 Rev.02';

const VALIDACOES = [
  { chave: 'nao_conformidade', pt: 'Seção tem NÃO CONFORMIDADE (NC) via “Se Suíte”?', en: 'Section has NON-CONFORMITY (NC) via “Se Suite”?' },
  { chave: 'sdr_aberto', pt: 'Seção tem SOLICITAÇÃO DE DESVIO (SDR) em aberto?', en: 'Does the section have an open SUPPLIER DEVIATION REQUEST (SDR)?' },
];

const STATUS_INFO: Record<api.InternosStatus, { label: string; className: string }> = {
  RASCUNHO: { label: 'Rascunho da Produção', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  AGUARDANDO_QUALIDADE: { label: 'Aguardando Qualidade', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  FINALIZADO: { label: 'Finalizado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900';
const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900';

const today = () => {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
};
const localId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmtData = (value?: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : '-';
function fmtDataHora(value?: string | null): string {
  if (!value) return '-';
  const data = new Date(value);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function cabecalhoVazio(modelo?: api.InternosModelo, user?: Profile): Record<HeaderKey, string> {
  return {
    projeto: modelo?.projeto_padrao?.split(' / ')[0] || '',
    tramo: modelo?.tramo_padrao || '',
    sequencial: '',
    responsavel_producao: user?.name || '',
    responsavel_qualidade: '',
    instrumentos_utilizados: '',
  };
}

function assinaturasVazias(): Record<api.InternosPapel, AssinaturaRascunho | null> {
  return { PRODUCAO: null, QUALIDADE: null };
}

function datasVazias(): Record<api.InternosPapel, { setor: string; data: string }> {
  return { PRODUCAO: { setor: 'Produção', data: today() }, QUALIDADE: { setor: 'Qualidade', data: today() } };
}

function agruparFotos(fotos: api.InternosFoto[]): Record<string, FotoRascunho[]> {
  return fotos.reduce<Record<string, FotoRascunho[]>>((acc, foto) => {
    (acc[foto.item_chave] ||= []).push(foto);
    return acc;
  }, {});
}

function StatusBadge({ status }: { status: api.InternosStatus }) {
  const info = STATUS_INFO[status] || STATUS_INFO.RASCUNHO;
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${info.className}`}>{info.label}</span>;
}

function Etapas({ status, checklist }: { status: api.InternosStatus; checklist?: api.InternosChecklist | null }) {
  const indiceAtual = status === 'RASCUNHO' ? 0 : status === 'AGUARDANDO_QUALIDADE' ? 1 : 3;
  const etapas = [
    { titulo: 'Produção', detalhe: checklist?.producao_concluida_por_nome ? `${checklist.producao_concluida_por_nome} · ${fmtDataHora(checklist.producao_concluida_em)}` : 'Verificação de conformidade' },
    { titulo: 'Qualidade', detalhe: checklist?.qualidade_por_nome ? `${checklist.qualidade_por_nome}${checklist.finalizado_em ? ` · ${fmtDataHora(checklist.finalizado_em)}` : ' · em verificação'}` : 'Dupla verificação' },
    { titulo: 'Histórico', detalhe: checklist?.finalizado_em ? `Finalizado em ${fmtDataHora(checklist.finalizado_em)}` : 'Leitura e PDF' },
  ];
  return <ol className="grid gap-2 sm:grid-cols-3">
    {etapas.map((etapa, indice) => {
      const feito = indice < indiceAtual;
      const atual = indice === indiceAtual;
      return <li key={etapa.titulo} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${atual ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30' : feito ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${feito ? 'bg-emerald-600 text-white' : atual ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}>{feito ? <CheckCircle2 className="h-4 w-4" /> : indice + 1}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{etapa.titulo}</p>
          <p className="truncate text-[11px] text-slate-500">{etapa.detalhe}</p>
        </div>
      </li>;
    })}
  </ol>;
}

const OPCOES_RESPOSTA: Record<'producao' | 'qualidade', { value: api.InternosResposta; label: string; active: string }[]> = {
  producao: [
    { value: 'CONFORME', label: 'Conforme', active: 'border-emerald-600 bg-emerald-600 text-white' },
    { value: 'NAO_CONFORME', label: 'Não conforme', active: 'border-red-600 bg-red-600 text-white' },
    { value: 'NA', label: 'N/A', active: 'border-slate-600 bg-slate-600 text-white' },
  ],
  qualidade: [
    { value: 'CONFORME', label: '✓ Conforme final', active: 'border-emerald-600 bg-emerald-600 text-white' },
    { value: 'NAO_CONFORME', label: 'NC', active: 'border-red-600 bg-red-600 text-white' },
    { value: 'NA', label: 'N/A', active: 'border-slate-600 bg-slate-600 text-white' },
  ],
};

function RespostaBotoes({ value, onChange, variante }: { value: api.InternosResposta | null | undefined; onChange: (value: api.InternosResposta) => void; variante: 'producao' | 'qualidade' }) {
  return <div className="grid grid-cols-3 gap-1.5">
    {OPCOES_RESPOSTA[variante].map(choice => <button key={choice.value} type="button" aria-pressed={value === choice.value} onClick={() => onChange(choice.value)} className={`min-h-[40px] rounded-xl border px-2 text-xs font-bold transition ${value === choice.value ? choice.active : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>{choice.label}</button>)}
  </div>;
}

function ChipResposta({ value, variante }: { value: api.InternosResposta | null | undefined; variante: 'producao' | 'qualidade' }) {
  const opcao = OPCOES_RESPOSTA[variante].find(item => item.value === value);
  if (!opcao) return <span className="inline-flex rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-400 dark:border-slate-700">Sem resposta</span>;
  return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-bold ${opcao.active}`}>{opcao.label}</span>;
}

function FotoControl({ fotos, editavel, onAdd, onRemove, onOpen }: { fotos: FotoRascunho[]; editavel: boolean; onAdd: (files: FileList) => void; onRemove: (foto: FotoRascunho) => void; onOpen: (indice: number) => void }) {
  if (!editavel && !fotos.length) return null;
  return <div className="flex flex-wrap items-center gap-2">
    {fotos.map((foto, indice) => <div key={foto.id} className="relative h-16 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
      {(foto.localUrl || foto.preview_url) && <button type="button" onClick={() => onOpen(indice)} className="h-full w-full" aria-label="Ampliar foto"><img src={foto.localUrl || foto.preview_url} alt="Foto da inspeção" className="h-full w-full object-cover" /></button>}
      {editavel && <button type="button" onClick={() => onRemove(foto)} className="absolute right-1 top-1 rounded-full bg-slate-950/75 p-1 text-white" aria-label="Remover foto"><X className="h-3 w-3" /></button>}
    </div>)}
    {editavel && <label className="inline-flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-blue-300 px-3 text-[11px] font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/30"><Camera className="h-4 w-4" /> Foto<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={event => { if (event.target.files?.length) onAdd(event.target.files); event.target.value = ''; }} /></label>}
  </div>;
}

interface ItemProps {
  item: api.InternosItemModelo;
  etapa: api.InternosEtapa;
  resposta: api.InternosRespostaItem;
  fotos: FotoRascunho[];
  onProducao: (resposta: api.InternosResposta) => void;
  onQualidade: (resposta: api.InternosResposta) => void;
  onCampo: (patch: Partial<api.InternosRespostaItem>) => void;
  onAddFotos: (files: FileList) => void;
  onRemoveFoto: (foto: FotoRascunho) => void;
  onVerImagens: (imagens: { url: string; legenda?: string }[], indice: number) => void;
}

function ItemVerificacao({ item, etapa, resposta, fotos, onProducao, onQualidade, onCampo, onAddFotos, onRemoveFoto, onVerImagens }: ItemProps) {
  const ilustracao = item.ilustracoes[0];
  const producaoEditavel = etapa === 'PRODUCAO';
  const mostraQualidade = etapa !== 'PRODUCAO';
  const qualidadeEditavel = etapa === 'QUALIDADE';
  const nc = resposta.qualidade_resposta === 'NAO_CONFORME';
  const destaque = resposta.qualidade_resposta === 'NAO_CONFORME' || (etapa === 'PRODUCAO' && resposta.resposta === 'NAO_CONFORME');
  const legenda = `Item ${item.numero}`;
  // Foto registrada na resposta toma o lugar da ilustração (como no PDF); a
  // referência continua acessível no fim da galeria.
  const urlsFotos = fotos.map(foto => foto.localUrl || foto.preview_url || '').filter(Boolean);
  const capa = urlsFotos[0] || ilustracao;
  const galeria = [
    ...urlsFotos.map(url => ({ url, legenda: `${legenda} — foto da inspeção` })),
    ...(ilustracao ? [{ url: ilustracao, legenda: `${legenda} — ilustração de referência` }] : []),
  ];

  return <article className={`${cardClass} overflow-hidden ${destaque ? 'border-red-200 dark:border-red-900/60' : ''}`}>
    <div className="flex flex-col gap-3 p-4 sm:flex-row">
      <div className="flex min-w-0 flex-1 gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-black text-white dark:bg-slate-100 dark:text-slate-900">{item.numero}</span>
        <div className="min-w-0 flex-1 space-y-1">
          {item.descricao
            ? <Bilingue texto={item.descricao} ptClass="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-50" enClass="text-[13px] leading-snug" />
            : <p className="text-sm italic text-slate-400">Descrição não informada no formulário fonte.</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">PN {item.numero_peca || '-'}</span>
            {item.indicadores.map(indicador => <span key={indicador} className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">{indicador}</span>)}
          </div>
        </div>
      </div>
      {capa && <div className="relative h-28 w-full shrink-0 sm:h-24 sm:w-32">
        <button type="button" onClick={() => onVerImagens(galeria, 0)} className={`h-full w-full overflow-hidden rounded-xl border bg-white transition hover:border-blue-400 dark:bg-slate-950 ${urlsFotos.length ? 'border-blue-300 dark:border-blue-800' : 'border-slate-200 p-1 dark:border-slate-700'}`} aria-label={urlsFotos.length ? `Ampliar fotos do item ${item.numero}` : `Ampliar ilustração do item ${item.numero}`}>
          <img src={capa} alt={urlsFotos.length ? `Foto da inspeção do item ${item.numero}` : `Ilustração do item ${item.numero}`} className={`h-full w-full ${urlsFotos.length ? 'object-cover' : 'object-contain'}`} />
        </button>
        {urlsFotos.length > 0 && <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-blue-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white"><Camera className="h-3 w-3" /> {urlsFotos.length > 1 ? urlsFotos.length : 'Foto'}</span>}
        {urlsFotos.length > 0 && ilustracao && <button type="button" onClick={() => onVerImagens(galeria, galeria.length - 1)} className="absolute bottom-1.5 right-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm hover:text-blue-700 dark:bg-slate-900/90 dark:text-slate-200">Referência</button>}
      </div>}
    </div>

    <div className={`grid border-t border-slate-100 dark:border-slate-800 ${mostraQualidade ? 'md:grid-cols-2 md:divide-x md:divide-slate-100 md:dark:divide-slate-800' : ''}`}>
      <div className="space-y-2.5 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Produção <span className="font-normal normal-case italic tracking-normal">/ Production</span></p>
        {producaoEditavel ? <RespostaBotoes variante="producao" value={resposta.resposta} onChange={onProducao} /> : <ChipResposta variante="producao" value={resposta.resposta} />}
        {resposta.resposta && <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> {resposta.responsavel || '-'} · {fmtDataHora(resposta.verificado_em)}</p>}
        {producaoEditavel
          ? <textarea value={resposta.observacao || ''} onChange={event => onCampo({ observacao: event.target.value })} placeholder="Observação da Produção (opcional)" rows={1} className={`${inputClass} text-xs`} />
          : resposta.observacao && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">{resposta.observacao}</p>}
      </div>
      {mostraQualidade && <div className={`space-y-2.5 border-t border-slate-100 p-4 md:border-t-0 dark:border-slate-800 ${nc ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Controle da qualidade <span className="font-normal normal-case italic tracking-normal">/ Quality control</span></p>
        {qualidadeEditavel ? <RespostaBotoes variante="qualidade" value={resposta.qualidade_resposta} onChange={onQualidade} /> : <ChipResposta variante="qualidade" value={resposta.qualidade_resposta} />}
        {resposta.qualidade_resposta && resposta.qualidade_responsavel && <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> {resposta.qualidade_responsavel} · {fmtDataHora(resposta.qualidade_verificado_em)}</p>}
        {qualidadeEditavel ? <>
          {nc && <label className="block text-xs font-semibold text-red-700 dark:text-red-300">Quantidade não conforme <span className="font-normal italic">/ Nonconforming quantity</span> *
            <input inputMode="numeric" value={resposta.quantidade_nao_conforme || ''} onChange={event => onCampo({ quantidade_nao_conforme: event.target.value })} placeholder="Quantitativo encontrado" className={`${inputClass} mt-1 text-xs`} />
          </label>}
          <textarea value={resposta.observacao_qualidade || ''} onChange={event => onCampo({ observacao_qualidade: event.target.value })} placeholder="Observação da Qualidade (opcional)" rows={1} className={`${inputClass} text-xs`} />
        </> : <>
          {resposta.quantidade_nao_conforme && <p className="text-xs font-semibold text-red-700 dark:text-red-300">Quantidade não conforme: {resposta.quantidade_nao_conforme}</p>}
          {resposta.observacao_qualidade && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">{resposta.observacao_qualidade}</p>}
        </>}
      </div>}
    </div>

    {(etapa !== 'LEITURA' || fotos.length > 0) && <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
      <FotoControl fotos={fotos} editavel={etapa !== 'LEITURA'} onAdd={onAddFotos} onRemove={onRemoveFoto} onOpen={indice => onVerImagens(fotos.map(foto => ({ url: foto.localUrl || foto.preview_url || '', legenda })), indice)} />
    </div>}
  </article>;
}

function ChecklistResumoCard({ item, acoes, destaque }: { item: api.InternosChecklist; acoes: React.ReactNode; destaque?: React.ReactNode }) {
  const resumo = api.resumoRespostas(item.respostas);
  return <div className={`${cardClass} flex flex-col gap-3 p-4`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{item.codigo_registro}</p>
        <p className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-slate-50">{item.modelo_nome}</p>
      </div>
      <StatusBadge status={item.status} />
    </div>
    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center dark:bg-slate-950">
      <div><dt className="text-[10px] font-semibold uppercase text-slate-400">Projeto</dt><dd className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.projeto}</dd></div>
      <div><dt className="text-[10px] font-semibold uppercase text-slate-400">Tramo</dt><dd className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.tramo}</dd></div>
      <div><dt className="text-[10px] font-semibold uppercase text-slate-400">Sequencial</dt><dd className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{item.sequencial}</dd></div>
    </dl>
    <div className="space-y-1 text-[11px] text-slate-500">
      {destaque}
      {item.status === 'FINALIZADO' && <p className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Qualidade: <b className="text-slate-700 dark:text-slate-200">{item.qualidade_por_nome || item.responsavel_qualidade || '-'}</b> · {fmtDataHora(item.finalizado_em)}</p>}
      {(resumo.producaoNc > 0 || resumo.qualidadeNc > 0) && <p className="font-semibold text-red-600 dark:text-red-400">{resumo.producaoNc} NC na produção · {resumo.qualidadeNc} NC na qualidade</p>}
    </div>
    <div className="mt-auto flex flex-wrap gap-2">{acoes}</div>
  </div>;
}

const botaoPrimario = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60';
const botaoSecundario = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

export default function QualidadeInternosMecanicosView({ user, onNavigate }: Props) {
  const toast = useToast();
  const lightbox = useLightbox();
  const ehAdmin = user.roles.includes('admin');
  const ehQualidade = useMemo(() => api.ehUsuarioQualidade(user, localDb.getSectors()), [user]);

  const [tela, setTela] = useState<Tela>('inicio');
  const [catalogo, setCatalogo] = useState<api.InternosModelo[]>([]);
  const [modeloId, setModeloId] = useState('');
  const [aberto, setAberto] = useState<api.InternosChecklist | null>(null);
  const [etapa, setEtapa] = useState<api.InternosEtapa>('PRODUCAO');
  const [cabecalho, setCabecalho] = useState<Record<HeaderKey, string>>(() => cabecalhoVazio(undefined, user));
  const [respostas, setRespostas] = useState<Record<string, api.InternosRespostaItem>>({});
  const [validacoes, setValidacoes] = useState<Record<string, api.InternosValidacao>>(api.validacoesVazias);
  const [fotos, setFotos] = useState<Record<string, FotoRascunho[]>>({});
  const [assinaturas, setAssinaturas] = useState<Record<api.InternosPapel, AssinaturaRascunho | null>>(assinaturasVazias);
  const [dadosAssinatura, setDadosAssinatura] = useState(datasVazias);
  const [aprovacaoFinal, setAprovacaoFinal] = useState(false);
  const [observacaoFinal, setObservacaoFinal] = useState('');
  const [ilustracoes, setIlustracoes] = useState<Record<string, string>>({});
  const [opcoes, setOpcoes] = useState<Partial<Record<HeaderKey, string[]>>>({});
  const [lista, setLista] = useState<api.InternosChecklist[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroHistorico>('FINALIZADO');
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [coleta, setColeta] = useState<{ papel: api.InternosPapel; modo: ModoColeta } | null>(null);
  const [pdfAlvo, setPdfAlvo] = useState<{ checklist: api.InternosChecklist; modelo: api.InternosModelo } | null>(null);

  const modelo = useMemo(() => catalogo.find(item => item.id === modeloId), [catalogo, modeloId]);
  const status: api.InternosStatus = aberto?.status || 'RASCUNHO';

  const carregarLista = async () => {
    try { setLista(await api.listarChecklistsInternos()); } catch (error: any) { toast.error(`Erro ao carregar checklists: ${error.message || ''}`); }
  };

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const [dados, ...listas] = await Promise.all([
          api.carregarCatalogoInternos(),
          ...api.INTERNOS_CAMPOS_CABECALHO.map(campo => api.listarOpcoesInternos(campo)),
        ]);
        if (!ativo) return;
        setCatalogo(dados.models);
        setOpcoes(Object.fromEntries(api.INTERNOS_CAMPOS_CABECALHO.map((campo, index) => [campo, listas[index]])));
        if (ehAdmin) api.sincronizarIlustracoesInternos(dados).then(urls => { if (ativo) setIlustracoes(urls); }).catch(() => {});
        await carregarLista();
      } catch (error: any) {
        if (ativo) toast.error(`Erro ao carregar checklist: ${error.message || ''}`);
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    carregar();
    return () => { ativo = false; };
  }, []);

  const pendentes = useMemo(() => api.pendentesQualidade(lista), [lista]);
  const rascunhos = useMemo(() => lista.filter(item => item.status === 'RASCUNHO' && (item.criado_por === user.id || ehAdmin)), [lista, user.id, ehAdmin]);

  const limparFormulario = (novoModelo?: api.InternosModelo) => {
    setModeloId(novoModelo?.id || '');
    setAberto(null);
    setEtapa('PRODUCAO');
    setCabecalho(cabecalhoVazio(novoModelo, user));
    setRespostas(novoModelo ? api.respostasVazias(novoModelo) : {});
    setValidacoes(api.validacoesVazias());
    setFotos({});
    setAssinaturas(assinaturasVazias());
    setDadosAssinatura(datasVazias());
    setAprovacaoFinal(false);
    setObservacaoFinal('');
  };

  const escolherModelo = (novoModelo: api.InternosModelo) => {
    limparFormulario(novoModelo);
    setTela('formulario');
    window.scrollTo({ top: 0 });
  };

  const voltarInicio = () => {
    limparFormulario();
    setTela('inicio');
    carregarLista();
  };

  const etapaPara = (checklist: api.InternosChecklist): api.InternosEtapa => {
    const base = api.etapaDoChecklist(checklist.status);
    if (base === 'PRODUCAO' && checklist.criado_por !== user.id && !ehAdmin) return 'LEITURA';
    if (base === 'QUALIDADE' && !ehQualidade) return 'LEITURA';
    return base;
  };

  const preencherFormulario = (checklist: api.InternosChecklist, modeloAberto: api.InternosModelo, novaEtapa: api.InternosEtapa) => {
    const assinaturaProducao = checklist.assinaturas.find(item => item.papel === 'PRODUCAO') || null;
    const assinaturaQualidade = checklist.assinaturas.find(item => item.papel === 'QUALIDADE') || null;
    setModeloId(modeloAberto.id);
    setAberto(checklist);
    setEtapa(novaEtapa);
    setCabecalho({
      projeto: checklist.projeto, tramo: checklist.tramo, sequencial: checklist.sequencial,
      responsavel_producao: checklist.responsavel_producao || '',
      responsavel_qualidade: checklist.responsavel_qualidade || (novaEtapa === 'QUALIDADE' ? user.name : ''),
      instrumentos_utilizados: checklist.instrumentos_utilizados || '',
    });
    setRespostas({ ...api.respostasVazias(modeloAberto), ...checklist.respostas });
    setValidacoes({ ...api.validacoesVazias(), ...checklist.validacoes });
    setFotos(agruparFotos(checklist.fotos));
    setAssinaturas({ PRODUCAO: assinaturaProducao, QUALIDADE: assinaturaQualidade });
    setDadosAssinatura({
      PRODUCAO: { setor: assinaturaProducao?.setor || 'Produção', data: assinaturaProducao?.data_assinatura || today() },
      QUALIDADE: { setor: assinaturaQualidade?.setor || 'Qualidade', data: assinaturaQualidade?.data_assinatura || today() },
    });
    setAprovacaoFinal(checklist.aprovacao_final_qualidade);
    setObservacaoFinal(checklist.observacao_final || '');
  };

  const buscarCompleto = async (id: string) => {
    const checklist = await api.obterChecklistInternos(id);
    const modeloAberto = catalogo.find(item => item.id === checklist.modelo_id);
    if (!modeloAberto) throw new Error('O modelo deste checklist não está disponível no catálogo atual.');
    return { checklist, modeloAberto };
  };

  const abrirChecklist = async (id: string, somenteLeitura = false) => {
    setAbrindoId(id);
    try {
      const { checklist, modeloAberto } = await buscarCompleto(id);
      const novaEtapa = somenteLeitura ? 'LEITURA' : etapaPara(checklist);
      if (novaEtapa === 'QUALIDADE') {
        if (checklist.qualidade_por && checklist.qualidade_por !== user.id) toast.info(`Em verificação por ${checklist.qualidade_por_nome || 'outro usuário'} — você assume a verificação ao salvar.`);
        if (!checklist.qualidade_por) {
          await api.assumirQualidadeInternos(checklist, user);
          checklist.qualidade_por = user.id;
          checklist.qualidade_por_nome = user.name;
        }
      }
      preencherFormulario(checklist, modeloAberto, novaEtapa);
      setTela('formulario');
      window.scrollTo({ top: 0 });
    } catch (error: any) {
      toast.error(`Erro ao abrir checklist: ${error.message || ''}`);
    } finally {
      setAbrindoId(null);
    }
  };

  const verPdf = async (id: string) => {
    setAbrindoId(id);
    try {
      const { checklist, modeloAberto } = await buscarCompleto(id);
      setPdfAlvo({ checklist, modelo: modeloAberto });
    } catch (error: any) {
      toast.error(`Erro ao gerar PDF: ${error.message || ''}`);
    } finally {
      setAbrindoId(null);
    }
  };

  const gerarPdf = useMemo(
    () => pdfAlvo ? () => gerarQualidadeInternosMecanicosPdf(pdfAlvo.checklist, pdfAlvo.modelo, ilustracoes) : null,
    [pdfAlvo, ilustracoes],
  );

  const atualizarResposta = (chave: string, patch: Partial<api.InternosRespostaItem>) => {
    setRespostas(previous => ({ ...previous, [chave]: { ...(previous[chave] || api.respostaVazia()), ...patch } }));
  };

  const responderProducao = (chave: string, resposta: api.InternosResposta) => {
    atualizarResposta(chave, { resposta, responsavel: user.name, responsavel_id: user.id, verificado_em: new Date().toISOString() });
  };

  const responderQualidade = (chave: string, resposta: api.InternosResposta) => {
    atualizarResposta(chave, {
      qualidade_resposta: resposta,
      qualidade_responsavel: user.name,
      qualidade_verificado_em: new Date().toISOString(),
      ...(resposta === 'NAO_CONFORME' ? {} : { quantidade_nao_conforme: '' }),
    });
  };

  const adicionarFotos = (itemChave: string, files: FileList) => {
    const novas = Array.from(files).filter(file => file.type.startsWith('image/')).map(file => ({ id: localId('foto'), item_chave: itemChave, localFile: file, localUrl: URL.createObjectURL(file) }));
    if (novas.length) setFotos(previous => ({ ...previous, [itemChave]: [...(previous[itemChave] || []), ...novas] }));
  };

  const removerFoto = async (itemChave: string, foto: FotoRascunho) => {
    try {
      if (foto.path) await api.removerFotoInternos(foto as api.InternosFoto);
      if (foto.localUrl && !foto.preview_url) URL.revokeObjectURL(foto.localUrl);
      setFotos(previous => ({ ...previous, [itemChave]: (previous[itemChave] || []).filter(item => item.id !== foto.id) }));
    } catch (error: any) {
      toast.error(`Erro ao remover foto: ${error.message || ''}`);
    }
  };

  const nomePorPapel = (papel: api.InternosPapel) => papel === 'PRODUCAO' ? cabecalho.responsavel_producao : cabecalho.responsavel_qualidade;

  const progresso = useMemo(() => {
    if (!modelo) return { feitos: 0, total: 0 };
    const campo = etapa === 'QUALIDADE' ? 'qualidade_resposta' : 'resposta';
    return { feitos: modelo.items.filter(item => !!respostas[item.chave]?.[campo]).length, total: modelo.items.length };
  }, [modelo, respostas, etapa]);

  const validar = (acao: Acao) => {
    if (!modelo) { toast.error('Escolha o formulário que será avaliado.'); return false; }
    const faltam = (['projeto', 'tramo', 'sequencial'] as const).filter(campo => !cabecalho[campo].trim());
    if (faltam.length) { toast.error('Preencha Projeto, Tramo e Sequencial.'); return false; }
    if (acao === 'concluir') {
      const semResposta = modelo.items.filter(item => !respostas[item.chave]?.resposta);
      if (semResposta.length) { toast.error(`Responda todos os itens antes de concluir (faltam: ${semResposta.map(item => item.numero).join(', ')}).`); return false; }
      if (!cabecalho.responsavel_producao.trim() || !assinaturas.PRODUCAO) { toast.error('Informe o responsável e colete a assinatura da Produção.'); return false; }
    }
    if (acao === 'finalizar') {
      const semResposta = modelo.items.filter(item => !respostas[item.chave]?.qualidade_resposta);
      if (semResposta.length) { toast.error(`Faça a dupla verificação de todos os itens (faltam: ${semResposta.map(item => item.numero).join(', ')}).`); return false; }
      const ncSemQuantidade = modelo.items.filter(item => respostas[item.chave]?.qualidade_resposta === 'NAO_CONFORME' && !respostas[item.chave]?.quantidade_nao_conforme?.trim());
      if (ncSemQuantidade.length) { toast.error(`Informe a quantidade não conforme dos itens ${ncSemQuantidade.map(item => item.numero).join(', ')}.`); return false; }
      if (Object.values(validacoes).some(item => !item.resposta)) { toast.error('Responda as duas validações de conformidade.'); return false; }
      if (Object.values(validacoes).some(item => item.resposta === 'SIM' && !item.identificacao.trim())) { toast.error('Informe a identificação da NC / SDR marcada como "Sim".'); return false; }
      if (!cabecalho.responsavel_qualidade.trim() || !assinaturas.QUALIDADE) { toast.error('Informe o responsável e colete a assinatura da Qualidade.'); return false; }
      if (!aprovacaoFinal) { toast.error('Registre a aprovação final da Qualidade para finalizar.'); return false; }
    }
    return true;
  };

  const salvar = async (acao: Acao) => {
    if (!validar(acao) || !modelo) return;
    setSalvando(true);
    try {
      const salvo = await api.salvarChecklistInternos({
        ...cabecalho,
        modelo_id: modelo.id,
        modelo_nome: modelo.nome,
        versao_formulario: VERSAO_FORMULARIO,
        respostas,
        validacoes,
        observacao_final: observacaoFinal,
        aprovacao_final_qualidade: aprovacaoFinal,
      }, user, aberto?.id);
      for (const [itemChave, listaFotos] of Object.entries(fotos)) {
        for (const foto of listaFotos) {
          if (foto.localFile) await api.uploadFotoInternos(salvo.id, itemChave, foto.localFile);
        }
      }
      for (const { papel } of api.INTERNOS_PAPEIS) {
        const assinatura = assinaturas[papel];
        if (assinatura?.localFile) await api.salvarAssinaturaInternos(salvo.id, papel, nomePorPapel(papel), dadosAssinatura[papel].setor, assinatura.assinadoEm || new Date().toISOString(), assinatura.tipo, assinatura.localFile);
      }
      if (acao === 'concluir') await api.concluirProducaoInternos(salvo.id, user);
      if (acao === 'finalizar') await api.finalizarQualidadeInternos(salvo.id, user);
      const completo = await api.obterChecklistInternos(salvo.id);
      await carregarLista();
      if (acao === 'concluir') {
        toast.success(`${completo.codigo_registro} concluído pela Produção e enviado para a Qualidade.`);
        voltarInicio();
      } else if (acao === 'finalizar') {
        toast.success(`${completo.codigo_registro} finalizado e movido para o histórico.`);
        preencherFormulario(completo, modelo, 'LEITURA');
        setPdfAlvo({ checklist: completo, modelo });
        window.scrollTo({ top: 0 });
      } else {
        preencherFormulario(completo, modelo, etapa);
        toast.success(etapa === 'QUALIDADE' ? 'Verificação da Qualidade salva.' : 'Rascunho salvo.');
      }
    } catch (error: any) {
      toast.error(`Erro ao salvar checklist: ${error.message || ''}`);
    } finally {
      setSalvando(false);
    }
  };

  const historicoFiltrado = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista
      .filter(item => filtro === 'TODOS' || item.status === filtro)
      .filter(item => !termo || [item.codigo_registro, item.modelo_nome, item.projeto, item.tramo, item.sequencial, item.criado_por_nome || '', item.producao_concluida_por_nome || '', item.qualidade_por_nome || '']
        .some(value => value.toLowerCase().includes(termo)));
  }, [busca, filtro, lista]);

  const contagem = useMemo(() => ({
    FINALIZADO: lista.filter(item => item.status === 'FINALIZADO').length,
    AGUARDANDO_QUALIDADE: pendentes.length,
    RASCUNHO: lista.filter(item => item.status === 'RASCUNHO').length,
    TODOS: lista.length,
  }), [lista, pendentes]);

  const acoesChecklist = (item: api.InternosChecklist) => {
    const carregandoItem = abrindoId === item.id;
    const botaoPdf = <button type="button" disabled={carregandoItem} onClick={() => verPdf(item.id)} className={botaoSecundario}><FileText className="h-4 w-4" /> Ver PDF</button>;
    if (item.status === 'AGUARDANDO_QUALIDADE' && ehQualidade) {
      return <><button type="button" disabled={carregandoItem} onClick={() => abrirChecklist(item.id)} className={botaoPrimario}>{carregandoItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Fazer dupla verificação</button>{botaoPdf}</>;
    }
    if (item.status === 'RASCUNHO' && (item.criado_por === user.id || ehAdmin)) {
      return <button type="button" disabled={carregandoItem} onClick={() => abrirChecklist(item.id)} className={botaoPrimario}>{carregandoItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />} Continuar preenchimento</button>;
    }
    return <><button type="button" disabled={carregandoItem} onClick={() => abrirChecklist(item.id, true)} className={botaoSecundario}>{carregandoItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Ver respostas</button>{botaoPdf}</>;
  };

  const identificacaoProducao = (item: api.InternosChecklist) => <p className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> Produção: <b className="text-slate-700 dark:text-slate-200">{item.producao_concluida_por_nome || item.criado_por_nome || '-'}</b> · {fmtDataHora(item.producao_concluida_em || item.created_at)}</p>;

  const gruposDoModelo = useMemo(() => {
    if (!modelo) return [];
    return modelo.items.reduce<{ grupo: string; itens: api.InternosItemModelo[] }[]>((acc, item) => {
      const ultimo = acc[acc.length - 1];
      if (ultimo && ultimo.grupo === item.grupo) ultimo.itens.push(item);
      else acc.push({ grupo: item.grupo, itens: [item] });
      return acc;
    }, []);
  }, [modelo]);

  const cabecalhoEditavel = etapa === 'PRODUCAO';

  const renderInicio = () => <div className="space-y-6">
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900 dark:text-slate-50"><Inbox className="h-5 w-5 text-amber-500" /> Aguardando dupla verificação da Qualidade {pendentes.length > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-black text-white">{pendentes.length}</span>}</h2>
          <p className="text-xs text-slate-500">{ehQualidade ? 'Checklists concluídos pela Produção. Abra para fazer a dupla verificação e finalizar.' : 'Checklists concluídos pela Produção que estão com a Qualidade.'}</p>
        </div>
      </div>
      {pendentes.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pendentes.map(item => <ChecklistResumoCard key={item.id} item={item} acoes={acoesChecklist(item)} destaque={<>
          {identificacaoProducao(item)}
          {item.qualidade_por_nome && <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-blue-600" /> Em verificação por <b className="text-slate-700 dark:text-slate-200">{item.qualidade_por_nome}</b></p>}
        </>} />)}
      </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">{carregando ? 'Carregando…' : 'Nenhum checklist aguardando a Qualidade.'}</div>}
    </section>

    {rascunhos.length > 0 && <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">Rascunhos em preenchimento</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rascunhos.map(item => <ChecklistResumoCard key={item.id} item={item} acoes={acoesChecklist(item)} destaque={<p className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" /> Iniciado por <b className="text-slate-700 dark:text-slate-200">{item.criado_por_nome || '-'}</b> · {fmtDataHora(item.created_at)}</p>} />)}
      </div>
    </section>}

    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">O que será avaliado?</h2>
        <p className="text-xs text-slate-500">Novo checklist pela Produção. Cada opção corresponde a uma aba do formulário FRM.ENG-0240.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalogo.map(item => {
          const grupos = [...new Set(item.items.map(value => value.grupo))];
          return <button key={item.id} type="button" onClick={() => escolherModelo(item)} className={`${cardClass} group p-4 text-left transition hover:border-blue-400 hover:shadow-md`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{item.nome}</p>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.tramo_padrao || '-'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{item.items.length} itens · {grupos.length} {grupos.length === 1 ? 'conjunto' : 'conjuntos'}</p>
            <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 group-hover:underline dark:text-blue-300"><Plus className="h-3.5 w-3.5" /> Iniciar checklist</p>
          </button>;
        })}
      </div>
      {carregando && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo…</div>}
    </section>
  </div>;

  const renderHistorico = () => <div className="space-y-4">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar por código, checklist, projeto, tramo, sequencial ou responsável…" className={`${inputClass} pl-9`} /></div>
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([['FINALIZADO', 'Finalizados'], ['AGUARDANDO_QUALIDADE', 'Aguardando Qualidade'], ['RASCUNHO', 'Rascunhos'], ['TODOS', 'Todos']] as const).map(([valor, label]) => <button key={valor} type="button" onClick={() => setFiltro(valor)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold ${filtro === valor ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}>{label} <span className="text-slate-400">{contagem[valor]}</span></button>)}
      </div>
    </div>
    {historicoFiltrado.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {historicoFiltrado.map(item => <ChecklistResumoCard key={item.id} item={item} acoes={acoesChecklist(item)} destaque={item.status !== 'RASCUNHO' ? identificacaoProducao(item) : <p>Iniciado por <b className="text-slate-700 dark:text-slate-200">{item.criado_por_nome || '-'}</b> · {fmtDataHora(item.created_at)}</p>} />)}
    </div> : <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">Nenhum checklist encontrado.</div>}
  </div>;

  const renderFormulario = () => {
    if (!modelo) return null;
    const leitura = etapa === 'LEITURA';
    return <div className="space-y-5">
      <section className={`${cardClass} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {aberto && <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300">{aberto.codigo_registro}</span>}
              <StatusBadge status={status} />
              {leitura && aberto?.status !== 'FINALIZADO' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800">Somente leitura</span>}
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-50">{modelo.nome}</h2>
            <p className="text-xs text-slate-500">{modelo.items.length} itens de verificação · {modelo.formulario}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {aberto && <button type="button" onClick={() => setPdfAlvo({ checklist: aberto, modelo })} className={botaoSecundario}><FileText className="h-4 w-4" /> Ver PDF</button>}
            {aberto && leitura && <button type="button" onClick={() => exportQualidadeInternosMecanicosPdf(aberto, modelo, ilustracoes).catch((error: any) => toast.error(`Erro ao exportar: ${error.message || ''}`))} className={botaoSecundario}><FileDown className="h-4 w-4" /> Baixar</button>}
            {!aberto && <button type="button" onClick={voltarInicio} className={botaoSecundario}>Trocar formulário</button>}
          </div>
        </div>
        <Etapas status={status} checklist={aberto} />
        <div className="grid gap-3 sm:grid-cols-3">
          {([['projeto', 'Projeto', 'Project'], ['tramo', 'Tramo', 'Section'], ['sequencial', 'Sequencial', 'Sequential']] as const).map(([campo, pt, en]) => <label key={campo} className="block text-xs text-slate-600 dark:text-slate-300">
            <Bilingue inline pt={pt} en={en} ptClass="font-semibold" /> {cabecalhoEditavel && <span className="text-red-500">*</span>}
            <input list={`internos-${campo}`} disabled={!cabecalhoEditavel} value={cabecalho[campo]} onChange={event => setCabecalho(previous => ({ ...previous, [campo]: event.target.value }))} className={`${inputClass} mt-1.5 font-semibold`} />
            <datalist id={`internos-${campo}`}>{(opcoes[campo] || []).map(option => <option key={option} value={option} />)}</datalist>
          </label>)}
        </div>
      </section>

      {!leitura && <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
        {etapa === 'PRODUCAO' ? <UserCheck className="h-5 w-5 shrink-0" /> : <ShieldCheck className="h-5 w-5 shrink-0" />}
        <p className="flex-1">{etapa === 'PRODUCAO'
          ? <>Cada item marcado fica registrado em nome de <b>{user.name}</b>. Ao concluir, o checklist segue para a dupla verificação da Qualidade.</>
          : <>Dupla verificação por <b>{user.name}</b>. Confira a resposta da Produção e marque <b>✓ Conforme final</b> ou <b>NC</b> com a quantidade encontrada.</>}</p>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-bold text-blue-700 dark:bg-slate-900 dark:text-blue-300">{progresso.feitos}/{progresso.total}</span>
      </div>}

      <section className="space-y-5">
        {gruposDoModelo.map(({ grupo, itens }) => <div key={`${grupo}-${itens[0].chave}`} className="space-y-3">
          <div className="flex items-baseline gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
            <Bilingue inline texto={grupo || 'GERAL / GENERAL'} ptClass="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200" enClass="text-xs uppercase" />
            <span className="ml-auto text-[11px] text-slate-400">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
          </div>
          {itens.map(item => <ItemVerificacao
            key={item.chave}
            item={item}
            etapa={etapa}
            resposta={respostas[item.chave] || api.respostaVazia()}
            fotos={fotos[item.chave] || []}
            onProducao={resposta => responderProducao(item.chave, resposta)}
            onQualidade={resposta => responderQualidade(item.chave, resposta)}
            onCampo={patch => atualizarResposta(item.chave, patch)}
            onAddFotos={files => adicionarFotos(item.chave, files)}
            onRemoveFoto={foto => removerFoto(item.chave, foto)}
            onVerImagens={(imagens, indice) => lightbox.abrir(imagens, indice)}
          />)}
        </div>)}
      </section>

      {etapa !== 'PRODUCAO' && <section className={`${cardClass} p-4 sm:p-5`}>
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Validação de conformidades" en="Compliance validation" /></h2>
        <div className="mt-4 space-y-3">
          {VALIDACOES.map((item, indice) => {
            const valor = validacoes[item.chave];
            return <div key={item.chave} className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div className="flex gap-2 text-xs"><span className="font-black text-slate-400">{indice + 1}</span><div><Bilingue pt={item.pt} en={item.en} ptClass="font-semibold text-slate-800 dark:text-slate-100" /></div></div>
              {etapa === 'QUALIDADE'
                ? <div className="grid grid-cols-2 gap-1.5">{(['SIM', 'NAO'] as const).map(opcao => <button key={opcao} type="button" aria-pressed={valor?.resposta === opcao} onClick={() => setValidacoes(previous => ({ ...previous, [item.chave]: { ...(previous[item.chave] || { identificacao: '' }), resposta: opcao } }))} className={`min-h-[40px] rounded-xl border px-4 text-xs font-bold ${valor?.resposta === opcao ? opcao === 'SIM' ? 'border-red-600 bg-red-600 text-white' : 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}>{opcao === 'SIM' ? <>Sim <span className="font-normal italic">/ Yes</span></> : <>Não <span className="font-normal italic">/ No</span></>}</button>)}</div>
                : <span className={`w-fit rounded-lg px-3 py-1 text-xs font-bold ${valor?.resposta === 'SIM' ? 'bg-red-100 text-red-700' : valor?.resposta === 'NAO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{valor?.resposta === 'SIM' ? 'Sim' : valor?.resposta === 'NAO' ? 'Não' : '-'}</span>}
              {etapa === 'QUALIDADE'
                ? <input value={valor?.identificacao || ''} disabled={valor?.resposta !== 'SIM'} onChange={event => setValidacoes(previous => ({ ...previous, [item.chave]: { ...(previous[item.chave] || { resposta: null }), identificacao: event.target.value } }))} placeholder={valor?.resposta === 'SIM' ? 'Identificação (nº da NC / SDR) *' : 'Identificação — só quando "Sim"'} className={`${inputClass} text-xs`} />
                : <p className="text-xs text-slate-600 dark:text-slate-300">{valor?.identificacao || ''}</p>}
            </div>;
          })}
        </div>
        {etapa === 'QUALIDADE'
          ? <textarea value={observacaoFinal} onChange={event => setObservacaoFinal(event.target.value)} placeholder="Observação / Observation" rows={3} className={`${inputClass} mt-3`} />
          : observacaoFinal && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-200"><b>Observação:</b> {observacaoFinal}</p>}
      </section>}

      <section className={`${cardClass} p-4 sm:p-5`}>
        <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-50"><Bilingue inline pt="Validação e assinaturas" en="Validation and signatures" /></h2>
        <label className="mt-4 block text-xs text-slate-600 dark:text-slate-300">
          <Bilingue inline pt="Instrumentos utilizados" en="Measurements tool" ptClass="font-semibold" />
          <input list="internos-instrumentos_utilizados" disabled={leitura} value={cabecalho.instrumentos_utilizados} onChange={event => setCabecalho(previous => ({ ...previous, instrumentos_utilizados: event.target.value }))} placeholder="Ex.: torquímetro nº…, trena…" className={`${inputClass} mt-1.5`} />
          <datalist id="internos-instrumentos_utilizados">{(opcoes.instrumentos_utilizados || []).map(option => <option key={option} value={option} />)}</datalist>
        </label>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {api.INTERNOS_PAPEIS.filter(({ papel }) => papel === 'PRODUCAO' || etapa !== 'PRODUCAO').map(({ papel }) => {
            const assinatura = assinaturas[papel];
            const headerKey: HeaderKey = papel === 'PRODUCAO' ? 'responsavel_producao' : 'responsavel_qualidade';
            const editavel = (papel === 'PRODUCAO' && etapa === 'PRODUCAO') || (papel === 'QUALIDADE' && etapa === 'QUALIDADE');
            const [pt, en] = papel === 'PRODUCAO' ? ['Produção', 'Manufacture'] : ['Qualidade', 'Quality'];
            return <div key={papel} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-xs text-slate-700 dark:text-slate-200"><Bilingue inline pt={pt} en={en} ptClass="font-bold" /></p>
              <input disabled={!editavel} value={cabecalho[headerKey]} onChange={event => setCabecalho(previous => ({ ...previous, [headerKey]: event.target.value }))} placeholder="Nome / Name" className={`${inputClass} text-xs`} />
              <input disabled={!editavel} value={dadosAssinatura[papel].setor} onChange={event => setDadosAssinatura(previous => ({ ...previous, [papel]: { ...previous[papel], setor: event.target.value } }))} placeholder="Setor / Sector" className={`${inputClass} text-xs`} />
              {assinatura?.localUrl || assinatura?.preview_url ? <><div className="flex items-center gap-2">
                <img src={assinatura.localUrl || assinatura.preview_url} alt={`Assinatura ${pt}`} className="h-16 flex-1 rounded-lg border border-slate-200 bg-white object-contain dark:border-slate-700" />
                {editavel && <button type="button" onClick={async () => { try { if (assinatura.path) await api.removerAssinaturaInternos(assinatura as api.InternosAssinatura); if (assinatura.localUrl && !assinatura.preview_url) URL.revokeObjectURL(assinatura.localUrl); setAssinaturas(previous => ({ ...previous, [papel]: null })); } catch (error: any) { toast.error(`Erro ao remover assinatura: ${error.message || ''}`); } }} className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-slate-700" title="Refazer assinatura"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Assinado em {formatarDataHoraAssinatura(assinatura.assinadoEm || assinatura.assinado_em || assinatura.data_assinatura)}{assinatura.localFile ? <span className="font-normal text-amber-600"> · grava ao salvar</span> : null}</p>
              </> : editavel ? <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setColeta({ papel, modo: 'DESENHO' })} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700"><PenTool className="h-4 w-4" /> Assinar</button>
                <button type="button" onClick={() => setColeta({ papel, modo: 'SELFIE' })} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"><Camera className="h-4 w-4" /> Tirar selfie</button>
              </div> : <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">Sem assinatura</p>}
            </div>;
          })}
        </div>
        {etapa !== 'PRODUCAO' && <label className={`mt-4 flex items-center gap-3 rounded-xl border p-3 text-xs ${aprovacaoFinal ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300'} ${etapa === 'QUALIDADE' ? 'cursor-pointer' : ''}`}>
          <input type="checkbox" disabled={etapa !== 'QUALIDADE'} checked={aprovacaoFinal} onChange={event => setAprovacaoFinal(event.target.checked)} className="h-5 w-5 accent-emerald-600" />
          <span><Bilingue inline pt="Aprovação final do Checklist — QUALIDADE" en="Final approval of the checklist — QUALITY" ptClass="font-bold" /></span>
        </label>}
      </section>

      {!leitura && <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-end dark:border-slate-800 dark:bg-slate-900/95">
        <p className="text-xs text-slate-500 sm:mr-auto">{progresso.feitos} de {progresso.total} itens {etapa === 'QUALIDADE' ? 'verificados pela Qualidade' : 'respondidos'}</p>
        <button type="button" onClick={() => salvar('rascunho')} disabled={salvando || carregando} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"><Save className="h-4 w-4" /> {etapa === 'QUALIDADE' ? 'Salvar verificação' : 'Salvar rascunho'}</button>
        {etapa === 'PRODUCAO'
          ? <button type="button" onClick={() => salvar('concluir')} disabled={salvando || carregando} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Concluir e enviar à Qualidade</button>
          : <button type="button" onClick={() => salvar('finalizar')} disabled={salvando || carregando} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Finalizar checklist</button>}
      </div>}
    </div>;
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-16">
    <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <button type="button" onClick={() => tela === 'formulario' ? voltarInicio() : onNavigate('/qualidade')} className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> {tela === 'formulario' ? 'Voltar para a lista' : 'Voltar para Qualidade'}</button>
        <div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">FRM.ENG-0240</span><span className="text-xs text-slate-400">Rev. 02</span></div>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Checklist internos mecânicos</h1>
        <p className="text-sm italic text-slate-500 dark:text-slate-400">Mechanical internal checklist</p>
      </div>
      <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        <button type="button" onClick={() => tela === 'formulario' ? undefined : setTela('inicio')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tela !== 'historico' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}><ClipboardCheck className="h-4 w-4" /> {tela === 'formulario' ? (aberto ? aberto.codigo_registro : 'Novo checklist') : 'Checklists'}{tela !== 'formulario' && pendentes.length > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendentes.length}</span>}</button>
        <button type="button" onClick={() => { setTela('historico'); carregarLista(); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${tela === 'historico' ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-500'}`}><History className="h-4 w-4" /> Histórico</button>
      </div>
    </div>

    {tela === 'historico' ? renderHistorico() : tela === 'formulario' && modelo ? renderFormulario() : renderInicio()}

    <ColetaAssinaturaTablet
      aberto={!!coleta}
      papel={coleta?.papel === 'QUALIDADE' ? 'Qualidade / Quality' : 'Produção / Manufacture'}
      contexto={modelo ? `${aberto?.codigo_registro || 'Novo checklist'} · ${modelo.nome} · ${cabecalho.tramo} / ${cabecalho.sequencial}` : undefined}
      nomeInicial={coleta ? nomePorPapel(coleta.papel) : ''}
      modoInicial={coleta?.modo}
      onConfirmar={({ nome, tipo, arquivo, assinadoEm }) => {
        if (!coleta) return;
        const { papel } = coleta;
        setCabecalho(previous => ({ ...previous, [papel === 'PRODUCAO' ? 'responsavel_producao' : 'responsavel_qualidade']: nome }));
        setAssinaturas(previous => ({ ...previous, [papel]: { papel, tipo, localFile: arquivo, localUrl: URL.createObjectURL(arquivo), assinadoEm } }));
        setColeta(null);
      }}
      onFechar={() => setColeta(null)}
    />
    {gerarPdf && <FormularioPdfPreview gerar={gerarPdf} onClose={() => setPdfAlvo(null)} />}
    {lightbox.elemento}
  </div>;
}

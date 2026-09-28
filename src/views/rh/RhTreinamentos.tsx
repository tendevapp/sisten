/**
 * Módulo RH — cadastro do plano de treinamentos (`rh_treinamentos`).
 * A carga em massa lê a aba `Tarefas` do XLSX e faz upsert pela chave natural
 * data + treinamento + horário + tipos, preservando a edição direta da tela.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Edit2, FileSpreadsheet, Loader2,
  Plus, RefreshCw, Search, Trash2, Upload, X,
} from 'lucide-react';
import type { Profile, RhTreinamento } from '../../types';
import * as api from '../../lib/rhApi';
import { mapearPlanilhaTreinamentos, type ResultadoImportacaoTreinamentos, type TreinamentoImportado } from '../../lib/rhTreinamentosImport';
import { useToast } from '../../components/ui/Toast';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type FormState = Omit<TreinamentoImportado, 'data_eficacia'> & { data_eficacia: string };

const FORM_VAZIO: FormState = {
  data_treinamento: '',
  dia_semana: '',
  semana: '',
  tipo_planejamento: 'P',
  treinamento: '',
  turma_horario: '',
  tipo_treinamento: '',
  data_eficacia: '',
  realizado: false,
};

function paraFormulario(item?: RhTreinamento | null): FormState {
  if (!item) return FORM_VAZIO;
  return {
    data_treinamento: item.data_treinamento,
    dia_semana: item.dia_semana,
    semana: item.semana,
    tipo_planejamento: item.tipo_planejamento,
    treinamento: item.treinamento,
    turma_horario: item.turma_horario,
    tipo_treinamento: item.tipo_treinamento,
    data_eficacia: item.data_eficacia || '',
    realizado: item.realizado,
  };
}

function formatarData(data: string): string {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function badgeTipo(tipo: string): string {
  if (tipo === 'B') return 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
  if (tipo === 'T.L') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

export default function RhTreinamentos({ user, onNavigate }: Props) {
  const toast = useToast();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<RhTreinamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [ano, setAno] = useState('2027');
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<RhTreinamento | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<RhTreinamento | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [preview, setPreview] = useState<ResultadoImportacaoTreinamentos | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const carregar = async () => {
    setCarregando(true);
    try {
      setItens(await api.listarRhTreinamentos());
    } catch (err: any) {
      toast.error(`Erro ao carregar treinamentos: ${err.message || ''}`);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, []);

  const anos = useMemo(() => {
    const valores = new Set(itens.map(item => item.data_treinamento.slice(0, 4)));
    valores.add('2027');
    return Array.from(valores).sort().reverse();
  }, [itens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter(item => {
      const correspondeAno = ano === 'todos' || item.data_treinamento.startsWith(ano);
      const correspondeBusca = !termo || [item.treinamento, item.dia_semana, item.semana, item.turma_horario]
        .join(' ').toLowerCase().includes(termo);
      return correspondeAno && correspondeBusca && (!somentePendentes || !item.realizado);
    });
  }, [ano, busca, itens, somentePendentes]);

  const abrirNovo = () => {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  };

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault();
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarRhTreinamento(editando.id, form, user.id);
        toast.success('Treinamento atualizado.');
      } else {
        await api.criarRhTreinamento(form, user.id);
        toast.success('Treinamento cadastrado.');
      }
      setModalAberto(false);
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar treinamento.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    const item = paraExcluir;
    setExcluindo(true);
    try {
      await api.excluirRhTreinamento(item.id, user.id);
      setParaExcluir(null);
      await carregar();
      toast.undo(`Treinamento de ${formatarData(item.data_treinamento)} excluído.`, async () => {
        try {
          await api.restaurarRhTreinamento(item.id);
          await carregar();
          toast.success('Treinamento restaurado.');
        } catch (err: any) {
          toast.error(err.message || 'Erro ao restaurar treinamento.');
        }
      }, 6000);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir treinamento.');
    } finally {
      setExcluindo(false);
    }
  };

  const lerArquivo = (arquivo: File) => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const dados = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(dados, { type: 'array', cellDates: false });
        const nomeAba = workbook.SheetNames.find(nome => nome.trim().toLowerCase() === 'tarefas') || workbook.SheetNames[0];
        if (!nomeAba) throw new Error('Nenhuma aba encontrada no arquivo.');
        const linhas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nomeAba], { header: 1, defval: null, raw: true });
        const resultado = mapearPlanilhaTreinamentos(linhas);
        if (!resultado.itens.length) throw new Error('Nenhuma linha válida de treinamento foi encontrada.');
        setNomeArquivo(`${arquivo.name} · aba ${nomeAba}`);
        setPreview(resultado);
      } catch (err: any) {
        setPreview(null);
        toast.error(err.message || 'Falha ao ler a planilha de treinamentos.');
      } finally {
        if (inputArquivo.current) inputArquivo.current.value = '';
      }
    };
    reader.onerror = () => toast.error('Falha ao ler o arquivo selecionado.');
    reader.readAsArrayBuffer(arquivo);
  };

  const importar = async () => {
    if (!preview) return;
    setImportando(true);
    setProgresso(0);
    try {
      const resumo = await api.importarRhTreinamentos(preview.itens, (percent) => setProgresso(percent), user.id);
      toast.success(`Importação concluída: ${resumo.inseridos} novos e ${resumo.atualizados} atualizados.`);
      setPreview(null);
      setNomeArquivo('');
      await carregar();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar treinamentos.');
    } finally {
      setImportando(false);
    }
  };

  const atualizarCampo = <K extends keyof FormState>(campo: K, valor: FormState[K]) => {
    setForm(atual => ({ ...atual, [campo]: valor }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <header>
        <button type="button" onClick={() => onNavigate('/rh')} className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para RH
        </button>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/20"><CalendarDays className="h-6 w-6" /></span>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-50">Treinamentos</h1>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Plano de treinamentos do RH, com edição direta e atualização pela planilha</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            <button type="button" onClick={() => inputArquivo.current?.click()} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Upload className="h-3.5 w-3.5" /> Importar planilha
            </button>
            <input ref={inputArquivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={event => { const arquivo = event.target.files?.[0]; if (arquivo) lerArquivo(arquivo); }} />
            <button type="button" onClick={abrirNovo} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
              <Plus className="h-4 w-4" /> Novo treinamento
            </button>
          </div>
        </div>
      </header>

      {preview && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200"><FileSpreadsheet className="h-4 w-4" /> Prévia de importação</div>
              <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">{nomeArquivo}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <span className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-900">{preview.itens.length} válidos</span>
                <span className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-900">{preview.duplicadas} duplicadas consolidadas</span>
                <span className="rounded-full bg-white px-2.5 py-1 dark:bg-slate-900">{preview.linhasIgnoradas} ignoradas</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => { setPreview(null); setNomeArquivo(''); }} disabled={importando} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Cancelar</button>
              <button type="button" onClick={() => void importar()} disabled={importando} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {importando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Aplicar atualização
              </button>
            </div>
          </div>
          {importando && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${progresso}%` }} /></div>}
          <div className="mt-3 overflow-x-auto rounded-xl border border-emerald-100 bg-white dark:border-emerald-900 dark:bg-slate-900">
            <table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Treinamento</th><th className="px-3 py-2">Horário</th><th className="px-3 py-2">Classificação</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{preview.itens.slice(0, 5).map((item, index) => <tr key={`${item.data_treinamento}-${index}`}><td className="px-3 py-2">{formatarData(item.data_treinamento)}</td><td className="whitespace-pre-line px-3 py-2 font-medium">{item.treinamento}</td><td className="px-3 py-2">{item.turma_horario || '—'}</td><td className="px-3 py-2">{item.tipo_treinamento || '—'}</td></tr>)}</tbody></table>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cadastrados</p><p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{itens.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Realizados</p><p className="mt-1 text-2xl font-bold text-emerald-600">{itens.filter(item => item.realizado).length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pendentes</p><p className="mt-1 text-2xl font-bold text-amber-600">{itens.filter(item => !item.realizado).length}</p></div>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar treinamento, semana ou horário..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div>
        <select value={ano} onChange={event => setAno(event.target.value)} aria-label="Filtrar por ano" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><option value="todos">Todos os anos</option>{anos.map(valor => <option key={valor} value={valor}>{valor}</option>)}</select>
        <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><input type="checkbox" checked={somentePendentes} onChange={event => setSomentePendentes(event.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /> Somente pendentes</label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div> : filtrados.length === 0 ? <p className="px-4 py-16 text-center text-sm text-slate-400">Nenhum treinamento encontrado.</p> : <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Semana</th><th className="px-4 py-3">Treinamento</th><th className="px-4 py-3">Horário</th><th className="px-4 py-3">Planejamento</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtrados.map(item => <tr key={item.id} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">{formatarData(item.data_treinamento)}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">{item.dia_semana || '—'}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-500">{item.semana || '—'}</td><td className="max-w-[360px] whitespace-pre-line px-4 py-3 font-semibold text-slate-900 dark:text-slate-50">{item.treinamento}</td><td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{item.turma_horario || '—'}</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.tipo_planejamento}</span></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${badgeTipo(item.tipo_treinamento)}`}>{item.tipo_treinamento || '—'}</span></td><td className="px-4 py-3">{item.realizado ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Realizado</span> : <span className="font-semibold text-amber-600">Pendente</span>}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" title="Editar" onClick={() => { setEditando(item); setForm(paraFormulario(item)); setModalAberto(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"><Edit2 className="h-4 w-4" /></button><button type="button" title="Excluir" onClick={() => setParaExcluir(item)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>}
      </section>

      {modalAberto && <Modal onClose={() => setModalAberto(false)} maxWidth="max-w-2xl" ariaLabel="Cadastro de treinamento"><ModalHeader onClose={() => setModalAberto(false)}><h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">{editando ? 'Editar treinamento' : 'Novo treinamento'}</h3></ModalHeader><form onSubmit={salvar}><ModalBody><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="treinamento-data" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Data *</label><input id="treinamento-data" type="date" required value={form.data_treinamento} onChange={event => atualizarCampo('data_treinamento', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label htmlFor="treinamento-dia" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Dia da semana</label><input id="treinamento-dia" value={form.dia_semana} onChange={event => atualizarCampo('dia_semana', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div className="sm:col-span-2"><label htmlFor="treinamento-nome" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Treinamento *</label><textarea id="treinamento-nome" required rows={2} value={form.treinamento} onChange={event => atualizarCampo('treinamento', event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label htmlFor="treinamento-horario" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Turma / horário</label><input id="treinamento-horario" value={form.turma_horario} onChange={event => atualizarCampo('turma_horario', event.target.value)} placeholder="Ex.: 8:00" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label htmlFor="treinamento-semana" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Semana</label><input id="treinamento-semana" value={form.semana} onChange={event => atualizarCampo('semana', event.target.value)} placeholder="Ex.: W2" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label htmlFor="treinamento-planejamento" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Tipo de planejamento</label><select id="treinamento-planejamento" value={form.tipo_planejamento} onChange={event => atualizarCampo('tipo_planejamento', event.target.value as FormState['tipo_planejamento'])} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option value="P">Programado</option><option value="NP">Não programado</option><option value="RP">Reprogramado</option></select></div><div><label htmlFor="treinamento-tipo" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Tipo de treinamento</label><select id="treinamento-tipo" value={form.tipo_treinamento} onChange={event => atualizarCampo('tipo_treinamento', event.target.value as FormState['tipo_treinamento'])} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"><option value="">Não informado</option><option value="B">Básico</option><option value="T.E">Treinamento de evolução</option><option value="T.L">Treinamento legal</option></select></div><div><label htmlFor="treinamento-eficacia" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Data da eficácia</label><input id="treinamento-eficacia" type="date" value={form.data_eficacia} onChange={event => atualizarCampo('data_eficacia', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><label className="inline-flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={form.realizado} onChange={event => atualizarCampo('realizado', event.target.checked)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" /> Treinamento realizado</label></div></ModalBody><ModalFooter><button type="button" onClick={() => setModalAberto(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Cancelar</button><button type="submit" disabled={salvando} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar</button></ModalFooter></form></Modal>}

      {paraExcluir && <ConfirmDialog titulo="Excluir este treinamento?" mensagem={`O registro de ${formatarData(paraExcluir.data_treinamento)} será retirado da lista, mas ficará preservado no histórico.`} confirmarLabel="Excluir" cancelarLabel="Cancelar" variante="perigo" confirmando={excluindo} onConfirmar={excluir} onCancelar={() => setParaExcluir(null)} />}
      {importando && progresso >= 100 && <button type="button" aria-label="Fechar progresso" onClick={() => setImportando(false)} className="fixed bottom-5 right-5 rounded-full bg-emerald-600 p-2 text-white shadow-lg"><X className="h-4 w-4" /></button>}
    </div>
  );
}

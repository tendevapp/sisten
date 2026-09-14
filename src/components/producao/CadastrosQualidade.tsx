import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import type { Profile } from '../../types';
import {
  atualizarDefeito, atualizarTolerancia, criarDefeito, criarTolerancia,
  listarDefeitos, listarEtapas, listarTolerancias,
  type DefeitoProducao, type EtapaProducao, type ToleranciaProducaoDb,
} from '../../lib/producaoApi';

type Aba = 'defeitos' | 'tolerancias' | 'etapas';
type FormDefeito = { id?: string; codigo: string; nome: string; descricao: string; ativo: boolean };
type FormTolerancia = { id?: string; etapa_id: string; medida: string; tramo: string; virola: string; minimo: string; maximo: string; unidade: string; ativa: boolean };

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function CadastrosQualidade({ user }: { user: Profile }) {
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('defeitos');
  const [busca, setBusca] = useState('');
  const [defeitos, setDefeitos] = useState<DefeitoProducao[]>([]);
  const [tolerancias, setTolerancias] = useState<ToleranciaProducaoDb[]>([]);
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState<'defeito' | 'tolerancia' | null>(null);
  const [defeitoForm, setDefeitoForm] = useState<FormDefeito>({ codigo: '', nome: '', descricao: '', ativo: true });
  const [toleranciaForm, setToleranciaForm] = useState<FormTolerancia>({ etapa_id: 'evs', medida: '', tramo: '', virola: '', minimo: '', maximo: '', unidade: 'mm', ativa: true });

  const carregar = async () => {
    setCarregando(true);
    try {
      const [d, t, e] = await Promise.all([listarDefeitos(), listarTolerancias(), listarEtapas()]);
      setDefeitos(d); setTolerancias(t); setEtapas(e);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível carregar os cadastros.'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); /* carregar é estável para esta tela */ }, []);

  const etapasMap = useMemo(() => new Map(etapas.map(e => [e.id, e.nome])), [etapas]);
  const termo = busca.trim().toLowerCase();
  const defeitosFiltrados = defeitos.filter(d => !termo || `${d.codigo} ${d.nome} ${d.descricao ?? ''}`.toLowerCase().includes(termo));
  const toleranciasFiltradas = tolerancias.filter(t => !termo || `${t.medida} ${t.etapa_id} ${t.tramo ?? ''} ${t.virola ?? ''}`.toLowerCase().includes(termo));

  const abrirNovoDefeito = () => { setDefeitoForm({ codigo: '', nome: '', descricao: '', ativo: true }); setModal('defeito'); };
  const abrirEditarDefeito = (d: DefeitoProducao) => { setDefeitoForm({ id: d.id, codigo: d.codigo, nome: d.nome, descricao: d.descricao ?? '', ativo: d.ativo }); setModal('defeito'); };
  const abrirNovaTolerancia = () => { setToleranciaForm({ etapa_id: 'evs', medida: '', tramo: '', virola: '', minimo: '', maximo: '', unidade: 'mm', ativa: true }); setModal('tolerancia'); };
  const abrirEditarTolerancia = (t: ToleranciaProducaoDb) => { setToleranciaForm({ id: t.id, etapa_id: t.etapa_id, medida: t.medida, tramo: t.tramo ?? '', virola: t.virola ?? '', minimo: t.minimo == null ? '' : String(t.minimo), maximo: t.maximo == null ? '' : String(t.maximo), unidade: t.unidade, ativa: t.ativa }); setModal('tolerancia'); };

  const salvarDefeito = async () => {
    if (!defeitoForm.codigo.trim() || !defeitoForm.nome.trim()) { toast.error('Informe código e nome do defeito.'); return; }
    setSalvando(true);
    try {
      if (defeitoForm.id) await atualizarDefeito(defeitoForm.id, defeitoForm);
      else await criarDefeito(defeitoForm);
      toast.success('Defeito salvo.'); setModal(null); await carregar();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o defeito.'); }
    finally { setSalvando(false); }
  };

  const salvarTolerancia = async () => {
    if (!toleranciaForm.medida.trim()) { toast.error('Informe a medida.'); return; }
    const minimo = toNumber(toleranciaForm.minimo); const maximo = toNumber(toleranciaForm.maximo);
    if (minimo != null && maximo != null && minimo > maximo) { toast.error('O mínimo não pode ser maior que o máximo.'); return; }
    const payload = { etapa_id: toleranciaForm.etapa_id, medida: toleranciaForm.medida, tramo: toleranciaForm.tramo || null, virola: toleranciaForm.virola || null, minimo, maximo, unidade: toleranciaForm.unidade || 'mm', ativa: toleranciaForm.ativa };
    setSalvando(true);
    try {
      if (toleranciaForm.id) await atualizarTolerancia(toleranciaForm.id, payload);
      else await criarTolerancia(payload);
      toast.success('Tolerância salva.'); setModal(null); await carregar();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível salvar a tolerância.'); }
    finally { setSalvando(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
      <div><h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">Cadastros de Qualidade</h1><p className="text-xs text-slate-500 dark:text-slate-400">Defeitos, tolerâncias e etapas usados na liberação da produção.</p></div>
      {aba === 'defeitos' && <button type="button" onClick={abrirNovoDefeito} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Novo defeito</button>}
      {aba === 'tolerancias' && <button type="button" onClick={abrirNovaTolerancia} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Nova tolerância</button>}
    </header>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">{([['defeitos', 'Defeitos'], ['tolerancias', 'Tolerâncias'], ['etapas', 'Etapas']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => { setAba(id); setBusca(''); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${aba === id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-50' : 'text-slate-500'}`}>{label}</button>)}</div>
      <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cadastro..." className={`${inputClass} pl-9`} /></div>
    </div>
    {carregando ? <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : aba === 'defeitos' ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="hidden grid-cols-[1fr_2fr_3fr_100px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid dark:border-slate-800 dark:bg-slate-950"><span>Código</span><span>Nome</span><span>Descrição</span><span /></div>{defeitosFiltrados.map(d => <div key={d.id} className="grid gap-2 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_2fr_3fr_100px] sm:items-center dark:border-slate-800"><div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{d.codigo}</div><div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{d.nome}{!d.ativo && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600">Inativo</span>}</div><div className="text-xs text-slate-500">{d.descricao || '—'}</div><button type="button" onClick={() => abrirEditarDefeito(d)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><Edit2 className="h-3.5 w-3.5" /> Editar</button></div>)}{!defeitosFiltrados.length && <p className="p-8 text-center text-sm text-slate-500">Nenhum defeito encontrado.</p>}</section> : aba === 'tolerancias' ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="hidden grid-cols-[1fr_1fr_1fr_1fr_100px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid dark:border-slate-800 dark:bg-slate-950"><span>Etapa</span><span>Medida</span><span>Escopo</span><span>Faixa</span><span /></div>{toleranciasFiltradas.map(t => <div key={t.id} className="grid gap-2 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_1fr_1fr_1fr_100px] sm:items-center dark:border-slate-800"><div className="text-sm font-semibold">{etapasMap.get(t.etapa_id) ?? t.etapa_id}</div><div className="text-sm">{t.medida}</div><div className="text-xs text-slate-500">{[t.tramo, t.virola].filter(Boolean).join(' · ') || 'Todos'}</div><div className="text-xs font-medium">{t.minimo ?? '−∞'} a {t.maximo ?? '+∞'} {t.unidade}</div><button type="button" onClick={() => abrirEditarTolerancia(t)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><Edit2 className="h-3.5 w-3.5" /> Editar</button></div>)}{!toleranciasFiltradas.length && <p className="p-8 text-center text-sm text-slate-500">Nenhuma tolerância encontrada.</p>}</section> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="hidden grid-cols-[70px_2fr_1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid dark:border-slate-800 dark:bg-slate-950"><span>Ordem</span><span>Etapa</span><span>Prefixo</span><span>Status</span></div>{etapas.filter(e => !termo || `${e.nome} ${e.id} ${e.prefixo_codigo}`.toLowerCase().includes(termo)).map(e => <div key={e.id} className="grid gap-2 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[70px_2fr_1fr_1fr] sm:items-center dark:border-slate-800"><div className="text-xs font-mono">{e.ordem}</div><div className="text-sm font-semibold">{e.nome}</div><div className="font-mono text-xs">{e.prefixo_codigo}</div><div className="text-xs text-slate-500">{e.ativa ? 'Ativa' : 'Inativa'}</div></div>)}</section>}

    {modal === 'defeito' && <Modal onClose={() => setModal(null)} ariaLabel="Cadastro de defeito" maxWidth="max-w-lg"><ModalHeader onClose={() => setModal(null)}><h2 className="font-bold">{defeitoForm.id ? 'Editar defeito' : 'Novo defeito'}</h2><p className="text-xs text-slate-500">A taxonomia aparece no formulário de UT e no Pareto.</p></ModalHeader><ModalBody className="space-y-3 p-5"><label className="block text-xs font-bold">Código<input value={defeitoForm.codigo} onChange={e => setDefeitoForm(f => ({ ...f, codigo: e.target.value }))} className={`${inputClass} mt-1 uppercase`} placeholder="FALTA_FUSAO" /></label><label className="block text-xs font-bold">Nome<input value={defeitoForm.nome} onChange={e => setDefeitoForm(f => ({ ...f, nome: e.target.value }))} className={`${inputClass} mt-1`} placeholder="Falta de fusão" /></label><label className="block text-xs font-bold">Descrição<textarea value={defeitoForm.descricao} onChange={e => setDefeitoForm(f => ({ ...f, descricao: e.target.value }))} className={`${inputClass} mt-1 resize-none`} rows={3} /></label><button type="button" onClick={() => setDefeitoForm(f => ({ ...f, ativo: !f.ativo }))} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">{defeitoForm.ativo ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />} Cadastro ativo</button></ModalBody><ModalFooter><button type="button" onClick={() => setModal(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button><button type="button" disabled={salvando} onClick={() => void salvarDefeito()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar'}</button></ModalFooter></Modal>}
    {modal === 'tolerancia' && <Modal onClose={() => setModal(null)} ariaLabel="Cadastro de tolerância" maxWidth="max-w-lg"><ModalHeader onClose={() => setModal(null)}><h2 className="font-bold">{toleranciaForm.id ? 'Editar tolerância' : 'Nova tolerância'}</h2><p className="text-xs text-slate-500">Limites usados para destacar medições fora da faixa.</p></ModalHeader><ModalBody className="space-y-3 p-5"><label className="block text-xs font-bold">Etapa<select value={toleranciaForm.etapa_id} onChange={e => setToleranciaForm(f => ({ ...f, etapa_id: e.target.value }))} className={`${inputClass} mt-1`}>{etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label><label className="block text-xs font-bold">Medida<input value={toleranciaForm.medida} onChange={e => setToleranciaForm(f => ({ ...f, medida: e.target.value }))} className={`${inputClass} mt-1`} placeholder="altura_interna" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-xs font-bold">Mínimo<input inputMode="decimal" value={toleranciaForm.minimo} onChange={e => setToleranciaForm(f => ({ ...f, minimo: e.target.value }))} className={`${inputClass} mt-1`} /></label><label className="block text-xs font-bold">Máximo<input inputMode="decimal" value={toleranciaForm.maximo} onChange={e => setToleranciaForm(f => ({ ...f, maximo: e.target.value }))} className={`${inputClass} mt-1`} /></label></div><div className="grid grid-cols-2 gap-2"><label className="block text-xs font-bold">Tramo<input value={toleranciaForm.tramo} onChange={e => setToleranciaForm(f => ({ ...f, tramo: e.target.value }))} className={`${inputClass} mt-1`} placeholder="T1 (opcional)" /></label><label className="block text-xs font-bold">Virola<input value={toleranciaForm.virola} onChange={e => setToleranciaForm(f => ({ ...f, virola: e.target.value }))} className={`${inputClass} mt-1`} placeholder="V1 (opcional)" /></label></div><label className="block text-xs font-bold">Unidade<input value={toleranciaForm.unidade} onChange={e => setToleranciaForm(f => ({ ...f, unidade: e.target.value }))} className={`${inputClass} mt-1`} /></label></ModalBody><ModalFooter><button type="button" onClick={() => setModal(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button><button type="button" disabled={salvando} onClick={() => void salvarTolerancia()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{salvando ? 'Salvando…' : 'Salvar'}</button></ModalFooter></Modal>}
  </div>;
}

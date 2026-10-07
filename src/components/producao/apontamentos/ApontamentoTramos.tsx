import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { listarTramosAtuais, salvarEventoTramo, type TramoAtual } from '../../../lib/producaoTramosApi';
import { MARCOS_TRAMO, type MarcoTramo } from '../../../lib/producaoTramos';

export default function ApontamentoTramos() {
  const toast = useToast();
  const [tramos, setTramos] = useState<TramoAtual[]>([]);
  const [tramoId, setTramoId] = useState('');
  const [marco, setMarco] = useState<MarcoTramo>('inicio');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [setor, setSetor] = useState('');
  const [atividade, setAtividade] = useState('');
  const [salvando, setSalvando] = useState(false);
  const carregar = () => listarTramosAtuais().then(setTramos).catch(e => toast.error(e.message));
  useEffect(() => { carregar(); }, []);
  const salvar = async () => { if (!tramoId) return toast.error('Selecione o tramo.'); setSalvando(true); try { const r = await salvarEventoTramo({ tramoId, dataOperacional: data, marco, setor, atividade }); toast.success(`Apontamento ${r.codigo} registrado.`); carregar(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao registrar.'); } finally { setSalvando(false); } };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="font-display text-lg font-bold">Lançar realizado por tramo</h2><div className="mt-4 grid gap-3 md:grid-cols-2"><select value={tramoId} onChange={e=>setTramoId(e.target.value)} className="rounded-lg border p-2"><option value="">Selecione série / torre / tramo</option>{tramos.map(t=><option key={t.tramoId} value={t.tramoId}>{t.serie} · Torre {t.torreNumero} · {t.tramo} — {t.atividadeAtual ?? 'Sem atividade'}</option>)}</select><select value={marco} onChange={e=>setMarco(e.target.value as MarcoTramo)} className="rounded-lg border p-2">{MARCOS_TRAMO.map(m=><option key={m}>{m}</option>)}</select><input type="date" value={data} onChange={e=>setData(e.target.value)} className="rounded-lg border p-2"/><input value={setor} onChange={e=>setSetor(e.target.value)} placeholder="Setor atual" className="rounded-lg border p-2"/><input value={atividade} onChange={e=>setAtividade(e.target.value)} placeholder="Atividade atual" className="rounded-lg border p-2"/></div><button type="button" onClick={salvar} disabled={salvando} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-60">{salvando?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>} Registrar apontamento</button></section>;
}

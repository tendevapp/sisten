import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Loader2, Settings2 } from 'lucide-react';
import type { Profile } from '../../types';
import { calcularIndicadoresQualidade } from '../../lib/producao';
import {
  listarLancamentos,
  listarRelatorioDiario,
  listarMatrizEntrega,
  listarTramosEntrega,
  listarPendencias,
  type EntregaTramoProducao,
  type PendenciaProducao,
} from '../../lib/producaoApi';
import type { TramoEntrega } from '../../lib/producaoEntrega';
import CadastrosQualidade from '../../components/producao/CadastrosQualidade';
import TorresEntregaVisual from '../../components/producao/TorresEntregaVisual';

type Modo = 'pendencias' | 'entrega' | 'painel' | 'cadastros';

const CONFIG: Record<Modo, { titulo: string; descricao: string; Icone: typeof ClipboardList }> = {
  pendencias: { titulo: 'Controle de Liberações', descricao: 'Reprovações que aguardam correção e nova inspeção.', Icone: AlertTriangle },
  entrega: { titulo: 'Controle de Entrega', descricao: 'Prontidão de UT por torre e tramo para a Expedição.', Icone: CheckCircle2 },
  painel: { titulo: 'Painel de Qualidade', descricao: 'Indicadores calculados dos lançamentos de produção.', Icone: BarChart3 },
  cadastros: { titulo: 'Cadastros de Qualidade', descricao: 'Tolerâncias e taxonomia usadas pelos lançamentos.', Icone: Settings2 },
};

function CardNumero({ label, valor, tom = 'text-slate-900 dark:text-slate-50' }: { label: string; valor: string | number; tom?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tom}`}>{valor}</p></div>;
}

export default function ProducaoOperacao({ modo, user }: { modo: Modo; user: Profile; onNavigate: (path: string) => void }) {
  const { titulo, descricao, Icone } = CONFIG[modo];
  const [carregando, setCarregando] = useState(true);
  const [pendencias, setPendencias] = useState<PendenciaProducao[]>([]);
  const [tramosEntrega, setTramosEntrega] = useState<TramoEntrega[]>([]);
  const [indicadores, setIndicadores] = useState({ total: 0, fpy: 0, retrabalho: 0, wip: 0 });
  const [relatorio, setRelatorio] = useState<{ data: string; total: number; aprovados: number; reprovados: number; refugados: number; pendentes: number }[]>([]);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true); setErro('');
    try {
      if (modo === 'pendencias') setPendencias(await listarPendencias());
      if (modo === 'entrega') setTramosEntrega(await listarTramosEntrega());
      if (modo === 'painel') {
        const linhas = await listarLancamentos();
        setIndicadores(calcularIndicadoresQualidade(linhas.map(l => ({ etapaId: l.etapa_id, status: l.status, tentativa: l.tentativa }))));
        setRelatorio(await listarRelatorioDiario());
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, [modo]);

  const handleAtualizarTramo = (t: TramoEntrega) => {
    setTramosEntrega(prev => prev.map(item => (item.id === t.id ? t : item)));
  };

  return <div className={`mx-auto ${modo === 'entrega' ? 'max-w-7xl' : 'max-w-6xl'} space-y-5 pb-12`}>
    <header className="border-b border-slate-200 pb-4 dark:border-slate-800"><div className="flex items-center gap-2"><span className="rounded-xl bg-orange-50 p-2 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300"><Icone className="h-5 w-5" /></span><div><h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">{titulo}</h1><p className="text-xs text-slate-500 dark:text-slate-400">{descricao}</p></div></div></header>
    {carregando ? <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : erro ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{erro}</p> : <>
      {modo === 'pendencias' && (pendencias.length ? <div className="space-y-2">{pendencias.map(p => <div key={p.lancamento_id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20"><div><p className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.etapa_nome} · Torre {p.torre_numero} · {p.tramo} · {p.virola}</p><p className="text-xs text-slate-500">{p.codigo}{p.observacao ? ` · ${p.observacao}` : ''}</p></div><span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-900">CORRIGIR</span></div>)}</div> : <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma pendência aberta.</p>)}
      {modo === 'entrega' && (
        <TorresEntregaVisual
          tramos={tramosEntrega}
          aoAtualizarTramo={handleAtualizarTramo}
          recarregar={carregar}
        />
      )}
      {modo === 'painel' && <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><CardNumero label="Lançamentos" valor={indicadores.total} /><CardNumero label="FPY" valor={`${indicadores.fpy}%`} tom="text-emerald-600" /><CardNumero label="Retrabalho" valor={`${indicadores.retrabalho}%`} tom="text-amber-600" /><CardNumero label="WIP / pendências" valor={indicadores.wip} tom="text-rose-600" /></div><section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="font-bold">Relatório diário</h2><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="p-2">Data</th><th className="p-2">Total</th><th className="p-2">Aprov.</th><th className="p-2">Reprov.</th><th className="p-2">Refugo</th><th className="p-2">Pendente</th></tr></thead><tbody>{relatorio.map(r => <tr key={r.data} className="border-b last:border-0"><td className="p-2 font-medium">{r.data}</td><td className="p-2">{r.total}</td><td className="p-2 text-emerald-600">{r.aprovados}</td><td className="p-2 text-rose-600">{r.reprovados}</td><td className="p-2">{r.refugados}</td><td className="p-2 text-amber-600">{r.pendentes}</td></tr>)}</tbody></table></div></section></>}
      {modo === 'cadastros' && <CadastrosQualidade user={user} />}
    </>}
  </div>;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CalendarDays, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { Profile } from '../../types';
import {
  carregarAcompanhamentoDiarioDados,
  carregarAcompanhamentoSnapshot,
  removerFeriadoAcompanhamentoDiario,
  removerMetaSemanalAcompanhamentoDiario,
  removerRealizadoAcompanhamentoDiario,
  salvarFeriadoAcompanhamentoDiario,
  salvarMetasAcompanhamentoDiario,
  salvarMetasSemanaisAcompanhamentoDiario,
  salvarRealizadoAcompanhamentoDiario,
  type AcompanhamentoDiarioDados,
  type AcompanhamentoSnapshot,
} from '../../lib/planejamentoAcompanhamentoApi';
import { buildAcompanhamentoDiarioModel, DAILY_AREAS, DAILY_MONTHS } from '../../lib/planejamentoAcompanhamentoDiario';

interface Props { user: Profile; onNavigate: (path: string) => void; }

type MetaDraft = { meta: string; diasUteis: string };

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function chaveMeta(area: string, ano: number, mes: number): string {
  return `${area}:${ano}:${mes}`;
}

function inicioSemana(data: string): string {
  const date = new Date(`${data}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function fimSemana(inicio: string): string {
  const date = new Date(`${inicio}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function diasUteisSemana(inicio: string, feriados: string[]): number {
  let total = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(`${inicio}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const data = date.toISOString().slice(0, 10);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !feriados.includes(data)) total += 1;
  }
  return total;
}

function formatarData(data: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${data}T00:00:00Z`));
}

export default function AcompanhamentoDiarioDadosView({ user: _user, onNavigate }: Props) {
  const hoje = new Date();
  const ano = hoje.getUTCFullYear();
  const [snapshot, setSnapshot] = useState<AcompanhamentoSnapshot | null>(null);
  const [dados, setDados] = useState<AcompanhamentoDiarioDados | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [mes, setMes] = useState(hoje.getUTCMonth() + 1);
  const [areaRealizado, setAreaRealizado] = useState('NAVE_1');
  const [dataRealizado, setDataRealizado] = useState(isoHoje());
  const [valorRealizado, setValorRealizado] = useState('');
  const [novaDataFeriado, setNovaDataFeriado] = useState('');
  const [novaDescricaoFeriado, setNovaDescricaoFeriado] = useState('');
  const [metasDraft, setMetasDraft] = useState<Record<string, MetaDraft>>({});
  const [semanaReferencia, setSemanaReferencia] = useState(inicioSemana(isoHoje()));
  const [metasSemanaisDraft, setMetasSemanaisDraft] = useState<Record<string, MetaDraft>>({});

  const load = useCallback(async () => {
    setRefreshing(true);
    setErro(null);
    try {
      const [novoSnapshot, novosDados] = await Promise.all([
        carregarAcompanhamentoSnapshot(),
        carregarAcompanhamentoDiarioDados(ano),
      ]);
      setSnapshot(novoSnapshot);
      setDados(novosDados);
      setMetasDraft({});
      setMetasSemanaisDraft({});
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao carregar os dados do Acomp Diário.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ano]);

  useEffect(() => { void load(); }, [load]);

  const model = useMemo(() => buildAcompanhamentoDiarioModel(snapshot?.base ?? [], hoje, mes - 1, dados ?? undefined), [dados, hoje, mes, snapshot?.base]);
  const ajusteExistente = useMemo(
    () => dados?.realizados.find(item => item.area === areaRealizado && item.data === dataRealizado),
    [areaRealizado, dados?.realizados, dataRealizado],
  );

  useEffect(() => {
    setValorRealizado(ajusteExistente ? String(ajusteExistente.realizado) : '');
  }, [ajusteExistente]);

  const linhasMeta = useMemo(() => DAILY_AREAS.map(area => {
    const key = chaveMeta(area.id, ano, mes);
    const salvo = dados?.metas.find(item => item.area === area.id && item.ano === ano && item.mes === mes);
    const calculado = model.areas.find(item => item.id === area.id)?.monthly[mes - 1];
    const valor = metasDraft[key] ?? {
      meta: String(salvo?.meta ?? calculado?.programado ?? 0),
      diasUteis: String(salvo?.dias_uteis ?? calculado?.diasUteis ?? 0),
    };
    return { area, key, salvo, valor };
  }), [ano, dados?.metas, mes, metasDraft, model.areas]);

  const atualizarMeta = (key: string, campo: keyof MetaDraft, value: string, fallback: MetaDraft) => {
    if (key.split(':').length === 2) {
      setMetasSemanaisDraft(atual => ({ ...atual, [key]: { ...(atual[key] ?? fallback), [campo]: value } }));
      return;
    }
    setMetasDraft(atual => ({ ...atual, [key]: { ...(atual[key] ?? fallback), [campo]: value } }));
  };

  const semanaInicio = inicioSemana(semanaReferencia);
  const linhasMetaSemanal = useMemo(() => DAILY_AREAS.map(area => {
    const key = `${area.id}:${semanaInicio}`;
    const salvo = dados?.metasSemanais?.find(item => item.area === area.id && item.semana_inicio === semanaInicio);
    const valor = metasSemanaisDraft[key] ?? {
      meta: salvo ? String(salvo.meta) : '',
      diasUteis: String(salvo?.dias_uteis ?? diasUteisSemana(semanaInicio, dados?.feriados ?? [])),
    };
    return { area, key, salvo, valor };
  }), [dados?.feriados, dados?.metasSemanais, metasSemanaisDraft, semanaInicio]);

  const salvarMetas = async () => {
    const alteradas = linhasMeta.flatMap(linha => {
      const meta = Number(linha.valor.meta);
      const diasUteis = Number(linha.valor.diasUteis);
      if (!Number.isFinite(meta) || meta < 0 || !Number.isInteger(diasUteis) || diasUteis < 0 || diasUteis > 31) return [];
      if (linha.salvo && linha.salvo.meta === meta && linha.salvo.dias_uteis === diasUteis) return [];
      return [{ area: linha.area.id, ano, mes, meta, dias_uteis: diasUteis }];
    });
    if (!alteradas.length) { setMensagem('Nenhuma meta alterada para salvar.'); return; }
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await salvarMetasAcompanhamentoDiario(alteradas);
      setMensagem('Metas atualizadas. O painel passa a usar os novos valores.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar as metas.');
    } finally { setSalvando(false); }
  };

  const salvarMetasSemanais = async () => {
    const alteradas = linhasMetaSemanal.flatMap(linha => {
      if (!linha.valor.meta.trim()) return [];
      const meta = Number(linha.valor.meta);
      const diasUteis = Number(linha.valor.diasUteis);
      if (!Number.isFinite(meta) || meta < 0 || !Number.isInteger(diasUteis) || diasUteis < 0 || diasUteis > 7) return [];
      if (linha.salvo && linha.salvo.meta === meta && linha.salvo.dias_uteis === diasUteis) return [];
      return [{ area: linha.area.id, semana_inicio: semanaInicio, meta, dias_uteis: diasUteis }];
    });
    if (!alteradas.length) { setMensagem('Informe ao menos uma meta semanal alterada para salvar.'); return; }
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await salvarMetasSemanaisAcompanhamentoDiario(alteradas);
      setMensagem('Metas semanais atualizadas. O programado mensal foi recalculado com os novos ritmos.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'NÃ£o foi possÃ­vel salvar as metas semanais.');
    } finally { setSalvando(false); }
  };

  const removerMetaSemanal = async (area: string) => {
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await removerMetaSemanalAcompanhamentoDiario(area, semanaInicio);
      setMensagem('A meta semanal foi removida e o painel voltou a usar a meta mensal nessa semana.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'NÃ£o foi possÃ­vel remover a meta semanal.');
    } finally { setSalvando(false); }
  };

  const salvarRealizado = async () => {
    const realizado = Number(valorRealizado);
    if (!dataRealizado || !Number.isFinite(realizado) || realizado < 0) { setErro('Informe uma data e um realizado maior ou igual a zero.'); return; }
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await salvarRealizadoAcompanhamentoDiario({ area: areaRealizado as typeof DAILY_AREAS[number]['id'], data: dataRealizado, realizado });
      setMensagem('Realizado manual atualizado para o dia selecionado.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível atualizar o realizado.');
    } finally { setSalvando(false); }
  };

  const removerAjuste = async () => {
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await removerRealizadoAcompanhamentoDiario(areaRealizado, dataRealizado);
      setMensagem('Ajuste removido. O painel voltou a usar o realizado da base importada.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível remover o ajuste.');
    } finally { setSalvando(false); }
  };

  const adicionarFeriado = async () => {
    if (!novaDataFeriado) { setErro('Informe a data do feriado.'); return; }
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await salvarFeriadoAcompanhamentoDiario(novaDataFeriado, novaDescricaoFeriado);
      setNovaDataFeriado(''); setNovaDescricaoFeriado('');
      setMensagem('Feriado atualizado para o cálculo diário.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o feriado.');
    } finally { setSalvando(false); }
  };

  const removerFeriado = async (data: string) => {
    setSalvando(true); setErro(null); setMensagem(null);
    try {
      await removerFeriadoAcompanhamentoDiario(data);
      setMensagem('Feriado removido do cálculo diário.');
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível remover o feriado.');
    } finally { setSalvando(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-[#e7eef8] p-3 text-[#0b2d67]"><CalendarDays className="h-6 w-6" /></span><div><button type="button" onClick={() => onNavigate('/planejamento/acompanhamento-diario-tv')} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#0b2d67]"><ArrowLeft className="h-3.5 w-3.5" /> Acomp Diário</button><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Dados do Acomp Diário</h1><p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Edite a meta e os dias úteis por área. O realizado manual substitui somente o dia informado, preservando a base BD importada.</p></div></div>
      <button type="button" onClick={() => void load()} disabled={refreshing || salvando} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar</button>
    </header>

    {erro && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Não foi possível concluir a operação.</strong><p className="mt-1">{erro}</p></div></div>}
    {mensagem && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{mensagem}</div>}
    {loading ? <div className="flex justify-center rounded-2xl border border-dashed border-slate-300 py-16 text-sm text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Carregando dados...</div> : <>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Metas mensais</h2><p className="mt-1 text-sm text-slate-500">A média diária segue a fórmula da planilha: meta ÷ dias úteis.</p></div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Mês<select value={mes} onChange={event => setMes(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{DAILY_MONTHS.map((nome, index) => <option key={nome} value={index + 1}>{nome} / {ano}</option>)}</select></label></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[620px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Área</th><th className="px-3 py-3 text-right">Meta</th><th className="px-3 py-3 text-right">Dias úteis</th><th className="px-3 py-3 text-right">Média diária</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{linhasMeta.map(linha => { const fallback = linha.valor; const meta = Number(linha.valor.meta); const dias = Number(linha.valor.diasUteis); return <tr key={linha.area.id}><td className="px-3 py-3 font-bold text-[#0b2d67] dark:text-sky-300">{linha.area.label}</td><td className="px-3 py-2 text-right"><input aria-label={`Meta ${linha.area.label}`} type="number" min="0" step="0.01" value={linha.valor.meta} onChange={event => atualizarMeta(linha.key, 'meta', event.target.value, fallback)} className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></td><td className="px-3 py-2 text-right"><input aria-label={`Dias úteis ${linha.area.label}`} type="number" min="0" max="31" step="1" value={linha.valor.diasUteis} onChange={event => atualizarMeta(linha.key, 'diasUteis', event.target.value, fallback)} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></td><td className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">{dias > 0 && Number.isFinite(meta) ? (meta / dias).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}</td></tr>; })}</tbody></table></div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void salvarMetas()} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-[#0b2d67] px-4 py-2 text-sm font-bold text-white hover:bg-[#082550] disabled:opacity-50"><Save className="h-4 w-4" /> Salvar metas</button></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Metas semanais</h2><p className="mt-1 text-sm text-slate-500">A meta semanal substitui o ritmo da meta mensal somente nesta semana. O programado mensal e o saldo diario sao recalculados.</p></div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Semana<input type="date" value={semanaReferencia} onChange={event => event.target.value && setSemanaReferencia(inicioSemana(event.target.value))} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label></div>
        <p className="mt-3 text-xs font-semibold text-[#0b2d67] dark:text-sky-300">Periodo: {formatarData(semanaInicio)} a {formatarData(fimSemana(semanaInicio))}</p>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3">Area</th><th className="px-3 py-3 text-right">Meta da semana</th><th className="px-3 py-3 text-right">Dias uteis</th><th className="px-3 py-3 text-right">Media diaria</th><th className="px-3 py-3" /></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{linhasMetaSemanal.map(linha => { const fallback = linha.valor; const meta = Number(linha.valor.meta); const dias = Number(linha.valor.diasUteis); return <tr key={linha.area.id}><td className="px-3 py-3 font-bold text-[#0b2d67] dark:text-sky-300">{linha.area.label}</td><td className="px-3 py-2 text-right"><input aria-label={`Meta semanal ${linha.area.label}`} type="number" min="0" step="0.01" value={linha.valor.meta} onChange={event => atualizarMeta(linha.key, 'meta', event.target.value, fallback)} placeholder="Sem ajuste" className="w-32 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></td><td className="px-3 py-2 text-right"><input aria-label={`Dias uteis semanais ${linha.area.label}`} type="number" min="0" max="7" step="1" value={linha.valor.diasUteis} onChange={event => atualizarMeta(linha.key, 'diasUteis', event.target.value, fallback)} className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-2 text-right font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></td><td className="px-3 py-3 text-right font-semibold text-slate-600 dark:text-slate-300">{linha.valor.meta.trim() && dias > 0 && Number.isFinite(meta) ? (meta / dias).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}</td><td className="px-3 py-2 text-right">{linha.salvo && <button type="button" onClick={() => void removerMetaSemanal(linha.area.id)} disabled={salvando} title="Voltar a meta mensal" className="inline-flex rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</td></tr>; })}</tbody></table></div>
        <div className="mt-4 flex justify-end"><button type="button" onClick={() => void salvarMetasSemanais()} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-[#0b2d67] px-4 py-2 text-sm font-bold text-white hover:bg-[#082550] disabled:opacity-50"><Save className="h-4 w-4" /> Salvar metas semanais</button></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Realizado diário</h2><p className="mt-1 text-sm text-slate-500">Use este ajuste quando o número do dia precisar ser diferente da base BD. Ao remover, o painel retorna ao valor importado.</p><div className="mt-4 grid gap-3 sm:grid-cols-4"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Área<select value={areaRealizado} onChange={event => setAreaRealizado(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">{DAILY_AREAS.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}</select></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Data<input type="date" value={dataRealizado} onChange={event => setDataRealizado(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Realizado manual<input type="number" min="0" step="0.01" value={valorRealizado} onChange={event => setValorRealizado(event.target.value)} placeholder="Ex.: 4" className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></label><div className="flex items-end gap-2"><button type="button" onClick={() => void salvarRealizado()} disabled={salvando} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2d67] px-3 text-sm font-bold text-white hover:bg-[#082550] disabled:opacity-50"><Save className="h-4 w-4" /> Salvar</button>{ajusteExistente && <button type="button" onClick={() => void removerAjuste()} disabled={salvando} title="Voltar ao realizado da base" className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-200 px-3 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}</div></div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Feriados</h2><p className="mt-1 text-sm text-slate-500">Os feriados não recebem média diária nem movimentam a meta replanejada.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="date" value={novaDataFeriado} onChange={event => setNovaDataFeriado(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><input value={novaDescricaoFeriado} onChange={event => setNovaDescricaoFeriado(event.target.value)} placeholder="Descrição opcional" className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /><button type="button" onClick={() => void adicionarFeriado()} disabled={salvando} className="h-10 rounded-lg border border-[#0b2d67] px-3 text-sm font-bold text-[#0b2d67] hover:bg-[#e7eef8] disabled:opacity-50">Adicionar</button></div><div className="mt-3 flex flex-wrap gap-2">{dados?.feriados.length ? dados.feriados.map(data => <span key={data} className="inline-flex items-center gap-2 rounded-full bg-amber-50 py-1 pl-3 pr-1 text-xs font-semibold text-amber-900"><span>{formatarData(data)}</span><button type="button" onClick={() => void removerFeriado(data)} disabled={salvando} aria-label={`Remover feriado ${formatarData(data)}`} className="rounded-full p-1 hover:bg-amber-100"><Trash2 className="h-3 w-3" /></button></span>) : <span className="text-sm text-slate-500">Nenhum feriado cadastrado para {ano}.</span>}</div></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">Histórico recente</h2><div className="mt-3 overflow-x-auto"><table className="min-w-[640px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-2">Quando</th><th className="px-3 py-2">Dado</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2">Chave</th><th className="px-3 py-2">Usuário</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{dados?.auditoria.length ? dados.auditoria.map(item => <tr key={item.id}><td className="px-3 py-2 text-slate-600 dark:text-slate-300">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.alterado_em))}</td><td className="px-3 py-2 font-semibold text-[#0b2d67] dark:text-sky-300">{item.entidade}</td><td className="px-3 py-2">{item.acao}</td><td className="px-3 py-2 text-slate-600 dark:text-slate-300">{Object.entries(item.chave ?? {}).map(([chave, valor]) => `${chave}: ${valor}`).join(' · ')}</td><td className="px-3 py-2 text-slate-500">{item.alterado_por ?? '—'}</td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Nenhuma alteração registrada.</td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

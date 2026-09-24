import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, ClipboardList, FileText, Loader2, RefreshCw, Save, Truck } from 'lucide-react';
import type { Profile } from '../../types';
import { ordenarPlanoExpedicao, resumirPlanoExpedicao, type StatusPlanoExpedicao } from '../../lib/producao';
import {
  atualizarPlanoExpedicao,
  listarPlanoExpedicao,
  type PlanoExpedicaoProducao,
} from '../../lib/producaoApi';
import { useToast } from '../../components/ui/Toast';

type ModoPlano = 'relatorio' | 'dados';

const dataParaInput = (data: string | null) => data?.slice(0, 10) ?? '';
const formatarData = (data: string | null, formato: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }) => {
  if (!data) return '—';
  return new Intl.DateTimeFormat('pt-BR', formato).format(new Date(`${data.slice(0, 10)}T12:00:00`));
};
const nomeMes = (linha: PlanoExpedicaoProducao) => {
  const data = linha.data_carregamento ?? linha.data_expedicao;
  return data ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${data.slice(0, 10)}T12:00:00`)).toUpperCase() : 'SEM DATA';
};

const STATUS: Record<StatusPlanoExpedicao, { label: string; classe: string }> = {
  a_faturar: { label: 'A faturar', classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  faturado: { label: 'Faturado', classe: 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300' },
  expedido: { label: 'Expedido', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-250' },
};

function Marcador({ marcado, label }: { marcado: boolean; label: string }) {
  return marcado ? <Check aria-label={label} className="mx-auto h-4 w-4 text-blue-600" /> : <span aria-label={`${label}: não emitida`} className="block text-center text-slate-300">—</span>;
}

function BotaoNf({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (valor: boolean) => void }) {
  return <label className="flex justify-center" title={label}>
    <input aria-label={label} type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
  </label>;
}

function FiltrosRelatorio({
  semanas, semana, torres, torresSelecionadas, onSemana, onTorres,
}: {
  semanas: number[]; semana: number; torres: number[]; torresSelecionadas: number[];
  onSemana: (semana: number) => void; onTorres: (torres: number[]) => void;
}) {
  const alternarTorre = (torre: number) => onTorres(torresSelecionadas.includes(torre)
    ? torresSelecionadas.filter(item => item !== torre)
    : [...torresSelecionadas, torre].sort((a, b) => a - b));

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-end gap-4">
      <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span>Semana de programação</span>
        <select value={semana} onChange={e => onSemana(Number(e.target.value))} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          {semanas.map(item => <option key={item} value={item}>W{item}</option>)}
        </select>
      </label>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Torres <span className="font-normal text-slate-400">(sem seleção, mostra todas)</span></p>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {torres.map(torre => {
            const ativa = torresSelecionadas.includes(torre);
            return <button key={torre} type="button" onClick={() => alternarTorre(torre)} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${ativa ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'}`}>Torre {torre}</button>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

function CartaoIndicador({ valor, legenda, detalhe, cor = 'blue' }: { valor: string | number; legenda: string; detalhe: string; cor?: 'blue' | 'emerald' | 'slate' }) {
  const ponto = cor === 'emerald' ? 'bg-emerald-600' : cor === 'slate' ? 'bg-slate-400' : 'bg-blue-600';
  return <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">{valor}</p>
    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200"><span className={`h-1.5 w-1.5 ${ponto}`} />{legenda}</p>
    <p className="mt-1 truncate text-xs text-slate-500" title={detalhe}>{detalhe}</p>
  </div>;
}

export default function ProducaoPlanoExpedicao({ user: _user, onNavigate, modo = 'relatorio' }: { user: Profile; onNavigate: (path: string) => void; modo?: ModoPlano }) {
  const toast = useToast();
  const [linhas, setLinhas] = useState<PlanoExpedicaoProducao[]>([]);
  const [semanaRelatorio, setSemanaRelatorio] = useState(39);
  const [torresSelecionadas, setTorresSelecionadas] = useState<number[]>([4, 5]);
  const [semanaDados, setSemanaDados] = useState('todas');
  const [torreDados, setTorreDados] = useState('todas');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true); setErro('');
    try {
      const plano = ordenarPlanoExpedicao(await listarPlanoExpedicao());
      setLinhas(plano);
      if (!plano.some(linha => linha.semana === 39)) setSemanaRelatorio(plano[0]?.semana ?? 39);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o plano de expedição.');
    } finally { setCarregando(false); }
  };

  useEffect(() => { void carregar(); }, []);

  const semanas = useMemo(() => [...new Set(linhas.map(linha => linha.semana))].sort((a, b) => a - b), [linhas]);
  const torresDaSemana = useMemo(() => [...new Set(linhas.filter(linha => linha.semana === semanaRelatorio).map(linha => linha.torre_numero))].sort((a, b) => a - b), [linhas, semanaRelatorio]);
  const relatorio = useMemo(() => linhas.filter(linha => linha.semana === semanaRelatorio && (!torresSelecionadas.length || torresSelecionadas.includes(linha.torre_numero))), [linhas, semanaRelatorio, torresSelecionadas]);
  const resumo = useMemo(() => resumirPlanoExpedicao(relatorio), [relatorio]);
  const porTorre = useMemo(() => {
    const grupos = new Map<number, PlanoExpedicaoProducao[]>();
    relatorio.forEach(linha => grupos.set(linha.torre_numero, [...(grupos.get(linha.torre_numero) ?? []), linha]));
    return [...grupos.entries()];
  }, [relatorio]);
  const previsaoPorData = useMemo(() => {
    const grupos = new Map<string, number>();
    relatorio.forEach(linha => { if (linha.data_expedicao) grupos.set(linha.data_expedicao, (grupos.get(linha.data_expedicao) ?? 0) + 1); });
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [relatorio]);
  const periodo = useMemo(() => {
    const datas = relatorio.flatMap(linha => [linha.data_carregamento, linha.data_expedicao]).filter((data): data is string => Boolean(data)).sort();
    return datas.length ? `${formatarData(datas[0])} a ${formatarData(datas.at(-1) ?? null)}` : 'Período sem datas';
  }, [relatorio]);
  const linhasDados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter(linha => (semanaDados === 'todas' || linha.semana === Number(semanaDados))
      && (torreDados === 'todas' || linha.torre_numero === Number(torreDados))
      && (!termo || [linha.identificador, linha.tramo, linha.torre_numero, linha.observacao].some(valor => String(valor ?? '').toLowerCase().includes(termo))));
  }, [busca, linhas, semanaDados, torreDados]);
  const mesesDados = useMemo(() => {
    const grupos = new Map<string, PlanoExpedicaoProducao[]>();
    linhasDados.forEach(linha => { const mes = nomeMes(linha); grupos.set(mes, [...(grupos.get(mes) ?? []), linha]); });
    return [...grupos.entries()];
  }, [linhasDados]);

  const salvar = async (linha: PlanoExpedicaoProducao, campos: Partial<PlanoExpedicaoProducao>) => {
    if (Object.entries(campos).every(([campo, valor]) => linha[campo as keyof PlanoExpedicaoProducao] === valor)) return;
    setSalvando(linha.id);
    try {
      const atualizada = await atualizarPlanoExpedicao(linha.id, campos);
      setLinhas(atuais => ordenarPlanoExpedicao(atuais.map(item => item.id === atualizada.id ? atualizada : item)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar a alteração.');
    } finally { setSalvando(null); }
  };

  const marcarNfFaturamento = (linha: PlanoExpedicaoProducao, valor: boolean) => void salvar(linha, {
    nf_faturamento_emitida: valor,
    status: valor ? 'faturado' : 'a_faturar',
  });
  const mudarStatus = (linha: PlanoExpedicaoProducao, status: StatusPlanoExpedicao) => void salvar(linha, {
    status,
    nf_faturamento_emitida: status !== 'a_faturar',
    nf_expedicao_emitida: status === 'expedido',
  });

  const tituloTorres = torresSelecionadas.length ? `TORRES ${torresSelecionadas.join(' E ')}` : 'TODAS AS TORRES';

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-12">
    <header className="border-b border-slate-200 pb-4 dark:border-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Truck className="h-5 w-5" /></span>
          <div><h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">Plano de Expedição GW</h1><p className="text-xs text-slate-500 dark:text-slate-400">Programação, faturamento e saída dos tramos.</p></div>
        </div>
        <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />Atualizar</button>
      </div>
      <nav className="mt-4 flex gap-1 border-b border-slate-200 dark:border-slate-800" aria-label="Navegação do plano de expedição">
        <button type="button" onClick={() => onNavigate('/producao/expedicao')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${modo === 'relatorio' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><ClipboardList className="h-4 w-4" />Relatório</button>
        <button type="button" onClick={() => onNavigate('/producao/expedicao/dados')} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${modo === 'dados' ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}><FileText className="h-4 w-4" />Dados</button>
      </nav>
    </header>

    {carregando ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      : erro ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{erro}</p>
        : modo === 'relatorio' ? <>
          <FiltrosRelatorio semanas={semanas} semana={semanaRelatorio} torres={torresDaSemana} torresSelecionadas={torresSelecionadas} onSemana={semana => { setSemanaRelatorio(semana); setTorresSelecionadas([]); }} onTorres={setTorresSelecionadas} />
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoIndicador valor={resumo.total} legenda={`Tramos na W${semanaRelatorio}`} detalhe={`${tituloTorres.replace('TORRES ', 'Torres ')} · ${periodo}`} />
            <CartaoIndicador valor={`${resumo.faturados}/${resumo.total}`} legenda="Faturados" detalhe="Tramos com NF de faturamento emitida" />
            <CartaoIndicador valor={`${resumo.expedidos}/${resumo.total}`} legenda="Expedidos" detalhe="Saídas confirmadas na programação" cor="emerald" />
            <CartaoIndicador valor={resumo.aFaturar} legenda="A faturar" detalhe="Tramos ainda sem NF de faturamento" cor="slate" />
          </section>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_245px]">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">PROGRAMAÇÃO DE EXPEDIÇÃO · W{semanaRelatorio} · {tituloTorres}</h2></div>
              <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/80"><tr><th className="p-3">Torre</th><th className="p-3">Tramo</th><th className="p-3">ID</th><th className="p-3 text-center">NF Fat.</th><th className="p-3 text-center">NF-GW</th><th className="p-3 text-center">NF Exp.</th><th className="p-3">Carregamento</th><th className="p-3">Expedição</th><th className="p-3">Status</th></tr></thead><tbody>{porTorre.map(([torre, itens]) => itens.map((linha, indice) => <tr key={linha.id} className={`border-t border-slate-100 dark:border-slate-800 ${linha.status === 'expedido' ? 'bg-emerald-50/80 dark:bg-emerald-950/20' : linha.status === 'faturado' ? 'bg-blue-50/55 dark:bg-blue-950/15' : ''}`}><td className="p-3 font-bold text-slate-800 dark:text-slate-100">{indice === 0 ? `Torre ${torre}` : ''}</td><td className="p-3 font-semibold">{linha.tramo}</td><td className="p-3">{linha.identificador ?? '—'}</td><td className="p-3"><Marcador marcado={linha.nf_faturamento_emitida} label="NF de faturamento" /></td><td className="p-3"><Marcador marcado={linha.nf_gw_emitida} label="NF GW" /></td><td className="p-3"><Marcador marcado={linha.nf_expedicao_emitida} label="NF de expedição" /></td><td className="p-3">{formatarData(linha.data_carregamento)}</td><td className="p-3 font-semibold">{formatarData(linha.data_expedicao)}</td><td className="p-3"><span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-bold ${STATUS[linha.status].classe}`}>{STATUS[linha.status].label}</span></td></tr>))}</tbody></table></div>
              {!relatorio.length && <p className="p-8 text-center text-sm text-slate-500">Nenhum tramo encontrado para esse filtro.</p>}
            </section>
            <aside className="rounded-xl bg-[#0b70bb] p-5 text-white shadow-sm">
              <p className="text-lg font-bold">EXPEDIÇÃO</p><p className="text-sm font-semibold text-blue-200">SEMANA {semanaRelatorio}</p><div className="my-5 h-1 w-11 bg-orange-400" />
              <div className="space-y-2">{previsaoPorData.map(([data, total]) => <div key={data} className="flex items-center justify-between border-b border-blue-300/45 pb-2 text-sm"><span className="font-bold">{formatarData(data, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span><span className="font-bold">{total}</span></div>)}</div>
              <div className="mt-12 rounded-xl bg-slate-900/35 p-4"><p className="text-[11px] font-bold uppercase text-blue-200">Previsão de expedição semana</p><p className="mt-2 text-4xl font-bold">{resumo.total}<span className="ml-1 text-base">tramos</span></p></div>
            </aside>
          </div>
        </> : <>
          <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Semana</span><select value={semanaDados} onChange={e => setSemanaDados(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="todas">Todas</option>{semanas.map(item => <option key={item} value={item}>W{item}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Torre</span><select value={torreDados} onChange={e => setTorreDados(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="todas">Todas</option>{[...new Set(linhas.map(linha => linha.torre_numero))].sort((a, b) => a - b).map(item => <option key={item} value={item}>Torre {item}</option>)}</select></label>
            <label className="grid min-w-52 flex-1 gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300"><span>Buscar torre, tramo, ID ou observação</span><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Ex.: Torre 4, T3 ou 3195" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
            <p className="pb-2 text-xs text-slate-500">{linhasDados.length} de {linhas.length} tramos</p>
          </section>
          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-[1190px] w-full border-collapse text-left text-xs"><thead className="bg-[#173d6c] text-[10px] font-bold uppercase tracking-wide text-white"><tr><th className="w-8 p-2" aria-label="Mês" /><th className="p-2.5">Week</th><th className="p-2.5">Torre</th><th className="p-2.5">Tramo</th><th className="p-2.5">ID</th><th className="p-2.5 text-center">NF Fat.</th><th className="p-2.5 text-center">NF-GW</th><th className="p-2.5 text-center">NF Exp.</th><th className="p-2.5">Carregamento</th><th className="p-2.5">Expedição</th><th className="p-2.5">Status</th><th className="p-2.5">Observação</th><th className="p-2.5" aria-label="Salvamento" /></tr></thead><tbody>{mesesDados.map(([mes, itens]) => itens.map((linha, indice) => { const bloqueada = salvando === linha.id; const inicioSemana = indice > 0 && itens[indice - 1].semana !== linha.semana; return <tr key={linha.id} className={`border-t border-slate-200 transition-colors hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-950/10 ${inicioSemana ? 'border-t-2 border-t-[#173d6c]' : ''} ${linha.status === 'expedido' ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : inicioSemana || indice % 2 === 0 ? 'bg-slate-50/80 dark:bg-slate-900' : ''}`}>
              {indice === 0 && <td rowSpan={itens.length} className="border-r border-slate-300 bg-slate-100 p-1 text-center align-middle text-[10px] font-bold tracking-wider text-slate-700 [writing-mode:vertical-rl] [transform:rotate(180deg)] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{mes}</td>}
              <td className="p-2.5 font-bold text-[#173d6c] dark:text-blue-300">W{linha.semana}</td><td className="p-2.5 font-semibold">{linha.torre_numero}</td><td className="p-2.5 font-semibold">{linha.tramo}</td>
              <td className="p-1"><input aria-label={`ID da torre ${linha.torre_numero} ${linha.tramo}`} value={linha.identificador ?? ''} onChange={e => setLinhas(atuais => atuais.map(item => item.id === linha.id ? { ...item, identificador: e.target.value ? Number(e.target.value) : null } : item))} onBlur={e => void salvar(linha, { identificador: e.target.value ? Number(e.target.value) : null })} inputMode="numeric" className="w-16 rounded border border-transparent bg-transparent px-1 py-1.5 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-slate-950" /></td>
              <td className="p-2.5"><BotaoNf checked={linha.nf_faturamento_emitida} disabled={bloqueada} label="NF de faturamento emitida: altera o status para Faturado" onChange={valor => marcarNfFaturamento(linha, valor)} /></td><td className="p-2.5"><BotaoNf checked={linha.nf_gw_emitida} disabled={bloqueada} label="NF GW emitida" onChange={valor => void salvar(linha, { nf_gw_emitida: valor })} /></td><td className="p-2.5"><BotaoNf checked={linha.nf_expedicao_emitida} disabled={bloqueada} label="NF de expedição emitida" onChange={valor => void salvar(linha, { nf_expedicao_emitida: valor, status: valor ? 'expedido' : linha.nf_faturamento_emitida ? 'faturado' : 'a_faturar' })} /></td>
              <td className="p-1"><input aria-label={`Data de carregamento da torre ${linha.torre_numero} ${linha.tramo}`} type="date" value={dataParaInput(linha.data_carregamento)} onChange={e => setLinhas(atuais => atuais.map(item => item.id === linha.id ? { ...item, data_carregamento: e.target.value || null } : item))} onBlur={e => void salvar(linha, { data_carregamento: e.target.value || null })} className="rounded border border-transparent bg-transparent px-1 py-1.5 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-slate-950" /></td>
              <td className="p-1"><input aria-label={`Data de expedição da torre ${linha.torre_numero} ${linha.tramo}`} type="date" value={dataParaInput(linha.data_expedicao)} onChange={e => setLinhas(atuais => atuais.map(item => item.id === linha.id ? { ...item, data_expedicao: e.target.value || null } : item))} onBlur={e => void salvar(linha, { data_expedicao: e.target.value || null })} className="rounded border border-transparent bg-transparent px-1 py-1.5 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-slate-950" /></td>
              <td className="p-1"><select aria-label={`Status da torre ${linha.torre_numero} ${linha.tramo}`} value={linha.status} disabled={bloqueada} onChange={e => mudarStatus(linha, e.target.value as StatusPlanoExpedicao)} className={`h-8 rounded-md border border-transparent px-2 text-xs font-bold focus:border-blue-500 focus:outline-none ${STATUS[linha.status].classe}`}><option value="a_faturar">A faturar</option><option value="faturado">Faturado</option><option value="expedido">Expedido</option></select></td>
              <td className="p-1"><input aria-label={`Observação da torre ${linha.torre_numero} ${linha.tramo}`} value={linha.observacao ?? ''} onChange={e => setLinhas(atuais => atuais.map(item => item.id === linha.id ? { ...item, observacao: e.target.value || null } : item))} onBlur={e => void salvar(linha, { observacao: e.target.value || null })} className="w-44 rounded border border-transparent bg-transparent px-1 py-1.5 hover:border-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none dark:focus:bg-slate-950" /></td>
              <td className="p-2 text-slate-400">{bloqueada ? <Save className="h-4 w-4 animate-pulse text-blue-600" /> : <ChevronRight className="h-4 w-4" />}</td>
            </tr>; }))}</tbody></table>
            {!linhasDados.length && <p className="p-8 text-center text-sm text-slate-500">Nenhum tramo encontrado para esse filtro.</p>}
          </section>
        </>}
  </div>;
}

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { dataHojeLocal } from '../../lib/dataLocal';
import { agruparChecklist, desviosPorHora, type DadosObservacao, type ItemObservacao, type RegistroObservacao } from '../../lib/ssmaObservacaoApi';
import { blocoSsma, botaoSsma, campoSsma, rotuloSsma } from './estilosFormulario';
import { BarraEnvio, botaoPrincipal, Contador, Dado, Secao } from './seguranca/PecasSeguranca';
import AvisoRascunho from '../ui/AvisoRascunho';
import { useRascunhoFormulario } from '../../hooks/useRascunhoFormulario';
import { algumTextoPreenchido, apagarRascunho, chaveRascunho } from '../../lib/rascunhoFormulario';

const textos = [
  {chave:'nome', titulo:'Nome do observador', limite:200},
  {chave:'lider_area', titulo:'Líder da área', limite:200},
  {chave:'local', titulo:'Local', limite:300},
  {chave:'turno_letra', titulo:'Turno / letra', limite:100},
] as const;
const numeros = [
  {chave:'duracao_min',titulo:'Duração (min)',min:1},
  {chave:'pessoas_contatadas',titulo:'Contatadas',min:0},
  {chave:'pessoas_observadas',titulo:'Observadas',min:0},
] as const;

function Checklist({itens, marcados, alterar}: {itens: ItemObservacao[]; marcados:number[]; alterar?: (id:number) => void}) {
  return <Secao marca="2" cor="rose" titulo="Checklist de práticas e condições"
    descricao={alterar ? 'Toque nos itens em que viu uma prática ou condição insegura.' : 'Itens marcados = prática ou condição insegura observada.'}
    extra={<Contador tom={marcados.length ? 'alerta' : 'neutro'}>{marcados.length}</Contador>}>
    <div className="space-y-2.5">
      {agruparChecklist(itens).map(([grupo,lista]) => {
        const qtd = lista.filter(i => marcados.includes(i.id)).length;
        return <details key={grupo} open={!alterar && qtd > 0} className="group rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-950/40">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">{grupo}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${qtd ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-400'}`}>{qtd}/{lista.length}</span>
              <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="grid gap-1.5 border-t border-slate-200 p-2 sm:grid-cols-2 dark:border-slate-700">
            {lista.map(i => {
              const marcado = marcados.includes(i.id);
              return <label key={i.id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors ${alterar ? 'cursor-pointer' : ''} ${marcado
                ? 'border-rose-300 bg-rose-50 font-semibold text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100'
                : 'border-transparent bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
                <input type="checkbox" checked={marcado} disabled={!alterar} onChange={() => alterar?.(i.id)} className="h-5 w-5 shrink-0 accent-rose-600"/>
                <span className="min-w-0">{i.descricao}</span>
              </label>;
            })}
          </div>
        </details>;
      })}
    </div>
  </Secao>;
}

export function DetalheObservacao({r,itens}: {r:RegistroObservacao; itens:ItemObservacao[]}) {
  return <div className="space-y-4">
    <Secao marca="1" cor="blue" titulo="Identificação">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {textos.filter(c => c.chave !== 'turno_letra').map(c => <Dado key={c.chave} rotulo={c.titulo} largo>{r[c.chave]}</Dado>)}
        <Dado rotulo="Data">{r.data.split('-').reverse().join('/')}</Dado>
        <Dado rotulo="Turno / letra">{r.turno_letra}</Dado>
        {numeros.map(c => <Dado key={c.chave} rotulo={c.chave === 'duracao_min' ? 'Duração' : 'Pessoas ' + c.titulo.toLowerCase()}>
          {c.chave === 'duracao_min' ? r.duracao_min + ' min' : String(r[c.chave])}</Dado>)}
      </dl>
    </Secao>
    <Checklist itens={itens} marcados={r.itens}/>
    <Secao marca="3" cor="emerald" titulo="Práticas seguras observadas">
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{r.praticas_seguras || 'Sem relato.'}</p>
    </Secao>
    <Secao marca="4" cor="amber" titulo="Práticas inseguras observadas"
      extra={<Contador tom="alerta">{desviosPorHora(r.desvios.length,r.duracao_min).toLocaleString('pt-BR',{maximumFractionDigits:1})}/h</Contador>}>
      {!r.desvios.length && <p className="text-sm text-slate-600 dark:text-slate-400">Nenhum desvio relatado.</p>}
      {r.desvios.map((d,i) => <div key={i} className={blocoSsma}>
        <span className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Desvio {i+1}</span>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">{d}</p>
      </div>)}
    </Secao>
  </div>;
}

type Resultado = {offline: boolean};
type Props = {itens: ItemObservacao[]; nome: string; usuarioId: string; ocupado: boolean;
  /** Grava; devolve `null` se falhou (a tela já mostrou o erro). */
  salvar: (id:string, dados:DadosObservacao) => Promise<Resultado | null>;
  /** Depois de gravar e limpar o rascunho do aparelho. */
  onConcluido: (r: Resultado) => void};
const camposVazios = (nome: string) => ({data:dataHojeLocal(), nome, local:'', turno_letra:'', lider_area:'',
  duracao_min:'', pessoas_contatadas:'', pessoas_observadas:'', praticas_seguras:''});
type Campos = ReturnType<typeof camposVazios>;
type Rascunho = {id:string; campos:Campos; marcados:number[]; desvios:{id:string; texto:string}[]; etapa:1|2};

function Etapas({etapa}: {etapa: 1|2}) {
  return <ol className="grid grid-cols-2 gap-2" aria-label="Etapas do cartão">
    {(['Identificação e checklist', 'Práticas observadas'] as const).map((nome, i) => {
      const n = (i + 1) as 1|2;
      const feita = n < etapa;
      const atual = n === etapa;
      return <li key={nome} aria-current={atual ? 'step' : undefined}
        className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-xs font-bold ${atual
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'}`}>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${atual || feita ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
          {feita ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}
        </span>
        <span className="min-w-0">{nome}</span>
      </li>;
    })}
  </ol>;
}

export default function SsmaObservacaoForm({itens,nome,usuarioId,ocupado,salvar,onConcluido}:Props) {
  const [id,setId] = useState<string>(() => crypto.randomUUID());
  const [campos,setCampos] = useState(() => camposVazios(nome));
  const [marcados,setMarcados] = useState<number[]>([]);
  const [desvios,setDesvios] = useState<{id:string; texto:string}[]>([]);
  const [etapa,setEtapa] = useState<1|2>(1);
  const topo = useRef<HTMLDivElement>(null);
  // O id vai no rascunho: um reenvio depois de a aba cair repete o mesmo cartão.
  const chave = chaveRascunho(usuarioId, 'ssma-oc');
  const dadosRascunho = useMemo<Rascunho>(() => ({id,campos,marcados,desvios,etapa}), [id,campos,marcados,desvios,etapa]);
  const rascunho = useRascunhoFormulario<Rascunho>({
    chave, aberto: true, dados: dadosRascunho,
    temConteudo: d => algumTextoPreenchido(d.campos, ['data','nome']) || d.marcados.length > 0 || d.desvios.length > 0,
    aplicar: d => { setId(d.id); setCampos(c => ({...c, ...d.campos})); setMarcados(d.marcados ?? []); setDesvios(d.desvios ?? []); setEtapa(d.etapa ?? 1); },
  });
  function descartar() {
    rascunho.descartar(); setId(crypto.randomUUID()); setCampos(camposVazios(nome)); setMarcados([]); setDesvios([]); setEtapa(1);
  }
  function mudarEtapa(n:1|2) {
    setEtapa(n);
    requestAnimationFrame(() => { topo.current?.focus({preventScroll:true}); topo.current?.scrollIntoView({block:'start'}); });
  }
  function alterar(campo:keyof typeof campos,valor:string) { setCampos(c => ({...c,[campo]:valor})); }
  async function enviar(evento:FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    if (etapa===1) { mudarEtapa(2); return; }
    const descricoes = desvios.map(d => d.texto.trim());
    const ok = await salvar(id,{...campos,duracao_min:Number(campos.duracao_min),pessoas_contatadas:Number(campos.pessoas_contatadas),
      pessoas_observadas:Number(campos.pessoas_observadas), itens:marcados, desvios:descricoes});
    if (!ok) return;
    rascunho.concluir();
    if (chave) await apagarRascunho(chave);
    onConcluido(ok);
  }
  const relatados = desvios.filter(d => d.texto.trim()).length;
  const porHora = desviosPorHora(relatados, Number(campos.duracao_min) || 0);

  return <form onSubmit={enviar} className="space-y-4">
    <AvisoRascunho salvoEm={rascunho.recuperadoEm} onDescartar={descartar} />
    <div ref={topo} tabIndex={-1} className="scroll-mt-24 outline-none"><Etapas etapa={etapa} /></div>
    <fieldset disabled={ocupado} className="min-w-0 space-y-4">
      {etapa===1 ? <>
        <Secao marca="1" cor="blue" titulo="Identificação" descricao="Referência do cartão: pelo menos 30 minutos de observação.">
          <div className="grid gap-4 sm:grid-cols-2">
            {textos.map(c => <label key={c.chave} className={rotuloSsma}>{c.titulo}<input required pattern=".*\S.*" maxLength={c.limite}
              className={campoSsma} value={campos[c.chave]} onChange={e => alterar(c.chave,e.target.value)}/></label>)}
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-dashed border-slate-200 pt-4 sm:grid-cols-4 dark:border-slate-700">
            <label className={rotuloSsma + ' col-span-2 sm:col-span-1'}>Data<input className={campoSsma} type="date" required value={campos.data} onChange={e => alterar('data',e.target.value)}/></label>
            {numeros.map(c => <label key={c.chave} className={rotuloSsma + (c.chave === 'duracao_min' ? ' col-span-2 sm:col-span-1' : '')}>{c.titulo}
              <input className={campoSsma} required type="number" min={c.min} max={2147483647} step={1} inputMode="numeric"
                value={campos[c.chave]} onChange={e => alterar(c.chave,e.target.value)}/></label>)}
          </div>
        </Secao>
        <Checklist itens={itens} marcados={marcados} alterar={id => setMarcados(ids => ids.includes(id) ? ids.filter(i => i!==id) : [...ids,id])}/>
      </> : <>
        <Secao marca="3" cor="emerald" titulo="Práticas seguras observadas" descricao="O que a equipe fez certo. Opcional.">
          <label className="sr-only" htmlFor="oc-praticas-seguras">Práticas seguras observadas</label>
          <textarea id="oc-praticas-seguras" className={campoSsma} rows={4} maxLength={8000}
            value={campos.praticas_seguras} onChange={e => alterar('praticas_seguras',e.target.value)}/>
        </Secao>
        <Secao marca="4" cor="amber" titulo="Práticas inseguras observadas" descricao="Um desvio por campo. Referência: seis desvios por hora."
          extra={<Contador tom={relatados ? 'alerta' : 'neutro'}>{porHora.toLocaleString('pt-BR',{maximumFractionDigits:1})}/h</Contador>}>
          {desvios.map((d,i) => <div className={blocoSsma} key={d.id}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300" htmlFor={d.id}>Desvio {i+1}</label>
              <button type="button" aria-label={'Remover desvio '+(i+1)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                onClick={() => setDesvios(ds => ds.filter(item => item.id!==d.id))}><Trash2 size={18}/></button>
            </div>
            <textarea id={d.id} required autoFocus className={campoSsma} rows={2} maxLength={4000} value={d.texto}
              onChange={e => { const texto=e.target.value; e.target.setCustomValidity(texto.trim() ? '' : 'Descreva o desvio ou remova este campo.');
                setDesvios(ds => ds.map(item => item.id===d.id ? {...item,texto} : item)); }}/>
          </div>)}
          <button className={botaoSsma + ' w-full border-dashed sm:w-auto'} type="button" onClick={() => setDesvios(ds => [...ds,{id:crypto.randomUUID(),texto:''}])}><Plus size={16}/>Adicionar desvio</button>
        </Secao>
      </>}
      <BarraEnvio resumo={etapa===1
        ? <>{marcados.length} {marcados.length===1 ? 'item marcado' : 'itens marcados'}</>
        : <><b className="block text-sm text-slate-900 dark:text-slate-100">{relatados} desvio(s)</b>{marcados.length} marcados</>}>
        {etapa===2 && <button type="button" className={botaoSsma + ' min-h-12'} onClick={() => mudarEtapa(1)} aria-label="Voltar ao checklist"><ArrowLeft size={16}/><span className="hidden sm:inline">Checklist</span></button>}
        <button type="submit" className={botaoPrincipal}>
          {etapa===1 ? <>Continuar<ArrowRight size={16}/></> : ocupado ? 'Salvando…' : 'Registrar'}</button>
      </BarraEnvio>
    </fieldset>
  </form>;
}

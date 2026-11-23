import { ArrowLeft, ArrowRight, ClipboardPlus, Minus, Plus } from 'lucide-react';
import { GRUPOS_ISP, type ItemIsp } from '../../lib/ssmaIspApi';
import { useTelaEstreita } from '../../lib/useTelaEstreita';
import { campoBaseSsma, campoSsma as campoIsp, botaoSsma as botaoIsp, cartaoSsma as cartaoIsp } from './estilosFormulario';
import { Contador, Secao } from './seguranca/PecasSeguranca';

export { campoIsp, botaoIsp, cartaoIsp };

type Props = {
  itens: ItemIsp[];
  indice: number;
  selecionar: (indice: number) => void;
  respostas: Record<string, string>;
  alterar: (codigo: string, valor: string) => void;
  zerarEmBranco: (itens: ItemIsp[]) => void;
  adicionarAcao: (item: string) => void;
  ver: boolean;
  ocupado: boolean;
  pendencia: string;
};

const NOME_GRUPO: Record<string, string> = { G: 'Graves', M: 'Moderados', L: 'Leves' };

export function quantidadeIspValida(valor: string | undefined) {
  return Boolean(valor?.trim()) && Number.isInteger(Number(valor)) && Number(valor) >= 0;
}

/** Em branco (cinza), sem irregularidade (verde) ou com irregularidade (âmbar). */
function situacao(valor: string | undefined) {
  if (!quantidadeIspValida(valor)) return 'vazio';
  return Number(valor) > 0 ? 'irregular' : 'ok';
}

const FUNDO_ITEM = {
  vazio: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  ok: 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20',
  irregular: 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25',
};

export default function SsmaIspVerificacoes({ itens, indice, selecionar, respostas, alterar, zerarEmBranco, adicionarAcao, ver, ocupado, pendencia }: Props) {
  // Preenchendo no celular: um item por vez. Lendo (detalhe): o grupo inteiro.
  const celular = useTelaEstreita() && !ver;
  const atual = itens[indice];
  if (!atual) return null;
  const grupo = atual.codigo[0];
  const doGrupo = itens.filter(item => item.codigo.startsWith(grupo));
  const preenchidos = itens.filter(item => quantidadeIspValida(respostas[item.codigo])).length;
  const emBranco = doGrupo.filter(item => !respostas[item.codigo]?.trim());
  const numero = Number(respostas[atual.codigo] || 0);
  const ultimo = indice === itens.length - 1;
  const posicaoNoGrupo = doGrupo.findIndex(i => i.codigo === atual.codigo);

  function avancar() {
    if (ultimo) document.getElementById('isp-acoes')?.querySelector<HTMLElement>('h2')?.focus();
    else selecionar(indice + 1);
  }

  return <Secao id="isp-verificacoes" marca="2" cor="emerald" titulo="Itens de verificação"
    descricao={ver ? undefined : 'Informe o nº de irregularidades de cada item. Zero quando estiver tudo certo.'}
    extra={<Contador tom={preenchidos === itens.length ? 'ok' : 'neutro'}>{preenchidos}/{itens.length}</Contador>}>
    <div role="progressbar" aria-label="Progresso das verificações" aria-valuemin={0} aria-valuemax={itens.length} aria-valuenow={preenchidos}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${(preenchidos / Math.max(1, itens.length)) * 100}%` }} />
    </div>
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Grupos de verificação">
      {GRUPOS_ISP.map(g => {
        const lista = itens.filter(i => i.codigo.startsWith(g));
        const feitos = lista.filter(i => quantidadeIspValida(respostas[i.codigo])).length;
        const ativo = g === grupo;
        return <button key={g} type="button" aria-pressed={ativo} disabled={ocupado}
          onClick={() => selecionar(itens.findIndex(i => i.codigo.startsWith(g)))}
          className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-sm font-bold transition-colors ${ativo
            ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-950 dark:text-emerald-300'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}>
          <span>Grupo {g}</span>
          <span className="text-[11px] font-semibold tabular-nums opacity-80">{NOME_GRUPO[g]} · {feitos}/{lista.length}</span>
        </button>;
      })}
    </div>
    {pendencia && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      Informe a quantidade em {pendencia}. Use zero quando não houver irregularidades.</p>}
    <div className="space-y-2.5">
      {(celular ? [atual] : doGrupo).map(item => {
        const s = situacao(respostas[item.codigo]);
        return <div key={item.codigo} className={`grid min-w-0 gap-3 rounded-2xl border p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${FUNDO_ITEM[s]} ${pendencia === item.codigo ? 'ring-2 ring-amber-400' : ''}`}>
          <div aria-live={celular ? 'polite' : undefined} className="min-w-0">
            {celular ? <select aria-label="Ir para item do grupo" value={atual.codigo} disabled={ocupado}
              className="min-h-11 max-w-full rounded-lg border border-emerald-200 bg-white px-2 text-sm font-bold text-emerald-800 dark:border-emerald-800 dark:bg-slate-950 dark:text-emerald-200"
              onChange={e => selecionar(itens.findIndex(i => i.codigo === e.target.value))}>
              {doGrupo.map((opcao, posicao) => <option key={opcao.codigo} value={opcao.codigo}>
                {opcao.codigo} · {posicao + 1} de {doGrupo.length}
              </option>)}
            </select> : <span className="inline-flex rounded-md bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-emerald-800 ring-1 ring-emerald-200 dark:bg-slate-950 dark:text-emerald-300 dark:ring-emerald-900">{item.codigo}</span>}
            <p id={'isp-texto-' + item.ordem} className="mt-1.5 text-sm leading-relaxed text-slate-800 sm:text-[15px] dark:text-slate-200">{item.descricao}</p>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <label htmlFor={'isp-qtd-' + item.ordem} className="text-xs font-bold text-slate-600 dark:text-slate-400">Irregularidades</label>
            <div className="ml-auto flex items-center gap-1.5 sm:ml-0">
              {celular && !ver && <button type="button" className={botaoIsp + ' min-w-12'} disabled={ocupado || numero < 1}
                aria-label="Diminuir quantidade" onClick={() => alterar(item.codigo, String(Math.max(0, Math.floor(numero) - 1)))}><Minus size={18}/></button>}
              <input id={'isp-qtd-' + item.ordem} aria-label={'Nº de irregularidades em ' + item.codigo} aria-describedby={'isp-texto-' + item.ordem}
                type="number" min="0" step="1" inputMode="numeric" placeholder="—" disabled={ocupado || ver}
                className={campoBaseSsma + ' w-20 text-center text-lg font-bold tabular-nums'} value={respostas[item.codigo] ?? ''} onChange={e => alterar(item.codigo, e.target.value)} />
              {celular && !ver && <button type="button" className={botaoIsp + ' min-w-12'} disabled={ocupado}
                aria-label="Aumentar quantidade" onClick={() => alterar(item.codigo, String(Math.max(0, Math.floor(numero)) + 1))}><Plus size={18}/></button>}
            </div>
          </div>
          {!ver && s === 'irregular' && <button type="button" disabled={ocupado} onClick={() => adicionarAcao(item.codigo)}
            className={botaoIsp + ' justify-self-start border-amber-300 text-amber-900 sm:col-span-2 dark:border-amber-800 dark:text-amber-200'}><ClipboardPlus size={16}/>Adicionar ação para {item.codigo}</button>}
        </div>;
      })}
    </div>
    {celular && <div className="flex items-stretch gap-2">
      <button type="button" className={botaoIsp + ' min-h-12'} disabled={ocupado || indice === 0} onClick={() => selecionar(indice - 1)}
        aria-label="Item anterior"><ArrowLeft size={18}/></button>
      {!ver && !respostas[atual.codigo]?.trim() ?
        <button type="button" disabled={ocupado} className="alvo-livre min-h-12 flex-1 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white"
          onClick={() => { alterar(atual.codigo, '0'); avancar(); }}>Sem irregularidade · avançar</button> :
        <button type="button" className={botaoIsp + ' min-h-12 flex-1'} disabled={ocupado} onClick={avancar}>{ultimo ? 'Ir para ações' : 'Próximo item'}<ArrowRight size={16}/></button>}
      <span className="flex min-w-12 items-center justify-center text-xs font-bold tabular-nums text-slate-500">{posicaoNoGrupo + 1}/{doGrupo.length}</span>
    </div>}
    {!ver && emBranco.length > 0 && <button type="button" className={botaoIsp + ' w-full border-dashed sm:w-auto'} disabled={ocupado}
      onClick={() => zerarEmBranco(emBranco)}>Zero nos itens em branco do grupo {grupo} ({emBranco.length})</button>}
  </Secao>;
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import type { Profile } from '../../types';
import { dataHojeLocal } from '../../lib/dataLocal';
import { assinarFotosIsp, erroIsp, registrarIsp, type AcaoIsp, type FotoIsp, type ItemIsp, type RegistroIsp } from '../../lib/ssmaIspApi';
import { useRascunhoFormulario } from '../../hooks/useRascunhoFormulario';
import { algumTextoPreenchido, apagarRascunho, chaveRascunho } from '../../lib/rascunhoFormulario';
import AvisoRascunho from '../ui/AvisoRascunho';
import BotoesCameraGaleria from '../ui/BotoesCameraGaleria';
import { useLightbox } from '../ui/Lightbox';
import { BarraEnvio, botaoPrincipal, Contador, Secao } from './seguranca/PecasSeguranca';
import { blocoSsma, rotuloSsma } from './estilosFormulario';
import SsmaIspVerificacoes, { campoIsp, botaoIsp, quantidadeIspValida } from './SsmaIspVerificacoes';

const MAX_FOTOS = 10;
const horaAgora = () => new Date().toTimeString().slice(0, 5);

function FotoLocal({ foto, abrir, remover, desabilitado }: { foto: FotoIsp; abrir: (url: string) => void; remover: () => void; desabilitado: boolean }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const local = URL.createObjectURL(foto.arquivo);
    setUrl(local);
    return () => URL.revokeObjectURL(local);
  }, [foto]);
  return <div className="relative h-16 w-16">
    <button type="button" onClick={() => abrir(url)} className="h-full w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700" aria-label="Ver foto">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
    <button type="button" onClick={remover} disabled={desabilitado} aria-label="Remover foto"
      className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white shadow ring-2 ring-white dark:ring-slate-900">
      <X className="h-4 w-4" aria-hidden="true" />
    </button>
  </div>;
}

type Cabecalho = {
  data: string; area: string; inicio: string; responsavel_area: string; inspetor: string; tst: string;
  duracao_min: string; inspecionados: string; hhi: string; comentarios: string;
};
type AcaoEdicao = Omit<AcaoIsp, 'quantidade'> & { chave: string; quantidade: string };
type Rascunho = { id: string; cab: Cabecalho; respostas: Record<string, string>; acoes: AcaoEdicao[]; fotos: FotoIsp[] };

export default function SsmaIspForm({ user, itens, registro, onSalvo }: {
  user: Profile; itens: ItemIsp[]; registro?: RegistroIsp; onSalvo: (resultado: { offline: boolean }) => void;
}) {
  const ver = Boolean(registro);
  const [id, setId] = useState(() => registro?.id ?? crypto.randomUUID());
  const [cab, setCab] = useState<Cabecalho>(() => ({
    data: registro?.data ?? dataHojeLocal(), area: registro?.area ?? '', inicio: registro?.inicio.slice(0,5) ?? horaAgora(),
    responsavel_area: registro?.responsavel_area ?? '', inspetor: registro?.inspetor ?? user.name,
    tst: registro?.tst ?? '', duracao_min: String(registro?.duracao_min ?? ''),
    inspecionados: String(registro?.inspecionados ?? ''), hhi: String(registro?.hhi ?? ''), comentarios: registro?.comentarios ?? '',
  }));
  const [respostas, setRespostas] = useState<Record<string,string>>(() =>
    Object.fromEntries(Object.entries(registro?.respostas ?? {}).map(([k,v]) => [k,String(v)])));
  const [acoes, setAcoes] = useState<AcaoEdicao[]>(() => (registro?.acoes ?? []).map(a => ({ ...a, chave: crypto.randomUUID(), quantidade: String(a.quantidade) })));
  const [fotos, setFotos] = useState<FotoIsp[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [indiceItem, setIndiceItem] = useState(0);
  const [pendencia, setPendencia] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false);
  const [erro, setErro] = useState('');
  const lightbox = useLightbox();

  // Rascunho no aparelho: a câmera do Android ou a troca de app derrubam a aba
  // no meio das 43 verificações. O id vai junto: um reenvio depois da queda
  // repete o mesmo registro em vez de criar outro.
  const chave = ver ? null : chaveRascunho(user.id, 'ssma-isp');
  const dadosRascunho = useMemo<Rascunho>(() => ({ id, cab, respostas, acoes, fotos }), [id, cab, respostas, acoes, fotos]);
  const rascunho = useRascunhoFormulario<Rascunho>({
    chave, aberto: true, dados: dadosRascunho,
    temConteudo: d => algumTextoPreenchido(d.cab, ['data', 'inicio', 'inspetor']) || Object.keys(d.respostas).length > 0 || d.acoes.length > 0 || d.fotos.length > 0,
    aplicar: d => {
      setId(d.id); setCab(c => ({ ...c, ...d.cab })); setRespostas(d.respostas ?? {});
      setAcoes(d.acoes ?? []); setFotos(d.fotos ?? []);
      const primeiroVazio = itens.findIndex(i => !quantidadeIspValida(d.respostas?.[i.codigo]));
      if (primeiroVazio > 0) setIndiceItem(primeiroVazio);
    },
  });

  useEffect(() => {
    if (!registro?.fotos.length) return;
    let ativo = true;
    assinarFotosIsp(registro.fotos).then(lista => { if (ativo) setUrls(lista); }).catch(e => { if (ativo) setErro(erroIsp(e)); });
    return () => { ativo = false; };
  }, [registro]);

  function irAoItem(codigo: string) {
    const indice = itens.findIndex(item => item.codigo === codigo);
    if (indice < 0) return;
    setIndiceItem(indice);
    requestAnimationFrame(() => {
      const campo = document.getElementById('isp-qtd-' + itens[indice].ordem);
      campo?.scrollIntoView({ block: 'center' });
      campo?.focus({ preventScroll: true });
    });
  }

  function adicionarAcao(item = '') {
    const chaveAcao = crypto.randomUUID();
    const quantidade = quantidadeIspValida(respostas[item]) && Number(respostas[item]) > 0 ? respostas[item] : '1';
    setAcoes(lista => [...lista, { chave: chaveAcao, item, quantidade, descricao: '', responsavel: '', prazo: '', rnc: '' }]);
    requestAnimationFrame(() => document.getElementById((item ? 'isp-acao-' : 'isp-acao-item-') + chaveAcao)?.focus());
  }

  function campo(nome: keyof Cabecalho, titulo: string, tipo = 'text', minimo?: number) {
    return <label className={rotuloSsma}>{titulo}{nome === 'hhi' && <span className="font-normal text-slate-500"> (opcional)</span>}
      <input className={campoIsp} type={tipo} value={cab[nome]} min={minimo} inputMode={tipo === 'number' ? (nome === 'hhi' ? 'decimal' : 'numeric') : undefined} step={nome === 'hhi' ? 'any' : undefined}
        required={nome !== 'hhi'} onChange={e => setCab({ ...cab, [nome]: e.target.value })} /></label>;
  }
  function alterarAcao(indice: number, nome: keyof AcaoIsp, valor: string) {
    setAcoes(atuais => atuais.map((acao, i) => i === indice ? { ...acao, [nome]: valor } : acao));
  }
  function incluirFotos(lista: FileList | null) {
    const novas = Array.from(lista ?? []).filter(f => f.type.startsWith('image/'));
    setFotos(atuais => {
      const juntas = [...atuais, ...novas.map(arquivo => ({ id: crypto.randomUUID(), arquivo }))];
      if (juntas.length > MAX_FOTOS) setErro(`Até ${MAX_FOTOS} fotos por inspeção. As excedentes ficaram de fora.`);
      return juntas.slice(0, MAX_FOTOS);
    });
  }
  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (ver || enviando.current) return;
    const faltante = itens.find(i => !quantidadeIspValida(respostas[i.codigo]));
    if (faltante) {
      setPendencia(faltante.codigo);
      irAoItem(faltante.codigo);
      return;
    }
    enviando.current = true;
    setOcupado(true);
    setErro('');
    try {
      const resultado = await registrarIsp(id, user.id, { ...cab, duracao_min: Number(cab.duracao_min), inspecionados: Number(cab.inspecionados),
        hhi: cab.hhi === '' ? null : Number(cab.hhi),
        respostas: Object.fromEntries(itens.map(i => [i.codigo, Number(respostas[i.codigo])])),
        acoes: acoes.map(({ chave: _chave, quantidade, ...acao }) => ({ ...acao, quantidade: Number(quantidade) })),
      }, fotos);
      rascunho.concluir();
      if (chave) await apagarRascunho(chave);
      onSalvo(resultado);
    } catch (e) { setErro(erroIsp(e)); } finally { enviando.current = false; setOcupado(false); }
  }
  const preenchidos = itens.filter(i => quantidadeIspValida(respostas[i.codigo])).length;
  const totalIrregularidades = itens.reduce((s, i) => s + (Number(respostas[i.codigo]) || 0), 0);

  return <form onSubmit={salvar} className="space-y-4">
    {!ver && <AvisoRascunho salvoEm={rascunho.recuperadoEm} onDescartar={() => {
      rascunho.descartar();
      setId(crypto.randomUUID());
      setCab({ data: dataHojeLocal(), area: '', inicio: horaAgora(), responsavel_area: '', inspetor: user.name, tst: '', duracao_min: '', inspecionados: '', hhi: '', comentarios: '' });
      setRespostas({}); setAcoes([]); setFotos([]); setIndiceItem(0); setPendencia('');
    }} />}
    <Secao marca="1" cor="blue" titulo="Dados da inspeção" descricao={ver ? undefined : 'Onde, quando e quem acompanhou.'} disabled={ver || ocupado}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {campo('area','Área inspecionada')}{campo('responsavel_area','Responsável pela área')}{campo('tst','TST da área')}
        {campo('inspetor','Responsável pela inspeção')}
        <div className="grid grid-cols-2 gap-3 sm:contents">{campo('data','Data','date')}{campo('inicio','Início','time')}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
        {campo('duracao_min','Tempo (min)','number',1)}{campo('inspecionados','Inspecionados','number',0)}{campo('hhi','HHI','number',0)}
      </div>
      <label className={rotuloSsma}>Comentários sobre a inspeção
        <textarea rows={3} className={campoIsp} value={cab.comentarios} onChange={e => setCab({ ...cab, comentarios: e.target.value })} /></label>
    </Secao>
    <SsmaIspVerificacoes itens={itens} indice={indiceItem} selecionar={setIndiceItem} respostas={respostas}
      ver={ver} ocupado={ocupado} pendencia={pendencia} adicionarAcao={adicionarAcao}
      alterar={(codigo, valor) => {
        setRespostas(anteriores => ({ ...anteriores, [codigo]: valor }));
        if (codigo === pendencia && quantidadeIspValida(valor)) setPendencia('');
      }}
      zerarEmBranco={emBranco => {
        setRespostas(anteriores => ({ ...anteriores, ...Object.fromEntries(emBranco.map(i => [i.codigo, '0'])) }));
        if (emBranco.some(i => i.codigo === pendencia)) setPendencia('');
      }} />
    <Secao id="isp-acoes" marca="3" cor="amber" titulo="Ações de correção" disabled={ocupado || ver}
      descricao={ver ? undefined : 'Uma ação para cada irregularidade que precisa de tratamento.'}
      extra={<Contador tom={acoes.length ? 'alerta' : 'neutro'}>{acoes.length}</Contador>}>
      {acoes.map((a,i) => <div key={a.chave} className={blocoSsma}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Ação {i + 1}{a.item && ' · ' + a.item}</span>
          {!ver && <button type="button" aria-label={'Remover ação ' + (i + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
            onClick={() => setAcoes(acoes.filter(l => l.chave !== a.chave))}><Trash2 size={18} /></button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={rotuloSsma + ' sm:col-span-3'}>Item<select id={'isp-acao-item-' + a.chave} className={campoIsp} required value={a.item} onChange={e => alterarAcao(i,'item',e.target.value)}>
            <option value="">Selecione</option>{itens.map(it => <option key={it.codigo} value={it.codigo}>{it.codigo} · {it.descricao}</option>)}</select></label>
          <label className={rotuloSsma + ' sm:col-span-3'}>Ação de correção<textarea id={'isp-acao-' + a.chave} rows={2} className={campoIsp} required value={a.descricao} onChange={e => alterarAcao(i,'descricao',e.target.value)} /></label>
          <label className={rotuloSsma}>Responsável<input className={campoIsp} required value={a.responsavel} onChange={e => alterarAcao(i,'responsavel',e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <label className={rotuloSsma}>Quantidade<input className={campoIsp} required min="1" type="number" inputMode="numeric" value={a.quantidade} onChange={e => alterarAcao(i,'quantidade',e.target.value)} /></label>
            <label className={rotuloSsma}>Prazo<input className={campoIsp} type="date" required min={ver ? undefined : cab.data} value={a.prazo} onChange={e => alterarAcao(i,'prazo',e.target.value)} /></label>
          </div>
          <label className={rotuloSsma}>RNC <span className="font-normal text-slate-500">(se aberta)</span><input className={campoIsp} value={a.rnc ?? ''} onChange={e => alterarAcao(i,'rnc',e.target.value)} /></label>
        </div>
        {!ver && a.item && <button type="button" className={botaoIsp} onClick={() => irAoItem(a.item)}><ArrowLeft size={16}/>Ver item {a.item}</button>}
      </div>)}
      {!ver && <button type="button" className={botaoIsp + ' w-full border-dashed sm:w-auto'} onClick={() => adicionarAcao()}><Plus size={16}/>Adicionar ação</button>}
      {ver && !acoes.length && <p className="text-sm text-slate-600 dark:text-slate-400">Nenhuma ação registrada.</p>}
    </Secao>
    <Secao marca="4" cor="violet" titulo="Registro fotográfico" descricao={ver ? undefined : 'As fotos são reduzidas antes de subir.'}
      extra={<Contador>{ver ? registro?.fotos.length ?? 0 : `${fotos.length}/${MAX_FOTOS}`}</Contador>}>
      <div className="flex flex-wrap gap-3">
        {!ver && <BotoesCameraGaleria onArquivos={incluirFotos} disabled={ocupado || fotos.length >= MAX_FOTOS} acceptGaleria="image/jpeg,image/png,image/webp" />}
        {fotos.map(f => <FotoLocal key={f.id} foto={f} desabilitado={ocupado}
          abrir={url => lightbox.abrir([url])} remover={() => setFotos(fotos.filter(o => o.id !== f.id))} />)}
        {urls.map((url,i) => <button type="button" key={url} onClick={() => lightbox.abrir(urls, i)}
          className="h-24 w-32 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" aria-label={'Ver foto ' + (i+1)}>
          <img className="h-full w-full object-cover" src={url} alt={'Foto da inspeção ' + (i+1)} /></button>)}
        {ver && !registro?.fotos.length && <p className="text-sm text-slate-600 dark:text-slate-400">Nenhuma foto registrada.</p>}
        {ver && !!registro?.fotos.length && !urls.length && <p className="text-sm text-slate-500">Carregando fotos…</p>}
      </div>
    </Secao>
    {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">{erro}</p>}
    {!ver && <BarraEnvio resumo={<><b className="block text-sm tabular-nums text-slate-900 dark:text-slate-100">{preenchidos}/{itens.length} itens</b>{totalIrregularidades} irregularidade(s)<span className="hidden sm:inline"> · {fotos.length} foto(s)</span></>}>
      <button type="submit" disabled={ocupado} className={botaoPrincipal}>{ocupado ? 'Registrando…' : 'Registrar inspeção'}</button>
    </BarraEnvio>}
    {lightbox.elemento}
  </form>;
}

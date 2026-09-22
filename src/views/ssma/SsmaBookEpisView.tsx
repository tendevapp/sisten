import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronLeft,
  ClipboardList,
  FileSpreadsheet,
  History,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Table2,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { buscarMateriais, type MaterialResultado } from '../../lib/materiais';
import { deduplicarVariantesBookEpis, parseBookEpisWorkbook, type FotoBookEpi } from '../../lib/bookEpisImportacao';
import {
  agruparBookEpis,
  importarBookEpis,
  listarBookEpis,
  listarHistoricoBookEpi,
  mensagemErroBookEpis,
  salvarBookEpi,
  urlFotoBookEpi,
  type SalvarBookEpi,
  type SsmaBookEpi,
  type SsmaBookEpiHistorico,
} from '../../lib/ssmaBookEpisApi';

interface Props {
  onBack: () => void;
}

const VAZIO: SalvarBookEpi = {
  categoria: '', grupo_epi: '', descricao_epi: '', indicacao: null, ca: '', validade: null,
  fabricante: null, tamanho: null, codigo_sap: null, descricao_sap: null, ativo: true,
};

function fotoDoArquivo(arquivo: File): FotoBookEpi {
  return { blob: arquivo, mimeType: arquivo.type || 'image/jpeg', nome: arquivo.name };
}

function FotoEpi({ item }: { item: SsmaBookEpi }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    urlFotoBookEpi(item.imagem_path)
      .then(resultado => { if (ativo) setUrl(resultado); })
      .catch(() => { if (ativo) setUrl(null); });
    return () => { ativo = false; };
  }, [item.imagem_path]);

  return url ? <img src={url} alt={item.descricao_epi} className="h-full w-full object-contain" /> : (
    <ImageIcon className="h-7 w-7 text-slate-300 dark:text-slate-600" aria-label="EPI sem imagem" />
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
      <span>{label}</span>{children}
    </label>
  );
}

export default function SsmaBookEpisView({ onBack }: Props) {
  const toast = useToast();
  const inputImportacao = useRef<HTMLInputElement>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<SsmaBookEpi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [termo, setTermo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modoExibicao, setModoExibicao] = useState<'cards' | 'tabela'>('cards');
  const [editando, setEditando] = useState<SalvarBookEpi | null>(null);
  const [historico, setHistorico] = useState<SsmaBookEpiHistorico[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [buscaSap, setBuscaSap] = useState<MaterialResultado[]>([]);
  const [buscandoSap, setBuscandoSap] = useState(false);

  const carregar = async () => {
    setCarregando(true);
    try {
      setItens(await listarBookEpis(mostrarInativos));
    } catch (erro) {
      toast.error(mensagemErroBookEpis(erro));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); }, [mostrarInativos]); // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = useMemo(() => [...new Set(itens.map(item => item.categoria))].sort(), [itens]);
  const grupos = useMemo(() => agruparBookEpis(itens.filter(item => {
    const busca = `${item.grupo_epi} ${item.descricao_epi} ${item.descricao_sap || ''} ${item.codigo_sap || ''} ${item.ca}`.toLocaleLowerCase('pt-BR');
    return (!categoria || item.categoria === categoria) && (!termo || busca.includes(termo.toLocaleLowerCase('pt-BR')));
  })), [itens, categoria, termo]);
  const variantesFiltradas = useMemo(() => grupos.flatMap(grupo => grupo.itens), [grupos]);

  const abrirEdicao = async (item?: SsmaBookEpi) => {
    setBuscaSap([]);
    if (!item) {
      setHistorico([]);
      setEditando({ ...VAZIO });
      return;
    }
    setEditando({ ...item, foto: null });
    try {
      setHistorico(await listarHistoricoBookEpi(item.id));
    } catch (erro) {
      setHistorico([]);
      toast.error(mensagemErroBookEpis(erro));
    }
  };

  const atualizar = <K extends keyof SalvarBookEpi>(chave: K, valor: SalvarBookEpi[K]) => {
    setEditando(atual => atual ? { ...atual, [chave]: valor } : atual);
  };

  const pesquisarSap = async () => {
    if (!editando) return;
    const consulta = editando.descricao_sap || editando.descricao_epi;
    if (consulta.trim().length < 3) {
      toast.info('Informe ao menos três caracteres da descrição para consultar o catálogo SAP.');
      return;
    }
    setBuscandoSap(true);
    try {
      setBuscaSap(await buscarMateriais(consulta, { limite: 8 }));
    } catch {
      toast.error('Não foi possível consultar o catálogo SAP.');
    } finally {
      setBuscandoSap(false);
    }
  };

  const salvar = async () => {
    if (!editando) return;
    if (!editando.categoria || !editando.grupo_epi || !editando.descricao_epi || !editando.ca) {
      toast.error('Categoria, grupo, descrição do EPI e CA são obrigatórios.');
      return;
    }
    if (!editando.codigo_sap) {
      toast.error('Vincule a variante ao código do catálogo SAP antes de salvar.');
      return;
    }
    setSalvando(true);
    try {
      await salvarBookEpi(editando);
      toast.success('EPI salvo. A alteração foi registrada no histórico.');
      setEditando(null);
      await carregar();
    } catch (erro) {
      toast.error(mensagemErroBookEpis(erro));
    } finally {
      setSalvando(false);
    }
  };

  const importar = async (event: ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    if (!/\.xlsx$/i.test(arquivo.name)) {
      toast.error('Selecione o arquivo XLSX do Book de EPIs.');
      return;
    }
    setImportando(true);
    try {
      const variantes = deduplicarVariantesBookEpis(await parseBookEpisWorkbook(await arquivo.arrayBuffer()));
      if (!variantes.length) throw new Error('Nenhuma variante de EPI foi encontrada na planilha.');
      const resultado = await importarBookEpis(variantes);
      toast.success(`${resultado.importados} variantes importadas. Fotos e alterações foram registradas.`);
      await carregar();
    } catch (erro) {
      toast.error(mensagemErroBookEpis(erro));
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400">
        <ChevronLeft className="h-4 w-4" /> Voltar ao SSMA
      </button>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-500/25"><BookOpen className="h-6 w-6" /></span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">Book de EPIs</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Cadastro mestre de EPIs da TEN. As variantes de tamanho, código SAP e CA permanecem individuais e a foto fica disponível também na Nova Solicitação de Compras.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={inputImportacao} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={importar} />
          <button type="button" disabled={importando} onClick={() => inputImportacao.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Importar XLSX
          </button>
          <button type="button" onClick={() => abrirEdicao()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700"><Plus className="h-4 w-4" /> Novo EPI</button>
        </div>
      </header>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700"><Search className="h-4 w-4 text-slate-400" /><input value={termo} onChange={e => setTermo(e.target.value)} placeholder="Buscar EPI, CA, tamanho, SAP..." className="w-full bg-transparent py-2.5 text-sm outline-none" /></label>
          <select value={categoria} onChange={e => setCategoria(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Todas as categorias</option>{categorias.map(valor => <option key={valor}>{valor}</option>)}</select>
          <label className="flex items-center gap-2 px-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} /> Mostrar inativos</label>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400"><span className="font-bold text-slate-700 dark:text-slate-200">{variantesFiltradas.length}</span> variantes em <span className="font-bold text-slate-700 dark:text-slate-200">{grupos.length}</span> grupos. Clique em uma variante para abrir os detalhes.</p>
          <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" aria-label="Formato de exibição">
            <button type="button" onClick={() => setModoExibicao('cards')} aria-pressed={modoExibicao === 'cards'} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${modoExibicao === 'cards' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}><LayoutGrid className="h-3.5 w-3.5" /> Cartões</button>
            <button type="button" onClick={() => setModoExibicao('tabela')} aria-pressed={modoExibicao === 'tabela'} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${modoExibicao === 'tabela' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}><Table2 className="h-3.5 w-3.5" /> Tabela</button>
          </div>
        </div>
      </section>

      {carregando ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : grupos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-16 text-center dark:border-slate-700"><ClipboardList className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-3 text-sm font-bold">Nenhum EPI encontrado</h2><p className="mt-1 text-xs text-slate-500">Importe o Book XLSX para iniciar o cadastro ou inclua uma variante manualmente.</p></div>
      ) : modoExibicao === 'tabela' ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Variantes do Book</h2><p className="mt-0.5 text-xs text-slate-500">Cada linha corresponde a um tamanho, CA e código SAP individuais.</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400"><tr><th className="px-4 py-3 font-bold">EPI</th><th className="px-3 py-3 font-bold">Categoria / grupo</th><th className="px-3 py-3 font-bold">SAP</th><th className="px-3 py-3 font-bold">CA</th><th className="px-3 py-3 font-bold">Tamanho</th><th className="px-3 py-3 font-bold">Validade</th><th className="px-3 py-3 font-bold">Fabricante</th><th className="px-4 py-3 text-right font-bold">Situação</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{variantesFiltradas.map(item => <tr key={item.id} role="button" tabIndex={0} onClick={() => abrirEdicao(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirEdicao(item); } }} className="cursor-pointer align-middle transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:bg-emerald-950/20"><td className="px-4 py-3"><div className="flex min-w-[210px] items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 dark:bg-slate-800"><FotoEpi item={item} /></div><div className="min-w-0"><p className="max-w-[230px] truncate font-bold text-slate-900 dark:text-slate-100">{item.descricao_epi}</p><p className="mt-0.5 text-slate-500">Abrir detalhes para editar</p></div></div></td><td className="px-3 py-3"><p className="font-semibold text-slate-700 dark:text-slate-200">{item.grupo_epi}</p><p className="mt-0.5 text-slate-500">{item.categoria}</p></td><td className="px-3 py-3"><p className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{item.codigo_sap || '—'}</p><p className="mt-0.5 max-w-[220px] truncate text-slate-500">{item.descricao_sap || 'Sem descrição SAP'}</p></td><td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{item.ca || '—'}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{item.tamanho || '—'}</td><td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{item.validade || '—'}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{item.fabricante || '—'}</td><td className="px-4 py-3 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${item.ativo ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></td></tr>)}</tbody></table></div>
        </section>
      ) : <div className="space-y-7">{grupos.map(grupo => <section key={`${grupo.categoria}-${grupo.grupoEpi}`} className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{grupo.categoria}</p><h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{grupo.grupoEpi}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{grupo.itens.length} {grupo.itens.length === 1 ? 'variante' : 'variantes'}</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{grupo.itens.map(item => <button key={item.id} type="button" onClick={() => abrirEdicao(item)} className={`group w-full overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-slate-900 dark:hover:border-emerald-700 ${item.ativo ? 'border-slate-200 dark:border-slate-800' : 'border-amber-300 opacity-75 dark:border-amber-700'}`}><div className="flex gap-3 p-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-800"><FotoEpi item={item} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="min-h-[2.5rem] break-words text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">{item.descricao_sap || item.descricao_epi}</p><Pencil className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-emerald-600 dark:text-slate-600" /></div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="text-slate-400">Código SAP</dt><dd className="mt-0.5 font-mono font-bold text-emerald-700 dark:text-emerald-400">{item.codigo_sap || '—'}</dd></div><div><dt className="text-slate-400">CA</dt><dd className="mt-0.5 font-semibold text-slate-700 dark:text-slate-200">{item.ca || '—'}</dd></div><div><dt className="text-slate-400">Tamanho</dt><dd className="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200">{item.tamanho || '—'}</dd></div><div><dt className="text-slate-400">Validade</dt><dd className="mt-0.5 truncate font-semibold text-slate-700 dark:text-slate-200">{item.validade || '—'}</dd></div></dl><p className="mt-3 text-xs font-bold text-emerald-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-emerald-400">Ver detalhes e editar</p></div></div></button>)}</div>
      </section>)}</div>}

      {editando && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4"><div role="dialog" aria-modal="true" aria-labelledby="titulo-edicao-epi" className="mx-auto my-4 max-w-4xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800"><div><p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Detalhes da variante</p><h2 id="titulo-edicao-epi" className="mt-1 text-lg font-bold">{editando.id ? 'Editar variante de EPI' : 'Nova variante de EPI'}</h2><p className="mt-1 text-xs text-slate-500">O código SAP e o CA formam a identidade da variante. Alterações ficam auditáveis.</p></div><button type="button" onClick={() => setEditando(null)} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800">Fechar</button></div>
        <div className="mt-5 grid gap-3 md:grid-cols-2"><Campo label="Categoria"><input value={editando.categoria} onChange={e => atualizar('categoria', e.target.value)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Grupo (mesmo item)"><input value={editando.grupo_epi} onChange={e => atualizar('grupo_epi', e.target.value)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Descrição do EPI"><input value={editando.descricao_epi} onChange={e => atualizar('descricao_epi', e.target.value)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Tamanho"><input value={editando.tamanho || ''} onChange={e => atualizar('tamanho', e.target.value || null)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="CA"><input value={editando.ca} onChange={e => atualizar('ca', e.target.value)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Validade"><input value={editando.validade || ''} onChange={e => atualizar('validade', e.target.value || null)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Fabricante"><input value={editando.fabricante || ''} onChange={e => atualizar('fabricante', e.target.value || null)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Indicação"><input value={editando.indicacao || ''} onChange={e => atualizar('indicacao', e.target.value || null)} className="rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /></Campo>
          <div className="md:col-span-2"><Campo label="Descrição SAP"><div className="flex gap-2"><input value={editando.descricao_sap || ''} onChange={e => atualizar('descricao_sap', e.target.value || null)} className="min-w-0 flex-1 rounded-lg border p-2 dark:border-slate-700 dark:bg-slate-800" /><button type="button" onClick={pesquisarSap} disabled={buscandoSap} className="inline-flex items-center gap-1 rounded-lg border px-3 text-xs font-bold text-emerald-700"><Search className="h-3.5 w-3.5" /> Catálogo SAP</button></div></Campo></div>
          <Campo label="Código SAP"><input value={editando.codigo_sap || ''} readOnly className="rounded-lg border bg-slate-50 p-2 text-slate-600 dark:border-slate-700 dark:bg-slate-800" /></Campo><Campo label="Situação"><span className="flex items-center gap-2 rounded-lg border p-2 text-sm font-normal dark:border-slate-700"><input type="checkbox" checked={editando.ativo} onChange={e => atualizar('ativo', e.target.checked)} /> Ativo no Book e em Compras</span></Campo>
        </div>
        {buscaSap.length > 0 && <div className="mt-3 rounded-xl border border-emerald-100 p-2 dark:border-emerald-900">{buscaSap.map(resultado => <button key={resultado.materialCode} type="button" onClick={() => { atualizar('codigo_sap', resultado.materialCode); atualizar('descricao_sap', resultado.description); setBuscaSap([]); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/40"><span className="text-xs font-semibold">{resultado.description}</span><span className="font-mono text-xs text-emerald-700">{resultado.materialCode}</span></button>)}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-2"><input ref={inputFoto} type="file" accept="image/*" className="hidden" onChange={e => { const arquivo = e.target.files?.[0]; e.target.value = ''; if (arquivo) atualizar('foto', fotoDoArquivo(arquivo)); }} /><button type="button" onClick={() => inputFoto.current?.click()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold"><Camera className="h-4 w-4" /> {editando.foto ? `Foto selecionada: ${editando.foto.nome}` : 'Trocar foto'}</button><button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Salvar com histórico</button></div>
        {editando.id && <div className="mt-5 border-t pt-4 dark:border-slate-800"><h3 className="flex items-center gap-2 text-sm font-bold"><History className="h-4 w-4" /> Histórico de alterações</h3><ul className="mt-2 space-y-1 text-xs text-slate-500">{historico.length ? historico.map(registro => <li key={registro.id}>{new Date(registro.alterado_em).toLocaleString('pt-BR')} · {registro.operacao.toLowerCase()} por {registro.alterado_por}</li>) : <li>Sem alterações registradas além da criação.</li>}</ul></div>}
      </div></div>}
    </div>
  );
}

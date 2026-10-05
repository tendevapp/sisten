import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, ImageIcon, Loader2, PackageSearch, RefreshCw, Search, Upload } from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import {
  fotosCatalogoRitec, importarCatalogoRitec, listarCatalogoRitec,
  type CatalogoRitecItem,
} from '../lib/catalogoRitec';
import type { CatalogoItem } from '../lib/almoxCatalogoApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CatalogosSuprimentos({ user, onNavigate }: Props) {
  const toast = useToast();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<CatalogoRitecItem[]>([]);
  const [fotos, setFotos] = useState<Map<string, CatalogoItem>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState('');
  const [nivel, setNivel] = useState('');
  const [marca, setMarca] = useState('');
  const [fornecedor, setFornecedor] = useState('');

  const podeImportar = user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos');
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await listarCatalogoRitec();
      setItens(dados);
      setFotos(await fotosCatalogoRitec(dados.map(item => item.codigo_sap)));
    } catch (erro: any) {
      toast.error(erro?.message || 'Não foi possível carregar o catálogo RITEC.');
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const niveis = useMemo(() => [...new Set(itens.map(i => i.nivel_2_sap).filter(Boolean) as string[])].sort(), [itens]);
  const marcas = useMemo(() => [...new Set(itens.map(i => i.marca).filter(Boolean) as string[])].sort(), [itens]);
  const fornecedores = useMemo(() => [...new Set(itens.map(i => i.fornecedor).filter(Boolean))].sort(), [itens]);
  const filtrados = useMemo(() => {
    const termo = busca.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return itens.filter(item => {
      if (nivel && item.nivel_2_sap !== nivel) return false;
      if (marca && item.marca !== marca) return false;
      if (fornecedor && item.fornecedor !== fornecedor) return false;
      if (!termo) return true;
      return [item.codigo_sap, item.descricao_sap, item.descricao_completa, item.codigo_ritec, item.referencia, item.marca, item.fornecedor, item.subcategoria]
        .some(valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(termo));
    });
  }, [busca, fornecedor, itens, marca, nivel]);

  const importar = async (arquivo?: File) => {
    if (!arquivo) return;
    setImportando(true);
    try {
      const quantidade = await importarCatalogoRitec(arquivo);
      toast.success(`${quantidade} itens importados. As imagens foram vinculadas pelo código SAP.`);
      await carregar();
    } catch (erro: any) {
      toast.error(erro?.message || 'Falha ao importar o catálogo.');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-[1800px] mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button onClick={() => onNavigate('/suprimentos')} className="text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white mb-2">Suprimentos</button>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-600 text-white"><PackageSearch className="w-6 h-6" /></div>
            <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Catálogos</h1><p className="text-sm text-slate-500">Ferramentas RITEC vinculadas ao cadastro de materiais do Almoxarifado.</p></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void carregar()} disabled={carregando || importando} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} />Atualizar</button>
          {podeImportar && <><button onClick={() => uploadRef.current?.click()} disabled={importando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Importar planilha</button><input ref={uploadRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const arquivo = e.target.files?.[0]; e.target.value = ''; void importar(arquivo); }} /></>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Itens no catálogo</p><p className="mt-1 text-2xl font-bold">{itens.length.toLocaleString('pt-BR')}</p></div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Com foto no Almox</p><p className="mt-1 text-2xl font-bold">{fotos.size.toLocaleString('pt-BR')}</p></div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"><p className="text-xs font-semibold uppercase text-slate-500">Resultado atual</p><p className="mt-1 text-2xl font-bold">{filtrados.length.toLocaleString('pt-BR')}</p></div>
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-3 lg:flex-row">
          <label className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código SAP, RITEC, descrição, marca ou referência" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent py-2.5 pl-10 pr-3 text-sm" /></label>
          <select value={nivel} onChange={e => setNivel(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm"><option value="">Todos os níveis</option>{niveis.map(opcao => <option key={opcao}>{opcao}</option>)}</select>
          <select value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm"><option value="">Todos os fornecedores</option>{fornecedores.map(opcao => <option key={opcao}>{opcao}</option>)}</select>
          <select value={marca} onChange={e => setMarca(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2.5 text-sm"><option value="">Todas as marcas</option>{marcas.map(opcao => <option key={opcao}>{opcao}</option>)}</select>
        </div>
        {carregando ? <div className="p-12 text-center text-slate-500"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Carregando catálogo...</div> : itens.length === 0 ? <div className="p-12 text-center"><FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400 mb-3" /><p className="font-semibold">Catálogo ainda não importado</p><p className="text-sm text-slate-500 mt-1">{podeImportar ? 'Use “Importar planilha” para carregar a base RITEC.' : 'Aguarde a primeira importação da base RITEC.'}</p></div> : <>
          <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">{filtrados.map(item => <article key={item.id} className="p-4 flex gap-3"><Foto item={fotos.get(item.codigo_sap)} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="font-bold text-sm">{item.codigo_sap}</p>{item.preco_cif_obra != null && <span className="font-semibold text-emerald-700 whitespace-nowrap">{moeda.format(item.preco_cif_obra)}</span>}</div><p className="text-sm mt-1">{item.descricao_sap}</p><p className="text-xs text-slate-500 mt-1">{[item.fornecedor, item.marca, item.referencia, item.codigo_ritec].filter(Boolean).join(' · ') || 'Sem referência complementar'}</p></div></article>)}</div>
          <div className="hidden lg:block overflow-auto"><table className="w-full text-sm"><thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 text-left text-xs uppercase text-slate-500"><tr><th className="p-3 w-14">Foto</th><th className="p-3">Material</th><th className="p-3">Fornecedor</th><th className="p-3">Classificação</th><th className="p-3">Marca / referência</th><th className="p-3">Código RITEC</th><th className="p-3 text-right">CIF obra</th></tr></thead><tbody>{filtrados.map(item => <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50"><td className="p-3"><Foto item={fotos.get(item.codigo_sap)} /></td><td className="p-3 max-w-xl"><p className="font-bold">{item.codigo_sap}</p><p className="mt-0.5">{item.descricao_sap}</p>{item.descricao_completa && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.descricao_completa}</p>}</td><td className="p-3 font-semibold">{item.fornecedor}</td><td className="p-3 text-slate-600 dark:text-slate-300">{[item.nivel_2_sap, item.subcategoria, item.aplicacao].filter(Boolean).join(' · ') || '—'}</td><td className="p-3">{item.marca || '—'}<p className="text-xs text-slate-500">{item.referencia || ''}</p></td><td className="p-3">{item.codigo_ritec || '—'}<p className="text-xs text-slate-500">{item.codigo_ritec_opcao_preco || ''}</p></td><td className="p-3 text-right font-semibold whitespace-nowrap">{item.preco_cif_obra == null ? '—' : moeda.format(item.preco_cif_obra)}</td></tr>)}</tbody></table></div>
        </>}
      </section>
    </div>
  );
}

function Foto({ item }: { item?: CatalogoItem }) {
  if (!item?.url_imagem) return <div title="Sem foto vinculada no Almoxarifado" className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400"><ImageIcon className="w-4 h-4" /></div>;
  return <img src={item.url_imagem} alt={`Foto do material ${item.codigo_sap}`} className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />;
}

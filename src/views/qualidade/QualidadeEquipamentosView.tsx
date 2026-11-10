import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, ArrowLeft, Bell, Boxes, Download, Plus, RefreshCw, Search, Upload, Wrench } from 'lucide-react';
import type { Profile } from '../../types';
import { useQualidadeEquipamentos } from '../../hooks/useQualidadeEquipamentos';
import { avisosEquipamento, CATEGORIAS_EQUIPAMENTOS, criarWorkbookEquipamentos, normalizarEquipamento, saldoComprar } from '../../lib/qualidadeEquipamentos';
import type { CategoriaEquipamento, EquipamentoQualidade } from '../../lib/qualidadeEquipamentos';
import { listarEventosEquipamento } from '../../lib/qualidadeEquipamentosApi';
import { dataHojeLocal } from '../../lib/dataLocal';
import { useToast } from '../../components/ui/Toast';
import EquipamentoFormModal, { botaoEquipamento, inputEquipamento, primarioEquipamento } from '../../components/qualidade/EquipamentoFormModal';
import EquipamentosImportModal from '../../components/qualidade/EquipamentosImportModal';
import EquipamentoDetalhesModal from '../../components/qualidade/EquipamentoDetalhesModal';

const categorias = Object.keys(CATEGORIAS_EQUIPAMENTOS) as CategoriaEquipamento[];
export default function QualidadeEquipamentosView({ onNavigate }: { user: Profile; onNavigate: (path: string) => void }) {
  const toast = useToast();
  const { registros, carregando, erro, recarregar } = useQualidadeEquipamentos();
  const [aba, setAba] = useState<CategoriaEquipamento | 'avisos'>('estoque');
  const [busca, setBusca] = useState('');
  const [local, setLocal] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [situacao, setSituacao] = useState('');
  const [arquivados, setArquivados] = useState(false);
  const [somenteAvisos, setSomenteAvisos] = useState(false);
  const [somenteDeficit, setSomenteDeficit] = useState(false);
  const [janela, setJanela] = useState(30);
  const [pagina, setPagina] = useState(1);
  const [importar, setImportar] = useState(false);
  const [selecionado, setSelecionado] = useState<EquipamentoQualidade | null>(null);
  const [form, setForm] = useState<{ registro: EquipamentoQualidade | null; modo: 'editar' | 'lancamento' | 'arquivar' } | null>(null);
  const [exportando, setExportando] = useState(false);
  const avisos = useMemo(() => new Map(registros.map(r => [r.id, avisosEquipamento(r, dataHojeLocal(), janela)])), [registros, janela]);
  const ativos = useMemo(() => registros.filter(r => !r.arquivado), [registros]);
  const lista = useMemo(() => registros.filter(r => (arquivados ? r.arquivado : !r.arquivado)
    && (aba === 'avisos' || r.categoria === aba)
    && (!busca || normalizarEquipamento([r.codigo, ...Object.values(r.dados)].join(' ')).includes(normalizarEquipamento(busca)))
    && (!local || r.dados.local === local) && (!responsavel || r.dados.responsavel === responsavel || r.dados.responsavel_acao === responsavel)
    && (!situacao || r.dados.situacao === situacao) && (!somenteDeficit || (r.categoria === 'estoque' && (saldoComprar(r.dados) || 0) > 0)) && (!(aba === 'avisos' || somenteAvisos) || !!avisos.get(r.id)?.length))
    .sort((a, b) => Number(avisos.get(b.id)?.some(a => a.nivel === 'critico')) - Number(avisos.get(a.id)?.some(a => a.nivel === 'critico')) || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })), [registros, arquivados, aba, busca, local, responsavel, situacao, somenteAvisos, somenteDeficit, avisos]);
  const paginas = Math.max(1, Math.ceil(lista.length / 25));
  const paginaAtual = Math.min(pagina, paginas), visiveis = lista.slice((paginaAtual - 1) * 25, paginaAtual * 25);
  const locais = [...new Set(registros.map(r => r.dados.local).filter(Boolean))].sort();
  const responsaveis = [...new Set(registros.flatMap(r => [r.dados.responsavel, r.dados.responsavel_acao]).filter(Boolean))].sort();
  const situacoes = [...new Set(registros.filter(r => aba === 'avisos' || r.categoria === aba).map(r => r.dados.situacao).filter(Boolean))].sort();
  function mudarAba(valor: typeof aba) { setAba(valor); setSituacao(''); setSomenteDeficit(false); setPagina(1); }
  function abrirIndicador(valor: typeof aba, deficit = false) { mudarAba(valor); setSomenteDeficit(deficit); setBusca(''); setLocal(''); setResponsavel(''); setSomenteAvisos(false); setArquivados(false); }
  async function exportar(todos: boolean) {
    setExportando(true);
    try {
      const dados = todos ? registros : lista;
      const ids = new Set(dados.map(r => r.id));
      const eventos = (await listarEventosEquipamento()).filter(e => ids.has(e.equipamento_id));
      XLSX.writeFile(criarWorkbookEquipamentos(dados, eventos), `Equipamentos-Qualidade-${todos ? 'completo' : 'filtrado'}-${dataHojeLocal()}.xlsx`);
      toast.success(`${dados.length} registros exportados com histórico.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao exportar.'); }
    finally { setExportando(false); }
  }
  const contadores = [
    { label: 'Registros de estoque', valor: ativos.filter(r => r.categoria === 'estoque').length, icon: Boxes, click: () => abrirIndicador('estoque') },
    { label: 'Estoque com déficit', valor: ativos.filter(r => r.categoria === 'estoque' && (saldoComprar(r.dados) || 0) > 0).length, icon: AlertTriangle, click: () => abrirIndicador('estoque', true) },
    { label: 'Registros de segregação', valor: ativos.filter(r => r.categoria === 'segregados').length, icon: Wrench, click: () => abrirIndicador('segregados') },
    { label: 'Registros com avisos', valor: ativos.filter(r => avisos.get(r.id)?.length).length, icon: Bell, click: () => abrirIndicador('avisos') },
  ];
  return <div className="mx-auto max-w-[1600px] space-y-5 pb-16 text-slate-900 dark:text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><button className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-700" onClick={() => onNavigate('/qualidade')}><ArrowLeft size={14} />Qualidade</button><h1 className="flex items-center gap-3 font-display text-2xl font-bold"><span className="rounded-xl bg-rose-700 p-2.5 text-white"><Wrench size={24} /></span>Equipamentos</h1><p className="mt-2 text-sm text-slate-500">Estoque, compras e segregação com rastreabilidade das ações.</p></div>
      <div className="flex flex-wrap gap-2"><button className={botaoEquipamento} disabled={carregando} onClick={() => void recarregar()} aria-label="Atualizar equipamentos"><RefreshCw size={16} /></button><button className={botaoEquipamento} disabled={carregando || !!erro} onClick={() => setImportar(true)}><Upload size={16} />Importar planilha</button><details className="relative"><summary className={`${botaoEquipamento} cursor-pointer list-none`}><Download size={16} />{exportando ? 'Exportando…' : 'Exportar'}</summary><div className="absolute right-0 z-20 mt-2 w-64 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"><button className={`${botaoEquipamento} w-full`} disabled={exportando || carregando || !!erro} onClick={() => void exportar(true)}>Todos os dados + histórico</button><button className={`${botaoEquipamento} w-full`} disabled={exportando || carregando || !!erro || !lista.length} onClick={() => void exportar(false)}>Resultado filtrado ({lista.length})</button></div></details><button className={primarioEquipamento} disabled={carregando || !!erro} onClick={() => setForm({ registro: null, modo: 'editar' })}><Plus size={16} />Novo registro</button></div>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{contadores.map(c => <button key={c.label} onClick={c.click} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-rose-400 dark:border-slate-700 dark:bg-slate-900"><div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500"><span>{c.label}</span><c.icon size={18} /></div><p className="mt-2 text-3xl font-bold">{carregando || erro ? '—' : c.valor}</p></button>)}</div>
    <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex overflow-x-auto border-b border-slate-200 px-2 dark:border-slate-700" role="tablist" aria-label="Controles de equipamentos">{[...categorias, 'avisos' as const].map(c => <button key={c} role="tab" aria-selected={aba === c} onClick={() => mudarAba(c)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-4 text-sm font-semibold ${aba === c ? 'border-rose-700 text-rose-700 dark:text-rose-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}>{c === 'avisos' ? 'Avisos' : CATEGORIAS_EQUIPAMENTOS[c].label}<span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c === 'avisos' ? ativos.filter(r => avisos.get(r.id)?.length).length : ativos.filter(r => r.categoria === c).length}</span></button>)}</div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="relative"><span className="mb-1 block text-xs font-semibold text-slate-500">Buscar em todos os campos</span><Search className="absolute bottom-2.5 left-2.5 text-slate-400" size={17} /><input className={`${inputEquipamento} pl-9`} value={busca} placeholder="Equipamento, RM, código…" onChange={e => { setBusca(e.target.value); setPagina(1); }} /></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">Local / setor</span><select className={inputEquipamento} value={local} onChange={e => { setLocal(e.target.value); setPagina(1); }}><option value="">Todos</option>{locais.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">Responsável</span><select className={inputEquipamento} value={responsavel} onChange={e => { setResponsavel(e.target.value); setPagina(1); }}><option value="">Todos</option>{responsaveis.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">Situação</span><select className={inputEquipamento} value={situacao} onChange={e => { setSituacao(e.target.value); setPagina(1); }}><option value="">Todas</option>{situacoes.map(v => <option key={v}>{v}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-semibold text-slate-500">Antecedência dos avisos</span><select className={inputEquipamento} value={janela} onChange={e => setJanela(Number(e.target.value))}>{[7, 15, 30, 60, 90].map(v => <option key={v} value={v}>{v} dias</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-4 text-xs"><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={somenteAvisos || aba === 'avisos'} disabled={aba === 'avisos'} onChange={e => { setSomenteAvisos(e.target.checked); setPagina(1); }} />Somente com avisos</label><label className="flex items-center gap-2"><input type="checkbox" checked={arquivados} onChange={e => { setArquivados(e.target.checked); setPagina(1); }} />Somente arquivados</label>{somenteDeficit && <button className="font-semibold text-amber-700 dark:text-amber-400" onClick={() => setSomenteDeficit(false)}>Com déficit de estoque ×</button>}</div><button className="font-semibold text-rose-700 dark:text-rose-400" onClick={() => { setBusca(''); setLocal(''); setResponsavel(''); setSituacao(''); setSomenteAvisos(false); setSomenteDeficit(false); setArquivados(false); setPagina(1); }}>Limpar filtros</button></div>
      {erro ? <div role="alert" className="m-4 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200"><strong>Não foi possível carregar os equipamentos.</strong><p className="mt-1">{erro}</p><button className={`${botaoEquipamento} mt-3`} onClick={() => void recarregar()}>Tentar novamente</button></div> : carregando ? <p role="status" className="p-10 text-center text-sm text-slate-500">Carregando equipamentos…</p> : lista.length === 0 ? <div className="px-5 py-12 text-center"><Boxes className="mx-auto mb-3 text-slate-400" size={36} /><h2 className="font-bold">{registros.length ? 'Nenhum registro neste filtro' : 'Comece pela lista de equipamentos'}</h2><p className="mt-2 text-sm text-slate-500">{registros.length ? 'Ajuste os filtros ou escolha outro controle.' : 'Importe a planilha para organizar as quatro abas e acompanhar as pendências.'}</p></div> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60"><tr><th className="p-3">Equipamento / registro</th>{aba === 'avisos' ? <th className="p-3">Controle</th> : CATEGORIAS_EQUIPAMENTOS[aba].campos.filter(c => !['equipamento', 'numero'].includes(c.key)).map(c => <th key={c.key} className="min-w-36 p-3">{c.label}</th>)}<th className="min-w-64 p-3">Avisos / prazos</th><th className="p-3">Ações</th></tr></thead><tbody>{visiveis.map(r => <tr key={r.id} tabIndex={0} aria-label={`Abrir detalhes de ${r.dados.equipamento}`} aria-haspopup="dialog" onClick={() => setSelecionado(r)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelecionado(r); } }} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50/70 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rose-600 dark:border-slate-800 dark:hover:bg-slate-800/40"><td className="min-w-56 p-3"><button className="text-left font-semibold text-rose-800 hover:underline dark:text-rose-300" onClick={() => setSelecionado(r)}>{r.dados.equipamento}</button><p className="mt-1 font-mono text-[11px] text-slate-500">{r.codigo} • Nº {r.dados.numero || '—'}</p>{r.arquivado && <span className="text-xs text-slate-500">Arquivado</span>}</td>{aba === 'avisos' ? <td className="p-3">{CATEGORIAS_EQUIPAMENTOS[r.categoria].label}<p className="mt-1 text-xs text-slate-500">{r.dados.descricao}</p></td> : CATEGORIAS_EQUIPAMENTOS[aba].campos.filter(c => !['equipamento', 'numero'].includes(c.key)).map(c => <td key={c.key} className="max-w-xs whitespace-pre-wrap break-words p-3">{r.dados[c.key] || '—'}</td>)}<td className="p-3"><div className="space-y-1.5">{avisos.get(r.id)?.length ? avisos.get(r.id)!.map(a => <p key={a.texto} className={`rounded-md px-2 py-1 text-xs ${a.nivel === 'critico' ? 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{a.texto}</p>) : <span className="text-xs text-slate-500">Sem avisos pelas regras cadastradas</span>}</div></td><td className="p-3"><button className={botaoEquipamento} onClick={() => setSelecionado(r)}>Detalhes</button></td></tr>)}</tbody></table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700"><p>{lista.length} registros • página {paginaAtual} de {paginas}</p><div className="flex gap-2"><button className={botaoEquipamento} disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>Anterior</button><button className={botaoEquipamento} disabled={paginaAtual >= paginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima</button></div></div>
      </>}
    </div>
    <p className="text-xs leading-relaxed text-slate-500">Cada aba é um controle independente. Quantidades textuais são preservadas e não entram no cálculo do déficit. Avisos aparecem nesta página; não há envio automático por e-mail. A ausência de aviso não representa liberação técnica do equipamento.</p>
    {importar && <EquipamentosImportModal registros={registros} onClose={() => setImportar(false)} onImportado={() => { setImportar(false); void recarregar(); }} />}
    {selecionado && !form && <EquipamentoDetalhesModal registro={selecionado} onClose={() => setSelecionado(null)} onEditar={modo => setForm({ registro: selecionado, modo })} />}
    {form && <EquipamentoFormModal registro={form.registro} categoriaInicial={aba === 'avisos' ? 'estoque' : aba} modo={form.modo} onClose={() => setForm(null)} onSalvo={() => { setForm(null); setSelecionado(null); void recarregar(); }} />}
  </div>;
}

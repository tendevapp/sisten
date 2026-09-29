import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Loader2, Save, Search, Table2, Users } from 'lucide-react';
import type { Profile, RhPessoa } from '../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { normalizarChaveTreinamento } from '../../lib/rhMatrizTreinamentosImport';
import { criarRequisitosPorCargo, statusNaMatriz } from '../../lib/rhMatrizTreinamentosViewModel';
import * as api from '../../lib/rhMatrizTreinamentosApi';

interface Props { user: Profile; onNavigate: (path: string) => void; }

const tituloTipo = (tipo: api.RhTreinamentoCatalogo['tipo_informacao']) => ({ interno: 'INTERNO', externo: 'EXTERNO', nao_informado: 'NÃO INFORMADO' }[tipo] || 'NÃO INFORMADO');
const tituloStatus = (status: api.StatusMatrizTreinamento | null) => ({ apto: 'APTO', vencido: 'VENCIDO', pendente: 'PENDENTE', nao_aplicavel: 'NÃO APLICÁVEL' }[status || 'nao_aplicavel']);
const classeStatus = (status: api.StatusMatrizTreinamento | null) => status === 'apto' ? 'bg-emerald-100 text-emerald-800' : status === 'vencido' ? 'bg-rose-100 text-rose-800' : status === 'pendente' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500';
const LINHAS_POR_PAGINA_MATRIZ = 25;
const conjuntoVazio = new Set<string>();

function somarMeses(data: string, meses: number | null): string {
  if (!data || !meses) return '';
  const base = new Date(`${data}T12:00:00`);
  base.setMonth(base.getMonth() + meses);
  return base.toISOString().slice(0, 10);
}

function colunaExcel(indice: number): string {
  let resultado = '';
  for (let atual = indice + 1; atual > 0; atual = Math.floor((atual - 1) / 26)) resultado = String.fromCharCode(65 + ((atual - 1) % 26)) + resultado;
  return resultado;
}

export default function RhMatrizTreinamentos({ user, onNavigate }: Props) {
  const toast = useToast();
  const [dados, setDados] = useState<Awaited<ReturnType<typeof api.carregarMatrizTreinamentos>> | null>(null);
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [treinamentoId, setTreinamentoId] = useState('');
  const [status, setStatus] = useState<api.StatusMatrizTreinamento>('apto');
  const [dataCapacitacao, setDataCapacitacao] = useState(new Date().toISOString().slice(0, 10));
  const [validadeEm, setValidadeEm] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [modo, setModo] = useState<'lista' | 'matriz'>('lista');
  const [paginaMatriz, setPaginaMatriz] = useState(1);
  const [pessoaDetalhe, setPessoaDetalhe] = useState<RhPessoa | null>(null);

  const carregar = async () => {
    try { setDados(await api.carregarMatrizTreinamentos()); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a matriz.'); }
  };
  useEffect(() => { void carregar(); }, []);

  const pessoas = useMemo(() => (dados?.pessoas || []).filter(p => `${p.nome} ${p.registro} ${p.cargo || ''} ${p.area || ''}`.toLowerCase().includes(busca.toLowerCase())), [dados, busca]);
  const alertasPorPessoa = useMemo(() => new Map((dados?.alertas || []).map(a => [a.pessoa_id, a])), [dados]);
  const registrosPorChave = useMemo(() => new Map((dados?.registros || []).map(r => [`${r.pessoa_id}|${r.treinamento_id}`, r])), [dados]);
  const requisitosPorCargo = useMemo(() => criarRequisitosPorCargo(dados?.requisitos || []), [dados]);
  const selecionado = dados?.catalogo.find(t => t.id === treinamentoId);
  const requisitosDaPessoa = (pessoa: RhPessoa) => requisitosPorCargo.get(normalizarChaveTreinamento(pessoa.cargo || '')) || conjuntoVazio;
  const statusDaPessoa = (pessoa: RhPessoa, treinamento: api.RhTreinamentoCatalogo): api.StatusMatrizTreinamento | null => statusNaMatriz({
    statusRegistrado: registrosPorChave.get(`${pessoa.id}|${treinamento.id}`)?.status || null,
    requisitos: requisitosPorCargo,
    cargoChave: normalizarChaveTreinamento(pessoa.cargo || ''),
    treinamentoId: treinamento.id,
  });
  const totalPaginasMatriz = Math.max(1, Math.ceil(pessoas.length / LINHAS_POR_PAGINA_MATRIZ));
  const pessoasMatriz = useMemo(() => pessoas.slice((paginaMatriz - 1) * LINHAS_POR_PAGINA_MATRIZ, paginaMatriz * LINHAS_POR_PAGINA_MATRIZ), [pessoas, paginaMatriz]);
  useEffect(() => { setPaginaMatriz(1); }, [busca, modo]);

  const atualizarValidade = (id: string) => {
    setTreinamentoId(id);
    const item = dados?.catalogo.find(t => t.id === id);
    setValidadeEm(somarMeses(dataCapacitacao, item?.validade_meses || null));
  };
  const salvar = async (pessoaIds = [...selecionados]) => {
    try {
      setSalvando(true);
      await api.atestarTreinamentosEmLote({ pessoaIds, treinamentoId, status, dataCapacitacao, validadeEm, usuarioId: user.id });
      toast.success(`Treinamento atualizado para ${pessoaIds.length} colaborador(es).`);
      setSelecionados(new Set());
      setPessoaDetalhe(null);
      await carregar();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar os treinamentos.'); }
    finally { setSalvando(false); }
  };
  const alternar = (id: string) => setSelecionados(atual => { const proximo = new Set(atual); proximo.has(id) ? proximo.delete(id) : proximo.add(id); return proximo; });

  const exportarMatriz = async () => {
    if (!dados) return;
    const XLSX = await import('xlsx-js-style');
    const cursos = dados.catalogo;
    const cabecalhoFixo = ['COLABORADOR', 'REGISTRO', 'FUNÇÃO', 'TURNO', 'ÁREA', 'LIDER'];
    const linhas: unknown[][] = [
      [...cabecalhoFixo.map(() => ''), ...cursos.flatMap(curso => [tituloTipo(curso.tipo_informacao), ''])],
      [...cabecalhoFixo, ...cursos.flatMap(curso => [curso.nome, ''])],
      [...cabecalhoFixo.map(() => ''), ...cursos.flatMap(() => ['SITUAÇÃO', 'VENCIMENTO'])],
      ...dados.pessoas.map(pessoa => [
        pessoa.nome, pessoa.registro || '', pessoa.cargo || '', pessoa.turno || '', pessoa.area || '', pessoa.lideranca || '',
        ...cursos.flatMap(curso => {
          const registro = registrosPorChave.get(`${pessoa.id}|${curso.id}`);
          const situacao = statusDaPessoa(pessoa, curso);
          return [situacao ? tituloStatus(situacao) : '', registro?.validade_em ? new Date(`${registro.validade_em}T12:00:00`) : ''];
        }),
      ]),
    ];
    const planilha: any = XLSX.utils.aoa_to_sheet(linhas, { cellDates: true });
    planilha['!merges'] = [
      ...cabecalhoFixo.map((_, index) => ({ s: { r: 1, c: index }, e: { r: 2, c: index } })),
      ...cursos.flatMap((_, index) => {
        const coluna = cabecalhoFixo.length + index * 2;
        return [{ s: { r: 0, c: coluna }, e: { r: 0, c: coluna + 1 } }, { s: { r: 1, c: coluna }, e: { r: 1, c: coluna + 1 } }];
      }),
    ];
    planilha['!cols'] = [...cabecalhoFixo.map((_, index) => ({ wch: [28, 14, 24, 12, 18, 24][index] })), ...cursos.flatMap(() => [{ wch: 14 }, { wch: 13 }])];
    planilha['!rows'] = [{ hpt: 20 }, { hpt: 44 }, { hpt: 22 }];
    for (let coluna = 0; coluna < cabecalhoFixo.length + cursos.length * 2; coluna += 1) {
      for (const linha of [1, 2]) {
        const endereco = `${colunaExcel(coluna)}${linha + 1}`;
        if (!planilha[endereco]) planilha[endereco] = { t: 's', v: '' };
        planilha[endereco].s = { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: linha === 1 ? 9 : 8 }, fill: { fgColor: { rgb: linha === 1 ? '1E3A5F' : '365F91' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: 'B8C6D1' } }, bottom: { style: 'thin', color: { rgb: 'B8C6D1' } }, left: { style: 'thin', color: { rgb: 'B8C6D1' } }, right: { style: 'thin', color: { rgb: 'B8C6D1' } } } };
      }
      const tipo = `${colunaExcel(coluna)}1`;
      if (!planilha[tipo]) planilha[tipo] = { t: 's', v: '' };
      planilha[tipo].s = { font: { bold: true, color: { rgb: '1E3A5F' }, sz: 8 }, fill: { fgColor: { rgb: 'D9EAF7' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
    }
    dados.pessoas.forEach((pessoa, linhaPessoa) => cursos.forEach((curso, cursoIndex) => {
      const statusAtual = statusDaPessoa(pessoa, curso);
      const colunaStatus = cabecalhoFixo.length + cursoIndex * 2;
      const endereco = `${colunaExcel(colunaStatus)}${linhaPessoa + 4}`;
      if (planilha[endereco]) planilha[endereco].s = { fill: { fgColor: { rgb: statusAtual === 'apto' ? 'C6EFCE' : statusAtual === 'vencido' ? 'FFC7CE' : statusAtual === 'pendente' ? 'FFEB9C' : 'F2F2F2' } }, font: { bold: Boolean(statusAtual), color: { rgb: statusAtual === 'vencido' ? '9C0006' : '1F2937' } }, alignment: { horizontal: 'center' } };
      const validade = `${colunaExcel(colunaStatus + 1)}${linhaPessoa + 4}`;
      if (planilha[validade]?.t === 'd') planilha[validade].z = 'dd/mm/yyyy';
    }));
    planilha['!freeze'] = { xSplit: 6, ySplit: 3 };
    const arquivo = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(arquivo, planilha, 'CONTROLE TREINAMENTO');
    XLSX.writeFile(arquivo, `CONTROLE_DE_TREINAMENTOS_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const vencidos = (dados?.alertas || []).filter(a => a.status_calculado === 'vencido').length;
  const proximos = (dados?.alertas || []).filter(a => a.status_calculado === 'proximo_vencimento').length;
  const cursosDetalhe = pessoaDetalhe ? dados?.catalogo.filter(curso => requisitosDaPessoa(pessoaDetalhe).has(curso.id) || registrosPorChave.has(`${pessoaDetalhe.id}|${curso.id}`)) || [] : [];

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><button type="button" onClick={() => onNavigate('/rh')} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft className="h-3.5 w-3.5" /> RH</button><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Matriz de treinamentos</h1><p className="mt-1 text-sm text-slate-500">Função, área e líder vêm do cadastro RH. A origem do curso é declarada pela planilha.</p></div>{dados && <div className="flex gap-2"><button type="button" onClick={() => setModo('lista')} className={`rounded-lg px-3 py-2 text-xs font-bold ${modo === 'lista' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}>Controle</button><button type="button" onClick={() => setModo('matriz')} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${modo === 'matriz' ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600'}`}><Table2 className="h-3.5 w-3.5" /> Matriz</button><button type="button" onClick={() => void exportarMatriz()} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Download className="h-3.5 w-3.5" /> Exportar Excel</button></div>}</div>
    {!dados ? <div className="flex justify-center py-20 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div> : <>
      <div className="grid gap-3 sm:grid-cols-3"><Resumo icone={<Users className="h-5 w-5 text-blue-600" />} valor={dados.pessoas.length} texto="Colaboradores ativos" /><Resumo icone={<AlertTriangle className="h-5 w-5 text-rose-600" />} valor={vencidos} texto="Treinamentos vencidos" classe="border-rose-200 bg-rose-50" /><Resumo icone={<AlertTriangle className="h-5 w-5 text-amber-600" />} valor={proximos} texto="Vencem em até 30 dias" classe="border-amber-200 bg-amber-50" /></div>
      {modo === 'lista' && <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex flex-wrap items-end gap-3"><CampoTreinamento dados={dados} treinamentoId={treinamentoId} atualizarValidade={atualizarValidade} status={status} setStatus={setStatus} dataCapacitacao={dataCapacitacao} setDataCapacitacao={valor => { setDataCapacitacao(valor); setValidadeEm(somarMeses(valor, selecionado?.validade_meses || null)); }} validadeEm={validadeEm} setValidadeEm={setValidadeEm} /><button type="button" onClick={() => void salvar()} disabled={salvando || !treinamentoId || !selecionados.size} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Atestar {selecionados.size || ''}</button></div>{selecionado?.conteudo && <p className="mt-3 text-xs text-slate-600">Conteúdo cadastrado: {selecionado.conteudo}</p>}</section>}
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador, matrícula, função ou área" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></div>
      {modo === 'lista' ? <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800"><tr><th className="px-4 py-3"><input type="checkbox" aria-label="Selecionar todos" checked={pessoas.length > 0 && pessoas.every(p => selecionados.has(p.id))} onChange={() => setSelecionados(pessoas.length && pessoas.every(p => selecionados.has(p.id)) ? new Set() : new Set(pessoas.map(p => p.id)))} /></th><th className="px-4 py-3">Colaborador</th><th className="px-4 py-3">Função</th><th className="px-4 py-3">Área / líder</th><th className="px-4 py-3">Obrigatórios</th><th className="px-4 py-3">Alerta</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{pessoas.map(p => { const alerta = alertasPorPessoa.get(p.id); const exigidos = requisitosDaPessoa(p).size; return <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50"><td className="px-4 py-3"><input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar ${p.nome}`} /></td><td className="px-4 py-3"><button type="button" onClick={() => setPessoaDetalhe(p)} className="text-left hover:text-emerald-700"><p className="font-semibold text-slate-900 underline decoration-dotted dark:text-slate-100">{p.nome}</p><p className="text-slate-400 no-underline">{p.registro}</p></button></td><td className="px-4 py-3">{p.cargo || 'Não informado'}</td><td className="px-4 py-3"><p>{p.area || '—'}</p><p className="text-slate-400">{p.lideranca || 'Sem líder'}</p></td><td className="px-4 py-3">{exigidos}</td><td className="px-4 py-3">{alerta ? <span className={alerta.status_calculado === 'vencido' ? 'font-bold text-rose-600' : 'font-bold text-amber-600'}>{alerta.status_calculado === 'vencido' ? 'Vencido' : `${alerta.dias_para_vencimento ?? 0} dias`}</span> : <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Sem alerta</span>}</td></tr>; })}</tbody></table></div></section> : <><MatrizTabela pessoas={pessoasMatriz} cursos={dados.catalogo} statusDaPessoa={statusDaPessoa} registrosPorChave={registrosPorChave} abrirPessoa={setPessoaDetalhe} /><div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>Exibindo {pessoasMatriz.length} de {pessoas.length} colaboradores</span><div className="flex items-center gap-2"><button type="button" disabled={paginaMatriz === 1} onClick={() => setPaginaMatriz(paginaMatriz - 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Anterior</button><span>Página {paginaMatriz} de {totalPaginasMatriz}</span><button type="button" disabled={paginaMatriz === totalPaginasMatriz} onClick={() => setPaginaMatriz(paginaMatriz + 1)} className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40">Próxima</button></div></div></>}
    </>}
    {pessoaDetalhe && <Modal onClose={() => setPessoaDetalhe(null)} maxWidth="max-w-5xl" ariaLabel={`Detalhes de ${pessoaDetalhe.nome}`}><ModalHeader onClose={() => setPessoaDetalhe(null)}><h2 className="text-lg font-bold">{pessoaDetalhe.nome}</h2><p className="text-xs text-slate-500">{pessoaDetalhe.registro} · {pessoaDetalhe.cargo || 'Função não informada'} · {pessoaDetalhe.area || 'Área não informada'}</p></ModalHeader><ModalBody><div className="mb-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-3"><p><b>Líder:</b> {pessoaDetalhe.lideranca || 'Não informado'}</p><p><b>Turno:</b> {pessoaDetalhe.turno || 'Não informado'}</p><p><b>Treinamentos listados:</b> {cursosDetalhe.length}</p></div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Treinamentos obrigatórios e realizados</p><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[720px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Treinamento</th><th className="px-3 py-2">Origem</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Capacitação</th><th className="px-3 py-2">Validade</th></tr></thead><tbody className="divide-y divide-slate-100">{cursosDetalhe.map(curso => { const registro = registrosPorChave.get(`${pessoaDetalhe.id}|${curso.id}`); const situacao = statusDaPessoa(pessoaDetalhe, curso); return <tr key={curso.id}><td className="px-3 py-2 font-medium">{curso.nome}</td><td className="px-3 py-2">{tituloTipo(curso.tipo_informacao)}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${classeStatus(situacao)}`}>{situacao ? tituloStatus(situacao) : 'SEM REGISTRO'}</span></td><td className="px-3 py-2">{registro?.data_capacitacao ? new Date(`${registro.data_capacitacao}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td><td className="px-3 py-2">{registro?.validade_em ? new Date(`${registro.validade_em}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td></tr>; })}{!cursosDetalhe.length && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Nenhum requisito ou realização registrado ainda.</td></tr>}</tbody></table></div><div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="mb-3 text-xs font-bold text-emerald-900">Adicionar treinamento realizado</p><div className="flex flex-wrap items-end gap-3"><CampoTreinamento dados={dados!} treinamentoId={treinamentoId} atualizarValidade={atualizarValidade} status={status} setStatus={setStatus} dataCapacitacao={dataCapacitacao} setDataCapacitacao={valor => { setDataCapacitacao(valor); setValidadeEm(somarMeses(valor, selecionado?.validade_meses || null)); }} validadeEm={validadeEm} setValidadeEm={setValidadeEm} compacto /></div></div></ModalBody><ModalFooter><button type="button" onClick={() => setPessoaDetalhe(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Fechar</button><button type="button" onClick={() => void salvar([pessoaDetalhe.id])} disabled={salvando || !treinamentoId} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar realização</button></ModalFooter></Modal>}
  </div>;
}

function Resumo({ icone, valor, texto, classe = '' }: { icone: ReactNode; valor: number; texto: string; classe?: string }) { return <div className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${classe}`}><>{icone}</><p className="mt-2 text-2xl font-bold">{valor}</p><p className="text-xs text-slate-500">{texto}</p></div>; }

function CampoTreinamento({ dados, treinamentoId, atualizarValidade, status, setStatus, dataCapacitacao, setDataCapacitacao, validadeEm, setValidadeEm, compacto = false }: { dados: Awaited<ReturnType<typeof api.carregarMatrizTreinamentos>>; treinamentoId: string; atualizarValidade: (id: string) => void; status: api.StatusMatrizTreinamento; setStatus: (status: api.StatusMatrizTreinamento) => void; dataCapacitacao: string; setDataCapacitacao: (valor: string) => void; validadeEm: string; setValidadeEm: (valor: string) => void; compacto?: boolean }) { return <><div className={`min-w-56 ${compacto ? 'flex-1' : 'flex-1'}`}><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Treinamento</label><select value={treinamentoId} onChange={e => atualizarValidade(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Selecione no cadastro</option>{dados.catalogo.map(t => <option key={t.id} value={t.id}>{t.nome} · {tituloTipo(t.tipo_informacao)}</option>)}</select></div><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Situação</label><select value={status} onChange={e => setStatus(e.target.value as api.StatusMatrizTreinamento)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="apto">Apto</option><option value="pendente">Pendente</option><option value="vencido">Vencido</option><option value="nao_aplicavel">Não aplicável</option></select></div><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Data da capacitação</label><input type="date" value={dataCapacitacao} onChange={e => setDataCapacitacao(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" /></div><div><label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Validade</label><input type="date" value={validadeEm} onChange={e => setValidadeEm(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" /></div></>; }

function MatrizTabela({ pessoas, cursos, statusDaPessoa, registrosPorChave, abrirPessoa }: { pessoas: RhPessoa[]; cursos: api.RhTreinamentoCatalogo[]; statusDaPessoa: (pessoa: RhPessoa, curso: api.RhTreinamentoCatalogo) => api.StatusMatrizTreinamento | null; registrosPorChave: Map<string, api.RhPessoaTreinamento>; abrirPessoa: (pessoa: RhPessoa) => void }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500">Estrutura da planilha-base: cada treinamento ocupa as colunas Situação e Vencimento. Arraste horizontalmente para ver toda a matriz.</div><div className="overflow-auto"><table className="min-w-max border-collapse text-[10px]"><thead><tr className="bg-sky-100 font-bold text-slate-600"><th colSpan={6} className="sticky left-0 z-20 border border-slate-200 bg-sky-100 px-2 py-2"> </th>{cursos.map(curso => <th key={curso.id} colSpan={2} className="border border-slate-200 px-2 py-2 text-center">{tituloTipo(curso.tipo_informacao)}</th>)}</tr><tr className="bg-slate-800 text-white"><th rowSpan={2} className="sticky left-0 z-20 min-w-52 border border-slate-500 bg-slate-800 px-2 py-2">COLABORADOR</th><th rowSpan={2} className="border border-slate-500 px-2">REGISTRO</th><th rowSpan={2} className="border border-slate-500 px-2">FUNÇÃO</th><th rowSpan={2} className="border border-slate-500 px-2">TURNO</th><th rowSpan={2} className="border border-slate-500 px-2">ÁREA</th><th rowSpan={2} className="border border-slate-500 px-2">LIDER</th>{cursos.map(curso => <th key={curso.id} colSpan={2} className="max-w-40 border border-slate-500 px-2 py-2 text-center leading-tight">{curso.nome}</th>)}</tr><tr className="bg-slate-700 text-white">{cursos.flatMap(curso => [<th key={`${curso.id}-s`} className="border border-slate-500 px-2 py-1">SITUAÇÃO</th>, <th key={`${curso.id}-v`} className="border border-slate-500 px-2 py-1">VENCIMENTO</th>])}</tr></thead><tbody>{pessoas.map(pessoa => <tr key={pessoa.id} className="hover:bg-slate-50"><td className="sticky left-0 z-10 border border-slate-200 bg-white px-2 py-2 font-semibold"><button type="button" onClick={() => abrirPessoa(pessoa)} className="text-left hover:text-emerald-700 hover:underline">{pessoa.nome}</button></td><td className="border border-slate-200 px-2">{pessoa.registro}</td><td className="border border-slate-200 px-2">{pessoa.cargo}</td><td className="border border-slate-200 px-2">{pessoa.turno}</td><td className="border border-slate-200 px-2">{pessoa.area}</td><td className="border border-slate-200 px-2">{pessoa.lideranca}</td>{cursos.flatMap(curso => { const status = statusDaPessoa(pessoa, curso); const registro = registrosPorChave.get(`${pessoa.id}|${curso.id}`); return [<td key={`${curso.id}-s`} className={`border border-slate-200 px-2 text-center font-bold ${status === 'apto' ? 'bg-emerald-50 text-emerald-700' : status === 'vencido' ? 'bg-rose-50 text-rose-700' : status === 'pendente' ? 'bg-amber-50 text-amber-700' : ''}`}>{status ? tituloStatus(status) : ''}</td>, <td key={`${curso.id}-v`} className="border border-slate-200 px-2 text-center whitespace-nowrap">{registro?.validade_em ? new Date(`${registro.validade_em}T12:00:00`).toLocaleDateString('pt-BR') : ''}</td>]; })}</tr>)}</tbody></table></div></section>; }

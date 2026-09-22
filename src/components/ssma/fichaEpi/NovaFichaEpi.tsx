/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lançamento da Ficha de EPI: colaborador do RH → confirmação da função →
 * lista da matriz EPI por função (editável) → assinatura → gravação.
 * O histórico mostra há quantos dias cada EPI foi entregue, sem bloquear.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  History,
  Loader2,
  Minus,
  PenTool,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import SignaturePadModal from '../../portaria/SignaturePadModal';
import { useToast } from '../../ui/Toast';
import type { Profile } from '../../../types';
import { listarBookEpis, type SsmaBookEpi } from '../../../lib/ssmaBookEpisApi';
import { listarEpisPorFuncao, listarFuncoesEpi, type SsmaEpiFuncao } from '../../../lib/ssmaEpiPorFuncaoApi';
import {
  MOTIVOS_MED,
  chaveGrupo,
  exigeRespostaDevolucao,
  linhasSemRespostaDevolucao,
  descricaoItemEpi,
  diasEntre,
  formatarDataBR,
  formatarQuantidade,
  hojeISO,
  linhaAvulsa,
  linhasParaPayload,
  montarLinhasFicha,
  motivoPadrao,
  sugerirFuncaoPorCargo,
  textoHaQuantosDias,
  ultimaEntregaPorGrupo,
  type ItemHistorico,
  type LinhaFicha,
  type MotivoMed,
} from '../../../lib/fichaEpi';
import {
  buscarColaboradoresFichaEpi,
  criarFichaEpi,
  historicoDasFichas,
  listarFichasDoColaborador,
  mensagemErroFichaEpi,
  setorDoColaborador,
  type ColaboradorFichaEpi,
  type SsmaFichaEpi,
} from '../../../lib/ssmaFichaEpiApi';
import FichaEpiPdfPreview from './FichaEpiPdfPreview';

interface Props {
  user: Profile;
  /** Colaborador já escolhido (ex.: vindo da lista "sem ficha" da análise). */
  pessoaInicial?: ColaboradorFichaEpi | null;
  onVerFichas: (pessoa: ColaboradorFichaEpi) => void;
}

type OrigemFuncao = 'ultima_ficha' | 'exata' | 'nivel' | 'aproximada' | 'manual' | null;

const TEXTO_ORIGEM: Record<Exclude<OrigemFuncao, null>, string> = {
  ultima_ficha: 'Mesma função da última ficha',
  exata: 'Sugerida pelo cargo do RH',
  nivel: 'Sugerida pelo cargo do RH (função agrupa o nível)',
  aproximada: 'Sugestão aproximada pelo cargo — confira',
  manual: 'Escolhida manualmente',
};

const CLASSIFICACAO: Record<string, { rotulo: string; cor: string }> = {
  BASICO_OBRIGATORIO: { rotulo: 'Básico', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800' },
  ESPECIFICO_OBRIGATORIO: { rotulo: 'Específico', cor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800' },
  CONDICIONAL_POR_EXPOSICAO: { rotulo: 'Condicional', cor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800' },
};

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** Abaixo disso, a troca é "recente" e o bloco de última entrega fica em alerta. */
const DIAS_TROCA_RECENTE = 30;

function UltimaEntrega({ ultima, dias, pendentes }: { ultima?: ItemHistorico; dias: number | null; pendentes: number }) {
  if (!ultima || dias === null) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <History className="h-3.5 w-3.5" /> Primeira entrega deste EPI
      </p>
    );
  }
  const recente = dias < DIAS_TROCA_RECENTE;
  return (
    <div className={`mt-2 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2.5 py-1.5 ${
      recente
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
        : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200'
    }`}>
      <span className="inline-flex items-center gap-1.5">
        <History className="h-4 w-4 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide opacity-75">Última entrega</span>
        <span className="text-sm font-extrabold">{textoHaQuantosDias(dias)}</span>
      </span>
      <span className="text-xs font-medium">
        {formatarDataBR(ultima.data_entrega)} · {formatarQuantidade(ultima.quantidade)} un.{ultima.tamanho ? ` · tam. ${ultima.tamanho}` : ''} · {ultima.codigo_ficha}
      </span>
      {pendentes > 0 && (
        <span className="text-[11px] font-semibold opacity-80">
          {pendentes === 1 ? '1 entrega ainda não devolvida' : `${pendentes} entregas ainda não devolvidas`}
        </span>
      )}
    </div>
  );
}

function PerguntaDevolucao({ linha, dataEntrega, responsavel, destacarPendente, onResponder }: {
  linha: LinhaFicha;
  dataEntrega: string;
  responsavel: string;
  destacarPendente: boolean;
  onResponder: (valor: boolean) => void;
}) {
  const resposta = linha.devolverAnteriores;
  const pendente = resposta === null;
  const alerta = pendente && destacarPendente;
  const opcao = (valor: boolean, rotulo: string) => {
    const ativo = resposta === valor;
    return (
      <button
        type="button"
        onClick={() => onResponder(valor)}
        aria-pressed={ativo}
        className={`min-w-[64px] rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
          ativo
            ? valor
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-600 bg-slate-600 text-white dark:border-slate-400 dark:bg-slate-500'
            : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
        }`}
      >
        {rotulo}
      </button>
    );
  };

  return (
    <div
      data-devolucao-pendente={pendente ? 'true' : undefined}
      className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${
        alerta
          ? 'border-red-400 bg-red-50 text-red-900 ring-2 ring-red-200 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900'
          : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          Registrar devolução do anterior na troca? <span className="text-red-600 dark:text-red-400" aria-hidden>*</span>
        </p>
        <div className="flex gap-1.5" role="group" aria-label={`Devolução do anterior de ${linha.grupoEpi}`}>
          {opcao(true, 'Sim')}
          {opcao(false, 'Não')}
        </div>
      </div>
      <p className="mt-1 text-[11px] opacity-80">
        {linha.pendentesDevolucao.map(p => `${formatarQuantidade(p.quantidade)} un. de ${formatarDataBR(p.data_entrega)}${p.tamanho ? ` (tam. ${p.tamanho})` : ''}`).join(' · ')}
        {resposta === true && ` — devolvido em ${formatarDataBR(dataEntrega)}, por ${responsavel}`}
        {resposta === false && ' — continua com o colaborador'}
        {alerta && ' — resposta obrigatória para assinar'}
      </p>
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</span>;
}

export default function NovaFichaEpi({ user, pessoaInicial, onVerFichas }: Props) {
  const toast = useToast();
  const [funcoes, setFuncoes] = useState<SsmaEpiFuncao[]>([]);
  const [book, setBook] = useState<SsmaBookEpi[]>([]);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const [baseCarregada, setBaseCarregada] = useState(false);

  // Colaborador
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<ColaboradorFichaEpi[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pessoa, setPessoa] = useState<ColaboradorFichaEpi | null>(null);
  const [fichasAnteriores, setFichasAnteriores] = useState<SsmaFichaEpi[]>([]);
  const [carregandoPessoa, setCarregandoPessoa] = useState(false);

  // Ficha
  const [funcaoId, setFuncaoId] = useState('');
  const [origemFuncao, setOrigemFuncao] = useState<OrigemFuncao>(null);
  const [dataEntrega, setDataEntrega] = useState(hojeISO());
  const [dataAdmissao, setDataAdmissao] = useState('');
  const [dataDemissao, setDataDemissao] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [linhas, setLinhas] = useState<LinhaFicha[]>([]);
  const [carregandoLinhas, setCarregandoLinhas] = useState(false);
  const [buscaEpi, setBuscaEpi] = useState('');

  const [assinando, setAssinando] = useState(false);
  const [tentouAssinar, setTentouAssinar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salva, setSalva] = useState<{ id: string; codigo: string } | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<SsmaFichaEpi[] | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listarFuncoesEpi(), listarBookEpis()])
      .then(([f, b]) => { setFuncoes(f); setBook(b); setBaseCarregada(true); })
      .catch(erro => setErroBase(mensagemErroFichaEpi(erro)));
  }, []);

  // A montagem das linhas depende do Book: só seleciona depois da carga.
  useEffect(() => {
    if (pessoaInicial && baseCarregada) selecionarPessoa(pessoaInicial);
  }, [pessoaInicial?.id, baseCarregada]); // eslint-disable-line react-hooks/exhaustive-deps

  // Busca com debounce no RH
  useEffect(() => {
    if (pessoa || busca.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setBuscando(true);
      try {
        setSugestoes(await buscarColaboradoresFichaEpi(busca));
      } catch (erro) {
        toast.error(mensagemErroFichaEpi(erro));
      } finally {
        setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [busca, pessoa]); // eslint-disable-line react-hooks/exhaustive-deps

  const historico = useMemo(() => historicoDasFichas(fichasAnteriores), [fichasAnteriores]);
  const ultimas = useMemo(() => ultimaEntregaPorGrupo(historico), [historico]);
  const ultimaFicha = useMemo(() => fichasAnteriores.find(f => f.status === 'ATIVA') ?? null, [fichasAnteriores]);
  const funcaoSelecionada = funcoes.find(f => f.id === funcaoId) ?? null;

  const selecionarPessoa = async (p: ColaboradorFichaEpi) => {
    setTentouAssinar(false);
    setPessoa(p);
    setBusca('');
    setSugestoes([]);
    setSalva(null);
    setLinhas([]);
    setFuncaoId('');
    setOrigemFuncao(null);
    setCarregandoPessoa(true);
    try {
      const anteriores = await listarFichasDoColaborador(p.id);
      setFichasAnteriores(anteriores);
      const ultima = anteriores.find(f => f.status === 'ATIVA');
      setDataAdmissao(anteriores.find(f => f.data_admissao)?.data_admissao ?? '');
      setDataDemissao('');
      const listaFuncoes = funcoes.length ? funcoes : await listarFuncoesEpi();
      if (ultima && listaFuncoes.some(f => f.id === ultima.funcao_id)) {
        await aplicarFuncao(ultima.funcao_id, 'ultima_ficha', anteriores);
      } else {
        const sugestao = sugerirFuncaoPorCargo(p.cargo, listaFuncoes);
        if (sugestao) await aplicarFuncao(sugestao.funcao.id, sugestao.confianca, anteriores);
      }
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setCarregandoPessoa(false);
    }
  };

  const aplicarFuncao = async (id: string, origem: OrigemFuncao, anteriores = fichasAnteriores) => {
    setFuncaoId(id);
    setOrigemFuncao(origem);
    if (!id) {
      setLinhas([]);
      return;
    }
    setCarregandoLinhas(true);
    try {
      const requisitos = await listarEpisPorFuncao(id);
      const ultima = anteriores.find(f => f.status === 'ATIVA');
      setLinhas(montarLinhasFicha({
        requisitos,
        book,
        historico: historicoDasFichas(anteriores),
        motivo: motivoPadrao(ultima?.funcao_id, id),
      }));
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setCarregandoLinhas(false);
    }
  };

  const trocarPessoa = () => {
    setPessoa(null);
    setFichasAnteriores([]);
    setLinhas([]);
    setFuncaoId('');
    setOrigemFuncao(null);
    setSalva(null);
    setObservacoes('');
    setDataEntrega(hojeISO());
    setTimeout(() => buscaRef.current?.focus(), 0);
  };

  const atualizarLinha = (chave: string, mudanca: Partial<LinhaFicha>) =>
    setLinhas(atual => atual.map(l => (l.chave === chave ? { ...l, ...mudanca } : l)));

  const aplicarMotivoEmTodas = (motivo: MotivoMed) => setLinhas(atual => atual.map(l => ({ ...l, motivo })));

  const resultadosEpi = useMemo(() => {
    const termo = buscaEpi.trim().toLocaleLowerCase('pt-BR');
    if (termo.length < 2) return [];
    const vistos = new Set<string>();
    return book.filter(item => {
      const chave = chaveGrupo(item.categoria, item.grupo_epi);
      const texto = `${item.grupo_epi} ${item.descricao_epi} ${item.ca} ${item.codigo_sap || ''}`.toLocaleLowerCase('pt-BR');
      if (vistos.has(chave) || !texto.includes(termo)) return false;
      vistos.add(chave);
      return true;
    }).slice(0, 8);
  }, [book, buscaEpi]);

  const adicionarEpi = (epi: SsmaBookEpi) => {
    const chave = chaveGrupo(epi.categoria, epi.grupo_epi);
    const existente = linhas.find(l => l.chave === chave);
    if (existente) {
      atualizarLinha(chave, { incluir: true });
      toast.info(`${epi.grupo_epi} já está na lista e foi marcado.`);
    } else {
      const motivo = linhas[0]?.motivo ?? motivoPadrao(ultimaFicha?.funcao_id, funcaoId);
      setLinhas(atual => [...atual, linhaAvulsa(epi, book, historico, motivo)]);
    }
    setBuscaEpi('');
  };

  const incluidas = linhas.filter(l => l.incluir && l.quantidade > 0);
  const unidades = incluidas.reduce((s, l) => s + l.quantidade, 0);
  const semRespostaDevolucao = linhasSemRespostaDevolucao(linhas).length;

  const validar = (): string | null => {
    if (!pessoa) return 'Selecione o colaborador.';
    if (!funcaoSelecionada) return 'Confirme a função do colaborador.';
    if (!dataEntrega) return 'Informe a data da entrega.';
    if (dataEntrega > hojeISO()) return 'A data da entrega não pode ser futura.';
    if (!incluidas.length) return 'Marque ao menos um EPI para entregar.';
    const semResposta = linhasSemRespostaDevolucao(linhas);
    if (semResposta.length) {
      return `Responda se o colaborador devolveu o EPI anterior: ${semResposta.map(l => l.grupoEpi).join(', ')}.`;
    }
    return null;
  };

  const iniciarAssinatura = () => {
    setTentouAssinar(true);
    const erro = validar();
    if (erro) {
      toast.error(erro);
      document.querySelector('[data-devolucao-pendente="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setAssinando(true);
  };

  const salvar = async (assinatura: string) => {
    if (!pessoa || !funcaoSelecionada) return;
    setSalvando(true);
    try {
      const resultado = await criarFichaEpi({
        pessoa_id: pessoa.id,
        registro: pessoa.registro,
        nome: pessoa.nome,
        cargo_rh: pessoa.cargo,
        setor: setorDoColaborador(pessoa),
        funcao_id: funcaoSelecionada.id,
        funcao_nome: funcaoSelecionada.nome,
        data_admissao: dataAdmissao || null,
        data_demissao: dataDemissao || null,
        data_entrega: dataEntrega,
        assinatura_colaborador: assinatura,
        observacoes: observacoes.trim() || null,
      }, linhasParaPayload(linhas));
      setSalva(resultado);
      toast.success(`Ficha ${resultado.codigo} salva com a assinatura do colaborador.`);
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setSalvando(false);
    }
  };

  const baixarPdf = async (consolidada: boolean) => {
    if (!pessoa || !salva) return;
    setGerandoPdf(true);
    try {
      const todas = await listarFichasDoColaborador(pessoa.id, true);
      setPreviewPdf(consolidada ? todas : todas.filter(f => f.id === salva.id));
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setGerandoPdf(false);
    }
  };

  if (erroBase) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        <AlertTriangle className="mb-2 h-5 w-5" /> {erroBase}
      </div>
    );
  }

  if (!baseCarregada) {
    return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>;
  }

  // ---------- Sucesso ----------
  if (salva && pessoa) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm dark:border-emerald-900 dark:bg-slate-900">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-50">Ficha {salva.codigo} registrada</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {pessoa.nome} recebeu {formatarQuantidade(unidades)} {unidades === 1 ? 'unidade' : 'unidades'} de {incluidas.length} {incluidas.length === 1 ? 'EPI' : 'EPIs'} em {formatarDataBR(dataEntrega)}.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" disabled={gerandoPdf} onClick={() => baixarPdf(false)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            {gerandoPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF desta entrega
          </button>
          <button type="button" disabled={gerandoPdf} onClick={() => baixarPdf(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <FileDown className="h-4 w-4" /> Ficha completa do colaborador
          </button>
          <button type="button" onClick={() => onVerFichas(pessoa)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <History className="h-4 w-4" /> Ver fichas
          </button>
          <button type="button" onClick={trocarPessoa} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Plus className="h-4 w-4" /> Nova ficha
          </button>
        </div>
        {previewPdf && <FichaEpiPdfPreview fichas={previewPdf} onClose={() => setPreviewPdf(null)} />}
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Colaborador */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">1</span> Colaborador
        </h2>

        {!pessoa ? (
          <div className="relative mt-3">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-slate-700">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                ref={buscaRef}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Nome ou matrícula do colaborador (RH Pessoas)"
                className="w-full bg-transparent py-2.5 text-sm outline-none"
                autoFocus
              />
              {buscando && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </label>
            {sugestoes.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {sugestoes.map(s => (
                  <li key={s.id}>
                    <button type="button" onClick={() => selecionarPessoa(s)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{s.nome}</span>
                        <span className="block text-xs text-slate-500">{s.cargo || 'Sem cargo no RH'}{setorDoColaborador(s) ? ` · ${setorDoColaborador(s)}` : ''}</span>
                      </span>
                      <span className="font-mono text-xs text-slate-500">{s.registro}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {busca.trim().length >= 2 && !buscando && sugestoes.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">Nenhum colaborador ativo encontrado no RH.</p>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><UserRound className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{pessoa.nome}</p>
                  <p className="text-xs text-slate-500">
                    Matrícula <span className="font-mono">{pessoa.registro}</span> · Cargo no RH: {pessoa.cargo || '—'}
                    {setorDoColaborador(pessoa) ? ` · ${setorDoColaborador(pessoa)}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {carregandoPessoa ? 'Carregando histórico…' : fichasAnteriores.length
                      ? `${fichasAnteriores.filter(f => f.status === 'ATIVA').length} ficha(s) anterior(es) · última em ${formatarDataBR(ultimaFicha?.data_entrega)}`
                      : 'Primeira ficha deste colaborador'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={trocarPessoa} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-700">
                <X className="h-3.5 w-3.5" /> Trocar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 sm:col-span-2">
                <Rotulo>Função (confirme)</Rotulo>
                <select value={funcaoId} onChange={e => aplicarFuncao(e.target.value, 'manual')} className={inputCls}>
                  <option value="">Selecione a função…</option>
                  {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <span className={`text-[11px] ${origemFuncao === 'aproximada' || !origemFuncao ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}>
                  {origemFuncao ? TEXTO_ORIGEM[origemFuncao] : 'O cargo do RH não corresponde a nenhuma função da matriz — escolha a função.'}
                </span>
              </label>
              <label className="grid gap-1">
                <Rotulo>Data da entrega</Rotulo>
                <input type="date" value={dataEntrega} max={hojeISO()} onChange={e => setDataEntrega(e.target.value)} className={inputCls} />
              </label>
              <label className="grid gap-1">
                <Rotulo>Data de admissão</Rotulo>
                <input type="date" value={dataAdmissao} onChange={e => setDataAdmissao(e.target.value)} className={inputCls} />
              </label>
              <label className="grid gap-1 lg:col-start-4">
                <Rotulo>Data de demissão</Rotulo>
                <input type="date" value={dataDemissao} onChange={e => setDataDemissao(e.target.value)} className={inputCls} />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* 2. EPIs */}
      {pessoa && funcaoId && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">2</span>
              EPIs da função {funcaoSelecionada?.nome}
            </h2>
            {linhas.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-500">
                Motivo para todos:
                <select onChange={e => aplicarMotivoEmTodas(Number(e.target.value) as MotivoMed)} value="" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
                  <option value="" disabled>Aplicar…</option>
                  {([1, 2, 3, 4] as MotivoMed[]).map(m => <option key={m} value={m}>{m}. {MOTIVOS_MED[m]}</option>)}
                </select>
              </label>
            )}
          </div>

          {carregandoLinhas ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {linhas.length === 0 && (
                <li className="py-6 text-center text-xs text-slate-500">A matriz desta função não tem EPIs cadastrados. Adicione os EPIs abaixo.</li>
              )}
              {linhas.map(linha => {
                const ultima = ultimas.get(linha.chave);
                const dias = ultima ? diasEntre(ultima.data_entrega, dataEntrega || hojeISO()) : null;
                const variante = linha.variantes.find(v => v.id === linha.epiBookId);
                const classe = linha.classificacao ? CLASSIFICACAO[linha.classificacao] : null;
                return (
                  <li key={linha.chave} className={`grid gap-3 py-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center ${linha.incluir ? '' : 'opacity-55'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={linha.incluir}
                        onChange={e => atualizarLinha(linha.chave, { incluir: e.target.checked })}
                        className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
                        aria-label={`Entregar ${linha.grupoEpi}`}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{linha.grupoEpi}</p>
                          {classe && <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${classe.cor}`}>{classe.rotulo}</span>}
                          {linha.foraDaMatriz && <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">Fora da matriz</span>}
                        </div>
                        {linha.condicaoUso && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{linha.condicaoUso}</p>}
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          CA {variante?.ca || linha.caSemBook || '—'}{variante?.codigo_sap ? ` · SAP ${variante.codigo_sap}` : ''}
                        </p>
                        <UltimaEntrega ultima={ultima} dias={dias} pendentes={linha.pendentesDevolucao.length} />
                        {exigeRespostaDevolucao(linha) && (
                          <PerguntaDevolucao
                            linha={linha}
                            dataEntrega={dataEntrega}
                            responsavel={user.name}
                            destacarPendente={tentouAssinar}
                            onResponder={valor => atualizarLinha(linha.chave, { devolverAnteriores: valor })}
                          />
                        )}
                      </div>
                    </div>

                    <label className="grid gap-1">
                      <Rotulo>Tamanho / variante</Rotulo>
                      {linha.variantes.length > 1 ? (
                        <select value={linha.epiBookId || ''} onChange={e => atualizarLinha(linha.chave, { epiBookId: e.target.value })} className={inputCls}>
                          {linha.variantes.map(v => <option key={v.id} value={v.id}>{v.tamanho ? `Tam. ${v.tamanho}` : descricaoItemEpi(v)} · CA {v.ca}</option>)}
                        </select>
                      ) : (
                        <span className="truncate py-2 text-sm text-slate-600 dark:text-slate-300">{variante ? (variante.tamanho ? `Tam. ${variante.tamanho}` : 'Tamanho único') : 'Sem vínculo no Book'}</span>
                      )}
                    </label>

                    <div className="grid gap-1">
                      <Rotulo>Qtd.</Rotulo>
                      <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
                        <button type="button" onClick={() => atualizarLinha(linha.chave, { quantidade: Math.max(1, linha.quantidade - 1) })} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white" aria-label="Diminuir"><Minus className="h-3.5 w-3.5" /></button>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={linha.quantidade}
                          onChange={e => atualizarLinha(linha.chave, { quantidade: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-12 bg-transparent text-center text-sm font-bold outline-none"
                          aria-label={`Quantidade de ${linha.grupoEpi}`}
                        />
                        <button type="button" onClick={() => atualizarLinha(linha.chave, { quantidade: linha.quantidade + 1 })} className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white" aria-label="Aumentar"><Plus className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>

                    <div className="flex items-end gap-2">
                      <label className="grid min-w-0 flex-1 gap-1">
                        <Rotulo>Motivo (M.E.D.)</Rotulo>
                        <select value={linha.motivo} onChange={e => atualizarLinha(linha.chave, { motivo: Number(e.target.value) as MotivoMed })} className={inputCls}>
                          {([1, 2, 3, 4] as MotivoMed[]).map(m => <option key={m} value={m}>{m}. {MOTIVOS_MED[m]}</option>)}
                        </select>
                      </label>
                      {linha.foraDaMatriz && (
                        <button type="button" onClick={() => setLinhas(atual => atual.filter(l => l.chave !== linha.chave))} className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" aria-label={`Remover ${linha.grupoEpi}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Adicionar EPI fora da matriz */}
          <div className="relative mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 dark:border-slate-700">
              <Plus className="h-4 w-4 text-slate-400" />
              <input value={buscaEpi} onChange={e => setBuscaEpi(e.target.value)} placeholder="Adicionar outro EPI do Book (nome, CA ou código SAP)" className="w-full bg-transparent py-2 text-sm outline-none" />
            </label>
            {resultadosEpi.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {resultadosEpi.map(epi => (
                  <li key={epi.id}>
                    <button type="button" onClick={() => adicionarEpi(epi)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{epi.grupo_epi}</span>
                      <span className="text-xs text-slate-500">{epi.categoria}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 3. Finalizar */}
      {pessoa && funcaoId && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">3</span> Assinatura
          </h2>
          <label className="mt-3 grid gap-1">
            <Rotulo>Observações (opcional)</Rotulo>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className={inputCls} />
          </label>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              <span className="font-bold text-slate-900 dark:text-slate-100">{incluidas.length}</span> {incluidas.length === 1 ? 'EPI' : 'EPIs'} ·{' '}
              <span className="font-bold text-slate-900 dark:text-slate-100">{formatarQuantidade(unidades)}</span> {unidades === 1 ? 'unidade' : 'unidades'}.
              O colaborador assina declarando o recebimento nos termos do FRM.SEG-0008.
              {semRespostaDevolucao > 0 && (
                <span className="mt-1 block font-bold text-red-600 dark:text-red-400">
                  Falta responder {semRespostaDevolucao === 1 ? '1 devolução' : `${semRespostaDevolucao} devoluções`} na troca (Sim/Não) para assinar.
                </span>
              )}
            </p>
            <button type="button" disabled={salvando || !incluidas.length} onClick={iniciarAssinatura} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />} Coletar assinatura e salvar
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="h-3 w-3" /> Lançada por {user.name}. Depois de assinada, a ficha só aceita devolução ou cancelamento.
          </p>
        </section>
      )}

      <SignaturePadModal
        isOpen={assinando}
        onClose={() => setAssinando(false)}
        onSave={salvar}
        title={`Assinatura de ${pessoa?.nome ?? 'colaborador'}`}
        subtitle="Declaro que recebi os EPIs relacionados, nos termos do FRM.SEG-0008"
      />
    </div>
  );
}

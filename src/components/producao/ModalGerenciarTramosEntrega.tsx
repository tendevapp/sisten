import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import {
  CONFIG_CATEGORIAS,
  determinarSubprojetoPorTorre,
  type TramoEntrega,
  type TramoId,
} from '../../lib/producaoEntrega';
import {
  atualizarTramoEntrega,
  permutarDoisTramosEntrega,
  reassociarOuTrocarTramoEntrega,
} from '../../lib/producaoApi';

interface ModalGerenciarTramosEntregaProps {
  tramos: TramoEntrega[];
  aoFechar: () => void;
  recarregar?: () => void;
}

export default function ModalGerenciarTramosEntrega({
  tramos,
  aoFechar,
  recarregar,
}: ModalGerenciarTramosEntregaProps) {
  const toast = useToast();

  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'permuta'>('lista');
  const [busca, setBusca] = useState('');
  const [filtroSubprojeto, setFiltroSubprojeto] = useState('todos');
  const [filtroTramo, setFiltroTramo] = useState<string>('todos');

  // Estado para edição inline de série
  const [serieEditando, setSerieEditando] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  // Estado para sub-modal de reatribuição de um tramo específico
  const [tramoParaReatribuir, setTramoParaReatribuir] = useState<TramoEntrega | null>(null);
  const [novaTorreDestino, setNovaTorreDestino] = useState<number>(1);
  const [novoTramoDestino, setNovoTramoDestino] = useState<TramoId>('T1');
  const [salvandoReatribuicao, setSalvandoReatribuicao] = useState(false);

  // Estado para a aba de Permuta Rápida
  const [idTramoA, setIdTramoA] = useState<string>('');
  const [idTramoB, setIdTramoB] = useState<string>('');
  const [executandoPermuta, setExecutandoPermuta] = useState(false);

  // Tramos filtrados para a tabela
  const tramosFiltrados = useMemo(() => {
    return tramos.filter(t => {
      if (filtroSubprojeto !== 'todos' && t.subprojeto_id !== filtroSubprojeto) {
        return false;
      }
      if (filtroTramo !== 'todos' && t.tramo !== filtroTramo) {
        return false;
      }
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase();
        const bateuTorre = `torre ${t.torre_numero}`.includes(termo) || `${t.torre_numero}` === termo;
        const bateuSerie = `${t.serie}`.includes(termo);
        const bateuTramo = t.tramo.toLowerCase().includes(termo);
        if (!bateuTorre && !bateuSerie && !bateuTramo) return false;
      }
      return true;
    });
  }, [tramos, filtroSubprojeto, filtroTramo, busca]);

  // Tramo em conflito na reatribuição individual
  const conflitoReatribuicao = useMemo(() => {
    if (!tramoParaReatribuir) return null;
    return tramos.find(
      t =>
        t.id !== tramoParaReatribuir.id &&
        t.torre_numero === novaTorreDestino &&
        t.tramo === novoTramoDestino,
    );
  }, [tramos, tramoParaReatribuir, novaTorreDestino, novoTramoDestino]);

  // Salvar número de série inline
  const handleSalvarSerieInline = async (tramo: TramoEntrega) => {
    const valorDigitado = serieEditando[tramo.id];
    if (valorDigitado === undefined) return;
    const num = parseInt(valorDigitado, 10);
    if (isNaN(num) || num <= 0) {
      toast.error('Informe um número de série válido.');
      return;
    }
    if (num === tramo.serie) {
      setSerieEditando(prev => {
        const next = { ...prev };
        delete next[tramo.id];
        return next;
      });
      return;
    }

    setSalvandoId(tramo.id);
    try {
      await atualizarTramoEntrega(tramo.id, { serie: num });
      toast.success(`Série do Tramo ${tramo.tramo} da Torre ${tramo.torre_numero} alterada para ${num}.`);
      setSerieEditando(prev => {
        const next = { ...prev };
        delete next[tramo.id];
        return next;
      });
      if (recarregar) recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar série.');
    } finally {
      setSalvandoId(null);
    }
  };

  // Abrir sub-modal de reatribuição
  const handleAbrirReatribuir = (tramo: TramoEntrega) => {
    setTramoParaReatribuir(tramo);
    setNovaTorreDestino(tramo.torre_numero);
    setNovoTramoDestino(tramo.tramo);
  };

  // Executar reatribuição individual (com swap se houver conflito)
  const handleExecutarReatribuicao = async () => {
    if (!tramoParaReatribuir) return;
    setSalvandoReatribuicao(true);
    try {
      const res = await reassociarOuTrocarTramoEntrega({
        idOrigem: tramoParaReatribuir.id,
        novaTorre: novaTorreDestino,
        novoTramo: novoTramoDestino,
      });

      if (res.swapped) {
        toast.success(
          `Permuta executada: Tramo ${tramoParaReatribuir.tramo} (Série ${tramoParaReatribuir.serie}) agora é Torre ${novaTorreDestino} e o tramo substituído foi para a Torre ${tramoParaReatribuir.torre_numero}.`,
        );
      } else {
        toast.success(
          `Tramo movido para a Torre ${novaTorreDestino} · ${novoTramoDestino} com sucesso.`,
        );
      }

      setTramoParaReatribuir(null);
      if (recarregar) recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao reatribuir tramo.');
    } finally {
      setSalvandoReatribuicao(false);
    }
  };

  // Executar permuta direta entre dois tramos
  const tramoA = useMemo(() => tramos.find(t => t.id === idTramoA), [tramos, idTramoA]);
  const tramoB = useMemo(() => tramos.find(t => t.id === idTramoB), [tramos, idTramoB]);

  const handleExecutarPermutaRapida = async () => {
    if (!idTramoA || !idTramoB || idTramoA === idTramoB) {
      toast.error('Selecione dois tramos distintos para permutar.');
      return;
    }
    setExecutandoPermuta(true);
    try {
      await permutarDoisTramosEntrega(idTramoA, idTramoB);
      toast.success(
        `Permuta concluída entre Torre ${tramoA?.torre_numero} (${tramoA?.tramo}) e Torre ${tramoB?.torre_numero} (${tramoB?.tramo})!`,
      );
      setIdTramoA('');
      setIdTramoB('');
      if (recarregar) recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao permutar tramos.');
    } finally {
      setExecutandoPermuta(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Gestão & Ajuste de Tramos das Torres
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajuste qual tramo pertence a qual torre ou altere o número de série da peça física.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas Superiores */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setAbaAtiva('lista')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold transition ${
              abaAtiva === 'lista'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Lista & Edição Geral ({tramosFiltrados.length})
          </button>
          <button
            type="button"
            onClick={() => setAbaAtiva('permuta')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold transition ${
              abaAtiva === 'permuta'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Permuta Direta (Trocar 2 Tramos)
          </button>
        </div>

        {/* Conteúdo Aba 1: Lista e Edição Geral */}
        {abaAtiva === 'lista' && (
          <div className="flex flex-1 flex-col overflow-hidden p-5">
            {/* Barra de Filtros */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Busca rápida */}
                <div className="relative min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar Torre, Série ou Tramo..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Subprojeto */}
                <select
                  value={filtroSubprojeto}
                  onChange={e => setFiltroSubprojeto(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="todos">Todos Subprojetos</option>
                  <option value="SP01">SP01 (Torres 1-23)</option>
                  <option value="SP02">SP02 (Torres 24-39)</option>
                  <option value="SP03">SP03 (Torres 40-69)</option>
                </select>

                {/* Posição / Tramo */}
                <select
                  value={filtroTramo}
                  onChange={e => setFiltroTramo(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="todos">Todos os Tramos</option>
                  <option value="T1">T1 (Base)</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                  <option value="T4">T4</option>
                  <option value="T5">T5 (Topo)</option>
                </select>
              </div>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                Mostrando <strong>{tramosFiltrados.length}</strong> tramos
              </span>
            </div>

            {/* Tabela com Scroll */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2 font-bold">Torre</th>
                    <th className="py-2.5 px-2 font-bold">Posição</th>
                    <th className="py-2.5 px-2 font-bold">Número de Série</th>
                    <th className="py-2.5 px-2 font-bold">Subprojeto</th>
                    <th className="py-2.5 px-2 font-bold">Processo / Etapa</th>
                    <th className="py-2.5 pr-4 text-right font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {tramosFiltrados.map(tramo => {
                    const conf = CONFIG_CATEGORIAS[tramo.etapa_categoria] || CONFIG_CATEGORIAS.saw02;
                    const valorInput = serieEditando[tramo.id] !== undefined ? serieEditando[tramo.id] : tramo.serie;
                    const mudouSerieLocal = serieEditando[tramo.id] !== undefined && Number(serieEditando[tramo.id]) !== tramo.serie;

                    return (
                      <tr key={tramo.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                        {/* Torre */}
                        <td className="py-2.5 pl-4 pr-2 font-black text-slate-900 dark:text-slate-100">
                          Torre {tramo.torre_numero}
                        </td>

                        {/* Tramo */}
                        <td className="py-2.5 px-2">
                          <span
                            className="inline-flex h-6 w-8 items-center justify-center rounded-md font-black text-xs shadow-inner"
                            style={{
                              background: conf.gradienteCilindro,
                              color: conf.textoClasse.includes('text-white') ? '#fff' : '#000',
                            }}
                          >
                            {tramo.tramo}
                          </span>
                        </td>

                        {/* Número de Série com input inline */}
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              value={valorInput}
                              onChange={e =>
                                setSerieEditando({ ...serieEditando, [tramo.id]: e.target.value })
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSalvarSerieInline(tramo);
                              }}
                              className={`w-24 rounded-lg border px-2 py-1 text-center font-mono text-xs font-bold transition focus:outline-none ${
                                mudouSerieLocal
                                  ? 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-400/20 dark:bg-blue-950/40 dark:text-blue-200'
                                  : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                              }`}
                            />
                            {mudouSerieLocal && (
                              <button
                                type="button"
                                onClick={() => handleSalvarSerieInline(tramo)}
                                disabled={salvandoId === tramo.id}
                                title="Salvar novo número de série"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                              >
                                {salvandoId === tramo.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Subprojeto */}
                        <td className="py-2.5 px-2 text-slate-500 dark:text-slate-400">
                          {tramo.subprojeto_id || 'SP01'}
                        </td>

                        {/* Processo / Etapa */}
                        <td className="py-2.5 px-2">
                          <span
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold"
                            style={{
                              backgroundColor: conf.hexPrimario,
                              color: conf.textoClasse.includes('text-white') ? '#fff' : '#000',
                            }}
                          >
                            {tramo.etapa_nome}
                          </span>
                        </td>

                        {/* Botão de Reatribuir Torre/Tramo */}
                        <td className="py-2.5 pr-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleAbrirReatribuir(tramo)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            Ajustar Torre
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conteúdo Aba 2: Permuta Rápida (Trocar 2 Tramos) */}
        {abaAtiva === 'permuta' && (
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                Permuta Direta Entre Duas Peças
              </h3>
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                Selecione o tramo de origem e o de destino. As posições, torres e subprojetos das duas peças serão invertidas de forma atômica e segura.
              </p>
            </div>

            <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-7">
              {/* Card Tramo A */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-3 dark:border-slate-800 dark:bg-slate-850">
                <span className="text-[11px] font-bold uppercase text-slate-500">Peça 1 (Origem)</span>
                <select
                  value={idTramoA}
                  onChange={e => setIdTramoA(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Selecione a Peça 1...</option>
                  {tramos.map(t => (
                    <option key={t.id} value={t.id}>
                      Torre {t.torre_numero} · {t.tramo} (Série {t.serie}) — {t.etapa_nome}
                    </option>
                  ))}
                </select>

                {tramoA && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      Torre {tramoA.torre_numero} · Tramo {tramoA.tramo}
                    </p>
                    <p className="text-slate-500">
                      Série: <strong>{tramoA.serie}</strong> · Subprojeto: {tramoA.subprojeto_id}
                    </p>
                    <p className="text-slate-500">
                      Etapa Atual: <strong>{tramoA.etapa_nome}</strong> ({tramoA.etapa_categoria})
                    </p>
                  </div>
                )}
              </div>

              {/* Ícone Swap Central */}
              <div className="flex justify-center sm:col-span-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <ArrowLeftRight className="h-5 w-5" />
                </div>
              </div>

              {/* Card Tramo B */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-3 dark:border-slate-800 dark:bg-slate-850">
                <span className="text-[11px] font-bold uppercase text-slate-500">Peça 2 (Destino)</span>
                <select
                  value={idTramoB}
                  onChange={e => setIdTramoB(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">Selecione a Peça 2...</option>
                  {tramos.map(t => (
                    <option key={t.id} value={t.id} disabled={t.id === idTramoA}>
                      Torre {t.torre_numero} · {t.tramo} (Série {t.serie}) — {t.etapa_nome}
                    </option>
                  ))}
                </select>

                {tramoB && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800">
                    <p className="font-bold text-slate-800 dark:text-slate-100">
                      Torre {tramoB.torre_numero} · Tramo {tramoB.tramo}
                    </p>
                    <p className="text-slate-500">
                      Série: <strong>{tramoB.serie}</strong> · Subprojeto: {tramoB.subprojeto_id}
                    </p>
                    <p className="text-slate-500">
                      Etapa Atual: <strong>{tramoB.etapa_nome}</strong> ({tramoB.etapa_categoria})
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Resumo visual do Swap */}
            {tramoA && tramoB && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <strong className="block font-bold">Resultado da Permuta:</strong>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  <li>
                    A peça <strong>Série {tramoA.serie}</strong> passará a ser{' '}
                    <strong>
                      Torre {tramoB.torre_numero} · Tramo {tramoB.tramo}
                    </strong>
                  </li>
                  <li>
                    A peça <strong>Série {tramoB.serie}</strong> passará a ser{' '}
                    <strong>
                      Torre {tramoA.torre_numero} · Tramo {tramoA.tramo}
                    </strong>
                  </li>
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleExecutarPermutaRapida}
                disabled={!idTramoA || !idTramoB || idTramoA === idTramoB || executandoPermuta}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50"
              >
                {executandoPermuta ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Confirmar Permuta das Peças
              </button>
            </div>
          </div>
        )}

        {/* Sub-modal de Reatribuição de Torre/Tramo Individual */}
        {tramoParaReatribuir && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-slate-100">
                  Reatribuir Tramo · Série {tramoParaReatribuir.serie}
                </h3>
                <button
                  type="button"
                  onClick={() => setTramoParaReatribuir(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                  Posição Atual:{' '}
                  <strong>
                    Torre {tramoParaReatribuir.torre_numero} · Tramo {tramoParaReatribuir.tramo}
                  </strong>{' '}
                  (Série {tramoParaReatribuir.serie})
                </div>

                {/* Seleção de Nova Torre */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Nova Torre (1 a 69)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="69"
                    value={novaTorreDestino}
                    onChange={e => setNovaTorreDestino(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-black text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* Seleção de Tramo */}
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Posição na Torre
                  </label>
                  <div className="mt-1 flex gap-1">
                    {(['T1', 'T2', 'T3', 'T4', 'T5'] as TramoId[]).map(tId => (
                      <button
                        key={tId}
                        type="button"
                        onClick={() => setNovoTramoDestino(tId)}
                        className={`flex-1 rounded-lg py-2 text-xs font-black transition ${
                          novoTramoDestino === tId
                            ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-500'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {tId}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Diagnóstico de Conflito */}
                {conflitoReatribuicao ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                    <strong className="block font-bold">Aviso de Permuta (Swap):</strong>A Torre {novaTorreDestino} já possui o tramo {novoTramoDestino} (Série {conflitoReatribuicao.serie}). As duas peças trocarão de torre automaticamente.
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    Slot livre na Torre {novaTorreDestino}. O tramo será transferido diretamente.
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setTramoParaReatribuir(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExecutarReatribuicao}
                    disabled={salvandoReatribuicao}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {salvandoReatribuicao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Confirmar Ajuste
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

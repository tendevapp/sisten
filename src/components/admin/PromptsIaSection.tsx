/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gestão de APIs → Prompts de IA.
 *
 * Mostra e edita a instrução que cada Edge Function manda ao modelo. Quem
 * percebe a IA errando um tipo de item é o comprador na tela de curadoria, não
 * quem faz deploy — aqui ele corrige a regra, salva, e a próxima chamada já
 * usa o texto novo.
 *
 * Cada gravação incrementa a versão; a Edge Function devolve a versão que
 * rodou, e o consumo fica no painel de uso logo abaixo, então dá para
 * comparar "mudei o prompt na versão 4" com o custo e o acerto depois disso.
 */

import React, { useEffect, useState } from 'react';
import {
  FileTerminal,
  Loader2,
  Save,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Layers,
  Cpu,
  SlidersHorizontal,
  Bot,
  Info,
  Check,
} from 'lucide-react';
import {
  listarPromptsIa,
  salvarPromptIa,
  type PromptIa,
  type ProvedorIaId,
  type ParametrosPromptIa,
  PROVEDORES_IA_INFO,
  ORDEM_PROVEDORES_PADRAO,
} from '../../lib/iaPromptsApi';
import { useToast } from '../ui/Toast';

interface Props {
  usuarioId?: string | null;
  usuarioNome?: string | null;
}

export default function PromptsIaSection({ usuarioId, usuarioNome }: Props) {
  const toast = useToast();
  const [prompts, setPrompts] = useState<PromptIa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Estados de Provedores e Fallback
  const [ordemProvedores, setOrdemProvedores] = useState<ProvedorIaId[]>(ORDEM_PROVEDORES_PADRAO);
  const [provedoresAtivos, setProvedoresAtivos] = useState<ProvedorIaId[]>(ORDEM_PROVEDORES_PADRAO);
  const [modeloGemini, setModeloGemini] = useState<string>(PROVEDORES_IA_INFO.gemini.modeloPadrao);
  const [modeloOpenrouter, setModeloOpenrouter] = useState<string>(PROVEDORES_IA_INFO.openrouter.modeloPadrao);
  const [modeloOpenai, setModeloOpenai] = useState<string>(PROVEDORES_IA_INFO.openai.modeloPadrao);
  const [abaAtiva, setAbaAtiva] = useState<'prioridade' | 'prompt'>('prioridade');

  const carregar = async () => {
    setCarregando(true);
    try {
      const lista = await listarPromptsIa();
      setPrompts(lista);
      if (lista.length && !selecionada) selecionar(lista[0]);
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao carregar os prompts.');
    } finally {
      setCarregando(false);
    }
  };

  const selecionar = (p: PromptIa) => {
    setSelecionada(p.chave);
    setRascunho(p.prompt);
    setAtivo(p.ativo);

    const params = p.parametros ?? {};
    const ordem = Array.isArray(params.ordem_provedores) && params.ordem_provedores.length > 0
      ? params.ordem_provedores
      : ORDEM_PROVEDORES_PADRAO;
    const ativos = Array.isArray(params.provedores_ativos) && params.provedores_ativos.length > 0
      ? params.provedores_ativos
      : ordem;

    setOrdemProvedores(ordem);
    setProvedoresAtivos(ativos);
    setModeloGemini(params.modelo_gemini || PROVEDORES_IA_INFO.gemini.modeloPadrao);
    setModeloOpenrouter(params.modelo_openrouter || PROVEDORES_IA_INFO.openrouter.modeloPadrao);
    setModeloOpenai(params.modelo_openai || PROVEDORES_IA_INFO.openai.modeloPadrao);
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atual = prompts.find(p => p.chave === selecionada) ?? null;

  const alterado = atual
    ? rascunho !== atual.prompt ||
      ativo !== atual.ativo ||
      JSON.stringify(ordemProvedores) !== JSON.stringify(atual.parametros?.ordem_provedores) ||
      JSON.stringify(provedoresAtivos) !== JSON.stringify(atual.parametros?.provedores_ativos) ||
      modeloGemini !== (atual.parametros?.modelo_gemini || PROVEDORES_IA_INFO.gemini.modeloPadrao) ||
      modeloOpenrouter !== (atual.parametros?.modelo_openrouter || PROVEDORES_IA_INFO.openrouter.modeloPadrao) ||
      modeloOpenai !== (atual.parametros?.modelo_openai || PROVEDORES_IA_INFO.openai.modeloPadrao)
    : false;

  const moverProvedor = (index: number, direcao: 'cima' | 'baixo') => {
    const novoIndex = direcao === 'cima' ? index - 1 : index + 1;
    if (novoIndex < 0 || novoIndex >= ordemProvedores.length) return;
    const novaOrdem = [...ordemProvedores];
    const temp = novaOrdem[index];
    novaOrdem[index] = novaOrdem[novoIndex];
    novaOrdem[novoIndex] = temp;
    setOrdemProvedores(novaOrdem);
  };

  const alternarProvedorAtivo = (id: ProvedorIaId) => {
    if (provedoresAtivos.includes(id)) {
      if (provedoresAtivos.length <= 1) {
        toast.warning('Ao menos um provedor precisa permanecer ativo.');
        return;
      }
      setProvedoresAtivos(provedoresAtivos.filter(p => p !== id));
    } else {
      setProvedoresAtivos([...provedoresAtivos, id]);
    }
  };

  const aplicarPreset = (tipo: 'gemini-primeiro' | 'deepseek-primeiro' | 'somente-gemini') => {
    if (tipo === 'gemini-primeiro') {
      setOrdemProvedores(['gemini', 'openrouter', 'openai']);
      setProvedoresAtivos(['gemini', 'openrouter', 'openai']);
      setModeloGemini(PROVEDORES_IA_INFO.gemini.modeloPadrao);
      setModeloOpenrouter(PROVEDORES_IA_INFO.openrouter.modeloPadrao);
      setModeloOpenai(PROVEDORES_IA_INFO.openai.modeloPadrao);
      toast.info('Preset aplicado: Gemini Primário ➔ DeepSeek Fallback ➔ OpenAI');
    } else if (tipo === 'deepseek-primeiro') {
      setOrdemProvedores(['openrouter', 'gemini', 'openai']);
      setProvedoresAtivos(['openrouter', 'gemini', 'openai']);
      setModeloOpenrouter('deepseek/deepseek-v4-flash');
      setModeloGemini(PROVEDORES_IA_INFO.gemini.modeloPadrao);
      setModeloOpenai(PROVEDORES_IA_INFO.openai.modeloPadrao);
      toast.info('Preset aplicado: DeepSeek (OpenRouter) Primário ➔ Gemini Fallback');
    } else if (tipo === 'somente-gemini') {
      setOrdemProvedores(['gemini', 'openrouter', 'openai']);
      setProvedoresAtivos(['gemini']);
      setModeloGemini(PROVEDORES_IA_INFO.gemini.modeloPadrao);
      toast.info('Preset aplicado: Somente Google Gemini');
    }
  };

  const salvar = async () => {
    if (!atual) return;
    setSalvando(true);
    try {
      const primeiroAtivo = ordemProvedores.find(id => provedoresAtivos.includes(id)) || ordemProvedores[0];
      const modeloPrincipal =
        primeiroAtivo === 'gemini'
          ? modeloGemini
          : primeiroAtivo === 'openrouter'
          ? modeloOpenrouter
          : modeloOpenai;

      const parametrosAtualizados: ParametrosPromptIa = {
        ...(atual.parametros ?? {}),
        ordem_provedores: ordemProvedores,
        provedores_ativos: provedoresAtivos,
        modelo_gemini: modeloGemini.trim(),
        modelo_openrouter: modeloOpenrouter.trim(),
        modelo_openai: modeloOpenai.trim(),
      };

      const atualizado = await salvarPromptIa({
        chave: atual.chave,
        prompt: rascunho,
        modelo: modeloPrincipal,
        ativo,
        usuarioId,
        usuarioNome,
        versaoAtual: atual.versao,
        parametros: parametrosAtualizados,
      });

      setPrompts(lista => lista.map(p => (p.chave === atualizado.chave ? atualizado : p)));
      toast.success(`Prompt salvo na versão ${atualizado.versao}. A ordem de modelos vale a partir da próxima execução.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao salvar o prompt.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
      {/* Datalists de sugestões de modelos */}
      <datalist id="sugestoes-gemini">
        {PROVEDORES_IA_INFO.gemini.modelosSugeridos.map(m => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="sugestoes-openrouter">
        {PROVEDORES_IA_INFO.openrouter.modelosSugeridos.map(m => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="sugestoes-openai">
        {PROVEDORES_IA_INFO.openai.modelosSugeridos.map(m => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="rounded-xl bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
              Prompts e Ordem de Prioridade das IAs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Escolha qual modelo usar primeiro e defina a cadeia de fallback automático (ex: Gemini ➔ DeepSeek OpenRouter ➔ OpenAI).
            </p>
          </div>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : prompts.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Nenhum prompt cadastrado ainda.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
          {/* Coluna da esquerda: lista de endpoints/prompts */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
              Rotinas com IA
            </span>
            {prompts.map(p => (
              <button
                key={p.chave}
                type="button"
                onClick={() => selecionar(p)}
                className={`w-full rounded-xl border p-3 text-left transition-all cursor-pointer ${
                  p.chave === selecionada
                    ? 'border-violet-400 bg-violet-50/70 shadow-xs dark:border-violet-500 dark:bg-violet-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{p.titulo}</span>
                  {p.ativo ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  )}
                </div>
                <span className="mt-1 block font-mono text-[10px] text-slate-400">{p.chave}</span>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-violet-700 dark:text-violet-300">
                    1º {p.parametros?.ordem_provedores?.[0] ? PROVEDORES_IA_INFO[p.parametros.ordem_provedores[0]]?.nome?.split(' ')[0] : 'IA'}
                  </span>
                  <span>v{p.versao}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Coluna da direita: detalhes e configuração */}
          {atual && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{atual.titulo}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{atual.descricao}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ativo}
                      onChange={e => setAtivo(e.target.checked)}
                      className="h-4 w-4 rounded accent-violet-600 cursor-pointer"
                    />
                    Ativo
                  </label>
                  <span className="text-[10px] text-slate-400">
                    v{atual.versao} · {new Date(atual.updated_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>

              {/* Seletor de abas */}
              <div className="flex border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAbaAtiva('prioridade')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    abaAtiva === 'prioridade'
                      ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5" />
                  Ordem de Prioridade & Fallback
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva('prompt')}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    abaAtiva === 'prompt'
                      ? 'border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <FileTerminal className="h-3.5 w-3.5" />
                  Instruções do Prompt ({rascunho.length.toLocaleString('pt-BR')} carac.)
                </button>
              </div>

              {/* Conteúdo da Aba 1: Prioridade & Fallback */}
              {abaAtiva === 'prioridade' && (
                <div className="space-y-4">
                  {/* Presets Rápidos */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Presets rápidos:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => aplicarPreset('gemini-primeiro')}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer transition-colors"
                      >
                        Gemini ➔ DeepSeek ➔ OpenAI
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarPreset('deepseek-primeiro')}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer transition-colors"
                      >
                        DeepSeek (OpenRouter) ➔ Gemini
                      </button>
                      <button
                        type="button"
                        onClick={() => aplicarPreset('somente-gemini')}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer transition-colors"
                      >
                        Apenas Gemini
                      </button>
                    </div>
                  </div>

                  {/* Resumo da Cadeia Ativa */}
                  <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs dark:border-violet-900/40 dark:bg-violet-950/20">
                    <span className="block font-bold text-violet-900 dark:text-violet-200 mb-1.5 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      Cadeia de execução configurada para esta função:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {ordemProvedores.map((id, idx) => {
                        const ativo = provedoresAtivos.includes(id);
                        const info = PROVEDORES_IA_INFO[id];
                        const modelo =
                          id === 'gemini'
                            ? modeloGemini
                            : id === 'openrouter'
                            ? modeloOpenrouter
                            : modeloOpenai;

                        return (
                          <React.Fragment key={id}>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold border ${
                                !ativo
                                  ? 'border-dashed border-slate-300 text-slate-400 dark:border-slate-700 dark:text-slate-600 line-through opacity-70'
                                  : idx === 0
                                  ? 'border-violet-400 bg-violet-600 text-white shadow-xs'
                                  : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <span className="font-mono text-[10px] opacity-80">{idx + 1}º</span>
                              <span>{info.nome}</span>
                              <span className="font-mono text-[10px] opacity-80">({modelo})</span>
                            </span>
                            {idx < ordemProvedores.length - 1 && (
                              <span className="text-slate-400 font-bold text-xs">➔</span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lista Reordenável de Provedores */}
                  <div className="space-y-3">
                    {ordemProvedores.map((id, index) => {
                      const info = PROVEDORES_IA_INFO[id];
                      const ativo = provedoresAtivos.includes(id);
                      const isPrimeiro = index === 0;
                      const isUltimo = index === ordemProvedores.length - 1;

                      const valorModelo =
                        id === 'gemini'
                          ? modeloGemini
                          : id === 'openrouter'
                          ? modeloOpenrouter
                          : modeloOpenai;

                      const setValorModelo = (v: string) => {
                        if (id === 'gemini') setModeloGemini(v);
                        else if (id === 'openrouter') setModeloOpenrouter(v);
                        else setModeloOpenai(v);
                      };

                      return (
                        <div
                          key={id}
                          className={`rounded-xl border p-3.5 transition-all ${
                            !ativo
                              ? 'border-slate-200 bg-slate-50/50 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                              : isPrimeiro
                              ? 'border-violet-300 bg-violet-50/30 dark:border-violet-700/60 dark:bg-violet-950/20'
                              : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {/* Controles de Posição / Ordem */}
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  title="Mover para cima"
                                  disabled={isPrimeiro}
                                  onClick={() => moverProvedor(index, 'cima')}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Mover para baixo"
                                  disabled={isUltimo}
                                  onClick={() => moverProvedor(index, 'baixo')}
                                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-20 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* Badge de Ordem e Nome */}
                              <div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                      isPrimeiro
                                        ? 'bg-violet-600 text-white'
                                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                    }`}
                                  >
                                    {index + 1}º {isPrimeiro ? 'Primário' : `Fallback`}
                                  </span>
                                  <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                    {info.nome}
                                  </h5>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">{info.subtitulo}</p>
                              </div>
                            </div>

                            {/* Checkbox Ativo */}
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={ativo}
                                onChange={() => alternarProvedorAtivo(id)}
                                className="h-4 w-4 rounded accent-violet-600 cursor-pointer"
                              />
                              Incluir na execução
                            </label>
                          </div>

                          {/* Campo de Modelo do Provedor */}
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                            <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-1 min-w-[260px]">
                              <span>Modelo para {info.nome}:</span>
                              <input
                                list={`sugestoes-${id}`}
                                value={valorModelo}
                                disabled={!ativo}
                                onChange={e => setValorModelo(e.target.value)}
                                placeholder={info.modeloPadrao}
                                className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 disabled:opacity-50"
                              />
                            </label>

                            <div className="flex items-center gap-1.5">
                              {info.modelosSugeridos.slice(0, 3).map(sugestao => (
                                <button
                                  key={sugestao}
                                  type="button"
                                  disabled={!ativo || valorModelo === sugestao}
                                  onClick={() => setValorModelo(sugestao)}
                                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer border ${
                                    valorModelo === sugestao
                                      ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-300'
                                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                >
                                  {sugestao}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Conteúdo da Aba 2: Instruções do Prompt */}
              {abaAtiva === 'prompt' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Você pode ajustar as instruções do prompt. O texto salvo é utilizado imediatamente na próxima chamada.
                    </span>
                  </div>

                  <textarea
                    value={rascunho}
                    onChange={e => setRascunho(e.target.value)}
                    rows={16}
                    spellCheck={false}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 shadow-inner"
                  />
                </div>
              )}

              {/* Barra de Ações Inferior */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Info className="h-3.5 w-3.5 text-slate-400" />
                  <span>
                    {alterado ? 'Há alterações não salvas' : 'Configurações sincronizadas com a versão atual'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selecionar(atual)}
                    disabled={!alterado || salvando}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={salvar}
                    disabled={!alterado || salvando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40 cursor-pointer shadow-xs transition-colors"
                  >
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar versão {atual.versao + 1}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

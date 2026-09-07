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
import { FileTerminal, Loader2, Save, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { listarPromptsIa, salvarPromptIa, type PromptIa } from '../../lib/iaPromptsApi';
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
  const [modelo, setModelo] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [salvando, setSalvando] = useState(false);

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
    setModelo(p.modelo ?? '');
    setAtivo(p.ativo);
  };

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atual = prompts.find(p => p.chave === selecionada) ?? null;
  const alterado = atual ? rascunho !== atual.prompt || (atual.modelo ?? '') !== modelo || atual.ativo !== ativo : false;

  const salvar = async () => {
    if (!atual) return;
    setSalvando(true);
    try {
      const atualizado = await salvarPromptIa({
        chave: atual.chave,
        prompt: rascunho,
        modelo: modelo || null,
        ativo,
        usuarioId,
        usuarioNome,
        versaoAtual: atual.versao,
      });
      setPrompts(lista => lista.map(p => (p.chave === atualizado.chave ? atualizado : p)));
      toast.success(`Prompt salvo na versão ${atualizado.versao}. Vale a partir da próxima chamada.`);
    } catch (err: any) {
      toast.error(err.message ?? 'Falha ao salvar o prompt.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
          <FileTerminal className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Prompts de IA</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A instrução que cada Edge Function manda ao modelo. Salvar já vale para a próxima chamada — sem deploy.
          </p>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : prompts.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Nenhum prompt cadastrado ainda.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-1.5">
            {prompts.map(p => (
              <button
                key={p.chave}
                type="button"
                onClick={() => selecionar(p)}
                className={`w-full rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                  p.chave === selecionada
                    ? 'border-violet-400 bg-violet-50/70 dark:border-violet-500 dark:bg-violet-950/30'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                }`}
              >
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{p.titulo}</span>
                <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{p.chave}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  {p.ativo ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <XCircle className="h-3 w-3 text-rose-500" />
                  )}
                  v{p.versao}
                </span>
              </button>
            ))}
          </div>

          {atual && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">{atual.descricao}</p>

              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Modelo
                  <input
                    value={modelo}
                    onChange={e => setModelo(e.target.value)}
                    placeholder="gemini-3.6-flash"
                    className="ml-2 w-56 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="h-4 w-4 rounded" />
                  Ativo
                </label>
                <span className="text-[10px] text-slate-400">
                  v{atual.versao}
                  {atual.atualizado_por_nome ? ` · último ajuste por ${atual.atualizado_por_nome}` : ''}
                  {` · ${new Date(atual.updated_at).toLocaleString('pt-BR')}`}
                </span>
              </div>

              <textarea
                value={rascunho}
                onChange={e => setRascunho(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {rascunho.length.toLocaleString('pt-BR')} caracteres
                  {Object.keys(atual.parametros ?? {}).length > 0 && (
                    <> · parâmetros: {JSON.stringify(atual.parametros)}</>
                  )}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selecionar(atual)}
                    disabled={!alterado || salvando}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={salvar}
                    disabled={!alterado || salvando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40 cursor-pointer"
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

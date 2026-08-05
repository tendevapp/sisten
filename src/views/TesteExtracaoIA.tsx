/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página de teste: cola markdown de cotação (ex.: saída do MarkItDown) e usa
 * a IA da OpenRouter para estruturar fornecedor, itens, quantidades e preços
 * em uma tabela. Só exibe o resultado — não persiste nada no banco.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, AlertCircle, ClipboardPaste, Timer, Coins, CheckCircle2 } from 'lucide-react';

interface TesteExtracaoIAProps {
  user: { name: string };
}

interface ItemExtraido {
  fornecedor: string;
  descricao: string;
  quantidade: string;
  unidade: string;
  preco_unitario: string;
  preco_total: string;
}

interface Uso {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

type Etapa = 'idle' | 'enviando' | 'aguardando' | 'processando' | 'concluido' | 'erro';

const ETAPA_LABEL: Record<Etapa, string> = {
  idle: '',
  enviando: 'Enviando requisição...',
  aguardando: 'Aguardando resposta da IA...',
  processando: 'Processando resposta...',
  concluido: 'Concluído',
  erro: 'Falhou',
};

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || import.meta.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';

const SYSTEM_PROMPT = `Você extrai dados de cotações/orçamentos de fornecedores a partir de texto em Markdown (pode conter múltiplos documentos/fornecedores no mesmo texto).

Para cada item de cada documento, extraia:
- fornecedor: razão social ou nome do fornecedor daquele documento
- descricao: descrição do item/produto
- quantidade: quantidade cotada (só o número, como string)
- unidade: unidade (UN, PC, JG, etc.), vazio se não houver
- preco_unitario: preço unitário em reais, só o número com ponto decimal (ex.: "116.56"), sem "R$"
- preco_total: preço total da linha, mesmo formato

Responda APENAS com um JSON válido, sem markdown, sem comentários, no formato:
{"itens": [{"fornecedor": "...", "descricao": "...", "quantidade": "...", "unidade": "...", "preco_unitario": "...", "preco_total": "..."}]}`;

/**
 * Corta a resposta no fim do último item completo e fecha `]}` manualmente.
 * Usado quando a resposta veio cortada (estourou max_tokens) e o JSON está
 * incompleto — em vez de descartar tudo, recupera os itens que já vieram
 * inteiros.
 */
function repararJsonTruncado(bruto: string): { itens: ItemExtraido[] } {
  const ultimoObjetoFechado = bruto.lastIndexOf('}');
  if (ultimoObjetoFechado === -1) throw new Error('Resposta da IA veio cortada antes do primeiro item.');
  const reparado = bruto.slice(0, ultimoObjetoFechado + 1) + ']}';
  return JSON.parse(reparado);
}

/** Alguns modelos retornam `content` como array de partes em vez de string. */
function extrairConteudo(message: any): string {
  const content = message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const texto = content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
    if (texto.trim()) return texto;
  }
  return '';
}

function extrairJson(texto: string): { itens: ItemExtraido[] } {
  const limpo = texto.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = limpo.indexOf('{');
  if (inicio === -1) throw new Error('A IA não retornou um JSON reconhecível.');

  const fim = limpo.lastIndexOf('}');
  const bruto = fim === -1 ? limpo.slice(inicio) : limpo.slice(inicio, fim + 1);

  try {
    return JSON.parse(bruto);
  } catch {
    // Resposta provavelmente truncada por limite de tokens — tenta recuperar
    // os itens completos que já vieram antes do corte.
    return repararJsonTruncado(bruto);
  }
}

async function chamarOpenRouter(
  markdown: string,
  onEtapa: (etapa: Etapa) => void
): Promise<{ itens: ItemExtraido[]; uso: Uso | null; truncado: boolean }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('Chave da OpenRouter não configurada (VITE_OPENROUTER_API_KEY).');
  }

  onEtapa('enviando');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'SISTEN Teste Extração IA',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: markdown },
      ],
      temperature: 0,
      // O texto colado costuma ter dezenas de itens — a saída em JSON
      // estruturado fica maior que o texto de entrada. 8000 estourava o
      // limite e cortava o JSON no meio (erro de parse).
      max_tokens: 32000,
      response_format: { type: 'json_object' },
      // Modelos de raciocínio (ex.: DeepSeek) gastam parte do max_tokens
      // "pensando" antes de escrever a resposta final — em entradas grandes
      // isso já consumia o limite inteiro e a resposta chegava sem `content`.
      reasoning: { enabled: false },
    }),
  });

  onEtapa('aguardando');

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `OpenRouter retornou HTTP ${res.status}.`);
  }

  const data = await res.json();
  onEtapa('processando');

  const choice = data.choices?.[0];
  const truncado = choice?.finish_reason === 'length';
  const content = extrairConteudo(choice?.message);

  if (!content) {
    console.error('Resposta da OpenRouter sem conteúdo utilizável:', data);
    const motivo = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : '';
    throw new Error(
      truncado
        ? 'A IA gastou todo o limite de tokens antes de escrever a resposta e não sobrou conteúdo. Tente colar um trecho menor.'
        : `A IA não retornou conteúdo${motivo}. Veja o console do navegador para a resposta completa.`
    );
  }

  let parsed: { itens: ItemExtraido[] };
  try {
    parsed = extrairJson(content);
  } catch (err) {
    throw new Error(
      truncado
        ? 'A resposta da IA estourou o limite de tokens e veio incompleta demais para recuperar. Tente colar um texto menor.'
        : `Não foi possível interpretar o JSON da IA: ${(err as Error).message}`
    );
  }
  if (!Array.isArray(parsed.itens)) throw new Error('JSON retornado não contém a lista "itens".');

  const uso: Uso | null = data.usage
    ? {
        prompt_tokens: data.usage.prompt_tokens ?? 0,
        completion_tokens: data.usage.completion_tokens ?? 0,
        total_tokens: data.usage.total_tokens ?? 0,
      }
    : null;

  return { itens: parsed.itens, uso, truncado };
}

export default function TesteExtracaoIA({ user }: TesteExtracaoIAProps) {
  const [markdown, setMarkdown] = useState('');
  const [itens, setItens] = useState<ItemExtraido[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('idle');
  const [uso, setUso] = useState<Uso | null>(null);
  const [truncado, setTruncado] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const inicioRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cronômetro: roda a cada 100ms enquanto está processando e para assim que
  // termina (sucesso ou erro), congelando o tempo final na tela.
  useEffect(() => {
    if (carregando) {
      inicioRef.current = Date.now();
      setElapsedMs(0);
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (inicioRef.current ?? Date.now()));
      }, 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [carregando]);

  const handleProcessar = async () => {
    if (!markdown.trim() || carregando) return;
    setCarregando(true);
    setErro(null);
    setItens(null);
    setUso(null);
    setTruncado(false);
    setEtapa('enviando');
    try {
      const resultado = await chamarOpenRouter(markdown, setEtapa);
      setItens(resultado.itens);
      setUso(resultado.uso);
      setTruncado(resultado.truncado);
      setEtapa('concluido');
    } catch (err) {
      setErro((err as Error).message);
      setEtapa('erro');
    } finally {
      setCarregando(false);
    }
  };

  const segundos = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-indigo-500" />
          Teste — Extração de Cotação com IA
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cole o markdown da cotação (ex.: saída do MarkItDown) e a IA estrutura fornecedor, itens, quantidades e preços em uma tabela.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Markdown da cotação
        </label>
        <textarea
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          placeholder="Cole aqui o markdown com uma ou mais cotações..."
          rows={14}
          className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{markdown.length.toLocaleString('pt-BR')} caracteres</span>
          <button
            type="button"
            onClick={handleProcessar}
            disabled={!markdown.trim() || carregando}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none"
          >
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {carregando ? 'Processando...' : 'Processar com IA'}
          </button>
        </div>
      </div>

      {etapa !== 'idle' && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Timer className="h-4 w-4 text-indigo-500" />
            <span className="font-mono font-semibold">{segundos}s</span>
          </span>

          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Coins className="h-4 w-4 text-amber-500" />
            {uso ? (
              <span className="font-mono">
                {uso.prompt_tokens.toLocaleString('pt-BR')} + {uso.completion_tokens.toLocaleString('pt-BR')} = <strong>{uso.total_tokens.toLocaleString('pt-BR')}</strong> tokens
              </span>
            ) : (
              <span className="text-slate-400">tokens: aguardando resposta...</span>
            )}
          </span>

          <span className={`ml-auto inline-flex items-center gap-1.5 font-medium ${
            etapa === 'erro' ? 'text-red-600 dark:text-red-400' : etapa === 'concluido' ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'
          }`}>
            {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
            {etapa === 'concluido' && <CheckCircle2 className="h-4 w-4" />}
            {etapa === 'erro' && <AlertCircle className="h-4 w-4" />}
            {ETAPA_LABEL[etapa]}
          </span>
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {truncado && itens && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>A resposta da IA foi cortada por estourar o limite de tokens de saída. Mostrando os {itens.length} itens que vieram completos — os últimos itens do texto colado podem estar faltando. Tente colar um trecho menor se precisar do restante.</span>
        </div>
      )}

      {itens && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <th className="px-4 py-2.5">Fornecedor</th>
                <th className="px-4 py-2.5">Descrição</th>
                <th className="px-4 py-2.5 text-right">Qtd.</th>
                <th className="px-4 py-2.5">Unid.</th>
                <th className="px-4 py-2.5 text-right">Preço Unit.</th>
                <th className="px-4 py-2.5 text-right">Preço Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Nenhum item extraído.
                  </td>
                </tr>
              ) : (
                itens.map((item, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{item.fornecedor}</td>
                    <td className="px-4 py-2.5 text-slate-700 dark:text-slate-200">{item.descricao}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200">{item.quantidade}</td>
                    <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">{item.unidade}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-200">{item.preco_unitario}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-900 dark:text-slate-50">{item.preco_total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Componente "ApiManagement" — Gestão, Monitoramento, Diagnóstico em Lote e Playground de Todas as APIs e Edge Functions do SISTEN.
 */

import React, { useState } from 'react';
import {
  Cpu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Layers,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  Play,
  CheckCheck,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../../db/supabaseClient';
import { gerarConteudoGemini } from '../../lib/geminiApi';
import { extrairCotacao } from '../../lib/cotacoesApi';
import UsageAnalyticsSection from './UsageAnalyticsSection';

interface ApiEndpointInfo {
  id: string;
  nome: string;
  funcaoSupabase: string;
  provedor: string;
  descricao: string;
  icone: React.ElementType;
  cor: string;
  modelos: string[];
  secrets: string[];
  finalidade: string;
}

interface TesteStatus {
  loading: boolean;
  success: boolean | null;
  latencyMs: number | null;
  mensagem: string | null;
  detalhes?: string | null;
}

const APIS_DISPONIVEIS: ApiEndpointInfo[] = [
  {
    id: 'gemini-generate',
    nome: 'Google Gemini AI (Proxy)',
    funcaoSupabase: 'gemini-generate',
    provedor: 'Google Generative AI (AI Studio)',
    descricao: 'Proxy seguro para geração de conteúdo, análises e assistente com Gemini Flash/Pro.',
    icone: Sparkles,
    cor: 'text-amber-600 bg-amber-50 border-amber-200',
    modelos: ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-1.5-pro'],
    secrets: ['GEMINI_API_KEY', 'GEMINI_API_KEY_2'],
    finalidade: 'Geração de texto, assistente virtual e prompts generativos gerais no sistema.',
  },
  {
    id: 'converter-markdown-ia',
    nome: 'OCR & Transcrição Visual',
    funcaoSupabase: 'converter-markdown-ia',
    provedor: 'Gemini 3.6 Flash + OpenRouter Fallback',
    descricao: 'Transcrição visual de PDFs, planilhas e imagens de propostas comerciais para Markdown.',
    icone: FileText,
    cor: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    modelos: ['gemini-3.6-flash', 'google/gemini-2.5-flash'],
    secrets: ['GEMINI_API_KEY', 'OPENROUTER_API_KEY'],
    finalidade: 'Etapa 1 do pipeline de cotações: conversão de arquivos de fornecedores em texto estruturado.',
  },
  {
    id: 'extrair-cotacao',
    nome: 'Extrator Estruturado de Cotações',
    funcaoSupabase: 'extrair-cotacao',
    provedor: 'OpenAI (Primário) + OpenRouter DeepSeek (Fallback)',
    descricao: 'Extração automática de 40 campos estruturados de propostas comerciais a partir de texto.',
    icone: FileSpreadsheet,
    cor: 'text-blue-600 bg-blue-50 border-blue-200',
    modelos: ['gpt-5.6-luna', 'deepseek/deepseek-v4-flash'],
    secrets: ['OPENAI_API_KEY', 'OPENROUTER_API_KEY'],
    finalidade: 'Etapa 2 do pipeline: popula itens, prazos, fretes e condições de pagamento na base.',
  },
  {
    id: 'atualizar-ipca',
    nome: 'Índices Econômicos (IPCA/BACEN)',
    funcaoSupabase: 'atualizar-ipca',
    provedor: 'Banco Central do Brasil (SGS API) / IBGE',
    descricao: 'Sincronização periódica da série histórica do IPCA para reajustes contratuais.',
    icone: TrendingUp,
    cor: 'text-purple-600 bg-purple-50 border-purple-200',
    modelos: ['BACEN Série 433 / IBGE 1737'],
    secrets: ['SUPABASE_SERVICE_ROLE_KEY'],
    finalidade: 'Cálculo de reajustes de contratos de prestação de serviços e fornecimentos.',
  },
];

// Imagem PNG 1x1 transparente para teste de OCR
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export function ApiManagement() {
  // Status de Testes Individuais
  const [testStatuses, setTestStatuses] = useState<Record<string, TesteStatus>>({});
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [testingAll, setTestingAll] = useState(false);

  // Playground State (Gemini)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-flash-latest');
  const [promptInput, setPromptInput] = useState<string>(
    'Explique resumidamente em 2 frases o impacto da inteligência artificial na automação de suprimentos industriais.'
  );
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  // Copy state
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  const handleCopyCommand = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(keyId);
    setTimeout(() => setCopiedSecret(null), 2500);
  };

  const toggleExpand = (apiId: string) => {
    setExpandedDetails(prev => ({ ...prev, [apiId]: !prev[apiId] }));
  };

  /**
   * Executa teste para uma API específica
   */
  const testarApi = async (apiId: string): Promise<TesteStatus> => {
    setTestStatuses(prev => ({
      ...prev,
      [apiId]: { loading: true, success: null, latencyMs: null, mensagem: 'Testando conexão...', detalhes: null },
    }));

    const inicio = performance.now();
    let statusResultado: TesteStatus;

    try {
      if (apiId === 'gemini-generate') {
        const texto = await gerarConteudoGemini('Responda apenas "OK - Gemini operacional".', 'gemini-flash-latest');
        const fim = performance.now();
        statusResultado = {
          loading: false,
          success: true,
          latencyMs: Math.round(fim - inicio),
          mensagem: 'Operacional (Resposta recebida com sucesso)',
          detalhes: texto,
        };
      } else if (apiId === 'converter-markdown-ia') {
        const { data, error } = await supabase.functions.invoke('converter-markdown-ia', {
          body: {
            nome_arquivo: 'teste_ping.png',
            mime_type: 'image/png',
            conteudo_base64: TEST_IMAGE_BASE64,
          },
        });

        const fim = performance.now();

        if (error) {
          const contexto = (error as any)?.context;
          const corpo = typeof contexto?.json === 'function' ? await contexto.json().catch(() => null) : null;
          throw new Error(corpo?.erro?.mensagem ?? error.message ?? 'Falha na resposta da Edge Function');
        }

        statusResultado = {
          loading: false,
          success: true,
          latencyMs: Math.round(fim - inicio),
          mensagem: 'Operacional (OCR e IA de Visão respondendo)',
          detalhes: (data as any)?.markdown ? (data as any).markdown.slice(0, 300) : JSON.stringify(data),
        };
      } else if (apiId === 'extrair-cotacao') {
        const sampleMarkdown = `# PROPOSTA COMERCIAL TESTE
Fornecedor: TESTE SISTEN SUPRIMENTOS LTDA
CNPJ: 00.123.456/0001-99
Condição: 30 dias | Frete: CIF

| Item | Descrição | Qtd | Unidade | Valor Unit. |
| --- | --- | --- | --- | --- |
| 1 | PARAFUSO SEXTAVADO AÇO INOX | 50 | UN | R$ 12,50 |`;

        const resultado = await extrairCotacao({
          markdown: sampleMarkdown,
          arquivoOrigem: 'teste_diagnostico.md',
        });

        const fim = performance.now();
        const qtdPropostas = resultado?.propostas?.length ?? 0;

        statusResultado = {
          loading: false,
          success: true,
          latencyMs: Math.round(fim - inicio),
          mensagem: `Operacional (${qtdPropostas} proposta(s) extraída(s) com sucesso)`,
          detalhes: JSON.stringify(resultado.propostas?.[0] ?? resultado, null, 2),
        };
      } else if (apiId === 'atualizar-ipca') {
        const { data, error } = await supabase.functions.invoke('atualizar-ipca');
        const fim = performance.now();

        if (error) {
          throw new Error(error.message || 'Falha ao sincronizar com BACEN/IBGE');
        }

        statusResultado = {
          loading: false,
          success: true,
          latencyMs: Math.round(fim - inicio),
          mensagem: (data as any)?.mensagem || 'Operacional (Série IPCA sincronizada)',
          detalhes: JSON.stringify(data, null, 2),
        };
      } else {
        throw new Error('API não reconhecida para teste.');
      }
    } catch (err: any) {
      const fim = performance.now();
      statusResultado = {
        loading: false,
        success: false,
        latencyMs: Math.round(fim - inicio),
        mensagem: err.message || 'Erro ao conectar à API.',
        detalhes: err.stack || err.message,
      };
    }

    setTestStatuses(prev => ({
      ...prev,
      [apiId]: statusResultado,
    }));

    return statusResultado;
  };

  /**
   * Testa todas as APIs disponíveis em paralelo
   */
  const handleTestAll = async () => {
    setTestingAll(true);
    const promessas = APIS_DISPONIVEIS.map(api => testarApi(api.id));
    await Promise.allSettled(promessas);
    setTestingAll(false);
  };

  /**
   * Executa teste no Playground do Gemini
   */
  const handleRunPlaygroundTest = async () => {
    if (!promptInput.trim()) return;

    setTestLoading(true);
    setTestError(null);
    setTestResponse(null);
    setLatencyMs(null);

    const inicio = performance.now();

    try {
      const textoResultado = await gerarConteudoGemini(promptInput, selectedModel);
      const fim = performance.now();
      setLatencyMs(Math.round(fim - inicio));
      setTestResponse(textoResultado);
    } catch (err: any) {
      const fim = performance.now();
      setLatencyMs(Math.round(fim - inicio));
      setTestError(err.message || 'Falha ao comunicar com a Edge Function do Gemini.');
    } finally {
      setTestLoading(false);
    }
  };

  // Contagem de status dos testes
  const totalTestados = Object.values(testStatuses).filter(s => s.success !== null).length;
  const totalSucesso = Object.values(testStatuses).filter(s => s.success === true).length;
  const totalFalha = Object.values(testStatuses).filter(s => s.success === false).length;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header & Overview */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white p-6 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Cpu className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Gestão de APIs & Edge Functions
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Monitore, diagnostique e teste todas as integrações de Inteligência Artificial e serviços externos do SISTEN.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTestAll}
              disabled={testingAll}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {testingAll ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Diagnosticando Todas...
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4" />
                  Testar Todas as APIs
                </>
              )}
            </button>

            <a
              href="https://supabase.com/dashboard/project/fwezzgduywgyhxinjurn/functions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Dashboard Supabase
            </a>
          </div>
        </div>

        {/* Barra de Resumo do Health Check */}
        {totalTestados > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-slate-400">Diagnóstico Geral:</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {totalSucesso} Operacional(is)
              </span>
              {totalFalha > 0 && (
                <span className="inline-flex items-center gap-1.5 font-bold text-rose-400">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  {totalFalha} com Falha
                </span>
              )}
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              {totalTestados} de {APIS_DISPONIVEIS.length} APIs testadas
            </span>
          </div>
        )}
      </div>

      {/* Grid de APIs Registradas com Testes Individuais */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Edge Functions & APIs do Sistema ({APIS_DISPONIVEIS.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Região: <span className="font-semibold text-slate-700">sa-east-1 (São Paulo)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {APIS_DISPONIVEIS.map((api) => {
            const Icon = api.icone;
            const status = testStatuses[api.id];
            const isExpanded = !!expandedDetails[api.id];

            return (
              <div
                key={api.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl border ${api.cor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{api.nome}</h4>
                        <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          functions/v1/{api.funcaoSupabase}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => testarApi(api.id)}
                      disabled={status?.loading || testingAll}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 disabled:opacity-50 transition cursor-pointer flex-shrink-0"
                    >
                      {status?.loading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          Testando...
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                          Testar API
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 mb-3">{api.descricao}</p>

                  {/* Informações Técnicas */}
                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Provedor:</span>
                      <span className="font-medium text-slate-700">{api.provedor}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Modelos / Fontes:</span>
                      <span className="font-mono text-[11px] text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {api.modelos.join(', ')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Secrets Vinculados:</span>
                      <div className="flex flex-wrap gap-1">
                        {api.secrets.map((sec) => (
                          <span
                            key={sec}
                            className="font-mono text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded"
                          >
                            {sec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Resultado do Teste da API */}
                  {status && status.success !== null && (
                    <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          {status.success ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Operacional
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-[11px]">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" /> Falha no Teste
                            </span>
                          )}
                          <span className="text-[11px] text-slate-600 truncate max-w-[200px]">
                            {status.mensagem}
                          </span>
                        </div>

                        {status.latencyMs !== null && (
                          <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {status.latencyMs}ms
                          </span>
                        )}
                      </div>

                      {status.detalhes && (
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleExpand(api.id)}
                            className="text-[11px] text-slate-500 hover:text-slate-700 font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {isExpanded ? 'Ocultar Detalhes da Resposta' : 'Ver Detalhes da Resposta'}
                          </button>

                          {isExpanded && (
                            <pre className="mt-2 text-[10px] font-mono p-2.5 bg-slate-900 text-slate-200 rounded-lg overflow-x-auto max-h-40 whitespace-pre-wrap leading-tight border border-slate-800">
                              {status.detalhes}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="italic">{api.finalidade}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Logs de Uso & Análise por Modelo */}
      <UsageAnalyticsSection nomesPorApiId={Object.fromEntries(APIS_DISPONIVEIS.map(api => [api.id, api.nome]))} />

      {/* Interactive AI Playground */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                Playground de Teste em Tempo Real (Gemini Edge Function)
              </h3>
              <p className="text-xs text-slate-500">
                Envie qualquer prompt personalizado para a Edge Function segura do Supabase e visualize a resposta formatada.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Modelo:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="gemini-flash-latest">gemini-flash-latest (Padrão)</option>
              <option value="gemini-3.6-flash">gemini-3.6-flash</option>
              <option value="gemini-1.5-pro">gemini-1.5-pro</option>
            </select>
          </div>
        </div>

        {/* Input & Action */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-700">
            Prompt de Teste:
          </label>
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            rows={3}
            placeholder="Digite o texto que deseja enviar para o Gemini..."
            className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setPromptInput(
                    'Escreva uma análise rápida sobre como classificar fornecedores de peças industriais por criticidade de entrega.'
                  )
                }
                className="text-[11px] text-slate-500 hover:text-emerald-700 underline cursor-pointer"
              >
                Carregar prompt de suprimentos
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() =>
                  setPromptInput('Explain how AI works in a few words')
                }
                className="text-[11px] text-slate-500 hover:text-emerald-700 underline cursor-pointer"
              >
                Prompt original do cURL
              </button>
            </div>

            <button
              type="button"
              onClick={handleRunPlaygroundTest}
              disabled={testLoading || !promptInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {testLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Processando na Edge Function...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Executar Teste
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Area */}
        {(testResponse || testError || latencyMs !== null) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {testError ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-rose-600">
                    <XCircle className="w-4 h-4" /> Erro na Execução
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" /> Sucesso (HTTP 200)
                  </span>
                )}
              </div>

              {latencyMs !== null && (
                <div className="flex items-center gap-1 text-slate-500 font-mono text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Latência: <span className="font-bold text-slate-700">{latencyMs}ms</span>
                </div>
              )}
            </div>

            {testError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 font-mono">
                {testError}
              </div>
            )}

            {testResponse && (
              <div className="rounded-lg bg-white border border-slate-200 p-4 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                {testResponse}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gerenciamento de Secrets & Comandos CLI */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Guia de Atualização de Secrets via CLI
            </h3>
            <p className="text-xs text-slate-500">
              Comandos rápidos para definir ou rotacionar chaves de APIs no Supabase.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-slate-900 text-slate-200 p-4 font-mono text-xs space-y-2 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>Configurar Gemini API Key:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyCommand(
                      'npx supabase secrets set GEMINI_API_KEY="SUA_CHAVE_AQUI"',
                      'gemini-cmd'
                    )
                  }
                  className="hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedSecret === 'gemini-cmd' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <code className="text-emerald-400 break-all">
                npx supabase secrets set GEMINI_API_KEY="AQ.SuaChaveAqui"
              </code>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Salva o secret no cofre do Supabase sem expor no Git.
            </p>
          </div>

          <div className="rounded-xl bg-slate-900 text-slate-200 p-4 font-mono text-xs space-y-2 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
                <span>Deploy da Edge Function:</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyCommand(
                      'npx supabase functions deploy gemini-generate --no-verify-jwt',
                      'deploy-cmd'
                    )
                  }
                  className="hover:text-emerald-400 flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedSecret === 'deploy-cmd' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </>
                  )}
                </button>
              </div>
              <code className="text-emerald-400 break-all">
                npx supabase functions deploy gemini-generate --no-verify-jwt
              </code>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">
              Publica a função diretamente na região do seu banco de dados.
            </p>
          </div>
        </div>

        {/* Security Warning Box */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3 text-xs text-amber-900">
          <ShieldCheck className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">Política de Segurança Zero-Leak:</span>
            <p className="text-amber-800">
              Nunca utilize o prefixo <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[11px]">VITE_</code> para chaves de API pagas ou credenciais de servidor. O prefixo <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[11px]">VITE_</code> compila os valores no JavaScript do navegador, tornando-os visíveis publicamente a qualquer usuário do sistema.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

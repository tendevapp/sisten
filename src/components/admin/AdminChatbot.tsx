/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Botão Flutuante + Janela de Chatbot Independente no Painel Admin.
 * Conecta diretamente com as APIs de IA (OpenRouter - DeepSeek v4 Flash com Fallback para Gemini 2.0).
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, MessageSquare, X, Send, RotateCcw, Sparkles, 
  ChevronDown, User, Cpu, AlertCircle, HelpCircle, Loader2
} from 'lucide-react';
import { Profile } from '../../types';

interface AdminChatbotProps {
  user: Profile;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  modelUsed?: string;
  isError?: boolean;
}

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || import.meta.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || import.meta.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash';
const GEMINI_API_KEY_1 = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || '';
const GEMINI_API_KEY_2 = import.meta.env.VITE_GEMINI_API_KEY_2 || import.meta.env.GEMINI_API_KEY_2 || '';

const QUICK_PROMPTS = [
  'Como cadastrar um novo usuário no sistema?',
  'Como importar planilhas do SAP (ME5A/ZL0132)?',
  'Como configurar os setores e aprovadores?',
  'Como vincular o Grupo de Compradores aos compradores?'
];

export default function AdminChatbot({ user }: AdminChatbotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('sisten_admin_chatbot_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      {
        id: 'welcome-1',
        sender: 'assistant',
        text: `Olá, **${user.name}**! Sou o assistente de IA do Painel Administrativo do SISTEN. Como posso te ajudar com gestão de usuários, relatórios SAP ou permissões do sistema hoje?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'DeepSeek-V4 Flash'
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persistir histórico no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sisten_admin_chatbot_history', JSON.stringify(messages));
    } catch (e) {
      console.error('Erro ao salvar histórico do chat:', e);
    }
  }, [messages]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isGenerating]);

  // Foco no input ao abrir a janela
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleClearChat = () => {
    const initialMsg: Message = {
      id: Date.now().toString(),
      sender: 'assistant',
      text: `Conversa reiniciada. Como posso te ajudar agora, **${user.name}**?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'DeepSeek-V4 Flash'
    };
    setMessages([initialMsg]);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isGenerating) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (!textToSend) setInput('');
    setIsGenerating(true);

    // Preparar histórico para API
    const historyPayload = newMessages
      .slice(-10) // últimas 10 mensagens
      .map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

    try {
      const response = await callAIProvider(historyPayload, user);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: response.model
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: `⚠️ **Erro de Conexão:** Não foi possível obter resposta da IA no momento. (${(err as Error).message})`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Botão Flutuante (FAB) */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
        {!isOpen && (
          <div className="hidden md:flex items-center gap-2 bg-slate-900/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg border border-slate-700/60 backdrop-blur-md animate-in fade-in slide-in-from-right-3 duration-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Assistente IA Admin</span>
          </div>
        )}

        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Abrir assistente virtual IA"
          className={`relative group p-4 rounded-full shadow-2xl transition-all duration-300 transform active:scale-95 flex items-center justify-center ${
            isOpen
              ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rotate-90 border border-slate-600'
              : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 hover:from-slate-800 hover:to-indigo-900 text-white border border-indigo-500/40 shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-105'
          }`}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <>
              <Bot className="w-6 h-6 text-indigo-300 group-hover:text-white transition-colors" />
              {/* Badge indicadora online */}
              <span className="absolute top-1 right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900"></span>
              </span>
            </>
          )}
        </button>
      </div>

      {/* Janela Modal do Chatbot */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[420px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-8.5rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden z-50 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-5 duration-300">
          
          {/* Header da Janela */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-3.5 flex items-center justify-between border-b border-indigo-900/40 shadow-md">
            <div className="flex items-center gap-3">
              <div className="relative p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-inner border border-indigo-300/30">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-wide text-white">Assistente Admin SISTEN</h3>
                  <span className="text-[10px] font-medium bg-indigo-900/80 text-indigo-300 border border-indigo-700/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Cpu className="w-2.5 h-2.5" />
                    DeepSeek v4
                  </span>
                </div>
                <p className="text-[11px] text-slate-300/80 flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  Inteligência Artificial Ativa
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                title="Limpar Histórico"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Fechar"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/60 dark:bg-slate-950/60 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[85%] space-y-1 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs font-medium'
                        : msg.isError
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-tl-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-tl-xs'
                    }`}
                  >
                    <FormattedText content={msg.text} />
                  </div>

                  <div className="flex items-center gap-2 px-1 text-[10px] text-slate-400 dark:text-slate-500">
                    <span>{msg.timestamp}</span>
                    {msg.modelUsed && (
                      <span className="text-[9px] bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded font-mono">
                        {msg.modelUsed}
                      </span>
                    )}
                  </div>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}

            {/* Prompt Suggestions no início */}
            {messages.length <= 2 && !isGenerating && (
              <div className="pt-2 space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-indigo-500" /> Perguntas Frequentes:
                </p>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((promptText, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(promptText)}
                      className="text-left text-xs bg-white dark:bg-slate-800/90 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition-all duration-150 shadow-2xs hover:shadow-xs"
                    >
                      💡 {promptText}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isGenerating && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-3 rounded-2xl rounded-tl-xs shadow-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pensando na resposta...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Área de Entrada (Input) */}
          <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
            <div className="relative flex items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte ao assistente administrativo..."
                rows={1}
                className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none outline-none px-2 py-1 max-h-24"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isGenerating}
                aria-label="Enviar mensagem"
                className="p-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg transition-all shadow-md disabled:opacity-40 disabled:pointer-events-none flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-1.5">
              Pressione <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[9px] font-mono">Enter</kbd> para enviar
            </p>
          </div>

        </div>
      )}
    </>
  );
}

/** Formata texto em Markdown simples (**negrito**, listas, quebras de linha) */
function FormattedText({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />;

        // Lista com marcadores
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const itemText = line.trim().substring(2);
          return (
            <div key={idx} className="flex gap-1.5 items-start pl-1">
              <span className="text-indigo-500 font-bold">•</span>
              <span>{parseBold(itemText)}</span>
            </div>
          );
        }

        // Títulos curtos (ex: ### Titulo ou Titulo:)
        if (line.startsWith('###') || line.startsWith('##')) {
          return (
            <p key={idx} className="font-bold text-slate-900 dark:text-white pt-1">
              {parseBold(line.replace(/^#+\s*/, ''))}
            </p>
          );
        }

        return <p key={idx}>{parseBold(line)}</p>;
      })}
    </div>
  );
}

/** Converte **negrito** em tag strong */
function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-bold text-slate-900 dark:text-white">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

/** Chamada com Fallback Encadeado para APIs de IA */
async function callAIProvider(
  history: { role: string; content: string }[],
  user: Profile
): Promise<{ text: string; model: string }> {
  const systemPrompt = `Você é o Assistente Virtual IA do Painel Administrativo do SISTEN (Sistema Integrado de Suprimentos e Engenharia).
Sua função é auxiliar o administrador (${user.name}) com dúvidas operacionais, parametrizações de usuários, controle de permissões, importações de dados SAP (ME5A, ZL0132, ZL0024), gestão de setores, grupos de compradores e helpdesk.

Diretrizes de resposta:
- Responda de forma clara, objetiva, amigável e bem formatada em Markdown em português do Brasil (pt-BR).
- Sempre que relevante, indique o caminho do menu no SISTEN (ex: Painel Admin -> Usuários, Suprimentos -> Importar SAP, etc.).
- Mantenha respostas concisas porém completas.`;

  // 1. Tenta Gemini Key 1 primeiro
  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY_1}`;
    const formattedPrompt = `${systemPrompt}\n\nHistórico:\n${history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n')}`;

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY_1
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: formattedPrompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        return { text: content, model: 'Gemini 2.0 Flash' };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('Gemini Key 1 retornou HTTP', res.status, errData?.error?.message || '');
    }
  } catch (err) {
    console.warn('Gemini Key 1 erro de rede, tentando Gemini Key 2:', err);
  }

  // 2. Fallback: Gemini Key 2
  try {
    const geminiUrl2 = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY_2}`;
    const formattedPrompt = `${systemPrompt}\n\nHistórico:\n${history.map(h => `${h.role.toUpperCase()}: ${h.content}`).join('\n')}`;

    const res = await fetch(geminiUrl2, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY_2
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: formattedPrompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        return { text: content, model: 'Gemini 2.0 Flash (Backup)' };
      }
    } else {
      const errData = await res.json().catch(() => ({}));
      console.warn('Gemini Key 2 retornou HTTP', res.status, errData?.error?.message || '');
    }
  } catch (err) {
    console.warn('Gemini Key 2 falhou, tentando fallback OpenRouter:', err);
  }

  // 3. Fallback Final: OpenRouter com DeepSeek v4 Flash
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'SISTEN Admin Assistant'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return { text: content, model: 'DeepSeek-V4 Flash' };
      }
    }
  } catch (err) {
    console.error('OpenRouter também falhou:', err);
  }

  throw new Error('Todas as chaves e provedores de IA excederam a cota ou falharam.');
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etapa 1 do fluxo de Cotações: envie planilha (XLSX/CSV), JSON, XML (viram
 * markdown fiel 100% no navegador, sem IA/custo), PDF ou imagem (OCR/IA, ver
 * supabase/functions/converter-markdown-ia) e o markdown consolidado é
 * enviado direto para a extração da cotação — sem copiar/colar manual.
 * Origem: era uma página separada (Conversor Markdown, MVP), unificada aqui.
 *
 * Fila com concorrência ajustável, resiliente a F5 (resultados já
 * convertidos ficam em localStorage, escopados por processo de cotação).
 * A colagem manual de markdown (`ColarMarkdownPanel`) fica disponível como
 * contingência, para quando o upload não funcionar.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, Download, Trash2, PackageSearch, Timer, Coins, DollarSign, History,
  Sparkles, Loader2, AlertCircle, Cpu,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import ItemFilaRow, { type ItemFila } from '../markdown/ItemFilaRow';
import MarkdownPreview from '../markdown/MarkdownPreview';
import PreviewMarkdownModal from '../markdown/PreviewMarkdownModal';
import HistoricoConversoesModal from '../markdown/HistoricoConversoesModal';
import ArquivoJaConvertidoModal, { type DuplicadoInfo } from '../markdown/ArquivoJaConvertidoModal';
import ColarMarkdownPanel from './ColarMarkdownPanel';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
  ACCEPT_CONVERSOR, detectarFormato, converterArquivoParaMarkdown, consolidarMarkdown,
  estimarTokens, ConversaoNaoSuportadaError,
} from '../../lib/markdownConvert';
import { converterComIA, registrarConversaoLocal, buscarUltimaConversaoPorArquivo } from '../../lib/converterMarkdownApi';
import { buscarPropostasPorArquivo } from '../../lib/cotacoesApi';
import { formatDuration, formatUsd, formatModelo } from '../../lib/format';
import type { Profile, ExtracaoUso } from '../../types';

/** Item ainda não terminou e vai (ou está) sendo trabalhado. Um "pendente" sem `file` (recuperado de sessão anterior, aguardando reseleção) não conta. */
const emAndamento = (i: ItemFila) => i.status === 'processando' || (i.status === 'pendente' && !!i.file);

/** Quantos arquivos convertem em paralelo — parâmetro técnico interno, não é decisão do usuário de negócio (não expor na UI). */
const CONCORRENCIA_FIXA = 2;

type ItemFilaSalvo = Omit<ItemFila, 'file'>;

function gerarId(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function baixarTexto(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ImportarPropostasPanelProps {
  user: Profile;
  processoId: string;
  processando: boolean;
  erro: string | null;
  uso: ExtracaoUso | null;
  /** Provedor/modelo que atendeu a última extração (ex.: "gemini:gemini-2.0-flash") — só some quando uma nova extração começa. */
  modelo: string | null;
  /** Retorna se a extração deu certo — só nesse caso a fila descarta os arquivos enviados. */
  onProcessar: (markdown: string, arquivoOrigem: string | null) => Promise<boolean>;
  /** Avisa quais arquivos (nome + File) foram mandados para extração, para o card da proposta poder oferecer "ver arquivo original" enquanto durar a sessão. */
  onArquivosEnviados?: (arquivos: { nome: string; file: File | null }[]) => void;
}

export default function ImportarPropostasPanel({ user, processoId, processando, erro, uso, modelo, onProcessar, onArquivosEnviados }: ImportarPropostasPanelProps) {
  const toast = useToast();
  const lsKey = useMemo(() => `sisten:cotacoes:${processoId}:conversor:v1`, [processoId]);

  const [itens, setItens] = useState<ItemFila[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [itemPreview, setItemPreview] = useState<ItemFila | null>(null);
  const [duplicadosAviso, setDuplicadosAviso] = useState<DuplicadoInfo[] | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [modoManual, setModoManual] = useState(false);
  const [confirmDuplicata, setConfirmDuplicata] = useState<string | null>(null);
  const [confirmLimparLista, setConfirmLimparLista] = useState(false);
  const [confirmRemoverItem, setConfirmRemoverItem] = useState<ItemFila | null>(null);
  // Ids explicitamente desmarcados pelo usuário — por padrão todo arquivo
  // convertido entra na extração; desmarcar é a exceção, não a regra.
  const [deselecionados, setDeselecionados] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const inputReselecaoRef = useRef<HTMLInputElement>(null);
  const idReselecaoRef = useRef<string | null>(null);
  const restauradoRef = useRef(false);

  // Cronômetro local para o botão "Extrair cotação com IA" — mesmo padrão do
  // ColarMarkdownPanel, ligado ao `processando` vindo do pai.
  const [elapsedMs, setElapsedMs] = useState(0);
  const inicioRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (processando) {
      inicioRef.current = Date.now();
      setElapsedMs(0);
      intervalRef.current = setInterval(() => setElapsedMs(Date.now() - (inicioRef.current ?? Date.now())), 100);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [processando]);

  // Restaura a fila salva localmente para este processo (resultados já
  // convertidos sobrevivem a F5; o File em si, não).
  useEffect(() => {
    restauradoRef.current = false;
    try {
      const bruto = localStorage.getItem(lsKey);
      if (bruto) {
        const salvos = JSON.parse(bruto) as ItemFilaSalvo[];
        if (Array.isArray(salvos) && salvos.length > 0) {
          setItens(salvos.map(s => ({
            ...s,
            file: null,
            status: s.status === 'processando' ? 'pendente' : s.status,
            iniciadoEm: undefined,
          })));
        } else {
          setItens([]);
        }
      } else {
        setItens([]);
      }
    } catch (err) {
      console.error('Falha ao restaurar fila de importação de propostas:', err);
      setItens([]);
    } finally {
      restauradoRef.current = true;
    }
  }, [lsKey]);

  // Persiste a cada mudança (sem o File, que não é serializável).
  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      const serializavel: ItemFilaSalvo[] = itens.map(({ file: _file, ...resto }) => resto);
      if (serializavel.length > 0) localStorage.setItem(lsKey, JSON.stringify(serializavel));
      else localStorage.removeItem(lsKey);
    } catch (err) {
      console.error('Falha ao salvar fila de importação de propostas:', err);
    }
  }, [itens, lsKey]);

  // Fila com concorrência fixa: sempre que houver vaga e algum item pendente
  // com o arquivo ainda em memória, dispara a conversão.
  useEffect(() => {
    const emProcessamento = itens.filter(i => i.status === 'processando').length;
    const vagas = CONCORRENCIA_FIXA - emProcessamento;
    if (vagas <= 0) return;
    const proximos = itens.filter(i => i.status === 'pendente' && i.file).slice(0, vagas);
    if (proximos.length === 0) return;

    setItens(prev => prev.map(i => (proximos.some(p => p.id === i.id) ? { ...i, status: 'processando', erro: undefined, iniciadoEm: Date.now() } : i)));
    for (const item of proximos) processarItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  async function processarItem(item: ItemFila) {
    if (!item.file) return;
    const viaIA = item.formato === 'pdf' || item.formato === 'imagem';
    try {
      const resultado = viaIA ? await converterComIA(item.file) : await converterArquivoParaMarkdown(item.file);
      const agoraIso = new Date().toISOString();
      const nomeUsuario = user.name || user.email || 'Usuário atual';
      setItens(prev => prev.map(i => (i.id === item.id ? {
        ...i,
        status: 'concluido',
        resultado,
        concluidoEm: agoraIso,
        usuarioNome: nomeUsuario,
        usuarioId: user.id,
      } : i)));
      if (!viaIA) {
        registrarConversaoLocal({
          userId: user.id, userName: user.name, nomeArquivo: item.nome, formato: item.formato,
          tamanhoBytes: item.tamanho, sucesso: true, resultado,
        });
      }
    } catch (err) {
      if (err instanceof ConversaoNaoSuportadaError) {
        setItens(prev => prev.map(i => (i.id === item.id ? { ...i, status: 'nao_suportado', erro: err.message } : i)));
      } else {
        const mensagem = (err as Error).message;
        setItens(prev => prev.map(i => (i.id === item.id ? { ...i, status: 'erro', erro: mensagem } : i)));
        if (!viaIA) {
          registrarConversaoLocal({
            userId: user.id, userName: user.name, nomeArquivo: item.nome, formato: item.formato,
            tamanhoBytes: item.tamanho, sucesso: false, erroMensagem: mensagem,
          });
        }
      }
    }
  }

  async function adicionarArquivos(files: FileList | File[]) {
    const lista = Array.from(files);
    if (lista.length === 0) return;

    const duplicados: DuplicadoInfo[] = [];
    const novosParaFila: File[] = [];

    await Promise.all(
      lista.map(async f => {
        const id = gerarId(f);
        const existente = itens.find(i => i.id === id || (i.nome === f.name && i.tamanho === f.size));

        if (existente && existente.status === 'concluido' && existente.resultado) {
          duplicados.push({
            file: f,
            itemExistente: existente,
            nome: f.name,
            tamanho: f.size,
            convertidoEm: existente.concluidoEm || new Date().toISOString(),
            usuarioNome: existente.usuarioNome || user.name || user.email || 'Você',
            resumo: existente.resultado.resumo,
            tokens: existente.resultado.tokensReais ?? existente.resultado.tokensEstimados,
            custoUsd: existente.resultado.custoUsd,
            duracaoMs: existente.resultado.duracaoMs,
            via: existente.formato === 'pdf' || existente.formato === 'imagem' ? 'ia' : 'local',
            modelo: existente.resultado.modelo,
            markdown: existente.resultado.markdown,
            origem: 'sessao_local',
          });
        } else if (!itens.some(i => i.id === id)) {
          const historico = await buscarUltimaConversaoPorArquivo(f.name, f.size);
          if (historico && historico.markdown) {
            duplicados.push({
              file: f,
              nome: f.name,
              tamanho: f.size,
              convertidoEm: historico.created_at,
              usuarioNome: historico.user_name || 'Colega de equipe',
              resumo: `${(historico.caracteres ?? historico.markdown.length).toLocaleString('pt-BR')} carac.`,
              tokens: historico.tokens,
              custoUsd: historico.custo_usd,
              duracaoMs: historico.duracao_ms,
              via: historico.via,
              modelo: historico.modelo,
              markdown: historico.markdown,
              origem: 'supabase',
            });
          } else {
            novosParaFila.push(f);
          }
        }
      })
    );

    if (duplicados.length > 0) {
      setDuplicadosAviso(duplicados);
    }

    if (novosParaFila.length > 0) {
      setItens(prev => {
        const existentes = new Set(prev.map(i => i.id));
        const novos: ItemFila[] = novosParaFila
          .filter(f => !existentes.has(gerarId(f)))
          .map(f => ({
            id: gerarId(f), nome: f.name, tamanho: f.size, formato: detectarFormato(f.name),
            status: 'aguardando', file: f,
          }));
        if (novos.length > 0) {
          toast.info(`${novos.length} arquivo(s) carregado(s). Clique em "Converter tudo" para processar.`);
        }
        return [...prev, ...novos];
      });
    }
  }

  const handleConverterTodos = () => {
    const aguardando = itens.filter(i => (i.status === 'aguardando' || i.status === 'erro') && !!i.file);
    if (aguardando.length === 0) {
      toast.warning('Nenhum arquivo na fila aguardando conversão.');
      return;
    }
    setItens(prev => prev.map(i => (
      (i.status === 'aguardando' || i.status === 'erro') && i.file
        ? { ...i, status: 'pendente', erro: undefined }
        : i
    )));
  };

  const removerItem = (id: string) => {
    setItens(prev => prev.filter(i => i.id !== id));
    setDeselecionados(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  /** Já convertido custa (tempo ou IA) — remover pede confirmação. Ainda não convertido remove direto, sem fricção. */
  const handleRemoverItem = (item: ItemFila) => {
    if (item.status === 'concluido') {
      setConfirmRemoverItem(item);
      return;
    }
    removerItem(item.id);
  };

  const handleConverterIndividual = (id: string) => {
    setItens(prev => prev.map(i => (i.id === id ? { ...i, status: 'pendente', erro: undefined } : i)));
  };

  const handleVerDuplicado = (dup: DuplicadoInfo) => {
    setDuplicadosAviso(null);
    if (dup.itemExistente) {
      const atualizado = { ...dup.itemExistente, file: dup.file };
      setItens(prev => prev.map(i => (i.id === dup.itemExistente!.id ? atualizado : i)));
      setItemPreview(atualizado);
    } else if (dup.markdown) {
      const novoItem: ItemFila = {
        id: gerarId(dup.file),
        nome: dup.nome,
        tamanho: dup.tamanho,
        formato: detectarFormato(dup.nome),
        status: 'concluido',
        file: dup.file,
        concluidoEm: dup.convertidoEm ?? undefined,
        usuarioNome: dup.usuarioNome ?? undefined,
        resultado: {
          markdown: dup.markdown,
          duracaoMs: dup.duracaoMs ?? 0,
          caracteres: dup.markdown.length,
          tokensEstimados: dup.tokens ?? estimarTokens(dup.markdown),
          tokensReais: dup.tokens ?? undefined,
          custoUsd: dup.custoUsd,
          modelo: dup.modelo ?? undefined,
          resumo: dup.resumo ?? `${dup.markdown.length} carac.`,
        },
      };
      setItens(prev => [novoItem, ...prev.filter(i => i.id !== novoItem.id)]);
      setItemPreview(novoItem);
      toast.success(`Arquivo "${dup.nome}" puxado do histórico compartilhado com sucesso!`);
    }
  };

  const handleReconverterDuplicado = (dup: DuplicadoInfo) => {
    setDuplicadosAviso(null);
    const novoId = gerarId(dup.file);
    const novoItem: ItemFila = {
      id: novoId,
      nome: dup.nome,
      tamanho: dup.tamanho,
      formato: detectarFormato(dup.nome),
      status: 'pendente',
      file: dup.file,
      erro: undefined,
      resultado: undefined,
    };
    setItens(prev => {
      const semAntigo = prev.filter(i => i.id !== (dup.itemExistente?.id ?? novoId));
      return [...semAntigo, novoItem];
    });
  };

  const handleSelecionarArquivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) adicionarArquivos(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (e.dataTransfer.files) adicionarArquivos(e.dataTransfer.files);
  };

  const handleReselecionar = (id: string) => {
    idReselecaoRef.current = id;
    inputReselecaoRef.current?.click();
  };

  const handleArquivoReselecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = idReselecaoRef.current;
    idReselecaoRef.current = null;
    if (!file || !id) return;
    setItens(prev => prev.map(i => (i.id === id ? { ...i, file, status: 'aguardando', erro: undefined } : i)));
  };

  const copiarMarkdown = async (markdown: string, mensagem: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success(mensagem);
    } catch {
      toast.error('Não foi possível copiar. Copie manualmente pela pré-visualização.');
    }
  };

  const itensConcluidos = useMemo(() => itens.filter(i => i.status === 'concluido' && i.resultado), [itens]);
  const itensSelecionados = useMemo(
    () => itensConcluidos.filter(i => !deselecionados.has(i.id)),
    [itensConcluidos, deselecionados]
  );
  const consolidado = useMemo(
    () => consolidarMarkdown(itensSelecionados.map(i => ({ nome: i.nome, markdown: i.resultado!.markdown }))),
    [itensSelecionados]
  );

  const toggleSelecionado = (id: string) => {
    setDeselecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const total = itens.length;
  const finalizados = itens.filter(i => i.status === 'concluido' || i.status === 'erro' || i.status === 'nao_suportado').length;
  const itensAguardando = useMemo(
    () => itens.filter(i => (i.status === 'aguardando' || i.status === 'erro') && !!i.file).length,
    [itens]
  );
  const progressoPct = total > 0 ? Math.round((finalizados / total) * 100) : 0;

  const { tokensAcumulados, custoAcumulado } = useMemo(() => {
    let tokens = 0;
    let custo = 0;
    let temCusto = false;
    for (const i of itens) {
      if (i.status !== 'concluido' || !i.resultado) continue;
      tokens += i.resultado.tokensReais ?? i.resultado.tokensEstimados;
      if (typeof i.resultado.custoUsd === 'number') { custo += i.resultado.custoUsd; temCusto = true; }
    }
    return { tokensAcumulados: tokens, custoAcumulado: temCusto ? custo : null };
  }, [itens]);

  const prosseguirExtracao = async () => {
    onArquivosEnviados?.(itensSelecionados.map(i => ({ nome: i.nome, file: i.file })));

    const label = itensSelecionados.length === 1 ? itensSelecionados[0].nome : `${itensSelecionados.length} arquivos`;
    const sucesso = await onProcessar(consolidado, label);
    if (!sucesso) return; // fila intacta — falhou depois de já converter, não faz o usuário reconverter para tentar de novo
    // Remove só o que foi enviado — arquivos desmarcados ficam na fila para
    // uma extração posterior, em vez de serem descartados.
    const idsEnviados = new Set(itensSelecionados.map(i => i.id));
    setItens(prev => prev.filter(i => !idsEnviados.has(i.id)));
    setDeselecionados(prev => {
      if (![...idsEnviados].some(id => prev.has(id))) return prev;
      const next = new Set(prev);
      idsEnviados.forEach(id => next.delete(id));
      return next;
    });
  };

  const handleExtrairCotacao = async () => {
    if (itensSelecionados.length === 0 || processando) return;

    // Mesma ideia do aviso de arquivo já convertido (buscarUltimaConversaoPorArquivo),
    // aplicada à extração: evita gastar IA e criar proposta duplicada no banco
    // para um arquivo que já foi extraído e salvo neste processo.
    try {
      const jaExtraidas = await buscarPropostasPorArquivo(processoId, itensSelecionados.map(i => i.nome));
      if (jaExtraidas.length > 0) {
        setConfirmDuplicata(jaExtraidas.map(p => `"${p.arquivo_origem}"`).join(', '));
        return;
      }
    } catch (err) {
      console.error('Falha ao checar propostas já extraídas:', err);
    }

    await prosseguirExtracao();
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <UploadCloud className="h-3.5 w-3.5" />
            Importar propostas dos fornecedores
          </label>
          <button
            type="button"
            onClick={() => setHistoricoAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" />
            Histórico
          </button>
        </div>

        <input ref={inputRef} type="file" accept={ACCEPT_CONVERSOR} multiple className="hidden" onChange={handleSelecionarArquivos} />
        <input ref={inputReselecaoRef} type="file" accept={ACCEPT_CONVERSOR} className="hidden" onChange={handleArquivoReselecionado} />

        <div
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            arrastando
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
              : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
          }`}
        >
          <UploadCloud className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Arraste as propostas aqui ou clique para selecionar</p>
          <p className="text-[11px] text-slate-400">XLSX, XLS, CSV, JSON, XML, PDF, imagens (JPG/PNG/...) · vários de uma vez</p>
          <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
            PDF e imagens usam IA (OCR) para converter — mais lento e com custo por arquivo.
          </p>
          <p className="text-[11px] text-slate-400">
            São 2 etapas: primeiro os arquivos são <strong>convertidos</strong>, depois você clica em <strong>"Extrair cotação com IA"</strong> para ler os campos da proposta.
          </p>
        </div>

        {total > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {itensAguardando > 0 && (
                  <button
                    type="button"
                    onClick={handleConverterTodos}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <Sparkles className="h-4 w-4" />
                    Converter tudo ({itensAguardando} {itensAguardando === 1 ? 'arquivo' : 'arquivos'})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setConfirmLimparLista(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Limpar lista
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>{finalizados} de {total} processado(s)</span>
                <span>{progressoPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progressoPct}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1" title="Tokens somados dos arquivos já convertidos (reais quando veio de IA, estimados quando local)">
                  <Coins className="h-3 w-3" />
                  {tokensAcumulados.toLocaleString('pt-BR')} tokens
                </span>
                <span className="inline-flex items-center gap-1" title="Custo de IA somado dos arquivos já convertidos (planilha/JSON/XML não têm custo)">
                  <DollarSign className="h-3 w-3" />
                  {custoAcumulado != null ? formatUsd(custoAcumulado) : 'sem custo de IA ainda'}
                </span>
              </div>
            </div>

            <ul className="space-y-1.5">
              {itens.map(item => (
                <ItemFilaRow
                  key={item.id}
                  item={item}
                  onVer={() => setItemPreview(item)}
                  onConverter={() => handleConverterIndividual(item.id)}
                  onCopiar={() => item.resultado && copiarMarkdown(item.resultado.markdown, `Markdown de "${item.nome}" copiado.`)}
                  onReconverter={() => handleConverterIndividual(item.id)}
                  onSelecionarArquivo={() => handleReselecionar(item.id)}
                  onRemover={() => handleRemoverItem(item)}
                  selecionavel={item.status === 'concluido'}
                  selecionado={item.status === 'concluido' && !deselecionados.has(item.id)}
                  onToggleSelecionado={() => toggleSelecionado(item.id)}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      {itensConcluidos.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <PackageSearch className="h-3.5 w-3.5" />
              Pronto para extrair ({itensSelecionados.length} de {itensConcluidos.length} selecionado{itensConcluidos.length === 1 ? '' : 's'})
            </div>
            <button
              type="button"
              onClick={() => baixarTexto('cotacoes-consolidado.md', consolidado)}
              disabled={itensSelecionados.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Baixar .md
            </button>
          </div>

          {itensSelecionados.length > 0 ? (
            <>
              <p className="mt-1 text-[11px] text-slate-400">
                {consolidado.length.toLocaleString('pt-BR')} caracteres · ~{estimarTokens(consolidado).toLocaleString('pt-BR')} tokens estimados · pré-visualização abaixo, confira antes de extrair
              </p>
              <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-950/40">
                <MarkdownPreview markdown={consolidado} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400">
              Nenhum arquivo selecionado — marque ao menos um na lista acima para extrair.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              {(processando || uso) && (
                <>
                  <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" /> {(elapsedMs / 1000).toFixed(1)}s</span>
                  {uso && <span className="inline-flex items-center gap-1"><Coins className="h-3 w-3" /> {uso.total_tokens.toLocaleString('pt-BR')} tokens</span>}
                  {modelo && <span className="inline-flex items-center gap-1"><Cpu className="h-3 w-3" /> {formatModelo(modelo)}</span>}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleExtrairCotacao}
              disabled={processando || itensSelecionados.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-40"
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {processando ? 'Processando...' : 'Extrair cotação com IA'}
            </button>
          </div>

          {erro && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>
      )}

      <div className="text-right">
        <button
          type="button"
          onClick={() => setModoManual(v => !v)}
          className="text-[11px] font-semibold text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
        >
          {modoManual ? 'Ocultar colagem manual' : 'Problema no upload? Colar markdown manualmente'}
        </button>
      </div>
      {modoManual && (
        <ColarMarkdownPanel processoId={processoId} processando={processando} erro={erro} uso={uso} modelo={modelo} onProcessar={onProcessar} />
      )}

      {itemPreview && (
        <PreviewMarkdownModal
          nome={itemPreview.nome}
          markdown={itemPreview.resultado?.markdown || ''}
          formato={itemPreview.formato}
          file={itemPreview.file}
          resumo={
            itemPreview.resultado
              ? `${itemPreview.resultado.resumo} · ${formatDuration(itemPreview.resultado.duracaoMs)}` +
                ` · ${(itemPreview.resultado.tokensReais ?? itemPreview.resultado.tokensEstimados).toLocaleString('pt-BR')} tokens${itemPreview.resultado.tokensReais !== undefined ? ' (reais)' : ' (estimados)'}` +
                (itemPreview.resultado.custoUsd !== undefined && itemPreview.resultado.custoUsd !== null ? ` · ${formatUsd(itemPreview.resultado.custoUsd)}` : '')
              : `Pronto para converter`
          }
          onClose={() => setItemPreview(null)}
          onConverter={() => handleConverterIndividual(itemPreview.id)}
          onCopiar={itemPreview.resultado ? () => copiarMarkdown(itemPreview.resultado!.markdown, `Markdown de "${itemPreview.nome}" copiado.`) : undefined}
          onBaixar={itemPreview.resultado ? () => baixarTexto(`${itemPreview.nome.replace(/\.[^.]+$/, '')}.md`, itemPreview.resultado!.markdown) : undefined}
          onSelecionarArquivo={(file) => {
            setItemPreview(prev => (prev ? { ...prev, file } : null));
            setItens(prev => prev.map(i => (i.id === itemPreview.id ? { ...i, file } : i)));
          }}
        />
      )}

      {historicoAberto && <HistoricoConversoesModal onClose={() => setHistoricoAberto(false)} />}

      {duplicadosAviso && (
        <ArquivoJaConvertidoModal
          duplicados={duplicadosAviso}
          onClose={() => setDuplicadosAviso(null)}
          onVerExistente={handleVerDuplicado}
          onReconverter={handleReconverterDuplicado}
        />
      )}

      {confirmDuplicata && (
        <ConfirmDialog
          titulo="Proposta já extraída neste processo"
          mensagem={`Já existe proposta salva neste processo para ${confirmDuplicata}. Extrair mesmo assim pode criar uma duplicata.`}
          confirmarLabel="Extrair mesmo assim"
          variante="perigo"
          onConfirmar={() => { setConfirmDuplicata(null); prosseguirExtracao(); }}
          onCancelar={() => setConfirmDuplicata(null)}
        />
      )}

      {confirmLimparLista && (
        <ConfirmDialog
          titulo="Limpar a lista de arquivos?"
          mensagem={
            itensConcluidos.length > 0
              ? `${itensConcluidos.length} ${itensConcluidos.length === 1 ? 'arquivo já convertido' : 'arquivos já convertidos'} serão descartados junto com o resto da fila.`
              : 'Todos os arquivos da fila serão removidos.'
          }
          confirmarLabel="Limpar lista"
          variante="perigo"
          onConfirmar={() => { setConfirmLimparLista(false); setItens([]); setDeselecionados(new Set()); }}
          onCancelar={() => setConfirmLimparLista(false)}
        />
      )}

      {confirmRemoverItem && (
        <ConfirmDialog
          titulo="Remover arquivo já convertido?"
          mensagem={`"${confirmRemoverItem.nome}" já foi convertido${confirmRemoverItem.resultado?.custoUsd ? ' com custo de IA' : ''}. Remover descarta esse resultado.`}
          confirmarLabel="Remover"
          variante="perigo"
          onConfirmar={() => { removerItem(confirmRemoverItem.id); setConfirmRemoverItem(null); }}
          onCancelar={() => setConfirmRemoverItem(null)}
        />
      )}
    </div>
  );
}

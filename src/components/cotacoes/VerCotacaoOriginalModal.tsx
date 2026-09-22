/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visualização da cotação original de uma proposta: o arquivo (PDF/imagem)
 * — na memória da sessão que fez o upload, ou no Storage (`cotacoes-arquivos`)
 * para qualquer sessão depois de salva — e o Markdown extraído dele.
 *
 * Precedência de cada lado:
 * - Documento: `file` em memória primeiro (mais rápido, sem round-trip);
 *   senão `storagePath`, com URL assinada de 24h.
 * - Markdown: a cópia gravada na proposta (`markdown`) primeiro — é editável,
 *   então pode já estar corrigida; senão cai para o histórico de conversão
 *   (`ops_conversoes_markdown`), para proposta salva antes desta
 *   funcionalidade existir.
 *
 * Edição: quando o comprador identifica um erro de conversão (tabela
 * quebrada, número trocado pelo OCR), `onEditarMarkdown` corrige a cópia
 * gravada na proposta. Só disponível com `propostaId` (proposta já salva —
 * rascunho não tem onde persistir a correção) e `onEditarMarkdown` passado
 * pelo chamador.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, FileText, FileWarning, Columns2, Code2, Loader2,
  Image as ImageIcon, Pencil, Save, X as XIcon, CheckCircle2, UploadCloud,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import MarkdownPreview from '../markdown/MarkdownPreview';
import { buscarUltimaConversaoPorArquivo } from '../../lib/converterMarkdownApi';
import {
  assinarArquivoCotacao,
  buscarArquivoOriginalPorNome,
  uploadArquivoCotacao,
  vincularArquivoOriginalProposta,
} from '../../lib/cotacoesApi';
import { formatDateTimeBR } from '../../lib/format';
import { useToast } from '../ui/Toast';
import type { ConversaoMarkdownLog } from '../../types';

type Modo = 'dividido' | 'documento' | 'markdown';

interface VerCotacaoOriginalModalProps {
  /** Nome do arquivo (`arquivo_origem` da proposta) — usado como título e para o fallback de busca no histórico de conversão. */
  nome: string;
  /** Arquivo em memória, se a sessão ainda o tiver. */
  file?: File | null;
  /** Caminho no bucket `cotacoes-arquivos`, para propostas já salvas. */
  storagePath?: string | null;
  /** Markdown já gravado na proposta (cópia editável). */
  markdown?: string | null;
  markdownEditadoEm?: string | null;
  markdownEditadoPor?: string | null;
  /** UUID real da proposta — presente só quando já salva; habilita a edição. */
  propostaId?: string | null;
  onClose: () => void;
  /** Persiste a correção do Markdown. Ausente ou sem `propostaId` desativa a edição. */
  onEditarMarkdown?: (novoMarkdown: string) => Promise<void>;
  /** Notifica o chamador quando o arquivo for vinculado ou anexado com sucesso. */
  onArquivoVinculado?: (path: string, mimeType: string, tamanhoBytes: number) => void;
}

function BotaoModo({ ativo, onClick, icone: Icone, children }: { ativo: boolean; onClick: () => void; icone: React.ElementType; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
        ativo
          ? 'bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
      }`}
    >
      <Icone className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

export default function VerCotacaoOriginalModal({
  nome, file, storagePath, markdown, markdownEditadoEm, markdownEditadoPor, propostaId, onClose, onEditarMarkdown, onArquivoVinculado,
}: VerCotacaoOriginalModalProps) {
  const toast = useToast();

  // Documento: file em memória > caminho salvo > busca automatica no Storage por nome
  const [caminhoStorage, setCaminhoStorage] = useState<string | null>(storagePath ?? null);
  const [buscandoFallback, setBuscandoFallback] = useState(false);
  const [urlAssinada, setUrlAssinada] = useState<string | null>(null);
  const [carregandoDocumento, setCarregandoDocumento] = useState(false);
  const [anexando, setAnexando] = useState(false);
  const inputAnexoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storagePath) {
      setCaminhoStorage(storagePath);
    }
  }, [storagePath]);

  // Se nao temos file em memoria nem storagePath gravado, tenta auto-recuperar no Storage pelo nome
  useEffect(() => {
    if (file || caminhoStorage || !nome) return;
    let cancelado = false;
    setBuscandoFallback(true);
    buscarArquivoOriginalPorNome(nome)
      .then(achado => {
        if (cancelado || !achado) return;
        setCaminhoStorage(achado.storagePath);
        if (propostaId) {
          void vincularArquivoOriginalProposta(propostaId, achado.storagePath, achado.mimeType, achado.tamanhoBytes);
        }
        onArquivoVinculado?.(achado.storagePath, achado.mimeType, achado.tamanhoBytes);
      })
      .catch(err => {
        console.warn('Falha na busca automatica do arquivo original por nome:', err);
      })
      .finally(() => {
        if (!cancelado) setBuscandoFallback(false);
      });
    return () => { cancelado = true; };
  }, [file, caminhoStorage, nome, propostaId, onArquivoVinculado]);

  // Assina URL no Storage quando o caminho estiver disponivel
  useEffect(() => {
    if (file || !caminhoStorage) {
      setUrlAssinada(null);
      setCarregandoDocumento(false);
      return;
    }
    let cancelado = false;
    setCarregandoDocumento(true);
    assinarArquivoCotacao(caminhoStorage)
      .then(url => { if (!cancelado) setUrlAssinada(url); })
      .finally(() => { if (!cancelado) setCarregandoDocumento(false); });
    return () => { cancelado = true; };
  }, [file, caminhoStorage]);

  const fileUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  const docUrl = fileUrl ?? urlAssinada;

  // Markdown: cópia gravada na proposta > histórico de conversão (legado).
  const [carregandoHistorico, setCarregandoHistorico] = useState(!markdown);
  const [historico, setHistorico] = useState<ConversaoMarkdownLog | null>(null);
  useEffect(() => {
    if (markdown) { setCarregandoHistorico(false); return; }
    let cancelado = false;
    setCarregandoHistorico(true);
    buscarUltimaConversaoPorArquivo(nome)
      .then(r => { if (!cancelado) setHistorico(r); })
      .finally(() => { if (!cancelado) setCarregandoHistorico(false); });
    return () => { cancelado = true; };
  }, [markdown, nome]);

  const carregandoDoc = carregandoDocumento || buscandoFallback;
  const carregando = carregandoDoc || carregandoHistorico;
  const markdownAtual = markdown ?? historico?.markdown ?? null;
  const temMarkdown = !!markdownAtual;
  const podeEditar = !!propostaId && !!onEditarMarkdown;

  const caminhoEfetivo = caminhoStorage ?? storagePath;
  const ehPdf = file
    ? file.type === 'application/pdf'
    : (nome.toLowerCase().endsWith('.pdf') || (caminhoEfetivo?.toLowerCase().endsWith('.pdf') ?? false));
  const ehImagem = file
    ? file.type.startsWith('image/')
    : (/\.(jpe?g|png|webp|gif|bmp)$/i.test(nome) || (/\.(jpe?g|png|webp|gif|bmp)$/i.test(caminhoEfetivo ?? '')));

  const [modo, setModo] = useState<Modo>('dividido');
  const [modoEscolhidoManual, setModoEscolhidoManual] = useState(false);
  useEffect(() => {
    if (modoEscolhidoManual) return;
    if ((docUrl || carregandoDoc) && temMarkdown) {
      setModo('dividido');
    } else if (docUrl && !temMarkdown) {
      setModo('documento');
    } else if (!docUrl && !carregandoDoc && temMarkdown) {
      setModo('dividido');
    } else {
      setModo('documento');
    }
  }, [carregandoDoc, docUrl, temMarkdown, modoEscolhidoManual]);

  const mudarModo = (m: Modo) => { setModoEscolhidoManual(true); setModo(m); };

  // Anexar arquivo original manualmente (se ainda nao constar no Storage)
  const handleAnexarArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const novoFile = e.target.files?.[0];
    e.target.value = '';
    if (!novoFile) return;

    setAnexando(true);
    try {
      const processoIdParaUpload = propostaId ?? 'avulso';
      const enviado = await uploadArquivoCotacao(processoIdParaUpload, novoFile);
      setCaminhoStorage(enviado.path);

      if (propostaId) {
        await vincularArquivoOriginalProposta(propostaId, enviado.path, enviado.mimeType, enviado.tamanhoBytes);
      }
      onArquivoVinculado?.(enviado.path, enviado.mimeType, enviado.tamanhoBytes);

      const url = await assinarArquivoCotacao(enviado.path);
      setUrlAssinada(url);
      toast.success('Arquivo original anexado e vinculado com sucesso!');
    } catch (err) {
      toast.error(`Falha ao anexar arquivo original: ${(err as Error).message}`);
    } finally {
      setAnexando(false);
    }
  };

  // Edição do Markdown
  const [editando, setEditando] = useState(false);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const iniciarEdicao = () => { setTextoEdicao(markdownAtual ?? ''); setEditando(true); };
  const cancelarEdicao = () => setEditando(false);
  const salvarEdicao = async () => {
    if (!onEditarMarkdown) return;
    setSalvando(true);
    try {
      await onEditarMarkdown(textoEdicao);
      setHistorico(prev => (prev ? { ...prev, markdown: textoEdicao } : prev));
      setEditando(false);
      toast.success('Markdown corrigido e salvo.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const mostraDocumento = modo === 'dividido' || modo === 'documento';
  const mostraMarkdown = modo === 'dividido' || modo === 'markdown';
  const maxWidth = modo === 'dividido' ? 'max-w-[94vw] xl:max-w-6xl' : 'max-w-4xl';

  return (
    <Modal onClose={onClose} maxWidth={maxWidth} ariaLabel={`Cotação original de ${nome}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center justify-between gap-3 pr-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50" title={nome}>{nome}</h3>
            {!carregando && (
              <p className="text-[11px] text-slate-400">
                {markdownEditadoEm
                  ? <>corrigido{markdownEditadoPor ? ` por ${markdownEditadoPor}` : ''} em {formatDateTimeBR(markdownEditadoEm)}</>
                  : historico
                    ? <>convertido{historico.user_name ? ` por ${historico.user_name}` : ''} em {formatDateTimeBR(historico.created_at)}{historico.via === 'ia' ? ' · OCR/IA' : ''}</>
                    : temMarkdown ? null : 'nenhuma conversão em Markdown encontrada para este arquivo'}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {temMarkdown && !editando && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                <BotaoModo ativo={modo === 'dividido'} onClick={() => mudarModo('dividido')} icone={Columns2}>Lado a lado</BotaoModo>
                <BotaoModo ativo={modo === 'documento'} onClick={() => mudarModo('documento')} icone={ehImagem ? ImageIcon : FileText}>Original</BotaoModo>
                <BotaoModo ativo={modo === 'markdown'} onClick={() => mudarModo('markdown')} icone={Code2}>Markdown</BotaoModo>
              </div>
            )}
            {docUrl && (
              <button
                type="button"
                onClick={() => window.open(docUrl, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir em nova guia
              </button>
            )}
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="p-3 sm:p-4">
        <div className={`grid gap-3 ${modo === 'dividido' ? 'h-[70vh] grid-cols-1 lg:grid-cols-2' : 'h-[70vh] grid-cols-1'}`}>
          {mostraDocumento && (
            <div className="min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
              {carregandoDoc || anexando ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-500">
                    {anexando
                      ? 'Enviando arquivo original...'
                      : buscandoFallback
                      ? 'Localizando arquivo original no Storage...'
                      : 'Carregando documento...'}
                  </p>
                </div>
              ) : docUrl ? (
                ehPdf ? (
                  <iframe src={docUrl} title={`Leitor PDF de ${nome}`} className="h-full w-full border-0 bg-white dark:bg-slate-900" />
                ) : ehImagem ? (
                  <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                    <img src={docUrl} alt={nome} className="max-h-full max-w-full rounded-lg object-contain shadow-xs" />
                  </div>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-400" />
                    <p className="text-xs font-medium">Não é possível pré-visualizar este tipo de arquivo aqui.</p>
                  </div>
                )
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileWarning className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                  <p className="max-w-xs text-xs font-medium text-slate-500 dark:text-slate-400">
                    {caminhoStorage
                      ? 'Não foi possível carregar o arquivo original do Storage.'
                      : 'Arquivo original (PDF/imagem) não localizado automaticamente para esta proposta.'}
                  </p>
                  <input
                    ref={inputAnexoRef}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={handleAnexarArquivo}
                  />
                  <button
                    type="button"
                    onClick={() => inputAnexoRef.current?.click()}
                    disabled={anexando}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Anexar PDF / Imagem
                  </button>
                  {temMarkdown && (
                    <p className="text-[11px] text-slate-400">
                      O conteúdo extraído continua disponível ao lado.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {mostraMarkdown && (
            <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/40">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <Code2 className="h-3.5 w-3.5 text-emerald-500" />
                  Conteúdo extraído (Markdown)
                  {markdownEditadoEm && !editando && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      corrigido
                    </span>
                  )}
                </span>
                {podeEditar && temMarkdown && (
                  editando ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={cancelarEdicao}
                        disabled={salvando}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-200 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
                      >
                        <XIcon className="h-3 w-3" />
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={salvarEdicao}
                        disabled={salvando}
                        className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Salvar correção
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={iniciarEdicao}
                      title="Corrigir um erro de conversão neste texto"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  )
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto bg-white p-3 dark:bg-slate-900">
                {carregandoHistorico ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : editando ? (
                  <textarea
                    autoFocus
                    value={textoEdicao}
                    onChange={e => setTextoEdicao(e.target.value)}
                    className="h-full w-full resize-none rounded-lg border border-indigo-200 bg-indigo-50/30 p-2.5 font-mono text-xs text-slate-800 outline-none focus:border-indigo-500 dark:border-indigo-900 dark:bg-indigo-950/10 dark:text-slate-100"
                  />
                ) : temMarkdown ? (
                  <MarkdownPreview markdown={markdownAtual!} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                    <FileWarning className="h-8 w-8 text-slate-300 dark:text-slate-700" />
                    <p className="max-w-xs text-xs font-medium text-slate-500 dark:text-slate-400">
                      Nenhuma conversão em Markdown encontrada para &quot;{nome}&quot; — provavelmente uma proposta cujo texto foi colado à mão.
                    </p>
                  </div>
                )}
              </div>
              {!podeEditar && temMarkdown && !propostaId && (
                <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400 dark:border-slate-800">
                  <CheckCircle2 className="h-3 w-3" />
                  Salve a proposta para poder corrigir este texto.
                </div>
              )}
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

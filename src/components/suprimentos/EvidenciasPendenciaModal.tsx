/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Evidências de uma nota do Processamento de NF (Geral › Pendências): o
 * comprador registra o que comprova o andamento — e-mail colado como texto,
 * comentário, print (Ctrl+V em qualquer ponto do modal), PDF, ou o próprio
 * e-mail salvo do Outlook (.msg/.eml) arrastado ou escolhido.
 *
 * Imagem passa por `prepareAttachment` (regra 1 do CLAUDE.md: comprime antes
 * de subir). Cada evidência é uma linha de `sup_pend_evidencias`; só o autor
 * (ou o admin) remove.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ClipboardPaste, FileText, Loader2, Mail, Paperclip, Plus, Trash2, X, FileArchive,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';
import { confirmar } from '../../lib/confirmar';
import { formatDateTimeBR } from '../../lib/format';
import { localDb } from '../../db/localDb';
import {
  prepareAttachment, AnexoInvalidoError, TAMANHO_MAXIMO_BYTES,
} from '../../lib/imageCompression';
import {
  ACCEPT_EVIDENCIA, mimeEvidencia, rotuloNumero,
} from '../../lib/supPendenciasProcessamento';
import {
  adicionarEvidencias, listarEvidencias, removerEvidencia, type ArquivoEvidencia,
} from '../../lib/supPendenciasApi';
import type { Profile, SupPendenciaEvidencia, SupPendenciaProcessamentoNF } from '../../types';

interface Props {
  linha: SupPendenciaProcessamentoNF;
  user: Profile;
  onClose: () => void;
  /** Chamado com a nova contagem sempre que evidências entram ou saem. */
  onContagem: (pendenciaId: string, total: number) => void;
}

interface Pendente extends ArquivoEvidencia {
  /** Object URL da miniatura (só imagem). */
  preview?: string;
}

const MAX_ARQUIVOS = 10;

const ehImagem = (mime?: string | null) => !!mime && mime.startsWith('image/');
const ehEmail = (mime?: string | null) => mime === 'message/rfc822' || mime === 'application/vnd.ms-outlook';

function tamanhoLegivel(bytes?: number | null): string {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Converte o arquivo escolhido/colado/arrastado no que sobe ao Storage. */
async function prepararArquivo(f: File): Promise<Pendente> {
  const mime = mimeEvidencia(f.name, f.type);
  if (!mime) throw new AnexoInvalidoError(`"${f.name}": formato não aceito. Use imagem, PDF, e-mail (.msg/.eml) ou .txt.`);
  if (f.size > TAMANHO_MAXIMO_BYTES) throw new AnexoInvalidoError(`"${f.name}" passa de 10 MB.`);
  if (ehImagem(mime) || mime === 'application/pdf') {
    const p = await prepareAttachment(f);
    if (!ehImagem(p.mimeType)) URL.revokeObjectURL(p.previewUrl);
    return { blob: p.blob, nome: p.name, mimeType: p.mimeType, preview: ehImagem(p.mimeType) ? p.previewUrl : undefined };
  }
  return { blob: f, nome: f.name, mimeType: mime };
}

/** Nome para print colado, que chega como "image.png" ou sem nome. */
function nomearColado(f: File): File {
  if (f.name && f.name !== 'image.png') return f;
  const ext = f.type.split('/')[1] || 'png';
  return new File([f], `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: f.type });
}

export default function EvidenciasPendenciaModal({ linha, user, onClose, onContagem }: Props) {
  const toast = useToast();
  const lightbox = useLightbox();
  const idTexto = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textoRef = useRef<HTMLTextAreaElement | null>(null);

  const [lista, setLista] = useState<SupPendenciaEvidencia[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState('');
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehAdmin = user.roles.includes('admin');

  const pendentesRef = useRef(pendentes);
  pendentesRef.current = pendentes;
  useEffect(() => () => pendentesRef.current.forEach(p => p.preview && URL.revokeObjectURL(p.preview)), []);

  // Em ref: `carregar` não pode mudar a cada render do pai, senão o efeito recarrega em laço.
  const avisoRef = useRef({ toast, onContagem });
  avisoRef.current = { toast, onContagem };

  const carregar = useCallback(async () => {
    const { toast, onContagem } = avisoRef.current;
    setCarregando(true);
    try {
      const evs = await listarEvidencias(linha.id);
      setLista(evs);
      onContagem(linha.id, evs.length);
      const comArquivo = evs.filter(e => e.path);
      const assinadas = await Promise.all(comArquivo.map(e => localDb.getAttachmentUrl(e.path as string)));
      const mapa: Record<string, string> = {};
      comArquivo.forEach((e, i) => { if (assinadas[i]) mapa[e.id] = assinadas[i] as string; });
      setUrls(mapa);
    } catch (e) {
      toast.error(`Não foi possível carregar as evidências: ${(e as Error).message}`);
    } finally {
      setCarregando(false);
    }
  }, [linha.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionarArquivos = useCallback(async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    setErro(null);
    const vagas = MAX_ARQUIVOS - pendentesRef.current.length;
    if (vagas <= 0) { setErro(`Até ${MAX_ARQUIVOS} arquivos por vez.`); return; }
    setProcessando(true);
    const novos: Pendente[] = [];
    const erros: string[] = [];
    for (const f of arquivos.slice(0, vagas)) {
      try { novos.push(await prepararArquivo(f)); }
      catch (e) { erros.push(e instanceof AnexoInvalidoError ? e.message : `"${f.name}": não foi possível ler.`); }
    }
    if (arquivos.length > vagas) erros.push(`Até ${MAX_ARQUIVOS} arquivos por vez — os demais ficaram de fora.`);
    setPendentes(prev => [...prev, ...novos]);
    setErro(erros.length ? erros.join(' ') : null);
    setProcessando(false);
  }, []);

  /**
   * Ctrl+V em qualquer ponto do modal. Imagem/arquivo vira anexo; texto colado
   * fora da caixa de texto vai para ela (dentro dela, o navegador já cola).
   */
  const handlePaste = (e: React.ClipboardEvent) => {
    const arquivos = Array.from(e.clipboardData.files || []).map(nomearColado);
    const textoColado = e.clipboardData.getData('text/plain');
    const naCaixa = e.target === textoRef.current;
    if (arquivos.length > 0) adicionarArquivos(arquivos);
    if (!naCaixa && textoColado) {
      e.preventDefault();
      setTexto(t => (t ? `${t}\n${textoColado}` : textoColado));
      textoRef.current?.focus();
    } else if (arquivos.length > 0 && !textoColado) {
      e.preventDefault();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const arquivos = Array.from(e.dataTransfer.files || []);
    if (arquivos.length > 0) { adicionarArquivos(arquivos); return; }
    const t = e.dataTransfer.getData('text/plain');
    if (t) setTexto(prev => (prev ? `${prev}\n${t}` : t));
  };

  const removerPendente = (i: number) => {
    setPendentes(prev => {
      const alvo = prev[i];
      if (alvo?.preview) URL.revokeObjectURL(alvo.preview);
      return prev.filter((_, j) => j !== i);
    });
  };

  const salvar = async () => {
    if (!texto.trim() && pendentes.length === 0) return;
    setSalvando(true);
    try {
      const n = await adicionarEvidencias(linha, texto, pendentes);
      pendentes.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
      setPendentes([]);
      setTexto('');
      setErro(null);
      toast.success(n === 1 ? 'Evidência anexada.' : `${n} evidências anexadas.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
      carregar();
    }
  };

  const remover = async (ev: SupPendenciaEvidencia) => {
    const ok = await confirmar({
      titulo: 'Remover evidência',
      mensagem: ev.tipo === 'texto' ? 'O texto será apagado desta nota.' : `"${ev.nome_arquivo || 'arquivo'}" será apagado desta nota.`,
      confirmarLabel: 'Remover',
      variante: 'perigo',
    });
    if (!ok) return;
    setRemovendo(ev.id);
    try {
      await removerEvidencia(ev);
      toast.success('Evidência removida.');
      await carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRemovendo(null);
    }
  };

  const imagensSalvas = lista.filter(e => ehImagem(e.mime_type) && urls[e.id]);
  const abrirImagem = (ev: SupPendenciaEvidencia) => {
    lightbox.abrir(
      imagensSalvas.map(e => ({ url: urls[e.id], legenda: e.nome_arquivo || undefined })),
      imagensSalvas.findIndex(e => e.id === ev.id),
      { copiar: true },
    );
  };

  const podeSalvar = !salvando && !processando && (texto.trim().length > 0 || pendentes.length > 0);

  return (
    <Modal onClose={onClose} ariaLabel="Evidências da nota" maxWidth="max-w-2xl" disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Evidências</p>
        <h3 className="text-base font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
          {rotuloNumero(linha.modelo)} {linha.numero_nfse}
          {linha.nome_fornecedor ? <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}> · {linha.nome_fornecedor}</span> : null}
        </h3>
      </ModalHeader>

      <ModalBody className="space-y-5">
        {/* Nova evidência */}
        <div
          onPaste={handlePaste}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={handleDrop}
          className="rounded-xl border p-3 space-y-2.5 transition-colors"
          style={{
            borderColor: arrastando ? 'var(--brand)' : 'var(--hairline)',
            background: arrastando ? 'var(--brand-wash)' : 'var(--surface-raised)',
          }}
        >
          <label htmlFor={idTexto} className="block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
            Nova evidência
          </label>
          <textarea
            id={idTexto}
            ref={textoRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="Cole aqui o e-mail, escreva um comentário ou cole um print (Ctrl+V)…"
            className="w-full rounded-lg border px-3 py-2 text-[13px] leading-snug resize-y focus:outline-2 focus:outline-offset-1"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
          />

          {pendentes.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pendentes.map((p, i) => (
                <div key={i} className="relative rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  {p.preview ? (
                    <img src={p.preview} alt={p.nome} className="h-20 w-full object-cover" />
                  ) : (
                    <div className="h-20 flex flex-col items-center justify-center gap-1 px-1.5 text-center">
                      {ehEmail(p.mimeType) ? <Mail className="h-5 w-5" style={{ color: 'var(--brand)' }} />
                        : p.mimeType === 'application/pdf' ? <FileText className="h-5 w-5" style={{ color: 'var(--status-critical)' }} />
                        : <FileArchive className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />}
                      <span className="text-[10px] font-semibold line-clamp-2 break-all" style={{ color: 'var(--ink-secondary)' }}>{p.nome}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Tirar ${p.nome}`}
                    onClick={() => removerPendente(i)}
                    className="absolute top-1 right-1 rounded-full p-1 bg-black/55 text-white cursor-pointer hover:bg-black/75"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <span className="absolute bottom-0 inset-x-0 px-1.5 text-[10px] truncate" style={{ background: 'color-mix(in srgb, var(--surface-card) 88%, transparent)', color: 'var(--ink-muted)' }}>
                    {tamanhoLegivel(p.blob.size)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={processando || salvando}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50 hover:bg-[var(--surface-card)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              {processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              Anexar arquivo
            </button>
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <ClipboardPaste className="h-3.5 w-3.5" />
              Ctrl+V cola print; arraste imagem, PDF ou e-mail (.msg/.eml)
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_EVIDENCIA}
            className="hidden"
            onChange={(e) => { adicionarArquivos(Array.from(e.target.files || [])); e.target.value = ''; }}
          />
          {erro && <p className="text-[11px]" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
        </div>

        {/* Evidências registradas */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            Registradas {lista.length > 0 ? `(${lista.length})` : ''}
          </p>
          {carregando ? (
            <div className="flex justify-center py-6" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : lista.length === 0 ? (
            <p className="text-xs py-3" style={{ color: 'var(--ink-muted)' }}>Nenhuma evidência nesta nota ainda.</p>
          ) : (
            lista.map(ev => {
              const podeRemover = ehAdmin || ev.autor_id === user.id;
              const url = urls[ev.id];
              return (
                <div key={ev.id} className="rounded-lg border p-2.5 space-y-1.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--ink-secondary)' }}>{ev.autor_nome || 'Usuário'}</span>
                    <span>{formatDateTimeBR(ev.created_at)}</span>
                    {podeRemover && (
                      <button
                        type="button"
                        aria-label="Remover evidência"
                        onClick={() => remover(ev)}
                        disabled={removendo === ev.id}
                        className="ml-auto rounded-md p-1 cursor-pointer disabled:opacity-50 hover:bg-[var(--surface-raised)]"
                        style={{ color: 'var(--status-critical)' }}
                      >
                        {removendo === ev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  {ev.tipo === 'texto' ? (
                    <p className="text-[13px] leading-snug whitespace-pre-wrap break-words max-h-72 overflow-y-auto" style={{ color: 'var(--ink-primary)' }}>
                      {ev.texto}
                    </p>
                  ) : ehImagem(ev.mime_type) ? (
                    url ? (
                      <button type="button" onClick={() => abrirImagem(ev)} aria-label={`Ver ${ev.nome_arquivo || 'imagem'}`} className="block cursor-zoom-in">
                        <img src={url} alt={ev.nome_arquivo || 'Evidência'} className="max-h-48 rounded-md border object-contain" style={{ borderColor: 'var(--hairline)' }} />
                      </button>
                    ) : <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando imagem…</span>
                  ) : (
                    <a
                      href={url || undefined}
                      target={ev.mime_type === 'application/pdf' ? '_blank' : undefined}
                      rel="noreferrer"
                      download={ev.mime_type === 'application/pdf' ? undefined : (ev.nome_arquivo || true)}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                    >
                      {ehEmail(ev.mime_type) ? <Mail className="h-4 w-4" style={{ color: 'var(--brand)' }} />
                        : <FileText className="h-4 w-4" style={{ color: ev.mime_type === 'application/pdf' ? 'var(--status-critical)' : 'var(--ink-muted)' }} />}
                      <span className="break-all">{ev.nome_arquivo || 'arquivo'}</span>
                      <span className="font-normal" style={{ color: 'var(--ink-muted)' }}>{tamanhoLegivel(ev.tamanho)}</span>
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-4 py-2 text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Adicionar evidência
        </button>
      </ModalFooter>
      {lightbox.elemento}
    </Modal>
  );
}

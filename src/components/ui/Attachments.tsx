/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Anexos de solicitação — seleção (com compressão) e visualização.
 *
 * `AttachmentPicker` é usado antes de a solicitação existir: comprime no momento
 * da escolha e segura os blobs em memória, para que o envio só faça rede. Quem
 * usa é dono do estado e o repassa ao `localDb.uploadAttachments` depois do
 * submit.
 *
 * `AttachmentGallery` é o lado de leitura: o bucket é privado, então cada
 * miniatura depende de uma URL assinada resolvida de forma assíncrona.
 *
 * Ver documentos/superpowers/specs/2026-07-28-anexos-imagens-design.md
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, X, FileText, ImageIcon, AlertTriangle, Loader2 } from 'lucide-react';
import {
  prepareAttachment,
  AnexoInvalidoError,
  PreparedAttachment,
  ACCEPT_ANEXO,
  MAX_ANEXOS,
} from '../../lib/imageCompression';
import { formatFileSize } from '../../lib/format';
import { localDb } from '../../db/localDb';
import { RequestAttachment } from '../../types';

const ehPdf = (mime?: string) => mime === 'application/pdf';

/* --------------------------------------------------------------------- */
/* Seleção                                                                */
/* --------------------------------------------------------------------- */

interface AttachmentPickerProps {
  value: PreparedAttachment[];
  onChange: (anexos: PreparedAttachment[]) => void;
  max?: number;
  disabled?: boolean;
  /** Texto do botão. Muda entre "foto do item" e "imagem ou documento". */
  label?: string;
}

export function AttachmentPicker({
  value,
  onChange,
  max = MAX_ANEXOS,
  disabled = false,
  label = 'Anexar imagem ou PDF',
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);

  const cheio = value.length >= max;

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const escolhidos = Array.from(e.target.files || []);
    // Zera o input já: sem isso, escolher o mesmo arquivo de novo depois de
    // removê-lo não dispara change (o valor não mudou).
    e.target.value = '';
    if (escolhidos.length === 0) return;

    setErro('');
    setProcessando(true);

    const aceitos: PreparedAttachment[] = [];
    const recusados: string[] = [];

    for (const file of escolhidos.slice(0, max - value.length)) {
      try {
        aceitos.push(await prepareAttachment(file));
      } catch (err) {
        recusados.push(
          err instanceof AnexoInvalidoError ? `${file.name}: ${err.message}` : `${file.name}: falha ao processar.`
        );
      }
    }

    if (escolhidos.length > max - value.length) {
      recusados.push(`Limite de ${max} anexos; os excedentes foram ignorados.`);
    }

    setProcessando(false);
    setErro(recusados.join(' '));
    if (aceitos.length > 0) onChange([...value, ...aceitos]);
  };

  const remover = (idx: number) => {
    URL.revokeObjectURL(value[idx].previewUrl);
    onChange(value.filter((_, i) => i !== idx));
    setErro('');
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ANEXO}
        multiple
        className="hidden"
        onChange={handleSelect}
      />

      <button
        type="button"
        disabled={disabled || cheio || processando}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
      >
        <Paperclip className="h-3.5 w-3.5" />
        {processando ? 'Comprimindo…' : cheio ? `Limite de ${max} anexos` : label}
      </button>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((a, idx) => (
            <li
              key={a.previewUrl}
              className="flex items-center gap-2 rounded-lg border p-1.5 pr-2"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              {ehPdf(a.mimeType) ? (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded"
                  style={{ background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}
                >
                  <FileText className="h-4 w-4" />
                </span>
              ) : (
                <img src={a.previewUrl} alt="" className="h-9 w-9 rounded object-cover" />
              )}

              <div className="min-w-0">
                <p className="max-w-[140px] truncate text-[11px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {a.name}
                </p>
                <p className="text-[10px]" style={{ color: 'var(--ink-secondary)' }}>
                  {a.sizeCompressed < a.sizeOriginal
                    ? `${formatFileSize(a.sizeOriginal)} → ${formatFileSize(a.sizeCompressed)}`
                    : formatFileSize(a.sizeCompressed)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => remover(idx)}
                aria-label={`Remover ${a.name}`}
                className="ml-1 cursor-pointer rounded p-0.5 transition-colors hover:opacity-70"
                style={{ color: 'var(--ink-secondary)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p className="flex items-start gap-1 text-[10px] font-semibold text-red-600">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>{erro}</span>
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Visualização                                                           */
/* --------------------------------------------------------------------- */

interface AttachmentGalleryProps {
  requestId: string;
  /** Restringe aos anexos de um item de compra. Omitido, mostra todos. */
  itemId?: string;
  /** Muda para forçar recarga depois de um upload novo. */
  refreshKey?: number;
  emptyLabel?: string;
  /**
   * Habilita a exclusão. Sem esta prop a galeria é somente leitura — é o que
   * mantém as telas de acompanhamento (Cadastros SAP, Solicitações) intocadas.
   */
  onDelete?: (anexoId: string) => Promise<string | null>;
}

export function AttachmentGallery({ requestId, itemId, refreshKey, emptyLabel, onDelete }: AttachmentGalleryProps) {
  const [anexos, setAnexos] = useState<RequestAttachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [excluindo, setExcluindo] = useState<string | null>(null);

  useEffect(() => {
    const lista = localDb.getAttachments(requestId, itemId);
    setAnexos(lista);

    // O bucket é privado: cada miniatura precisa de uma URL assinada. `cancelado`
    // evita gravar estado de uma solicitação que já saiu da tela.
    let cancelado = false;
    (async () => {
      const resolvidas: Record<string, string> = {};
      for (const a of lista) {
        const url = await localDb.getAttachmentUrl(a.storage_path || a.url);
        if (url) resolvidas[a.id] = url;
      }
      if (!cancelado) setUrls(resolvidas);
    })();

    return () => { cancelado = true; };
  }, [requestId, itemId, refreshKey]);

  if (anexos.length === 0) {
    return emptyLabel ? (
      <p className="text-[11px] italic" style={{ color: 'var(--ink-secondary)' }}>{emptyLabel}</p>
    ) : null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {anexos.map(a => {
        const url = urls[a.id];
        const conteudo = ehPdf(a.mime_type) ? (
          <span
            className="flex h-14 w-14 items-center justify-center rounded-lg border"
            style={{ borderColor: 'var(--hairline)', background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}
          >
            <FileText className="h-5 w-5" />
          </span>
        ) : url ? (
          <img
            src={url}
            alt={a.name}
            className="h-14 w-14 rounded-lg border object-cover"
            style={{ borderColor: 'var(--hairline)' }}
          />
        ) : (
          <span
            className="flex h-14 w-14 items-center justify-center rounded-lg border"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ImageIcon className="h-5 w-5 opacity-40" />
          </span>
        );

        return (
          <li key={a.id} className="relative">
            <a
              href={url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              title={`${a.name} — ${formatFileSize(a.size)}`}
              className="block cursor-pointer transition-opacity hover:opacity-80"
            >
              {conteudo}
            </a>

            {onDelete && (
              <button
                type="button"
                disabled={excluindo === a.id}
                aria-label={`Excluir ${a.name}`}
                title="Excluir anexo"
                onClick={async () => {
                  // Definitiva e imediata — não espera o salvamento da edição.
                  if (!window.confirm(`Excluir "${a.name}"? Esta ação não pode ser desfeita.`)) return;
                  setExcluindo(a.id);
                  const erro = await onDelete(a.id);
                  setExcluindo(null);
                  if (erro) { window.alert(erro); return; }
                  setAnexos(atuais => atuais.filter(x => x.id !== a.id));
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border text-white shadow-sm transition-opacity disabled:opacity-50"
                style={{ background: '#dc2626', borderColor: '#fff' }}
              >
                {excluindo === a.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <X className="h-3 w-3" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

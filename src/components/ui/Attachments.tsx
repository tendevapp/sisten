/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Anexos de solicitação — seleção (com compressão) e visualização.
 *
 * `AttachmentPicker` é usado antes de a solicitação existir: comprime no momento
 * da escolha e segura os blobs em memória, para que o envio só faça rede. Quem
 * usa é dono do estado e o repassa ao `localDb.uploadAttachments` depois do
 * submit. Aceita arquivo escolhido, foto da câmera, imagem arrastada e imagem
 * colada da área de transferência — as quatro entradas passam pelo mesmo
 * `adicionarArquivos`, então a validação e a compressão são as mesmas.
 *
 * `AttachmentGallery` é o lado de leitura: o bucket é privado, então cada
 * miniatura depende de uma URL assinada resolvida de forma assíncrona.
 *
 * Ver documentos/superpowers/specs/2026-07-28-anexos-imagens-design.md
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, X, FileText, ImageIcon, AlertTriangle, Loader2, Search, Check, Camera, ClipboardPaste } from 'lucide-react';
import {
  prepareAttachment,
  AnexoInvalidoError,
  PreparedAttachment,
  ACCEPT_ANEXO,
  MAX_ANEXOS,
} from '../../lib/imageCompression';
import { usePonteiroGrosso } from '../../lib/usePonteiroGrosso';
import { formatFileSize } from '../../lib/format';
import { localDb } from '../../db/localDb';
import { RequestAttachment } from '../../types';

const ehPdf = (mime?: string) => mime === 'application/pdf';
const ehImagem = (mime?: string) => !!mime && mime.startsWith('image/');

/* --------------------------------------------------------------------- */
/* Banco de imagens — reaproveitar anexo já enviado para o mesmo material */
/* --------------------------------------------------------------------- */

interface ImageBankModalProps {
  materialCode: string;
  /** ids já vinculados neste item, para não oferecer de novo. */
  jaAdicionados: Set<string>;
  onSelect: (anexo: RequestAttachment) => void;
  onClose: () => void;
}

function ImageBankModal({ materialCode, jaAdicionados, onSelect, onClose }: ImageBankModalProps) {
  const [candidatos] = useState<RequestAttachment[]>(
    () => localDb.getAttachmentsByMaterialCode(materialCode).filter(a => ehImagem(a.mime_type))
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const resolvidas: Record<string, string> = {};
      for (const a of candidatos) {
        const url = await localDb.getAttachmentUrl(a.storage_path || a.url);
        if (url) resolvidas[a.id] = url;
      }
      if (!cancelado) {
        setUrls(resolvidas);
        setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [candidatos]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md max-h-[80vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Imagens já enviadas</h3>
            <p className="text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>Material {materialCode}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded cursor-pointer" style={{ color: 'var(--ink-muted)' }} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          {carregando ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Buscando imagens...
            </p>
          ) : candidatos.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma imagem encontrada para este material ainda.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2.5">
              {candidatos.map(a => {
                const jaTem = jaAdicionados.has(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      disabled={jaTem}
                      onClick={() => onSelect(a)}
                      title={jaTem ? 'Já adicionada a este item' : `Usar "${a.name}"`}
                      className="relative w-full aspect-square rounded-lg border overflow-hidden cursor-pointer transition-opacity disabled:cursor-default group"
                      style={{ borderColor: 'var(--hairline)' }}
                    >
                      {urls[a.id] ? (
                        <img src={urls[a.id]} alt={a.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center" style={{ color: 'var(--ink-muted)' }}>
                          <ImageIcon className="h-5 w-5 opacity-40" />
                        </span>
                      )}
                      <span
                        className="absolute inset-0 flex items-center justify-center transition-opacity"
                        style={{
                          background: jaTem ? 'rgb(0 0 0 / 0.45)' : 'rgb(0 0 0 / 0)',
                          opacity: jaTem ? 1 : undefined,
                        }}
                      >
                        {jaTem && <Check className="h-5 w-5 text-white" />}
                        {!jaTem && (
                          <span className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full w-full text-[10px] font-bold text-white transition-opacity" style={{ background: 'rgb(0 0 0 / 0.45)' }}>
                            Usar esta
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Seleção                                                                */
/* --------------------------------------------------------------------- */

/** Miniatura de um anexo já existente (reaproveitado do banco de imagens) — resolve sua própria URL assinada. */
function ReusedThumb({ anexo }: { anexo: RequestAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    localDb.getAttachmentUrl(anexo.storage_path || anexo.url).then(u => { if (!cancelado) setUrl(u); });
    return () => { cancelado = true; };
  }, [anexo.id]);

  if (ehPdf(anexo.mime_type)) {
    return (
      <span
        className="flex h-9 w-9 items-center justify-center rounded"
        style={{ background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}
      >
        <FileText className="h-4 w-4" />
      </span>
    );
  }
  return url ? (
    <img src={url} alt="" className="h-9 w-9 rounded object-cover" />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>
      <ImageIcon className="h-4 w-4 opacity-40" />
    </span>
  );
}

interface AttachmentPickerProps {
  value: PreparedAttachment[];
  onChange: (anexos: PreparedAttachment[]) => void;
  /** Anexos já existentes no Storage, vinculados sem reenvio (banco de imagens). */
  reusedValue?: RequestAttachment[];
  onReusedChange?: (anexos: RequestAttachment[]) => void;
  /**
   * Código SAP do item. Presente e completo, habilita o botão "Buscar
   * imagem" para reaproveitar uma foto já enviada em outra solicitação para
   * o mesmo material.
   */
  materialCode?: string;
  max?: number;
  disabled?: boolean;
  /** Texto do botão. Muda entre "foto do item" e "imagem ou documento". */
  label?: string;
}

export function AttachmentPicker({
  value,
  onChange,
  reusedValue = [],
  onReusedChange,
  materialCode,
  max = MAX_ANEXOS,
  disabled = false,
  label = 'Anexar imagem ou PDF',
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const ehTouch = usePonteiroGrosso();
  const [erro, setErro] = useState('');
  const [processando, setProcessando] = useState(false);
  const [bancoAberto, setBancoAberto] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [dicaColar, setDicaColar] = useState(false);

  const total = value.length + reusedValue.length;
  const cheio = total >= max;

  /** Caminho único de entrada: escolher, fotografar, arrastar ou colar. */
  const adicionarArquivos = async (escolhidos: File[]) => {
    if (escolhidos.length === 0) return;

    setErro('');
    setDicaColar(false);
    setProcessando(true);

    const aceitos: PreparedAttachment[] = [];
    const recusados: string[] = [];
    const vagas = max - total;

    for (const file of escolhidos.slice(0, vagas)) {
      try {
        aceitos.push(await prepareAttachment(file));
      } catch (err) {
        recusados.push(
          err instanceof AnexoInvalidoError ? `${file.name}: ${err.message}` : `${file.name}: falha ao processar.`
        );
      }
    }

    if (escolhidos.length > vagas) {
      recusados.push(`Limite de ${max} anexos; os excedentes foram ignorados.`);
    }

    setProcessando(false);
    setErro(recusados.join(' '));
    if (aceitos.length > 0) onChange([...value, ...aceitos]);
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const escolhidos = Array.from(e.target.files || []);
    // Zera o input já: sem isso, escolher o mesmo arquivo de novo depois de
    // removê-lo não dispara change (o valor não mudou).
    e.target.value = '';
    adicionarArquivos(escolhidos);
  };

  /**
   * Uma captura de tela chega na área de transferência sem nome de arquivo (ou
   * como "image.png" para todas). Sem renomear, três prints viram três anexos
   * homônimos e ninguém distingue um do outro depois de enviados.
   */
  const nomearColada = (f: File): File => {
    if (f.name && f.name !== 'image.png') return f;
    const extensao = f.type.split('/')[1] || 'png';
    return new File([f], `imagem-colada-${Date.now()}.${extensao}`, { type: f.type });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled || cheio) return;

    const arquivos = Array.from(e.clipboardData.items)
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter((f): f is File => f !== null)
      .map(nomearColada);

    if (arquivos.length === 0) return;
    e.preventDefault();
    adicionarArquivos(arquivos);
  };

  /**
   * Botão "Colar": tenta ler a área de transferência direto, o que resolve em
   * um clique. O navegador pode recusar (sem permissão, sem suporte, ou fora
   * de HTTPS) — nesse caso o campo recebe o foco e a dica de Ctrl+V aparece,
   * que é o caminho que sempre funciona.
   */
  const colarDaAreaDeTransferencia = async () => {
    setErro('');
    try {
      const itens = await navigator.clipboard.read();
      const arquivos: File[] = [];

      for (const item of itens) {
        const tipo = item.types.find(t => t.startsWith('image/') || t === 'application/pdf');
        if (!tipo) continue;
        const blob = await item.getType(tipo);
        arquivos.push(nomearColada(new File([blob], '', { type: tipo })));
      }

      if (arquivos.length === 0) {
        setDicaColar(false);
        setErro('Não há imagem na área de transferência. Copie a imagem e tente de novo.');
        return;
      }
      adicionarArquivos(arquivos);
    } catch {
      // Sem permissão ou sem suporte: cai no Ctrl+V manual.
      setDicaColar(true);
      areaRef.current?.focus();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (disabled || cheio) return;
    adicionarArquivos(Array.from(e.dataTransfer.files));
  };

  const remover = (idx: number) => {
    URL.revokeObjectURL(value[idx].previewUrl);
    onChange(value.filter((_, i) => i !== idx));
    setErro('');
  };

  const removerReusado = (idx: number) => {
    onReusedChange?.(reusedValue.filter((_, i) => i !== idx));
    setErro('');
  };

  const selecionarDoBanco = (anexo: RequestAttachment) => {
    onReusedChange?.([...reusedValue, anexo]);
  };

  return (
    /*
      O wrapper inteiro é o alvo de colar e de arrastar, em vez de uma área
      tracejada separada: este campo aparece dentro de linhas de item bem
      compactas em Nova Solicitação, onde uma caixa de soltar de 70px de altura
      quebraria a lista. `tabIndex` existe para que o campo possa receber foco
      e ouvir o Ctrl+V.
    */
    <div
      ref={areaRef}
      tabIndex={disabled ? -1 : 0}
      onPaste={handlePaste}
      onDragOver={(e) => { e.preventDefault(); if (!disabled && !cheio) setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={handleDrop}
      /*
        `onBlur` no React é focusout e borbulha: sem checar para onde o foco
        foi, clicar no botão "Colar imagem" (um filho) apagaria a dica no mesmo
        instante em que ela aparece. Só limpa quando o foco sai do campo todo.
      */
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDicaColar(false);
      }}
      aria-label="Área de anexos — cole uma imagem com Ctrl+V ou arraste arquivos aqui"
      className="space-y-2 rounded-lg transition-colors focus:outline-2 focus:outline-offset-2"
      style={{
        outlineColor: 'var(--brand)',
        ...(arrastando
          ? { outline: '2px dashed var(--brand)', outlineOffset: '4px', background: 'var(--brand-wash)' }
          : null),
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ANEXO}
        multiple
        className="hidden"
        onChange={handleSelect}
      />
      {/*
        Input separado para a câmera: `capture` é atributo do elemento e não dá
        para alterná-lo no clique. Sem `multiple` — a captura devolve uma foto
        por vez. Só faz sentido em aparelho tocado (ver usePonteiroGrosso); no
        desktop o botão abriria o mesmo seletor de arquivos.
      */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelect}
      />

      <div className="flex flex-wrap items-center gap-2">
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

        {/*
          Em aparelho tocado não há Ctrl+V nem área de transferência de imagem
          acessível: lá o botão útil é o da câmera, logo abaixo.
        */}
        {!ehTouch && (
          <button
            type="button"
            disabled={disabled || cheio || processando}
            onClick={colarDaAreaDeTransferencia}
            title="Colar imagem copiada (Ctrl+V)"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <ClipboardPaste className="h-3.5 w-3.5" />
            Colar imagem
          </button>
        )}

        {ehTouch && (
          <button
            type="button"
            disabled={disabled || cheio || processando}
            onClick={() => cameraRef.current?.click()}
            title="Tirar foto agora"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <Camera className="h-3.5 w-3.5" />
            Tirar foto
          </button>
        )}

        {materialCode && onReusedChange && (
          <button
            type="button"
            disabled={disabled || cheio}
            onClick={() => setBancoAberto(true)}
            title="Buscar imagem já enviada para este material"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--brand)', background: 'var(--surface-card)' }}
          >
            <Search className="h-3.5 w-3.5" />
            Buscar imagem
          </button>
        )}
      </div>

      {bancoAberto && materialCode && (
        <ImageBankModal
          materialCode={materialCode}
          jaAdicionados={new Set(reusedValue.map(a => a.id))}
          onSelect={selecionarDoBanco}
          onClose={() => setBancoAberto(false)}
        />
      )}

      {(value.length > 0 || reusedValue.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {reusedValue.map((a, idx) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border p-1.5 pr-2"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
            >
              <ReusedThumb anexo={a} />

              <div className="min-w-0">
                <p className="max-w-[140px] truncate text-[11px] font-semibold" style={{ color: 'var(--ink-primary)' }}>
                  {a.name}
                </p>
                <p className="text-[10px] font-semibold" style={{ color: 'var(--brand)' }}>
                  Do banco de imagens
                </p>
              </div>

              <button
                type="button"
                onClick={() => removerReusado(idx)}
                aria-label={`Remover ${a.name}`}
                className="ml-1 cursor-pointer rounded p-0.5 transition-colors hover:opacity-70"
                style={{ color: 'var(--ink-secondary)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
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

      {dicaColar && !erro && (
        <p className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: 'var(--brand-strong)' }}>
          <ClipboardPaste className="h-3 w-3 shrink-0" />
          <span>Agora tecle Ctrl+V para colar a imagem copiada.</span>
        </p>
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

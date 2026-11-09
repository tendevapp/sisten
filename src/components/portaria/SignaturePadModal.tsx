/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coleta de assinatura na tela (dedo, caneta do tablet ou mouse).
 *
 * Usa Pointer Events, que tratam toque, S Pen e mouse num fluxo só, com
 * `setPointerCapture` para o traço não parar quando o dedo sai do quadro. O
 * "desenhando" fica num ref (não em state): o primeiro movimento do dedo chega
 * antes de o React renderizar de novo e era perdido. As coordenadas são
 * convertidas pela razão entre o tamanho real do canvas e o exibido, então o
 * traço acompanha o dedo mesmo com zoom/escala da página. O quadro é
 * redimensionado com ResizeObserver (girar o tablet não desalinha nem apaga
 * a área antes de começar).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, RotateCcw, Check, PenTool } from 'lucide-react';
import Modal from '../ui/Modal';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signatureDataUrl: string) => void;
  title?: string;
  subtitle?: string;
}

const COR_TRACO = '#0f172a';

export default function SignaturePadModal({
  isOpen,
  onClose,
  onSave,
  title = 'Assinatura Digital',
  subtitle = 'Desenhe a assinatura no campo abaixo usando o dedo ou mouse',
}: SignaturePadModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const ultimoPonto = useRef<{ x: number; y: number } | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const temTraco = useRef(false);

  /** Ajusta a resolução do canvas ao tamanho exibido (nitidez em telas de alta densidade). */
  const prepararCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // 2x fixo, como antes: nítido no tablet sem inflar o base64 que vai para o banco e o PDF.
    const escala = 2;
    const largura = Math.round(rect.width * escala);
    const altura = Math.round(rect.height * escala);
    if (canvas.width === largura && canvas.height === altura) return;

    // Redimensionar apaga o canvas: guarda o traço e redesenha esticado.
    const anterior = temTraco.current ? canvas.toDataURL('image/png') : null;
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    if (anterior) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, largura, altura);
      img.src = anterior;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setHasDrawn(false);
    temTraco.current = false;
    desenhando.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Zera o tamanho para forçar o preparo com fundo branco limpo.
    canvas.width = 0;
    canvas.height = 0;
    prepararCanvas();
    const observador = new ResizeObserver(() => prepararCanvas());
    observador.observe(canvas);
    return () => observador.disconnect();
  }, [isOpen, prepararCanvas]);

  if (!isOpen) return null;

  /** Ponto do evento em pixels do canvas (independe de zoom, escala e devicePixelRatio). */
  const pontoNoCanvas = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const espessura = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const escala = canvas.width / (canvas.getBoundingClientRect().width || 1);
    // Caneta com pressão engrossa um pouco o traço; dedo/mouse usam o padrão.
    const pressao = e.pointerType === 'pen' && e.pressure > 0 ? 0.6 + e.pressure : 1;
    return 2.5 * escala * pressao;
  };

  const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = pontoNoCanvas(e);
    desenhando.current = true;
    ultimoPonto.current = p;
    // Um toque sem arrastar ainda deixa um ponto.
    ctx.fillStyle = COR_TRACO;
    ctx.beginPath();
    ctx.arc(p.x, p.y, espessura(e) / 2, 0, Math.PI * 2);
    ctx.fill();
    if (!temTraco.current) {
      temTraco.current = true;
      setHasDrawn(true);
    }
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx || !ultimoPonto.current) return;
    // Pontos intermediários que o navegador agrupou: traço mais liso no tablet.
    const eventos = typeof e.nativeEvent.getCoalescedEvents === 'function'
      ? e.nativeEvent.getCoalescedEvents()
      : [];
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const pontos = eventos.length
      ? eventos.map(ev => ({
        x: ((ev.clientX - rect.left) * canvas.width) / rect.width,
        y: ((ev.clientY - rect.top) * canvas.height) / rect.height,
      }))
      : [pontoNoCanvas(e)];

    ctx.strokeStyle = COR_TRACO;
    ctx.lineWidth = espessura(e);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ultimoPonto.current.x, ultimoPonto.current.y);
    for (const p of pontos) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPonto.current = pontos[pontos.length - 1];
  };

  const parar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    desenhando.current = false;
    ultimoPonto.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    temTraco.current = false;
    setHasDrawn(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !temTraco.current) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  // Sobre o Modal do app (e não mais `fixed inset-0` à mão): quase sempre abre
  // POR CIMA de outro modal (cadastro do sorteado, ficha de EPI…). Fora da
  // pilha, um Esc aqui fechava o modal de baixo e a pessoa perdia o que tinha
  // digitado; o Tab também ficava preso no de trás. `disableOutsideClose`
  // mantém o comportamento de antes: o dedo que escapa do quadro e toca o
  // fundo não descarta a assinatura — fecha só pelo X ou por Cancelar.
  return (
    <Modal
      onClose={onClose}
      ariaLabel={title}
      maxWidth="max-w-lg md:max-w-2xl"
      zIndexClassName="z-[110]"
      layout="dialog"
      disableOutsideClose
    >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <PenTool className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="relative h-56 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white sm:h-64 md:h-80 dark:border-slate-700">
            <canvas
              ref={canvasRef}
              onPointerDown={iniciar}
              onPointerMove={mover}
              onPointerUp={parar}
              onPointerCancel={parar}
              onContextMenu={e => e.preventDefault()}
              aria-label="Área de assinatura"
              className="block h-full w-full cursor-crosshair touch-none select-none rounded-xl"
              style={{ touchAction: 'none' }}
            />
            {!hasDrawn && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-medium text-slate-500">
                  Assine aqui com o dedo ou a caneta
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-slate-300" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Limpar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!hasDrawn}
              onClick={handleConfirm}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <Check className="h-4 w-4" />
              Confirmar Assinatura
            </button>
          </div>
        </div>
    </Modal>
  );
}

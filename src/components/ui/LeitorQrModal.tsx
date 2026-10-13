/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitor de QR (e código de barras, onde o aparelho permitir) pela câmera.
 * Abre a câmera traseira, entrega o primeiro texto lido e fecha.
 *
 * Usa o `BarcodeDetector` do navegador quando existe (Chrome/Android — rápido
 * e também lê código de barras das etiquetas antigas); senão decodifica o QR
 * quadro a quadro com o `jsqr`, carregado só quando o leitor abre (iPhone).
 * A câmera só funciona em HTTPS (ou localhost).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Camera, Loader2, X } from 'lucide-react';

interface Props {
  titulo?: string;
  onLido: (texto: string) => void;
  onClose: () => void;
}

type Detector = { detect: (fonte: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

const FORMATOS_DESEJADOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'];

async function criarDetectorNativo(): Promise<Detector | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: any }).BarcodeDetector;
  if (!BD) return null;
  try {
    const suportados: string[] = typeof BD.getSupportedFormats === 'function' ? await BD.getSupportedFormats() : ['qr_code'];
    const formatos = FORMATOS_DESEJADOS.filter(f => suportados.includes(f));
    if (!formatos.includes('qr_code')) return null;
    return new BD({ formats: formatos }) as Detector;
  } catch {
    return null;
  }
}

function mensagemDeErro(err: unknown): string {
  const nome = (err as { name?: string })?.name;
  if (nome === 'NotAllowedError' || nome === 'SecurityError') {
    return 'Permissão da câmera negada. Libere a câmera para este site nas configurações do navegador e tente de novo.';
  }
  if (nome === 'NotFoundError' || nome === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho.';
  if (nome === 'NotReadableError') return 'A câmera está em uso por outro aplicativo. Feche-o e tente de novo.';
  if (typeof window !== 'undefined' && !window.isSecureContext) return 'A câmera só abre em conexão segura (https).';
  return 'Não foi possível abrir a câmera.';
}

export default function LeitorQrModal({ titulo = 'Ler QR da etiqueta', onLido, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, setIniciando] = useState(true);
  const onLidoRef = useRef(onLido);
  onLidoRef.current = onLido;

  useEffect(() => {
    let ativo = true;
    let stream: MediaStream | null = null;
    let quadro = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const parar = () => {
      cancelAnimationFrame(quadro);
      stream?.getTracks().forEach(t => t.stop());
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('sem getUserMedia'), { name: 'NotFoundError' });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!ativo) { parar(); return; }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setIniciando(false);

        const nativo = await criarDetectorNativo();
        const jsQR = nativo ? null : (await import('jsqr')).default;
        let ocupado = false;

        const ler = async () => {
          if (!ativo) return;
          if (!ocupado && video.readyState >= 2 && video.videoWidth > 0) {
            ocupado = true;
            try {
              let texto: string | null = null;
              if (nativo) {
                const achados = await nativo.detect(video);
                texto = achados[0]?.rawValue ?? null;
              } else if (jsQR && ctx) {
                // Reduz o quadro: o jsqr é por pixel, e 640px de largura já lê a etiqueta.
                const escala = Math.min(1, 640 / video.videoWidth);
                canvas.width = Math.round(video.videoWidth * escala);
                canvas.height = Math.round(video.videoHeight * escala);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                texto = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
              }
              if (texto && ativo) {
                ativo = false;
                parar();
                if (navigator.vibrate) navigator.vibrate(80);
                onLidoRef.current(texto);
                return;
              }
            } catch {
              // quadro ruim: tenta o próximo
            } finally {
              ocupado = false;
            }
          }
          quadro = requestAnimationFrame(() => void ler());
        };
        void ler();
      } catch (err) {
        if (ativo) {
          setErro(mensagemDeErro(err));
          setIniciando(false);
        }
      }
    })();

    return () => {
      ativo = false;
      parar();
    };
  }, []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  // Portal no body: o leitor abre de dentro de outro modal, e um ancestral com
  // transform faria o `fixed` ficar preso nele.
  return createPortal(
    <div className="fixed inset-0 z-[160] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="inline-flex items-center gap-2 text-sm font-bold">
          <Camera className="h-4 w-4" /> {titulo}
        </span>
        <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fechar leitor">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />

        {!erro && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-60 w-60 max-w-[75vw] max-h-[75vw] rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {iniciando && !erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs font-semibold">Abrindo a câmera…</span>
          </div>
        )}

        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="max-w-sm text-sm font-semibold">{erro}</p>
            <button type="button" onClick={onClose} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900">
              Voltar e digitar o código
            </button>
          </div>
        )}
      </div>

      {!erro && (
        <p className="px-4 py-3 text-center text-xs text-white/80">
          Aponte para o QR da etiqueta da prateleira. A leitura é automática.
        </p>
      )}
    </div>,
    document.body,
  );
}

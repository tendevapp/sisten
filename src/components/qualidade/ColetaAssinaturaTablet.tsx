/**
 * Coleta de assinatura em tela cheia, feita para entregar o tablet a quem
 * assina: nome em destaque, área grande para assinar com dedo ou caneta e
 * selfie pela câmera frontal ao vivo (getUserMedia). Sem câmera disponível ou
 * sem permissão, cai no seletor nativo com capture="user".
 *
 * Os traços ficam guardados em coordenadas relativas (0–1) e são redesenhados
 * quando a área muda de tamanho — girar o tablet não apaga a assinatura. Na
 * exportação o PNG é recortado no contorno dos traços, para a assinatura não
 * sair minúscula no PDF.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Loader2, PenTool, RefreshCw, RotateCcw, X } from 'lucide-react';
import Bilingue from './Bilingue';

export type ModoColeta = 'DESENHO' | 'SELFIE';

export interface AssinaturaColetada {
  nome: string;
  tipo: ModoColeta;
  arquivo: File;
  /** Momento da assinatura (ISO), gravado e exibido com data e hora. */
  assinadoEm: string;
}

export function formatarDataHoraAssinatura(valor?: string | null): string {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

interface Props {
  aberto: boolean;
  /** Papel no formato "Português / English". */
  papel: string;
  /** Linha de identificação: código e tramo, ou "5 checklists". */
  contexto?: string;
  nomeInicial?: string;
  modoInicial?: ModoColeta;
  /** Texto do passo, ex.: "2 de 4". */
  passo?: string;
  onConfirmar: (assinatura: AssinaturaColetada) => Promise<void> | void;
  onFechar: () => void;
}

type Ponto = { x: number; y: number };
const TRACO = '#0f172a';

function desenharTracos(canvas: HTMLCanvasElement, tracos: Ponto[][]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = TRACO;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, Math.min(w, h) / 110);
  for (const traco of tracos) {
    if (!traco.length) continue;
    ctx.beginPath();
    ctx.moveTo(traco[0].x * w, traco[0].y * h);
    if (traco.length === 1) ctx.lineTo(traco[0].x * w + 0.1, traco[0].y * h + 0.1);
    for (const ponto of traco.slice(1)) ctx.lineTo(ponto.x * w, ponto.y * h);
    ctx.stroke();
  }
}

/** PNG só com a área assinada (margem de 4%), fundo branco. */
function exportarRecorte(tracos: Ponto[][], largura: number, altura: number): Promise<File> {
  const pontos = tracos.flat();
  const xs = pontos.map(p => p.x);
  const ys = pontos.map(p => p.y);
  const margem = 0.04;
  const x0 = Math.max(0, Math.min(...xs) - margem);
  const y0 = Math.max(0, Math.min(...ys) - margem);
  const x1 = Math.min(1, Math.max(...xs) + margem);
  const y1 = Math.min(1, Math.max(...ys) + margem);
  const escala = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((x1 - x0) * largura * escala));
  canvas.height = Math.max(1, Math.round((y1 - y0) * altura * escala));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = TRACO;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, Math.min(largura, altura) / 110) * escala;
  const px = (p: Ponto) => [(p.x - x0) * largura * escala, (p.y - y0) * altura * escala] as const;
  for (const traco of tracos) {
    if (!traco.length) continue;
    ctx.beginPath();
    ctx.moveTo(...px(traco[0]));
    if (traco.length === 1) {
      const [x, y] = px(traco[0]);
      ctx.lineTo(x + 0.1, y + 0.1);
    }
    for (const ponto of traco.slice(1)) ctx.lineTo(...px(ponto));
    ctx.stroke();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(new File([blob], 'assinatura.png', { type: 'image/png' })) : reject(new Error('Falha ao gerar a assinatura.')), 'image/png'));
}

export default function ColetaAssinaturaTablet({ aberto, papel, contexto, nomeInicial = '', modoInicial = 'DESENHO', passo, onConfirmar, onFechar }: Props) {
  const [nome, setNome] = useState(nomeInicial);
  const [modo, setModo] = useState<ModoColeta>(modoInicial);
  const [tracos, setTracos] = useState<Ponto[][]>([]);
  const [selfie, setSelfie] = useState<{ arquivo: File; url: string } | null>(null);
  const [cameraErro, setCameraErro] = useState<string | null>(null);
  const [cameraPronta, setCameraPronta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroNome, setErroNome] = useState(false);
  const [agora, setAgora] = useState(() => new Date().toISOString());

  const areaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tracoAtual = useRef<Ponto[] | null>(null);
  const tracosRef = useRef<Ponto[][]>([]);

  useEffect(() => { tracosRef.current = tracos; }, [tracos]);

  useEffect(() => {
    if (!aberto) return;
    setAgora(new Date().toISOString());
    const timer = window.setInterval(() => setAgora(new Date().toISOString()), 15000);
    return () => window.clearInterval(timer);
  }, [aberto]);

  // Reinicia a cada abertura (inclusive ao avançar para o próximo papel).
  useEffect(() => {
    if (!aberto) return;
    setNome(nomeInicial);
    setModo(modoInicial);
    setTracos([]);
    setSelfie(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setErroNome(false);
    setSalvando(false);
  }, [aberto, papel, nomeInicial, modoInicial]);

  // Canvas acompanha o tamanho da área (girar o tablet redesenha os traços).
  useEffect(() => {
    if (!aberto || modo !== 'DESENHO') return;
    const area = areaRef.current;
    const canvas = canvasRef.current;
    if (!area || !canvas) return;
    const ajustar = () => {
      const rect = area.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      desenharTracos(canvas, tracosRef.current);
    };
    ajustar();
    const observer = new ResizeObserver(ajustar);
    observer.observe(area);
    return () => observer.disconnect();
  }, [aberto, modo]);

  useEffect(() => {
    if (canvasRef.current && modo === 'DESENHO') desenharTracos(canvasRef.current, tracos);
  }, [tracos, modo]);

  const pararCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraPronta(false);
  }, []);

  useEffect(() => {
    if (!aberto || modo !== 'SELFIE' || selfie) {
      pararCamera();
      return;
    }
    let cancelado = false;
    setCameraErro(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraErro('Este navegador não dá acesso direto à câmera.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(track => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setCameraPronta(true);
      })
      .catch((error: any) => {
        if (cancelado) return;
        setCameraErro(error?.name === 'NotAllowedError'
          ? 'A permissão da câmera foi negada. Libere a câmera para este site ou use o botão abaixo.'
          : 'Não foi possível abrir a câmera frontal.');
      });
    return () => { cancelado = true; pararCamera(); };
  }, [aberto, modo, selfie, pararCamera]);

  useEffect(() => () => pararCamera(), [pararCamera]);

  const ponto = (event: React.PointerEvent<HTMLCanvasElement>): Ponto => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const iniciarTraco = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    tracoAtual.current = [ponto(event)];
  };

  const continuarTraco = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!tracoAtual.current) return;
    event.preventDefault();
    const eventos = (event.nativeEvent as PointerEvent).getCoalescedEvents?.() || [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    for (const item of eventos) {
      tracoAtual.current.push({
        x: Math.min(1, Math.max(0, (item.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (item.clientY - rect.top) / rect.height)),
      });
    }
    const canvas = canvasRef.current;
    if (canvas) desenharTracos(canvas, [...tracosRef.current, tracoAtual.current]);
  };

  const encerrarTraco = () => {
    if (!tracoAtual.current) return;
    const traco = tracoAtual.current;
    tracoAtual.current = null;
    setTracos(prev => [...prev, traco]);
  };

  const capturarSelfie = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Grava como a pessoa se viu na tela (espelhado), que é o que ela confere.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const arquivo = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      setSelfie({ arquivo, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.9);
  };

  const selfieArquivo = (arquivo?: File) => {
    if (!arquivo) return;
    setSelfie(prev => { if (prev) URL.revokeObjectURL(prev.url); return { arquivo, url: URL.createObjectURL(arquivo) }; });
  };

  const refazerSelfie = () => setSelfie(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; });

  const pronto = modo === 'DESENHO' ? tracos.length > 0 : !!selfie;

  const confirmar = async () => {
    if (!nome.trim()) { setErroNome(true); return; }
    if (!pronto) return;
    setSalvando(true);
    const assinadoEm = new Date().toISOString();
    try {
      let arquivo: File;
      if (modo === 'DESENHO') {
        const rect = areaRef.current?.getBoundingClientRect();
        arquivo = await exportarRecorte(tracos, rect?.width || 800, rect?.height || 400);
      } else {
        arquivo = selfie!.arquivo;
      }
      await onConfirmar({ nome: nome.trim(), tipo: modo, arquivo, assinadoEm });
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-coleta-assinatura" className="fixed inset-0 z-[120] flex flex-col bg-slate-100 dark:bg-slate-950">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <PenTool className="h-4 w-4 text-blue-600" /> Assinatura {passo && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{passo}</span>}
          </div>
          <h2 id="titulo-coleta-assinatura" className="mt-0.5 text-xl sm:text-2xl"><Bilingue inline texto={papel} ptClass="font-bold text-slate-900 dark:text-slate-50" enClass="text-lg" /></h2>
          {contexto && <p className="truncate text-sm text-slate-500">{contexto}</p>}
        </div>
        <div className="ml-auto hidden shrink-0 text-right sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Data e hora</p>
          <p className="font-mono text-lg font-bold text-slate-700 dark:text-slate-200">{formatarDataHoraAssinatura(agora)}</p>
        </div>
        <button type="button" disabled={salvando} onClick={() => { pararCamera(); onFechar(); }} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Fechar">
          <X className="h-7 w-7" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block flex-1 text-sm text-slate-600 dark:text-slate-300">
            <Bilingue inline pt="Nome completo de quem assina" en="Full name" ptClass="font-semibold" />
            <input
              value={nome}
              onChange={event => { setNome(event.target.value); if (event.target.value.trim()) setErroNome(false); }}
              autoComplete="off"
              placeholder="Digite o nome"
              className={`mt-1.5 w-full rounded-2xl border-2 bg-white px-4 py-3.5 text-xl font-semibold text-slate-900 outline-none focus:border-blue-500 dark:bg-slate-900 dark:text-slate-50 ${erroNome ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
            />
            {erroNome && <span className="mt-1 block text-sm font-semibold text-red-600">Informe o nome antes de confirmar.</span>}
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200 p-1 dark:bg-slate-800 lg:w-[380px]">
            {([['DESENHO', 'Assinar', PenTool], ['SELFIE', 'Tirar selfie', Camera]] as const).map(([valor, rotulo, Icone]) => <button key={valor} type="button" onClick={() => setModo(valor)} aria-pressed={modo === valor} className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl text-base font-bold transition ${modo === valor ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}><Icone className="h-5 w-5" /> {rotulo}</button>)}
          </div>
        </div>

        <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-3xl border-2 border-slate-300 bg-white dark:border-slate-700">
          {modo === 'DESENHO' ? <div ref={areaRef} className="absolute inset-0">
            <canvas
              ref={canvasRef}
              onPointerDown={iniciarTraco}
              onPointerMove={continuarTraco}
              onPointerUp={encerrarTraco}
              onPointerCancel={encerrarTraco}
              className="block h-full w-full touch-none cursor-crosshair"
            />
            {!tracos.length && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
              <PenTool className="h-10 w-10" />
              <span className="text-lg font-semibold">Assine aqui com o dedo ou a caneta</span>
            </div>}
            <div className="pointer-events-none absolute inset-x-10 bottom-16 border-b-2 border-dashed border-slate-300" />
          </div> : selfie ? <img src={selfie.url} alt="Selfie capturada" className="absolute inset-0 h-full w-full object-contain bg-slate-900" /> : <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <video ref={videoRef} playsInline muted className={`h-full w-full object-contain ${cameraPronta ? '' : 'opacity-0'}`} style={{ transform: 'scaleX(-1)' }} />
            {!cameraPronta && !cameraErro && <Loader2 className="absolute h-10 w-10 animate-spin text-white/70" />}
            {cameraErro && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
              <AlertTriangle className="h-10 w-10 text-amber-400" />
              <p className="max-w-md text-base">{cameraErro}</p>
              <label className="inline-flex min-h-[52px] cursor-pointer items-center gap-2 rounded-2xl bg-white px-5 text-base font-bold text-slate-900"><Camera className="h-5 w-5" /> Abrir câmera do aparelho<input type="file" accept="image/*" capture="user" className="hidden" onChange={event => { selfieArquivo(event.target.files?.[0]); event.target.value = ''; }} /></label>
            </div>}
            {cameraPronta && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="h-[62%] w-[42%] max-w-[360px] rounded-[50%] border-4 border-white/70" /></div>}
          </div>}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        {modo === 'DESENHO'
          ? <button type="button" disabled={!tracos.length || salvando} onClick={() => setTracos([])} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border border-slate-200 px-5 text-base font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200"><RotateCcw className="h-5 w-5" /> Limpar</button>
          : selfie
            ? <button type="button" disabled={salvando} onClick={refazerSelfie} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl border border-slate-200 px-5 text-base font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><RefreshCw className="h-5 w-5" /> Tirar outra</button>
            : <button type="button" disabled={!cameraPronta} onClick={capturarSelfie} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-slate-900 px-6 text-base font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"><Camera className="h-5 w-5" /> Capturar</button>}
        <button type="button" disabled={salvando} onClick={() => { pararCamera(); onFechar(); }} className="ml-auto inline-flex min-h-[52px] items-center rounded-2xl px-5 text-base font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">Cancelar</button>
        <button type="button" disabled={!pronto || salvando} onClick={confirmar} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-emerald-600 px-6 text-base font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40">
          {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Confirmar assinatura
        </button>
      </footer>
    </div>
  );
}

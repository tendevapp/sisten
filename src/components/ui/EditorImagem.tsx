/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor de foto antes de subir: recortar (livre ou 1:1, 4:3, 3:4), girar,
 * brilho, contraste, saturação e "Iluminar" automático.
 *
 * Recebe um arquivo (foto recém-tirada) ou a URL de uma foto já gravada, e
 * devolve um JPEG em `onAplicar`. O envio continua passando pela compressão
 * única (CLAUDE.md §1) — aqui só se limita o maior lado a 2400 px para o
 * celular não estourar memória com a foto crua da câmera.
 *
 * A prévia é desenhada com a mesma conta de pixels do arquivo final
 * (`lib/edicaoImagem.ts`): o que se vê é o que sobe.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type React from 'react';
import { Check, Crop, Loader2, RotateCcw, RotateCw, Sun, Undo2, Wand2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './Modal';
import {
  AJUSTES_NEUTROS, FAIXA_AJUSTE, RECORTE_INTEIRO, ajustesAutomaticos, aplicarAjustesPixels, dimensoesGiradas,
  dimensoesSaida, ehNeutro, girar, moverRecorte, nomeArquivoEditado, recorteComProporcao, recorteEmPixels,
  redimensionarRecorte, type AjustesImagem, type Canto, type Recorte, type Rotacao,
} from '../../lib/edicaoImagem';

/** Maior lado do arquivo editado (e da imagem de trabalho). */
const LADO_MAX = 2400;
/** Maior lado da prévia na tela — leve para redesenhar a cada movimento do controle. */
const LADO_PREVIA = 900;
const QUALIDADE_JPEG = 0.92;

const PROPORCOES: { rotulo: string; valor: number | null }[] = [
  { rotulo: 'Livre', valor: null },
  { rotulo: '1:1', valor: 1 },
  { rotulo: '4:3', valor: 4 / 3 },
  { rotulo: '3:4', valor: 3 / 4 },
];

type Fonte = ImageBitmap | HTMLImageElement;

async function carregarFonte(origem: Blob | string): Promise<Fonte> {
  const blob = typeof origem === 'string'
    ? await fetch(origem).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.blob();
    })
    : origem;
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const larguraDe = (f: Fonte) => ('naturalWidth' in f ? f.naturalWidth : f.width);
const alturaDe = (f: Fonte) => ('naturalHeight' in f ? f.naturalHeight : f.height);

/** Imagem de trabalho: girada e com o maior lado limitado a LADO_MAX. */
function montarBase(fonte: Fonte, rotacao: Rotacao): HTMLCanvasElement {
  const w0 = larguraDe(fonte);
  const h0 = alturaDe(fonte);
  const { w, h } = dimensoesSaida(w0, h0, LADO_MAX);
  const girada = dimensoesGiradas(w, h, rotacao);
  const canvas = document.createElement('canvas');
  canvas.width = girada.w;
  canvas.height = girada.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(girada.w / 2, girada.h / 2);
  ctx.rotate((rotacao * Math.PI) / 180);
  ctx.drawImage(fonte, -w / 2, -h / 2, w, h);
  return canvas;
}

interface Props {
  /** Foto recém-escolhida (File/Blob) ou URL de uma foto já gravada. */
  origem: Blob | string;
  nomeArquivo?: string | null;
  titulo?: string;
  /** Texto do botão que fecha sem editar — "Usar sem editar" logo depois de tirar a foto. */
  rotuloCancelar?: string;
  /** Texto do botão que aplica (ex.: "Salvar foto" quando grava na hora). */
  rotuloAplicar?: string;
  onAplicar: (arquivo: File) => void | Promise<void>;
  onCancelar: () => void;
}

export default function EditorImagem({
  origem, nomeArquivo, titulo = 'Editar foto', rotuloCancelar = 'Cancelar', rotuloAplicar = 'Aplicar', onAplicar, onCancelar,
}: Props) {
  const idBrilho = useId();
  const idContraste = useId();
  const idSaturacao = useId();

  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rotacao, setRotacao] = useState<Rotacao>(0);
  const [ajustes, setAjustes] = useState<AjustesImagem>(AJUSTES_NEUTROS);
  const [proporcao, setProporcao] = useState<number | null>(null);
  const [recorte, setRecorte] = useState<Recorte>(RECORTE_INTEIRO);
  const [aspectoBase, setAspectoBase] = useState(4 / 3);
  const [aplicando, setAplicando] = useState(false);

  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const previaRef = useRef<HTMLCanvasElement | null>(null);
  const brutoRef = useRef<ImageData | null>(null);
  const molduraRef = useRef<HTMLDivElement | null>(null);
  const arrasteRef = useRef<{ tipo: 'mover' | Canto; x0: number; y0: number; r0: Recorte; largura: number; altura: number } | null>(null);
  const quadroRef = useRef<number | null>(null);

  // 1. Carrega a imagem.
  useEffect(() => {
    let vivo = true;
    carregarFonte(origem)
      .then((f) => { if (vivo) setFonte(f); })
      .catch(() => {
        if (vivo) setErro('Não foi possível abrir esta imagem para edição neste aparelho (formato não suportado, como HEIC, ou sem conexão).');
      });
    return () => { vivo = false; };
  }, [origem]);

  // Libera a memória do bitmap ao sair.
  useEffect(() => () => {
    if (fonte && 'close' in fonte) fonte.close();
  }, [fonte]);

  const desenharPrevia = useCallback(() => {
    const canvas = previaRef.current;
    const bruto = brutoRef.current;
    if (!canvas || !bruto) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const copia = new ImageData(new Uint8ClampedArray(bruto.data), bruto.width, bruto.height);
    aplicarAjustesPixels(copia.data, ajustes);
    ctx.putImageData(copia, 0, 0);
  }, [ajustes]);

  // 2. Imagem de trabalho + prévia sem ajustes, a cada giro.
  useEffect(() => {
    if (!fonte) return;
    try {
      const base = montarBase(fonte, rotacao);
      baseRef.current = base;
      setAspectoBase(base.width / base.height);
      const previa = previaRef.current;
      if (!previa) return;
      const { w, h } = dimensoesSaida(base.width, base.height, LADO_PREVIA);
      previa.width = w;
      previa.height = h;
      const ctx = previa.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(base, 0, 0, w, h);
      brutoRef.current = ctx.getImageData(0, 0, w, h);
      desenharPrevia();
    } catch {
      setErro('A imagem é grande demais para editar neste aparelho.');
    }
    // `desenharPrevia` muda com os ajustes; o efeito abaixo cuida deles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte, rotacao]);

  // 3. Ajustes: redesenha no próximo quadro (o controle desliza sem travar).
  useEffect(() => {
    if (quadroRef.current !== null) cancelAnimationFrame(quadroRef.current);
    quadroRef.current = requestAnimationFrame(() => {
      quadroRef.current = null;
      desenharPrevia();
    });
  }, [desenharPrevia]);

  const escolherProporcao = (valor: number | null) => {
    setProporcao(valor);
    setRecorte(recorteComProporcao(valor, aspectoBase));
  };

  const girarImagem = (sentido: 1 | -1) => {
    const nova = girar(rotacao, sentido);
    setRotacao(nova);
    // Cada giro é de 90°: o aspecto se inverte e o recorte volta ao padrão da proporção.
    setRecorte(recorteComProporcao(proporcao, 1 / aspectoBase));
  };

  const iluminar = () => {
    if (brutoRef.current) setAjustes(ajustesAutomaticos(brutoRef.current.data));
  };

  const restaurar = () => {
    setAjustes(AJUSTES_NEUTROS);
    setProporcao(null);
    setRecorte(RECORTE_INTEIRO);
    setRotacao(0);
  };

  const iniciarArraste = (tipo: 'mover' | Canto) => (e: React.PointerEvent) => {
    const moldura = molduraRef.current;
    if (!moldura) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const caixa = moldura.getBoundingClientRect();
    arrasteRef.current = { tipo, x0: e.clientX, y0: e.clientY, r0: recorte, largura: caixa.width, altura: caixa.height };
  };

  const arrastar = (e: React.PointerEvent) => {
    const a = arrasteRef.current;
    if (!a || a.largura === 0 || a.altura === 0) return;
    const dx = (e.clientX - a.x0) / a.largura;
    const dy = (e.clientY - a.y0) / a.altura;
    setRecorte(a.tipo === 'mover' ? moverRecorte(a.r0, dx, dy) : redimensionarRecorte(a.r0, a.tipo, dx, dy, proporcao, aspectoBase));
  };

  const soltar = () => { arrasteRef.current = null; };

  const semMudanca = rotacao === 0 && ehNeutro(ajustes)
    && recorte.x === 0 && recorte.y === 0 && recorte.w === 1 && recorte.h === 1;

  const aplicar = async () => {
    const base = baseRef.current;
    if (!base) return;
    setAplicando(true);
    try {
      let arquivo: File;
      if (semMudanca && origem instanceof File) {
        arquivo = origem;
      } else {
        const { sx, sy, sw, sh } = recorteEmPixels(recorte, base.width, base.height);
        const saida = dimensoesSaida(sw, sh, LADO_MAX);
        const canvas = document.createElement('canvas');
        canvas.width = saida.w;
        canvas.height = saida.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(base, sx, sy, sw, sh, 0, 0, saida.w, saida.h);
        if (!ehNeutro(ajustes)) {
          const dados = ctx.getImageData(0, 0, saida.w, saida.h);
          aplicarAjustesPixels(dados.data, ajustes);
          ctx.putImageData(dados, 0, 0);
        }
        const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', QUALIDADE_JPEG));
        if (!blob) throw new Error('Não foi possível gerar a imagem editada.');
        const nomeOrigem = nomeArquivo ?? (origem instanceof File ? origem.name : null);
        arquivo = new File([blob], nomeArquivoEditado(nomeOrigem), { type: 'image/jpeg', lastModified: Date.now() });
      }
      await onAplicar(arquivo);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao aplicar a edição.');
    } finally {
      setAplicando(false);
    }
  };

  const controle = (id: string, rotulo: string, chave: keyof AjustesImagem) => (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>{rotulo}</label>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>{Math.round(ajustes[chave] * 100)}%</span>
      </div>
      <input
        id={id}
        type="range"
        min={FAIXA_AJUSTE.min}
        max={FAIXA_AJUSTE.max}
        step={FAIXA_AJUSTE.passo}
        value={ajustes[chave]}
        onChange={(e) => setAjustes((a) => ({ ...a, [chave]: Number(e.target.value) }))}
        onDoubleClick={() => setAjustes((a) => ({ ...a, [chave]: 1 }))}
        disabled={!fonte || aplicando}
        className="w-full cursor-pointer accent-amber-600"
      />
    </div>
  );

  const botaoIcone = 'inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold cursor-pointer transition hover:bg-slate-100 disabled:opacity-50 disabled:cursor-default dark:hover:bg-slate-800';
  const estiloBotao = { borderColor: 'var(--hairline)', color: 'var(--ink-primary)', background: 'var(--surface-card)' };
  const canto = (c: Canto, classe: string) => (
    <span
      role="presentation"
      onPointerDown={iniciarArraste(c)}
      className={`absolute h-6 w-6 ${classe} touch-none`}
      style={{ cursor: c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize' }}
    >
      <span className="absolute inset-1.5 rounded-sm border-2 border-white bg-amber-500 shadow" />
    </span>
  );

  return (
    <Modal onClose={onCancelar} ariaLabel={titulo} maxWidth="max-w-3xl" zIndexClassName="z-[140]" disableOutsideClose>
      <ModalHeader onClose={aplicando ? undefined : onCancelar}>
        <h3 className="flex items-center gap-2 text-base font-bold" style={{ color: 'var(--ink-primary)' }}>
          <Crop className="h-5 w-5 text-amber-600" aria-hidden="true" />
          {titulo}
        </h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Arraste o quadro para recortar; os cantos mudam o tamanho. Ajuste a luz abaixo.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {erro && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-serious)', color: 'var(--ink-primary)', background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)' }}>
            {erro}
          </p>
        )}

        <div className="flex min-h-[200px] items-center justify-center rounded-xl bg-slate-900 p-2">
          {!fonte && !erro && <Loader2 className="h-8 w-8 animate-spin text-slate-300" aria-label="Carregando imagem" />}
          <div ref={molduraRef} className={`relative inline-block select-none overflow-hidden ${fonte ? '' : 'hidden'}`}>
            <canvas ref={previaRef} className="block h-auto max-h-[48dvh] w-auto max-w-full" />
            <div
              className="absolute touch-none"
              onPointerDown={iniciarArraste('mover')}
              onPointerMove={arrastar}
              onPointerUp={soltar}
              onPointerCancel={soltar}
              style={{
                left: `${recorte.x * 100}%`,
                top: `${recorte.y * 100}%`,
                width: `${recorte.w * 100}%`,
                height: `${recorte.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                outline: '2px solid rgba(255,255,255,0.9)',
                cursor: 'move',
              }}
            >
              {/* Terços, para enquadrar. */}
              <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
              {canto('nw', '-left-3 -top-3')}
              {canto('ne', '-right-3 -top-3')}
              {canto('sw', '-left-3 -bottom-3')}
              {canto('se', '-right-3 -bottom-3')}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Recorte:</span>
          {PROPORCOES.map((p) => (
            <button
              key={p.rotulo}
              type="button"
              onClick={() => escolherProporcao(p.valor)}
              aria-pressed={proporcao === p.valor}
              disabled={!fonte || aplicando}
              className={botaoIcone}
              style={proporcao === p.valor
                ? { ...estiloBotao, borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 12%, var(--surface-card))' }
                : estiloBotao}
            >
              {p.rotulo}
            </button>
          ))}
          <span className="mx-1 h-5 w-px" style={{ background: 'var(--hairline)' }} />
          <button type="button" onClick={() => girarImagem(-1)} disabled={!fonte || aplicando} className={botaoIcone} style={estiloBotao} aria-label="Girar para a esquerda">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => girarImagem(1)} disabled={!fonte || aplicando} className={botaoIcone} style={estiloBotao} aria-label="Girar para a direita">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {controle(idBrilho, 'Brilho', 'brilho')}
          {controle(idContraste, 'Contraste', 'contraste')}
          {controle(idSaturacao, 'Saturação', 'saturacao')}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={iluminar} disabled={!fonte || aplicando} className={botaoIcone} style={estiloBotao}>
            <Wand2 className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Iluminar automático
          </button>
          <button type="button" onClick={() => setAjustes(AJUSTES_NEUTROS)} disabled={!fonte || aplicando || ehNeutro(ajustes)} className={botaoIcone} style={estiloBotao}>
            <Sun className="h-4 w-4" aria-hidden="true" />
            Luz original
          </button>
          <button type="button" onClick={restaurar} disabled={!fonte || aplicando || semMudanca} className={botaoIcone} style={estiloBotao}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Desfazer tudo
          </button>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={aplicando}
            className="rounded-lg border px-4 py-2 text-sm font-bold cursor-pointer hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
            style={estiloBotao}
          >
            {rotuloCancelar}
          </button>
          <button
            type="button"
            onClick={() => void aplicar()}
            disabled={!fonte || aplicando}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white cursor-pointer hover:bg-amber-700 disabled:opacity-50"
          >
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {rotuloAplicar}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

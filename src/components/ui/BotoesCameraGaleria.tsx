/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dois quadrados de anexar foto: "Câmera" abre a câmera do aparelho
 * (`capture`), "Galeria" escolhe arquivos já existentes. Com `capture` sozinho
 * o Android só oferecia a câmera, e sem ele o seletor novo de fotos do
 * Android 14 nem sempre oferece a câmera — por isso os dois caminhos ficam
 * explícitos.
 *
 * Só escolhe o arquivo: quem usa comprime antes de subir (CLAUDE.md §1).
 */

import type { ChangeEvent } from 'react';
import { Camera, ImageIcon, Loader2 } from 'lucide-react';

interface Props {
  onArquivos: (arquivos: FileList | null) => void;
  /** `accept` da galeria (ex.: ACCEPT_ANEXO aceita PDF). A câmera é sempre imagem. */
  acceptGaleria?: string;
  carregando?: boolean;
  disabled?: boolean;
  /** Texto pequeno sob o ícone da câmera (ex.: "2/5"). */
  contagem?: string;
  /** Classe dos quadrados (tamanho/borda), para casar com as miniaturas da tela. */
  className?: string;
}

const QUADRADO = 'flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-300';

export default function BotoesCameraGaleria({
  onArquivos, acceptGaleria = 'image/*', carregando, disabled, contagem, className = QUADRADO,
}: Props) {
  const bloqueado = disabled || carregando;
  const escolher = (e: ChangeEvent<HTMLInputElement>) => {
    onArquivos(e.target.files);
    e.target.value = '';
  };
  return (
    <>
      <label className={`${className} ${bloqueado ? 'pointer-events-none opacity-60' : ''}`}>
        {carregando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
        <span className="text-[10px] font-bold">{contagem ? `Câmera ${contagem}` : 'Câmera'}</span>
        <input type="file" accept="image/*" capture="environment" hidden disabled={bloqueado} onChange={escolher} />
      </label>
      <label className={`${className} ${bloqueado ? 'pointer-events-none opacity-60' : ''}`}>
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
        <span className="text-[10px] font-bold">Galeria</span>
        <input type="file" accept={acceptGaleria} multiple hidden disabled={bloqueado} onChange={escolher} />
      </label>
    </>
  );
}

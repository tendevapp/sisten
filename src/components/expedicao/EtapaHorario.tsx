/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Uma das três marcações de tempo de um tramo (portaria → pátio → expedição),
 * com as fotos daquela etapa.
 *
 * O componente é desenhado para o pátio, não para a mesa: os alvos de toque
 * passam de 44px, o botão "Agora" evita digitar hora com luva ou sol na tela,
 * e o campo de arquivo não usa `capture` de propósito — assim o celular
 * oferece câmera *ou* galeria, e quem já fotografou antes não é obrigado a
 * fotografar de novo.
 */

import React, { useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2, Mail, MessageSquarePlus, Trash2, X } from 'lucide-react';
import type { EtapaExpedicao, ExpedicaoFoto } from '../../types';
import { usePonteiroGrosso } from '../../lib/usePonteiroGrosso';
import Modal from '../ui/Modal';
import FotoMiniatura from './FotoMiniatura';

interface EtapaHorarioProps {
  etapa: EtapaExpedicao;
  rotulo: string;
  hora: string | null;
  obs: string | null;
  fotos: ExpedicaoFoto[];
  /** Última etapa da trilha — não desenha o trecho de linha que desce. */
  ultima?: boolean;
  desabilitado?: boolean;
  onHoraChange: (hora: string | null) => void;
  onObsChange: (obs: string | null) => void;
  onAnexar: (arquivos: FileList) => Promise<void>;
  onExcluirFoto: (foto: ExpedicaoFoto) => Promise<void>;
  /**
   * Quando presente, a etapa ganha o botão de aviso parcial por e-mail. Só a
   * chegada na portaria o recebe: é a informação que interessa avisar na hora,
   * antes de o resto do dia acontecer.
   */
  onEnviarEmail?: () => Promise<void>;
}

function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EtapaHorario({
  etapa, rotulo, hora, obs, fotos, ultima, desabilitado,
  onHoraChange, onObsChange, onAnexar, onExcluirFoto, onEnviarEmail,
}: EtapaHorarioProps) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const ehTouch = usePonteiroGrosso();
  // Guarda *qual* botão disparou o envio, não apenas que há um: com dois
  // botões, um booleano acenderia o giro no botão errado.
  const [origemEnvio, setOrigemEnvio] = useState<'camera' | 'arquivo' | null>(null);
  const enviando = origemEnvio !== null;
  const [ampliada, setAmpliada] = useState<ExpedicaoFoto | null>(null);
  // Observação já escrita aparece aberta; vazia, fica atrás do botão para não
  // encher a trilha de campos que quase sempre ficam em branco.
  const [obsAberta, setObsAberta] = useState(Boolean(obs));
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  const preenchida = Boolean(hora);

  const handleArquivos = async (e: React.ChangeEvent<HTMLInputElement>, origem: 'camera' | 'arquivo') => {
    const alvo = e.target;
    const files = alvo.files;
    if (!files || files.length === 0) return;
    setOrigemEnvio(origem);
    try {
      await onAnexar(files);
    } finally {
      setOrigemEnvio(null);
      // Sem isso, escolher o mesmo arquivo duas vezes seguidas não dispara o
      // evento — e na câmera isso é a regra, não a exceção: duas fotos
      // seguidas chegam com o mesmo nome.
      alvo.value = '';
    }
  };

  return (
    <div className="relative flex gap-3 sm:gap-4">
      {/* Trilha: marcador + linha que liga esta etapa à seguinte */}
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            preenchida
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-900'
          }`}
          aria-hidden="true"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        {!ultima && (
          <span
            className={`w-0.5 flex-1 ${preenchida ? 'bg-emerald-500/40' : 'bg-slate-200 dark:bg-slate-700'}`}
            aria-hidden="true"
          />
        )}
      </div>

      <div className={`min-w-0 flex-1 ${ultima ? 'pb-0' : 'pb-5'}`}>
        <label
          htmlFor={`hora-${etapa}`}
          className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          {rotulo}
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id={`hora-${etapa}`}
            type="time"
            value={hora || ''}
            disabled={desabilitado}
            onChange={e => onHoraChange(e.target.value || null)}
            className="h-11 w-32 rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />

          <button
            type="button"
            onClick={() => onHoraChange(horaAgora())}
            disabled={desabilitado}
            className="h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            Agora
          </button>

          {!desabilitado && (
            <button
              type="button"
              onClick={() => setObsAberta(a => !a)}
              aria-expanded={obsAberta}
              className={`inline-flex h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold uppercase tracking-wide transition-colors ${
                obs?.trim()
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
                  : 'border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Obs.
            </button>
          )}

          {hora && !desabilitado && (
            <button
              type="button"
              onClick={() => onHoraChange(null)}
              aria-label={`Limpar ${rotulo}`}
              className="flex h-11 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:text-rose-500"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {obsAberta && (
          <textarea
            rows={2}
            value={obs || ''}
            disabled={desabilitado}
            placeholder={`Observação — ${rotulo.toLowerCase()}`}
            aria-label={`Observação — ${rotulo}`}
            onChange={e => onObsChange(e.target.value || null)}
            className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        )}

        {/* Fotos da etapa */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {fotos.map(foto => (
            <FotoMiniatura
              key={foto.id}
              foto={foto}
              somenteLeitura={desabilitado}
              onAmpliar={() => setAmpliada(foto)}
              onExcluir={() => onExcluirFoto(foto)}
            />
          ))}

          {!desabilitado && (
            <>
              {/*
                Dois inputs, não um: `capture` é um atributo do elemento, e não
                dá para alterná-lo no clique sem que o navegador já tenha
                decidido o que abrir. Sem `multiple` no da câmera — a captura
                devolve uma foto por vez de qualquer forma.
              */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={e => handleArquivos(e, 'camera')}
              />
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={e => handleArquivos(e, 'arquivo')}
              />

              {ehTouch && (
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  disabled={enviando}
                  className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-60 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70"
                >
                  {origemEnvio === 'camera' ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px] font-semibold">Câmera</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={enviando}
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-blue-400 hover:text-blue-500 disabled:opacity-60 dark:border-slate-600 dark:hover:border-blue-500"
              >
                {origemEnvio === 'arquivo' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-[10px] font-semibold">{ehTouch ? 'Galeria' : 'Foto'}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/*
          Aviso parcial: sai assim que o caminhão encosta, sem esperar o pátio
          e a expedição. Fica desabilitado sem horário porque é justamente o
          horário de chegada que a mensagem existe para comunicar.
        */}
        {onEnviarEmail && !desabilitado && (
          <button
            type="button"
            disabled={!preenchida || enviandoEmail}
            title={preenchida ? undefined : 'Informe o horário de chegada primeiro'}
            onClick={async () => {
              setEnviandoEmail(true);
              try { await onEnviarEmail(); } finally { setEnviandoEmail(false); }
            }}
            className="mt-2.5 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/70"
          >
            {enviandoEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            Enviar chegada por e-mail
          </button>
        )}
      </div>

      {ampliada && (
        <Modal onClose={() => setAmpliada(null)} maxWidth="max-w-3xl" ariaLabel={`Foto — ${rotulo}`}>
          <div className="relative bg-slate-950">
            <button
              type="button"
              onClick={() => setAmpliada(null)}
              aria-label="Fechar foto"
              className="absolute right-3 top-3 z-10 rounded-full bg-slate-900/70 p-2 text-white hover:bg-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
            <FotoMiniatura foto={ampliada} variante="ampliada" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <p className="min-w-0 truncate text-xs text-slate-500 dark:text-slate-400">
              {ampliada.nome_arquivo || rotulo}
            </p>
            {!desabilitado && (
              <button
                type="button"
                onClick={async () => { const f = ampliada; setAmpliada(null); await onExcluirFoto(f); }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

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
import { Camera, Check, ImagePlus, Loader2, Mail, Trash2, X } from 'lucide-react';
import type { EtapaExpedicao, ExpedicaoFoto } from '../../types';
import { usePonteiroGrosso } from '../../lib/usePonteiroGrosso';
import { formatDateBR } from '../../lib/format';
import { normalizarDataISO } from '../../lib/expedicaoEmail';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import FotoMiniatura from './FotoMiniatura';

interface EtapaHorarioProps {
  etapa: EtapaExpedicao;
  rotulo: string;
  data: string | null;
  hora: string | null;
  obs?: string | null;
  fotos: ExpedicaoFoto[];
  /** Última etapa da trilha — não desenha o trecho de linha que desce. */
  ultima?: boolean;
  desabilitado?: boolean;
  onDataChange: (data: string | null) => void;
  onHoraChange: (hora: string | null) => void;
  onObsChange?: (obs: string | null) => void;
  onAnexar: (arquivos: FileList) => Promise<void>;
  onExcluirFoto: (foto: ExpedicaoFoto) => Promise<void>;
  /**
   * Quando presente, a etapa ganha o botão de aviso parcial por e-mail. Só a
   * chegada na portaria o recebe: é a informação que interessa avisar na hora,
   * antes de o resto do dia acontecer.
   */
  onEnviarEmail?: () => Promise<void>;
}

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function horaAgora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function EtapaHorario({
  etapa, rotulo, data, hora, fotos, ultima, desabilitado,
  onDataChange, onHoraChange, onAnexar, onExcluirFoto, onEnviarEmail,
}: EtapaHorarioProps) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const ehTouch = usePonteiroGrosso();
  // Guarda *qual* botão disparou o envio, não apenas que há um: com dois
  // botões, um booleano acenderia o giro no botão errado.
  const [origemEnvio, setOrigemEnvio] = useState<'camera' | 'arquivo' | null>(null);
  const enviando = origemEnvio !== null;
  const [ampliada, setAmpliada] = useState<ExpedicaoFoto | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [dialogoConfirmacao, setDialogoConfirmacao] = useState<{
    titulo: string;
    mensagem: string;
    onConfirmar: () => void;
  } | null>(null);

  const preenchida = Boolean(hora || data);

  const confirmarSeNecessario = (
    temValorAnterior: boolean,
    executar: () => void,
    descricaoNovoValor: string,
  ) => {
    if (!temValorAnterior) {
      executar();
      return;
    }
    setDialogoConfirmacao({
      titulo: 'Confirmar alteração de horário/data?',
      mensagem: `A etapa "${rotulo}" já possui registro anterior. Deseja realmente substituir por ${descricaoNovoValor}?`,
      onConfirmar: () => {
        executar();
        setDialogoConfirmacao(null);
      },
    });
  };

  const handleHoje = () => {
    const novo = hojeISO();
    if (data === novo) return;
    confirmarSeNecessario(
      Boolean(data),
      () => onDataChange(novo),
      `a data de hoje (${formatDateBR(novo)})`,
    );
  };

  const handleAgora = () => {
    const novaData = hojeISO();
    const novaHora = horaAgora();
    confirmarSeNecessario(
      Boolean(data || hora),
      () => {
        onDataChange(novaData);
        onHoraChange(novaHora);
      },
      `a data e horário atuais (${formatDateBR(novaData)} às ${novaHora})`,
    );
  };

  const handleDataInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value || null;
    const novo = normalizarDataISO(raw);
    if (novo === data) return;
    if (!data) {
      onDataChange(novo);
      return;
    }
    confirmarSeNecessario(
      true,
      () => onDataChange(novo),
      novo ? `a data ${formatDateBR(novo)}` : 'data vazia',
    );
  };

  const handleHoraInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novo = e.target.value || null;
    if (novo === hora) return;
    if (!hora) {
      onHoraChange(novo);
      return;
    }
    confirmarSeNecessario(
      true,
      () => onHoraChange(novo),
      novo ? `o horário ${novo}` : 'horário vazio',
    );
  };

  const handleLimpar = () => {
    confirmarSeNecessario(
      Boolean(data || hora),
      () => {
        onHoraChange(null);
        onDataChange(null);
      },
      'remover a data e o horário preenchidos',
    );
  };

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

        {/* Linha com ordem dos campos: Data -> Hoje -> Hora -> Agora -> Limpar */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* 1. Input de Data com prova de erros */}
          <input
            id={`data-${etapa}`}
            type="date"
            min="2020-01-01"
            max="2099-12-31"
            value={normalizarDataISO(data) || ''}
            disabled={desabilitado}
            onChange={handleDataInput}
            onBlur={(e) => {
              const corrigido = normalizarDataISO(e.target.value);
              if (corrigido && corrigido !== data) {
                onDataChange(corrigido);
              }
            }}
            className="h-11 w-36 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            title="Data da etapa (AAAA-MM-DD)"
          />

          {/* 2. Botão Hoje (ao lado da data) */}
          <button
            type="button"
            onClick={handleHoje}
            disabled={desabilitado}
            className="h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
            title="Preenche apenas a data de hoje"
          >
            Hoje
          </button>

          {/* 3. Input de Hora */}
          <input
            id={`hora-${etapa}`}
            type="time"
            value={hora || ''}
            disabled={desabilitado}
            onChange={handleHoraInput}
            className="h-11 w-32 rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            title="Horário da etapa"
          />

          {/* 4. Botão Agora (ao lado da hora) */}
          <button
            type="button"
            onClick={handleAgora}
            disabled={desabilitado}
            className="h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:text-blue-400"
            title="Preenche hoje e agora"
          >
            Agora
          </button>

          {/* 5. Botão Limpar */}
          {(hora || data) && !desabilitado && (
            <button
              type="button"
              onClick={handleLimpar}
              aria-label={`Limpar ${rotulo}`}
              className="flex h-11 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:text-rose-500"
              title="Limpar data e hora"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

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
          e a expedição. Quando habilitado, fica piscando (animate-pulse) com
          brilho azul para chamar a atenção imediata de envio.
        */}
        {onEnviarEmail && !desabilitado && (
          <button
            type="button"
            disabled={!preenchida || enviandoEmail}
            title={preenchida ? 'Clique para abrir o Outlook com o aviso de chegada' : 'Informe o horário de chegada primeiro'}
            onClick={async () => {
              setEnviandoEmail(true);
              try { await onEnviarEmail(); } finally { setEnviandoEmail(false); }
            }}
            className={`mt-2.5 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase tracking-wide transition-all ${
              preenchida
                ? 'animate-pulse bg-blue-600 text-white shadow-lg shadow-blue-500/40 ring-4 ring-blue-400/50 hover:bg-blue-700 hover:ring-blue-500/60 dark:bg-blue-600 dark:text-white dark:ring-blue-400/40'
                : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500'
            }`}
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

      {dialogoConfirmacao && (
        <ConfirmDialog
          titulo={dialogoConfirmacao.titulo}
          mensagem={dialogoConfirmacao.mensagem}
          confirmarLabel="Sim, alterar"
          cancelarLabel="Cancelar"
          variante="aviso"
          onConfirmar={dialogoConfirmacao.onConfirmar}
          onCancelar={() => setDialogoConfirmacao(null)}
        />
      )}
    </div>
  );
}

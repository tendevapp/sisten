/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha da Virola — linha do tempo da peça do corte à etapa atual, com
 * fotos, quem executou/inspecionou e o histórico de edições. É a tela que o
 * NAV1 nunca teve (achado B4 da análise): a rastreabilidade encadeada
 * existia no dado (`sourcePlasmaId`...) mas nunca era exibida.
 */

import React, { useEffect, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { formatDateBR, formatDateTimeBR } from '../../lib/format';
import {
  listarLancamentosPorVirola,
  assinarEvidencias,
  listarEtapas,
  type LancamentoProducao,
  type EtapaProducao,
} from '../../lib/producaoApi';

interface Props {
  virolaId: string;
  torreNumero: number;
  tramo: string;
  virola: string;
  onClose: () => void;
}

const COR_STATUS: Record<string, string> = {
  aprovado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  reprovado: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
};

export default function FichaVirolaModal({ virolaId, torreNumero, tramo, virola, onClose }: Props) {
  const lightbox = useLightbox();
  const [carregando, setCarregando] = useState(true);
  const [lancamentos, setLancamentos] = useState<LancamentoProducao[]>([]);
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [fotosAssinadas, setFotosAssinadas] = useState<Record<string, string>>({});

  useEffect(() => {
    let montado = true;
    (async () => {
      try {
        const [linhas, listaEtapas] = await Promise.all([listarLancamentosPorVirola(virolaId), listarEtapas()]);
        if (!montado) return;
        setLancamentos(linhas);
        setEtapas(listaEtapas);
        const paths = linhas.flatMap(l => l.evidencias.map(e => e.path));
        if (paths.length) setFotosAssinadas(await assinarEvidencias(paths));
      } finally {
        if (montado) setCarregando(false);
      }
    })();
    return () => {
      montado = false;
    };
  }, [virolaId]);

  const nomeEtapa = (etapaId: string) => etapas.find(e => e.id === etapaId)?.nome ?? etapaId;

  return (
    <Modal onClose={onClose} ariaLabel="Ficha da Virola" maxWidth="max-w-2xl">
      <ModalHeader onClose={onClose}>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Ficha da Virola</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Torre {torreNumero} • {tramo} • {virola}
          </p>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-3 p-5">
        {carregando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : lancamentos.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Nenhum lançamento registrado ainda para esta peça.
          </p>
        ) : (
          <ol className="relative space-y-4 border-l-2 pl-4" style={{ borderColor: 'var(--hairline)' }}>
            {lancamentos.map(l => (
              <li key={l.id} className="relative">
                <span
                  className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900"
                  style={{ background: l.status === 'aprovado' ? '#10b981' : l.status === 'reprovado' ? '#f43f5e' : '#f59e0b' }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-50">{nomeEtapa(l.etapa_id)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${COR_STATUS[l.status] ?? ''}`}>
                    {l.status}
                  </span>
                  {l.tentativa > 1 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      tentativa {l.tentativa}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {l.codigo} • {formatDateBR(l.data_liberacao)}
                  {l.hora ? ` ${l.hora.slice(0, 5)}` : ''}
                  {l.turno ? ` • Turno ${l.turno}` : ''}
                </p>
                {(l.executante_nome || l.inspetor_nome) && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {l.executante_nome && <>Executante: {l.executante_nome} </>}
                    {l.inspetor_nome && <>• Inspetor: {l.inspetor_nome}</>}
                  </p>
                )}
                {l.observacao && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{l.observacao}</p>}
                {l.evidencias.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.evidencias.map((ev, i) => {
                      const url = fotosAssinadas[ev.path];
                      if (!url) return null;
                      return (
                        <button
                          key={ev.path}
                          type="button"
                          onClick={() =>
                            lightbox.abrir(
                              l.evidencias.map(e => ({ url: fotosAssinadas[e.path] ?? '', legenda: e.nome })),
                              i,
                            )
                          }
                          className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border"
                          style={{ borderColor: 'var(--hairline)' }}
                        >
                          <img src={url} alt={ev.nome} className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {l.evidencias.length === 0 && l.status === 'reprovado' && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <Camera className="h-3 w-3" /> Sem foto anexada
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-400">Registrado por {l.criado_por_nome ?? '—'} em {formatDateTimeBR(l.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </ModalBody>
      {lightbox.elemento}
    </Modal>
  );
}

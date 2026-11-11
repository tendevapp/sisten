/**
 * Detalhes de um lançamento do Relatório de Ocorrências (FRM.SGP-0010):
 * todos os campos, pessoas, entrega de material e as fotos (registro e notas
 * fiscais), que abrem no visualizador do app.
 */
import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Edit3, Loader2, LogOut, Package, XCircle } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import type { PortRelatorioOcorrencia } from '../../types';
import * as api from '../../lib/portariaApi';
import { aceitaEntregaMaterial, fotosDaOcorrencia, type FotoOcorrencia } from '../../lib/portariaFotosOcorrencia';

interface Props {
  ocorrencia: PortRelatorioOcorrencia;
  /** "Livro 10/11/2026 · Turno A · REL-..." */
  contexto: string;
  tipoLabel?: string;
  tipoBadgeCor?: string;
  onClose: () => void;
  onEditar?: () => void;
  onRegistrarSaida?: () => void;
  onAbrirFotos: (imagens: { url: string; legenda?: string }[], indice: number) => void;
}

const SEVERIDADE: Record<string, string> = { INFO: 'Informativo', ALERTA: 'Alerta', GRAVE: 'Grave' };

function Campo({ rotulo, valor, mono }: { rotulo: string; valor?: React.ReactNode; mono?: boolean }) {
  if (valor == null || valor === '' || valor === false) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{rotulo}</dt>
      <dd className={`mt-0.5 break-words text-xs font-semibold text-slate-900 dark:text-slate-100 ${mono ? 'font-mono' : ''}`}>{valor}</dd>
    </div>
  );
}

function GradeFotos({ titulo, fotos, todas, onAbrir }: {
  titulo: string; fotos: FotoOcorrencia[]; todas: FotoOcorrencia[];
  onAbrir: Props['onAbrirFotos'];
}) {
  if (fotos.length === 0) return null;
  const visiveis = todas.filter((f) => f.url);
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{titulo} ({fotos.length})</h4>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f) => (
          <li key={`${f.tipo}-${f.legenda}`}>
            <button
              type="button"
              disabled={!f.url}
              onClick={() => onAbrir(
                visiveis.map((v) => ({ url: v.url, legenda: v.legenda })),
                visiveis.indexOf(f),
              )}
              aria-label={`Ver ${f.legenda.toLowerCase()}`}
              className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-purple-500 disabled:cursor-default disabled:hover:ring-0 dark:border-slate-700 dark:bg-slate-800"
            >
              {f.url ? (
                <img src={f.url} alt={f.legenda} className="h-full w-full object-cover" />
              ) : (
                <span className="px-1 text-center text-[10px] text-slate-500">Sem prévia (sem rede)</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function DetalheOcorrenciaModal({
  ocorrencia: oc, contexto, tipoLabel, tipoBadgeCor, onClose, onEditar, onRegistrarSaida, onAbrirFotos,
}: Props) {
  const [legado, setLegado] = useState<string | null>(oc.foto_url || null);
  const [carregandoLegado, setCarregandoLegado] = useState(false);
  /** Ficha cega que a entrega abriu no almoxarifado (undefined = carregando). */
  const [ficha, setFicha] = useState<api.FichaCegaDaOcorrencia | null | undefined>(oc.entrega_material ? undefined : null);

  useEffect(() => {
    if (!oc.entrega_material) return;
    let vivo = true;
    api.fichaCegaDaOcorrencia(oc.id)
      .then((f) => { if (vivo) setFicha(f); })
      .catch(() => { if (vivo) setFicha(null); });
    return () => { vivo = false; };
  }, [oc.id, oc.entrega_material]);

  useEffect(() => {
    if (oc.foto_url || !oc.tem_foto_legado) return;
    let vivo = true;
    setCarregandoLegado(true);
    api.obterFotoLegadoOcorrencia(oc.id)
      .then((url) => { if (vivo) setLegado(url); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregandoLegado(false); });
    return () => { vivo = false; };
  }, [oc.id, oc.foto_url, oc.tem_foto_legado]);

  const fotos = fotosDaOcorrencia({ ...oc, foto_url: legado });
  const doRegistro = fotos.filter((f) => f.tipo === 'registro');
  const dasNotas = fotos.filter((f) => f.tipo === 'nf');
  const permanencia = api.formatarPermanencia(api.minutosDePermanencia(oc.horario, oc.hora_saida));
  const pessoas = (oc.pessoas || []).filter((p) => p.nome?.trim());
  const controlaSaida = (api.TIPOS_COM_SAIDA as readonly string[]).includes(oc.tipo_registro || '');
  const aceitaEntrega = aceitaEntregaMaterial(oc.tipo_registro);

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Lançamento das {String(oc.horario).slice(0, 5)}</h3>
            {tipoLabel && <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${tipoBadgeCor ?? ''}`}>{tipoLabel}</span>}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{contexto}</p>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-5">
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
          {oc.descricao}
        </p>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Campo rotulo="Entrada / evento" valor={String(oc.horario).slice(0, 5)} mono />
          <Campo rotulo="Saída" valor={oc.hora_saida ? `${String(oc.hora_saida).slice(0, 5)}${oc.vigilante_saida ? ` · ${oc.vigilante_saida}` : ''}` : (controlaSaida ? 'Ainda no pátio' : '')} />
          <Campo rotulo="Permanência" valor={permanencia} />
          <Campo rotulo="Local / posto" valor={oc.local_setor} />
          <Campo rotulo="Severidade" valor={SEVERIDADE[oc.severidade] ?? oc.severidade} />
          <Campo rotulo="Vigilante" valor={oc.vigilante} />
          <Campo rotulo="Empresa" valor={oc.empresa} />
          <Campo rotulo="Placa" valor={oc.placa} mono />
          <Campo rotulo="Veículo leve" valor={oc.veiculo_leve_modelo} />
          <Campo rotulo="Autorizado por" valor={oc.autorizado_por} />
          <Campo rotulo="Briefing" valor={oc.fara_briefing ? 'Fará briefing de segurança' : ''} />
          <Campo rotulo="Registrado em" valor={oc.created_at ? new Date(oc.created_at).toLocaleString('pt-BR') : ''} />
        </dl>

        {oc.motivo_observacao && (
          <Campo rotulo="Motivo / observação" valor={oc.motivo_observacao} />
        )}

        {aceitaEntrega && (
          <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
            oc.entrega_material
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200'
              : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
          }`}>
            <Package className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {oc.entrega_material ? (
              <div>
                <p className="font-bold">Entrega de material</p>
                <p className="mt-0.5 flex items-center gap-1">
                  {oc.nf_verificada
                    ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Nota fiscal verificada pela portaria</>
                    : <><XCircle className="h-3.5 w-3.5 text-rose-600" aria-hidden="true" /> Nota fiscal não verificada</>}
                  {' · '}{dasNotas.length} foto(s) da NF
                </p>
                <p className="mt-1 text-[11px]">
                  {ficha === undefined
                    ? 'Consultando o almoxarifado…'
                    : ficha === null
                      ? 'Ficha cega no almoxarifado: aguardando sincronização.'
                      : <>Almoxarifado: ficha cega <strong className="font-mono">{ficha.codigo}</strong> — {
                          ficha.status === 'aguardando_almox' ? 'aguardando conferência'
                          : ficha.status === 'nao_chegou' ? `não chegou${ficha.nao_chegou_motivo ? ` (${ficha.nao_chegou_motivo})` : ''}`
                          : `recebida${ficha.qtd_volumes_contada != null ? `, ${ficha.qtd_volumes_contada} volume(s)` : ''}${ficha.almox_confirmado_por ? ` por ${ficha.almox_confirmado_por}` : ''}`
                        }</>}
                </p>
              </div>
            ) : (
              <p>Sem entrega de material.</p>
            )}
          </div>
        )}

        {pessoas.length > 0 && (
          <section>
            <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pessoas ({pessoas.length})</h4>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {pessoas.map((p, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-xs">
                  <span className="font-bold text-slate-900 dark:text-slate-100">{p.nome}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {[p.cpf && `CPF/Matr. ${p.cpf}`, p.cnh && `CNH ${p.cnh}`, p.funcao].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {carregandoLegado && doRegistro.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando foto…</p>
        ) : null}
        <GradeFotos titulo="Fotos do registro" fotos={doRegistro} todas={fotos} onAbrir={onAbrirFotos} />
        <GradeFotos titulo="Notas fiscais" fotos={dasNotas} todas={fotos} onAbrir={onAbrirFotos} />
        {fotos.length === 0 && !carregandoLegado && (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Nenhuma foto neste lançamento.
          </p>
        )}
      </ModalBody>

      <ModalFooter>
        {onRegistrarSaida && (
          <button
            type="button"
            onClick={onRegistrarSaida}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            <LogOut className="h-3.5 w-3.5" /> Registrar saída
          </button>
        )}
        {onEditar && (
          <button
            type="button"
            onClick={onEditar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <Edit3 className="h-3.5 w-3.5" /> Editar
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}

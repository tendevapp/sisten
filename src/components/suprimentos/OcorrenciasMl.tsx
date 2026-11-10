/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras › M Livre: devolução e reembolso do item comprado
 * (`sup_ml_ocorrencias`). As regras estão em `lib/ocorrenciasMl.ts`; o
 * Financeiro › Mercado Livre mostra os mesmos lançamentos no cartão da compra.
 */

import { useId, useState } from 'react';
import { Check, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { confirmar } from '../../lib/confirmar';
import { normalizarNumeroCompraMl, type ItemMercadoLivre } from '../../lib/compraMercadoLivre';
import { excluirOcorrenciaMl, marcarRecompraMl, registrarOcorrenciaMl } from '../../lib/compraMercadoLivreApi';
import {
  recompraPendenteMl, rotuloOcorrenciaMl, validarOcorrenciaMl, type OcorrenciaMl, type TipoOcorrenciaMl,
} from '../../lib/ocorrenciasMl';
import { formatDateBR } from '../../lib/format';

interface Usuario { id: string; nome: string }

/** Cor da etiqueta: recompra pendente chama atenção; reembolso é dinheiro de volta. */
export function classeEtiquetaOcorrenciaMl(oc: OcorrenciaMl): string {
  if (recompraPendenteMl(oc)) return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200';
  if (oc.tipo === 'reembolso') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
}

/** Etiquetas do que já foi lançado + botão para abrir a janela. Vai na coluna Mercado Livre. */
export function BotaoOcorrenciasMl({ ocorrencias, onAbrir }: { ocorrencias: OcorrenciaMl[]; onAbrir: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ocorrencias.map(oc => (
        <span
          key={oc.id}
          className={`rounded border px-1 text-[10px] font-bold ${classeEtiquetaOcorrenciaMl(oc)}`}
          title={[oc.motivo, oc.criado_por_nome && `lançado por ${oc.criado_por_nome} em ${formatDateBR(oc.created_at)}`].filter(Boolean).join(' — ')}
        >
          {rotuloOcorrenciaMl(oc)}
        </span>
      ))}
      <button
        type="button"
        onClick={onAbrir}
        className="inline-flex items-center gap-1 rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
      >
        <RotateCcw className="h-3 w-3" />
        {ocorrencias.length ? 'Devolução / reembolso' : 'Lançar devolução ou reembolso'}
      </button>
    </div>
  );
}

interface ModalProps {
  item: ItemMercadoLivre;
  /** "RM 1234 / Item 10 — ESTANTE". */
  titulo: string;
  ocorrencias: OcorrenciaMl[];
  usuario: Usuario;
  /** Algo foi gravado — a tela recarrega os lançamentos. */
  onAlterado: () => void;
  onClose: () => void;
}

const campoCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-300/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const rotuloCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const segmentoCls = (ativo: boolean) => `flex-1 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${ativo
  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-slate-50'
  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'}`;

export function OcorrenciasMlModal({ item, titulo, ocorrencias, usuario, onAlterado, onClose }: ModalProps) {
  const idQuantia = useId();
  const idMotivo = useId();
  const idRecompra = useId();
  const idNovaCompra = useId();
  const [tipo, setTipo] = useState<TipoOcorrenciaMl>('reembolso');
  const [modo, setModo] = useState<'percentual' | 'valor'>('percentual');
  const [quantia, setQuantia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [recomprar, setRecomprar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recompraDe, setRecompraDe] = useState<string | null>(null);
  const [novaCompra, setNovaCompra] = useState('');

  const salvar = async () => {
    setErro(null);
    const r = validarOcorrenciaMl({ tipo, modo, quantia, motivo, recomprar });
    if ('erro' in r) { setErro(r.erro); return; }
    setOcupado('salvar');
    try {
      await registrarOcorrenciaMl(item, r.ocorrencia, usuario);
      setQuantia(''); setMotivo('');
      onAlterado();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível gravar.');
    } finally {
      setOcupado(null);
    }
  };

  const marcarRecompra = async (oc: OcorrenciaMl) => {
    setErro(null);
    const texto = novaCompra.trim();
    const numero = texto ? normalizarNumeroCompraMl(texto) : null;
    if (texto && !numero) { setErro('Nº da compra do ML inválido — são 16 dígitos começando em 2000 (deixe em branco se não tiver).'); return; }
    setOcupado(oc.id);
    try {
      await marcarRecompraMl(oc.id, numero, usuario);
      setRecompraDe(null); setNovaCompra('');
      onAlterado();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível marcar a recompra.');
    } finally {
      setOcupado(null);
    }
  };

  const excluir = async (oc: OcorrenciaMl) => {
    const ok = await confirmar({
      titulo: 'Excluir lançamento?',
      mensagem: `"${rotuloOcorrenciaMl(oc)}" sai da Central e do Financeiro.`,
      confirmarLabel: 'Excluir',
      variante: 'perigo',
    });
    if (!ok) return;
    setOcupado(oc.id);
    try {
      await excluirOcorrenciaMl(oc.id, usuario);
      onAlterado();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível excluir.');
    } finally {
      setOcupado(null);
    }
  };

  const fechar = ocupado ? () => {} : onClose;

  return (
    <Modal onClose={fechar} maxWidth="max-w-lg" ariaLabel="Devolução e reembolso do item do Mercado Livre">
      <ModalHeader onClose={fechar}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Devolução e reembolso</h3>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={titulo}>{titulo}</p>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {erro && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>
        )}

        {ocorrencias.length > 0 && (
          <section className="space-y-1.5">
            <h4 className={rotuloCls}>Já lançado</h4>
            <ul className="divide-y divide-[var(--hairline)] rounded-xl border border-slate-200 dark:border-slate-800">
              {ocorrencias.map(oc => (
                <li key={oc.id} className="space-y-1.5 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className={`rounded border px-1 text-[11px] font-bold ${classeEtiquetaOcorrenciaMl(oc)}`}>{rotuloOcorrenciaMl(oc)}</span>
                      {oc.motivo && <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">{oc.motivo}</p>}
                      <p className="text-[11px] text-slate-500">
                        {oc.criado_por_nome ?? '—'} · {formatDateBR(oc.created_at)}
                        {oc.recompra_feita_em && (
                          <> · recomprado em {formatDateBR(oc.recompra_feita_em)}{oc.recompra_numero_compra && <> (#{oc.recompra_numero_compra})</>}</>
                        )}
                      </p>
                    </div>
                    {recompraPendenteMl(oc) && recompraDe !== oc.id && (
                      <button
                        type="button"
                        onClick={() => { setRecompraDe(oc.id); setNovaCompra(''); }}
                        disabled={!!ocupado}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-amber-300 px-2 text-[11px] font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" /> Recomprado
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => excluir(oc)}
                      disabled={!!ocupado}
                      aria-label={`Excluir lançamento ${rotuloOcorrenciaMl(oc)}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      {ocupado === oc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                  {recompraDe === oc.id && (
                    <div className="flex flex-wrap items-end gap-2 rounded-lg bg-amber-50/70 p-2 dark:bg-amber-900/20">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={idNovaCompra} className="mb-0.5 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          Nº da nova compra no ML (opcional)
                        </label>
                        <input
                          id={idNovaCompra}
                          value={novaCompra}
                          onChange={e => setNovaCompra(e.target.value)}
                          inputMode="numeric"
                          placeholder="2000…"
                          className={`${campoCls} font-mono`}
                        />
                      </div>
                      <button type="button" onClick={() => setRecompraDe(null)} disabled={!!ocupado} className="h-9 rounded-lg px-2 text-xs font-bold text-slate-500 cursor-pointer">Cancelar</button>
                      <button
                        type="button"
                        onClick={() => marcarRecompra(oc)}
                        disabled={!!ocupado}
                        className="inline-flex h-9 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-bold text-slate-900 hover:bg-amber-400 disabled:opacity-60 cursor-pointer"
                      >
                        {ocupado === oc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirmar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h4 className={rotuloCls}>Novo lançamento</h4>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Tipo de lançamento">
            <button type="button" aria-pressed={tipo === 'reembolso'} onClick={() => setTipo('reembolso')} className={segmentoCls(tipo === 'reembolso')}>Reembolso</button>
            <button type="button" aria-pressed={tipo === 'devolucao'} onClick={() => setTipo('devolucao')} className={segmentoCls(tipo === 'devolucao')}>Devolução</button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {tipo === 'reembolso'
              ? 'O vendedor devolveu parte ou todo o valor e o item fica (ex.: estante reembolsada em 30%).'
              : 'O item volta ao vendedor. Marque se precisa ser comprado de novo (ex.: chegou avariado).'}
          </p>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label htmlFor={idQuantia} className={`${rotuloCls} mb-0`}>
                {tipo === 'reembolso' ? 'Quanto foi reembolsado' : 'Valor devolvido (opcional)'}
              </label>
              <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label="Informar em">
                <button type="button" aria-pressed={modo === 'percentual'} onClick={() => setModo('percentual')} className={`${segmentoCls(modo === 'percentual')} px-2 py-0.5`}>%</button>
                <button type="button" aria-pressed={modo === 'valor'} onClick={() => setModo('valor')} className={`${segmentoCls(modo === 'valor')} px-2 py-0.5`}>R$</button>
              </div>
            </div>
            <input
              id={idQuantia}
              value={quantia}
              onChange={e => setQuantia(e.target.value)}
              inputMode="decimal"
              placeholder={modo === 'percentual' ? '30' : '0,00'}
              aria-invalid={!!erro && !quantia.trim() && tipo === 'reembolso'}
              className={`${campoCls} tabular`}
            />
          </div>

          <div>
            <label htmlFor={idMotivo} className={rotuloCls}>Motivo</label>
            <textarea
              id={idMotivo}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={2}
              placeholder={tipo === 'reembolso' ? 'Ex.: chegou com a lateral amassada' : 'Ex.: embalagem violada, pilhas vazando'}
              className={campoCls}
            />
          </div>

          {tipo === 'devolucao' && (
            <div className="flex items-start gap-2">
              <input
                id={idRecompra}
                type="checkbox"
                checked={recomprar}
                onChange={e => setRecomprar(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-500"
              />
              <label htmlFor={idRecompra} className="text-xs text-slate-700 dark:text-slate-200">
                <b>Precisa comprar de novo</b> — o item fica marcado "recomprar" na Central até a recompra ser registrada.
              </label>
            </div>
          )}
        </section>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={fechar}
          disabled={!!ocupado}
          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={!!ocupado}
          className="inline-flex items-center gap-1.5 rounded-xl bg-yellow-400 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-yellow-300 disabled:opacity-60 cursor-pointer"
        >
          {ocupado === 'salvar' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Lançar {tipo === 'reembolso' ? 'reembolso' : 'devolução'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

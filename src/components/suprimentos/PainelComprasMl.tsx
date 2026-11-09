/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aba M Livre da Central de Compras: as compras do Mercado Livre e a edição
 * dos itens de cada compra.
 *
 * Antes eram pílulas com o número inteiro de 16 dígitos, na ordem em que o
 * comprador gravou o número — quebravam em várias linhas e não diziam quando a
 * compra foi feita, quanto custou nem quanto já virou pedido. Aqui cada compra
 * é um cartão com a data da compra no ML (a ordem da lista), o total e o
 * progresso de pedidos; e a compra aberta permite incluir o item que faltou
 * ou retirar o que entrou por engano.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileText, Loader2, PencilLine, Plus, Search, ShoppingCart, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { formatBRL, formatDateBR } from '../../lib/format';
import {
  diaDaCompraMl, FILTRO_ML_SEM_COMPRA, FILTRO_ML_TODOS, rotuloCompraMl,
  type FiltroCompraMl, type FiltroPedidoMl, type ItemMercadoLivre, type ResumoCompraMl,
} from '../../lib/compraMercadoLivre';

/** Quantas compras aparecem antes de "Mostrar todas". */
const COMPRAS_VISIVEIS = 8;

const segmento = (ativo: boolean) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
    ativo ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-50' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
  }`;
const contador = 'tabular rounded-full bg-slate-200/80 px-1.5 text-[10px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200';

/** "#…7824207": o fim do número é o que distingue uma compra da outra. */
const numeroCurto = (numero: string) => (numero.length > 8 ? `…${numero.slice(-7)}` : numero);

interface PainelComprasMlProps {
  compras: ResumoCompraMl[];
  totalItens: number;
  aguardandoCompra: number;
  filtro: FiltroCompraMl;
  onFiltro: (f: FiltroCompraMl) => void;
  pedido: FiltroPedidoMl;
  onPedido: (p: FiltroPedidoMl) => void;
  /** Itens do recorte atual com e sem pedido (o filtro de pedido aplica em cima). */
  comPedido: number;
  semPedido: number;
  onEditarCompra: (numero: string) => void;
  /** Abre o texto colado e o boleto da compra para corrigir (colar de novo). */
  onDadosCompra: (numero: string) => void;
}

export default function PainelComprasMl({
  compras, totalItens, aguardandoCompra, filtro, onFiltro, pedido, onPedido, comPedido, semPedido, onEditarCompra, onDadosCompra,
}: PainelComprasMlProps) {
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const selecionada = compras.find(c => c.numero === filtro) ?? null;
  // No celular a fileira desliza por todas; a partir de sm a grade mostra as
  // 8 mais recentes (e a compra aberta, se estiver mais para trás).
  const escondidaNaGrade = (i: number, numero: string) => !mostrarTodas && i >= COMPRAS_VISIVEIS && numero !== filtro;
  // A compra aberta entra na tela quando escolhida (no celular podia estar fora, à direita).
  const ativaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ativaRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [filtro]);

  return (
    <section className="rounded-xl border border-yellow-300 bg-yellow-50/50 p-3 lg:p-4 space-y-3 dark:border-yellow-900/60 dark:bg-yellow-950/10">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-yellow-200 bg-yellow-100/70 p-1 dark:border-yellow-900/50 dark:bg-yellow-950/30">
          <button type="button" onClick={() => onFiltro(FILTRO_ML_SEM_COMPRA)} className={segmento(filtro === FILTRO_ML_SEM_COMPRA)}>
            Aguardando compra <span className={contador}>{aguardandoCompra}</span>
          </button>
          <button type="button" onClick={() => onFiltro(FILTRO_ML_TODOS)} className={segmento(filtro === FILTRO_ML_TODOS)}>
            Todos os itens <span className={contador}>{totalItens}</span>
          </button>
          {selecionada && (
            <button type="button" onClick={() => onFiltro(selecionada.numero)} className={segmento(true)}>
              Compra {numeroCurto(selecionada.numero)} <span className={contador}>{selecionada.itens}</span>
            </button>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1 overflow-x-auto no-scrollbar rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900" role="group" aria-label="Filtrar por pedido">
          <button type="button" onClick={() => onPedido('todos')} className={segmento(pedido === 'todos')}>Com e sem pedido</button>
          <button type="button" onClick={() => onPedido('com_pedido')} className={segmento(pedido === 'com_pedido')}>
            Com pedido <span className={contador}>{comPedido}</span>
          </button>
          <button type="button" onClick={() => onPedido('sem_pedido')} className={segmento(pedido === 'sem_pedido')}>
            Sem pedido <span className={contador}>{semPedido}</span>
          </button>
        </div>
      </div>

      {compras.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Compras no ML <span className="font-semibold normal-case tracking-normal">· da mais recente para a mais antiga</span>
          </p>
          {/* Celular: as compras deslizam de lado em vez de empilhar 8 cartões antes da lista de itens. */}
          <ul className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 2xl:grid-cols-4">
            {compras.map((c, i) => {
              const ativa = c.numero === filtro;
              const dia = diaDaCompraMl(c);
              return (
                <li key={c.numero} className={`w-[78%] shrink-0 snap-start sm:w-auto ${escondidaNaGrade(i, c.numero) ? 'sm:hidden' : ''}`}>
                  <button
                    ref={ativa ? ativaRef : undefined}
                    type="button"
                    onClick={() => onFiltro(ativa ? FILTRO_ML_TODOS : c.numero)}
                    aria-pressed={ativa}
                    className={`h-full w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      ativa
                        ? 'border-yellow-400 bg-yellow-200/70 ring-1 ring-yellow-400 dark:bg-yellow-900/40'
                        : 'border-slate-200 bg-white hover:border-yellow-400 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-slate-50">
                        {dia ? formatDateBR(dia) : 'Sem data'}
                        {!c.dataCompra && dia && (
                          <span className="ml-1 text-[10px] font-semibold text-slate-500" title="Data do registro na Central — o detalhe da compra não foi colado">
                            (registro)
                          </span>
                        )}
                      </span>
                      <span className="tabular text-sm font-bold text-slate-700 dark:text-slate-200">
                        {c.valorTotal != null ? formatBRL(c.valorTotal) : '—'}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={rotuloCompraMl(c.numero)}>
                      #{c.numero}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="shrink-0">
                        {c.itens} {c.itens === 1 ? 'item' : 'itens'} · {c.rms.length} RM
                      </span>
                      <span className="ml-auto flex items-center gap-1.5" title={`${c.comPedido} de ${c.itens} com pedido no SAP`}>
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                          <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${c.itens ? (c.comPedido / c.itens) * 100 : 0}%` }} />
                        </span>
                        <span className="tabular font-semibold">{c.comPedido}/{c.itens} PO</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {compras.length > COMPRAS_VISIVEIS && (
            <button
              type="button"
              onClick={() => setMostrarTodas(v => !v)}
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 cursor-pointer"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mostrarTodas ? 'rotate-180' : ''}`} />
              {mostrarTodas ? 'Mostrar só as mais recentes' : `Mostrar todas as ${compras.length} compras`}
            </button>
          )}
        </div>
      )}

      {selecionada ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-yellow-300 bg-white px-3 py-2 dark:border-yellow-900/60 dark:bg-slate-900">
          <ShoppingCart className="hidden h-4 w-4 shrink-0 text-yellow-600 sm:block" />
          <span className="min-w-0 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
            Itens da <b className="font-mono">{rotuloCompraMl(selecionada.numero)}</b>
          </span>
          <button
            type="button"
            onClick={() => onDadosCompra(selecionada.numero)}
            title="Colar de novo o Detalhe da compra ou corrigir o boleto"
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-yellow-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" /> Dados da compra
          </button>
          <button
            type="button"
            onClick={() => onEditarCompra(selecionada.numero)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-yellow-400 bg-yellow-300 px-3 text-xs font-bold text-slate-900 hover:bg-yellow-400 cursor-pointer"
          >
            <PencilLine className="h-3.5 w-3.5" /> Incluir ou retirar itens
          </button>
        </div>
      ) : (
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
          Destine itens pelo botão amarelo <b>M. Livre</b> na coluna Ações. Fechou o carrinho? Marque os itens e use <b>Nº da compra ML</b> na barra de seleção. Abra uma compra para incluir ou retirar itens.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modal: incluir / retirar itens de uma compra
// ---------------------------------------------------------------------------

interface EditarItensCompraMlModalProps {
  numero: string;
  /** Todos os itens destinados ao ML (sup_ml_itens). */
  itens: ItemMercadoLivre[];
  temPedido: (ri: string) => boolean;
  onRetirar: (ri: string) => Promise<void>;
  onIncluir: (ris: string[]) => Promise<void>;
  onClose: () => void;
}

const descricaoItem = (it: ItemMercadoLivre) => it.texto_breve || it.material_code || it.ri;
const refItem = (it: ItemMercadoLivre) =>
  `RM ${it.rm ?? '—'}${it.item_reqc ? ` / ${it.item_reqc}` : ''}${it.qtd != null ? ` · ${it.qtd} ${it.unidade ?? ''}` : ''}`;

export function EditarItensCompraMlModal({ numero, itens, temPedido, onRetirar, onIncluir, onClose }: EditarItensCompraMlModalProps) {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmarRetirada, setConfirmarRetirada] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const daCompra = useMemo(() => itens.filter(it => it.numero_compra === numero), [itens, numero]);
  // Candidatos: primeiro o que aguarda compra; depois o que está em outra
  // compra (incluir aqui move o item, para o caso de ter ido no carrinho errado).
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .filter(it => it.numero_compra !== numero)
      .filter(it => !termo || [it.texto_breve, it.material_code, it.rm, it.ri, it.numero_compra].some(v => v?.toLowerCase().includes(termo)))
      .sort((a, b) => Number(!!a.numero_compra) - Number(!!b.numero_compra) || (a.rm ?? '').localeCompare(b.rm ?? ''));
  }, [itens, numero, busca]);
  const movendo = candidatos.filter(c => marcados.has(c.ri) && c.numero_compra).length;

  const retirar = async (ri: string) => {
    setOcupado(ri); setErro(null);
    try {
      await onRetirar(ri);
      setConfirmarRetirada(null);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível retirar o item.');
    } finally {
      setOcupado(null);
    }
  };
  const incluir = async () => {
    setOcupado('incluir'); setErro(null);
    try {
      await onIncluir(Array.from(marcados));
      setMarcados(new Set());
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível incluir os itens.');
    } finally {
      setOcupado(null);
    }
  };
  const alternar = (ri: string) => setMarcados(prev => {
    const n = new Set(prev);
    if (n.has(ri)) n.delete(ri); else n.add(ri);
    return n;
  });

  return (
    <Modal onClose={ocupado ? () => {} : onClose} maxWidth="max-w-2xl" ariaLabel={`Itens da ${rotuloCompraMl(numero)}`}>
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Itens da compra</h3>
          <p className="truncate font-mono text-xs text-slate-500">{rotuloCompraMl(numero)}</p>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-5">
        {erro && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{erro}</p>}

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nesta compra ({daCompra.length})</h4>
          {daCompra.length === 0 ? (
            <p className="text-xs text-slate-500">Nenhum item. Inclua abaixo ou feche a janela.</p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)] rounded-xl border border-slate-200 dark:border-slate-800">
              {daCompra.map(it => (
                <li key={it.ri} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={descricaoItem(it)}>{descricaoItem(it)}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {refItem(it)}
                      {temPedido(it.ri) && <span className="ml-1.5 rounded bg-emerald-100 px-1 font-sans font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">com PO</span>}
                    </p>
                  </div>
                  {confirmarRetirada === it.ri ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => setConfirmarRetirada(null)} disabled={!!ocupado} className="h-8 rounded-lg px-2 text-xs font-bold text-slate-500 cursor-pointer">Cancelar</button>
                      <button
                        type="button"
                        onClick={() => retirar(it.ri)}
                        disabled={!!ocupado}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                      >
                        {ocupado === it.ri ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        Confirmar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmarRetirada(it.ri)}
                      disabled={!!ocupado}
                      title="Tira o número da compra do item; ele volta para Aguardando compra"
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" /> Retirar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {temPedidoEmAlgum(daCompra, temPedido) && (
            <p className="text-[11px] text-slate-500">Retirar não mexe no pedido do SAP — só desfaz o vínculo com esta compra do ML.</p>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Incluir nesta compra</h4>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Descrição, material, RM ou nº de outra compra"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          {candidatos.length === 0 ? (
            <p className="text-xs text-slate-500">
              {busca ? 'Nada encontrado.' : 'Nenhum outro item destinado ao Mercado Livre.'} O item que ainda não está no ML entra pelo botão amarelo <b>M. Livre</b> na linha dele.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--hairline)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
              {candidatos.map(it => {
                const marcado = marcados.has(it.ri);
                return (
                  <li key={it.ri}>
                    <label className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${marcado ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}`}>
                      <input type="checkbox" checked={marcado} onChange={() => alternar(it.ri)} className="h-4 w-4 shrink-0" style={{ accentColor: '#ca8a04' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={descricaoItem(it)}>{descricaoItem(it)}</span>
                        <span className="block text-[11px] font-mono text-slate-500">{refItem(it)}</span>
                      </span>
                      {it.numero_compra ? (
                        <span className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300" title={`Hoje na ${rotuloCompraMl(it.numero_compra)}`}>
                          em {numeroCurto(it.numero_compra)}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">Aguardando compra</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {movendo > 0 && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {movendo} {movendo === 1 ? 'item marcado está' : 'itens marcados estão'} em outra compra e {movendo === 1 ? 'será movido' : 'serão movidos'} para esta.
            </p>
          )}
        </section>
      </ModalBody>
      <ModalFooter className="!flex-nowrap">
        <button type="button" onClick={onClose} disabled={!!ocupado} className="h-10 rounded-xl px-4 text-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
          Fechar
        </button>
        <button
          type="button"
          onClick={incluir}
          disabled={marcados.size === 0 || !!ocupado}
          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-yellow-400 bg-yellow-300 px-4 text-sm font-bold text-slate-900 hover:bg-yellow-400 disabled:opacity-50 cursor-pointer sm:flex-none"
        >
          {ocupado === 'incluir' ? <Loader2 className="h-4 w-4 animate-spin" /> : marcados.size > 0 ? <Plus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          {marcados.size > 0 ? `Incluir ${marcados.size} ${marcados.size === 1 ? 'item' : 'itens'}` : 'Marque itens para incluir'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function temPedidoEmAlgum(itens: ItemMercadoLivre[], temPedido: (ri: string) => boolean): boolean {
  return itens.some(it => temPedido(it.ri));
}

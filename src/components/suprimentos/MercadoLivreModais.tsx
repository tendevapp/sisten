/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janelas da compra pelo Mercado Livre na Central de Compras: o link do
 * anúncio de um item (botão amarelo "Mercado Livre" na coluna Ações) e o
 * número da compra do ML para os itens marcados (carrinho fechado).
 */

import React, { useState } from 'react';
import { AlertTriangle, ExternalLink, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import {
  ehLinkMercadoLivre, normalizarLinkMl, normalizarNumeroCompraMl, rotuloCompraMl,
  type ItemMercadoLivre,
} from '../../lib/compraMercadoLivre';

const BOTAO_AMARELO = 'bg-yellow-300 hover:bg-yellow-400 text-slate-900 border border-yellow-400';

interface LinkModalProps {
  /** Rótulo do item no cabeçalho: "RM 1234 / Item 10 — CABO FLEXÍVEL". */
  titulo: string;
  existente?: ItemMercadoLivre;
  onSalvar: (link: string) => Promise<void>;
  onRemover: () => Promise<void>;
  onClose: () => void;
}

export function MercadoLivreLinkModal({ titulo, existente, onSalvar, onRemover, onClose }: LinkModalProps) {
  const [texto, setTexto] = useState(existente?.link ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const link = normalizarLinkMl(texto);
  const foraDoMl = !!link && !ehLinkMercadoLivre(link);

  const executar = async (acao: () => Promise<void>) => {
    setSalvando(true);
    setErro(null);
    try {
      await acao();
      onClose();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gravar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Link do Mercado Livre">
      <ModalHeader onClose={onClose}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Comprar no Mercado Livre</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={titulo}>{titulo}</p>
        </div>
      </ModalHeader>
      <form
        onSubmit={e => { e.preventDefault(); if (link) executar(() => onSalvar(link)); }}
        className="flex flex-col flex-1 min-h-0"
      >
        <ModalBody className="space-y-3">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Link do anúncio
          </label>
          <input
            autoFocus
            type="text"
            inputMode="url"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="https://produto.mercadolivre.com.br/MLB-..."
            className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-3 focus:border-[#0056c6] focus:outline-none"
          />
          {texto.trim() && !link && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Isso não parece um link. Cole o endereço do anúncio.</p>
          )}
          {foraDoMl && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> O link não é do Mercado Livre — confira antes de salvar.
            </p>
          )}
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#0056c6] dark:text-blue-400 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir anúncio
            </a>
          )}
          {existente?.numero_compra && (
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Já comprado: {rotuloCompraMl(existente.numero_compra)}
            </p>
          )}
          {erro && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{erro}</p>}
        </ModalBody>
        <ModalFooter className="flex items-center justify-between gap-2">
          {existente ? (
            <button
              type="button"
              disabled={salvando}
              onClick={() => executar(onRemover)}
              title="Tirar este item da lista do Mercado Livre"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Tirar do ML
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!link || salvando}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50 ${BOTAO_AMARELO}`}
            >
              {salvando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
              Salvar
            </button>
          </div>
        </ModalFooter>
      </form>
    </Modal>
  );
}

interface CompraModalProps {
  /** Itens marcados que estão no ML. */
  quantidadeItens: number;
  rms: string[];
  /** Marcados que não têm link do ML — ficam de fora. */
  foraDoMl: number;
  onConfirmar: (numero: string) => Promise<void>;
  onClose: () => void;
}

export function MercadoLivreCompraModal({ quantidadeItens, rms, foraDoMl, onConfirmar, onClose }: CompraModalProps) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const numero = normalizarNumeroCompraMl(texto);

  const confirmar = async () => {
    if (!numero) return;
    setSalvando(true);
    setErro(null);
    try {
      await onConfirmar(numero);
      onClose();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gravar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Número da compra do Mercado Livre">
      <ModalHeader onClose={onClose}>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Número da compra no Mercado Livre</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {quantidadeItens} {quantidadeItens === 1 ? 'item' : 'itens'} · {rms.length === 1 ? 'RM' : 'RMs'} {rms.join(', ')}
          </p>
        </div>
      </ModalHeader>
      <form onSubmit={e => { e.preventDefault(); confirmar(); }} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-3">
          <input
            autoFocus
            type="text"
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="# 2000015616071149"
            className="w-full text-lg font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2 px-3 focus:border-[#0056c6] focus:outline-none"
          />
          {texto.trim() && !numero && (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Número incompleto — o ML mostra 16 dígitos depois do #.</p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            O número fica gravado nos itens e entra na Observação de cada um
            {numero ? <> como <b className="text-slate-700 dark:text-slate-200">{rotuloCompraMl(numero)}</b></> : ''}.
          </p>
          {foraDoMl > 0 && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {foraDoMl} {foraDoMl === 1 ? 'item marcado não tem' : 'itens marcados não têm'} link do ML e {foraDoMl === 1 ? 'fica' : 'ficam'} de fora.
            </p>
          )}
          {erro && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{erro}</p>}
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!numero || salvando}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black cursor-pointer disabled:opacity-50 ${BOTAO_AMARELO}`}
          >
            {salvando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
            Gravar compra
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

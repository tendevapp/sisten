/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janelas da compra pelo Mercado Livre na Central de Compras: o link do
 * anúncio de um item (botão amarelo "Mercado Livre" na coluna Ações) e o
 * número da compra do ML para os itens marcados (carrinho fechado).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, ImagePlus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { useObjectUrl } from '../../lib/useObjectUrl';
import { assinarArquivoCotacao } from '../../lib/cotacoesApi';
import { useLightbox } from '../ui/Lightbox';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import {
  ehLinkMercadoLivre, normalizarLinkMl, normalizarNumeroCompraMl, rotuloCompraMl,
  type ItemMercadoLivre,
} from '../../lib/compraMercadoLivre';
import { interpretarDetalheCompraMl, lerValorMl } from '../../lib/detalheCompraMl';
import type { DadosCompraMlFinanceiro } from '../../lib/compraMercadoLivreApi';

const BOTAO_AMARELO = 'bg-yellow-300 hover:bg-yellow-400 text-slate-900 border border-yellow-400';

interface LinkModalProps {
  /** Rótulo do item no cabeçalho: "RM 1234 / Item 10 — CABO FLEXÍVEL". */
  titulo: string;
  existente?: ItemMercadoLivre;
  onSalvar: (link: string, print?: File | null) => Promise<void>;
  onRemover: () => Promise<void>;
  onClose: () => void;
}

export function MercadoLivreLinkModal({ titulo, existente, onSalvar, onRemover, onClose }: LinkModalProps) {
  const lb = useLightbox();
  const [texto, setTexto] = useState(existente?.link ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [print, setPrint] = useState<File | null | undefined>(undefined);
  const [urlExistente, setUrlExistente] = useState<string | null>(null);
  const urlLocal = useObjectUrl(print);
  const urlPrint = print === undefined ? urlExistente : urlLocal;

  useEffect(() => {
    let ativo = true;
    if (existente?.comprovante?.path) {
      assinarArquivoCotacao(existente.comprovante.path).then(url => {
        if (ativo) {
          setUrlExistente(url);
          if (!url) setErro('Não foi possível carregar o print salvo.');
        }
      }).catch(() => { if (ativo) setErro('Não foi possível carregar o print salvo.'); });
    }
    return () => { ativo = false; };
  }, [existente?.comprovante?.path]);

  const receberPrint = (arquivo?: File) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { setErro('Selecione uma imagem para o print.'); return; }
    if (arquivo.size > 10 * 1024 * 1024) { setErro('O print deve ter até 10 MB.'); return; }
    setErro(null);
    setPrint(arquivo);
  };

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
    <Modal onClose={salvando ? () => {} : onClose} maxWidth="max-w-lg" ariaLabel="Link e print do Mercado Livre">
      <ModalHeader onClose={salvando ? () => {} : onClose}>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Comprar no Mercado Livre</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={titulo}>{titulo}</p>
        </div>
      </ModalHeader>
      <form
        onSubmit={e => { e.preventDefault(); if (link && !salvando) executar(() => onSalvar(link, print)); }}
        onPaste={e => {
          if (salvando) return;
          const imagem = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
          if (imagem) { e.preventDefault(); e.stopPropagation(); receberPrint(imagem); }
        }}
        className="flex flex-col flex-1 min-h-0"
      >
        <ModalBody className="space-y-3">
          <fieldset disabled={salvando} className="space-y-3">
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
          <div className="space-y-2 rounded-xl border border-dashed border-yellow-400 p-3">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Print da cotação (opcional)</p>
            <p className="text-xs text-slate-500">Cole com Ctrl+V ou selecione uma imagem com os itens e valores. O print será anexado ao item quando criar o processo de cotação.</p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[#0056c6] dark:text-blue-400">
              <ImagePlus className="h-4 w-4" /> Selecionar print
              <input type="file" accept="image/*" className="sr-only" onChange={e => { receberPrint(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {urlPrint && <button type="button" onClick={() => lb.abrir([{ url: urlPrint, legenda: titulo }], 0)} className="block w-full"><img src={urlPrint} alt="Print da cotação no Mercado Livre" className="max-h-64 w-full rounded-lg object-contain" /></button>}
            {(print || (print === undefined && existente?.comprovante)) && (
              <button type="button" onClick={() => setPrint(null)} className="block text-xs font-bold text-rose-600">Remover print</button>
            )}
          </div>
          {existente?.numero_compra && (
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Já comprado: {rotuloCompraMl(existente.numero_compra)}
            </p>
          )}
          {erro && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{erro}</p>}
          </fieldset>
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
            <button type="button" disabled={salvando} onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-50">
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
      {lb.elemento}
    </Modal>
  );
}

interface CompraModalProps {
  /** Itens marcados que estão no ML. */
  quantidadeItens: number;
  rms: string[];
  /** Marcados que não têm link do ML — ficam de fora. */
  foraDoMl: number;
  onConfirmar: (numero: string, financeiro: DadosCompraMlFinanceiro) => Promise<void>;
  onClose: () => void;
}

const brl = (v: number | null | undefined): string =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const paraInputBRL = (v: number | null | undefined): string =>
  v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dataBR = (iso: string | null): string => (iso ? iso.split('-').reverse().join('/') : '—');

const campoCls = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 py-2 px-3 focus:border-[#0056c6] focus:outline-none';
const rotuloCls = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';

export function MercadoLivreCompraModal({ quantidadeItens, rms, foraDoMl, onConfirmar, onClose }: CompraModalProps) {
  const [texto, setTexto] = useState('');
  const [detalheTexto, setDetalheTexto] = useState('');
  const [valorBoleto, setValorBoleto] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [linhaDigitavel, setLinhaDigitavel] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const numero = normalizarNumeroCompraMl(texto);

  const detalhe = useMemo(
    () => (detalheTexto.trim() ? interpretarDetalheCompraMl(detalheTexto) : null),
    [detalheTexto],
  );
  const numeroDiverge = !!(numero && detalhe?.numeroCompra && detalhe.numeroCompra !== numero);
  const valorBoletoNum = valorBoleto.trim() ? lerValorMl(valorBoleto) : null;
  const valorBoletoInvalido = !!valorBoleto.trim() && valorBoletoNum == null;
  const digitosLinha = linhaDigitavel.replace(/\D/g, '');
  const linhaIncompleta = !!digitosLinha && digitosLinha.length !== 47 && digitosLinha.length !== 48;

  // Colar o detalhe preenche o nº da compra e o valor do boleto, se estiverem vazios.
  const aoColarDetalhe = (valor: string) => {
    setDetalheTexto(valor);
    const d = valor.trim() ? interpretarDetalheCompraMl(valor) : null;
    if (d?.numeroCompra && !texto.trim()) setTexto(d.numeroCompra);
    if (d?.valorTotal != null && !valorBoleto.trim() && /boleto/i.test(d.formaPagamento ?? '')) {
      setValorBoleto(paraInputBRL(d.valorTotal));
    }
  };

  const confirmar = async () => {
    if (!numero || numeroDiverge || valorBoletoInvalido) return;
    setSalvando(true);
    setErro(null);
    try {
      await onConfirmar(numero, {
        detalhe,
        detalheTexto: detalheTexto.trim() || null,
        valorBoleto: valorBoletoNum,
        vencimento: vencimento || null,
        linhaDigitavel: digitosLinha || null,
      });
      onClose();
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gravar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Número da compra do Mercado Livre" disableOutsideClose>
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
            O número fica gravado nos itens, entra na Observação de cada um
            {numero ? <> como <b className="text-slate-700 dark:text-slate-200">{rotuloCompraMl(numero)}</b></> : ''} e
            o status passa para <b className="text-slate-700 dark:text-slate-200">Comprado</b>.
          </p>
          {foraDoMl > 0 && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {foraDoMl} {foraDoMl === 1 ? 'item marcado não tem' : 'itens marcados não têm'} link do ML e {foraDoMl === 1 ? 'fica' : 'ficam'} de fora.
            </p>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className={rotuloCls} htmlFor="ml-detalhe-compra">Dados da compra (vão para o Financeiro)</label>
            <textarea
              id="ml-detalhe-compra"
              value={detalheTexto}
              onChange={e => aoColarDetalhe(e.target.value)}
              placeholder={'Cole aqui a página "Detalhe da compra" do ML inteira (Ctrl+A, Ctrl+C na página da compra).'}
              className={`${campoCls} min-h-[90px] font-mono text-xs`}
            />
            {numeroDiverge && (
              <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                O texto colado é da compra #{detalhe!.numeroCompra}, não da #{numero}.
              </p>
            )}
          </div>

          {detalhe && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50/60 dark:border-yellow-800 dark:bg-yellow-950/20 p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-xs">
                <div><span className="block text-[10px] text-slate-500">Data</span><b>{dataBR(detalhe.dataCompra)}</b></div>
                <div><span className="block text-[10px] text-slate-500">Produtos{detalhe.qtdProdutos != null && ` (${detalhe.qtdProdutos})`}</span><b className="tabular">{brl(detalhe.valorProdutos)}</b></div>
                <div><span className="block text-[10px] text-slate-500">Frete</span><b className="tabular">{detalhe.valorFrete === 0 ? 'Grátis' : brl(detalhe.valorFrete)}</b></div>
                <div><span className="block text-[10px] text-slate-500">Total</span><b className="tabular">{brl(detalhe.valorTotal)}</b></div>
                <div><span className="block text-[10px] text-slate-500">Pagamento</span><b>{detalhe.formaPagamento ?? '—'}</b></div>
                <div><span className="block text-[10px] text-slate-500">Nº pagamento</span><b className="font-mono">{detalhe.numeroPagamento ?? '—'}</b></div>
                {detalhe.valorDesconto != null && (
                  <div><span className="block text-[10px] text-slate-500">Desconto</span><b className="tabular">− {brl(detalhe.valorDesconto)}</b></div>
                )}
                <div className={detalhe.valorDesconto != null ? '' : 'col-span-2'}><span className="block text-[10px] text-slate-500">Situação no ML</span><b>{detalhe.statusPagamento ?? '—'}</b></div>
                {detalhe.endereco && <div className="col-span-2 sm:col-span-4"><span className="block text-[10px] text-slate-500">Entrega</span>{detalhe.endereco}</div>}
              </div>
              {detalhe.pacotes.length > 0 && (
                <ul className="text-[11px] divide-y divide-yellow-200/70 dark:divide-yellow-900/50">
                  {detalhe.pacotes.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 py-1">
                      <span className="text-slate-400 w-5 shrink-0">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate" title={p.descricao}>{p.descricao}</span>
                      <span className="shrink-0 text-slate-500">{p.quantidade ?? '—'} un</span>
                      <span className="shrink-0 w-24 text-right font-semibold tabular">{brl(p.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {detalhe.avisos.map(a => (
                <p key={a} className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}
                </p>
              ))}
            </div>
          )}

          <div>
            <p className={rotuloCls}>Boleto</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2">
              <div>
                <input
                  inputMode="decimal"
                  value={valorBoleto}
                  onChange={e => setValorBoleto(e.target.value)}
                  onBlur={() => { if (valorBoletoNum != null) setValorBoleto(paraInputBRL(valorBoletoNum)); }}
                  placeholder="Valor (1.878,74)"
                  aria-label="Valor do boleto"
                  className={campoCls}
                />
                {valorBoletoInvalido && <p className="mt-1 text-[11px] font-semibold text-rose-600">Valor inválido.</p>}
              </div>
              <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} aria-label="Vencimento do boleto" title="Vencimento" className={campoCls} />
              <div className="sm:col-span-2">
                <input
                  value={linhaDigitavel}
                  onChange={e => setLinhaDigitavel(e.target.value)}
                  placeholder="Linha digitável / código de barras"
                  aria-label="Linha digitável do boleto"
                  className={`${campoCls} font-mono text-xs`}
                />
                {linhaIncompleta && <p className="mt-1 text-[11px] font-semibold text-amber-600">A linha digitável tem 47 dígitos (48 em contas de consumo) — tem {digitosLinha.length}.</p>}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Aparece em Financeiro › Mercado Livre, onde o pagamento e as baixas são lançados.
            </p>
          </div>

          {erro && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{erro}</p>}
        </ModalBody>
        <ModalFooter className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!numero || numeroDiverge || valorBoletoInvalido || salvando}
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

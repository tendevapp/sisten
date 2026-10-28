/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Proposta do Mercado Livre a partir de um print do anúncio. Sem IA: o print
 * fica ao lado para conferir e o comprador digita loja, preço por item, frete
 * e prazo. O resultado entra como proposta em rascunho, igual às extraídas —
 * o card permite revisar e "Salvar proposta" sobe o print como arquivo
 * original.
 *
 * Ctrl+V cola o print: o ouvinte roda na captura da janela e para o evento,
 * para o painel de importação (que manda prints colados ao OCR) não reagir.
 */

import React, { useEffect, useState } from 'react';
import { ImagePlus, Loader2, ShoppingCart, X } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';
import { comprimirImagemUpload } from '../../lib/imageCompression';
import { useObjectUrl } from '../../lib/useObjectUrl';
import {
  montarPropostaMercadoLivre, validarPropostaMl, type ItemPropostaMl,
} from '../../lib/cotacaoMercadoLivre';
import type { CotacaoProcessoItem, CotacaoPropostaDraft } from '../../types';

interface Props {
  escopo: CotacaoProcessoItem[];
  onClose: () => void;
  /** Recebe o rascunho montado e o print (já comprimido), que vira o arquivo original. */
  onAdicionar: (draft: CotacaoPropostaDraft, print: File) => void;
}

interface LinhaMl {
  incluir: boolean;
  descricao: string;
  quantidade: string;
  preco: string;
}

const campo =
  'w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const rotulo = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

/** "15,55", "R$ 1.234,50", "15.55" → número; vazio → null. */
function lerValor(texto: string): number | null {
  const t = texto.replace(/R\$\s*/i, '').trim();
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

export default function MercadoLivrePropostaModal({ escopo, onClose, onAdicionar }: Props) {
  const toast = useToast();
  const lb = useLightbox();
  const [print, setPrint] = useState<File | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [loja, setLoja] = useState('');
  const [link, setLink] = useState('');
  const [frete, setFrete] = useState('');
  const [prazo, setPrazo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [linhas, setLinhas] = useState<Record<string, LinhaMl>>(() =>
    Object.fromEntries(escopo.map(e => [e.id, {
      incluir: true,
      descricao: '',
      quantidade: e.qtd_solicitada != null ? String(e.qtd_solicitada).replace('.', ',') : '',
      preco: '',
    }])),
  );

  // O comprovante da pesquisa fica no processo; a proposta recebe um novo print.
  const urlPrint = useObjectUrl(print);

  const receberPrint = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) {
      toast.warning('O print do Mercado Livre precisa ser uma imagem (PNG ou JPG).');
      return;
    }
    setPreparando(true);
    try {
      const nome = arquivo.name && arquivo.name !== 'image.png' ? arquivo.name : `print-mercado-livre-${Date.now()}.png`;
      // Regra 1 do app: comprime antes de subir. Print tem letra miúda — reduz menos que foto de campo.
      const blob = await comprimirImagemUpload(arquivo, { maxDimensao: 2400, qualidade: 0.9 });
      setPrint(new File([blob], blob === arquivo ? nome : nome.replace(/\.[^.]+$/, '') + '.jpg', { type: blob.type || arquivo.type }));
    } catch {
      toast.error('Não foi possível preparar o print.');
    } finally {
      setPreparando(false);
    }
  };

  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const imagem = Array.from(e.clipboardData?.files ?? []).find(f => f.type.startsWith('image/'));
      if (!imagem) return;
      e.preventDefault();
      e.stopPropagation();
      void receberPrint(imagem);
    };
    window.addEventListener('paste', aoColar, true);
    return () => window.removeEventListener('paste', aoColar, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alterar = (id: string, patch: Partial<LinhaMl>) =>
    setLinhas(atual => ({ ...atual, [id]: { ...atual[id], ...patch } }));

  const totalItens = escopo.reduce((s, e) => {
    const l = linhas[e.id];
    if (!l?.incluir) return s;
    const q = lerValor(l.quantidade);
    const p = lerValor(l.preco);
    return q && p ? s + q * p : s;
  }, 0);
  const freteNum = lerValor(frete);

  const adicionar = () => {
    if (!print) {
      toast.warning('Adicione o print do anúncio do Mercado Livre (arquivo ou Ctrl+V).');
      return;
    }
    const itens: ItemPropostaMl[] = escopo
      .filter(e => linhas[e.id]?.incluir)
      .map(e => ({
        processoItemId: e.id,
        descricaoAnuncio: linhas[e.id].descricao,
        quantidade: lerValor(linhas[e.id].quantidade),
        precoUnitario: lerValor(linhas[e.id].preco),
      }));
    const dados = {
      loja, linkAnuncio: link, frete: freteNum, prazoEntrega: prazo, observacao, arquivoOrigem: print.name, itens,
    };
    const erros = validarPropostaMl(dados);
    if (erros.length) {
      toast.warning(erros.join(' '));
      return;
    }
    onAdicionar(montarPropostaMercadoLivre(dados, escopo), print);
  };

  const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel="Proposta do Mercado Livre" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50">
          <span className="rounded bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black text-slate-900">ML</span>
          Adicionar print do Mercado Livre
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Cole um novo print do anúncio específico do item e preencha os dados da compra. A proposta entra como rascunho para revisar e salvar.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Print */}
          <div className="space-y-2">
            {urlPrint ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <button type="button" onClick={() => lb.abrir([{ url: urlPrint, legenda: print?.name }], 0)} className="block w-full">
                  <img src={urlPrint} alt="Print do anúncio" className="max-h-[55vh] w-full object-contain bg-slate-50 dark:bg-slate-950" />
                </button>
                <button
                  type="button"
                  onClick={() => setPrint(null)}
                  aria-label="Trocar o print"
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white hover:bg-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex min-h-[14rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-yellow-300 bg-yellow-50/60 p-4 text-center text-sm text-slate-600 hover:border-yellow-400 dark:border-yellow-700/60 dark:bg-yellow-950/20 dark:text-slate-300">
                {preparando ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6 text-yellow-600" />}
                <span className="font-semibold">Enviar o print do anúncio</span>
                <span className="text-xs text-slate-500">ou cole com Ctrl+V</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { void receberPrint(e.target.files?.[0]); e.target.value = ''; }}
                />
              </label>
            )}
          </div>

          {/* Dados */}
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={rotulo}>Loja no Mercado Livre <span className="text-red-500">*</span></label>
                <input value={loja} onChange={e => setLoja(e.target.value)} placeholder="Ex.: MANUKS FERRAMENTAS" className={`${campo} uppercase`} />
              </div>
              <div>
                <label className={rotulo}>Frete (R$)</label>
                <input value={frete} onChange={e => setFrete(e.target.value)} inputMode="decimal" placeholder="0,00 = frete grátis" className={campo} />
              </div>
              <div>
                <label className={rotulo}>Prazo de entrega</label>
                <input value={prazo} onChange={e => setPrazo(e.target.value)} placeholder="Ex.: Chegará quinta-feira" className={campo} />
              </div>
              <div className="sm:col-span-2">
                <label className={rotulo}>Link do anúncio</label>
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://produto.mercadolivre.com.br/..." className={campo} />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="w-8 px-2 py-1.5" />
                    <th className="px-2 py-1.5">Item da RM / título do anúncio</th>
                    <th className="w-20 px-2 py-1.5 text-right">Qtd.</th>
                    <th className="w-24 px-2 py-1.5 text-right">Preço un. (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {escopo.map(e => {
                    const l = linhas[e.id];
                    return (
                      <tr key={e.id} className={`border-t border-slate-100 align-top dark:border-slate-800 ${l.incluir ? '' : 'opacity-50'}`}>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={l.incluir}
                            onChange={ev => alterar(e.id, { incluir: ev.target.checked })}
                            aria-label={`Cotar ${e.material_code || e.ri} neste anúncio`}
                            className="h-4 w-4 accent-indigo-600"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-100">
                            <span className="font-mono text-slate-500">{e.material_code || '—'}</span> · {e.texto_breve || '—'}
                          </p>
                          <input
                            value={l.descricao}
                            onChange={ev => alterar(e.id, { descricao: ev.target.value })}
                            disabled={!l.incluir}
                            placeholder="Título do anúncio (opcional)"
                            className={`${campo} mt-1 text-xs`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={l.quantidade}
                            onChange={ev => alterar(e.id, { quantidade: ev.target.value })}
                            disabled={!l.incluir}
                            inputMode="decimal"
                            aria-label="Quantidade"
                            className={`${campo} text-right tabular-nums`}
                          />
                          {e.unidade_medida && <p className="mt-0.5 text-right text-[10px] text-slate-400">{e.unidade_medida}</p>}
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={l.preco}
                            onChange={ev => alterar(e.id, { preco: ev.target.value })}
                            disabled={!l.incluir}
                            inputMode="decimal"
                            placeholder="0,00"
                            aria-label="Preço unitário"
                            className={`${campo} text-right tabular-nums`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Anúncio em kit (ex.: "Kit 2x"): informe o preço de <strong>uma unidade</strong> — o preço do kit dividido pela quantidade dele.
            </p>

            <div>
              <label className={rotulo}>Observação</label>
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} className={campo} />
            </div>

            <p className="text-right text-sm text-slate-700 dark:text-slate-200">
              Itens <strong className="tabular-nums">{moeda(totalItens)}</strong>
              {freteNum != null && Number.isFinite(freteNum) && (
                <> · frete <strong className="tabular-nums">{freteNum === 0 ? 'grátis' : moeda(freteNum)}</strong></>
              )}
              {' '}· total <strong className="tabular-nums">{moeda(totalItens + (freteNum && Number.isFinite(freteNum) ? freteNum : 0))}</strong>
            </p>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400">
          Cancelar
        </button>
        <button
          type="button"
          onClick={adicionar}
          disabled={preparando}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <ShoppingCart className="h-4 w-4" /> Adicionar proposta
        </button>
      </ModalFooter>
      {lb.elemento}
    </Modal>
  );
}

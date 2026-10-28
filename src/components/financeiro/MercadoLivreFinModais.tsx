/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Mercado Livre — modais do boleto (adiantamento), da baixa
 * parcial por item e do estorno de baixa.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Receipt, Undo2, Wallet } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { formatBRL, formatDateBR } from '../../lib/format';
import {
  formatarLinhaDigitavel, lerValorBRL, saldoItem, valorLiberadoParaBaixa,
  type BaixaFinMl, type ResumoCompraFinMl,
} from '../../lib/finMercadoLivre';
import { estornarBaixaMl, lancarBaixasMl, salvarBoletoMl, type NovaBaixa } from '../../lib/finMercadoLivreApi';

interface Usuario { id: string; nome: string }

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';
const btnSec = 'px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer';
const btnPri = 'flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer';

/** Valor em formato brasileiro para preencher um input ("15,37"). */
const paraInput = (v: number | null | undefined): string =>
  v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function hojeISO(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

/* --------------------------------------------------------------------- */
/* Boleto                                                                 */
/* --------------------------------------------------------------------- */

export function BoletoMlModal({ resumo, usuario, onClose, onSalvo }: {
  resumo: ResumoCompraFinMl;
  usuario: Usuario;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const c = resumo.compra;
  const [valor, setValor] = useState(paraInput(c?.valor_boleto));
  const [vencimento, setVencimento] = useState(c?.vencimento ?? '');
  const [linha, setLinha] = useState(formatarLinhaDigitavel(c?.linha_digitavel));
  const [pagoEm, setPagoEm] = useState(c?.pago_em ?? '');
  const [doc, setDoc] = useState(c?.doc_adiantamento ?? '');
  const [obs, setObs] = useState(c?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);

  const valorNum = lerValorBRL(valor);
  const valorInvalido = valor.trim() !== '' && (valorNum == null || valorNum < 0);

  const salvar = async () => {
    if (valorInvalido) return;
    setSalvando(true);
    try {
      await salvarBoletoMl(resumo.numero, {
        valor_boleto: valorNum,
        vencimento: vencimento || null,
        linha_digitavel: linha.replace(/\D/g, '') || null,
        pago_em: pagoEm || null,
        doc_adiantamento: doc.trim() || null,
        observacao: obs.trim() || null,
      }, usuario);
      toast.success(`Boleto da compra #${resumo.numero} salvo.`);
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível salvar o boleto.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Boleto da compra">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Boleto (adiantamento)</h2>
            <p className="text-xs text-slate-500 font-mono">Compra ML #{resumo.numero}</p>
          </div>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Valor do boleto</label>
            <input className={inputCls} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" autoFocus />
            {valorInvalido && <p className="mt-1 text-[11px] text-rose-600">Valor inválido.</p>}
            {c?.valor_total != null && (
              <p className="mt-1 text-[11px] text-slate-500">Total da compra no ML: {formatBRL(c.valor_total)}</p>
            )}
            {resumo.valorPedidos > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">Soma dos POs já emitidos: {formatBRL(resumo.valorPedidos)}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>Vencimento</label>
            <input type="date" className={inputCls} value={vencimento} onChange={e => setVencimento(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Linha digitável</label>
            <input className={`${inputCls} font-mono text-xs`} value={linha} onChange={e => setLinha(e.target.value)} placeholder="Código de barras do boleto" />
          </div>
          <div>
            <label className={labelCls}>Pago em</label>
            <input type="date" className={inputCls} value={pagoEm} onChange={e => setPagoEm(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Doc. SAP do adiantamento</label>
            <input className={inputCls} value={doc} onChange={e => setDoc(e.target.value)} placeholder="Ex.: 1500001234" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Observação</label>
          <textarea className={`${inputCls} min-h-[70px]`} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className={btnSec} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPri} onClick={salvar} disabled={salvando || valorInvalido}>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar boleto
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* --------------------------------------------------------------------- */
/* Baixa parcial                                                          */
/* --------------------------------------------------------------------- */

interface LinhaBaixa { marcado: boolean; valor: string; nf: string }

/**
 * Baixa em lote dos itens de uma compra. Cada item marcado vira uma baixa com
 * o seu valor; data, documento de compensação e observação são comuns. Já
 * vêm marcados os itens com valor comprovado (MIGO/almox) — ou só o item
 * clicado, quando aberto pela linha.
 */
export function BaixaMlModal({ resumo, riInicial, usuario, onClose, onSalvo }: {
  resumo: ResumoCompraFinMl;
  riInicial?: string | null;
  usuario: Usuario;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [linhas, setLinhas] = useState<Record<string, LinhaBaixa>>(() => {
    const inicial: Record<string, LinhaBaixa> = {};
    for (const it of resumo.itens) {
      const liberado = valorLiberadoParaBaixa(it);
      const sugerido = liberado > 0 ? liberado : (riInicial === it.ri ? saldoItem(it) : 0);
      inicial[it.ri] = {
        marcado: riInicial ? riInicial === it.ri : liberado > 0,
        valor: sugerido > 0 ? paraInput(sugerido) : '',
        nf: (it.notas_fiscais ?? []).join(', '),
      };
    }
    return inicial;
  });
  const [avulsa, setAvulsa] = useState({ marcado: false, valor: '', descricao: 'Frete' });
  const [data, setData] = useState(hojeISO());
  const [doc, setDoc] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const setLinha = (ri: string, patch: Partial<LinhaBaixa>) =>
    setLinhas(prev => ({ ...prev, [ri]: { ...prev[ri], ...patch } }));

  const { novas, total, invalidas } = useMemo(() => {
    const out: NovaBaixa[] = [];
    let erros = 0;
    const comum = { numero_compra: resumo.numero, data_baixa: data, doc_compensacao: doc.trim() || null };
    for (const it of resumo.itens) {
      const l = linhas[it.ri];
      if (!l?.marcado) continue;
      const v = lerValorBRL(l.valor);
      if (v == null || v <= 0) { erros++; continue; }
      out.push({ ...comum, ri: it.ri, valor: v, nota_fiscal: l.nf.trim() || null, observacao: obs.trim() || null });
    }
    if (avulsa.marcado) {
      const v = lerValorBRL(avulsa.valor);
      if (v == null || v <= 0) erros++;
      else out.push({
        ...comum, ri: null, valor: v, nota_fiscal: null,
        observacao: [avulsa.descricao.trim(), obs.trim()].filter(Boolean).join(' — ') || null,
      });
    }
    return { novas: out, total: Math.round(out.reduce((s, b) => s + b.valor, 0) * 100) / 100, invalidas: erros };
  }, [resumo, linhas, avulsa, data, doc, obs]);

  const saldo = resumo.saldoAdiantamento;
  const passaDoSaldo = saldo != null && total > saldo + 0.01;
  const podeSalvar = novas.length > 0 && invalidas === 0 && !!data && !passaDoSaldo && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await lancarBaixasMl(novas, usuario);
      toast.success(`${novas.length} baixa(s) lançada(s): ${formatBRL(total)}.`);
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível lançar a baixa.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Baixa do adiantamento" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-emerald-600" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Baixa do adiantamento</h2>
            <p className="text-xs text-slate-500">
              <span className="font-mono">Compra ML #{resumo.numero}</span>
              {saldo != null && <> · saldo {formatBRL(saldo)}</>}
            </p>
          </div>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {resumo.compra?.valor_boleto == null && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" /> O valor do boleto ainda não foi informado — a baixa entra, mas não há saldo para conferir.
          </p>
        )}

        <div className="space-y-2">
          {resumo.itens.map(it => {
            const l = linhas[it.ri];
            const liberado = valorLiberadoParaBaixa(it);
            const saldoIt = saldoItem(it);
            const v = lerValorBRL(l.valor);
            const acimaDoPo = it.valor_pedido != null && v != null && v > saldoIt + 0.01;
            return (
              <div key={it.ri} className={`rounded-lg border p-3 ${l.marcado ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-slate-200 dark:border-slate-800'}`}>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={l.marcado}
                    onChange={e => setLinha(it.ri, { marcado: e.target.checked, valor: l.valor || (saldoIt > 0 ? paraInput(saldoIt) : '') })} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{it.texto_breve || it.material_code || it.ri}</span>
                    <span className="block text-[11px] text-slate-500">
                      RM {it.rm}/{it.item_reqc} · {it.pedidos?.length ? `PO ${it.pedidos.join(', ')}` : 'sem PO'}
                      {it.valor_pedido != null && <> · PO {formatBRL(it.valor_pedido)} · baixado {formatBRL(it.valor_baixado)}</>}
                      {it.data_migo ? <> · MIGO {formatDateBR(it.data_migo)}</> : ' · sem MIGO'}
                    </span>
                    {liberado > 0 && <span className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Comprovado para baixa: {formatBRL(liberado)}</span>}
                  </span>
                </label>
                {l.marcado && (
                  <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                    <div>
                      <label className={labelCls}>Valor</label>
                      <input className={inputCls} inputMode="decimal" value={l.valor} onChange={e => setLinha(it.ri, { valor: e.target.value })} placeholder="0,00" />
                      {acimaDoPo && <p className="mt-1 text-[11px] text-amber-600">Acima do saldo do PO ({formatBRL(saldoIt)}).</p>}
                    </div>
                    <div>
                      <label className={labelCls}>NF</label>
                      <input className={inputCls} value={l.nf} onChange={e => setLinha(it.ri, { nf: e.target.value })} placeholder="Nº da nota" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className={`rounded-lg border border-dashed p-3 ${avulsa.marcado ? 'border-emerald-300 dark:border-emerald-800' : 'border-slate-300 dark:border-slate-700'}`}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={avulsa.marcado} onChange={e => setAvulsa(a => ({ ...a, marcado: e.target.checked }))} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Baixa avulsa (frete, diferença)</span>
            </label>
            {avulsa.marcado && (
              <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                <div>
                  <label className={labelCls}>Valor</label>
                  <input className={inputCls} inputMode="decimal" value={avulsa.valor} onChange={e => setAvulsa(a => ({ ...a, valor: e.target.value }))} placeholder="0,00" />
                </div>
                <div>
                  <label className={labelCls}>Descrição</label>
                  <input className={inputCls} value={avulsa.descricao} onChange={e => setAvulsa(a => ({ ...a, descricao: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Data da baixa</label>
            <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Doc. de compensação</label>
            <input className={inputCls} value={doc} onChange={e => setDoc(e.target.value)} placeholder="Doc. SAP" />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <input className={inputCls} value={obs} onChange={e => setObs(e.target.value)} />
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="mr-auto text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-100">Total: {formatBRL(total)}</span>
          {passaDoSaldo && <span className="ml-2 font-semibold text-rose-600">passa do saldo do adiantamento ({formatBRL(saldo)})</span>}
          {invalidas > 0 && <span className="ml-2 font-semibold text-rose-600">{invalidas} valor(es) inválido(s)</span>}
        </div>
        <button type="button" className={btnSec} onClick={onClose}>Cancelar</button>
        <button type="button" className={btnPri} onClick={salvar} disabled={!podeSalvar}>
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Lançar {novas.length > 1 ? `${novas.length} baixas` : 'baixa'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* --------------------------------------------------------------------- */
/* Estorno                                                                */
/* --------------------------------------------------------------------- */

export function EstornoBaixaMlModal({ baixa, usuario, onClose, onSalvo }: {
  baixa: BaixaFinMl;
  usuario: Usuario;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!motivo.trim()) return;
    setSalvando(true);
    try {
      await estornarBaixaMl(baixa.id, motivo.trim(), usuario);
      toast.success('Baixa estornada.');
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível estornar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Estornar baixa" zIndexClassName="z-[110]">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Undo2 className="h-5 w-5 text-rose-600" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">Estornar baixa de {formatBRL(baixa.valor)}</h2>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <p className="text-xs text-slate-500">
          Lançada em {formatDateBR(baixa.data_baixa)} por {baixa.criado_por_nome || '—'}. O estorno fica no histórico e o valor volta ao saldo do adiantamento.
        </p>
        <div>
          <label className={labelCls}>Motivo</label>
          <textarea className={`${inputCls} min-h-[70px]`} value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className={btnSec} onClick={onClose}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={!motivo.trim() || salvando}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
          {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Estornar
        </button>
      </ModalFooter>
    </Modal>
  );
}

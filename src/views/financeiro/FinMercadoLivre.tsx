/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Mercado Livre — acompanhamento das compras do ML e baixa
 * parcial do adiantamento.
 *
 * Cada compra (nº gravado pelo comprador na Central de Compras) gera um
 * boleto pago como adiantamento. Os itens chegam aos poucos — NF da loja → PO
 * no SAP → entrada no almoxarifado → MIGO — e o Financeiro baixa o
 * adiantamento item a item. A tela se atualiza sozinha pelo SAP (ZL0132) e
 * pelo Recebimento do almoxarifado, via `vw_fin_ml_itens`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShoppingCart, RefreshCw, Search, FileSpreadsheet, Wallet, Receipt, ChevronDown,
  ExternalLink, Undo2, CheckCircle2, Clock, PackageCheck, Info, Copy,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Profile } from '../../types';
import KpiCard from '../../components/charts/KpiCard';
import { TableEmpty, TableSkeleton } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { BaixaMlModal, BoletoMlModal, EstornoBaixaMlModal } from '../../components/financeiro/MercadoLivreFinModais';
import { formatBRL, formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { isUserSetorFinanceiro } from '../../lib/pages';
import { carregarFinMercadoLivre, type DadosFinMl } from '../../lib/finMercadoLivreApi';
import {
  ETAPAS_ITEM_ML, ROTULO_SITUACAO_COMPRA, casaBuscaCompraFinMl, etapaItem, formatarLinhaDigitavel,
  passaFiltroCompraFinMl, resumirComprasFinMl, saldoItem, valorLiberadoParaBaixa,
  type BaixaFinMl, type CompraFinMl, type FiltroCompraFinMl, type ItemFinMl, type ResumoCompraFinMl, type SituacaoCompraMl,
} from '../../lib/finMercadoLivre';

interface Props {
  user: Profile;
}

/** Mesmo critério da RLS `fin_ml_pode_lancar()`. */
function podeLancar(user: Profile): boolean {
  return user.roles.includes('admin') || isUserSetorFinanceiro(user) || user.page_access?.fin_mercado_livre === true;
}

const FILTROS: { id: FiltroCompraFinMl; rotulo: string }[] = [
  { id: 'abertas', rotulo: 'Em aberto' },
  { id: 'prontas', rotulo: 'Pronto para baixa' },
  { id: 'quitadas', rotulo: 'Baixadas' },
  { id: 'todas', rotulo: 'Todas' },
];

const COR_SITUACAO: Record<SituacaoCompraMl, string> = {
  sem_boleto: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  aguardando_pagamento: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  em_aberto: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  quitada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
};

/** Trilha compacta Comprado → NF/PO → Almox → MIGO → Baixado. */
function TrilhaItem({ item }: { item: ItemFinMl }) {
  const atual = ETAPAS_ITEM_ML.findIndex(e => e.id === etapaItem(item));
  return (
    <div className="flex items-center gap-1" aria-label={`Etapa: ${ETAPAS_ITEM_ML[atual].rotulo}`}>
      {ETAPAS_ITEM_ML.map((e, i) => (
        <React.Fragment key={e.id}>
          {i > 0 && <span className={`h-px w-2 sm:w-3 ${i <= atual ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />}
          <span
            title={e.rotulo}
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${
              i < atual ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                : i === atual ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            {e.rotulo}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function LinhaItem({ item, onBaixar }: { item: ItemFinMl; onBaixar?: () => void }) {
  const liberado = valorLiberadoParaBaixa(item);
  const saldo = saldoItem(item);
  const qtdRef = item.qtd_pedido ?? item.qtd;
  return (
    <div className="py-3 grid gap-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.4fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={item.texto_breve ?? ''}>
          {item.texto_breve || item.material_code || item.ri}
        </p>
        <p className="text-[11px] text-slate-500 font-mono">
          RM {item.rm}/{item.item_reqc} · {formatQtd(item.qtd)} {item.unidade ?? ''}
          {item.link && (
            <a href={item.link} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-sky-600 hover:underline font-sans">
              anúncio <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
        <div className="mt-1.5"><TrilhaItem item={item} /></div>
      </div>

      <div className="min-w-0 text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
        <p className="truncate">
          <span className="text-slate-400">PO </span>
          {item.pedidos?.length ? <span className="font-mono font-semibold">{item.pedidos.join(', ')}</span> : <span className="text-amber-600">aguardando NF / PO</span>}
          {item.fornecedores?.length ? <span className="text-slate-400"> · {item.fornecedores.join(', ')}</span> : null}
        </p>
        {!!item.notas_fiscais?.length && <p><span className="text-slate-400">NF </span><span className="font-mono">{item.notas_fiscais.join(', ')}</span></p>}
        <p>
          <span className="text-slate-400">Almox </span>
          {item.qtd_recebida != null
            ? <>{formatQtd(item.qtd_recebida)}{qtdRef != null && <> de {formatQtd(qtdRef)}</>} em {formatDateBR(item.data_recebimento)}</>
            : item.data_chegada ? <>chegou {formatDateBR(item.data_chegada)}</> : '—'}
        </p>
        <p>
          <span className="text-slate-400">MIGO </span>
          {item.data_migo
            ? <>{formatDateBR(item.data_migo)}{item.qtd_fornecida != null && qtdRef != null && <> · {formatQtd(item.qtd_fornecida)} de {formatQtd(qtdRef)}</>}</>
            : '—'}
        </p>
      </div>

      <div className="text-[11px] grid grid-cols-3 gap-2 lg:text-right">
        <div><p className="text-slate-400">PO</p><p className="font-semibold tabular text-slate-800 dark:text-slate-100">{formatBRL(item.valor_pedido)}</p></div>
        <div><p className="text-slate-400">Baixado</p><p className="font-semibold tabular text-emerald-700 dark:text-emerald-400">{formatBRL(item.valor_baixado)}</p></div>
        <div><p className="text-slate-400">Saldo</p><p className="font-semibold tabular text-slate-800 dark:text-slate-100">{item.valor_pedido != null ? formatBRL(saldo) : '—'}</p></div>
      </div>

      <div className="flex lg:justify-end">
        {onBaixar && (liberado > 0 || (saldo > 0)) && (
          <button
            type="button"
            onClick={onBaixar}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap ${
              liberado > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title={liberado > 0 ? `Comprovado para baixa: ${formatBRL(liberado)}` : 'Sem MIGO/entrada ainda — baixa manual'}
          >
            <Receipt className="h-3.5 w-3.5" /> Baixar{liberado > 0 ? ` ${formatBRL(liberado)}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function HistoricoBaixas({ resumo, user, onEstornar }: {
  resumo: ResumoCompraFinMl;
  user: Profile;
  onEstornar?: (b: BaixaFinMl) => void;
}) {
  if (!resumo.baixas.length) return null;
  const descricaoPorRi = new Map(resumo.itens.map(i => [i.ri, i.texto_breve || i.ri]));
  const ehAdmin = user.roles.includes('admin');
  return (
    <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-950/40 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Baixas lançadas</p>
      <ul className="space-y-1.5">
        {resumo.baixas.map(b => {
          const estornada = !!b.estornado_em;
          return (
            <li key={b.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] ${estornada ? 'opacity-60' : ''}`}>
              <span className="font-mono text-slate-500">{formatDateBR(b.data_baixa)}</span>
              <span className={`font-bold tabular ${estornada ? 'line-through text-slate-500' : 'text-emerald-700 dark:text-emerald-400'}`}>{formatBRL(b.valor)}</span>
              <span className="text-slate-700 dark:text-slate-200 truncate max-w-[260px]">{b.ri ? descricaoPorRi.get(b.ri) ?? b.ri : 'Avulsa'}</span>
              {b.nota_fiscal && <span className="text-slate-500">NF {b.nota_fiscal}</span>}
              {b.doc_compensacao && <span className="text-slate-500">Doc {b.doc_compensacao}</span>}
              {b.observacao && <span className="text-slate-500 italic truncate max-w-[220px]" title={b.observacao}>{b.observacao}</span>}
              <span className="text-slate-400">por {b.criado_por_nome || '—'}</span>
              {estornada && (
                <span className="text-rose-600" title={b.motivo_estorno ?? ''}>
                  estornada por {b.estornado_por_nome} em {formatDateTimeBR(b.estornado_em)}
                </span>
              )}
              {!estornada && onEstornar && (ehAdmin || b.criado_por_id === user.id) && (
                <button type="button" onClick={() => onEstornar(b)} className="inline-flex items-center gap-0.5 text-rose-600 hover:underline cursor-pointer">
                  <Undo2 className="h-3 w-3" /> estornar
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** O que o comprador colou do "Detalhe da compra" do ML e informou do boleto. */
function DadosDaCompra({ compra }: { compra: CompraFinMl }) {
  const toast = useToast();
  const [verPacotes, setVerPacotes] = useState(false);
  const temDetalhe = compra.valor_total != null || !!compra.numero_pagamento || !!compra.pacotes?.length;
  if (!temDetalhe && !compra.linha_digitavel) return null;
  const pacotes = compra.pacotes ?? [];

  const copiarLinha = async () => {
    try {
      await navigator.clipboard.writeText(compra.linha_digitavel ?? '');
      toast.success('Linha digitável copiada.');
    } catch {
      toast.error('Não foi possível copiar — selecione o texto.');
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50/50 dark:border-yellow-900/60 dark:bg-yellow-950/10 p-3 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Dados da compra no ML
        {compra.detalhe_registrado_por_nome && (
          <span className="normal-case font-normal tracking-normal"> · informados por {compra.detalhe_registrado_por_nome} em {formatDateTimeBR(compra.detalhe_registrado_em)}</span>
        )}
      </p>
      {temDetalhe && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[11px]">
          <div><span className="block text-slate-400">Data</span><b className="text-slate-800 dark:text-slate-100">{formatDateBR(compra.data_compra)}</b></div>
          <div>
            <span className="block text-slate-400">Produtos{compra.qtd_produtos != null && ` (${compra.qtd_produtos})`}</span>
            <b className="tabular text-slate-800 dark:text-slate-100">{formatBRL(compra.valor_produtos)}</b>
          </div>
          <div><span className="block text-slate-400">Frete</span><b className="tabular text-slate-800 dark:text-slate-100">{compra.valor_frete === 0 ? 'Grátis' : formatBRL(compra.valor_frete)}</b></div>
          <div><span className="block text-slate-400">Total</span><b className="tabular text-slate-800 dark:text-slate-100">{formatBRL(compra.valor_total)}</b></div>
          <div><span className="block text-slate-400">Pagamento</span><b className="text-slate-800 dark:text-slate-100">{compra.forma_pagamento ?? '—'}</b></div>
          <div><span className="block text-slate-400">Nº pagamento</span><b className="font-mono text-slate-800 dark:text-slate-100">{compra.numero_pagamento ?? '—'}</b></div>
          <div className="col-span-2"><span className="block text-slate-400">Situação no ML (quando colado)</span><b className="text-slate-800 dark:text-slate-100">{compra.status_pagamento_ml ?? '—'}</b></div>
          {compra.endereco_entrega && (
            <div className="col-span-2 sm:col-span-4"><span className="block text-slate-400">Entrega</span><span className="text-slate-700 dark:text-slate-200">{compra.endereco_entrega}</span></div>
          )}
        </div>
      )}
      {compra.linha_digitavel && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-400">Linha digitável</span>
          <span className="font-mono text-slate-800 dark:text-slate-100 break-all">{formatarLinhaDigitavel(compra.linha_digitavel)}</span>
          <button type="button" onClick={copiarLinha} className="inline-flex items-center gap-0.5 text-sky-600 hover:underline cursor-pointer">
            <Copy className="h-3 w-3" /> copiar
          </button>
        </div>
      )}
      {pacotes.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerPacotes(v => !v)} className="text-[11px] font-semibold text-sky-600 hover:underline cursor-pointer">
            {verPacotes ? 'Esconder' : 'Ver'} {pacotes.length} pacote(s) da compra
          </button>
          {verPacotes && (
            <ul className="mt-1 text-[11px] divide-y divide-yellow-200/70 dark:divide-yellow-900/50">
              {pacotes.map((p, i) => (
                <li key={i} className="flex items-center gap-2 py-1">
                  <span className="text-slate-400 w-5 shrink-0">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-700 dark:text-slate-200" title={p.descricao}>{p.descricao}</span>
                  <span className="shrink-0 text-slate-500">{p.quantidade ?? '—'} un</span>
                  <span className="shrink-0 w-24 text-right font-semibold tabular text-slate-800 dark:text-slate-100">{formatBRL(p.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CartaoCompra({ resumo, user, aberto, onAlternar, onBoleto, onBaixa, onEstornar }: {
  resumo: ResumoCompraFinMl;
  user: Profile;
  aberto: boolean;
  onAlternar: () => void;
  onBoleto?: () => void;
  onBaixa?: (ri?: string) => void;
  onEstornar?: (b: BaixaFinMl) => void;
}) {
  const c = resumo.compra;
  const boleto = c?.valor_boleto ?? null;
  const pct = boleto && boleto > 0 ? Math.min(100, (resumo.valorBaixado / boleto) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <button type="button" onClick={onAlternar} className="w-full text-left p-4 cursor-pointer" aria-expanded={aberto}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-yellow-300 px-1.5 py-0.5 text-[10px] font-black text-slate-900">ML</span>
              <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-50"># {resumo.numero}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_SITUACAO[resumo.situacao]}`}>{ROTULO_SITUACAO_COMPRA[resumo.situacao]}</span>
              {resumo.prontoParaBaixa > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <PackageCheck className="h-3 w-3" /> {formatBRL(resumo.prontoParaBaixa)} para baixar
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {resumo.itens.length} item(ns) · RM {resumo.rms.join(', ') || '—'}
              {resumo.registradaEm && <> · comprada {formatDateBR(resumo.registradaEm)}{resumo.registradaPor && <> por {resumo.registradaPor}</>}</>}
            </p>
            <p className="text-[11px] text-slate-500">
              {resumo.itens.length - resumo.itensSemPedido}/{resumo.itens.length} com PO · {resumo.itensComMigo}/{resumo.itens.length} com MIGO
              {resumo.fornecedores.length > 0 && <> · {resumo.fornecedores.join(', ')}</>}
            </p>
          </div>
          <div className="flex items-start gap-4">
            <div className="text-right text-[11px]">
              <p className="text-slate-400">Boleto</p>
              <p className="text-sm font-bold tabular text-slate-900 dark:text-slate-50">{formatBRL(boleto)}</p>
              <p className="text-slate-500">
                {c?.pago_em ? <>pago {formatDateBR(c.pago_em)}</> : c?.vencimento ? <>vence {formatDateBR(c.vencimento)}</> : '—'}
              </p>
            </div>
            <div className="text-right text-[11px]">
              <p className="text-slate-400">Saldo</p>
              <p className="text-sm font-bold tabular text-slate-900 dark:text-slate-50">{formatBRL(resumo.saldoAdiantamento)}</p>
              <p className="text-emerald-700 dark:text-emerald-400">baixado {formatBRL(resumo.valorBaixado)}</p>
            </div>
            <ChevronDown className={`h-5 w-5 mt-1 text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          </div>
        </div>
        {boleto != null && boleto > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </button>

      {aberto && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 pb-4">
          {(onBoleto || onBaixa) && (
            <div className="flex flex-wrap gap-2 pt-3">
              {onBoleto && (
                <button type="button" onClick={onBoleto} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Wallet className="h-3.5 w-3.5" /> {c?.valor_boleto != null ? 'Editar boleto' : 'Informar boleto'}
                </button>
              )}
              {onBaixa && (
                <button type="button" onClick={() => onBaixa()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">
                  <Receipt className="h-3.5 w-3.5" /> Lançar baixa
                </button>
              )}
              {c?.doc_adiantamento && <span className="self-center text-[11px] text-slate-500">Doc. adiantamento <span className="font-mono">{c.doc_adiantamento}</span></span>}
              {c?.observacao && <span className="self-center text-[11px] text-slate-500 italic">{c.observacao}</span>}
            </div>
          )}
          {c && <DadosDaCompra compra={c} />}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {resumo.itens.map(it => (
              <LinhaItem key={it.ri} item={it} onBaixar={onBaixa ? () => onBaixa(it.ri) : undefined} />
            ))}
            {resumo.itens.length === 0 && (
              <p className="py-3 text-xs text-slate-500">Nenhum item da Central de Compras está mais com este nº de compra.</p>
            )}
          </div>
          <HistoricoBaixas resumo={resumo} user={user} onEstornar={onEstornar} />
        </div>
      )}
    </div>
  );
}

export default function FinMercadoLivre({ user }: Props) {
  const [dados, setDados] = useState<DadosFinMl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroCompraFinMl>('abertas');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [boletoDe, setBoletoDe] = useState<ResumoCompraFinMl | null>(null);
  const [baixaDe, setBaixaDe] = useState<{ resumo: ResumoCompraFinMl; ri?: string } | null>(null);
  const [estorno, setEstorno] = useState<BaixaFinMl | null>(null);

  const lancador = podeLancar(user);
  const usuario = useMemo(() => ({ id: user.id, nome: user.name }), [user.id, user.name]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDados(await carregarFinMercadoLivre());
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar as compras do Mercado Livre.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const resumos = useMemo(
    () => (dados ? resumirComprasFinMl(dados.itens, dados.compras, dados.baixas) : []),
    [dados],
  );

  const contagem = useMemo(() => {
    const m = {} as Record<FiltroCompraFinMl, number>;
    for (const f of FILTROS) m[f.id] = resumos.filter(r => passaFiltroCompraFinMl(r, f.id)).length;
    return m;
  }, [resumos]);

  const visiveis = useMemo(
    () => resumos.filter(r => passaFiltroCompraFinMl(r, filtro) && casaBuscaCompraFinMl(r, busca)),
    [resumos, filtro, busca],
  );

  const kpis = useMemo(() => {
    let adiantado = 0, baixado = 0, pronto = 0, aPagar = 0;
    for (const r of resumos) {
      baixado += r.valorBaixado;
      pronto += r.prontoParaBaixa;
      const v = r.compra?.valor_boleto ?? 0;
      if (r.compra?.pago_em) adiantado += v; else aPagar += v;
    }
    return { adiantado, baixado, saldo: adiantado - baixado, pronto, aPagar };
  }, [resumos]);

  const alternar = (numero: string) => setAbertos(prev => {
    const n = new Set(prev);
    if (n.has(numero)) n.delete(numero); else n.add(numero);
    return n;
  });

  const aposSalvar = () => {
    setBoletoDe(null);
    setBaixaDe(null);
    setEstorno(null);
    carregar();
  };

  const exportar = () => {
    const linhas = visiveis.flatMap(r => r.itens.map(it => ({
      'Compra ML': r.numero,
      'Situação': ROTULO_SITUACAO_COMPRA[r.situacao],
      'Boleto': r.compra?.valor_boleto ?? '',
      'Pago em': r.compra?.pago_em ? formatDateBR(r.compra.pago_em) : '',
      'RM': it.rm ?? '',
      'Item': it.item_reqc ?? '',
      'Material': it.material_code ?? '',
      'Descrição': it.texto_breve ?? '',
      'Qtd': it.qtd ?? '',
      'PO': (it.pedidos ?? []).join(', '),
      'Fornecedor': (it.fornecedores ?? []).join(', '),
      'NF': (it.notas_fiscais ?? []).join(', '),
      'Recebido almox': it.qtd_recebida ?? '',
      'MIGO': it.data_migo ? formatDateBR(it.data_migo) : '',
      'Etapa': ETAPAS_ITEM_ML.find(e => e.id === etapaItem(it))?.rotulo ?? '',
      'Valor PO': it.valor_pedido ?? '',
      'Baixado': it.valor_baixado,
      'Saldo item': it.valor_pedido != null ? saldoItem(it) : '',
      'Comprovado p/ baixa': valorLiberadoParaBaixa(it),
    })));
    const baixas = visiveis.flatMap(r => r.baixas.map(b => ({
      'Compra ML': r.numero,
      'Data': formatDateBR(b.data_baixa),
      'Valor': b.valor,
      'Item (RI)': b.ri ?? 'Avulsa',
      'NF': b.nota_fiscal ?? '',
      'Doc. compensação': b.doc_compensacao ?? '',
      'Observação': b.observacao ?? '',
      'Lançada por': b.criado_por_nome ?? '',
      'Estornada': b.estornado_em ? `${formatDateBR(b.estornado_em)} — ${b.motivo_estorno ?? ''}` : '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Itens');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(baixas), 'Baixas');
    XLSX.writeFile(wb, `mercado_livre_adiantamentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6 select-text">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <ShoppingCart className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 font-display">Mercado Livre</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Boleto de cada compra (adiantamento) e baixa parcial conforme os itens recebem NF, PO, entrada no almoxarifado e MIGO.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all disabled:opacity-50 h-9 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          {visiveis.length > 0 && (
            <button
              onClick={exportar}
              className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all shadow-2xs h-9 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar
            </button>
          )}
        </div>
      </div>

      {!loading && !error && resumos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <KpiCard label="Adiantado" value={kpis.adiantado} format={formatBRL} detail={kpis.aPagar > 0 ? `${formatBRL(kpis.aPagar)} em boletos a pagar` : 'Boletos pagos'} icon={Wallet} />
          <KpiCard label="Baixado" value={kpis.baixado} format={formatBRL} detail="Baixas válidas (sem estornos)" icon={CheckCircle2} />
          <KpiCard label="Saldo a baixar" value={kpis.saldo} format={formatBRL} detail="Adiantado − baixado" icon={Clock} />
          <KpiCard label="Pronto para baixa" value={kpis.pronto} format={formatBRL} detail="Itens com MIGO ou entrada no almox" icon={PackageCheck} emphasize={kpis.pronto > 0} />
        </div>
      )}

      <div className="rounded-xl border border-slate-250 dark:border-slate-850 bg-white dark:bg-slate-900 p-4 shadow-xs space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Nº da compra, RM, PO, NF, material, descrição ou loja..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:border-emerald-500 focus:outline-none transition-all"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0">
          {FILTROS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors ${
                filtro === f.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {f.rotulo} <span className="opacity-70">{contagem[f.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          PO, valor e MIGO vêm da ZL0132 (atualizam a cada importação do SAP); entrada no almoxarifado vem do Recebimento de material. O nº da compra é gravado pelo comprador na Central de Compras › M Livre.
        </p>
      </div>

      {loading && !dados && <TableSkeleton columns={5} rows={4} />}

      {!loading && error && (
        <div className="flex items-center gap-3.5 p-5 border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-200 rounded-xl text-sm font-semibold">
          <ShoppingCart className="h-5 w-5 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && dados && visiveis.length === 0 && (
        <TableEmpty
          icon={ShoppingCart}
          title={resumos.length === 0 ? 'Nenhuma compra do Mercado Livre registrada' : 'Nenhuma compra neste filtro'}
          hint={resumos.length === 0
            ? 'As compras aparecem aqui quando o comprador grava o nº da compra do ML na Central de Compras.'
            : 'Troque o filtro ou a busca.'}
        />
      )}

      {!error && visiveis.length > 0 && (
        <div className="space-y-3">
          {visiveis.map(r => (
            <CartaoCompra
              key={r.numero}
              resumo={r}
              user={user}
              aberto={abertos.has(r.numero) || visiveis.length === 1}
              onAlternar={() => alternar(r.numero)}
              onBoleto={lancador ? () => setBoletoDe(r) : undefined}
              onBaixa={lancador ? (ri?: string) => setBaixaDe({ resumo: r, ri }) : undefined}
              onEstornar={lancador ? setEstorno : undefined}
            />
          ))}
        </div>
      )}

      {boletoDe && <BoletoMlModal resumo={boletoDe} usuario={usuario} onClose={() => setBoletoDe(null)} onSalvo={aposSalvar} />}
      {baixaDe && <BaixaMlModal resumo={baixaDe.resumo} riInicial={baixaDe.ri} usuario={usuario} onClose={() => setBaixaDe(null)} onSalvo={aposSalvar} />}
      {estorno && <EstornoBaixaMlModal baixa={estorno} usuario={usuario} onClose={() => setEstorno(null)} onSalvo={aposSalvar} />}
    </div>
  );
}

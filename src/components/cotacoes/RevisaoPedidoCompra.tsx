/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Revisão do pedido de compra — a etapa depois de salvar a decisão no mapa
 * comparativo. Um card por fornecedor, porque **o pedido é colocado por
 * fornecedor**: o comprador confere condições e itens antes de baixar o PDF
 * e efetivamente colocar o pedido (no SAP ou por e-mail, fora deste app) e,
 * quando todos os pedidos saíram, encerra o processo de cotação.
 *
 * É aqui que o custo da compra é fechado: ao salvar o pedido, cada item é
 * apurado pelos critérios da Calc Impostos (`custoCompra.ts`) e o preço
 * líquido, junto do frete teórico, fica gravado no item. Gravado, e não
 * recalculado a cada abertura da tela, porque é o número que justificou a
 * decisão — alíquota que mude depois não pode reescrever o histórico.
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Download, CheckCircle2, AlertTriangle, CalendarClock, CreditCard,
  Truck, ShieldAlert, PackageX, Loader2, FileWarning, Save, Calculator,
} from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { formatBRL, formatQtd, formatDateBR } from '../../lib/format';
import { formatarCnpj, nomeFornecedorCurto } from '../../lib/cotacoes';
import { atualizarStatusProcesso, atualizarItensCotacao } from '../../lib/cotacoesApi';
import { exportPedidoCompraPdf } from '../../lib/pdfExport/exportPedidoCompraPdf';
import { montarPedidosCompra, risSemPedido } from '../../lib/pedidoCompra';
import type { PedidoFornecedor } from '../../lib/pedidoCompra';
import type { CotacaoProcesso, CotacaoProcessoItem, CotacaoPropostaDraft } from '../../types';

const FRETE_LABEL: Record<string, string> = { CIF: 'CIF · frete por conta do fornecedor', FOB: 'FOB · frete por conta da TEN', OUTRO: 'Frete a combinar' };

function Chip({ tom, children, title }: { tom: 'neutro' | 'ok' | 'aviso' | 'ruim'; children: React.ReactNode; title?: string }) {
  const classes = {
    neutro: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    aviso: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    ruim: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  }[tom];
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${classes}`}>
      {children}
    </span>
  );
}

function CardPedido({
  pedido, numeroProcesso,
}: {
  pedido: PedidoFornecedor;
  numeroProcesso: string;
}) {
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const handleSalvarPedido = async () => {
    setSalvando(true);
    try {
      await atualizarItensCotacao(
        pedido.itens.map(it => ({
          id: it.itemKey,
          codigo_fiscal: it.custo?.codigoFiscal ?? null,
          preco_liquido_unitario: it.custo && !it.custo.incompleto ? it.custo.precoLiquidoUnitario : null,
          preco_liquido_total: it.custo && !it.custo.incompleto ? it.custo.precoLiquido : null,
          custo_total_item: it.custo && !it.custo.incompleto ? it.custo.custoTotal : null,
          frete_teorico: it.freteTeorico,
        })),
      );
      setSalvo(true);
      toast.success('Pedido salvo com o preço líquido apurado de cada item.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixar = async () => {
    setBaixando(true);
    try {
      await exportPedidoCompraPdf(pedido, numeroProcesso);
    } catch (err) {
      toast.error(`Falha ao gerar o PDF: ${(err as Error).message}`);
    } finally {
      setBaixando(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100" title={pedido.fornecedorRazaoSocial}>
            {nomeFornecedorCurto(pedido.fornecedorRazaoSocial)}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {pedido.fornecedorCnpj ? formatarCnpj(pedido.fornecedorCnpj) : 'CNPJ não identificado'}
            {pedido.fornecedorCidade ? ` · ${pedido.fornecedorCidade}${pedido.fornecedorUf ? `/${pedido.fornecedorUf}` : ''}` : ''}
            {pedido.numeroProposta ? ` · Proposta ${pedido.numeroProposta}` : ''}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip tom="neutro" title={pedido.prazoEntregaTexto ?? undefined}>
              <CalendarClock className="h-3 w-3" />
              {pedido.prazoEntregaDias != null ? `${pedido.prazoEntregaDias} dias de entrega` : 'prazo não informado'}
            </Chip>
            {pedido.condicaoPagamento && (
              <Chip tom="neutro" title={pedido.condicaoPagamento}>
                <CreditCard className="h-3 w-3" />
                {pedido.condicaoPagamento}
              </Chip>
            )}
            {pedido.freteModalidade && (
              <Chip tom="neutro">
                <Truck className="h-3 w-3" />
                {FRETE_LABEL[pedido.freteModalidade] || pedido.freteModalidade}
              </Chip>
            )}
            {pedido.validadeDias != null && (
              <Chip
                tom={pedido.validadeDias < 0 ? 'ruim' : pedido.validadeDias <= 3 ? 'aviso' : 'ok'}
                title={`Validade da proposta: ${formatDateBR(pedido.validadeData)}`}
              >
                {pedido.validadeDias < 0 ? 'proposta vencida' : `validade vence em ${pedido.validadeDias}d`}
              </Chip>
            )}
            {pedido.atingeFaturamentoMinimo === false && (
              <Chip tom="aviso" title={`Faturamento mínimo de ${formatBRL(pedido.faturamentoMinimo)}`}>
                <ShieldAlert className="h-3 w-3" />
                abaixo do faturamento mínimo
              </Chip>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSalvarPedido}
          disabled={salvando}
          title="Apura o preço líquido de cada item pelos critérios da Calc Impostos e grava o custo da compra"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : salvo ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5" />}
          {salvo ? 'Pedido salvo' : 'Salvar pedido'}
        </button>
        <button
          type="button"
          onClick={handleBaixar}
          disabled={baixando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Baixar PDF do pedido
        </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="px-4 py-2">Item</th>
              <th className="px-2 py-2">RI</th>
              <th className="px-2 py-2">Marca</th>
              <th className="px-2 py-2 text-center">Qtd / Un</th>
              <th className="px-2 py-2 text-right">Preço unit.</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right" title="Parcela do frete simulado pela tabela da Bahia Sul (proposta FOB)">Frete teór.</th>
              <th className="px-4 py-2 text-right" title="Preço deduzido dos tributos recuperáveis, pelos critérios da Calc Impostos">Preço líq.</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map(it => (
              <tr key={it.itemKey} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-700 dark:text-slate-200">{it.descricaoProduto}</div>
                  {it.foraDoEscopo && (
                    <span className="mt-0.5 inline-block text-[10px] text-amber-600 dark:text-amber-400">fora do escopo da RM</span>
                  )}
                </td>
                <td className="px-2 py-2 text-slate-500 dark:text-slate-400">{it.ri || '—'}</td>
                <td className="px-2 py-2 text-slate-500 dark:text-slate-400">{it.marcaFabricante || '—'}</td>
                <td className="px-2 py-2 text-center tabular-nums text-slate-600 dark:text-slate-300">
                  {formatQtd(it.quantidade)} {it.unidadeMedida || ''}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBRL(it.precoUnitario)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatBRL(it.precoTotal)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {it.freteTeorico != null ? formatBRL(it.freteTeorico) : '—'}
                </td>
                <td
                  className="px-4 py-2 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100"
                  title={it.custo ? `Código fiscal ${it.custo.codigoFiscal} · impostos ${formatBRL(it.custo.impostos.totalImpostos)} · custo com frete ${formatBRL(it.custo.custoTotal)}` : undefined}
                >
                  {it.custo && !it.custo.incompleto ? formatBRL(it.custo.precoLiquido) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
        <span className="text-slate-500 dark:text-slate-400">Subtotal: <strong className="text-slate-700 dark:text-slate-200">{formatBRL(pedido.subtotal)}</strong></span>
        {pedido.valorFrete != null && pedido.valorFrete > 0 && (
          <span className="text-slate-500 dark:text-slate-400">Frete: <strong className="text-slate-700 dark:text-slate-200">{formatBRL(pedido.valorFrete)}</strong></span>
        )}
        <span className="text-sm font-bold text-slate-900 dark:text-slate-50">Total: {formatBRL(pedido.total)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-slate-100 px-4 py-3 text-xs dark:border-slate-800">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500 dark:text-slate-400">
          <Calculator className="h-3.5 w-3.5" />
          Composição do custo
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Impostos apurados: <strong className="text-slate-700 dark:text-slate-200">{formatBRL(pedido.custo.impostos)}</strong>
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Frete teórico: <strong className="text-slate-700 dark:text-slate-200">{formatBRL(pedido.freteTeorico)}</strong>
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Preço líquido: <strong className="text-slate-700 dark:text-slate-200">{formatBRL(pedido.custo.precoLiquido)}</strong>
        </span>
        <span className="font-bold text-slate-900 dark:text-slate-50">
          Custo da compra: {formatBRL(pedido.custo.custoTotal)}
        </span>
      </div>
    </div>
  );
}

interface RevisaoPedidoCompraProps {
  processo: CotacaoProcesso;
  escopo: CotacaoProcessoItem[];
  propostas: CotacaoPropostaDraft[];
  onVoltar: () => void;
  /** Refletido no estado do processo mantido pela tela-mãe, após concluir. */
  onProcessoConcluido: () => void;
}

export default function RevisaoPedidoCompra({
  processo, escopo, propostas, onVoltar, onProcessoConcluido,
}: RevisaoPedidoCompraProps) {
  const toast = useToast();
  const [concluindo, setConcluindo] = useState(false);
  const [confirmConcluirAberto, setConfirmConcluirAberto] = useState(false);

  const pedidos = useMemo(() => montarPedidosCompra(propostas), [propostas]);
  const semPedido = useMemo(() => risSemPedido(escopo.map(e => e.ri), pedidos), [escopo, pedidos]);

  const totalGeral = pedidos.reduce((s, p) => s + p.total, 0);
  const totalItens = pedidos.reduce((s, p) => s + p.itens.length, 0);
  const jaConcluido = processo.status === 'concluido';

  const handleConcluir = async () => {
    setConcluindo(true);
    try {
      await atualizarStatusProcesso(processo.id, 'concluido');
      toast.success('Processo de cotação concluído.');
      setConfirmConcluirAberto(false);
      onProcessoConcluido();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConcluindo(false);
    }
  };

  if (pedidos.length === 0) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao mapa comparativo
        </button>
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <PackageX className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhum item marcado para compra</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Volte ao mapa comparativo e marque, item a item, de qual fornecedor comprar antes de revisar os pedidos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar ao mapa comparativo
        </button>
        <span className="text-xs text-slate-400">
          {pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'} · {totalItens} {totalItens === 1 ? 'item' : 'itens'} · total {formatBRL(totalGeral)}
        </span>
        {jaConcluido && (
          <Chip tom="ok"><CheckCircle2 className="h-3 w-3" />processo concluído</Chip>
        )}
      </div>

      {semPedido.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {semPedido.length} {semPedido.length === 1 ? 'item do escopo ficou' : 'itens do escopo ficaram'} sem pedido: {semPedido.join(', ')}.
            Volte ao mapa se algum deles ainda precisa ser comprado.
          </span>
        </div>
      )}

      <div className="space-y-4">
        {pedidos.map(p => (
          <CardPedido key={p.propostaKey} pedido={p} numeroProcesso={processo.numero} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Baixe o PDF de cada pedido para colocar no SAP ou enviar ao fornecedor. Concluir o processo só marca a cotação como encerrada aqui no SISTEN.
        </div>
        {!jaConcluido && (
          <button
            type="button"
            onClick={() => setConfirmConcluirAberto(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Concluir processo de cotação
          </button>
        )}
      </div>

      {confirmConcluirAberto && (
        <ConfirmDialog
          titulo="Concluir processo de cotação"
          mensagem="Marca este processo como concluído. Os pedidos continuam disponíveis para consulta, mas o processo sai da lista de cotações em andamento."
          confirmarLabel="Concluir"
          confirmando={concluindo}
          onConfirmar={handleConcluir}
          onCancelar={() => setConfirmConcluirAberto(false)}
        />
      )}
    </div>
  );
}

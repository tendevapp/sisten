/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela de composição de uma rubrica — aberta ao clicar numa linha da tela
 * de Realizado por Rubrica. Mostra, lado a lado, os pedidos colocados e os
 * pagamentos realizados que compõem o valor daquela rubrica (ou do balde
 * "Sem rubrica"), com a origem do mapeamento (fornecedor ou grupo de
 * mercadoria) — mesma informação da exportação em Excel, mas para conferência
 * rápida sem precisar baixar o arquivo.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileCheck, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableSkeleton, TableEmpty } from '../ui/DataTable';
import { formatBRL } from '../../lib/format';
import {
  obterDetalhePedidosPorRubrica, obterDetalhePagamentosPorRubrica, consolidarPorMaterial,
  DetalhePedidoLinha, DetalhePagamentoLinha,
} from '../../lib/rubricasFinanceiroApi';

interface Props {
  titulo: string;
  /** ids da rubrica + descendentes (rollup); `null` = balde "Sem rubrica". */
  rubricaIds: string[] | null;
  onFechar: () => void;
}

function rotuloOrigem(o: string | null): string {
  if (o === 'fornecedor') return 'Fornecedor';
  if (o === 'grupo_mercadoria') return 'Grupo de Mercadoria';
  return 'Sem mapeamento';
}

export default function RubricaDetalheModal({ titulo, rubricaIds, onFechar }: Props) {
  const [aba, setAba] = useState<'pedidos' | 'pagamentos'>('pedidos');
  const [consolidarPorItem, setConsolidarPorItem] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<DetalhePedidoLinha[]>([]);
  const [pagamentos, setPagamentos] = useState<DetalhePagamentoLinha[]>([]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    Promise.all([
      obterDetalhePedidosPorRubrica(rubricaIds),
      obterDetalhePagamentosPorRubrica(rubricaIds),
    ])
      .then(([p, pg]) => {
        if (!ativo) return;
        setPedidos(p);
        setPagamentos(pg);
      })
      .catch(err => {
        if (!ativo) return;
        console.error('[RubricaDetalheModal] Erro ao carregar composição:', err);
        setErro(err?.message || 'Erro ao carregar a composição da rubrica.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubricaIds === null ? 'sem-rubrica' : rubricaIds.join(',')]);

  const totalPedidos = pedidos.reduce((s, p) => s + (p.valor || 0), 0);
  const totalPagamentos = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
  const itensConsolidados = useMemo(() => consolidarPorMaterial(pedidos), [pedidos]);

  return (
    <Modal onClose={onFechar} maxWidth="max-w-5xl" ariaLabel={`Composição de ${titulo}`}>
      <ModalHeader onClose={onFechar}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Composição do valor — pedidos colocados e pagamentos realizados, com a origem do mapeamento
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="flex flex-col gap-4 min-h-0">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAba('pedidos')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              aba === 'pedidos'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Pedidos ({aba === 'pedidos' && consolidarPorItem ? `${itensConsolidados.length} itens` : pedidos.length}) · {formatBRL(totalPedidos)}
          </button>
          <button
            type="button"
            onClick={() => setAba('pagamentos')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
              aba === 'pagamentos'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            <Wallet className="h-3.5 w-3.5" />
            Pagamentos ({pagamentos.length}) · {formatBRL(totalPagamentos)}
          </button>
        </div>

        {erro ? (
          <TableEmpty icon={AlertCircle} title="Não foi possível carregar a composição" hint={erro} />
        ) : carregando ? (
          <TableSkeleton columns={7} />
        ) : aba === 'pedidos' ? (
          pedidos.length === 0 ? (
            <TableEmpty icon={FileCheck} title="Nenhum pedido nesta rubrica" hint="Não há pedidos colocados (2026) atribuídos a esta rubrica no período." />
          ) : (
            <div className="flex flex-col gap-3 min-h-0">
              <div className="flex justify-end">
                <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                  <button
                    type="button"
                    onClick={() => setConsolidarPorItem(false)}
                    className="px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      background: !consolidarPorItem ? 'var(--brand)' : 'var(--surface-card)',
                      color: !consolidarPorItem ? '#fff' : 'var(--ink-secondary)',
                    }}
                  >
                    Por pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsolidarPorItem(true)}
                    className="px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      background: consolidarPorItem ? 'var(--brand)' : 'var(--surface-card)',
                      color: consolidarPorItem ? '#fff' : 'var(--ink-secondary)',
                    }}
                  >
                    Consolidar por item
                  </button>
                </div>
              </div>

              {consolidarPorItem ? (
                <TableShell maxHeight="50vh">
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="Item (Material)" />
                      <Th label="Grupo Mercadoria" />
                      <Th label="Qtd. Pedidos" align="right" />
                      <Th label="Valor" align="right" />
                    </TableHeadRow>
                    <TableBody>
                      {itensConsolidados.map(item => (
                        <Tr key={item.chave}>
                          <Td truncate title={item.material}>{item.material}</Td>
                          <Td truncate title={item.grupoMercadoria}>{item.grupoMercadoria}</Td>
                          <Td align="right" numeric>{item.qtdPedidos.toLocaleString('pt-BR')}</Td>
                          <Td align="right" numeric strong>{formatBRL(item.valor)}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              ) : (
                <TableShell maxHeight="50vh">
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="Doc. Compra" />
                      <Th label="Data" />
                      <Th label="Fornecedor" />
                      <Th label="Grupo Mercadoria" />
                      <Th label="Material" />
                      <Th label="Origem" />
                      <Th label="Valor" align="right" />
                    </TableHeadRow>
                    <TableBody>
                      {pedidos.map(p => (
                        <Tr key={p.id}>
                          <Td mono>{p.doc_compra}{p.item ? `-${p.item}` : ''}</Td>
                          <Td>{p.data_doc}</Td>
                          <Td truncate title={p.fornecedor_nome || ''}>{p.fornecedor_nome || p.fornecedor_codigo || '—'}</Td>
                          <Td truncate title={p.grupo_mercadoria_nome || ''}>{p.grupo_mercadoria_nome || p.grupo_mercadoria_codigo || '—'}</Td>
                          <Td truncate title={p.material_descricao || ''}>{p.material_descricao || '—'}</Td>
                          <Td>{rotuloOrigem(p.origem_mapeamento)}</Td>
                          <Td align="right" numeric strong>{formatBRL(p.valor)}</Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              )}
            </div>
          )
        ) : pagamentos.length === 0 ? (
          <TableEmpty icon={FileCheck} title="Nenhum pagamento nesta rubrica" hint="Não há pagamentos realizados (2026) atribuídos a esta rubrica no período." />
        ) : (
          <TableShell maxHeight="50vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="Nº Documento" />
                <Th label="Doc. Compras (PO)" />
                <Th label="Data Pagamento" />
                <Th label="Fornecedor" />
                <Th label="Grupo Mercadoria" />
                <Th label="Origem" />
                <Th label="Valor" align="right" />
              </TableHeadRow>
              <TableBody>
                {pagamentos.map(p => (
                  <Tr key={p.id}>
                    <Td mono>{p.numero_documento}</Td>
                    <Td mono>{p.documento_compras || '—'}</Td>
                    <Td>{p.data_pagamento}</Td>
                    <Td truncate title={p.fornecedor_nome || ''}>{p.fornecedor_nome || p.fornecedor_codigo || '—'}</Td>
                    <Td truncate title={p.grupo_mercadoria_nome || ''}>{p.grupo_mercadoria_nome || p.grupo_mercadoria_codigo || '—'}</Td>
                    <Td>{rotuloOrigem(p.origem_mapeamento)}</Td>
                    <Td align="right" numeric strong>{formatBRL(p.valor)}</Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </TableShell>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela de composição de uma rubrica (ou de um balde: material de produção,
 * sem rubrica, uma natureza fiscal) — aberta pelo clique na tela de
 * Realizado por Rubrica. Recebe os itens de NF já recortados e mostra três
 * leituras para a validação: por fornecedor, por item (código SAP) e nota a
 * nota, sempre com a origem da classificação (CFOP, fornecedor, código de
 * serviço ou grupo de mercadoria).
 */

import React, { useMemo, useState } from 'react';
import { Building2, FileText, Package, Receipt, FileCheck } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../ui/DataTable';
import { formatBRL } from '../../lib/format';
import {
  agregar, consolidarPorFornecedor, consolidarPorItem, LinhaNfRealizado, NATUREZAS, rotuloOrigemRubrica,
} from '../../lib/realizadoRubricaNf';

interface Props {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaNfRealizado[];
  onFechar: () => void;
}

type Aba = 'fornecedores' | 'itens' | 'notas';

const formatQtd = (v: number) => (Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—');

export default function RubricaDetalheModal({ titulo, subtitulo, linhas, onFechar }: Props) {
  const [aba, setAba] = useState<Aba>('fornecedores');
  const [fornecedorFiltro, setFornecedorFiltro] = useState<{ codigo: string; nome: string } | null>(null);

  const recorte = useMemo(
    () => (fornecedorFiltro ? linhas.filter(l => l.fornecedor_codigo === fornecedorFiltro.codigo) : linhas),
    [linhas, fornecedorFiltro],
  );
  const total = useMemo(() => agregar(recorte), [recorte]);
  const fornecedores = useMemo(() => consolidarPorFornecedor(linhas), [linhas]);
  const itens = useMemo(() => consolidarPorItem(recorte), [recorte]);
  const notas = useMemo(() => recorte.slice().sort((a, b) => b.valor - a.valor), [recorte]);

  const abas: { id: Aba; rotulo: string; icone: typeof Building2; qtd: number }[] = [
    { id: 'fornecedores', rotulo: 'Fornecedores', icone: Building2, qtd: fornecedores.length },
    { id: 'itens', rotulo: 'Itens', icone: Package, qtd: itens.length },
    { id: 'notas', rotulo: 'Itens de NF', icone: FileText, qtd: notas.length },
  ];

  const abrirFornecedor = (codigo: string, nome: string) => {
    setFornecedorFiltro({ codigo, nome });
    setAba('itens');
  };

  return (
    <Modal onClose={onFechar} maxWidth="max-w-6xl" ariaLabel={`Composição de ${titulo}`}>
      <ModalHeader onClose={onFechar}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">{titulo}</h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {subtitulo || 'Composição pelas notas fiscais de entrada (ZL0136)'} · {formatBRL(total.valor)} em {total.qtdNfs.toLocaleString('pt-BR')} NF(s) · pago rastreado {formatBRL(total.valorPago)}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="flex flex-col gap-4 min-h-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {abas.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                aba === a.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <a.icone className="h-3.5 w-3.5" />
              {a.rotulo} ({a.qtd.toLocaleString('pt-BR')})
            </button>
          ))}
          {fornecedorFiltro && (
            <button
              type="button"
              onClick={() => setFornecedorFiltro(null)}
              className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
              title="Remover filtro de fornecedor"
            >
              {fornecedorFiltro.nome} ✕
            </button>
          )}
        </div>

        {linhas.length === 0 ? (
          <TableEmpty icon={FileCheck} title="Nenhum item de NF neste recorte" hint="Não há notas fiscais de 2026 classificadas aqui no período selecionado." />
        ) : aba === 'fornecedores' ? (
          <TableShell maxHeight="55vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="Fornecedor" />
                <Th label="Rubricas" />
                <Th label="NFs" align="right" />
                <Th label="Valor NF" align="right" />
                <Th label="Pago rastreado" align="right" />
              </TableHeadRow>
              <TableBody>
                {fornecedores.map(f => (
                  <Tr key={f.fornecedorCodigo} onClick={() => abrirFornecedor(f.fornecedorCodigo, f.fornecedorNome)} title="Ver os itens deste fornecedor">
                    <Td truncate title={`${f.fornecedorCodigo} — ${f.fornecedorNome}`}>
                      <span className="underline decoration-dotted underline-offset-2">{f.fornecedorNome}</span>
                    </Td>
                    <Td truncate title={f.rubricas.join(', ')}>{f.rubricas.join(', ')}</Td>
                    <Td align="right" numeric>{f.qtdNfs.toLocaleString('pt-BR')}</Td>
                    <Td align="right" numeric strong>{formatBRL(f.valor)}</Td>
                    <Td align="right" numeric>{formatBRL(f.valorPago)}</Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </TableShell>
        ) : aba === 'itens' ? (
          <TableShell maxHeight="55vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="Item" />
                <Th label="Grupo de mercadoria" />
                <Th label="Rubrica" />
                <Th label="Qtd." align="right" />
                <Th label="NFs" align="right" />
                <Th label="Valor NF" align="right" />
              </TableHeadRow>
              <TableBody>
                {itens.map(i => (
                  <Tr key={i.chave}>
                    <Td truncate title={`${i.chave} — ${i.descricao}`}>{i.descricao}</Td>
                    <Td truncate title={i.grupoMercadoria}>{i.grupoMercadoria}</Td>
                    <Td truncate title={i.rubrica}>{i.rubrica}</Td>
                    <Td align="right" numeric>{formatQtd(i.quantidade)}{i.unidade ? ` ${i.unidade}` : ''}</Td>
                    <Td align="right" numeric>{i.qtdNfs.toLocaleString('pt-BR')}</Td>
                    <Td align="right" numeric strong>{formatBRL(i.valor)}</Td>
                  </Tr>
                ))}
              </TableBody>
            </table>
          </TableShell>
        ) : (
          <TableShell maxHeight="55vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="NF" />
                <Th label="Lançamento" />
                <Th label="Fornecedor" />
                <Th label="Item" />
                <Th label="Natureza / CFOP" />
                <Th label="Rubrica · origem" />
                <Th label="Valor" align="right" />
              </TableHeadRow>
              <TableBody>
                {notas.map(n => (
                  <Tr key={n.id}>
                    <Td mono>{n.numero_nf}{n.serie_nf ? `-${n.serie_nf}` : ''}</Td>
                    <Td>{n.data_lancamento}</Td>
                    <Td truncate title={n.fornecedor_nome || ''}>{n.fornecedor_nome || n.fornecedor_codigo}</Td>
                    <Td truncate title={`${n.material || n.numero_servico || ''} ${n.descricao_item || ''}${n.numero_pedido ? ` · PO ${n.numero_pedido}` : ''}`}>
                      {n.descricao_item || '—'}
                    </Td>
                    <Td truncate title={NATUREZAS[n.natureza]?.descricao}>
                      {NATUREZAS[n.natureza]?.rotulo ?? n.natureza}{n.cfop ? ` · ${n.cfop.slice(0, 4)}` : ` · ${n.categoria_nota_fiscal ?? ''}`}
                    </Td>
                    <Td truncate title={n.grupo_mercadoria_nome || ''}>
                      {n.rubrica_nome || 'Sem rubrica'} · {rotuloOrigemRubrica(n.origem_rubrica, n.excluido_por_material)}
                    </Td>
                    <Td align="right" numeric strong>{formatBRL(n.valor)}</Td>
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

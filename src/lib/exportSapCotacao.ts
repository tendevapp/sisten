/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação da decisão do mapa comparativo no layout de importação SAP —
 * um item cotado por linha, no formato da planilha que o comprador já usa
 * para lançar o pedido. Uma aba por fornecedor: cada fornecedor é um pedido
 * individual, não faz sentido misturar dois pedidos na mesma aba.
 *
 * DDP (condição de pagamento) e Imposto (código fiscal do SAP, série
 * A/B/C/H) vêm das tabelas reais `sup_ddp` e `sup_impostos` — não são um
 * palpite deste app. `imposto` já entra sugerido comparando o código que
 * `custoCompra.ts` (Calc Impostos) infere pela UF de origem, que usa a
 * MESMA nomenclatura (C1-C5, A3) que o SAP; quando o código sugerido não
 * existe na tabela real (ex.: "ISENTO", que só existe do lado da Calc
 * Impostos), a linha some sem sugestão e o comprador escolhe no modal.
 *
 * O que continua sem fonte automática — RM não guarda "data de
 * necessidade", por exemplo — fica em branco e editável no modal antes do
 * arquivo sair. Nada aqui é gravado como verdade; é rascunho para conferência.
 *
 * Preço líquido (2 casas) e preço líquido "cheio" (a coluna auxiliar que a
 * planilha do comprador usa como fórmula) vêm do mesmo motor da Calc
 * Impostos que já apura o pedido de compra — `custoCompra.ts` — para não
 * ter duas contas de imposto divergentes no mesmo processo.
 */

import * as XLSX from 'xlsx-js-style';
import { calcularCustoCompraItem } from './custoCompra';
import { nomeFornecedorCurto } from './cotacoes';
import type { LinhaMapa } from './mapaCotacao';
import type { CotacaoProcessoItem, CotacaoPropostaDraft } from '../types';

export interface LinhaSapExport {
  /** `_key` do item cotado — só para reconciliar com a matriz, não vai para o Excel. */
  key: string;
  /** Chave da proposta de origem — agrupa as linhas por fornecedor (uma aba por grupo). */
  propostaKey: string;
  fornecedorNome: string;
  item: number;
  material: string;
  item2: string;
  tipoSolicitacao: string;
  tipoSolicitacao2: string;
  przApresentacaoCotacao: string;
  org: string;
  comprador: string;
  rm: string;
  ddp: string;
  ddpDescr: string;
  frete: string;
  incoterms: string;
  imposto: string;
  impDescricao: string;
  dataRemessa: string;
  cnpj: string;
  precoLiq: number | null;
  tipoDocumento: string;
  texto: string;
  ncm: string;
  precoCot: number | null;
  aliqIcms: number | null;
  /** Convenção deste app: PIS + COFINS somados numa coluna só — ver `ChipsImpostos` no mapa comparativo, mesma leitura. */
  aliqPis: number | null;
  aliqIpi: number | null;
  baseReduzida: number | null;
  precoLiq2: number | null;
  frete2: number | null;
}

const arredondar2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Resume os itens de uma proposta num texto de justificativa curto — em vez
 * de uma frase genérica igual para o processo inteiro, cada fornecedor (cada
 * pedido) ganha um texto que cita o que está sendo comprado dele.
 */
/** Primeiras `n` palavras da descrição — o texto do SAP não tem espaço para a descrição inteira do material. */
function primeirasPalavras(descricao: string, n = 3): string {
  return descricao.trim().split(/\s+/).slice(0, n).join(' ');
}

/**
 * Até 3 itens: cita as três primeiras palavras de cada um. Acima disso, um
 * texto genérico — listar quatro ou mais itens truncados em três palavras
 * cada vira ruído, não informação, e vale mais um texto curto e legível.
 */
function sugerirTextoCotacao(descricoes: string[]): string {
  const unicas = [...new Set(descricoes.map(d => d.trim()).filter(Boolean))];
  if (unicas.length === 0 || unicas.length > 3) {
    return 'Aquisição de itens para atendimento à produção.';
  }
  const resumidas = unicas.map(d => primeirasPalavras(d));
  return `Aquisição de ${resumidas.join(', ')} para atendimento à produção.`;
}

export function construirLinhasSap(params: {
  linhas: LinhaMapa[];
  selecionados: Set<string>;
  escopo: CotacaoProcessoItem[];
  propostasPorKey: Map<string, CotacaoPropostaDraft>;
  compradorPadrao?: string | null;
}): LinhaSapExport[] {
  const { linhas, selecionados, escopo, propostasPorKey, compradorPadrao } = params;
  const escopoPorId = new Map(escopo.map(e => [e.id, e]));

  interface Bruta { linhaSap: Omit<LinhaSapExport, 'item' | 'texto'>; descricaoItem: string }
  const brutas: Bruta[] = [];

  for (const linha of linhas) {
    const celula = linha.celulas.find(c => selecionados.has(c.item._key));
    if (!celula) continue;

    const proposta = propostasPorKey.get(celula.propostaKey);
    if (!proposta) continue;

    const item = celula.item;
    const escopoItem = linha.processoItemId ? escopoPorId.get(linha.processoItemId) : null;
    const custo = calcularCustoCompraItem(item, proposta);

    const aliqIcms = item.aliquota_icms_pct ?? null;
    const aliqPisIsolado = item.aliquota_pis_pct ?? 0;
    const aliqCofinsIsolado = item.aliquota_cofins_pct ?? 0;
    const aliqIpi = item.aliquota_ipi_pct ?? null;
    const frete = proposta.frete_modalidade === 'CIF' || proposta.frete_modalidade === 'FOB' ? proposta.frete_modalidade : '';

    brutas.push({
      descricaoItem: item.descricao_produto || linha.titulo,
      linhaSap: {
        key: item._key,
        propostaKey: celula.propostaKey,
        fornecedorNome: proposta.fornecedor_razao_social || 'Fornecedor não identificado',
        material: item.material_code || escopoItem?.material_code || '',
        item2: item.descricao_produto || linha.titulo,
        tipoSolicitacao: 'ZS01',
        tipoSolicitacao2: 'ZS01-Orçamento',
        przApresentacaoCotacao: '',
        org: 'AGBR',
        comprador: compradorPadrao ?? '',
        rm: escopoItem?.rm ?? '',
        ddp: '',
        ddpDescr: '',
        frete,
        incoterms: frete === 'CIF' ? 'CIF-Custo, Seguro & frete' : frete === 'FOB' ? 'FOB-Franco a bordo' : '',
        // Sem sugestão automática: o código fiscal que este app infere é
        // heurística por UF, não certeza — o comprador escolhe na lista
        // buscável em vez de herdar um palpite calado.
        imposto: '',
        impDescricao: '',
        dataRemessa: '',
        cnpj: proposta.fornecedor_cnpj ?? '',
        precoLiq: custo.incompleto ? null : arredondar2(custo.impostos.precoLiquidoUnitario),
        tipoDocumento: 'A',
        ncm: item.ncm ?? '',
        precoCot: item.preco_unitario,
        aliqIcms,
        aliqPis: aliqPisIsolado + aliqCofinsIsolado,
        aliqIpi,
        // Depende de qual imposto for escolhido — sem palpite antes disso.
        baseReduzida: null,
        precoLiq2: custo.incompleto ? null : custo.impostos.precoLiquidoUnitario,
        frete2: frete === 'FOB' ? item.frete_teorico : null,
      },
    });
  }

  // Uma aba por fornecedor — ordena por fornecedor primeiro para o modal já
  // exibir os pedidos agrupados, não intercalados na ordem da matriz.
  brutas.sort((a, b) => a.linhaSap.fornecedorNome.localeCompare(b.linhaSap.fornecedorNome, 'pt-BR'));

  const textoPorProposta = new Map<string, string>();
  for (const key of new Set(brutas.map(b => b.linhaSap.propostaKey))) {
    textoPorProposta.set(key, sugerirTextoCotacao(brutas.filter(b => b.linhaSap.propostaKey === key).map(b => b.descricaoItem)));
  }

  return brutas.map((b, idx) => ({
    ...b.linhaSap,
    item: (idx + 1) * 10,
    texto: textoPorProposta.get(b.linhaSap.propostaKey) ?? '',
  }));
}

const CABECALHO_SAP = [
  'Item', 'MATERIAL', 'ITEM2', 'TIPO SOLICITAÇÃO', 'Tipo Solicitação2', 'PRZ APRESENTAÇÃO COTAÇÃO',
  'ORG', 'COMPRADOR', 'RM', 'DDP', 'DDP Descr', 'frete', 'INCOTERMS', 'IMPOSTO', 'Imp Descrição',
  'DATA REMESSA', 'CNPJ', 'PREÇO LIQ', 'tipo documento', 'TEXTO', 'ncm', 'PREÇO COT',
  'ALIQ ICMS', 'ALIQ PIS', 'ALIQ IPI', 'BASE REDUZIDA', 'PREÇO LIQ2', 'Frete2',
];

/** Colunas calculadas pela Calc Impostos — no modelo de planilha do comprador, eram fórmulas; aqui saem destacadas em amarelo pelo mesmo motivo: avisar que não é para digitar por cima sem entender de onde vem. */
const COLUNAS_CALCULADAS = new Set(['PREÇO LIQ', 'PREÇO LIQ2', 'BASE REDUZIDA']);

/** Largura generosa por padrão — colunas de texto livre (TEXTO, ITEM2, Imp Descrição) precisam de bem mais que a largura do rótulo do cabeçalho. */
const LARGURA_COLUNA: Record<string, number> = {
  'Item': 8, MATERIAL: 14, ITEM2: 44, 'TIPO SOLICITAÇÃO': 16, 'Tipo Solicitação2': 20,
  'PRZ APRESENTAÇÃO COTAÇÃO': 20, ORG: 8, COMPRADOR: 12, RM: 16, DDP: 10, 'DDP Descr': 34,
  frete: 10, INCOTERMS: 28, IMPOSTO: 10, 'Imp Descrição': 44, 'DATA REMESSA': 16, CNPJ: 20,
  'PREÇO LIQ': 14, 'tipo documento': 14, TEXTO: 50, ncm: 14, 'PREÇO COT': 14,
  'ALIQ ICMS': 12, 'ALIQ PIS': 12, 'ALIQ IPI': 12, 'BASE REDUZIDA': 14, 'PREÇO LIQ2': 16, Frete2: 12,
};

const ESTILO_CABECALHO = {
  fill: { fgColor: { rgb: '0F2952' } },
  font: { color: { rgb: 'FFFFFF' }, bold: true, sz: 10 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  },
} as const;

const ESTILO_CALCULADO = {
  fill: { fgColor: { rgb: 'FEF9C3' } },
  font: { sz: 9 },
  border: { left: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } }, bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
} as const;

const ESTILO_PADRAO = {
  font: { sz: 9 },
  alignment: { wrapText: true, vertical: 'top' },
  border: { left: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } }, bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } },
} as const;

/** Percentual formatado como o app já mostra em tela (nunca `null` na planilha — fica vazio). */
const pct = (v: number | null) => (v == null ? '' : v / 100);

function linhaParaCelulas(l: LinhaSapExport): (string | number)[] {
  return [
    l.item, l.material, l.item2, l.tipoSolicitacao, l.tipoSolicitacao2, l.przApresentacaoCotacao,
    l.org, l.comprador, l.rm, l.ddp, l.ddpDescr, l.frete, l.incoterms, l.imposto, l.impDescricao,
    l.dataRemessa, l.cnpj, l.precoLiq ?? '', l.tipoDocumento, l.texto, l.ncm, l.precoCot ?? '',
    pct(l.aliqIcms), pct(l.aliqPis), pct(l.aliqIpi), pct(l.baseReduzida), l.precoLiq2 ?? '', l.frete2 ?? '',
  ];
}

/** Nome de aba do Excel: no máx. 31 caracteres, sem `: \ / ? * [ ]`, único dentro da pasta de trabalho. */
function nomeAbaUnico(fornecedor: string, usados: Set<string>): string {
  const base = nomeFornecedorCurto(fornecedor).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Fornecedor';
  let nome = base;
  let sufixo = 2;
  while (usados.has(nome.toLowerCase())) {
    nome = `${base} ${sufixo}`.slice(0, 31);
    sufixo += 1;
  }
  usados.add(nome.toLowerCase());
  return nome;
}

function montarAba(linhas: LinhaSapExport[]): XLSX.WorkSheet {
  const dados = [CABECALHO_SAP, ...linhas.map(linhaParaCelulas)];
  const ws = XLSX.utils.aoa_to_sheet(dados);

  CABECALHO_SAP.forEach((_, colIdx) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (ws[ref]) ws[ref].s = ESTILO_CABECALHO;
  });

  for (let r = 1; r <= linhas.length; r++) {
    CABECALHO_SAP.forEach((titulo, colIdx) => {
      const ref = XLSX.utils.encode_cell({ r, c: colIdx });
      if (!ws[ref]) return;
      ws[ref].s = COLUNAS_CALCULADAS.has(titulo) ? ESTILO_CALCULADO : ESTILO_PADRAO;
      if (['PREÇO LIQ', 'PREÇO COT', 'PREÇO LIQ2', 'Frete2'].includes(titulo) && typeof ws[ref].v === 'number') {
        ws[ref].z = '#,##0.00';
      }
      if (['ALIQ ICMS', 'ALIQ PIS', 'ALIQ IPI', 'BASE REDUZIDA'].includes(titulo) && typeof ws[ref].v === 'number') {
        ws[ref].z = '0.00%';
      }
    });
  }

  ws['!cols'] = CABECALHO_SAP.map(t => ({ wch: LARGURA_COLUNA[t] ?? Math.max(12, t.length + 4) }));
  ws['!rows'] = [{ hpt: 28 }, ...linhas.map(() => ({ hpt: 30 }))];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhas.length, c: CABECALHO_SAP.length - 1 } }) };

  return ws;
}

/**
 * Gera e baixa a planilha de importação SAP — uma aba por fornecedor, já
 * que cada um é um pedido individual. As linhas chegam conferidas pelo
 * comprador no modal.
 */
export function exportarSapXlsx(linhas: LinhaSapExport[], numeroProcesso: string): void {
  const porFornecedor = new Map<string, LinhaSapExport[]>();
  for (const l of linhas) {
    const lista = porFornecedor.get(l.propostaKey) ?? [];
    lista.push(l);
    porFornecedor.set(l.propostaKey, lista);
  }

  const wb = XLSX.utils.book_new();
  const nomesUsados = new Set<string>();
  for (const [, linhasFornecedor] of porFornecedor) {
    const aba = nomeAbaUnico(linhasFornecedor[0].fornecedorNome, nomesUsados);
    XLSX.utils.book_append_sheet(wb, montarAba(linhasFornecedor), aba);
  }

  XLSX.writeFile(wb, `sap-${numeroProcesso}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Planilha do mapa comparativo — a mesma leitura da visão "Detalhada" do
 * mapa, em Excel, para circular fora do sistema (aprovação, arquivo do
 * processo). Três abas:
 *
 * - **Mapa**: no topo, um bloco de condições por fornecedor (pagamento,
 *   prazo, validade, frete, faturamento mínimo, total, impostos); embaixo, a
 *   matriz item × fornecedor com descrição cotada, marca, quantidade,
 *   unitário, total, IPI, ICMS e distância para a melhor oferta. Verde marca
 *   o menor preço da linha; azul, o item escolhido para compra.
 * - **Cenários**: os totais de compra que o mapa calcula, com frete.
 * - **Fornecedores**: as condições em tabela, uma linha por fornecedor —
 *   para filtrar e ordenar.
 *
 * Só monta o workbook; gravar o arquivo fica com quem chama.
 */

import * as XLSX from 'xlsx-js-style';
import { formatarCnpj, nomeFornecedorCurto } from './cotacoes';
import type { Cenario, LinhaMapa, ResumoFornecedor } from './mapaCotacao';
import type { CotacaoProcesso, CotacaoPropostaDraft } from '../types';

export interface ParamsPlanilhaMapa {
  processo: Pick<CotacaoProcesso, 'numero' | 'titulo'>;
  /** Rótulo da base de comparação em uso na tela (preço cotado, desembolso…). */
  baseRotulo: string;
  linhas: LinhaMapa[];
  /** Na ordem de classificação da tela — o 1º é o melhor colocado. */
  resumos: ResumoFornecedor[];
  propostasPorKey: Map<string, CotacaoPropostaDraft>;
  /** `_key` dos itens marcados para compra. */
  selecionados: Set<string>;
  cenarios: Cenario[];
  geradoEm?: Date;
}

// =====================================================================
// Estilos
// =====================================================================

const COR = {
  marinho: '0F2952',
  marinhoClaro: '1E3A6E',
  borda: 'CBD5E1',
  rotuloFundo: 'F1F5F9',
  texto: '1E293B',
  suave: '64748B',
  melhorFundo: 'D1FAE5',
  melhorTexto: '065F46',
  compraFundo: 'DBEAFE',
  compraTexto: '1E3A8A',
  alerta: 'B91C1C',
  aviso: 'B45309',
  grupoA: 'FFFFFF',
  grupoB: 'F8FAFC',
};

const MOEDA = '"R$" #,##0.00';
const PCT = '+0.0%;-0.0%;0.0%';
const QTD = '#,##0.###';

type Estilo = Record<string, unknown>;

const bordaFina = { style: 'thin', color: { rgb: COR.borda } };
const bordaGrossa = { style: 'medium', color: { rgb: COR.marinho } };
const bordas = { top: bordaFina, bottom: bordaFina, left: bordaFina, right: bordaFina };

const fonte = (extra: Record<string, unknown> = {}) => ({ name: 'Calibri', sz: 9, color: { rgb: COR.texto }, ...extra });

function estilo(opts: {
  negrito?: boolean; sz?: number; cor?: string; fundo?: string; h?: 'left' | 'center' | 'right';
  quebra?: boolean; italico?: boolean; bordaEsquerdaGrossa?: boolean; semBorda?: boolean;
} = {}): Estilo {
  return {
    font: fonte({ bold: !!opts.negrito, italic: !!opts.italico, ...(opts.sz ? { sz: opts.sz } : {}), ...(opts.cor ? { color: { rgb: opts.cor } } : {}) }),
    ...(opts.fundo ? { fill: { patternType: 'solid', fgColor: { rgb: opts.fundo } } } : {}),
    alignment: { horizontal: opts.h ?? 'left', vertical: 'center', wrapText: opts.quebra ?? false },
    ...(opts.semBorda ? {} : { border: opts.bordaEsquerdaGrossa ? { ...bordas, left: bordaGrossa } : bordas }),
  };
}

// =====================================================================
// Planilha como grade — escreve célula a célula, com estilo e formato
// =====================================================================

class Grade {
  ws: XLSX.WorkSheet = {};
  merges: XLSX.Range[] = [];
  alturas: { hpt: number }[] = [];
  private maxR = 0;
  private maxC = 0;

  put(r: number, c: number, v: string | number | null | undefined, s: Estilo, z?: string) {
    const ref = XLSX.utils.encode_cell({ r, c });
    const cell: XLSX.CellObject = v == null || v === ''
      ? { t: 's', v: '' }
      : typeof v === 'number' ? { t: 'n', v } : { t: 's', v };
    (cell as XLSX.CellObject & { s?: Estilo }).s = s;
    if (z && typeof v === 'number') cell.z = z;
    this.ws[ref] = cell;
    this.maxR = Math.max(this.maxR, r);
    this.maxC = Math.max(this.maxC, c);
  }

  /** Mescla e aplica o mesmo estilo em todas as células do intervalo (senão a borda some no Excel). */
  mesclar(r: number, c1: number, c2: number, v: string | number | null | undefined, s: Estilo, z?: string, r2 = r) {
    for (let rr = r; rr <= r2; rr++) for (let c = c1; c <= c2; c++) this.put(rr, c, rr === r && c === c1 ? v : null, s, z);
    if (c2 > c1 || r2 > r) this.merges.push({ s: { r, c: c1 }, e: { r: r2, c: c2 } });
  }

  altura(r: number, hpt: number) { this.alturas[r] = { hpt }; }

  fechar(larguras: number[]): XLSX.WorkSheet {
    this.ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxR, c: this.maxC } });
    this.ws['!merges'] = this.merges;
    this.ws['!cols'] = larguras.map(wch => ({ wch }));
    this.ws['!rows'] = Array.from({ length: this.maxR + 1 }, (_, i) => this.alturas[i] ?? { hpt: 15 });
    return this.ws;
  }
}

// =====================================================================
// Textos auxiliares
// =====================================================================

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : null);

function textoValidade(p: CotacaoPropostaDraft, r: ResumoFornecedor): string {
  const data = dataBR(p.validade_data) ?? p.validade_texto ?? 'não informada';
  if (r.validadeDias == null) return data;
  return `${data} · ${r.validadeDias < 0 ? 'VENCIDA' : `vence em ${r.validadeDias}d`}`;
}

function textoFrete(p: CotacaoPropostaDraft, r: ResumoFornecedor): string {
  const modalidade = p.frete_modalidade === 'CIF' ? 'CIF (incluso)' : p.frete_modalidade === 'FOB' ? 'FOB (à parte)' : p.frete_modalidade ? 'a combinar' : 'não informado';
  if (r.frete == null) return modalidade;
  const valor = r.frete.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `${modalidade} · ${valor}${r.freteEhTeorico ? ' (estimado por peso)' : ''}`;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function textoImpostos(r: ResumoFornecedor): string {
  const partes = [
    r.totalImpostos.ipi > 0 ? `IPI ${brl(r.totalImpostos.ipi)}` : null,
    r.totalImpostos.icms > 0 ? `ICMS ${brl(r.totalImpostos.icms)}` : null,
    r.totalImpostos.pisCofins > 0 ? `PIS/COF ${brl(r.totalImpostos.pisCofins)}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(' · ') : 'sem impostos destacados';
}

// =====================================================================
// Aba Mapa
// =====================================================================

/** Colunas de cada fornecedor na matriz. */
const SUB = ['Descrição cotada', 'Marca', 'Qtd', 'Unitário', 'Total', 'IPI', 'ICMS', 'Δ% / melhor'] as const;
const LARG_SUB = [34, 12, 7, 12, 13, 10, 10, 10];
const FIXAS = ['Item', 'RI', 'Qtd sol.', 'Un'] as const;
const LARG_FIXAS = [40, 11, 8, 6];
const FINAIS = ['Melhor unitário', 'Melhor oferta', 'Comprar de'] as const;
const LARG_FINAIS = [13, 20, 20];

function abaMapa(p: ParamsPlanilhaMapa): XLSX.WorkSheet {
  const g = new Grade();
  const { resumos, linhas } = p;
  const nF = FIXAS.length;
  const nS = SUB.length;
  const col0 = (i: number) => nF + i * nS;
  const colFinal = nF + resumos.length * nS;
  const ultimaCol = colFinal + FINAIS.length - 1;
  const geradoEm = p.geradoEm ?? new Date();

  // --- Cabeçalho do documento ---
  g.mesclar(0, 0, ultimaCol, `MAPA COMPARATIVO DE COTAÇÃO — ${p.processo.numero}`, estilo({ negrito: true, sz: 14, cor: 'FFFFFF', fundo: COR.marinho, semBorda: true }));
  g.altura(0, 26);
  const resumoDoc = [
    p.processo.titulo,
    `Base de comparação: ${p.baseRotulo}`,
    `${linhas.length} ${linhas.length === 1 ? 'item' : 'itens'} · ${resumos.length} ${resumos.length === 1 ? 'fornecedor' : 'fornecedores'}`,
    `Gerado em ${geradoEm.toLocaleString('pt-BR')}`,
  ].filter(Boolean).join('   |   ');
  g.mesclar(1, 0, ultimaCol, resumoDoc, estilo({ cor: COR.suave, fundo: COR.rotuloFundo, semBorda: true }));
  g.mesclar(2, 0, ultimaCol,
    'Legenda:  VERDE = menor preço da linha   ·   AZUL = item escolhido para compra   ·   Δ% = quanto está acima da melhor oferta   ·   valores de frete fora do total da cotação',
    estilo({ italico: true, cor: COR.suave, semBorda: true }));

  // --- Bloco de condições por fornecedor ---
  let r = 4;
  const rotulo = (texto: string) => g.mesclar(r, 0, nF - 1, texto, estilo({ negrito: true, fundo: COR.rotuloFundo, cor: COR.marinho }));
  const porFornecedor = (
    texto: string,
    valor: (res: ResumoFornecedor, prop: CotacaoPropostaDraft, i: number) => { v: string | number | null; s?: Estilo; z?: string },
    alturaLinha?: number,
  ) => {
    rotulo(texto);
    resumos.forEach((res, i) => {
      const prop = p.propostasPorKey.get(res.propostaKey);
      if (!prop) return;
      const { v, s, z } = valor(res, prop, i);
      g.mesclar(r, col0(i), col0(i) + nS - 1, v, s ?? estilo({ h: 'center', quebra: true, bordaEsquerdaGrossa: true, fundo: i % 2 ? COR.grupoB : COR.grupoA }), z);
    });
    g.mesclar(r, colFinal, ultimaCol, null, estilo({ semBorda: true }));
    if (alturaLinha) g.altura(r, alturaLinha);
    r++;
  };
  const fundoDe = (i: number) => (i % 2 ? COR.grupoB : COR.grupoA);

  porFornecedor('Fornecedor', (res) => ({
    v: res.nome,
    s: estilo({ negrito: true, sz: 11, cor: 'FFFFFF', fundo: COR.marinhoClaro, h: 'center', quebra: true, bordaEsquerdaGrossa: true }),
  }), 30);
  porFornecedor('Classificação', (res, _prop, i) => {
    const vencedor = i === 0 && res.itensCotados > 0;
    return {
      v: vencedor ? '1º · MELHOR COLOCADO' : `${i + 1}º colocado`,
      s: estilo({ negrito: true, h: 'center', bordaEsquerdaGrossa: true, fundo: vencedor ? COR.melhorFundo : fundoDe(i), cor: vencedor ? COR.melhorTexto : COR.texto }),
    };
  });
  porFornecedor('CNPJ · UF · Proposta', (res, prop) => ({
    v: [res.cnpj ? formatarCnpj(res.cnpj) : 'CNPJ não identificado', prop.fornecedor_uf, prop.numero_proposta ? `Proposta ${prop.numero_proposta}` : null].filter(Boolean).join(' · '),
  }));
  porFornecedor('Vendedor', (_res, prop) => ({
    v: [prop.vendedor_nome, prop.vendedor_email, prop.vendedor_telefone].filter(Boolean).join(' · ') || '—',
  }));
  porFornecedor('Condição de pagamento', (res, prop) => ({
    v: [res.condicaoPagamento, prop.forma_pagamento].filter(Boolean).join(' · ') || '—',
  }));
  porFornecedor('Prazo de entrega', (res, prop) => ({
    v: prop.prazo_entrega_texto || (res.prazoEntregaDias != null ? `${res.prazoEntregaDias} dias` : 'não informado'),
  }));
  porFornecedor('Validade da proposta', (res, prop, i) => ({
    v: textoValidade(prop, res),
    s: res.validadeDias != null && res.validadeDias < 0
      ? estilo({ negrito: true, h: 'center', cor: COR.alerta, bordaEsquerdaGrossa: true, fundo: fundoDe(i) })
      : undefined,
  }));
  porFornecedor('Frete', (res, prop) => ({ v: textoFrete(prop, res) }));
  porFornecedor('Faturamento mínimo', (res, _prop, i) => ({
    v: res.faturamentoMinimo ? `${brl(res.faturamentoMinimo)}${res.atingeFaturamentoMinimo === false ? ' · ABAIXO DO MÍNIMO' : ''}` : 'sem mínimo',
    s: res.atingeFaturamentoMinimo === false ? estilo({ negrito: true, h: 'center', cor: COR.aviso, bordaEsquerdaGrossa: true, fundo: fundoDe(i) }) : undefined,
  }));
  porFornecedor('Desconto', (res) => ({ v: res.valorDesconto ? brl(res.valorDesconto) : '—' }));
  porFornecedor('Itens cotados', (res) => ({
    v: `${res.itensCotados}/${res.totalLinhas}${res.melhorEm > 0 ? ` · melhor em ${res.melhorEm}` : ''}`,
  }));
  porFornecedor('Impostos destacados', (res) => ({ v: textoImpostos(res) }));
  porFornecedor('TOTAL DA COTAÇÃO (sem frete)', (res, _prop, i) => ({
    v: res.totalCotacao,
    z: MOEDA,
    s: estilo({ negrito: true, sz: 12, h: 'center', bordaEsquerdaGrossa: true, fundo: i === 0 && res.itensCotados > 0 ? COR.melhorFundo : fundoDe(i), cor: i === 0 && res.itensCotados > 0 ? COR.melhorTexto : COR.marinho }),
  }), 22);

  // --- Cabeçalho da matriz ---
  r++;
  const linhaNome = r;
  const linhaSub = r + 1;
  const estiloCab = estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.marinho, h: 'center', quebra: true });
  FIXAS.forEach((t, c) => g.mesclar(linhaNome, c, c, t, estiloCab, undefined, linhaSub));
  resumos.forEach((res, i) => {
    g.mesclar(linhaNome, col0(i), col0(i) + nS - 1, nomeFornecedorCurto(res.nome).toUpperCase(),
      estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.marinhoClaro, h: 'center', bordaEsquerdaGrossa: true }));
    SUB.forEach((t, j) => g.put(linhaSub, col0(i) + j, t,
      estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.marinho, h: 'center', quebra: true, bordaEsquerdaGrossa: j === 0 })));
  });
  FINAIS.forEach((t, j) => g.mesclar(linhaNome, colFinal + j, colFinal + j, t, estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.melhorTexto, h: 'center', quebra: true }), undefined, linhaSub));
  g.altura(linhaNome, 18);
  g.altura(linhaSub, 24);

  // --- Itens ---
  r = linhaSub + 1;
  const primeiraItem = r;
  const nomeCurto = (key: string) => nomeFornecedorCurto(resumos.find(x => x.propostaKey === key)?.nome ?? '');

  for (const l of linhas) {
    const zebra = (r - primeiraItem) % 2 ? COR.grupoB : COR.grupoA;
    const txt = estilo({ quebra: true, fundo: zebra });
    const cen = estilo({ h: 'center', fundo: zebra });
    const alertaQtd = l.quantidadeDivergente || l.unidadeDivergente;

    g.put(r, 0, l.titulo, estilo({ quebra: true, negrito: true, fundo: zebra }));
    g.put(r, 1, l.ri, cen);
    g.put(r, 2, l.qtdSolicitada, cen, QTD);
    g.put(r, 3, l.unidade, cen);

    resumos.forEach((res, i) => {
      const c0 = col0(i);
      const cel = l.celulas.find(x => x.propostaKey === res.propostaKey);
      if (!cel) {
        g.mesclar(r, c0, c0 + nS - 1, 'não cotado', estilo({ italico: true, cor: '94A3B8', h: 'center', fundo: zebra, bordaEsquerdaGrossa: true }));
        return;
      }
      const comprar = p.selecionados.has(cel.item._key);
      const fundo = comprar ? COR.compraFundo : cel.melhor ? COR.melhorFundo : zebra;
      const corTxt = comprar ? COR.compraTexto : cel.melhor ? COR.melhorTexto : COR.texto;
      const s = (h: 'left' | 'center' | 'right', extra: { negrito?: boolean; quebra?: boolean; bordaEsquerdaGrossa?: boolean; cor?: string } = {}) =>
        estilo({ h, fundo, cor: extra.cor ?? corTxt, negrito: extra.negrito ?? comprar, quebra: extra.quebra, bordaEsquerdaGrossa: extra.bordaEsquerdaGrossa });

      const desc = `${comprar ? '✔ COMPRAR · ' : ''}${cel.item.descricao_produto || 'sem descrição'}${cel.item.mapa_observacao ? `\nObs.: ${cel.item.mapa_observacao}` : ''}`;
      g.put(r, c0, desc, s('left', { quebra: true, bordaEsquerdaGrossa: true }));
      g.put(r, c0 + 1, cel.item.marca_fabricante, s('center', { quebra: true }));
      g.put(r, c0 + 2, cel.custo.quantidade, s('center', { cor: alertaQtd ? COR.aviso : undefined }), QTD);
      g.put(r, c0 + 3, cel.custo.unitarioComparavel, s('right', { negrito: true }), MOEDA);
      g.put(r, c0 + 4, cel.custo.comparavel, s('right'), MOEDA);
      g.put(r, c0 + 5, cel.custo.impostos.ipi || null, s('right'), MOEDA);
      g.put(r, c0 + 6, cel.custo.impostos.icms || null, s('right'), MOEDA);
      if (cel.melhor) {
        g.put(r, c0 + 7, 'MELHOR', estilo({ h: 'center', negrito: true, fundo: COR.melhorFundo, cor: COR.melhorTexto }));
      } else {
        g.put(r, c0 + 7, cel.deltaPct != null ? cel.deltaPct / 100 : 'sem preço',
          s('center', { negrito: true, cor: cel.deltaPct != null && cel.deltaPct > 10 ? COR.alerta : COR.aviso }), PCT);
      }
    });

    const melhor = l.celulas.find(c => c.melhor);
    const escolhida = l.celulas.find(c => p.selecionados.has(c.item._key));
    const fim = estilo({ h: 'center', fundo: COR.melhorFundo, cor: COR.melhorTexto, negrito: true, quebra: true });
    g.put(r, colFinal, l.melhorCusto, estilo({ h: 'right', fundo: COR.melhorFundo, cor: COR.melhorTexto, negrito: true }), MOEDA);
    g.put(r, colFinal + 1, melhor ? nomeCurto(melhor.propostaKey) : '—', fim);
    g.put(r, colFinal + 2, escolhida ? nomeCurto(escolhida.propostaKey) : '—',
      escolhida ? estilo({ h: 'center', fundo: COR.compraFundo, cor: COR.compraTexto, negrito: true, quebra: true }) : estilo({ h: 'center', cor: COR.suave, fundo: zebra }));

    const temObs = l.celulas.some(c => c.item.mapa_observacao);
    g.altura(r, temObs ? 48 : 32);
    r++;
  }
  const ultimaItem = r - 1;

  // --- Totais ---
  const estTot = estilo({ negrito: true, fundo: COR.rotuloFundo, cor: COR.marinho, h: 'right' });
  g.mesclar(r, 0, nF - 1, 'TOTAL (sem frete)', estilo({ negrito: true, fundo: COR.rotuloFundo, cor: COR.marinho }));
  resumos.forEach((res, i) => {
    const c0 = col0(i);
    const cels = linhas.flatMap(l => l.celulas.filter(c => c.propostaKey === res.propostaKey));
    g.mesclar(r, c0, c0 + 3, `${res.itensCotados} ${res.itensCotados === 1 ? 'item' : 'itens'}`, estilo({ negrito: true, fundo: COR.rotuloFundo, cor: COR.suave, h: 'right', bordaEsquerdaGrossa: true }));
    g.put(r, c0 + 4, cels.reduce((s, c) => s + (c.custo.comparavel ?? 0), 0), estTot, MOEDA);
    g.put(r, c0 + 5, res.totalImpostos.ipi || null, estTot, MOEDA);
    g.put(r, c0 + 6, res.totalImpostos.icms || null, estTot, MOEDA);
    g.put(r, c0 + 7, null, estTot);
  });
  g.mesclar(r, colFinal, ultimaCol, null, estilo({ fundo: COR.rotuloFundo }));
  g.altura(r, 20);

  const ws = g.fechar([...LARG_FIXAS, ...resumos.flatMap(() => LARG_SUB), ...LARG_FINAIS]);
  if (ultimaItem >= primeiraItem) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: linhaSub, c: 0 }, e: { r: ultimaItem, c: nF - 1 } }) };
  }
  return ws;
}

// =====================================================================
// Aba Cenários
// =====================================================================

function abaCenarios(p: ParamsPlanilhaMapa): XLSX.WorkSheet {
  const g = new Grade();
  const COLS = ['Fornecedor', 'Itens', 'Subtotal', 'Frete', 'Desconto', 'Total'];
  const ultima = COLS.length - 1;
  g.mesclar(0, 0, ultima, `CENÁRIOS DE COMPRA — ${p.processo.numero}`, estilo({ negrito: true, sz: 13, cor: 'FFFFFF', fundo: COR.marinho, semBorda: true }));
  g.altura(0, 24);
  g.mesclar(1, 0, ultima, 'Totais com frete: frete é custo fixo por fornecedor, pago inteiro por quem compra dele.', estilo({ italico: true, cor: COR.suave, semBorda: true }));

  let r = 3;
  for (const cen of p.cenarios) {
    g.mesclar(r, 0, ultima - 1, `${cen.nome} — ${cen.itensAtendidos}/${cen.totalLinhas} itens`, estilo({ negrito: true, sz: 11, cor: 'FFFFFF', fundo: COR.marinhoClaro }));
    g.put(r, ultima, cen.total, estilo({ negrito: true, sz: 11, cor: 'FFFFFF', fundo: COR.marinhoClaro, h: 'right' }), MOEDA);
    g.altura(r, 20);
    r++;
    g.mesclar(r, 0, ultima, cen.descricao, estilo({ italico: true, cor: COR.suave }));
    r++;
    COLS.forEach((t, c) => g.put(r, c, t, estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.marinho, h: 'center' })));
    r++;
    if (cen.parcelas.length === 0) {
      g.mesclar(r, 0, ultima, 'nenhum item neste cenário', estilo({ italico: true, cor: COR.suave, h: 'center' }));
      r++;
    }
    cen.parcelas.forEach((parc, i) => {
      const fundo = i % 2 ? COR.grupoB : COR.grupoA;
      g.put(r, 0, parc.nome + (parc.abaixoDoMinimo ? '  (abaixo do faturamento mínimo)' : ''), estilo({ fundo, quebra: true, cor: parc.abaixoDoMinimo ? COR.aviso : COR.texto }));
      g.put(r, 1, parc.itens, estilo({ fundo, h: 'center' }));
      g.put(r, 2, parc.subtotal, estilo({ fundo, h: 'right' }), MOEDA);
      g.put(r, 3, parc.frete || null, estilo({ fundo, h: 'right', italico: parc.freteEhTeorico }), MOEDA);
      g.put(r, 4, parc.desconto ? -parc.desconto : null, estilo({ fundo, h: 'right' }), MOEDA);
      g.put(r, 5, parc.total, estilo({ fundo, h: 'right', negrito: true }), MOEDA);
      r++;
    });
    for (const a of cen.alertas) {
      g.mesclar(r, 0, ultima, `⚠ ${a}`, estilo({ cor: COR.aviso, semBorda: true }));
      r++;
    }
    r++;
  }
  return g.fechar([44, 8, 15, 13, 13, 16]);
}

// =====================================================================
// Aba Fornecedores
// =====================================================================

function abaFornecedores(p: ParamsPlanilhaMapa): XLSX.WorkSheet {
  const g = new Grade();
  const COLS: { t: string; w: number }[] = [
    { t: 'Posição', w: 8 }, { t: 'Fornecedor', w: 38 }, { t: 'CNPJ', w: 19 }, { t: 'UF', w: 5 }, { t: 'Proposta', w: 14 },
    { t: 'Vendedor', w: 22 }, { t: 'E-mail', w: 26 }, { t: 'Telefone', w: 15 },
    { t: 'Pagamento', w: 18 }, { t: 'Prazo entrega', w: 16 }, { t: 'Validade', w: 12 }, { t: 'Frete', w: 26 },
    { t: 'Fat. mínimo', w: 13 }, { t: 'Desconto', w: 12 }, { t: 'Itens cotados', w: 10 }, { t: 'Melhor em', w: 9 },
    { t: 'IPI', w: 12 }, { t: 'ICMS', w: 12 }, { t: 'Total cotação (sem frete)', w: 16 },
  ];
  COLS.forEach((c, i) => g.put(0, i, c.t, estilo({ negrito: true, cor: 'FFFFFF', fundo: COR.marinho, h: 'center', quebra: true })));
  g.altura(0, 30);
  p.resumos.forEach((res, i) => {
    const prop = p.propostasPorKey.get(res.propostaKey);
    const r = i + 1;
    const fundo = i === 0 && res.itensCotados > 0 ? COR.melhorFundo : i % 2 ? COR.grupoB : COR.grupoA;
    const s = (h: 'left' | 'center' | 'right' = 'left', negrito = false) => estilo({ fundo, h, negrito, quebra: true });
    g.put(r, 0, `${i + 1}º`, s('center', true));
    g.put(r, 1, res.nome, s('left', true));
    g.put(r, 2, res.cnpj ? formatarCnpj(res.cnpj) : null, s('center'));
    g.put(r, 3, prop?.fornecedor_uf, s('center'));
    g.put(r, 4, prop?.numero_proposta, s('center'));
    g.put(r, 5, prop?.vendedor_nome, s());
    g.put(r, 6, prop?.vendedor_email, s());
    g.put(r, 7, prop?.vendedor_telefone, s());
    g.put(r, 8, res.condicaoPagamento, s());
    g.put(r, 9, prop?.prazo_entrega_texto ?? (res.prazoEntregaDias != null ? `${res.prazoEntregaDias} dias` : null), s());
    g.put(r, 10, dataBR(prop?.validade_data) ?? prop?.validade_texto, s('center'));
    g.put(r, 11, prop ? textoFrete(prop, res) : null, s());
    g.put(r, 12, res.faturamentoMinimo || null, s('right'), MOEDA);
    g.put(r, 13, res.valorDesconto || null, s('right'), MOEDA);
    g.put(r, 14, `${res.itensCotados}/${res.totalLinhas}`, s('center'));
    g.put(r, 15, res.melhorEm, s('center'));
    g.put(r, 16, res.totalImpostos.ipi || null, s('right'), MOEDA);
    g.put(r, 17, res.totalImpostos.icms || null, s('right'), MOEDA);
    g.put(r, 18, res.totalCotacao, s('right', true), MOEDA);
    g.altura(r, 28);
  });
  const ws = g.fechar(COLS.map(c => c.w));
  if (p.resumos.length > 0) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: p.resumos.length, c: COLS.length - 1 } }) };
  }
  return ws;
}

// =====================================================================

export function montarPlanilhaMapa(params: ParamsPlanilhaMapa): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, abaMapa(params), 'Mapa');
  XLSX.utils.book_append_sheet(wb, abaCenarios(params), 'Cenários');
  XLSX.utils.book_append_sheet(wb, abaFornecedores(params), 'Fornecedores');
  return wb;
}

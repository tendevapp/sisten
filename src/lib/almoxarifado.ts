/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { localDb } from '../db/localDb';
import { EstoqueItem, EstoqueAnalise, EnrichedSAPRecord } from '../types';

export type ClasseAbc = 'A' | 'B' | 'C';

/**
 * Cor das classes ABC em contexto CSS (badge, ponto de legenda).
 *
 * A/B/C é escala *ordinal*, não categórica: a ordem carrega significado. O
 * verde/âmbar/cinza anterior tomava emprestado o vocabulário de status e lia
 * como "A é bom, C é ruim" — C é só barato. Agora é uma rampa de um matiz só,
 * do passo mais forte (A) ao mais fraco (C), validada nos dois temas.
 *
 * Em SVG do Recharts `var()` não resolve em atributo: lá use `useChartTokens().abc`.
 */
export const CLASSE_ABC_COR: Record<ClasseAbc, string> = {
  A: 'var(--abc-a)',
  B: 'var(--abc-b)',
  C: 'var(--abc-c)',
};

/**
 * Verifica se um código de material pertence a item de projeto
 * (códigos que começam com 100000, ignorando zeros à esquerda).
 */
export function isProjetoItem(materialCode?: string | null): boolean {
  if (!materialCode || materialCode === '—') return false;
  const clean = materialCode.trim().replace(/^0+/, '');
  return clean.startsWith('100000') || materialCode.trim().startsWith('100000');
}

// Normaliza códigos de material ignorando zeros à esquerda, para que o mesmo
// material escrito '01433206' e '1433206' seja tratado como um só.
export const normalizeCode = (c: any): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

// Os formatadores moram em lib/format.ts (instâncias de Intl reaproveitadas).
// Reexportados aqui para não quebrar os imports existentes.
export { formatBRL, formatBRLCompacto, formatQtd, formatInt, formatPct, formatDateBR, formatDateTimeBR } from './format';

/**
 * Classifica cada material em A, B ou C pelo valor imobilizado acumulado:
 * A até 80% do valor, B até 95%, C o resto.
 *
 * Recebe sempre a posição INTEIRA, nunca o subconjunto filtrado. Se a classe
 * fosse recalculada sobre o filtro, um material classe A viraria C ao filtrar
 * por um depósito onde ele tem pouco saldo, e a letra deixaria de significar
 * algo estável.
 */
export function classifyABC(itens: EstoqueItem[]): Map<string, ClasseAbc> {
  const porMaterial = new Map<string, number>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    porMaterial.set(mat, (porMaterial.get(mat) || 0) + (i.valor_total || 0));
  });

  const total = Array.from(porMaterial.values()).reduce((a, b) => a + b, 0);
  const mapa = new Map<string, ClasseAbc>();
  if (total <= 0) {
    porMaterial.forEach((_, mat) => mapa.set(mat, 'C'));
    return mapa;
  }

  const ordenado = Array.from(porMaterial.entries()).sort((a, b) => b[1] - a[1]);
  let acumulado = 0;
  ordenado.forEach(([mat, valor]) => {
    acumulado += valor;
    const pct = acumulado / total;
    mapa.set(mat, pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C');
  });
  return mapa;
}

export interface Agregado {
  chave: string;
  itens: number;
  materiais: number;
  valor: number;
  quantidade: number;
}

// Agregação genérica por um campo textual, usada pelos painéis de depósito,
// tipo, classe de item, grupo de mercadoria e aplicação.
export function agregarPor(
  itens: EstoqueItem[],
  campo: keyof EstoqueItem,
  rotuloVazio = 'Não informado'
): Agregado[] {
  const mapa = new Map<string, { itens: number; materiais: Set<string>; valor: number; quantidade: number }>();
  itens.forEach(i => {
    const bruto = i[campo];
    const chave = String(bruto ?? '').trim() || rotuloVazio;
    let atual = mapa.get(chave);
    if (!atual) {
      atual = { itens: 0, materiais: new Set<string>(), valor: 0, quantidade: 0 };
      mapa.set(chave, atual);
    }
    atual.itens += 1;
    const mat = normalizeCode(i.material);
    if (mat) atual.materiais.add(mat);
    atual.valor += i.valor_total || 0;
    atual.quantidade += i.quantidade || 0;
  });
  return Array.from(mapa.entries())
    .map(([chave, v]) => ({ chave, itens: v.itens, materiais: v.materiais.size, valor: v.valor, quantidade: v.quantidade }))
    .sort((a, b) => b.valor - a.valor);
}

// Top N por valor, somando o restante numa linha "Outros". Sem isso, um gráfico
// de 113 grupos de mercadoria vira ruído ilegível.
export function topN(agregados: Agregado[], n: number, rotuloResto = 'Outros'): Agregado[] {
  if (agregados.length <= n) return agregados;
  const topo = agregados.slice(0, n);
  const resto = agregados.slice(n);
  const somaResto: Agregado = {
    chave: rotuloResto,
    itens: resto.reduce((a, r) => a + r.itens, 0),
    materiais: resto.reduce((a, r) => a + r.materiais, 0),
    valor: resto.reduce((a, r) => a + r.valor, 0),
    quantidade: resto.reduce((a, r) => a + r.quantidade, 0),
  };
  return [...topo, somaResto];
}

export interface EstoqueKpi {
  valor: number;
  materiais: number;
  itens: number;
  depositos: number;
  dataPosicao: string | null;
}

export function calcularKpis(itens: EstoqueItem[]): EstoqueKpi {
  const materiais = new Set<string>();
  const depositos = new Set<string>();
  let valor = 0;
  let dataPosicao = localDb.getDatasetUpdatedAt('estoque') || '';
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (mat) materiais.add(mat);
    const dep = String(i.deposito ?? '').trim();
    if (dep) depositos.add(dep);
    valor += i.valor_total || 0;
    if (!dataPosicao && i.imported_at && i.imported_at > dataPosicao) dataPosicao = i.imported_at;
  });
  return {
    valor,
    materiais: materiais.size,
    itens: itens.length,
    depositos: depositos.size,
    dataPosicao: dataPosicao || null,
  };
}

export interface AbcResumo {
  classe: ClasseAbc;
  materiais: number;
  valor: number;
  pctValor: number;
  pctAcumulado: number;
}

// Resume as três classes para o gráfico de Pareto. `mapa` vem de classifyABC
// sobre a posição inteira; `itens` pode estar filtrado.
export function resumirAbc(itens: EstoqueItem[], mapa: Map<string, ClasseAbc>): AbcResumo[] {
  const base: Record<ClasseAbc, { materiais: Set<string>; valor: number }> = {
    A: { materiais: new Set(), valor: 0 },
    B: { materiais: new Set(), valor: 0 },
    C: { materiais: new Set(), valor: 0 },
  };
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const classe = mapa.get(mat) || 'C';
    base[classe].materiais.add(mat);
    base[classe].valor += i.valor_total || 0;
  });
  const total = base.A.valor + base.B.valor + base.C.valor;
  let acumulado = 0;
  return (['A', 'B', 'C'] as ClasseAbc[]).map(classe => {
    acumulado += base[classe].valor;
    return {
      classe,
      materiais: base[classe].materiais.size,
      valor: base[classe].valor,
      pctValor: total > 0 ? (base[classe].valor / total) * 100 : 0,
      pctAcumulado: total > 0 ? (acumulado / total) * 100 : 0,
    };
  });
}

export interface CompraEvitavel {
  material: string;
  descricao: string;
  saldo: number;
  umb: string;
  valorEstoque: number;
  rms: string[];
  qtdSolicitada: number;
}

/**
 * Materiais que têm saldo em estoque e, ao mesmo tempo, requisição de compra
 * aberta. Cada linha é uma compra que talvez não precise acontecer.
 *
 * "Aberta" é `status_requisicao === 'Sem PO'`, o mesmo conceito que o Painel SAP
 * usa. As requisições vêm de `localDb.getEnrichedSAPRequisicoes()`, cujo cache
 * cobre 2026 em diante — o que é adequado, já que RM aberta é recente por
 * definição.
 */
export function acharCompraEvitavel(
  itens: EstoqueItem[],
  requisicoes: EnrichedSAPRecord[]
): CompraEvitavel[] {
  const saldoPorMaterial = new Map<string, { saldo: number; valor: number; descricao: string; umb: string }>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const qtd = i.quantidade || 0;
    let atual = saldoPorMaterial.get(mat);
    if (!atual) {
      atual = { saldo: 0, valor: 0, descricao: i.txt_breve_material || '', umb: i.umb || '' };
      saldoPorMaterial.set(mat, atual);
    }
    atual.saldo += qtd;
    atual.valor += i.valor_total || 0;
    if (!atual.descricao && i.txt_breve_material) atual.descricao = i.txt_breve_material;
    if (!atual.umb && i.umb) atual.umb = i.umb;
  });

  const porMaterial = new Map<string, CompraEvitavel>();
  requisicoes.forEach(r => {
    if (r.status_requisicao !== 'Sem PO') return;
    const mat = normalizeCode(r.material_code);
    if (!mat) return;
    const estoque = saldoPorMaterial.get(mat);
    if (!estoque || estoque.saldo <= 0) return;

    let atual = porMaterial.get(mat);
    if (!atual) {
      atual = {
        material: mat,
        descricao: estoque.descricao || r.texto_breve || '',
        saldo: estoque.saldo,
        umb: estoque.umb,
        valorEstoque: estoque.valor,
        rms: [],
        qtdSolicitada: 0,
      };
      porMaterial.set(mat, atual);
    }
    if (r.requisicao_de_compra && !atual.rms.includes(r.requisicao_de_compra)) {
      atual.rms.push(r.requisicao_de_compra);
    }
    atual.qtdSolicitada += r.qtd_requisicao || 0;
  });

  return Array.from(porMaterial.values()).sort((a, b) => b.valorEstoque - a.valorEstoque);
}

export interface DivergenciaPmm {
  material: string;
  descricao: string;
  pmm: number;
  ultimoPreco: number;
  variacao: number;
  dataUltimaCompra: string | null;
  fornecedor: string | null;
  valorEstoque: number;
}

/**
 * Materiais cujo último preço pago se afasta do PMM além da tolerância.
 *
 * Acima da faixa indica PMM subavaliado: o estoque está contabilizado abaixo do
 * custo de reposição. Abaixo indica PMM inflado por compra antiga cara.
 * `variacao` é a fração assinada — 0,35 significa 35% acima do PMM.
 */
export function acharDivergenciaPmm(
  itens: EstoqueItem[],
  analise: EstoqueAnalise[],
  tolerancia = 0.2
): DivergenciaPmm[] {
  const analisePorMaterial = new Map<string, EstoqueAnalise>();
  analise.forEach(a => {
    const mat = normalizeCode(a.material);
    if (mat) analisePorMaterial.set(mat, a);
  });

  const porMaterial = new Map<string, { pmm: number; descricao: string; valor: number }>();
  itens.forEach(i => {
    const mat = normalizeCode(i.material);
    if (!mat) return;
    const pmm = i.preco_medio || 0;
    let atual = porMaterial.get(mat);
    if (!atual) {
      atual = { pmm, descricao: i.txt_breve_material || '', valor: 0 };
      porMaterial.set(mat, atual);
    }
    // O PMM é do material, não da linha: com o mesmo material em vários
    // depósitos, todas as linhas repetem o valor. Guardar o maior evita que uma
    // linha com PMM zerado apague o preço válido das outras.
    if (pmm > atual.pmm) atual.pmm = pmm;
    atual.valor += i.valor_total || 0;
  });

  const resultado: DivergenciaPmm[] = [];
  porMaterial.forEach((dados, mat) => {
    if (dados.pmm <= 0) return;
    const a = analisePorMaterial.get(mat);
    const ultimo = a?.ultimo_preco_unit;
    if (ultimo === undefined || ultimo === null || !(ultimo > 0)) return;
    const variacao = (ultimo - dados.pmm) / dados.pmm;
    if (Math.abs(variacao) < tolerancia) return;
    resultado.push({
      material: mat,
      descricao: dados.descricao,
      pmm: dados.pmm,
      ultimoPreco: ultimo,
      variacao,
      dataUltimaCompra: a?.data_ultima_compra ?? null,
      fornecedor: a?.ultimo_fornecedor ?? null,
      valorEstoque: dados.valor,
    });
  });

  // Maior desvio primeiro: é o que exige revisão de valoração antes.
  return resultado.sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao));
}

export interface LacunaCadastro {
  rotulo: string;
  campo: keyof EstoqueItem;
  itens: number;
  valor: number;
}

// Campos que o almoxarifado precisa preenchidos para classificar e controlar o
// item. Governança de estoque começa aqui: sem classe e sem grupo, o item não
// entra em nenhuma política de reposição.
export function acharLacunasCadastro(itens: EstoqueItem[]): LacunaCadastro[] {
  const definicoes: { rotulo: string; campo: keyof EstoqueItem; vazio: (i: EstoqueItem) => boolean }[] = [
    { rotulo: 'Sem classe de item', campo: 'class_item', vazio: i => !String(i.class_item ?? '').trim() },
    { rotulo: 'Sem grupo de mercadoria', campo: 'grupo_mercadorias', vazio: i => !String(i.grupo_mercadorias ?? '').trim() },
    { rotulo: 'Sem preço médio', campo: 'preco_medio', vazio: i => !((i.preco_medio || 0) > 0) },
  ];
  return definicoes.map(d => {
    const atingidos = itens.filter(d.vazio);
    return {
      rotulo: d.rotulo,
      campo: d.campo,
      itens: atingidos.length,
      valor: atingidos.reduce((a, i) => a + (i.valor_total || 0), 0),
    };
  });
}

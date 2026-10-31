/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Análise de Inventário Cíclico — regras puras.
 *
 * Lê os inventários já gravados (`listarInventarios`) e responde: o estoque
 * está batendo com o sistema? onde erra mais? quanto vale o erro? o que ainda
 * não foi contado?
 *
 * Duas origens convivem na base:
 * - SISTEN: contagem cega feita no formulário; `diferenca` = físico − saldo e
 *   o valor do erro não é gravado (estimado pelo preço médio da ZL0024);
 * - Histórico importado (`dados_origem`): a planilha de papel, que já traz
 *   "Valor Divergente" em R$ e o nº de contagens feitas. O sinal de
 *   "Diferença" da planilha é o que vale para falta/sobra.
 *
 * Acuracidade = itens conferidos ÷ itens encerrados (mesma conta da tela do
 * inventário). Item pendente ou aguardando decisão não entra: ainda não tem
 * resultado.
 *
 * Valor do erro, faltas e sobras contam só os itens que terminaram
 * DIVERGENTES. O histórico importado traz itens que a planilha fechou como
 * "OK" mas com "Diferença" e valor preenchidos (a diferença é contra outra
 * contagem, não contra o saldo); somá-los ao erro o inflaria, então eles
 * ficam à parte, como "conferidos com diferença", para revisão.
 */

import { normalizeCode } from './almoxarifado';
import {
  chaveItem, diasEntre, historicoPorItem, itemEncerrado,
  type HistoricoItem, type ItemInventario,
} from './inventarioCiclico';
import type { EstoqueItem } from '../types';

export type OrigemInventario = 'sisten' | 'historico';

export const ROTULO_ORIGEM: Record<OrigemInventario, string> = {
  sisten: 'SISTEN (contagem cega)',
  historico: 'Histórico importado',
};

/** Rótulo da classe sem curva (histórico importado e itens avulsos do QR). */
export const SEM_CLASSE = 'Sem classe';

/** Inventário como a tela o recebe — só os campos de que a análise precisa. */
export interface InventarioAnalise {
  id: string;
  codigo: string;
  data: string;
  criterio: string | null;
  itens: ItemInventario[];
}

/** Uma linha por item de inventário, já com o que a análise precisa. */
export interface LinhaAnalise {
  causa?: string | null;
  causaDetalhe?: string | null;
  chave: string;
  inventarioId: string;
  inventario: string;
  data: string;
  origem: OrigemInventario;
  material: string;
  descricao: string;
  deposito: string;
  classe: string;
  status: ItemInventario['status'];
  encerrado: boolean;
  saldo: number | null;
  contado: number | null;
  diferenca: number | null;
  /** Valor absoluto do erro em R$; `null` quando não há como calcular. */
  valor: number | null;
  /** `true` quando o valor foi estimado pelo preço médio atual (não veio da planilha). */
  valorEstimado: boolean;
  /** Contagens feitas até encerrar (o histórico informa o nº pela planilha). */
  contagens: number;
  /** Encerrou na 1ª contagem e bateu. */
  acertouNaPrimeira: boolean;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Achata os inventários em linhas. `precoPorMaterial` (preço médio da ZL0024,
 * por código normalizado) só serve para estimar o valor dos itens SISTEN.
 */
export function linhasAnalise(
  inventarios: InventarioAnalise[],
  precoPorMaterial: Map<string, number> = new Map(),
): LinhaAnalise[] {
  const linhas: LinhaAnalise[] = [];
  for (const inv of inventarios) {
    for (const item of inv.itens) {
      const origemDados = item.dados_origem ?? null;
      const origem: OrigemInventario = origemDados ? 'historico' : 'sisten';
      const encerrado = itemEncerrado(item);
      const diferenca = item.diferenca ?? null;

      let valor: number | null = null;
      let valorEstimado = false;
      const valorPlanilha = origemDados ? numero(origemDados['Valor Divergente']) : null;
      if (valorPlanilha !== null) {
        valor = Math.abs(valorPlanilha);
      } else if (encerrado && diferenca !== null) {
        const preco = precoPorMaterial.get(normalizeCode(item.material));
        if (preco !== undefined) {
          valor = Math.abs(diferenca) * preco;
          valorEstimado = true;
        } else if (diferenca === 0) {
          valor = 0;
        }
      }

      const contagensPlanilha = origemDados ? numero(origemDados['Nº Contagem']) ?? 0 : 0;
      const contagens = Math.max(item.contagens.length, contagensPlanilha);

      linhas.push({
        causa: item.causa_encerramento || [...item.contagens].sort((a, b) => b.numero - a.numero).find(c => c.causa)?.causa || null,
        causaDetalhe: item.causa_encerramento_detalhe || [...item.contagens].sort((a, b) => b.numero - a.numero).find(c => c.causa)?.causa_detalhe || null,
        chave: chaveItem(item.material, item.deposito),
        inventarioId: inv.id,
        inventario: inv.codigo,
        data: inv.data,
        origem,
        material: item.material,
        descricao: item.descricao || '',
        deposito: String(item.deposito ?? '').trim().padStart(4, '0'),
        classe: item.classe || SEM_CLASSE,
        status: item.status,
        encerrado,
        saldo: item.saldo_sistema ?? null,
        contado: item.qtd_final ?? null,
        diferenca,
        valor,
        valorEstimado,
        contagens,
        acertouNaPrimeira: item.status === 'conferido' && contagens <= 1,
      });
    }
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface FiltroAnalise {
  /** AAAA-MM-DD, opcionais. */
  de: string;
  ate: string;
  /** Vazio = todos. */
  depositos: string[];
  /** `''` = todas. */
  classe: string;
  /** `''` = todas. */
  origem: OrigemInventario | '';
}

export const FILTRO_VAZIO: FiltroAnalise = { de: '', ate: '', depositos: [], classe: '', origem: '' };

export function aplicarFiltro(linhas: LinhaAnalise[], f: FiltroAnalise): LinhaAnalise[] {
  const depositos = new Set(f.depositos.map((d) => d.trim().padStart(4, '0')));
  return linhas.filter((l) => {
    const dia = l.data.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (depositos.size > 0 && !depositos.has(l.deposito)) return false;
    if (f.classe && l.classe !== f.classe) return false;
    if (f.origem && l.origem !== f.origem) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export interface ResumoAnalise {
  inventarios: number;
  /** Itens com resultado (conferido ou divergente). */
  encerrados: number;
  conferidos: number;
  divergentes: number;
  /** Ainda sem resultado: pendente ou aguardando decisão. */
  emAberto: number;
  /** % de encerrados que bateram. `null` sem encerrados. */
  acuracidade: number | null;
  /** % de encerrados que bateram já na 1ª contagem. */
  acertoPrimeira: number | null;
  /** Encerrados que precisaram de mais de uma contagem. */
  recontados: number;
  /** Material × depósito distintos contados. */
  itensDistintos: number;
  /** Divergentes: menor que o saldo do sistema. */
  faltas: number;
  /** Divergentes: maior que o saldo do sistema. */
  sobras: number;
  /** Itens fechados como conferidos mas com diferença registrada (ver o cabeçalho do módulo). */
  conferidosComDiferenca: number;
  valorConferidosComDiferenca: number;
  /** Valor do erro dos itens divergentes. */
  valorTotal: number;
  valorFalta: number;
  valorSobra: number;
  /** Parte do valor que veio de estimativa pelo preço médio. */
  valorEstimado: number;
}

export function resumirAnalise(linhas: LinhaAnalise[]): ResumoAnalise {
  const r: ResumoAnalise = {
    inventarios: new Set(linhas.map((l) => l.inventarioId)).size,
    encerrados: 0, conferidos: 0, divergentes: 0, emAberto: 0,
    acuracidade: null, acertoPrimeira: null, recontados: 0,
    itensDistintos: new Set(linhas.map((l) => l.chave)).size,
    faltas: 0, sobras: 0, conferidosComDiferenca: 0, valorConferidosComDiferenca: 0,
    valorTotal: 0, valorFalta: 0, valorSobra: 0, valorEstimado: 0,
  };
  let acertosPrimeira = 0;
  for (const l of linhas) {
    if (!l.encerrado) { r.emAberto += 1; continue; }
    r.encerrados += 1;
    if (l.status === 'conferido') r.conferidos += 1; else r.divergentes += 1;
    if (l.acertouNaPrimeira) acertosPrimeira += 1;
    if (l.contagens > 1) r.recontados += 1;
    if (l.diferenca === null || l.diferenca === 0) continue;
    const v = l.valor ?? 0;
    if (l.status === 'conferido') {
      r.conferidosComDiferenca += 1;
      r.valorConferidosComDiferenca += v;
      continue;
    }
    if (l.diferenca < 0) { r.faltas += 1; r.valorFalta += v; } else { r.sobras += 1; r.valorSobra += v; }
    r.valorTotal += v;
    if (l.valorEstimado) r.valorEstimado += v;
  }
  if (r.encerrados > 0) {
    r.acuracidade = (r.conferidos / r.encerrados) * 100;
    r.acertoPrimeira = (acertosPrimeira / r.encerrados) * 100;
  }
  return r;
}

export interface GrupoAnalise {
  chave: string;
  encerrados: number;
  conferidos: number;
  divergentes: number;
  acuracidade: number | null;
  valor: number;
}

function agrupar(linhas: LinhaAnalise[], chaveDe: (l: LinhaAnalise) => string): GrupoAnalise[] {
  const mapa = new Map<string, GrupoAnalise>();
  for (const l of linhas) {
    if (!l.encerrado) continue;
    const chave = chaveDe(l);
    const g = mapa.get(chave) ?? { chave, encerrados: 0, conferidos: 0, divergentes: 0, acuracidade: null, valor: 0 };
    g.encerrados += 1;
    if (l.status === 'conferido') g.conferidos += 1; else g.divergentes += 1;
    if (l.status === 'divergente' && l.diferenca !== null && l.diferenca !== 0) g.valor += l.valor ?? 0;
    mapa.set(chave, g);
  }
  return [...mapa.values()].map((g) => ({ ...g, acuracidade: (g.conferidos / g.encerrados) * 100 }));
}

/** Um ponto por dia de inventário, em ordem cronológica. */
export function porDia(linhas: LinhaAnalise[]): GrupoAnalise[] {
  return agrupar(linhas, (l) => l.data.slice(0, 10)).sort((a, b) => a.chave.localeCompare(b.chave));
}

/** Um ponto por depósito, o de mais itens primeiro. */
export function porDeposito(linhas: LinhaAnalise[]): GrupoAnalise[] {
  return agrupar(linhas, (l) => l.deposito).sort((a, b) => b.encerrados - a.encerrados || a.chave.localeCompare(b.chave));
}

const ORDEM_CLASSE: Record<string, number> = { A: 0, B: 1, C: 2 };

/** Classes A, B, C e, por último, "Sem classe". */
export function porClasse(linhas: LinhaAnalise[]): GrupoAnalise[] {
  return agrupar(linhas, (l) => l.classe).sort((a, b) => (ORDEM_CLASSE[a.chave] ?? 9) - (ORDEM_CLASSE[b.chave] ?? 9));
}

const porValorDepoisQuantidade = (a: LinhaAnalise, b: LinhaAnalise) =>
  (b.valor ?? -1) - (a.valor ?? -1) || Math.abs(b.diferenca!) - Math.abs(a.diferenca!);

/** Itens que terminaram divergentes, do maior valor para o menor (sem valor: pela quantidade). */
export function maioresDivergencias(linhas: LinhaAnalise[], limite = 15): LinhaAnalise[] {
  return linhas
    .filter((l) => l.status === 'divergente' && l.diferenca !== null && l.diferenca !== 0)
    .sort(porValorDepoisQuantidade)
    .slice(0, limite);
}

/** Itens fechados como conferidos mas com diferença registrada, os de maior valor primeiro. */
export function conferidosComDiferenca(linhas: LinhaAnalise[], limite = 15): LinhaAnalise[] {
  return linhas
    .filter((l) => l.status === 'conferido' && l.diferenca !== null && l.diferenca !== 0)
    .sort(porValorDepoisQuantidade)
    .slice(0, limite);
}

export interface Reincidente {
  chave: string;
  material: string;
  descricao: string;
  deposito: string;
  /** Inventários (dias) distintos em que o item foi contado. */
  vezesContado: number;
  vezesDivergiu: number;
  valor: number;
  ultimaData: string;
}

/** Itens que terminaram divergentes mais de uma vez no recorte, os piores primeiro. */
export function reincidentes(linhas: LinhaAnalise[], minimo = 2): Reincidente[] {
  const mapa = new Map<string, Reincidente & { datas: Set<string> }>();
  for (const l of linhas) {
    if (!l.encerrado) continue;
    const r = mapa.get(l.chave) ?? {
      chave: l.chave, material: l.material, descricao: l.descricao, deposito: l.deposito,
      vezesContado: 0, vezesDivergiu: 0, valor: 0, ultimaData: l.data, datas: new Set<string>(),
    };
    r.datas.add(l.data.slice(0, 10));
    if (l.status === 'divergente') {
      r.vezesDivergiu += 1;
      r.valor += l.valor ?? 0;
    }
    if (l.data > r.ultimaData) r.ultimaData = l.data;
    if (!r.descricao && l.descricao) r.descricao = l.descricao;
    mapa.set(l.chave, r);
  }
  return [...mapa.values()]
    .map(({ datas, ...r }) => ({ ...r, vezesContado: datas.size }))
    .filter((r) => r.vezesDivergiu >= minimo)
    .sort((a, b) => b.vezesDivergiu - a.vezesDivergiu || b.valor - a.valor);
}

// ---------------------------------------------------------------------------
// Cobertura — quanto da ZL0024 já passou por contagem
// ---------------------------------------------------------------------------

export type FaixaIdade = 'ate7' | 'ate30' | 'ate60' | 'mais60' | 'nunca';

export const ROTULO_FAIXA_IDADE: Record<FaixaIdade, string> = {
  ate7: 'Até 7 dias',
  ate30: '8 a 30 dias',
  ate60: '31 a 60 dias',
  mais60: 'Mais de 60 dias',
  nunca: 'Nunca contado',
};

export const ORDEM_FAIXA_IDADE: FaixaIdade[] = ['ate7', 'ate30', 'ate60', 'mais60', 'nunca'];

export function faixaDeIdade(dias: number | null): FaixaIdade {
  if (dias === null) return 'nunca';
  if (dias <= 7) return 'ate7';
  if (dias <= 30) return 'ate30';
  if (dias <= 60) return 'ate60';
  return 'mais60';
}

export interface CoberturaDeposito {
  deposito: string;
  itens: number;
  contados: number;
  pct: number;
  valorEstoque: number;
  valorContado: number;
  pctValor: number;
}

export interface CoberturaAnalise {
  total: number;
  contados: number;
  pct: number;
  valorEstoque: number;
  valorContado: number;
  pctValor: number;
  porDeposito: CoberturaDeposito[];
  /** Itens da ZL0024 por tempo desde a última contagem. */
  idade: { faixa: FaixaIdade; itens: number; valor: number }[];
}

/**
 * Cobertura sobre a posição atual da ZL0024 (material × depósito). Usa TODOS os
 * inventários, não o recorte de datas: o filtro de período responde "o que foi
 * contado neste período", a cobertura responde "o que já foi contado alguma vez".
 */
export function coberturaAnalise(
  estoque: EstoqueItem[],
  inventarios: InventarioAnalise[],
  hojeISO: string,
  depositos: string[] = [],
): CoberturaAnalise {
  const filtro = new Set(depositos.map((d) => d.trim().padStart(4, '0')));
  const historico: Map<string, HistoricoItem> = historicoPorItem(inventarios);

  const itens = new Map<string, { deposito: string; valor: number }>();
  for (const e of estoque) {
    if (!e.material || !e.deposito) continue;
    const deposito = String(e.deposito).trim().padStart(4, '0');
    if (filtro.size > 0 && !filtro.has(deposito)) continue;
    const chave = chaveItem(String(e.material), deposito);
    const atual = itens.get(chave) ?? { deposito, valor: 0 };
    atual.valor += Number(e.valor_total) || 0;
    itens.set(chave, atual);
  }

  const deps = new Map<string, CoberturaDeposito>();
  const idade = new Map<FaixaIdade, { faixa: FaixaIdade; itens: number; valor: number }>(
    ORDEM_FAIXA_IDADE.map((f) => [f, { faixa: f, itens: 0, valor: 0 }]),
  );
  let contados = 0;
  let valorEstoque = 0;
  let valorContado = 0;

  itens.forEach(({ deposito, valor }, chave) => {
    const h = historico.get(chave);
    const d = deps.get(deposito) ?? { deposito, itens: 0, contados: 0, pct: 0, valorEstoque: 0, valorContado: 0, pctValor: 0 };
    d.itens += 1;
    d.valorEstoque += valor;
    valorEstoque += valor;
    if (h) {
      d.contados += 1;
      d.valorContado += valor;
      contados += 1;
      valorContado += valor;
    }
    deps.set(deposito, d);

    const f = idade.get(faixaDeIdade(h ? diasEntre(h.ultimaData, hojeISO) : null))!;
    f.itens += 1;
    f.valor += valor;
  });

  const porDeposito = [...deps.values()]
    .map((d) => ({
      ...d,
      pct: d.itens > 0 ? (d.contados / d.itens) * 100 : 0,
      pctValor: d.valorEstoque > 0 ? (d.valorContado / d.valorEstoque) * 100 : 0,
    }))
    .sort((a, b) => b.itens - a.itens || a.deposito.localeCompare(b.deposito));

  return {
    total: itens.size,
    contados,
    pct: itens.size > 0 ? (contados / itens.size) * 100 : 0,
    valorEstoque,
    valorContado,
    pctValor: valorEstoque > 0 ? (valorContado / valorEstoque) * 100 : 0,
    porDeposito,
    idade: ORDEM_FAIXA_IDADE.map((f) => idade.get(f)!),
  };
}

/** Preço médio (R$/un) por código de material normalizado, da posição da ZL0024. */
export function precosPorMaterial(estoque: EstoqueItem[]): Map<string, number> {
  const soma = new Map<string, { valor: number; qtd: number }>();
  for (const e of estoque) {
    if (!e.material) continue;
    const chave = normalizeCode(e.material);
    const atual = soma.get(chave) ?? { valor: 0, qtd: 0 };
    const qtd = Number(e.quantidade) || 0;
    if (qtd > 0) {
      atual.valor += Number(e.valor_total) || 0;
      atual.qtd += qtd;
    }
    soma.set(chave, atual);
  }
  const precos = new Map<string, number>();
  soma.forEach((v, chave) => { if (v.qtd > 0 && v.valor > 0) precos.set(chave, v.valor / v.qtd); });
  return precos;
}

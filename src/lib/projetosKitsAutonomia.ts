/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — Matriz de Autonomia de Kits por Tramo.
 *
 * Modela a visão operacional da fábrica onde cada torre consome kits específicos
 * em cada tramo:
 *   - Fixadores (parafusos, porcas, arruelas, estojos - Forte Fixadores)
 *   - Plataforma (chapas, alçapão, vigas - Atlanta / Qindao)
 *   - Escada | Avanti (seções de escada, suportes e descansos - Avanti / Atlanta)
 *   - Plataforma Inferior (somente em T1 - Qindao)
 *   - Escada Acesso (somente em T1 - Qindao)
 *
 * Vincula o estoque disponível em almoxarifado com a BOM, diferenciando:
 *   - 0: Não atende (Vermelho - estoque insuficiente para atender a torre)
 *   - 1: Estoque (Verde - estoque em almoxarifado atende a torre)
 *   - 3: Montagem final (Azul - kit na montagem final / pátio)
 *   - 4: Expedido (Preto - marcado manualmente pelo Almoxarifado)
 *
 * Os status 3 e 4 são só manuais — a matriz não lê mais Faturamento
 * (fin_fat_gwjaco) nem Portaria/Expedição (expedicao_tramos). Cada torre
 * mostrada aqui é a torre gravada na célula, não uma reorganização por fila;
 * quem edita decide onde o número aparece.
 */

import { Tramo, TRAMOS } from './projetos';
import type { ArvoreBom, NoBom } from './projetosBom';
import type { SaldosPorItem } from './projetosAutonomia';

export type SubkitId = 'fixadores' | 'plataforma' | 'plataforma_inferior' | 'escada_avanti' | 'escada_acesso';

export type StatusKitAutonomia = 0 | 1 | 3 | 4;

export const ROTULO_STATUS_AUTONOMIA: Record<StatusKitAutonomia, string> = {
  0: 'Não atende',
  1: 'Estoque',
  3: 'Montagem final',
  4: 'Expedido',
};

export const COR_STATUS_AUTONOMIA: Record<StatusKitAutonomia, { bg: string; text: string; border: string }> = {
  0: { bg: '#DC2626', text: '#FFFFFF', border: '#B91C1C' }, // Vermelho vivo
  1: { bg: '#16A34A', text: '#FFFFFF', border: '#15803D' }, // Verde
  3: { bg: '#0284C7', text: '#FFFFFF', border: '#0369A1' }, // Azul Montagem final
  4: { bg: '#09090B', text: '#FFFFFF', border: '#000000' }, // Preto Expedido
};

export interface SubkitDef {
  id: SubkitId;
  rotulo: string;
  ordem: number;
}

export const SUBKITS: Record<SubkitId, SubkitDef> = {
  fixadores: { id: 'fixadores', rotulo: 'Fixadores', ordem: 1 },
  plataforma: { id: 'plataforma', rotulo: 'Plataforma', ordem: 2 },
  plataforma_inferior: { id: 'plataforma_inferior', rotulo: 'Plataforma Inferior', ordem: 3 },
  escada_avanti: { id: 'escada_avanti', rotulo: 'Escada | Avanti', ordem: 4 },
  escada_acesso: { id: 'escada_acesso', rotulo: 'Escada Acesso', ordem: 5 },
};

/**
 * T5 a T2 têm 3 sub-kits: Fixadores, Plataforma, Escada | Avanti.
 * T1 tem ainda Plataforma Inferior e Escada de Acesso.
 */
export const SUBKITS_POR_TRAMO: Record<Tramo, SubkitId[]> = {
  T5: ['fixadores', 'plataforma', 'escada_avanti'],
  T4: ['fixadores', 'plataforma', 'escada_avanti'],
  T3: ['fixadores', 'plataforma', 'escada_avanti'],
  T2: ['fixadores', 'plataforma', 'escada_avanti'],
  T1: ['fixadores', 'plataforma', 'plataforma_inferior', 'escada_avanti', 'escada_acesso'],
};

/** A Plataforma Inferior é uma frente própria apenas no T1. */
function pertenceAoSubkit(no: NoBom, tramo: Tramo, subkit: SubkitId): boolean {
  const ehPlataformaInferiorT1 = tramo === 'T1' && no.grupoNorm === 'PLATAFORMA INFERIOR';

  if (subkit === 'plataforma_inferior') return ehPlataformaInferiorT1;
  if (ehPlataformaInferiorT1) return false;

  return classificarItemSubkit(no) === subkit;
}

/**
 * Classifica uma folha da BOM para o seu respectivo sub-kit interno.
 * Devolve `null` se a peça for de outros grupos não-kitted (ex: estrutural de chapas, virolas).
 */
export function classificarItemSubkit(item: {
  grupoNorm?: string | null;
  grupo?: string | null;
  fornecedor?: string | null;
  description?: string | null;
  descricao?: string | null;
}): SubkitId | null {
  const grupoNorm = (item.grupoNorm ?? item.grupo ?? '').toUpperCase().trim();
  const fornecedor = (item.fornecedor ?? '').toUpperCase().trim();

  // Escada de Acesso é específica de T1
  if (grupoNorm.includes('ESCADA DE ACESSO')) {
    return 'escada_acesso';
  }

  // Forte Fixadores fornece os parafusos/porcas/arruelas do kit de fixadores
  if (fornecedor.includes('FORTE FIXADORES')) {
    return 'fixadores';
  }

  // Avanti fornece as escadas e descansos; grupos ESCADA que não sejam Forte Fixadores também
  if (fornecedor.includes('AVANTI') || (grupoNorm.includes('ESCADA') && !fornecedor.includes('FORTE FIXADORES'))) {
    return 'escada_avanti';
  }

  // Plataformas (superior, média, inferior)
  if (grupoNorm.includes('PLATAFORMA')) {
    return 'plataforma';
  }

  return null;
}

export interface ItemComposicaoKit {
  partNumberNorm: string;
  partNumber: string;
  codSap: string | null;
  descricao: string;
  uom: string;
  fornecedor: string;
  qtdPorTorre: number;
  saldoEstoque: number;
  kitsCobertos: number;
  isGargalo: boolean;
}

export interface ComposicaoSubkit {
  tramo: Tramo;
  subkit: SubkitId;
  subkitRotulo: string;
  itens: ItemComposicaoKit[];
  totalItens: number;
  totalPecasPorKit: number;
  autonomiaMaxima: number;
  gargalo: ItemComposicaoKit | null;
}

/**
 * Obtém a composição detalhada de um sub-kit segundo a BOM, cruzando com os saldos atuais de estoque.
 */
export function obterComposicaoSubkit(
  arvore: ArvoreBom,
  tramo: Tramo,
  subkit: SubkitId,
  saldos: SaldosPorItem,
): ComposicaoSubkit {
  // Consolida as folhas daquele tramo pertencentes àquele sub-kit
  const acumuladoPorPn = new Map<string, {
    partNumberNorm: string;
    partNumber: string;
    codSap: string | null;
    descricao: string;
    uom: string;
    fornecedor: string;
    qtdPorTorre: number;
  }>();

  for (const no of arvore.nos) {
    if (!no.folha || no.tramo !== tramo || !no.partNumberNorm || !no.qtdPorTorre) continue;
    if (!pertenceAoSubkit(no, tramo, subkit)) continue;

    const atual = acumuladoPorPn.get(no.partNumberNorm);
    if (atual) {
      atual.qtdPorTorre += no.qtdPorTorre;
    } else {
      acumuladoPorPn.set(no.partNumberNorm, {
        partNumberNorm: no.partNumberNorm,
        partNumber: no.partNumber,
        codSap: no.codSap,
        descricao: no.descricao || no.description,
        uom: no.uom || 'UN',
        fornecedor: no.fornecedor,
        qtdPorTorre: no.qtdPorTorre,
      });
    }
  }

  let menorCobertura = Infinity;

  const itensCalculados = Array.from(acumuladoPorPn.values()).map((item) => {
    const saldo = saldos.get(item.partNumberNorm) ?? saldos.get(item.partNumber) ?? 0;
    const kitsCobertos = item.qtdPorTorre > 0 ? Math.floor(saldo / item.qtdPorTorre) : 9999;
    if (kitsCobertos < menorCobertura) {
      menorCobertura = kitsCobertos;
    }
    return {
      ...item,
      saldoEstoque: saldo,
      kitsCobertos,
      isGargalo: false,
    };
  });

  const autonomiaMaxima = itensCalculados.length > 0 ? Math.max(0, menorCobertura) : 0;

  // Marca os gargalos e ordena por criticidade (menor cobertura primeiro)
  const itens = itensCalculados.map((i) => ({
    ...i,
    isGargalo: i.kitsCobertos === autonomiaMaxima,
  })).sort((a, b) => a.kitsCobertos - b.kitsCobertos || b.qtdPorTorre - a.qtdPorTorre || a.partNumber.localeCompare(b.partNumber));

  return {
    tramo,
    subkit,
    subkitRotulo: SUBKITS[subkit].rotulo,
    itens,
    totalItens: itens.length,
    totalPecasPorKit: itens.reduce((s, i) => s + i.qtdPorTorre, 0),
    autonomiaMaxima: Number.isFinite(autonomiaMaxima) ? autonomiaMaxima : 0,
    gargalo: itens.find((i) => i.isGargalo) ?? null,
  };
}

export interface CelulaMatriz {
  torreNumero: number;
  tramo: Tramo;
  subkit: SubkitId;
  status: StatusKitAutonomia;
  serie: string | null;
  isManual: boolean;
  autonomiaEstoque: number;
  gargaloPn: string | null;
}

export interface MatrizAutonomiaResultado {
  celulas: Map<string, CelulaMatriz>;
  composicoes: Map<string, ComposicaoSubkit>;
  semanasPorTorre: Map<number, string>;
  torresDisponiveis: number[];
}

export interface RegistroMatrizBanco {
  torre_numero: number;
  tramo: string;
  subkit: string;
  status: number;
  serie?: string | null;
  observacao?: string | null;
}

export interface RegistroPlanejamentoBanco {
  torre_numero: number;
  semana?: string | null;
  data_alvo?: string | null;
}

/**
 * Calcula a matriz de autonomia cruzando:
 * 1. Dados gravados no banco (status/série manuais e semanas de planejamento)
 * 2. Composição da BOM por sub-kit
 * 3. Saldo físico em estoque do almoxarifado
 *
 * Célula sem gravação manual é automática (0 ou 1) pela capacidade de
 * estoque. Com gravação manual, o status e a série exibidos são exatamente
 * os gravados naquela torre — sem cruzar com Faturamento ou Portaria.
 */
export function calcularMatrizAutonomia(params: {
  arvore: ArvoreBom;
  saldos: SaldosPorItem;
  torresTotais: number;
  registrosBanco?: RegistroMatrizBanco[];
  planejamentosBanco?: RegistroPlanejamentoBanco[];
}): MatrizAutonomiaResultado {
  const {
    arvore,
    saldos,
    torresTotais,
    registrosBanco = [],
    planejamentosBanco = [],
  } = params;

  const totalTorres = Math.max(12, torresTotais || 12);
  const torresDisponiveis = Array.from({ length: totalTorres }, (_, i) => i + 1);

  // Mapa de planejamentos por torre (ex: W36, W37)
  const semanasPorTorre = new Map<number, string>();
  for (const p of planejamentosBanco) {
    if (p.semana) semanasPorTorre.set(p.torre_numero, p.semana);
  }

  // Mapa de registros gravados manualmente, por torre::tramo::subkit
  const gravados = new Map<string, RegistroMatrizBanco>();
  for (const r of registrosBanco) {
    gravados.set(`${r.torre_numero}::${r.tramo}::${r.subkit}`, r);
  }

  // Calcula a composição e autonomia máxima de cada sub-kit
  const composicoes = new Map<string, ComposicaoSubkit>();
  for (const tramo of TRAMOS) {
    for (const subkit of SUBKITS_POR_TRAMO[tramo]) {
      const comp = obterComposicaoSubkit(arvore, tramo, subkit, saldos);
      composicoes.set(`${tramo}::${subkit}`, comp);
    }
  }

  const celulas = new Map<string, CelulaMatriz>();

  // Para cada sub-kit de cada tramo, avalia torre a torre
  for (const tramo of TRAMOS) {
    for (const subkit of SUBKITS_POR_TRAMO[tramo]) {
      const chaveSubkit = `${tramo}::${subkit}`;
      const comp = composicoes.get(chaveSubkit)!;
      const autonomiaEstoque = comp.autonomiaMaxima;

      // Conta quantas torres já foram atendidas por estoque disponível
      let torresAtendidasPorEstoque = 0;

      for (const torreNumero of torresDisponiveis) {
        const chaveCelula = `${torreNumero}::${tramo}::${subkit}`;
        const gravado = gravados.get(chaveCelula);

        if (gravado) {
          const serie = gravado.serie ? gravado.serie.trim() : null;
          // Sem número de série física, status 4 (Expedido) não se
          // sustenta — evita célula preta vazia.
          const status: StatusKitAutonomia = gravado.status === 4 && !serie
            ? 3
            : (gravado.status as StatusKitAutonomia);

          celulas.set(chaveCelula, {
            torreNumero,
            tramo,
            subkit,
            status,
            serie,
            isManual: true,
            autonomiaEstoque,
            gargaloPn: comp.gargalo?.partNumber ?? null,
          });
        } else {
          // Determina automaticamente com base na capacidade do estoque
          // Se ainda temos saldo para cobrir mais uma torre na fila:
          let status: StatusKitAutonomia = 0;
          if (torresAtendidasPorEstoque < autonomiaEstoque) {
            status = 1; // 1: Estoque
            torresAtendidasPorEstoque += 1;
          } else {
            status = 0; // 0: Não atende
          }

          celulas.set(chaveCelula, {
            torreNumero,
            tramo,
            subkit,
            status,
            serie: null,
            isManual: false,
            autonomiaEstoque,
            gargaloPn: comp.gargalo?.partNumber ?? null,
          });
        }
      }
    }
  }

  return {
    celulas,
    composicoes,
    semanasPorTorre,
    torresDisponiveis,
  };
}


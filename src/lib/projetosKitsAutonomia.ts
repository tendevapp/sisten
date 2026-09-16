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
 *   - Escada Acesso (somente em T1 - Qindao)
 *
 * Vincula o estoque disponível em almoxarifado com a BOM, diferenciando:
 *   - 0: Não atende (Vermelho - estoque insuficiente para atender a torre)
 *   - 1: Estoque (Verde - estoque em almoxarifado atende a torre)
 *   - 3: OK Pátio (Azul - kits pagos da pré-montagem para a produção)
 *   - 4: Expedido (Laranja - tramo expedido com série física)
 *   - 5: Saída Portaria (Preto - tramos que já saíram da portaria da fábrica)
 */

import { Tramo, TRAMOS } from './projetos';
import type { ArvoreBom, NoBom } from './projetosBom';
import type { SaldosPorItem } from './projetosAutonomia';

export type SubkitId = 'fixadores' | 'plataforma' | 'escada_avanti' | 'escada_acesso';

export type StatusKitAutonomia = 0 | 1 | 3 | 4 | 5;

export const ROTULO_STATUS_AUTONOMIA: Record<StatusKitAutonomia, string> = {
  0: 'Não atende',
  1: 'Estoque',
  3: 'OK Pátio',
  4: 'Faturado',
  5: 'Saída Portaria',
};

export const COR_STATUS_AUTONOMIA: Record<StatusKitAutonomia, { bg: string; text: string; border: string }> = {
  0: { bg: '#DC2626', text: '#FFFFFF', border: '#B91C1C' }, // Vermelho vivo
  1: { bg: '#16A34A', text: '#FFFFFF', border: '#15803D' }, // Verde
  3: { bg: '#0284C7', text: '#FFFFFF', border: '#0369A1' }, // Azul Pátio
  4: { bg: '#EA580C', text: '#FFFFFF', border: '#C2410C' }, // Laranja Faturado (GW Jacobina)
  5: { bg: '#09090B', text: '#FFFFFF', border: '#000000' }, // Preto Saída Portaria
};

export interface SubkitDef {
  id: SubkitId;
  rotulo: string;
  ordem: number;
}

export const SUBKITS: Record<SubkitId, SubkitDef> = {
  fixadores: { id: 'fixadores', rotulo: 'Fixadores', ordem: 1 },
  plataforma: { id: 'plataforma', rotulo: 'Plataforma', ordem: 2 },
  escada_avanti: { id: 'escada_avanti', rotulo: 'Escada | Avanti', ordem: 3 },
  escada_acesso: { id: 'escada_acesso', rotulo: 'Escada Acesso', ordem: 4 },
};

/**
 * T5 a T2 têm 3 sub-kits: Fixadores, Plataforma, Escada | Avanti.
 * T1 tem os 3 mais a Escada de Acesso.
 */
export const SUBKITS_POR_TRAMO: Record<Tramo, SubkitId[]> = {
  T5: ['fixadores', 'plataforma', 'escada_avanti'],
  T4: ['fixadores', 'plataforma', 'escada_avanti'],
  T3: ['fixadores', 'plataforma', 'escada_avanti'],
  T2: ['fixadores', 'plataforma', 'escada_avanti'],
  T1: ['fixadores', 'plataforma', 'escada_avanti', 'escada_acesso'],
};

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
    const classificado = classificarItemSubkit(no);
    if (classificado !== subkit) continue;

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
  origemExpedicao?: boolean;
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

export interface RegistroTramoExpedicao {
  numero_tramo: string;
  tramo?: string | null;
  data_expedicao?: string | null;
  hora_expedicao?: string | null;
}

export interface RegistroTramoFisico {
  torre_numero: number;
  tramo: string;
  serie: number | string;
}

export interface RegistroFaturamentoGwjaco {
  torre_numero: number;
  tramo: string;
  serie?: number | string | null;
  nota_fiscal?: string | null;
  data_faturado?: string | null;
  semana_faturamento?: number | null;
}

/**
 * Calcula a matriz de autonomia cruzando:
 * 1. Dados gravados no banco (semanas de planejamento e overrides/apontamentos)
 * 2. Composição da BOM por sub-kit
 * 3. Saldo físico em estoque do almoxarifado
 * 4. Faturamento de tramos no GW Jacobina (Laranja - Status 4: Faturado)
 * 5. Tramos lançados no formulário de Logística e Expedição / Portaria (Preto - Status 5: Saída Portaria)
 */
export function calcularMatrizAutonomia(params: {
  arvore: ArvoreBom;
  saldos: SaldosPorItem;
  torresTotais: number;
  registrosBanco?: RegistroMatrizBanco[];
  planejamentosBanco?: RegistroPlanejamentoBanco[];
  tramosFisicos?: RegistroTramoFisico[];
  tramosExpedicao?: RegistroTramoExpedicao[];
  tramosFaturamento?: RegistroFaturamentoGwjaco[];
}): MatrizAutonomiaResultado {
  const {
    arvore,
    saldos,
    torresTotais,
    registrosBanco = [],
    planejamentosBanco = [],
    tramosFisicos = [],
    tramosExpedicao = [],
    tramosFaturamento = [],
  } = params;

  const totalTorres = Math.max(12, torresTotais || 12);
  const torresDisponiveis = Array.from({ length: totalTorres }, (_, i) => i + 1);

  // Mapa de números de série lançados no formulário de expedição/portaria com saída concluída
  const numerosExpedidos = new Set<string>();
  for (const exp of tramosExpedicao) {
    const n = String(exp.numero_tramo || '').trim();
    if (n) {
      numerosExpedidos.add(n);
    }
  }

  // Mapa de tramos faturados no GW Jacobina (por torre+tramo e por série física)
  const faturadosPorTorreTramo = new Map<string, RegistroFaturamentoGwjaco>();
  const faturadosPorSerie = new Map<string, RegistroFaturamentoGwjaco>();
  for (const f of tramosFaturamento) {
    const temFaturamento = Boolean(f.data_faturado || f.nota_fiscal);
    if (temFaturamento) {
      faturadosPorTorreTramo.set(`${f.torre_numero}::${f.tramo}`, f);
      if (f.serie != null) {
        faturadosPorSerie.set(String(f.serie).trim(), f);
      }
    }
  }

  // Mapa de planejamentos por torre (ex: W36, W37)
  const semanasPorTorre = new Map<number, string>();
  for (const p of planejamentosBanco) {
    if (p.semana) semanasPorTorre.set(p.torre_numero, p.semana);
  }

  // Mapa de registros gravados
  const gravados = new Map<string, RegistroMatrizBanco>();
  for (const r of registrosBanco) {
    const chave = `${r.torre_numero}::${r.tramo}::${r.subkit}`;
    gravados.set(chave, r);
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

        // A série física da célula vem estritamente do registro gravado para este sub-kit/torre
        // ou do faturamento gwjaco
        const fatInfo = faturadosPorTorreTramo.get(`${torreNumero}::${tramo}`);
        const serieGravada = gravado?.serie ? gravado.serie.trim() : (fatInfo?.serie != null ? String(fatInfo.serie).trim() : null);

        // Se o número deste tramo específico foi lançado no formulário de expedição/portaria:
        const foiLancadoExpedicao = Boolean(
          serieGravada && numerosExpedidos.has(serieGravada),
        );

        // Se o tramo foi faturado no GW Jacobina (com data_faturado ou nota_fiscal)
        const foiFaturadoGwjaco = Boolean(
          fatInfo || (serieGravada && faturadosPorSerie.has(serieGravada)),
        );

        // Status 5: Saída Portaria (Preto)
        // Só é aplicado se houver número de série física identificado para a peça e
        // ele tiver saído pela portaria (foiLancadoExpedicao) ou foi gravado manualmente como 5 COM número de série.
        // Células sem número de série nunca podem ficar pretas (evita célula preta vazia).
        const ehStatus5 = Boolean(
          serieGravada && (gravado?.status === 5 || foiLancadoExpedicao),
        );

        if (ehStatus5 && serieGravada) {
          celulas.set(chaveCelula, {
            torreNumero,
            tramo,
            subkit,
            status: 5,
            serie: serieGravada,
            isManual: Boolean(gravado),
            autonomiaEstoque,
            gargaloPn: comp.gargalo?.partNumber ?? null,
            origemExpedicao: foiLancadoExpedicao,
          });
        } else if (gravado?.status === 4 || foiFaturadoGwjaco) {
          // Status 4: Faturado (Laranja) - tramos faturados no GW Jacobina
          celulas.set(chaveCelula, {
            torreNumero,
            tramo,
            subkit,
            status: 4,
            serie: serieGravada,
            isManual: Boolean(gravado),
            autonomiaEstoque,
            gargaloPn: comp.gargalo?.partNumber ?? null,
          });
        } else if (gravado) {
          // Se estava gravado como 5 no banco mas não tem série física, rebaixa para 3 (OK Pátio)
          const statusAjustado = gravado.status === 5 && !serieGravada ? 3 : (gravado.status as StatusKitAutonomia);
          celulas.set(chaveCelula, {
            torreNumero,
            tramo,
            subkit,
            status: statusAjustado,
            serie: gravado.serie ?? null,
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
            serie: serieGravada,
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


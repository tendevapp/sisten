/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Financeiro > Estrutura PEP (WBS Element) — parsing e validação de planilha.
 *
 * Suporta planilhas exportadas do SAP com as colunas:
 * - Centro de lucro
 * - Definição do projeto
 * - WBS element (obrigatório)
 * - Name / Nome
 * - Level / Nível
 * - Usuário unidade de medida 1
 * - Moeda
 * - Empresa
 * - Código elemento classificação contábil
 * - Código elemento de faturamento
 * - Status
 * - IFRS15 - OD
 */

import type { FinPepInput } from '../types';

export interface ResultadoParsePep {
  validas: FinPepInput[];
  pendencias: { linha: number; motivo: string }[];
  colunasDetectadas: string[];
}

function normalizarTexto(txt: unknown): string {
  if (txt == null) return '';
  return String(txt).trim();
}

function normalizarHeader(txt: unknown): string {
  return normalizarTexto(txt)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[\-_/\\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIASES: Record<keyof Omit<FinPepInput, 'id' | 'created_at' | 'updated_at' | 'importado_em' | 'importado_por'>, string[]> = {
  centro_lucro: ['centro de lucro', 'centro lucro', 'lucro', 'profit center', 'prctr'],
  definicao_projeto: ['definicao do projeto', 'definicao de projeto', 'definicao projeto', 'projeto', 'project definition', 'pspid'],
  wbs_element: ['wbs element', 'elemento wbs', 'wbs', 'elemento pep', 'pep', 'posid'],
  nome: ['name', 'nome', 'descricao', 'texto breve', 'post1'],
  nivel: ['level', 'nivel', 'stufe'],
  unidade_medida: ['usuario unidade de medida 1', 'unidade de medida 1', 'unidade de medida', 'unidade medida', 'unidade', 'um', 'uom', 'use04'],
  moeda: ['moeda', 'currency', 'waers'],
  empresa: ['empresa', 'company code', 'bukrs'],
  classificacao_contabil: ['codigo elemento classificacao contabil', 'classificacao contabil', 'classif contabil', 'contabil', 'belkz'],
  elemento_faturamento: ['codigo elemento de faturamento', 'elemento de faturamento', 'elemento faturamento', 'faturamento', 'fakts'],
  status: ['status', 'situacao', 'stat'],
  ifrs15_od: ['ifrs15 od', 'ifrs15', 'ifrs 15', 'od', 'ifrs'],
};

/**
 * Encontra o índice da coluna nos cabeçalhos informados com base nos aliases.
 */
function encontrarIndice(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h) continue;
    for (const alias of aliases) {
      if (h === alias) return i;
      const regex = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(\\s|$)`);
      if (regex.test(h)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Converte texto colado (TSV/CSV com tabulações ou ponto-e-vírgula) em matriz de linhas.
 */
export function parseTextoColadoPep(texto: string): unknown[][] {
  if (!texto || !texto.trim()) return [];
  const linhas = texto.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (linhas.length === 0) return [];

  // Detecta separador predominante na primeira linha: tab (\t), ponto-e-vírgula (;), vírgula (,)
  const primeiraLinha = linhas[0];
  let sep = '\t';
  const countTabs = (primeiraLinha.match(/\t/g) || []).length;
  const countPontoEVirgula = (primeiraLinha.match(/;/g) || []).length;
  const countVirgula = (primeiraLinha.match(/,/g) || []).length;

  if (countTabs >= countPontoEVirgula && countTabs >= countVirgula) sep = '\t';
  else if (countPontoEVirgula >= countVirgula) sep = ';';
  else sep = ',';

  return linhas.map(linha => linha.split(sep).map(col => col.replace(/^"(.*)"$/, '$1').trim()));
}

/**
 * Faz o parse e a validação de linhas brutas de planilha para inserção em `fin_pep`.
 */
export function parseLinhasImportacaoPep(rawRows: unknown[][]): ResultadoParsePep {
  const validas: FinPepInput[] = [];
  const pendencias: { linha: number; motivo: string }[] = [];
  const colunasDetectadas: string[] = [];

  if (!rawRows || rawRows.length === 0) {
    return { validas, pendencias, colunasDetectadas };
  }

  // Localiza a linha de cabeçalho (pode ser a linha 0 ou alguma linha inicial com cabeçalhos reconhecíveis)
  let headerRowIdx = -1;
  let indicesMap: Record<string, number> = {};

  for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
    const headersNorm = (rawRows[r] || []).map(normalizarHeader);
    const idxWbs = encontrarIndice(headersNorm, ALIASES.wbs_element);
    const idxProj = encontrarIndice(headersNorm, ALIASES.definicao_projeto);
    const idxLucro = encontrarIndice(headersNorm, ALIASES.centro_lucro);

    if (idxWbs >= 0 || (idxProj >= 0 && idxLucro >= 0)) {
      headerRowIdx = r;
      indicesMap = {
        centro_lucro: encontrarIndice(headersNorm, ALIASES.centro_lucro),
        definicao_projeto: encontrarIndice(headersNorm, ALIASES.definicao_projeto),
        wbs_element: idxWbs,
        nome: encontrarIndice(headersNorm, ALIASES.nome),
        nivel: encontrarIndice(headersNorm, ALIASES.nivel),
        unidade_medida: encontrarIndice(headersNorm, ALIASES.unidade_medida),
        moeda: encontrarIndice(headersNorm, ALIASES.moeda),
        empresa: encontrarIndice(headersNorm, ALIASES.empresa),
        classificacao_contabil: encontrarIndice(headersNorm, ALIASES.classificacao_contabil),
        elemento_faturamento: encontrarIndice(headersNorm, ALIASES.elemento_faturamento),
        status: encontrarIndice(headersNorm, ALIASES.status),
        ifrs15_od: encontrarIndice(headersNorm, ALIASES.ifrs15_od),
      };

      for (const [campo, idx] of Object.entries(indicesMap)) {
        if (idx >= 0) {
          colunasDetectadas.push(`${campo} (coluna ${idx + 1})`);
        }
      }
      break;
    }
  }

  // Se nenhuma linha de cabeçalho for identificada, assume a ordem canônica fornecida pelo usuário:
  // 0: Centro de lucro, 1: Definição do projeto, 2: WBS element, 3: Name, 4: Level,
  // 5: Usuário unidade de medida 1, 6: Moeda, 7: Empresa, 8: Código elemento classificação contábil,
  // 9: Código elemento de faturamento, 10: Status, 11: IFRS15 - OD
  const usaOrdemFixa = headerRowIdx === -1;
  const startRow = usaOrdemFixa ? 0 : headerRowIdx + 1;

  for (let r = startRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    // Checa se a linha é totalmente vazia
    const temConteudo = row.some(val => normalizarTexto(val).length > 0);
    if (!temConteudo) continue;

    const pegarValor = (campo: keyof typeof ALIASES, fallbackIdx: number): string => {
      const idx = usaOrdemFixa ? fallbackIdx : indicesMap[campo];
      if (idx == null || idx < 0 || idx >= row.length) return '';
      return normalizarTexto(row[idx]);
    };

    const wbs = pegarValor('wbs_element', 2);
    const proj = pegarValor('definicao_projeto', 1);

    if (!wbs) {
      pendencias.push({
        linha: r + 1,
        motivo: 'Elemento WBS/PEP ausente ou vazio.',
      });
      continue;
    }

    const nivelRaw = pegarValor('nivel', 4);
    let nivel: number | null = null;
    if (nivelRaw) {
      const parsed = parseInt(nivelRaw.replace(/\D/g, ''), 10);
      if (!isNaN(parsed)) nivel = parsed;
    }

    const item: FinPepInput = {
      centro_lucro: pegarValor('centro_lucro', 0) || null,
      definicao_projeto: proj || null,
      wbs_element: wbs,
      nome: pegarValor('nome', 3) || null,
      nivel,
      unidade_medida: pegarValor('unidade_medida', 5) || null,
      moeda: pegarValor('moeda', 6) || null,
      empresa: pegarValor('empresa', 7) || null,
      classificacao_contabil: pegarValor('classificacao_contabil', 8) || null,
      elemento_faturamento: pegarValor('elemento_faturamento', 9) || null,
      status: pegarValor('status', 10) || null,
      ifrs15_od: pegarValor('ifrs15_od', 11) || null,
    };

    validas.push(item);
  }

  return { validas, pendencias, colunasDetectadas };
}

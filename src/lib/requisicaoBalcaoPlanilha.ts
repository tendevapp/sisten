/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisição no Balcão — planilha de baixa para o SAP.
 *
 * Uma linha por item, repetindo os dados da requisição. Mesma ideia do
 * Abrir RM (`almoxarifadoRm.ts`): a conversão mora aqui, sem React e sem
 * Supabase, porque é ela que precisa de teste; a tela só seleciona e baixa.
 */

import * as XLSX from 'xlsx';
import { descricaoDeposito } from './almoxarifado';
import { ROTULO_TIPO_MOVIMENTO, type TipoMovimentoBalcao } from './requisicaoBalcao';

/** Centro receptor. A operação tem um só. */
export const BALCAO_CENTRO = 'TEN2';

/** Ordem das colunas — quem processa a planilha lê por posição. */
export const BALCAO_COLUNAS = [
  'Tipo',
  'Material',
  'Texto breve',
  'Quantidade',
  'Deposito',
  'Descricao_Deposito',
  'Elemento_PEP',
  'Descricao_PEP',
  'Receptor_Centro',
  'Status_Processamento',
  'Observacao',
] as const;

export type ColunaBalcao = (typeof BALCAO_COLUNAS)[number];
export type LinhaPlanilhaBalcao = Record<ColunaBalcao, string | number>;

/** O que a planilha precisa de cada requisição. */
export interface RequisicaoParaPlanilha {
  codigo: string;
  tipo_movimento: TipoMovimentoBalcao;
  deposito_origem: string;
  aplicacao_pep: string | null;
  aplicacao: string;
  observacao: string | null;
  itens: {
    material: string;
    descricao: string | null;
    quantidade: number;
    aplicacao_pep?: string | null;
    aplicacao?: string | null;
    saldo_zl0024?: number | null;
    sem_saldo?: boolean | null;
  }[];
}

/**
 * Converte requisições em linhas. A observação leva o código RQB na frente:
 * é o que liga a linha processada no SAP de volta à requisição.
 * `Status_Processamento` sai vazio — é preenchido por quem processa.
 * Cada item leva o seu Elemento_PEP respectivo (se houver grupos de PEP múltiplos).
 */
export function montarLinhasBalcao(requisicoes: RequisicaoParaPlanilha[]): LinhaPlanilhaBalcao[] {
  return requisicoes.flatMap((r) =>
    r.itens.map((i) => {
      const pep = i.aplicacao_pep || r.aplicacao_pep || '';
      const descPep = i.aplicacao || (i.aplicacao_pep ? i.aplicacao_pep : r.aplicacao);
      return {
        Tipo: ROTULO_TIPO_MOVIMENTO[r.tipo_movimento],
        Material: i.material,
        'Texto breve': i.descricao ?? '',
        Quantidade: Number(i.quantidade),
        Deposito: r.deposito_origem,
        Descricao_Deposito: descricaoDeposito(r.deposito_origem),
        Elemento_PEP: pep,
        Descricao_PEP: pep ? descPep : '',
        Receptor_Centro: BALCAO_CENTRO,
        Status_Processamento: '',
        Observacao: r.observacao ? `${r.codigo} - ${r.observacao}` : r.codigo,
      };
    }),
  );
}

/** `requisicao_balcao_20260923_1432.xlsx` — data e hora para não sobrescrever o anterior. */
export function nomeArquivoBalcao(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const carimbo =
    `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `_${p(agora.getHours())}${p(agora.getMinutes())}`;
  return `requisicao_balcao_${carimbo}.xlsx`;
}

/* Volta da planilha concluída ---------------------------------------------
 *
 * Quem processa no SAP devolve a mesma planilha com o nº do documento numa
 * coluna nova no fim ("SAP"). A linha volta para o item pelo código RQB — o
 * começo da Observacao — mais o material.
 */

/** Uma linha lida da planilha concluída, já com o código da requisição. */
export interface LinhaImportadaBalcao {
  codigo: string;
  material: string;
  docSap: string;
  status: string;
}

export interface LeituraPlanilhaBalcao {
  linhas: LinhaImportadaBalcao[];
  /** Nome do cabeçalho de onde saiu o doc. SAP. */
  colunaSap: string;
  totalLinhas: number;
  /** Linhas sem código RQB na Observacao — de outra planilha ou apagado. */
  semCodigo: number;
  /** Linhas com código mas sem doc. SAP nem status — ainda não processadas. */
  semDocSap: number;
}

const chave = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/[\s_]+/g, '');

/** Célula como texto; número inteiro sem casa decimal nem notação científica. */
function texto(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v ?? '').trim();
}

/**
 * Lê a planilha em forma de matriz (`sheet_to_json(ws, { header: 1 })`).
 * O doc. SAP vem da coluna "SAP"; sem ela, da última coluna com cabeçalho —
 * é onde quem processa acrescenta o número.
 */
export function lerPlanilhaBalcaoConcluida(matriz: unknown[][]): LeituraPlanilhaBalcao {
  const [cabecalho = [], ...corpo] = matriz;
  const nomes = cabecalho.map((c) => String(c ?? '').trim());
  const idx = (nome: string) => nomes.findIndex((n) => chave(n) === chave(nome));

  const iObs = idx('Observacao');
  const iMat = idx('Material');
  const iStatus = idx('Status_Processamento');
  let iSap = idx('SAP');
  if (iSap < 0) {
    for (let i = nomes.length - 1; i >= 0; i--) if (nomes[i]) { iSap = i; break; }
  }
  if (iObs < 0 || iMat < 0 || iSap < 0 || iSap === iObs) {
    throw new Error('Planilha fora do formato: faltam as colunas Material, Observacao ou a coluna do doc. SAP.');
  }

  const linhas: LinhaImportadaBalcao[] = [];
  let semCodigo = 0;
  let semDocSap = 0;
  let totalLinhas = 0;
  for (const row of corpo) {
    if (!row || row.every((c) => texto(c) === '')) continue;
    totalLinhas++;
    const codigo = texto(row[iObs]).match(/RQB-\d{6}-\d+/i)?.[0]?.toUpperCase();
    if (!codigo) { semCodigo++; continue; }
    const docSap = texto(row[iSap]);
    const status = iStatus >= 0 ? texto(row[iStatus]) : '';
    if (!docSap && !status) { semDocSap++; continue; }
    linhas.push({ codigo, material: texto(row[iMat]), docSap, status });
  }
  return { linhas, colunaSap: nomes[iSap], totalLinhas, semCodigo, semDocSap };
}

export type SituacaoImportacao = 'novo' | 'igual' | 'diferente' | 'nao_encontrado';

/**
 * Compara cada linha com o que o item já tem, para a prévia: nada é escrito
 * sem o almoxarife ver o que muda, e doc. SAP diferente do já gravado aparece
 * destacado em vez de ser trocado em silêncio.
 */
export function classificarImportacao(
  linhas: LinhaImportadaBalcao[],
  requisicoes: { codigo: string; itens: { material: string; doc_sap?: string | null; status_processamento?: string | null }[] }[],
): (LinhaImportadaBalcao & { situacao: SituacaoImportacao; docAtual: string })[] {
  const porCodigo = new Map(requisicoes.map((r) => [r.codigo.toUpperCase(), r]));
  return linhas.map((l) => {
    const item = porCodigo.get(l.codigo)?.itens.find((i) => i.material === l.material);
    if (!item) return { ...l, situacao: 'nao_encontrado' as const, docAtual: '' };
    const docAtual = item.doc_sap ?? '';
    const statusAtual = item.status_processamento ?? '';
    const docNovo = l.docSap || docAtual;
    const statusNovo = l.status || statusAtual;
    const situacao: SituacaoImportacao =
      docNovo === docAtual && statusNovo === statusAtual ? 'igual'
        : docAtual && docNovo !== docAtual ? 'diferente'
          : 'novo';
    return { ...l, situacao, docAtual };
  });
}

/** Gera e baixa o XLSX. Devolve o nome do arquivo, que vai para o log. */
export function exportarPlanilhaBalcao(requisicoes: RequisicaoParaPlanilha[]): { arquivo: string; linhas: number } {
  const linhas = montarLinhasBalcao(requisicoes);
  // `header` explícito: garante a ordem das colunas mesmo com célula vazia.
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...BALCAO_COLUNAS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Baixas');
  const arquivo = nomeArquivoBalcao();
  XLSX.writeFile(wb, arquivo);
  return { arquivo, linhas: linhas.length };
}

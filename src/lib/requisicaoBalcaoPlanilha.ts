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

export interface LinhaBaixasSimulacao {
  linha: number; codigo: string; doc: string; material: string; descricao: string;
  quantidade: number; origem: string; destino: string; tipo: 'saida' | 'transferencia';
}

/** Para simular, entram também as linhas rejeitadas pela MB03. A importação de retorno tem outro critério. */
export function lerBaixasSimulacao(wb: XLSX.WorkBook): LinhaBaixasSimulacao[] {
  const nome = wb.SheetNames.find(s => chave(s) === 'baixas');
  if (!nome) throw new Error('A aba BAIXAS não foi encontrada no arquivo.');
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: '', range: 0 });
  const h = matriz.findIndex(r => r.some(c => chave(c) === 'observacao') && r.some(c => chave(c) === 'material'));
  const col = (nome: string) => {
    const i = (matriz[h] || []).findIndex(c => chave(c) === chave(nome));
    if (i < 0) throw new Error('Falta a coluna ' + nome + ' na aba BAIXAS.');
    return i;
  };
  const [mat, desc, obs, doc, qtd, orig, dest, tipo, centro] =
    ['Material','Texto breve','Observacao','SAP','Quantidade','Deposito_Origem','Deposito_Destino','Tipo','Receptor_Centro'].map(col);
  const linhas: LinhaBaixasSimulacao[] = [];
  for (let i = h + 1; i < matriz.length; i++) {
    const row = matriz[i];
    if (!row.some(c => texto(c))) continue;
    const codigo = texto(row[obs]).match(/\bRQB-\d{6}-\d+\b/i)?.[0].toUpperCase();
    const movimento = chave(row[tipo]), origem = texto(row[orig]), destino = texto(row[dest]);
    const quantidade = typeof row[qtd] === 'number' ? Number(row[qtd]) : Number(texto(row[qtd]).replace(',','.'));
    if (!codigo || !texto(row[mat]) || !/^\d{10}$/.test(texto(row[doc])) || !origem || !Number.isFinite(quantidade) || quantidade <= 0 ||
        !['transferencia','saida'].includes(movimento) || (movimento === 'transferencia' && !destino) || texto(row[centro]).toUpperCase() !== BALCAO_CENTRO) {
      throw new Error('Revise RQB, documento SAP, material, quantidade, movimento, centro e depósitos na linha ' + (i + 1) + ' da aba BAIXAS.');
    }
    linhas.push({ linha: i + 1, codigo, doc: texto(row[doc]), material: texto(row[mat]).replace(/^0+/,''), descricao: texto(row[desc]),
      quantidade, origem: origem.padStart(4,'0'), destino: movimento === 'transferencia' ? destino.padStart(4,'0') : '', tipo: movimento as LinhaBaixasSimulacao['tipo'] });
  }
  if (!linhas.length) throw new Error('A aba BAIXAS está vazia.');
  return linhas;
}

/** Ordem das colunas — quem processa a planilha lê por posição. */
export const BALCAO_COLUNAS = [
  'Tipo',
  'Material',
  'Texto breve',
  'Quantidade',
  'Deposito_Origem',
  'Descricao_Origem',
  'Deposito_Destino',
  'Descricao_Destino',
  'Elemento_PEP',
  'Descricao_PEP',
  'Receptor_Centro',
  'Status_Processamento',
  'Observacao',
  'SAP',
] as const;

export type ColunaBalcao = (typeof BALCAO_COLUNAS)[number];
export type LinhaPlanilhaBalcao = Record<ColunaBalcao, string | number>;

/** O que a planilha precisa de cada requisição. */
export interface RequisicaoParaPlanilha {
  codigo: string;
  tipo_movimento: TipoMovimentoBalcao;
  deposito_origem: string;
  deposito_destino?: string | null;
  aplicacao_pep: string | null;
  aplicacao: string;
  observacao: string | null;
  itens: {
    material: string;
    descricao: string | null;
    quantidade: number;
    aplicacao_pep?: string | null;
    aplicacao?: string | null;
    deposito?: string | null;
    deposito_destino?: string | null;
    saldo_zl0024?: number | null;
    sem_saldo?: boolean | null;
  }[];
}

/**
 * Converte requisições em linhas. A observação leva o código RQB na frente:
 * é o que liga a linha processada no SAP de volta à requisição.
 * `Status_Processamento` sai vazio — é preenchido por quem processa.
 * Cada item leva o seu Elemento_PEP e Depósito respectivo.
 */
export function montarLinhasBalcao(requisicoes: RequisicaoParaPlanilha[]): LinhaPlanilhaBalcao[] {
  return requisicoes.flatMap((r) =>
    r.itens.map((i) => {
      const ehTransferencia = r.tipo_movimento === 'transferencia';
      const pep = ehTransferencia ? '' : i.aplicacao_pep || r.aplicacao_pep || '';
      const descPep = ehTransferencia ? '' : i.aplicacao || (i.aplicacao_pep ? i.aplicacao_pep : r.aplicacao);
      const depositoOrigem = i.deposito || r.deposito_origem;
      const depositoDestino = ehTransferencia ? (i.deposito_destino || r.deposito_destino)?.trim() || '' : '';
      return {
        Tipo: ROTULO_TIPO_MOVIMENTO[r.tipo_movimento],
        Material: i.material,
        'Texto breve': i.descricao ?? '',
        Quantidade: Number(i.quantidade),
        Deposito_Origem: depositoOrigem,
        Descricao_Origem: descricaoDeposito(depositoOrigem),
        Deposito_Destino: depositoDestino,
        Descricao_Destino: depositoDestino ? descricaoDeposito(depositoDestino) : '',
        Elemento_PEP: pep,
        Descricao_PEP: pep ? descPep : '',
        Receptor_Centro: BALCAO_CENTRO,
        Status_Processamento: 'Pendente',
        Observacao: r.observacao ? `${r.codigo} - ${r.observacao}` : r.codigo,
        SAP: '',
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
 * Baixas_SAP.xlsm devolve a aba BAIXAS com o cabeçalho na linha 4 e a
 * conferência da MB03 nas colunas O:T. A linha volta para o item pelo
 * código RQB na Observacao mais o material. O formato legado segue aceito.
 */

/** Uma linha lida da planilha concluída, já com o código da requisição. */
export interface LinhaImportadaBalcao {
  codigo: string;
  material: string;
  docSap: string;
  status: string;
  conferenciaSap?: {
    pronto: string;
    ano: string;
    resultado: string;
    conferidoEm: string;
    tempoSegundos: string;
    mensagem: string;
  };
}

export interface LeituraPlanilhaBalcao {
  linhas: LinhaImportadaBalcao[];
  /** Nome do cabeçalho de onde saiu o doc. SAP. */
  colunaSap: string;
  totalLinhas: number;
  /** Linhas sem código RQB na Observacao — de outra planilha ou apagado. */
  semCodigo: number;
  /** Linhas com código sem doc. SAP (no legado, também precisam estar sem status). */
  semDocSap: number;
  /** Quais são essas linhas — vão para o log da importação. */
  linhasSemDoc: { codigo: string; material: string }[];
  exigeConferenciaSap: boolean;
  linhasBloqueadas: (LinhaImportadaBalcao & { motivo: string })[];
}

const chave = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/[\s_]+/g, '');

/** Célula como texto; número inteiro sem casa decimal nem notação científica. */
function texto(v: unknown): string {
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v ?? '').trim();
}

/** Data/hora local do Excel, sem conversão de fuso horário. */
function textoDataExcel(v: unknown): string {
  if (typeof v !== 'number') return texto(v);
  return XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', v);
}

/** PAINEL e LISTAS são auxiliares. A aba BAIXAS exige a conferência da MB03. */
export function lerArquivoBalcaoConcluido(wb: XLSX.WorkBook): LeituraPlanilhaBalcao {
  const abaBaixas = wb.SheetNames.find((nome) => chave(nome) === 'baixas');
  const ws = wb.Sheets[abaBaixas ?? wb.SheetNames[0]];
  if (!ws) throw new Error('Planilha fora do formato: nenhuma aba de dados encontrada.');
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  return lerPlanilhaBalcaoConcluida(matriz, Boolean(abaBaixas));
}

/**
 * Localiza o cabeçalho por Material + Observacao. No novo formato, SAP é
 * obrigatório e só entram linhas CONFIRMADO na MB03 com documento preenchido.
 * O fallback para a última coluna fica restrito às planilhas legadas.
 */
export function lerPlanilhaBalcaoConcluida(matriz: unknown[][], exigirConferenciaSap = false): LeituraPlanilhaBalcao {
  const inicio = matriz.findIndex((row) => row.some((c) => chave(c) === 'material') && row.some((c) => chave(c) === 'observacao'));
  const cabecalho = matriz[inicio] ?? [];
  const corpo = matriz.slice(inicio + 1);
  const nomes = cabecalho.map((c) => String(c ?? '').trim());
  const idx = (nome: string) => nomes.findIndex((n) => chave(n) === chave(nome));

  const iObs = idx('Observacao');
  const iMat = idx('Material');
  const iStatus = idx('Status_Processamento');
  const iPronto = idx('Pronto?');
  const iAno = idx('Ano');
  const iConferencia = idx('Conferência SAP');
  const iConferidoEm = idx('Conferido em');
  const iTempo = idx('Tempo conf. (s)');
  const iMensagem = idx('Mensagem do SAP');
  const exigeConferenciaSap = exigirConferenciaSap || [iPronto, iAno, iConferencia, iConferidoEm, iTempo, iMensagem].some((i) => i >= 0);
  if (exigeConferenciaSap && iConferencia < 0) {
    throw new Error('Planilha fora do formato Baixas SAP: falta a coluna Conferência SAP da MB03.');
  }
  let iSap = idx('SAP');
  if (iSap < 0 && !exigeConferenciaSap) {
    for (let i = nomes.length - 1; i >= 0; i--) if (nomes[i]) { iSap = i; break; }
  }
  if (iObs < 0 || iMat < 0 || iSap < 0 || iSap === iObs) {
    throw new Error('Planilha fora do formato: faltam as colunas Material, Observacao ou a coluna do doc. SAP.');
  }

  const linhas: LinhaImportadaBalcao[] = [];
  let semCodigo = 0;
  let semDocSap = 0;
  let totalLinhas = 0;
  const linhasSemDoc: { codigo: string; material: string }[] = [];
  const linhasBloqueadas: LeituraPlanilhaBalcao['linhasBloqueadas'] = [];
  for (const row of corpo) {
    if (!row || row.every((c) => texto(c) === '')) continue;
    totalLinhas++;
    const codigo = texto(row[iObs]).match(/RQB-\d{6}-\d+/i)?.[0]?.toUpperCase();
    if (!codigo) { semCodigo++; continue; }
    const docSap = texto(row[iSap]);
    const status = iStatus >= 0 ? texto(row[iStatus]) : '';
    const linha: LinhaImportadaBalcao = { codigo, material: texto(row[iMat]), docSap, status };
    if (exigeConferenciaSap) {
      linha.conferenciaSap = {
        pronto: texto(row[iPronto]), ano: texto(row[iAno]), resultado: texto(row[iConferencia]),
        conferidoEm: textoDataExcel(row[iConferidoEm]), tempoSegundos: texto(row[iTempo]), mensagem: texto(row[iMensagem]),
      };
      if (!docSap || chave(linha.conferenciaSap.resultado) !== 'confirmado') {
        if (!docSap) semDocSap++;
        const motivo = !docSap ? 'Sem documento SAP para importar.'
          : `Conferência MB03 ${linha.conferenciaSap.resultado || 'pendente'}.`;
        linhasBloqueadas.push({ ...linha, motivo });
        continue;
      }
    }
    if (!docSap && !status) { semDocSap++; linhasSemDoc.push({ codigo, material: texto(row[iMat]) }); continue; }
    linhas.push(linha);
  }
  return { linhas, colunaSap: nomes[iSap], totalLinhas, semCodigo, semDocSap, linhasSemDoc, exigeConferenciaSap, linhasBloqueadas };
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

const MIME_PLANILHA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Gera os mesmos bytes para arquivamento e para o primeiro download. */
export function gerarPlanilhaBalcao(requisicoes: RequisicaoParaPlanilha[]): { arquivo: string; linhas: number; blob: Blob } {
  const linhas = montarLinhasBalcao(requisicoes);
  // `header` explícito: garante a ordem das colunas mesmo com célula vazia.
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...BALCAO_COLUNAS] });
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(BALCAO_COLUNAS.length - 1)}${Math.max(linhas.length + 1, 1)}` };
  ws['!cols'] = [
    { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 13 },
    { wch: 16 }, { wch: 25 }, { wch: 16 }, { wch: 25 },
    { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 22 },
    { wch: 26 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimentacoes_SAP');
  const bytes: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { arquivo: nomeArquivoBalcao(), linhas: linhas.length, blob: new Blob([bytes], { type: MIME_PLANILHA }) };
}

export function baixarPlanilhaBalcao(blob: Blob, arquivo: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = arquivo;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

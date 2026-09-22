import * as XLSX from 'xlsx';
import type { SsmaBookEpi } from './ssmaBookEpisApi';

export type ClassificacaoEpiFuncao = 'BASICO_OBRIGATORIO' | 'ESPECIFICO_OBRIGATORIO' | 'CONDICIONAL_POR_EXPOSICAO';

export interface FuncaoEpiImportada {
  codigo: string;
  nome: string;
  ativo: boolean;
}

export interface RequisitoEpiImportado {
  codigoVinculo: string;
  codigoFuncao: string;
  codigoEpi: string;
  descricaoEpi: string;
  ca: string | null;
  classificacao: ClassificacaoEpiFuncao;
  condicaoUso: string | null;
  ativo: boolean;
}

export interface CadastroEpiPorFuncaoImportado {
  funcoes: FuncaoEpiImportada[];
  requisitos: RequisitoEpiImportado[];
}

const texto = (valor: unknown) => String(valor ?? '').trim();
const ativo = (valor: unknown) => !/^(inativo|não|nao)$/i.test(texto(valor));

function linhaCabecalho(linhas: unknown[][], primeiraColuna: string): number {
  const indice = linhas.findIndex(linha => texto(linha[0]).toLocaleLowerCase('pt-BR') === primeiraColuna.toLocaleLowerCase('pt-BR'));
  if (indice < 0) throw new Error(`Não foi localizado o cabeçalho "${primeiraColuna}" na planilha.`);
  return indice;
}

export function converterClassificacaoEpiFuncao(valor: unknown): ClassificacaoEpiFuncao {
  const normalizado = normalizarEpi(valor);
  if (normalizado.includes('CONDICIONAL')) return 'CONDICIONAL_POR_EXPOSICAO';
  if (normalizado.includes('ESPECIFICO')) return 'ESPECIFICO_OBRIGATORIO';
  return 'BASICO_OBRIGATORIO';
}

export function normalizarEpi(valor: unknown): string {
  return texto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-BR')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export async function parseCadastroEpiPorFuncaoWorkbook(buffer: ArrayBuffer): Promise<CadastroEpiPorFuncaoImportado> {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const abaFuncoes = workbook.Sheets['Funções'];
  const abaVinculos = workbook.Sheets['Função x EPI'];
  if (!abaFuncoes || !abaVinculos) throw new Error('A planilha deve conter as abas "Funções" e "Função x EPI".');

  const linhasFuncoes = XLSX.utils.sheet_to_json<unknown[]>(abaFuncoes, { header: 1, defval: null, raw: false });
  const inicioFuncoes = linhaCabecalho(linhasFuncoes, 'ID da função');
  const funcoes = linhasFuncoes.slice(inicioFuncoes + 1)
    .filter(linha => /^FUN-/i.test(texto(linha[0])))
    .map(linha => ({ codigo: texto(linha[0]), nome: texto(linha[1]), ativo: ativo(linha[2]) }))
    .filter(funcao => funcao.nome);

  const linhasVinculos = XLSX.utils.sheet_to_json<unknown[]>(abaVinculos, { header: 1, defval: null, raw: false });
  const inicioVinculos = linhaCabecalho(linhasVinculos, 'ID do vínculo');
  const requisitos = linhasVinculos.slice(inicioVinculos + 1)
    .filter(linha => /^VINC-/i.test(texto(linha[0])))
    .map(linha => ({
      codigoVinculo: texto(linha[0]),
      codigoFuncao: texto(linha[1]),
      codigoEpi: texto(linha[4]),
      descricaoEpi: texto(linha[5]),
      classificacao: converterClassificacaoEpiFuncao(linha[6]),
      condicaoUso: texto(linha[7]) || null,
      ca: texto(linha[8]) || null,
      ativo: ativo(linha[9]),
    }))
    .filter(requisito => requisito.codigoFuncao && requisito.codigoEpi && requisito.descricaoEpi);

  if (!funcoes.length || !requisitos.length) throw new Error('A planilha não possui funções ou vínculos de EPI válidos.');
  return { funcoes, requisitos };
}

/** Escolhe uma variante de referência; a ficha futura deve consultar o grupo dela para escolher tamanho. */
export function sugerirEpiDoBook(descricao: string, book: SsmaBookEpi[]): SsmaBookEpi | null {
  const origem = new Set(normalizarEpi(descricao).split(' ').filter(token => token.length > 1));
  if (!origem.size) return null;
  const representantes = new Map<string, SsmaBookEpi>();
  for (const epi of book) {
    const atual = representantes.get(epi.grupo_epi);
    if (!atual || `${epi.descricao_sap || ''}`.length < `${atual.descricao_sap || ''}`.length) representantes.set(epi.grupo_epi, epi);
  }

  let melhor: SsmaBookEpi | null = null;
  let maiorPontuacao = 0;
  for (const epi of representantes.values()) {
    const alvo = new Set(normalizarEpi(`${epi.descricao_sap || ''} ${epi.descricao_epi} ${epi.grupo_epi}`).split(' ').filter(token => token.length > 1));
    const comuns = [...origem].filter(token => alvo.has(token)).length;
    const pontuacao = comuns / origem.size;
    if (pontuacao > maiorPontuacao) { melhor = epi; maiorPontuacao = pontuacao; }
  }
  return maiorPontuacao >= 0.5 ? melhor : null;
}

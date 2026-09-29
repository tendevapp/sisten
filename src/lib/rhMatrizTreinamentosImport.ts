/** Importação da matriz de treinamentos por colaborador e função. */

import { normalizarCabecalho } from './rhPessoasImport';

export type StatusTreinamentoPessoa = 'apto' | 'vencido' | 'pendente';

export interface TreinamentoCatalogoImportado {
  nome: string;
  chave: string;
  conteudo: string | null;
  analise_eficacia: boolean;
  carga_horaria: number | null;
  validade_meses: number | null;
}

export interface PessoaMatrizImportada {
  registro: string;
  nome: string;
  area: string | null;
  lideranca: string | null;
}

export interface RegistroMatrizImportado {
  registro: string;
  treinamento: string;
  status: StatusTreinamentoPessoa;
  validade_em: string | null;
}

export interface ObrigatoriedadeTreinamentoImportada {
  cargo: string;
  treinamento: string;
}

export type TipoInformacaoTreinamento = 'interno' | 'externo' | 'nao_informado';

const texto = (valor: unknown): string => String(valor ?? '').replace(/\s+/g, ' ').trim();

export function normalizarChaveTreinamento(valor: unknown): string {
  return texto(valor)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function extrairValidadeMeses(nome: unknown): number | null {
  const valor = texto(nome).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  const match = valor.match(/VAL\.?\s*0?(\d+)\s*ANO/);
  return match ? Number(match[1]) * 12 : null;
}

function numeroDeCargaHoraria(valor: unknown): number | null {
  const numero = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return numero <= 1 ? Math.round(numero * 24 * 100) / 100 : numero;
}

function dataExcelParaISO(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const data = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    return data.toISOString().slice(0, 10);
  }
  const str = texto(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const partes = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!partes) return null;
  const ano = partes[3].length === 2 ? 2000 + Number(partes[3]) : Number(partes[3]);
  return `${ano}-${partes[2].padStart(2, '0')}-${partes[1].padStart(2, '0')}`;
}

function localizarCabecalho(linhas: unknown[][], predicado: (linha: unknown[]) => boolean): number {
  return linhas.findIndex(linha => predicado(linha || []));
}

export function mapearBancoTreinamentos(linhas: unknown[][]): TreinamentoCatalogoImportado[] {
  const cabecalhoIndex = localizarCabecalho(linhas, linha => linha.some(valor => normalizarCabecalho(valor) === 'treinamento'));
  if (cabecalhoIndex === -1) throw new Error('A aba Banco de Dados não contém a coluna Treinamento.');
  const cabecalho = linhas[cabecalhoIndex].map(normalizarCabecalho);
  const nomeIndex = cabecalho.indexOf('treinamento');
  const conteudoIndex = cabecalho.findIndex(valor => valor.startsWith('conteudo'));
  const eficaciaIndex = cabecalho.findIndex(valor => valor.includes('analise') && valor.includes('eficacia'));
  const chIndexes = cabecalho.map((valor, index) => valor === 'ch' ? index : -1).filter(index => index >= 0);
  const itens = new Map<string, TreinamentoCatalogoImportado>();

  linhas.slice(cabecalhoIndex + 1).forEach(linha => {
    const nome = texto(linha?.[nomeIndex]);
    const chave = normalizarChaveTreinamento(nome);
    if (!nome || !chave) return;
    const cargas = chIndexes.map(index => numeroDeCargaHoraria(linha?.[index])).filter((valor): valor is number => valor !== null);
    itens.set(chave, {
      nome,
      chave,
      conteudo: texto(linha?.[conteudoIndex]) || null,
      analise_eficacia: /^(S|SIM|TRUE|1)$/i.test(texto(linha?.[eficaciaIndex])),
      carga_horaria: cargas.length ? Math.max(...cargas) : null,
      validade_meses: extrairValidadeMeses(nome),
    });
  });
  return Array.from(itens.values());
}

function statusDaMatriz(valor: unknown): StatusTreinamentoPessoa | null {
  const chave = normalizarCabecalho(valor);
  if (!chave) return null;
  if (chave.includes('apto')) return 'apto';
  if (chave.includes('venc')) return 'vencido';
  return 'pendente';
}

export function mapearControleTreinamentos(linhas: unknown[][]): {
  pessoas: PessoaMatrizImportada[];
  registros: RegistroMatrizImportado[];
  treinamentos: string[];
  tiposPorTreinamento: Record<string, TipoInformacaoTreinamento>;
} {
  const cabecalhoIndex = localizarCabecalho(linhas, linha => linha.some(valor => normalizarCabecalho(valor) === 'colaborador'));
  if (cabecalhoIndex === -1) throw new Error('A aba Controle Treinamento não contém a coluna Colaborador.');
  const cabecalho = linhas[cabecalhoIndex].map(normalizarCabecalho);
  const indice = (nomes: string[]) => cabecalho.findIndex(valor => nomes.includes(valor));
  const nomeIndex = indice(['colaborador']);
  const registroIndex = indice(['registro', 'matricula']);
  const areaIndex = indice(['area', 'areasetor']);
  const liderIndex = indice(['lider', 'lideranca']);
  if (nomeIndex === -1 || registroIndex === -1) throw new Error('A aba Controle Treinamento não contém Colaborador e Registro.');

  const statusHeader = linhas[cabecalhoIndex + 1] || [];
  const treinamentos = cabecalho
    .map((nome, index) => ({ nome: texto(linhas[cabecalhoIndex]?.[index]), index, tipo: normalizarTipoInformacao(linhas[cabecalhoIndex - 2]?.[index]) }))
    .filter(({ nome, index }) => Boolean(nome) && normalizarCabecalho(statusHeader[index]) === 'situacao' && normalizarCabecalho(statusHeader[index + 1]) === 'vencimento');
  const pessoas = new Map<string, PessoaMatrizImportada>();
  const registros = new Map<string, RegistroMatrizImportado>();

  linhas.slice(cabecalhoIndex + 2).forEach(linha => {
    const registro = texto(linha?.[registroIndex]);
    const nome = texto(linha?.[nomeIndex]);
    if (!registro || !nome || /^#(REF|N\/A)/i.test(registro)) return;
    pessoas.set(registro, { registro, nome, area: texto(linha?.[areaIndex]) || null, lideranca: texto(linha?.[liderIndex]) || null });
    treinamentos.forEach(({ nome: treinamento, index }) => {
      const status = statusDaMatriz(linha?.[index]);
      if (!status) return;
      const chave = `${registro}|${normalizarChaveTreinamento(treinamento)}`;
      registros.set(chave, { registro, treinamento, status, validade_em: dataExcelParaISO(linha?.[index + 1]) });
    });
  });

  return {
    pessoas: Array.from(pessoas.values()),
    registros: Array.from(registros.values()),
    treinamentos: treinamentos.map(item => item.nome),
    tiposPorTreinamento: Object.fromEntries(treinamentos.map(item => [item.nome, item.tipo])),
  };
}

export function normalizarTipoInformacao(valor: unknown): TipoInformacaoTreinamento {
  const chave = normalizarCabecalho(valor);
  if (chave.includes('intern')) return 'interno';
  if (chave.includes('extern')) return 'externo';
  return 'nao_informado';
}

export function mapearObrigatoriedadesPorFuncao(linhas: unknown[][]): ObrigatoriedadeTreinamentoImportada[] {
  const cabecalhoIndex = localizarCabecalho(linhas, linha => linha.some(valor => normalizarCabecalho(valor) === 'funcao') && linha.some(valor => normalizarCabecalho(valor) === 'treinamentos'));
  if (cabecalhoIndex === -1) throw new Error('A aba de treinamentos obrigatórios não contém Função e Treinamentos.');
  const cabecalho = linhas[cabecalhoIndex].map(normalizarCabecalho);
  const cargoIndex = cabecalho.indexOf('funcao');
  const treinamentoIndexes = cabecalho.map((valor, index) => valor === 'treinamentos' ? index : -1).filter(index => index >= 0);
  const itens = new Map<string, ObrigatoriedadeTreinamentoImportada>();
  linhas.slice(cabecalhoIndex + 1).forEach(linha => {
    const cargo = texto(linha?.[cargoIndex]);
    if (!cargo || normalizarCabecalho(cargo) === 'funcao') return;
    treinamentoIndexes.forEach(index => {
      const treinamento = texto(linha?.[index]);
      if (!treinamento || treinamento === '-' || treinamento.startsWith('#')) return;
      const chave = `${normalizarChaveTreinamento(cargo)}|${normalizarChaveTreinamento(treinamento)}`;
      itens.set(chave, { cargo, treinamento });
    });
  });
  return Array.from(itens.values());
}

export type TipoInformacaoPlano = 'interno' | 'externo' | 'nao_informado';
export type StatusPlanoTreinamento = 'programado' | 'realizado' | 'atrasado' | 'reagendado' | 'cancelado';

export interface PlanoTreinamentoImportado {
  codigo: string;
  titulo: string;
  responsavel: string | null;
  data_inicio: string;
  data_termino: string | null;
  horario: string | null;
  carga_horaria: number | null;
  participantes_planejados: number | null;
  local: string | null;
  tipo_informacao: TipoInformacaoPlano;
  modalidade: string | null;
  objetivo: string | null;
  custo_total: number;
  data_realizada: string | null;
  status: StatusPlanoTreinamento;
  comentarios: string | null;
  categoria: string | null;
}

export interface CronogramaTreinamentoImportado {
  chave: string;
  descricao: string;
  cotacao: number;
  unidade_mes: number;
  quantidade_total: number;
  meses: Array<{ competencia: string; quantidade: number }>;
}

const texto = (valor: unknown) => String(valor ?? '').replace(/\s+/g, ' ').trim();
const chave = (valor: unknown) => texto(valor).normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const numero = (valor: unknown) => {
  const convertido = typeof valor === 'number' ? valor : Number(texto(valor).replace(/R\$\s*/i, '').replace(/,/g, ''));
  return Number.isFinite(convertido) ? convertido : null;
};
const cargaHoraria = (valor: unknown) => {
  const valorNumerico = numero(valor);
  return valorNumerico !== null && valorNumerico > 0 && valorNumerico <= 1 ? Math.round(valorNumerico * 2400) / 100 : valorNumerico;
};
const data = (valor: unknown): string | null => {
  if (typeof valor === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000).toISOString().slice(0, 10);
  const partes = texto(valor).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!partes) return /^\d{4}-\d{2}-\d{2}$/.test(texto(valor)) ? texto(valor) : null;
  return `${partes[3].length === 2 ? `20${partes[3]}` : partes[3]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')}`;
};
const tipo = (valor: unknown): TipoInformacaoPlano => chave(valor).includes('INTERN') ? 'interno' : chave(valor).includes('EXTERN') ? 'externo' : 'nao_informado';
const status = (valor: unknown): StatusPlanoTreinamento => {
  const valorNormalizado = chave(valor);
  if (valorNormalizado.includes('REALIZ')) return 'realizado';
  if (valorNormalizado.includes('ATRAS')) return 'atrasado';
  if (valorNormalizado.includes('REAGEND')) return 'reagendado';
  if (valorNormalizado.includes('CANCEL')) return 'cancelado';
  return 'programado';
};

export function mapearPlanoTreinamentos(linhas: unknown[][]): PlanoTreinamentoImportado[] {
  const indiceCabecalho = linhas.findIndex(linha => linha.some(valor => chave(valor) === 'CODIGO') && linha.some(valor => chave(valor).includes('TITULO DO TREINAMENTO')));
  if (indiceCabecalho < 0) throw new Error('A aba Plano de Treinamento não contém o cabeçalho Código e Título do Treinamento.');
  const cabecalho = linhas[indiceCabecalho].map(chave);
  const indice = (parte: string) => cabecalho.findIndex(valor => valor.includes(parte));
  const codigo = indice('CODIGO'), titulo = indice('TITULO DO TREINAMENTO'), responsavel = indice('RESPONSAVEL'), inicio = indice('DATA DE INICIO'), termino = indice('DATA DE TERMINO'), horario = indice('HORARIO'), carga = indice('CARGA HORARIA'), participantes = indice('PARTICIPANTES'), local = indice('LOCAL'), tipoInfo = indice('TIPO'), modalidade = indice('MODALIDADE'), objetivo = indice('OBJETIVO'), custo = indice('CUSTO TOTAL'), realizada = indice('DATA REALIZADA'), situacao = indice('STATUS'), comentarios = indice('COMENTARIOS'), categoria = cabecalho.findIndex(valor => valor === 'CATEGORIA');
  const itens = new Map<string, PlanoTreinamentoImportado>();
  linhas.slice(indiceCabecalho + 1).forEach(linha => {
    const codigoTexto = texto(linha[codigo]); const tituloTexto = texto(linha[titulo]); const dataInicio = data(linha[inicio]);
    if (!codigoTexto || !tituloTexto || !dataInicio) return;
    itens.set(codigoTexto, { codigo: codigoTexto, titulo: tituloTexto, responsavel: texto(linha[responsavel]) || null, data_inicio: dataInicio, data_termino: data(linha[termino]), horario: texto(linha[horario]) || null, carga_horaria: cargaHoraria(linha[carga]), participantes_planejados: numero(linha[participantes]), local: texto(linha[local]) || null, tipo_informacao: tipo(linha[tipoInfo]), modalidade: texto(linha[modalidade]) || null, objetivo: texto(linha[objetivo]) || null, custo_total: numero(linha[custo]) || 0, data_realizada: data(linha[realizada]), status: status(linha[situacao]), comentarios: texto(linha[comentarios]) || null, categoria: texto(linha[categoria]) || null });
  });
  return [...itens.values()];
}

function competencia(valor: unknown): string | null {
  if (typeof valor === 'number') {
    const dataExcel = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    return `${dataExcel.getUTCFullYear()}-${String(dataExcel.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  const partes = texto(valor).match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-?(\d{2})$/i);
  if (!partes) return null;
  const meses: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
  return `20${partes[2]}-${meses[partes[1].toUpperCase()]}-01`;
}

export function mapearCronogramaTreinamentos(linhas: unknown[][]): CronogramaTreinamentoImportado[] {
  const indiceCabecalho = linhas.findIndex(linha => chave(linha[0]) === 'DESCRICAO' && linha.some(valor => chave(valor) === 'COTACAO'));
  if (indiceCabecalho < 0) throw new Error('A aba Cronograma não contém as colunas Descrição e Cotação.');
  const cabecalho = linhas[indiceCabecalho];
  const meses = cabecalho.map((valor, index) => ({ competencia: competencia(valor), index })).filter((valor): valor is { competencia: string; index: number } => Boolean(valor.competencia));
  const itens = new Map<string, CronogramaTreinamentoImportado>();
  linhas.slice(indiceCabecalho + 1).forEach(linha => {
    const descricao = texto(linha[0]); const cotacao = numero(linha[1]);
    if (!descricao || cotacao === null) return;
    const chaveItem = `${chave(descricao)}|${cotacao}|${numero(linha[3]) || 0}`;
    const mesesPlanejados = meses.map(({ competencia: mes, index }) => ({ competencia: mes, quantidade: numero(linha[index]) || 0 })).filter(item => item.quantidade > 0);
    itens.set(chaveItem, { chave: chaveItem, descricao, cotacao, unidade_mes: numero(linha[3]) || 0, quantidade_total: numero(linha[4]) || 0, meses: mesesPlanejados });
  });
  return [...itens.values()];
}

/**
 * Leitura da aba operacional `Tarefas` do plano de treinamentos do RH.
 *
 * O arquivo oficial tem linhas de título antes do cabeçalho e alterna entre
 * códigos (P/B/S) e descrições completas. Esta camada converte os dois casos
 * para o contrato persistido em `rh_treinamentos`, sem depender de React ou
 * Supabase.
 */

export type TipoPlanejamentoTreinamento = 'P' | 'NP' | 'RP';
export type TipoTreinamento = 'B' | 'T.E' | 'T.L' | '';

export interface TreinamentoImportado {
  data_treinamento: string;
  dia_semana: string;
  semana: string;
  tipo_planejamento: TipoPlanejamentoTreinamento;
  treinamento: string;
  turma_horario: string;
  tipo_treinamento: TipoTreinamento;
  data_eficacia: string | null;
  realizado: boolean;
}

export interface ResultadoImportacaoTreinamentos {
  itens: TreinamentoImportado[];
  linhasLidas: number;
  linhasIgnoradas: number;
  duplicadas: number;
}

export function normalizarCabecalhoTreinamento(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function formatarDataUtc(data: Date): string {
  return [data.getUTCFullYear(), String(data.getUTCMonth() + 1).padStart(2, '0'), String(data.getUTCDate()).padStart(2, '0')].join('-');
}

/** Converte datas Excel, ISO e datas brasileiras sem usar parsing dependente de fuso. */
export function normalizarDataTreinamento(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return formatarDataUtc(valor);
  }

  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    return Number.isNaN(data.getTime()) ? null : formatarDataUtc(data);
  }

  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  const brasileira = texto.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})/);
  if (!brasileira) return null;
  const [, dia, mes, anoTexto] = brasileira;
  const ano = anoTexto.length === 2 ? Number(anoTexto) + 2000 : Number(anoTexto);
  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function indiceCabecalho(cabecalhos: string[], predicate: (valor: string) => boolean): number {
  return cabecalhos.findIndex(predicate);
}

function texto(valor: unknown): string {
  return String(valor ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizarPlanejamento(valor: unknown): TipoPlanejamentoTreinamento {
  const bruto = normalizarCabecalhoTreinamento(valor);
  if (bruto === 'np' || bruto.includes('naoprogramado')) return 'NP';
  if (bruto === 'rp' || bruto.includes('reprogramado')) return 'RP';
  return 'P';
}

function normalizarTipo(valor: unknown): TipoTreinamento {
  const bruto = normalizarCabecalhoTreinamento(valor);
  if (bruto === 'b' || bruto.includes('basico')) return 'B';
  if (bruto === 'te' || bruto.includes('evolucao')) return 'T.E';
  if (bruto === 'tl' || bruto.includes('legais')) return 'T.L';
  return '';
}

function normalizarRealizado(valor: unknown): boolean {
  const bruto = normalizarCabecalhoTreinamento(valor);
  return ['s', 'sim', 'true', '1', 'realizado'].includes(bruto);
}

function possuiValor(linha: unknown[]): boolean {
  return linha.some(valor => texto(valor) !== '');
}

/**
 * Mapeia uma matriz crua (`header: 1`) da planilha. Linhas antes do cabeçalho
 * são permitidas e a última ocorrência de uma chave composta vence.
 */
export function mapearPlanilhaTreinamentos(linhas: unknown[][]): ResultadoImportacaoTreinamentos {
  if (!linhas?.length) throw new Error('Planilha vazia.');

  const indiceCabecalho = linhas.findIndex(linha => {
    const cabecalhos = linha.map(normalizarCabecalhoTreinamento);
    return cabecalhos.some(valor => valor === 'treinamento')
      && cabecalhos.some(valor => valor.startsWith('datadotreinamento'));
  });
  if (indiceCabecalho === -1) {
    throw new Error('Cabeçalhos obrigatórios não encontrados. Esperado "Data do Treinamento" e "Treinamento".');
  }

  const cabecalhos = linhas[indiceCabecalho].map(normalizarCabecalhoTreinamento);
  const indices = {
    data: indiceCabecalhoFn(cabecalhos, 'datadotreinamento'),
    dia: indiceCabecalhoFn(cabecalhos, 'diadasemana'),
    semana: indiceCabecalhoFn(cabecalhos, 'semana'),
    planejamento: indiceCabecalhoFn(cabecalhos, 'tipodeplanejamento'),
    treinamento: indiceCabecalhoFn(cabecalhos, 'treinamento'),
    horario: indiceCabecalhoFn(cabecalhos, 'turmahorario'),
    tipo: indiceCabecalhoFn(cabecalhos, 'tipodetreinamento'),
    eficacia: indiceCabecalhoFn(cabecalhos, 'datadaeficacia'),
    realizado: indiceCabecalhoFn(cabecalhos, 'treinamentorealizado'),
  };

  const dados = linhas.slice(indiceCabecalho + 1).filter(possuiValor);
  const porChave = new Map<string, TreinamentoImportado>();
  let linhasIgnoradas = 0;
  let duplicadas = 0;

  for (const linha of dados) {
    const data = normalizarDataTreinamento(linha[indices.data]);
    const nome = texto(linha[indices.treinamento]);
    if (!data || !nome) {
      linhasIgnoradas += 1;
      continue;
    }

    const item: TreinamentoImportado = {
      data_treinamento: data,
      dia_semana: texto(linha[indices.dia]),
      semana: texto(linha[indices.semana]),
      tipo_planejamento: normalizarPlanejamento(linha[indices.planejamento]),
      treinamento: nome,
      turma_horario: texto(linha[indices.horario]),
      tipo_treinamento: normalizarTipo(linha[indices.tipo]),
      data_eficacia: normalizarDataTreinamento(linha[indices.eficacia]),
      realizado: normalizarRealizado(linha[indices.realizado]),
    };
    const chave = [item.data_treinamento, item.treinamento, item.turma_horario, item.tipo_planejamento, item.tipo_treinamento].join('|');
    if (porChave.has(chave)) duplicadas += 1;
    porChave.set(chave, item);
  }

  return {
    itens: Array.from(porChave.values()),
    linhasLidas: dados.length,
    linhasIgnoradas,
    duplicadas,
  };
}

function indiceCabecalhoFn(cabecalhos: string[], inicio: string): number {
  return indiceCabecalho(cabecalhos, valor => valor === inicio || valor.startsWith(inicio));
}

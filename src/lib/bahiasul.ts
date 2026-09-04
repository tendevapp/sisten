/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapeamento e parsing das colunas da planilha de entregas da transportadora Bahia Sul (CTe)
 * para a tabela `sup_bahiasul_entregas`.
 */

import { BahiaSulEntrega, SAPPedido, TabelaFrete, FreteCalculadoDetalhes, StatusAuditoriaFrete } from '../types';

export interface ColumnDefinition {
  field: keyof BahiaSulEntrega;
  header: string;
  aliases: string[];
}

export const BAHIASUL_COLUMNS: ColumnDefinition[] = [
  { field: 'cto_documento', header: 'CTO_DOCUMENTO', aliases: ['cto_documento', 'cto documento', 'documento', 'tipo documento', 'tp. documento', 'tpo_documento'] },
  { field: 'cto_filial', header: 'CTO_FILIAL', aliases: ['cto_filial', 'cto filial', 'filial', 'filial cto', 'filial emissora'] },
  { field: 'cto_serie', header: 'CTO_SERIE', aliases: ['cto_serie', 'cto serie', 'serie', 'serie cto', 'serie cte'] },
  { field: 'cto_numero', header: 'CTO_NUMERO', aliases: ['cto_numero', 'cto numero', 'numero cto', 'cte', 'numero cte', 'nro cto', 'conhecimento'] },
  { field: 'tpo_embarque', header: 'TPO_EMBARQUE', aliases: ['tpo_embarque', 'tpo embarque', 'tipo embarque', 'tipo de embarque'] },
  { field: 'rmt_nome', header: 'RMT_NOME', aliases: ['rmt_nome', 'rmt nome', 'remetente', 'nome remetente', 'razao remetente', 'fornecedor'] },
  { field: 'rmt_cnpj', header: 'RMT_CNPJ', aliases: ['rmt_cnpj', 'rmt cnpj', 'cnpj remetente', 'cpf/cnpj remetente', 'cnpj fornecedor'] },
  { field: 'dst_nome', header: 'DST_NOME', aliases: ['dst_nome', 'dst nome', 'destinatario', 'nome destinatario', 'razao destinatario', 'cliente'] },
  { field: 'dst_cnpj', header: 'DST_CNPJ', aliases: ['dst_cnpj', 'dst cnpj', 'cnpj destinatario', 'cpf/cnpj destinatario'] },
  { field: 'emissao', header: 'EMISSAO', aliases: ['emissao', 'data emissao', 'dt. emissao', 'dt emissao', 'data de emissao'] },
  { field: 'referencia', header: 'REFERENCIA', aliases: ['referencia', 'ref', 'data referencia', 'dt. referencia', 'dt referencia'] },
  { field: 'prz_contratado', header: 'PRZ_CONTRATADO', aliases: ['prz_contratado', 'prz contratado', 'prazo contratado', 'prz. contratado', 'dt prazo contratado'] },
  { field: 'embarque', header: 'EMBARQUE', aliases: ['embarque', 'data embarque', 'dt. embarque', 'dt embarque'] },
  { field: 'prv_chegada', header: 'PRV_CHEGADA', aliases: ['prv_chegada', 'prv chegada', 'previsao chegada', 'prev. chegada', 'prev chegada', 'dt prv chegada'] },
  { field: 'chegada', header: 'CHEGADA', aliases: ['chegada', 'data chegada', 'dt. chegada', 'dt chegada'] },
  { field: 'prv_entrega', header: 'PRV_ENTREGA', aliases: ['prv_entrega', 'prv entrega', 'previsao entrega', 'prev. entrega', 'prev entrega', 'dt prv entrega'] },
  { field: 'entrega', header: 'ENTREGA', aliases: ['entrega', 'data entrega', 'dt. entrega', 'dt entrega'] },
  { field: 'situacao', header: 'SITUACAO', aliases: ['situacao', 'status', 'situacao entrega', 'status cto'] },
  { field: 'org_cidade', header: 'ORG_CIDADE', aliases: ['org_cidade', 'org cidade', 'cidade origem', 'origem cidade', 'origem', 'org uf'] },
  { field: 'dst_cidade', header: 'DST_CIDADE', aliases: ['dst_cidade', 'dst cidade', 'cidade destino', 'destino cidade', 'destino', 'dst uf'] },
  { field: 'nfs_embarcadas', header: 'NFS_EMBARCADAS', aliases: ['nfs_embarcadas', 'nfs embarcadas', 'nf', 'nfs', 'notas fiscais', 'nro nfs', 'nf-e', 'nfe'] },
  { field: 'kgs_declarado', header: 'KGS_DECLARADO', aliases: ['kgs_declarado', 'kgs declarado', 'peso declarado', 'peso decl', 'kg declarado'] },
  { field: 'kgs_real', header: 'KGS_REAL', aliases: ['kgs_real', 'kgs real', 'peso real', 'kg real', 'peso'] },
  { field: 'kgs_cubado', header: 'KGS_CUBADO', aliases: ['kgs_cubado', 'kgs cubado', 'peso cubado', 'kg cubado', 'cubagem kg'] },
  { field: 'qtd_volumes', header: 'QTD_VOLUMES', aliases: ['qtd_volumes', 'qtd volumes', 'volumes', 'volume', 'qtd vol', 'quantidade volumes'] },
  { field: 'vlr_mercadoria', header: 'VLR_MERCADORIA', aliases: ['vlr_mercadoria', 'vlr mercadoria', 'valor mercadoria', 'valor carga', 'vlr carga'] },
  { field: 'frt_cobrado', header: 'FRT_COBRADO', aliases: ['frt_cobrado', 'frt cobrado', 'frete cobrado', 'valor frete', 'vlr frete', 'frete'] },
  { field: 'obs_diversos', header: 'OBS_DIVERSOS', aliases: ['obs_diversos', 'obs diversos', 'observacoes', 'obs', 'observacao', 'obs. diversos'] },
  { field: 'nro_pedido', header: 'NRO_PEDIDO', aliases: ['nro_pedido', 'nro pedido', 'numero pedido', 'pedido', 'pedido compras', 'num pedido', 'po'] },
];

const DATE_FIELDS = new Set<keyof BahiaSulEntrega>([
  'emissao', 'referencia', 'prz_contratado', 'embarque', 'prv_chegada', 'chegada', 'prv_entrega', 'entrega'
]);

const NUMERIC_FIELDS = new Set<keyof BahiaSulEntrega>([
  'kgs_declarado', 'kgs_real', 'kgs_cubado', 'vlr_mercadoria', 'frt_cobrado'
]);

const INTEGER_FIELDS = new Set<keyof BahiaSulEntrega>([
  'qtd_volumes'
]);

/**
 * Remove acentos e converte string para minusculo para comparacao semantica
 */
export function normalizeHeader(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Converte data para ISO YYYY-MM-DD
 * Suporta:
 * - Serial number do Excel (ex: 46262)
 * - Strings em padrao brasileiro (DD/MM/AAAA, DD-MM-AAAA, DD.MM.AAAA)
 * - Strings ISO (YYYY-MM-DD)
 */
export function parseBahiaSulDate(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;

  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    // Serial do Excel: 1 = 1899-12-31 (com bug de 1900)
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString().split('T')[0];
  }

  const s = String(val).trim();
  if (!s) return null;

  // DD/MM/AAAA
  const brMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    let year = brMatch[3];
    if (year.length === 2) {
      const yNum = Number(year);
      year = yNum >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Converte string ou numero para float.
 * Trata padrao brasileiro ("16.298,23", "36,846", "1142,69") e valores numericos.
 */
export function parseBahiaSulNumber(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;

  let s = String(val).trim();
  if (!s) return null;

  // Trata parenteses contabeis: (123,45) -> -123,45
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Se tiver virgula, ponto e separador de milhar e virgula e decimal
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/**
 * Converte valor para inteiro ou null
 */
export function parseBahiaSulInt(val: unknown): number | null {
  const n = parseBahiaSulNumber(val);
  if (n === null) return null;
  return Math.round(n);
}

/**
 * Gera chave unica deterministica para o CTe
 * Ex: BHZ_1_42383
 */
export function generateBahiaSulKey(filial: unknown, serie: unknown, numero: unknown): string {
  const f = String(filial ?? '').trim().toUpperCase();
  const s = String(serie ?? '').trim().toUpperCase();
  const n = String(numero ?? '').trim();
  return `${f}_${s}_${n}`;
}

/**
 * Localiza o mapa de indices das colunas a partir de uma linha de cabecalho
 */
export function buildHeaderIndexMap(headerRow: unknown[]): Map<keyof BahiaSulEntrega, number> {
  const map = new Map<keyof BahiaSulEntrega, number>();

  headerRow.forEach((colVal, colIdx) => {
    const normalized = normalizeHeader(colVal);
    if (!normalized) return;

    for (const def of BAHIASUL_COLUMNS) {
      if (map.has(def.field)) continue;

      const directNorm = normalizeHeader(def.header);
      const isMatch = normalized === directNorm || def.aliases.some(alias => normalizeHeader(alias) === normalized);

      if (isMatch) {
        map.set(def.field, colIdx);
        break;
      }
    }
  });

  return map;
}

/**
 * Processa matriz bruta de celulas (obtida via XLSX sheet_to_json({ header: 1 }) ou CSV split)
 */
export function parseBahiaSulRows(rawRows: unknown[][]): {
  validRows: BahiaSulEntrega[];
  totalRows: number;
  headerRowIndex: number;
  errors: string[];
} {
  const errors: string[] = [];
  if (!rawRows || rawRows.length === 0) {
    return { validRows: [], totalRows: 0, headerRowIndex: -1, errors: ['A planilha está vazia.'] };
  }

  // 1. Encontra a linha de cabecalho (deve conter pelo menos CTO_NUMERO ou CONHECIMENTO)
  let headerRowIndex = -1;
  let headerMap = new Map<keyof BahiaSulEntrega, number>();

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;

    const candidateMap = buildHeaderIndexMap(row);
    // Para ser considerado cabecalho valido, deve identificar ao menos cto_numero e mais 2 colunas
    if (candidateMap.has('cto_numero') && candidateMap.size >= 3) {
      headerRowIndex = i;
      headerMap = candidateMap;
      break;
    }
  }

  if (headerRowIndex === -1) {
    return {
      validRows: [],
      totalRows: rawRows.length,
      headerRowIndex: -1,
      errors: ['Não foi possível identificar o cabeçalho da planilha da Bahia Sul (colunas como CTO_NUMERO, CTO_FILIAL, etc.).']
    };
  }

  const validRows: BahiaSulEntrega[] = [];
  const totalDataRows = rawRows.length - (headerRowIndex + 1);

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Se toda a linha for vazia, ignora
    const hasAnyVal = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasAnyVal) continue;

    const getVal = (field: keyof BahiaSulEntrega): unknown => {
      const colIdx = headerMap.get(field);
      return colIdx !== undefined ? row[colIdx] : undefined;
    };

    const ctoNumeroRaw = getVal('cto_numero');
    const ctoNumero = String(ctoNumeroRaw ?? '').trim();
    if (!ctoNumero) {
      // Linha sem numero de CTe nao e valida
      continue;
    }

    const filial = String(getVal('cto_filial') ?? '').trim();
    const serie = String(getVal('cto_serie') ?? '').trim();
    const chaveUnica = generateBahiaSulKey(filial, serie, ctoNumero);

    const entrega: BahiaSulEntrega = {
      cto_documento: String(getVal('cto_documento') ?? '').trim() || null,
      cto_filial: filial || null,
      cto_serie: serie || null,
      cto_numero: ctoNumero,
      tpo_embarque: String(getVal('tpo_embarque') ?? '').trim() || null,
      rmt_nome: String(getVal('rmt_nome') ?? '').trim() || null,
      rmt_cnpj: String(getVal('rmt_cnpj') ?? '').trim() || null,
      dst_nome: String(getVal('dst_nome') ?? '').trim() || null,
      dst_cnpj: String(getVal('dst_cnpj') ?? '').trim() || null,
      emissao: parseBahiaSulDate(getVal('emissao')),
      referencia: parseBahiaSulDate(getVal('referencia')),
      prz_contratado: parseBahiaSulDate(getVal('prz_contratado')),
      embarque: parseBahiaSulDate(getVal('embarque')),
      prv_chegada: parseBahiaSulDate(getVal('prv_chegada')),
      chegada: parseBahiaSulDate(getVal('chegada')),
      prv_entrega: parseBahiaSulDate(getVal('prv_entrega')),
      entrega: parseBahiaSulDate(getVal('entrega')),
      situacao: String(getVal('situacao') ?? '').trim() || null,
      org_cidade: String(getVal('org_cidade') ?? '').trim() || null,
      dst_cidade: String(getVal('dst_cidade') ?? '').trim() || null,
      nfs_embarcadas: String(getVal('nfs_embarcadas') ?? '').trim() || null,
      kgs_declarado: parseBahiaSulNumber(getVal('kgs_declarado')),
      kgs_real: parseBahiaSulNumber(getVal('kgs_real')),
      kgs_cubado: parseBahiaSulNumber(getVal('kgs_cubado')),
      qtd_volumes: parseBahiaSulInt(getVal('qtd_volumes')),
      vlr_mercadoria: parseBahiaSulNumber(getVal('vlr_mercadoria')),
      frt_cobrado: parseBahiaSulNumber(getVal('frt_cobrado')),
      obs_diversos: String(getVal('obs_diversos') ?? '').trim() || null,
      nro_pedido: String(getVal('nro_pedido') ?? '').trim() || null,
      chave_unica: chaveUnica,
    };

    validRows.push(entrega);
  }

  return {
    validRows,
    totalRows: totalDataRows,
    headerRowIndex,
    errors,
  };
}

export interface BahiaSulEnriquecida extends BahiaSulEntrega {
  pedidoSap?: SAPPedido | null;
  pedidoEncontrado: boolean;
  statusPrazo: 'entregue' | 'no_prazo' | 'atrasado' | 'sem_previsao';
  diasAtraso?: number;
  freteCalculado?: FreteCalculadoDetalhes;
}

export interface BahiaSulKpis {
  totalCte: number;
  emTransito: number;
  aEntregar: number;
  entregues: number;
  outrosStatus: number;
  totalFreteCobrado: number;
  totalFreteCalculado: number;
  divergenciaLiquida: number;
  qtdSobrepreco: number;
  qtdConforme: number;
  qtdDesconto: number;
  qtdSemRota: number;
  totalPesoReal: number;
  totalPesoCubado: number;
  totalVolumes: number;
  totalValorMercadoria: number;
  vinculadosSap: number;
  taxaVinculoPct: number;
  atrasados: number;
}

/**
 * Normaliza numero de pedido de compras SAP para comparacao sem zeros a esquerda e sem sufixos
 */
export function normalizePoNumber(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (!s) return '';
  // Se contiver barra ou traco (ex: 4500123456/1), pega a primeira parte
  const base = s.split(/[\/\- ]/)[0].trim();
  return base.replace(/^0+/, '');
}

/**
 * Normaliza localidade extraindo nome da cidade e UF
 */
export function normalizarLocalidade(str: unknown): { cidade: string; uf: string } {
  if (!str) return { cidade: '', uf: '' };
  const raw = String(str).trim().toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const partes = raw.split(/[\/\-]/);
  if (partes.length >= 2) {
    const cid = partes[0].trim().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ');
    const uf = partes[1].trim().replace(/[^A-Z]/g, '').slice(0, 2);
    return { cidade: cid, uf };
  }

  return { cidade: raw.replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' '), uf: '' };
}

/**
 * Localiza a rota correspondente na tabela de frete
 */
export function matchRotaTabelaFrete(
  orgCidade: unknown,
  dstCidade: unknown,
  tabelaList: TabelaFrete[]
): TabelaFrete | null {
  if (!tabelaList || tabelaList.length === 0) return null;

  const orgNorm = normalizarLocalidade(orgCidade);
  const dstNorm = normalizarLocalidade(dstCidade);

  if (!orgNorm.cidade) return null;

  // Destino padrao da fabrica/obra TEN e Jacobina
  const destAlvo = dstNorm.cidade === 'TEN' || !dstNorm.cidade ? 'JACOBINA' : dstNorm.cidade;

  // 1. Casamento exato por cidade de origem, UF e destino
  const exato = tabelaList.find(r => {
    const rOrg = normalizarLocalidade(r.origem).cidade;
    const rDst = normalizarLocalidade(r.destino).cidade;
    const rUf = (r.uf || '').toUpperCase().trim();

    const matchOrigem = rOrg === orgNorm.cidade;
    const matchUf = !orgNorm.uf || !rUf || rUf === orgNorm.uf;
    const matchDest = !destAlvo || rDst === destAlvo || (destAlvo === 'JACOBINA' && rDst.includes('JACOBINA'));

    return matchOrigem && matchUf && matchDest;
  });
  if (exato) return exato;

  // 2. Casamento exato por cidade de origem e UF (independente do destino registrado na tabela)
  const exatoOrigemUf = tabelaList.find(r => {
    const rOrg = normalizarLocalidade(r.origem).cidade;
    const rUf = (r.uf || '').toUpperCase().trim();
    return rOrg === orgNorm.cidade && (!orgNorm.uf || !rUf || rUf === orgNorm.uf);
  });
  if (exatoOrigemUf) return exatoOrigemUf;

  // 3. Casamento por inclusao parcial (substring)
  const parcial = tabelaList.find(r => {
    const rOrg = normalizarLocalidade(r.origem).cidade;
    const rUf = (r.uf || '').toUpperCase().trim();
    const matchUf = !orgNorm.uf || !rUf || rUf === orgNorm.uf;
    return matchUf && (rOrg.includes(orgNorm.cidade) || orgNorm.cidade.includes(rOrg));
  });
  if (parcial) return parcial;

  // 4. Se for rota de retorno (ex: Jacobina para Sorocaba), tenta inverter
  if (orgNorm.cidade === 'JACOBINA') {
    const inverso = tabelaList.find(r => {
      const rOrg = normalizarLocalidade(r.origem).cidade;
      const rUf = (r.uf || '').toUpperCase().trim();
      const matchDest = dstNorm.cidade ? rOrg === dstNorm.cidade : false;
      const matchUf = !dstNorm.uf || !rUf || rUf === dstNorm.uf;
      return matchDest && matchUf;
    });
    if (inverso) return inverso;
  }

  return null;
}

/**
 * Calcula o frete contratual com base nos criterios do simulador de frete
 */
export function calcularFreteContratual(
  entrega: BahiaSulEntrega,
  tabelaFreteList: TabelaFrete[]
): FreteCalculadoDetalhes {
  const rota = matchRotaTabelaFrete(entrega.org_cidade, entrega.dst_cidade, tabelaFreteList);
  const frtCobrado = Number(entrega.frt_cobrado) || 0;

  // Peso tarifado: maior valor entre real, cubado e declarado
  const peso = Math.max(
    0,
    Number(entrega.kgs_real) || 0,
    Number(entrega.kgs_cubado) || 0,
    Number(entrega.kgs_declarado) || 0
  );
  const vMerc = Math.max(0, Number(entrega.vlr_mercadoria) || 0);

  if (!rota) {
    return {
      rotaEncontrada: null,
      pesoConsiderado: peso,
      vlrMercadoria: vMerc,
      modalidade: 'fracionado',
      faixaDesc: 'Rota nao localizada na tabela',
      freteBase: 0,
      adValoresPct: 0,
      adValoresValor: 0,
      pedagioTotal: 0,
      fracoes100kg: 0,
      cat: 0,
      itrTas: 0,
      taxaFixa: 0,
      subtotalSemIcms: 0,
      icmsPct: 0,
      valorIcms: 0,
      totalComIcms: 0,
      frtCobrado,
      diferenca: 0,
      diferencaPct: 0,
      statusAuditoria: frtCobrado > 0 ? 'sem_rota' : 'sem_cobranca',
    };
  }

  // Modalidade de transporte
  const isDedicado = (entrega.tpo_embarque || '').toUpperCase().includes('DEDICADO');
  const modalidade: 'fracionado' | 'dedicado' = isDedicado ? 'dedicado' : 'fracionado';

  // 1. Frete Base / Frete Peso
  let freteBase = 0;
  let faixaDesc = '';

  if (modalidade === 'fracionado') {
    if (peso <= 10) {
      freteBase = Number(rota.kg_1_10) || 0;
      faixaDesc = 'Faixa 1 - 10 kg';
    } else if (peso <= 20) {
      freteBase = Number(rota.kg_11_20) || 0;
      faixaDesc = 'Faixa 11 - 20 kg';
    } else if (peso <= 30) {
      freteBase = Number(rota.kg_21_30) || 0;
      faixaDesc = 'Faixa 21 - 30 kg';
    } else if (peso <= 50) {
      freteBase = Number(rota.kg_31_50) || 0;
      faixaDesc = 'Faixa 31 - 50 kg';
    } else if (peso <= 70) {
      freteBase = Number(rota.kg_51_70) || 0;
      faixaDesc = 'Faixa 51 - 70 kg';
    } else if (peso <= 100) {
      freteBase = Number(rota.kg_71_100) || 0;
      faixaDesc = 'Faixa 71 - 100 kg';
    } else {
      const taxaExcedente = Number(rota.kg_acima_100) || 0;
      if (taxaExcedente > 0) {
        freteBase = taxaExcedente * peso;
        faixaDesc = `Acima de 100 kg (R$ ${taxaExcedente.toFixed(2)}/kg x ${peso.toFixed(1)}kg)`;
      } else {
        freteBase = Number(rota.kg_71_100) || 0;
        faixaDesc = 'Acima de 100 kg (Teto 100kg)';
      }
    }
  } else {
    freteBase = Number(rota.fiorino) || 0;
    faixaDesc = 'Veiculo Dedicado';
  }

  // 2. Ad Valorem (taxa sobre o valor da carga)
  const rawAdVal = Number(rota.ad_valores) || 0;
  const adValoresPct = rawAdVal < 0.05 && rawAdVal > 0 ? Number((rawAdVal * 100).toFixed(4)) : rawAdVal;
  const adValoresValor = (vMerc * adValoresPct) / 100;

  // 3. Pedagio por fracao de 100kg
  const taxaPedagioFracao = Number(rota.pedagio_fracao_100kg) || 0;
  const fracoes100kg = Math.ceil(peso / 100) || 1;
  const pedagioTotal = fracoes100kg * taxaPedagioFracao;

  // 4. Taxas fixas e contratuais
  const cat = Number(rota.cat) || 0;
  const itrTas = Number(rota.itr_tas) || 0;
  const taxaFixa = Number(rota.taxa_fixa_itr_redespacho) || 0;

  // 5. Subtotal Sem ICMS
  const subtotalSemIcms = freteBase + adValoresValor + pedagioTotal + cat + itrTas + taxaFixa;

  // 6. ICMS (calculo por dentro)
  const icmsCleanStr = String(rota.icms_aplicado || '').replace(/%/g, '').replace(',', '.').trim();
  const rawIcms = parseFloat(icmsCleanStr) || 0;
  const icmsPct = rawIcms <= 1 && rawIcms > 0 ? Number((rawIcms * 100).toFixed(4)) : rawIcms;

  let totalComIcms = subtotalSemIcms;
  let valorIcms = 0;

  if (icmsPct > 0 && icmsPct < 100) {
    totalComIcms = subtotalSemIcms / (1 - (icmsPct / 100));
    valorIcms = totalComIcms - subtotalSemIcms;
  }

  // 7. Comparativo e Auditoria
  const diferenca = frtCobrado > 0 ? frtCobrado - totalComIcms : 0;
  const diferencaPct = totalComIcms > 0 && frtCobrado > 0 ? ((frtCobrado - totalComIcms) / totalComIcms) * 100 : 0;

  let statusAuditoria: StatusAuditoriaFrete = 'conforme';
  if (frtCobrado <= 0) {
    statusAuditoria = 'sem_cobranca';
  } else if (diferenca > 1.00 && diferencaPct > 1.5) {
    statusAuditoria = 'sobrepreco';
  } else if (diferenca < -1.00 && diferencaPct < -1.5) {
    statusAuditoria = 'desconto';
  } else {
    statusAuditoria = 'conforme';
  }

  return {
    rotaEncontrada: rota,
    pesoConsiderado: peso,
    vlrMercadoria: vMerc,
    modalidade,
    faixaDesc,
    freteBase,
    adValoresPct,
    adValoresValor,
    pedagioTotal,
    fracoes100kg,
    cat,
    itrTas,
    taxaFixa,
    subtotalSemIcms,
    icmsPct,
    valorIcms,
    totalComIcms,
    frtCobrado,
    diferenca,
    diferencaPct,
    statusAuditoria,
  };
}

/**
 * Determina o status do prazo de entrega
 */
export function getStatusPrazo(entrega: BahiaSulEntrega, hojeStr?: string): { status: 'entregue' | 'no_prazo' | 'atrasado' | 'sem_previsao'; diasAtraso: number } {
  const situacao = (entrega.situacao || '').toUpperCase();
  if (situacao.includes('ENTREGUE') || entrega.entrega) {
    return { status: 'entregue', diasAtraso: 0 };
  }

  const prev = entrega.prv_entrega || entrega.prv_chegada || entrega.prz_contratado;
  if (!prev) {
    return { status: 'sem_previsao', diasAtraso: 0 };
  }

  const hoje = hojeStr ? new Date(hojeStr) : new Date();
  hoje.setHours(0, 0, 0, 0);

  const prevDate = new Date(prev + 'T00:00:00');
  if (isNaN(prevDate.getTime())) {
    return { status: 'sem_previsao', diasAtraso: 0 };
  }

  const diffMs = hoje.getTime() - prevDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return { status: 'atrasado', diasAtraso: diffDays };
  }

  return { status: 'no_prazo', diasAtraso: 0 };
}

/**
 * Cruza a base de entregas da Bahia Sul com a lista de pedidos do SAP e a tabela de frete contratual
 */
export function enriquecerEntregasComPedidos(
  entregas: BahiaSulEntrega[],
  pedidosSap: SAPPedido[],
  tabelaFreteList: TabelaFrete[] = []
): BahiaSulEnriquecida[] {
  // Cria mapa de pedidos por PO normalizado
  const mapPedidos = new Map<string, SAPPedido>();

  pedidosSap.forEach(ped => {
    if (ped.documento_compra) {
      const norm = normalizePoNumber(ped.documento_compra);
      if (norm && !mapPedidos.has(norm)) {
        mapPedidos.set(norm, ped);
      }
    }
  });

  return entregas.map(ent => {
    let pedidoSap: SAPPedido | null = null;
    let pedidoEncontrado = false;

    if (ent.nro_pedido) {
      const normEnt = normalizePoNumber(ent.nro_pedido);
      if (normEnt && mapPedidos.has(normEnt)) {
        pedidoSap = mapPedidos.get(normEnt)!;
        pedidoEncontrado = true;
      }
    }

    const { status: statusPrazo, diasAtraso } = getStatusPrazo(ent);
    const freteCalculado = calcularFreteContratual(ent, tabelaFreteList);

    return {
      ...ent,
      pedidoSap,
      pedidoEncontrado,
      statusPrazo,
      diasAtraso,
      freteCalculado,
    };
  });
}

/**
 * Calcula os indicadores executivos e KPIs da base Bahia Sul incluindo auditoria de frete
 */
export function calcularKpisBahiaSul(entregas: BahiaSulEnriquecida[]): BahiaSulKpis {
  let emTransito = 0;
  let aEntregar = 0;
  let entregues = 0;
  let outrosStatus = 0;
  let totalFreteCobrado = 0;
  let totalFreteCalculado = 0;
  let totalPesoReal = 0;
  let totalPesoCubado = 0;
  let totalVolumes = 0;
  let totalValorMercadoria = 0;
  let vinculadosSap = 0;
  let atrasados = 0;
  let qtdSobrepreco = 0;
  let qtdConforme = 0;
  let qtdDesconto = 0;
  let qtdSemRota = 0;

  entregas.forEach(it => {
    const sit = (it.situacao || '').toUpperCase();
    if (sit.includes('TRANSITO')) {
      emTransito++;
    } else if (sit.includes('A ENTREGAR')) {
      aEntregar++;
    } else if (sit.includes('ENTREGUE')) {
      entregues++;
    } else {
      outrosStatus++;
    }

    if (it.statusPrazo === 'atrasado') {
      atrasados++;
    }

    if (it.pedidoEncontrado || Boolean(it.nro_pedido)) {
      vinculadosSap++;
    }

    totalFreteCobrado += it.frt_cobrado || 0;
    totalPesoReal += it.kgs_real || 0;
    totalPesoCubado += it.kgs_cubado || 0;
    totalVolumes += it.qtd_volumes || 0;
    totalValorMercadoria += it.vlr_mercadoria || 0;

    if (it.freteCalculado) {
      if (it.freteCalculado.statusAuditoria === 'sobrepreco') {
        qtdSobrepreco++;
      } else if (it.freteCalculado.statusAuditoria === 'conforme') {
        qtdConforme++;
      } else if (it.freteCalculado.statusAuditoria === 'desconto') {
        qtdDesconto++;
      } else if (it.freteCalculado.statusAuditoria === 'sem_rota') {
        qtdSemRota++;
      }

      if (it.freteCalculado.rotaEncontrada) {
        totalFreteCalculado += it.freteCalculado.totalComIcms;
      }
    }
  });

  const totalCte = entregas.length;
  const taxaVinculoPct = totalCte > 0 ? Math.round((vinculadosSap / totalCte) * 100) : 0;
  const divergenciaLiquida = totalFreteCobrado - totalFreteCalculado;

  return {
    totalCte,
    emTransito,
    aEntregar,
    entregues,
    outrosStatus,
    totalFreteCobrado,
    totalFreteCalculado,
    divergenciaLiquida,
    qtdSobrepreco,
    qtdConforme,
    qtdDesconto,
    qtdSemRota,
    totalPesoReal,
    totalPesoCubado,
    totalVolumes,
    totalValorMercadoria,
    vinculadosSap,
    taxaVinculoPct,
    atrasados,
  };
}

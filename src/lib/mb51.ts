/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapeamento e parsing puro das colunas do relatório SAP MB51 (Movimentação de Estoque)
 * para a tabela `mb51_mov_estoque`.
 */

export const MB51_COLUMNS: { header: string; field: string; aliases?: string[] }[] = [
  { header: 'Centro', field: 'centro', aliases: ['cen.', 'cen'] },
  { header: 'Depósito', field: 'deposito', aliases: ['deposito', 'dep.', 'dep'] },
  { header: 'Referência', field: 'referencia', aliases: ['referencia', 'ref.', 'ref'] },
  { header: 'Doc.material', field: 'doc_material', aliases: ['doc. material', 'doc.material', 'documento material', 'doc.mat.', 'doc material'] },
  { header: 'Pedido', field: 'pedido', aliases: ['nº pedido', 'documento de compras', 'doc. compras'] },
  { header: 'Item', field: 'item', aliases: ['item doc.', 'item do documento'] },
  { header: 'Material', field: 'material', aliases: ['nº material', 'cód. material', 'cod material'] },
  { header: 'Texto breve material', field: 'texto_breve_material', aliases: ['texto breve do material', 'texto breve', 'txt.breve material', 'txt breve material'] },
  { header: 'Qtd.  UM registro', field: 'qtd_um_registro', aliases: ['qtd. um registro', 'qtd.  um registro', 'qtd. no registro', 'qtd. um reg.', 'qtd um registro', 'quantidade', 'qtd.'] },
  { header: 'Unid.medida básica', field: 'unid_medida_basica', aliases: ['unid. medida básica', 'unidade de medida básica', 'umb', 'unid.medida basica', 'unid medida basica'] },
  { header: 'Montante em MI', field: 'montante_mi', aliases: ['montante mi', 'mont.em mi', 'montante em moeda interna', 'montante em mi (moeda interna)', 'montante'] },
  { header: 'Moeda', field: 'moeda', aliases: ['moeda mi', 'moeda interna'] },
  { header: 'Texto cabeçalho documento', field: 'texto_cabecalho_doc', aliases: ['texto de cabeçalho', 'txt.cabeçalho doc.', 'texto cabecalho doc.', 'txt.cab.doc'] },
  { header: 'Data de lançamento', field: 'data_lancamento', aliases: ['data de lancamento', 'dt.lançamento', 'dt.lancamento', 'data lançamento', 'data lancamento'] },
  { header: 'Tipo de movimento', field: 'tipo_movimento', aliases: ['tipo movimento', 'tp.movimento', 'tp.mov.', 'tmv'] },
  { header: 'Hora do registro', field: 'hora_registro', aliases: ['hora de registro', 'hora registro', 'hora', 'hora reg.'] },
  { header: 'UM registro', field: 'um_registro', aliases: ['unid.medida registro', 'um reg.', 'um', 'unid. registro'] },
  { header: 'Data do documento', field: 'data_documento', aliases: ['data documento', 'dt.documento', 'dt.doc'] },
  { header: 'Data de entrada', field: 'data_entrada', aliases: ['data entrada', 'dt.entrada', 'dt.entr.'] },
  { header: 'Fornecedor', field: 'fornecedor', aliases: ['cód. fornecedor', 'cod. fornecedor', 'forn.'] },
  { header: 'Razão social do fornecedor', field: 'razao_social_fornecedor', aliases: ['razao social do fornecedor', 'nome do fornecedor', 'razao social'] },
  { header: 'Txt.tipo movimento', field: 'txt_tipo_movimento', aliases: ['txt. tipo movimento', 'texto tipo de movimento', 'texto tipo movimento', 'denominacao tipo movimento'] },
  { header: 'Nome do usuário', field: 'nome_usuario', aliases: ['nome de usuário', 'usuário', 'nome do usuario', 'usuario'] },
  { header: 'Posição no depósito', field: 'posicao_deposito', aliases: ['posição depósito', 'posicao no deposito', 'posição', 'posicao'] },
  { header: 'Elemento PEP', field: 'elemento_pep', aliases: ['pep', 'elem. pep', 'elemento pep'] },
  { header: 'Imobilizado', field: 'imobilizado', aliases: ['ativo imobilizado', 'imob.'] },
];

const DATE_FIELDS = new Set([
  'data_lancamento', 'data_documento', 'data_entrada'
]);

const NUMERIC_FIELDS = new Set([
  'qtd_um_registro', 'montante_mi'
]);

// dd.mm.yyyy, dd/mm/yyyy ou dd-mm-yyyy
const BR_DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

/**
 * Converte data para ISO `YYYY-MM-DD`.
 * Trata serial do Excel (número), data em string BR (dd/mm/aaaa) ou ISO (YYYY-MM-DD).
 */
export function excelSerialToISO(val: unknown): string | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) return null;
    const dateObj = new Date((val - 25569) * 86400 * 1000);
    return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s) return null;

  const brMatch = s.match(BR_DATE_RE);
  if (brMatch) {
    const day = brMatch[1].padStart(2, '0');
    const month = brMatch[2].padStart(2, '0');
    const year = brMatch[3];
    return `${year}-${month}-${day}`;
  }

  const isoPart = s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return isoPart;

  return null;
}

// Milhar agrupado sem parte decimal, ex.: "1.234" ou "12.345.678"
const THOUSANDS_ONLY_RE = /^\d{1,3}(\.\d{3})+$/;

/**
 * Converte string ou número para float numérico.
 * Trata padrão brasileiro ("1.234,56", "-1,000", "-5,27") e sinal negativo do SAP antes ou depois.
 */
export function parseMb51Number(val: unknown): number | null {
  if (val === '' || val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  let s = String(val).trim();
  if (!s) return null;

  let negative = false;
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (!s) return null;

  let normalized: string;
  if (s.includes(',')) {
    // Ex: "1.234,56" -> "1234.56" ou "-1,000" -> "-1.000"
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (THOUSANDS_ONLY_RE.test(s)) {
    normalized = s.replace(/\./g, '');
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return negative ? -n : n;
}

/**
 * Gera chave única determinística para a movimentação MB51.
 * Aceita índice de ocorrência para diferenciar múltiplas linhas idênticas no mesmo extrato.
 */
export function generateMb51Key(record: Record<string, any>, occurrence: number = 1): string {
  const docMaterial = String(record.doc_material ?? '').trim();
  const item = String(record.item ?? '0').trim();
  const dtLanc = String(record.data_lancamento ?? '').trim();
  const hrReg = String(record.hora_registro ?? '').trim();
  const tpMov = String(record.tipo_movimento ?? '').trim();
  const mat = String(record.material ?? '').trim();
  const qtd = record.qtd_um_registro !== null && record.qtd_um_registro !== undefined ? String(record.qtd_um_registro) : '';
  const montante = record.montante_mi !== null && record.montante_mi !== undefined ? String(record.montante_mi) : '';
  const dep = String(record.deposito ?? '').trim();
  const pep = String(record.elemento_pep ?? '').trim();
  const ref = String(record.referencia ?? '').trim();

  return `${docMaterial}|${item}|${dtLanc}|${hrReg}|${tpMov}|${mat}|${qtd}|${montante}|${dep}|${pep}|${ref}|${occurrence}`;
}

/**
 * Aplica mapeamento de colunas em uma linha crua da planilha MB51.
 * O occurrenceTracker rastreia linhas repetidas para atribuir índices sequenciais (1, 2, 3...)
 */
export function mapMb51Row(
  headers: string[],
  mappedFields: (string | null)[],
  row: any[],
  occurrenceTracker?: Map<string, number>
): { record: Record<string, any>; camposExtras: Record<string, any> } {
  const record: Record<string, any> = {};
  const camposExtras: Record<string, any> = {};

  row.forEach((val, colIdx) => {
    const field = mappedFields[colIdx];
    const header = headers[colIdx];
    if (field) {
      if (DATE_FIELDS.has(field)) {
        record[field] = excelSerialToISO(val);
      } else if (NUMERIC_FIELDS.has(field)) {
        record[field] = parseMb51Number(val);
      } else {
        const s = val === null || val === undefined ? '' : String(val).trim();
        record[field] = s || null;
      }
    } else if (header) {
      camposExtras[header] = val;
    }
  });

  // Base key para rastreamento de ocorrências
  const baseKey = generateMb51Key(record, 0);
  let occurrence = 1;
  if (occurrenceTracker) {
    occurrence = (occurrenceTracker.get(baseKey) || 0) + 1;
    occurrenceTracker.set(baseKey, occurrence);
  }

  // Gera chave única definitiva com índice de ocorrência
  record.chave_unica = generateMb51Key(record, occurrence);

  return { record, camposExtras };
}


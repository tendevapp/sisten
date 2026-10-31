import * as XLSX from 'xlsx';

export const COLUNAS_BASE_INVENTARIO = [
  'Data', 'Material', 'Descrição', 'Depósito', 'Endereço SAP', 'Qtde Física',
  'Endereço Encontrado', 'Data Validade', 'Stock UL (Dep)', 'Diferença',
  'Status', 'Valor Divergente', 'Nº Contagem',
] as const;

export interface LinhaImportacaoInventario {
  linha: number;
  data: string;
  material: string;
  deposito: string;
  dados: Record<string, string | number | null>;
}
export interface DiferencaImportacaoInventario {
  chave: string;
  linha: number | null;
  data: string;
  material: string;
  deposito: string;
  tipo: 'alterado' | 'ausente';
  campos: { campo: string; anterior: unknown; planilha: unknown }[];
}
export interface ResumoImportacaoInventario {
  total: number;
  novos: number;
  iguais: number;
  alterados: number;
  ausentes: number;
  inseridos: number;
  diferencas: DiferencaImportacaoInventario[];
}

const texto = (v: unknown) => v == null ? '' : String(v).trim();
const normalizar = (v: unknown) => texto(v).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ');

function dataISO(v: unknown): string | null {
  let iso: string | undefined;
  if (typeof v === 'number') {
    iso = XLSX.utils.format_cell({ t: 'n', v, z: 'yyyy-mm-dd' });
  } else {
    const s = texto(v);
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    iso = br ? `${br[3]}-${br[2]}-${br[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

function numero(v: unknown, linha: number, campo: string): number | null {
  if (texto(v) === '') return null;
  const s = texto(v).replace(/\s/g, '');
  const n = typeof v === 'number' ? v : Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  if (!Number.isFinite(n)) throw new Error(`Linha ${linha}: ${campo} inválido.`);
  return n;
}

/** Lê somente a Base lançamento. As duas primeiras linhas são indicadores, não registros. */
export function lerBaseLancamento(bytes: ArrayBuffer | Uint8Array): LinhaImportacaoInventario[] {
  const abas = XLSX.read(bytes, { type: 'array', bookSheets: true });
  const nome = abas.SheetNames.find(n => normalizar(n) === 'base lancamento');
  if (!nome) throw new Error('A aba Base Lançamento não foi encontrada.');
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false, sheets: [nome] });
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, range: 0, defval: null, blankrows: true });
  const cab = linhas[2] ?? [];
  const indices = COLUNAS_BASE_INVENTARIO.map(c => cab.findIndex(v => normalizar(v) === normalizar(c)));
  if (indices.some(i => i < 0)) throw new Error('Cabeçalho da linha 3 incompleto. Confira as 13 colunas da Base Lançamento.');
  const resultado: LinhaImportacaoInventario[] = [];
  linhas.slice(3).forEach((r, i) => {
    const linha = i + 4;
    const valores = indices.map(p => r[p]);
    if (valores.every(v => texto(v) === '')) return;
    const data = dataISO(valores[0]);
    const material = texto(valores[1]);
    if (!data || !material) throw new Error(`Linha ${linha}: data ou material inválido.`);
    if (typeof valores[1] === 'number' && !Number.isSafeInteger(valores[1])) {
      throw new Error(`Linha ${linha}: material longo deve estar como texto no Excel para preservar os dígitos.`);
    }
    const dados: LinhaImportacaoInventario['dados'] = Object.fromEntries(COLUNAS_BASE_INVENTARIO.map((c, p) => [c, texto(valores[p]) || null]));
    dados.Data = data;
    dados.Material = material;
    dados['Depósito'] = texto(valores[3]) ? texto(valores[3]).padStart(4, '0') : null;
    for (const p of [5, 8, 9, 11, 12]) dados[COLUNAS_BASE_INVENTARIO[p]] = numero(valores[p], linha, COLUNAS_BASE_INVENTARIO[p]);
    if (dados['Qtde Física'] != null && Number(dados['Qtde Física']) < 0) throw new Error(`Linha ${linha}: quantidade física negativa.`);
    if (dados['Nº Contagem'] != null && (!Number.isInteger(dados['Nº Contagem']) || Number(dados['Nº Contagem']) < 1)) throw new Error(`Linha ${linha}: número de contagens inválido.`);
    const status = normalizar(valores[10]);
    if (!['ok', 'divergencia'].includes(status)) throw new Error(`Linha ${linha}: status deve ser OK ou Divergência.`);
    dados.Status = status === 'ok' ? 'OK' : 'Divergência';
    // Validades parciais (ano ou mês/ano) são evidências: não inventar um dia.
    const validade = valores[7];
    dados['Data Validade'] = /^\d{4}$/.test(texto(validade)) ? texto(validade) : dataISO(validade) ?? (texto(validade) || null);
    resultado.push({ linha, data, material, deposito: String(dados['Depósito'] ?? '0000'), dados });
  });
  if (!resultado.length) throw new Error('A Base Lançamento não possui registros.');
  return resultado;
}

/** JSON mantém os tipos e evita fórmula executável ao baixar o relatório. */
export function baixarResumoImportacao(resumo: ResumoImportacaoInventario): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(resumo, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resumo-importacao-inventario.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

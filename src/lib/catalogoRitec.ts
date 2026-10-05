import * as XLSX from 'xlsx';
import { supabase } from '../db/supabaseClient';
import { buscarFotosCatalogoPorCodigosSap, type CatalogoItem } from './almoxCatalogoApi';

export interface CatalogoRitecItem {
  id: string;
  codigo_sap: string;
  nivel_2_sap: string | null;
  subcategoria: string | null;
  aplicacao: string | null;
  descricao_sap: string;
  descricao_completa: string | null;
  unidade: string | null;
  ncm: string | null;
  codigo_ritec: string | null;
  codigo_ritec_opcao_preco: string | null;
  referencia: string | null;
  marca: string | null;
  fornecedor: string;
  preco_cif_obra: number | null;
}

export type CatalogoRitecImportItem = Omit<CatalogoRitecItem, 'id'>;

const limpar = (valor: unknown): string | null => {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  return texto || null;
};

export function lerPrecoRitec(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  const texto = limpar(valor);
  if (!texto || texto === '-') return null;
  const semMoeda = texto.replace(/R\$\s?/i, '');
  const temPonto = semMoeda.includes('.');
  const temVirgula = semMoeda.includes(',');
  const ultimoSeparador = Math.max(semMoeda.lastIndexOf('.'), semMoeda.lastIndexOf(','));
  const casasDecimais = semMoeda.length - ultimoSeparador - 1;
  const decimalAmericano = temPonto && (!temVirgula || semMoeda.lastIndexOf('.') > semMoeda.lastIndexOf(','));
  const separadorEhDecimal = (temPonto || temVirgula) && casasDecimais > 0 && casasDecimais <= 2;
  const normalizado = decimalAmericano && separadorEhDecimal
    ? semMoeda.replace(/,/g, '')
    : semMoeda.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

export function parseCatalogoRitec(linhas: unknown[][]): CatalogoRitecImportItem[] {
  const cabecalho = linhas[0]?.map(c => limpar(c)?.toUpperCase() ?? '') ?? [];
  const coluna = (nome: string) => cabecalho.indexOf(nome);
  const indices = {
    codigo_sap: coluna('CÓDIGO AG'), nivel_2_sap: coluna('NÍVEL 2 SAP'), subcategoria: coluna('SUBCATEGORIA'),
    aplicacao: coluna('APLICAÇÃO'), descricao_sap: coluna('DESCRIÇÃO SAP'), descricao_completa: coluna('DESCRIÇÃO COMPLETA'),
    unidade: coluna('UNID.'), ncm: coluna('NCM'), codigo_ritec: coluna('CÓDIGO RITEC'),
    codigo_ritec_opcao_preco: coluna('CÓDIGO RITEC OPÇÃO PREÇO'), referencia: coluna('REFERENCIA'),
    marca: coluna('MARCA'), preco_cif_obra: coluna('NOVO MIX CIF OBRA'),
  } as const;
  if (indices.codigo_sap < 0 || indices.descricao_sap < 0) throw new Error('Planilha sem as colunas Código AG e Descrição SAP.');
  const itens = linhas.slice(1).map(linha => {
    const valor = (chave: keyof typeof indices) => {
      const i = indices[chave];
      return i >= 0 ? linha[i] : null;
    };
    return {
      codigo_sap: limpar(valor('codigo_sap')) ?? '', nivel_2_sap: limpar(valor('nivel_2_sap')),
      subcategoria: limpar(valor('subcategoria')), aplicacao: limpar(valor('aplicacao')),
      descricao_sap: limpar(valor('descricao_sap')) ?? '', descricao_completa: limpar(valor('descricao_completa')),
      unidade: limpar(valor('unidade')), ncm: limpar(valor('ncm')), codigo_ritec: limpar(valor('codigo_ritec')),
      codigo_ritec_opcao_preco: limpar(valor('codigo_ritec_opcao_preco')), referencia: limpar(valor('referencia')),
      marca: limpar(valor('marca')), fornecedor: 'RITEC', preco_cif_obra: lerPrecoRitec(valor('preco_cif_obra')),
    };
  }).filter(item => item.codigo_sap || item.descricao_sap);
  if (!itens.length) throw new Error('Planilha sem itens para importar.');
  if (itens.some(item => !item.codigo_sap || !item.descricao_sap)) throw new Error('Há item sem Código AG ou Descrição SAP.');

  // A base RITEC recebida tem o 1245691 repetido de forma idêntica. Mantemos
  // uma ocorrência, mas não escondemos duas linhas distintas com o mesmo AG.
  const porCodigo = new Map<string, CatalogoRitecImportItem>();
  for (const item of itens) {
    const anterior = porCodigo.get(item.codigo_sap);
    if (!anterior) {
      porCodigo.set(item.codigo_sap, item);
      continue;
    }
    if (JSON.stringify(anterior) !== JSON.stringify(item)) {
      throw new Error(`Há Código AG duplicado com dados divergentes: ${item.codigo_sap}.`);
    }
  }
  return [...porCodigo.values()];
}

export async function lerArquivoCatalogoRitec(arquivo: File): Promise<CatalogoRitecImportItem[]> {
  const workbook = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', raw: false });
  const aba = workbook.Sheets['Itens + Fiscal'] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!aba) throw new Error('Não foi encontrada uma aba na planilha.');
  return parseCatalogoRitec(XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, defval: null, raw: false }));
}

export async function importarCatalogoRitec(arquivo: File): Promise<number> {
  const itens = await lerArquivoCatalogoRitec(arquivo);
  const { data, error } = await supabase.rpc('importar_catalogo_ritec' as never, {
    p_arquivo_nome: arquivo.name,
    p_itens: itens,
  } as never);
  if (error) throw new Error(error.message);
  return Number(data ?? itens.length);
}

export async function listarCatalogoRitec(): Promise<CatalogoRitecItem[]> {
  const itens: CatalogoRitecItem[] = [];
  const tamanhoPagina = 1000;
  for (let inicio = 0; ; inicio += tamanhoPagina) {
    const { data, error } = await (supabase.from as any)('sup_catalogo_ritec_itens')
      .select('*').order('descricao_sap').range(inicio, inicio + tamanhoPagina - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as CatalogoRitecItem[];
    itens.push(...pagina);
    if (pagina.length < tamanhoPagina) return itens;
  }
}

export async function fotosCatalogoRitec(codigos: string[]): Promise<Map<string, CatalogoItem>> {
  return buscarFotosCatalogoPorCodigosSap(codigos);
}

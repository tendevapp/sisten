import { supabase } from '../db/supabaseClient';
import type { ContatoFornecedor, FornecedorMaterialRow, OrigemFornecedor } from '../types';

/**
 * Fornecedores que o comprador pode procurar para um material, por origem:
 *  - PO: já vendeu o material em pedido (sap_zl0132_po) — montado em Compras.tsx;
 *  - COTACAO: já cotou o material (sup_cotacao_proposta_itens);
 *  - CATALOGO: tem o material no catálogo de Suprimentos (sup_catalogo_ritec_itens).
 */

export const ROTULO_ORIGEM: Record<OrigemFornecedor, string> = {
  PO: 'Fornecedor de PO',
  COTACAO: 'Fornecedor de cotação',
  CATALOGO: 'Fornecedor de catálogo',
};

const ORDEM_ORIGEM: OrigemFornecedor[] = ['PO', 'COTACAO', 'CATALOGO'];

/** Fornecedor do catálogo RITEC: a tabela não guarda o nome, é sempre RITEC. */
const FORNECEDOR_CATALOGO = 'RITEC';

/** Candidato de uma fonte que não é PO, já indexado pelo código normalizado do material. */
export interface SugestaoFornecedor {
  materialNorm: string;
  origem: Exclude<OrigemFornecedor, 'PO'>;
  row: FornecedorMaterialRow;
}

const semZeros = (c: unknown): string => {
  const s = String(c ?? '').trim();
  const stripped = s.replace(/^0+/, '');
  return stripped.length > 0 ? stripped : (s.length > 0 ? '0' : '');
};

const soDigitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

const normalizarNome = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

const vazio = (v: unknown): boolean => v === undefined || v === null || v === '' || v === '—';

/** Chaves que identificam o mesmo fornecedor entre fontes (CNPJ, código SAP, nome). */
export function chavesFornecedor(f: Pick<FornecedorMaterialRow, 'cnpj' | 'cod_forn' | 'fornecedor'>): string[] {
  const chaves: string[] = [];
  const cnpj = soDigitos(f.cnpj);
  if (cnpj.length === 14) chaves.push(`c:${cnpj}`);
  if (!vazio(f.cod_forn)) chaves.push(`f:${semZeros(f.cod_forn)}`);
  const nome = normalizarNome(f.fornecedor);
  if (nome) chaves.push(`n:${nome}`);
  return chaves;
}

export function mesmoFornecedor(a: FornecedorMaterialRow, b: FornecedorMaterialRow): boolean {
  const chavesB = new Set(chavesFornecedor(b));
  return chavesFornecedor(a).some(k => chavesB.has(k));
}

/** Origens da linha, com PO como padrão para linhas montadas antes da mescla. */
export function origensDe(f: FornecedorMaterialRow): OrigemFornecedor[] {
  return f.origens && f.origens.length > 0 ? f.origens : ['PO'];
}

/**
 * Junta as sugestões de cotação/catálogo à lista de fornecedores de PO do mesmo
 * material. O mesmo fornecedor em mais de uma fonte vira uma linha só com todas
 * as origens; os dados do PO prevalecem e os campos vazios são completados.
 * Ordem final: PO (mais recente primeiro), depois cotação, depois catálogo.
 */
export function mesclarFornecedoresMaterial(
  porPo: FornecedorMaterialRow[],
  extras: SugestaoFornecedor[],
): FornecedorMaterialRow[] {
  const linhas: FornecedorMaterialRow[] = porPo.map(f => ({ ...f, origens: ['PO'] }));
  const indice = new Map<string, FornecedorMaterialRow>();
  const indexar = (f: FornecedorMaterialRow) => chavesFornecedor(f).forEach(k => { if (!indice.has(k)) indice.set(k, f); });
  linhas.forEach(indexar);

  const ordenados = [...extras].sort(
    (a, b) => ORDEM_ORIGEM.indexOf(a.origem) - ORDEM_ORIGEM.indexOf(b.origem),
  );
  for (const { origem, row } of ordenados) {
    const existente = chavesFornecedor(row).map(k => indice.get(k)).find(Boolean);
    if (!existente) {
      const nova = { ...row, origens: [origem] };
      linhas.push(nova);
      indexar(nova);
      continue;
    }
    if (!existente.origens!.includes(origem)) existente.origens!.push(origem);
    for (const campo of ['cnpj', 'telefone', 'email', 'nome_fantasia', 'cidade', 'regiao_uf', 'cod_forn'] as const) {
      if (vazio(existente[campo]) && !vazio(row[campo])) (existente as any)[campo] = row[campo];
    }
    if (existente.preco_liquido === undefined && row.preco_liquido !== undefined) existente.preco_liquido = row.preco_liquido;
    if (vazio(existente.ultima_data) && !vazio(row.ultima_data)) existente.ultima_data = row.ultima_data;
    indexar(existente);
  }
  return linhas;
}

/** Contato cadastrado cujo nome contém o texto — usado para dar telefone/e-mail ao fornecedor do catálogo. */
export function contatoPorNome(nome: string, contatos: Iterable<ContatoFornecedor>): ContatoFornecedor | undefined {
  const alvo = normalizarNome(nome);
  if (!alvo) return undefined;
  for (const c of contatos) {
    if (normalizarNome(c.fornecedor).includes(alvo) || normalizarNome(c.nome_fantasia).includes(alvo)) return c;
  }
  return undefined;
}

const TAMANHO_LOTE = 200;

const lotes = <T,>(itens: T[]): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) r.push(itens.slice(i, i + TAMANHO_LOTE));
  return r;
};

interface PropostaBruta {
  fornecedor_razao_social?: string | null;
  fornecedor_cnpj?: string | null;
  cod_vendor?: string | null;
  fornecedor_cidade?: string | null;
  fornecedor_uf?: string | null;
  fornecedor_telefone?: string | null;
  vendedor_telefone?: string | null;
  vendedor_email?: string | null;
  data_emissao?: string | null;
}

interface ItemCotadoBruto {
  material_code?: string | null;
  preco_unitario?: number | string | null;
  created_at?: string | null;
  desconsiderado?: boolean | null;
  fora_escopo?: boolean | null;
  proposta?: PropostaBruta | PropostaBruta[] | null;
}

const PROPOSTA_SELECT = `
  fornecedor_razao_social, fornecedor_cnpj, cod_vendor, fornecedor_cidade, fornecedor_uf,
  fornecedor_telefone, vendedor_telefone, vendedor_email, data_emissao
`;

/** Converte um item cotado na sugestão de fornecedor; null quando a proposta não identifica o fornecedor. */
export function sugestaoDeItemCotado(
  item: ItemCotadoBruto,
  contatos: Map<string, ContatoFornecedor>,
): SugestaoFornecedor | null {
  if (item.desconsiderado || item.fora_escopo || !item.material_code) return null;
  const prop = Array.isArray(item.proposta) ? item.proposta[0] : item.proposta;
  const nome = prop?.fornecedor_razao_social?.trim();
  if (!prop || !nome) return null;
  const cod = prop.cod_vendor ? String(prop.cod_vendor).trim() : '';
  const contato = cod ? (contatos.get(cod) || contatos.get(semZeros(cod)) || contatos.get(cod.padStart(10, '0'))) : undefined;
  const preco = item.preco_unitario != null ? Number(item.preco_unitario) : NaN;
  return {
    materialNorm: semZeros(item.material_code),
    origem: 'COTACAO',
    row: {
      cod_forn: cod || '—',
      cnpj: prop.fornecedor_cnpj || '—',
      fornecedor: nome,
      nome_fantasia: contato?.nome_fantasia || '—',
      regiao_uf: prop.fornecedor_uf || contato?.estado_uf || '—',
      cidade: prop.fornecedor_cidade || contato?.cidade || '—',
      telefone: prop.fornecedor_telefone || prop.vendedor_telefone || contato?.telefone || '—',
      email: prop.vendedor_email || contato?.email || '—',
      classificacao: contato?.classificacao || '—',
      ultima_data: prop.data_emissao || (item.created_at ? String(item.created_at).slice(0, 10) : '—'),
      preco_liquido: Number.isFinite(preco) && preco > 0 ? preco : undefined,
    },
  };
}

/** Mantém, por material e fornecedor, só a sugestão mais recente. */
function maisRecentePorFornecedor(sugestoes: SugestaoFornecedor[]): SugestaoFornecedor[] {
  const porChave = new Map<string, SugestaoFornecedor>();
  for (const s of sugestoes) {
    const chave = `${s.materialNorm}|${s.origem}|${chavesFornecedor(s.row)[0] ?? ''}`;
    const atual = porChave.get(chave);
    const data = (x: SugestaoFornecedor) => (x.row.ultima_data && x.row.ultima_data !== '—' ? Date.parse(x.row.ultima_data) || 0 : 0);
    if (!atual || data(s) > data(atual)) porChave.set(chave, s);
  }
  return [...porChave.values()];
}

/**
 * Fornecedores que já cotaram o material. Considera o código gravado no item
 * da proposta e os vínculos SAP automáticos/confirmados (o item cotado nasce
 * sem código; o vínculo é o que o liga ao material).
 */
export async function buscarSugestoesCotacao(
  codigos: string[],
  contatos: Map<string, ContatoFornecedor>,
): Promise<SugestaoFornecedor[]> {
  if (codigos.length === 0) return [];
  const db = supabase as any;
  const brutos: ItemCotadoBruto[] = [];

  await Promise.all(lotes(codigos).map(async chunk => {
    const [diretos, vinculados] = await Promise.all([
      db.from('sup_cotacao_proposta_itens')
        .select(`material_code, preco_unitario, created_at, desconsiderado, fora_escopo, proposta:sup_cotacao_propostas(${PROPOSTA_SELECT})`)
        .in('material_code', chunk),
      db.from('sup_cotacao_item_vinculos')
        .select(`material_code, item:sup_cotacao_proposta_itens!inner(preco_unitario, created_at, desconsiderado, fora_escopo, proposta:sup_cotacao_propostas(${PROPOSTA_SELECT}))`)
        .in('material_code', chunk)
        .in('status', ['auto', 'confirmado']),
    ]);
    if (diretos.error) throw new Error(diretos.error.message);
    brutos.push(...((diretos.data ?? []) as ItemCotadoBruto[]));
    if (vinculados.error) {
      console.warn('Falha ao buscar vínculos de cotação para sugestão de fornecedores:', vinculados.error.message);
      return;
    }
    for (const v of (vinculados.data ?? []) as any[]) {
      const item = Array.isArray(v.item) ? v.item[0] : v.item;
      if (item) brutos.push({ ...item, material_code: v.material_code });
    }
  }));

  return maisRecentePorFornecedor(
    brutos.map(b => sugestaoDeItemCotado(b, contatos)).filter((s): s is SugestaoFornecedor => s !== null),
  );
}

/** Fornecedores que têm o material no catálogo de Suprimentos (mesmo código SAP). */
export async function buscarSugestoesCatalogo(
  codigos: string[],
  contatos: Iterable<ContatoFornecedor>,
): Promise<SugestaoFornecedor[]> {
  if (codigos.length === 0) return [];
  const db = supabase as any;
  const contato = contatoPorNome(FORNECEDOR_CATALOGO, contatos);
  const sugestoes: SugestaoFornecedor[] = [];

  await Promise.all(lotes(codigos).map(async chunk => {
    const { data, error } = await db
      .from('sup_catalogo_ritec_itens')
      .select('codigo_sap, preco_cif_obra, updated_at')
      .in('codigo_sap', chunk);
    if (error) throw new Error(error.message);
    for (const item of (data ?? []) as { codigo_sap: string; preco_cif_obra: number | string | null; updated_at: string | null }[]) {
      const preco = item.preco_cif_obra != null ? Number(item.preco_cif_obra) : NaN;
      sugestoes.push({
        materialNorm: semZeros(item.codigo_sap),
        origem: 'CATALOGO',
        row: {
          cod_forn: contato?.cod_vendor ? String(contato.cod_vendor).trim() : '—',
          cnpj: contato?.cnpj || '—',
          fornecedor: contato?.fornecedor || FORNECEDOR_CATALOGO,
          nome_fantasia: contato?.nome_fantasia || '—',
          regiao_uf: contato?.estado_uf || '—',
          cidade: contato?.cidade || '—',
          telefone: contato?.telefone || '—',
          email: contato?.email || '—',
          classificacao: contato?.classificacao || '—',
          ultima_data: item.updated_at ? String(item.updated_at).slice(0, 10) : '—',
          preco_liquido: Number.isFinite(preco) && preco > 0 ? preco : undefined,
        },
      });
    }
  }));

  return sugestoes;
}

/** Agrupa as sugestões por material (código sem zeros à esquerda). */
export function agruparPorMaterial(sugestoes: SugestaoFornecedor[]): Map<string, SugestaoFornecedor[]> {
  const mapa = new Map<string, SugestaoFornecedor[]>();
  for (const s of sugestoes) {
    const lista = mapa.get(s.materialNorm);
    if (lista) lista.push(s);
    else mapa.set(s.materialNorm, [s]);
  }
  return mapa;
}

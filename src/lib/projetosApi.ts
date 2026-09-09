/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — acesso ao Supabase.
 *
 * Segue o padrão dos módulos próprios (`facilitiesApi`, `ssmaApi`,
 * `demandasApi`): Supabase direto, sem passar pelo cache do `localDb`;
 * `.from()` usa `as any` porque as tabelas novas ainda não estão em
 * `database.types.ts`. Exclusão é lógica (`softDelete.ts`).
 *
 * As gravações que mexem em estoque NÃO fazem insert direto: vão por RPC
 * (`proj_registrar_*`), que valida o saldo dentro da transação. Ver a
 * migration `create_proj_rpcs`.
 */

import { supabase } from '../db/supabaseClient';
import { comprimirImagemUpload, type PreparedAttachment } from './imageCompression';
import { apenasVigentes, marcarExcluido } from './softDelete';
import { PROJETO_PADRAO, PrefixoFormulario, hojeISO, proximoCodigoDoDia } from './projetos';
import type {
  ProjBomNo,
  ProjEntregaProducao,
  ProjEvidencia,
  ProjItem,
  ProjKit,
  ProjMovimento,
  ProjNotaEntrada,
  ProjOrdemPremontagem,
  ProjSaldoItem,
  ProjSobressalente,
  ProjSubprojeto,
  ProjTramoUnidade,
} from '../types';

const db = (tabela: string) => (supabase.from as any)(tabela);

const BUCKET_EVIDENCIAS = 'proj-evidencias';

/**
 * O PostgREST devolve no máximo 1.000 linhas por requisição. A BOM tem 1.257
 * e o razão cresce sem teto, então toda leitura de tabela grande pagina.
 */
async function buscarTudo<T>(
  montarQuery: (de: number, ate: number) => any,
  pagina = 1000,
): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; ; i += 1) {
    const de = i * pagina;
    const { data, error } = await montarQuery(de, de + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    saida.push(...lote);
    if (lote.length < pagina) break;
  }
  return saida;
}

/**
 * O erro do PostgREST embrulha a exceção do Postgres. O `details` das RPCs de
 * baixa carrega o JSON dos itens faltantes; sem repassá-lo, a tela só teria o
 * texto e não conseguiria montar o painel de bloqueio.
 */
export class ProjSaldoInsuficienteError extends Error {
  constructor(
    message: string,
    public readonly faltantes: {
      item_id: string;
      part_number: string;
      descricao: string | null;
      localizador: string | null;
      necessario: number;
      saldo: number;
      falta: number;
    }[],
  ) {
    super(message);
    this.name = 'ProjSaldoInsuficienteError';
  }
}

function lancarErroRpc(error: any, contexto: string): never {
  console.error(`${contexto}:`, error);
  const detalhe = error?.details;
  if (typeof detalhe === 'string' && detalhe.trim().startsWith('[')) {
    try {
      throw new ProjSaldoInsuficienteError(error.message, JSON.parse(detalhe));
    } catch (e) {
      if (e instanceof ProjSaldoInsuficienteError) throw e;
    }
  }
  throw new Error(error?.message || contexto);
}

// ---------------------------------------------------------------------------
// Cadastro (leitura)
// ---------------------------------------------------------------------------

export async function listarSubprojetos(projeto = PROJETO_PADRAO): Promise<ProjSubprojeto[]> {
  const { data, error } = await db('proj_subprojetos').select('*').eq('projeto', projeto).order('ordem');
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjSubprojeto[];
}

export async function listarTramos(projeto = PROJETO_PADRAO): Promise<ProjTramoUnidade[]> {
  return buscarTudo<ProjTramoUnidade>((de, ate) =>
    db('proj_tramos_gwjaco').select('*').eq('projeto', projeto).order('serie').range(de, ate),
  );
}

/** A BOM com a hierarquia resolvida pelo banco. 1.257 linhas — cabe em memória. */
export async function listarBom(projeto = PROJETO_PADRAO): Promise<ProjBomNo[]> {
  return buscarTudo<ProjBomNo>((de, ate) =>
    db('vw_proj_bom_arvore').select('*').eq('projeto', projeto).order('id').range(de, ate),
  );
}

export async function listarItens(projeto = PROJETO_PADRAO): Promise<ProjItem[]> {
  return buscarTudo<ProjItem>((de, ate) =>
    db('proj_itens').select('*').eq('projeto', projeto).order('part_number').range(de, ate),
  );
}

/** Posição do almoxarifado central. Substitui a aba consolidada da planilha. */
export async function listarSaldos(projeto = PROJETO_PADRAO): Promise<ProjSaldoItem[]> {
  return buscarTudo<ProjSaldoItem>((de, ate) =>
    db('vw_proj_saldo_almox').select('*').eq('projeto', projeto).order('part_number').range(de, ate),
  );
}

/** Consumo unitário por tramo, direto da view (mesma conta que `projetosBom.ts`). */
export async function listarConsumoTramo(projeto = PROJETO_PADRAO): Promise<
  { tramo: string; secao: string; part_number_norm: string; part_number: string; cod_sap: string | null; qtd_por_torre: number; linhas_bom: number; subconjuntos: string[] }[]
> {
  return buscarTudo((de, ate) =>
    db('vw_proj_consumo_tramo').select('*').eq('projeto', projeto).order('tramo').range(de, ate),
  );
}

export async function atualizarItem(
  id: string,
  campos: Partial<Pick<ProjItem, 'localizador' | 'estoque_minimo' | 'observacao'>>,
): Promise<void> {
  const { error } = await db('proj_itens').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Códigos de formulário — índice reinicia por dia (ver projetos.ts).
// ---------------------------------------------------------------------------

const TABELA_DO_PREFIXO: Record<PrefixoFormulario, { tabela: string; campoData: string }> = {
  ENP: { tabela: 'proj_notas_entrada', campoData: 'data_entrada' },
  OPM: { tabela: 'proj_ordens_premontagem', campoData: 'created_at' },
  KIT: { tabela: 'proj_kits', campoData: 'created_at' },
  EPR: { tabela: 'proj_entregas_producao', campoData: 'data' },
  SOB: { tabela: 'proj_sobressalentes', campoData: 'data' },
};

/**
 * Próximo código do dia. Busca só os códigos daquele dia — o recorte diário é
 * a decisão deste módulo (ver o comentário em `projetos.ts`).
 */
export async function proximoCodigo(
  prefixo: PrefixoFormulario,
  dataISO = hojeISO(),
  projeto = PROJETO_PADRAO,
): Promise<string> {
  const { tabela, campoData } = TABELA_DO_PREFIXO[prefixo];
  const query = db(tabela).select('codigo').eq('projeto', projeto);

  const { data, error } =
    campoData === 'created_at'
      ? await query.gte('created_at', `${dataISO}T00:00:00`).lte('created_at', `${dataISO}T23:59:59`)
      : await query.eq(campoData, dataISO);

  // Um código repetido seria barrado pelo unique do banco; falhar a busca não
  // pode impedir o lançamento, então cai para o índice 1 e deixa o banco julgar.
  if (error) {
    console.warn('Não foi possível ler os códigos do dia; usando o índice inicial.', error);
    return proximoCodigoDoDia(prefixo, [], dataISO);
  }

  return proximoCodigoDoDia(prefixo, (data ?? []).map((r: any) => r.codigo), dataISO);
}

// ---------------------------------------------------------------------------
// F1 — Entrada de NF
// ---------------------------------------------------------------------------

export interface PrevisaoExplosaoLinha {
  bom_linha_id: number;
  part_number: string;
  part_number_norm: string;
  cod_sap: string | null;
  descricao: string | null;
  secao: string | null;
  tramo: string | null;
  subconjunto: string | null;
  qtd_por_torre: number;
  torres_equivalentes: number;
  qtd_creditada: number;
}

/** Prévia que o conferente confere contra o físico antes de confirmar. */
export async function previaExplosao(bomLinhaId: number, quantidade: number): Promise<PrevisaoExplosaoLinha[]> {
  const { data, error } = await supabase.rpc('proj_previa_explosao' as any, {
    p_bom_linha_id: bomLinhaId,
    p_quantidade: quantidade,
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao calcular a explosão da BOM');
  return (data ?? []) as PrevisaoExplosaoLinha[];
}

export interface EntradaNfInput {
  codigo: string;
  data_entrada: string;
  numero_nf: string;
  fornecedor: string;
  subprojeto_id?: string | null;
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
  pais: {
    bom_linha_id?: number | null;
    part_number?: string | null;
    cod_sap?: string | null;
    descricao?: string | null;
    quantidade_recebida: number;
    explodir?: boolean;
    torres_equivalentes?: number | null;
    divergencia?: boolean;
  }[];
  movimentos: {
    item_id: string;
    quantidade: number;
    bom_linha_id?: number | null;
    origem_pai_pn?: string | null;
    secao?: string | null;
    tramo?: string | null;
    observacao?: string | null;
  }[];
}

export async function registrarEntradaNf(entrada: EntradaNfInput): Promise<{ id: string; codigo: string }> {
  const { pais, movimentos, ...nota } = entrada;
  const { data, error } = await supabase.rpc('proj_registrar_entrada_nf' as any, {
    p_nota: { ...nota, projeto: PROJETO_PADRAO },
    p_pais: pais,
    p_movimentos: movimentos,
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao registrar a entrada');
  return data as { id: string; codigo: string };
}

export async function listarNotasEntrada(
  projeto = PROJETO_PADRAO,
  incluirExcluidas = false,
): Promise<ProjNotaEntrada[]> {
  const query = apenasVigentes(
    db('proj_notas_entrada').select('*, pais:proj_notas_entrada_pais(*)').eq('projeto', projeto),
    incluirExcluidas,
  );
  const { data, error } = await query.order('data_entrada', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjNotaEntrada[];
}

// ---------------------------------------------------------------------------
// F2 / F3 — Pré-montagem
// ---------------------------------------------------------------------------

export interface OrdemPremontagemInput {
  codigo: string;
  subprojeto_id?: string | null;
  tramo: string;
  quantidade_kits: number;
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
  itens: {
    item_id: string;
    subconjunto?: string | null;
    qtd_por_kit: number;
    qtd_total: number;
    localizador?: string | null;
  }[];
  alvos: string[];
}

/**
 * Debita o almoxarifado e abre um kit por tramo alvo.
 * Lança `ProjSaldoInsuficienteError` com a lista de faltantes quando o
 * romaneio não fecha — a tela mostra exatamente qual part number travou.
 */
export async function criarOrdemPremontagem(ordem: OrdemPremontagemInput): Promise<{ id: string; codigo: string }> {
  const { itens, alvos, ...cabecalho } = ordem;
  const { data, error } = await supabase.rpc('proj_registrar_saida_premontagem' as any, {
    p_ordem: { ...cabecalho, projeto: PROJETO_PADRAO },
    p_itens: itens,
    p_alvos: alvos,
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao gerar a ordem de pré-montagem');
  return data as { id: string; codigo: string };
}

export async function listarOrdens(
  projeto = PROJETO_PADRAO,
  incluirExcluidas = false,
): Promise<ProjOrdemPremontagem[]> {
  const query = apenasVigentes(
    db('proj_ordens_premontagem')
      .select('*, itens:proj_ordens_premontagem_itens(*), alvos:proj_ordens_premontagem_alvos(tramo_unidade_id), kits:proj_kits(*)')
      .eq('projeto', projeto),
    incluirExcluidas,
  );
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjOrdemPremontagem[];
}

export async function concluirPremontagem(
  ordemId: string,
  kits: { tramo_unidade_id: string; codigo?: string; qualidade_ok?: boolean; nao_conformidade?: string | null; observacao?: string | null }[],
  usuario: { nome: string },
): Promise<{ kits_concluidos: number; kits_restantes: number }> {
  const { data, error } = await supabase.rpc('proj_concluir_premontagem' as any, {
    p_ordem_id: ordemId,
    p_kits: kits,
    p_usuario: usuario,
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao apontar a conclusão da pré-montagem');
  return data as { kits_concluidos: number; kits_restantes: number };
}

export async function listarKits(projeto = PROJETO_PADRAO, incluirExcluidos = false): Promise<ProjKit[]> {
  const query = apenasVigentes(db('proj_kits').select('*').eq('projeto', projeto), incluirExcluidos);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjKit[];
}

// ---------------------------------------------------------------------------
// F4 — Entrega à produção
// ---------------------------------------------------------------------------

export interface EntregaProducaoInput {
  codigo: string;
  data: string;
  turno?: string | null;
  subprojeto_id?: string | null;
  kit_id: string;
  recebido_por_nome: string;
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
}

export async function entregarProducao(entrega: EntregaProducaoInput): Promise<{ id: string; codigo: string; rastreio: string }> {
  const { data, error } = await supabase.rpc('proj_entregar_producao' as any, {
    p_entrega: { ...entrega, projeto: PROJETO_PADRAO },
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao registrar a entrega à produção');
  return data as { id: string; codigo: string; rastreio: string };
}

export async function listarEntregas(
  projeto = PROJETO_PADRAO,
  incluirExcluidas = false,
): Promise<ProjEntregaProducao[]> {
  const query = apenasVigentes(db('proj_entregas_producao').select('*').eq('projeto', projeto), incluirExcluidas);
  const { data, error } = await query.order('data', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjEntregaProducao[];
}

// ---------------------------------------------------------------------------
// F5 — Sobressalente / refugo
// ---------------------------------------------------------------------------

export interface SobressalenteInput {
  codigo: string;
  data: string;
  subprojeto_id?: string | null;
  tramo?: string | null;
  tramo_unidade_id?: string | null;
  motivo: string;
  motivo_detalhe?: string | null;
  aprovador_nome: string;
  aprovador_id?: string | null;
  evidencias?: ProjEvidencia[];
  observacao?: string | null;
  criado_por_id?: string | null;
  criado_por_nome: string;
  itens: { item_id: string; quantidade: number }[];
}

export async function registrarSobressalente(sol: SobressalenteInput): Promise<{ id: string; codigo: string }> {
  const { itens, ...cabecalho } = sol;
  const { data, error } = await supabase.rpc('proj_registrar_sobressalente' as any, {
    p_cab: { ...cabecalho, projeto: PROJETO_PADRAO, evidencias: cabecalho.evidencias ?? [] },
    p_itens: itens,
  } as any);
  if (error) lancarErroRpc(error, 'Falha ao registrar o sobressalente');
  return data as { id: string; codigo: string };
}

export async function listarSobressalentes(
  projeto = PROJETO_PADRAO,
  incluirExcluidos = false,
): Promise<ProjSobressalente[]> {
  const query = apenasVigentes(
    db('proj_sobressalentes').select('*, itens:proj_sobressalentes_itens(*)').eq('projeto', projeto),
    incluirExcluidos,
  );
  const { data, error } = await query.order('data', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjSobressalente[];
}

/**
 * Foto da avaria. Regra 1 do CLAUDE.md: a foto vem de celular em campo
 * (3-8 MB) e o egress do Supabase paga a conta, então nada sobe cru.
 *
 * Aceita as duas formas de anexo do app: um `File` (comprimido aqui por
 * `comprimirImagemUpload`) ou o resultado de `prepareAttachment`, que a UI já
 * usa para validar e pré-visualizar — nesse caso o blob JÁ está comprimido e
 * comprimir de novo só degradaria a imagem.
 */
export async function subirEvidencia(
  arquivo: File | PreparedAttachment,
  codigo: string,
): Promise<ProjEvidencia> {
  const preparado = 'blob' in arquivo;
  const blob = preparado ? arquivo.blob : await comprimirImagemUpload(arquivo);
  const nome = preparado ? arquivo.name : arquivo.name;
  const tipo = preparado ? arquivo.mimeType : (blob === arquivo ? arquivo.type : 'image/jpeg');
  const extensao = (nome.split('.').pop() || 'jpg').toLowerCase();
  const path = `${codigo}/${Math.random().toString(36).slice(2, 9)}.${extensao}`;

  const { error } = await supabase.storage
    .from(BUCKET_EVIDENCIAS)
    .upload(path, blob, { contentType: tipo, upsert: false });
  if (error) throw new Error(`Falha no upload da evidência: ${error.message}`);

  return { path, nome, tipo };
}

/** URLs assinadas de 24 h para pré-visualizar as evidências de uma lista. */
export async function assinarEvidencias(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from(BUCKET_EVIDENCIAS).createSignedUrls(paths, 60 * 60 * 24);
  const mapa: Record<string, string> = {};
  (data ?? []).forEach((item: any) => {
    if (item?.path && item?.signedUrl) mapa[item.path] = item.signedUrl;
  });
  return mapa;
}

// ---------------------------------------------------------------------------
// Razão e exclusão lógica
// ---------------------------------------------------------------------------

export async function listarMovimentos(
  opcoes: { projeto?: string; itemId?: string; limite?: number; incluirExcluidos?: boolean } = {},
): Promise<ProjMovimento[]> {
  const { projeto = PROJETO_PADRAO, itemId, limite = 500, incluirExcluidos = false } = opcoes;
  let query = db('proj_movimentos').select('*').eq('projeto', projeto);
  if (itemId) query = query.eq('item_id', itemId);
  const { data, error } = await apenasVigentes(query, incluirExcluidos)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjMovimento[];
}

/**
 * Estorna um lançamento inteiro: marca o documento e TODOS os movimentos dele
 * como excluídos, o que devolve o saldo (a view soma só os vigentes).
 *
 * Estornar a nota sem estornar os créditos deixaria peça fantasma no estoque —
 * exatamente o tipo de descolamento que a planilha produzia.
 */
export async function estornarDocumento(
  tabela: 'proj_notas_entrada' | 'proj_sobressalentes',
  documentoId: string,
  usuarioId?: string | null,
): Promise<void> {
  const marca = marcarExcluido(usuarioId);

  const { error: erroMov } = await db('proj_movimentos').update(marca).eq('documento_id', documentoId);
  if (erroMov) throw new Error(erroMov.message);

  const { error } = await db(tabela).update(marca).eq('id', documentoId);
  if (error) throw new Error(error.message);
}

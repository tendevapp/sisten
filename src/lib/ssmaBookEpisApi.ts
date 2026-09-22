import type { RequestAttachment } from '../types';
import { supabase } from '../db/supabaseClient';
import { comprimirImagemUpload } from './imageCompression';
import { deduplicarVariantesBookEpis, type FotoBookEpi, type VarianteBookEpi } from './bookEpisImportacao';

export const SSMA_BOOK_EPIS_BUCKET = 'ssma-book-epis';

export interface SsmaBookEpi {
  id: string;
  categoria: string;
  grupo_epi: string;
  descricao_epi: string;
  indicacao: string | null;
  ca: string;
  validade: string | null;
  fabricante: string | null;
  tamanho: string | null;
  codigo_sap: string | null;
  descricao_sap: string | null;
  imagem_path: string | null;
  imagem_nome: string | null;
  imagem_mime: string | null;
  imagem_tamanho: number | null;
  ativo: boolean;
  criado_por: string;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface SsmaBookEpiHistorico {
  id: number;
  epi_id: string;
  operacao: 'CRIACAO' | 'ALTERACAO';
  valores_anteriores: Partial<SsmaBookEpi> | null;
  valores_novos: SsmaBookEpi;
  alterado_por: string;
  alterado_em: string;
}

export interface GrupoBookEpi<T extends Pick<SsmaBookEpi, 'categoria' | 'grupo_epi'>> {
  categoria: string;
  grupoEpi: string;
  itens: T[];
}

export type SalvarBookEpi = Omit<
  SsmaBookEpi,
  'id' | 'imagem_path' | 'imagem_nome' | 'imagem_mime' | 'imagem_tamanho' | 'criado_por' | 'atualizado_por' | 'created_at' | 'updated_at'
> & { id?: string; foto?: FotoBookEpi | null };

const tabelaItens = () => (supabase.from as any)('ssma_book_epis');
const tabelaHistorico = () => (supabase.from as any)('ssma_book_epis_historico');

/** Traduz a indisponibilidade da migration em uma orientação acionável na tela. */
export function mensagemErroBookEpis(erro: unknown): string {
  const detalhe = erro && typeof erro === 'object' ? erro as Record<string, unknown> : {};
  const status = detalhe.status;
  const codigo = detalhe.code;
  const mensagem = typeof detalhe.message === 'string' ? detalhe.message : '';

  if (status === 404 || codigo === 'PGRST205' || codigo === '42P01') {
    return 'O Book de EPIs ainda não está disponível no banco. Aplique a migration do módulo SSMA e tente novamente.';
  }
  return mensagem || 'Não foi possível concluir a operação do Book de EPIs.';
}

export function chaveVarianteBookEpi(codigoSap?: string | null, ca?: string | null): string {
  return `${codigoSap?.trim() || 'SEM_SAP'}|${ca?.trim().toLowerCase() || ''}`;
}

export function agruparBookEpis<T extends Pick<SsmaBookEpi, 'categoria' | 'grupo_epi'>>(itens: T[]): GrupoBookEpi<T>[] {
  const grupos = new Map<string, GrupoBookEpi<T>>();
  for (const item of itens) {
    const chave = `${item.categoria}\u0000${item.grupo_epi}`;
    const grupo = grupos.get(chave) ?? { categoria: item.categoria, grupoEpi: item.grupo_epi, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()];
}

export function converterEpiEmAnexo(epi: Pick<SsmaBookEpi,
  'id' | 'codigo_sap' | 'descricao_epi' | 'imagem_path' | 'imagem_nome' | 'imagem_mime' | 'imagem_tamanho' | 'updated_at'
>): RequestAttachment {
  if (!epi.codigo_sap || !epi.imagem_path) {
    throw new Error('O EPI precisa ter código SAP e foto para entrar no banco de imagens.');
  }

  return {
    id: `epi-imagem-${epi.id}`,
    request_id: `ssma-book-epis-${epi.id}`,
    material_code: epi.codigo_sap,
    name: epi.imagem_nome || epi.descricao_epi,
    url: epi.imagem_path,
    storage_path: epi.imagem_path,
    mime_type: epi.imagem_mime || 'image/jpeg',
    size: epi.imagem_tamanho || 0,
    created_at: epi.updated_at,
  };
}

function extensaoImagem(mimeType: string, nome: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  const extNome = nome.split('.').pop()?.toLowerCase();
  return extNome && /^(jpe?g|heic|heif)$/.test(extNome) ? extNome.replace('jpeg', 'jpg') : 'jpg';
}

async function enviarFoto(foto: FotoBookEpi, pasta: string): Promise<{
  path: string;
  nome: string;
  mimeType: string;
  tamanho: number;
}> {
  const arquivo = new File([foto.blob], foto.nome, { type: foto.mimeType });
  const comprimido = await comprimirImagemUpload(arquivo);
  const mimeType = comprimido.type || foto.mimeType || 'image/jpeg';
  const nome = foto.nome || `epi.${extensaoImagem(mimeType, foto.nome)}`;
  const path = `${pasta}/${crypto.randomUUID()}.${extensaoImagem(mimeType, nome)}`;
  const { error } = await supabase.storage
    .from(SSMA_BOOK_EPIS_BUCKET)
    .upload(path, comprimido, { contentType: mimeType, upsert: false });
  if (error) throw error;
  return { path, nome, mimeType, tamanho: comprimido.size };
}

export async function listarBookEpis(incluirInativos = false): Promise<SsmaBookEpi[]> {
  let query = tabelaItens().select('*').order('categoria').order('grupo_epi').order('tamanho');
  if (!incluirInativos) query = query.eq('ativo', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as SsmaBookEpi[];
}

export async function listarHistoricoBookEpi(epiId: string): Promise<SsmaBookEpiHistorico[]> {
  const { data, error } = await tabelaHistorico().select('*').eq('epi_id', epiId).order('alterado_em', { ascending: false });
  if (error) throw error;
  return (data || []) as SsmaBookEpiHistorico[];
}

export async function urlFotoBookEpi(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(SSMA_BOOK_EPIS_BUCKET).createSignedUrl(path, 86400);
  if (error) throw error;
  return data?.signedUrl || null;
}

export async function salvarBookEpi(item: SalvarBookEpi): Promise<SsmaBookEpi> {
  const { foto, id, ...campos } = item;
  const anterior = id
    ? await tabelaItens().select('imagem_path').eq('id', id).single()
    : { data: null, error: null };
  if (anterior.error) throw anterior.error;

  let imagem: Awaited<ReturnType<typeof enviarFoto>> | null = null;
  try {
    if (foto) imagem = await enviarFoto(foto, `epis/${id || 'manual'}`);
    const payload = {
      ...campos,
      ...(imagem ? {
        imagem_path: imagem.path,
        imagem_nome: imagem.nome,
        imagem_mime: imagem.mimeType,
        imagem_tamanho: imagem.tamanho,
      } : {}),
    };
    const query = id
      ? tabelaItens().update(payload).eq('id', id).select('*').single()
      : tabelaItens().insert(payload).select('*').single();
    const { data, error } = await query;
    if (error) throw error;

    const caminhoAnterior = anterior.data?.imagem_path as string | null | undefined;
    if (imagem && caminhoAnterior && caminhoAnterior !== imagem.path) {
      await supabase.storage.from(SSMA_BOOK_EPIS_BUCKET).remove([caminhoAnterior]);
    }
    return data as SsmaBookEpi;
  } catch (error) {
    if (imagem) await supabase.storage.from(SSMA_BOOK_EPIS_BUCKET).remove([imagem.path]);
    throw error;
  }
}

export async function importarBookEpis(itens: VarianteBookEpi[]): Promise<{ importados: number }> {
  const variantes = deduplicarVariantesBookEpis(itens);
  const fotos = new Map<FotoBookEpi, Promise<Awaited<ReturnType<typeof enviarFoto>>>>();
  const payload = await Promise.all(variantes.map(async item => {
    const imagem = item.foto
      ? (fotos.get(item.foto) ?? (() => {
        const upload = enviarFoto(item.foto!, `epis/importacao-${new Date().toISOString().slice(0, 10)}`);
        fotos.set(item.foto!, upload);
        return upload;
      })())
      : null;
    const foto = imagem ? await imagem : null;
    return {
      categoria: item.categoria,
      grupo_epi: item.grupoEpi,
      descricao_epi: item.descricaoEpi,
      indicacao: item.indicacao || null,
      ca: item.ca || '',
      validade: item.validade || null,
      fabricante: item.fabricante || null,
      tamanho: item.tamanho,
      codigo_sap: item.codigoSap,
      descricao_sap: item.descricaoSap || null,
      imagem_path: foto?.path ?? null,
      imagem_nome: foto?.nome ?? null,
      imagem_mime: foto?.mimeType ?? null,
      imagem_tamanho: foto?.tamanho ?? null,
      ativo: true,
    };
  }));

  const { error } = await tabelaItens().upsert(payload, { onConflict: 'chave_importacao' });
  if (error) throw error;
  return { importados: payload.length };
}

export async function listarImagensEpiPorCodigoSap(codigoSap: string): Promise<RequestAttachment[]> {
  if (!codigoSap) return [];
  const { data, error } = await tabelaItens()
    .select('id, codigo_sap, descricao_epi, imagem_path, imagem_nome, imagem_mime, imagem_tamanho, updated_at')
    .eq('codigo_sap', codigoSap)
    .not('imagem_path', 'is', null)
    .eq('ativo', true);
  if (error) throw error;
  return (data || []).map((epi: SsmaBookEpi) => converterEpiEmAnexo(epi));
}

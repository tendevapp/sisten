/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Cadastro de Itens > Itens BOM — acesso ao Supabase.
 *
 * `alm_bom_itens_cadastro` guarda o que o almoxarifado completa na peça da BOM
 * para imprimir a etiqueta: foto, localização e a descrição que vai impressa.
 * Descrição da BOM, código Qingdao e quantidades por seção vêm da própria BOM.
 */

import { supabase } from '../db/supabaseClient';
import { comprimirImagemUpload } from './imageCompression';
import { BUCKET_CATALOGO, extensaoDaImagem, obterUrlFotoCatalogo, obterUrlsFotosCatalogoLote } from './almoxCatalogoApi';
import { PROJETO_PADRAO } from './projetos';
import type { Profile } from '../types';

export const TABELA_CADASTRO_BOM = 'alm_bom_itens_cadastro';
/** Pasta das fotos das peças da BOM no bucket do catálogo. */
export const PASTA_FOTOS_BOM = 'almox-bom';

export interface CadastroBom {
  id: string;
  projeto: string;
  part_number_norm: string;
  part_number: string;
  posicao_estoque: string | null;
  etiqueta_descricao: string | null;
  observacao: string | null;
  imagem_path: string | null;
  imagem_nome: string | null;
  imagem_mime: string | null;
  imagem_tamanho: number | null;
  etiqueta_impressa_em: string | null;
  atualizado_por_nome: string | null;
  updated_at: string;
  /** URL assinada, resolvida na leitura. */
  url_imagem?: string | null;
}

export interface SalvarCadastroBomPayload {
  partNumber: string;
  partNumberNorm: string;
  posicao_estoque?: string | null;
  etiqueta_descricao?: string | null;
  observacao?: string | null;
  fotoArquivo?: File | null;
  removerFoto?: boolean;
}

const tabela = () => (supabase.from as any)(TABELA_CADASTRO_BOM);

/** O cadastro BOM só apaga arquivo da própria pasta — nunca foto do catálogo SAP ou do recebimento. */
export const caminhoEhFotoBom = (path: string) => {
  const limpo = path.startsWith('/') ? path.slice(1) : path;
  return limpo.startsWith(`${PASTA_FOTOS_BOM}/`) && !limpo.includes('..');
};

async function removerFotoBom(path: string | null | undefined): Promise<void> {
  if (!path || !supabase || !caminhoEhFotoBom(path)) return;
  try {
    await supabase.storage.from(BUCKET_CATALOGO).remove([path.startsWith('/') ? path.slice(1) : path]);
  } catch (err) {
    console.warn('[almoxBomCadastroApi] Falha ao apagar foto antiga:', err);
  }
}

/** Cadastros do projeto, por part number normalizado, já com a URL da foto. */
export async function listarCadastrosBom(projeto = PROJETO_PADRAO): Promise<Map<string, CadastroBom>> {
  const mapa = new Map<string, CadastroBom>();
  if (!supabase) return mapa;
  const { data, error } = await tabela().select('*').eq('projeto', projeto);
  if (error) throw new Error(`Falha ao carregar o cadastro da BOM: ${error.message}`);
  const linhas = (data ?? []) as CadastroBom[];
  const comFoto = linhas.filter((l) => l.imagem_path);
  const urls = await obterUrlsFotosCatalogoLote(comFoto.map((l) => ({ path: l.imagem_path as string, bucket: BUCKET_CATALOGO })));
  for (const l of linhas) mapa.set(l.part_number_norm, { ...l, url_imagem: l.imagem_path ? urls.get(l.imagem_path) ?? null : null });
  return mapa;
}

/** Campo que o payload não trouxe mantém o gravado; vazio apaga. */
const novoOuAtual = (novo: string | null | undefined, atual: string | null | undefined): string | null =>
  novo === undefined ? atual ?? null : (novo ?? '').trim() || null;

/**
 * Inclui ou atualiza o cadastro da peça. A foto é comprimida antes de subir
 * (regra 1 do CLAUDE.md); a anterior só é apagada depois que o registro novo
 * foi gravado — se a gravação falhar, a foto recém-enviada é removida.
 */
export async function salvarCadastroBom(
  payload: SalvarCadastroBomPayload,
  user: Profile,
  projeto = PROJETO_PADRAO,
): Promise<CadastroBom> {
  if (!supabase) throw new Error('Sem conexão com o banco de dados.');
  if (!payload.partNumberNorm) throw new Error('Peça sem part number.');

  const { data: existente, error: erroBusca } = await tabela()
    .select('*')
    .eq('projeto', projeto)
    .eq('part_number_norm', payload.partNumberNorm)
    .maybeSingle();
  if (erroBusca) throw new Error(`Falha ao consultar o cadastro: ${erroBusca.message}`);
  const atual = existente as CadastroBom | null;

  let imagem = {
    imagem_path: atual?.imagem_path ?? null,
    imagem_nome: atual?.imagem_nome ?? null,
    imagem_mime: atual?.imagem_mime ?? null,
    imagem_tamanho: atual?.imagem_tamanho ?? null,
  };
  if (payload.removerFoto) imagem = { imagem_path: null, imagem_nome: null, imagem_mime: null, imagem_tamanho: null };

  let pathEnviado: string | null = null;
  if (payload.fotoArquivo) {
    const comprimido = await comprimirImagemUpload(payload.fotoArquivo);
    const ext = extensaoDaImagem(comprimido, payload.fotoArquivo);
    const caminho = `${PASTA_FOTOS_BOM}/peca-${payload.partNumberNorm}-${Date.now()}.${ext}`;
    const { error: erroUpload } = await supabase.storage
      .from(BUCKET_CATALOGO)
      .upload(caminho, comprimido, { contentType: comprimido.type || 'image/jpeg', upsert: false });
    if (erroUpload) throw new Error(`Falha no upload da foto: ${erroUpload.message}`);
    pathEnviado = caminho;
    imagem = {
      imagem_path: caminho,
      imagem_nome: payload.fotoArquivo.name || null,
      imagem_mime: comprimido.type || 'image/jpeg',
      imagem_tamanho: comprimido.size,
    };
  }

  const campos = {
    part_number: payload.partNumber.trim() || atual?.part_number || payload.partNumberNorm,
    posicao_estoque: novoOuAtual(payload.posicao_estoque, atual?.posicao_estoque),
    etiqueta_descricao: novoOuAtual(payload.etiqueta_descricao, atual?.etiqueta_descricao),
    observacao: novoOuAtual(payload.observacao, atual?.observacao),
    ...imagem,
    atualizado_por: user.id,
    atualizado_por_nome: user.name,
  };

  const { data, error } = atual
    ? await tabela().update(campos).eq('id', atual.id).select('*').single()
    : await tabela().insert({
      ...campos,
      projeto,
      part_number_norm: payload.partNumberNorm,
      criado_por: user.id,
      criado_por_nome: user.name,
    }).select('*').single();

  if (error || !data) {
    if (pathEnviado) await removerFotoBom(pathEnviado);
    throw new Error(error?.code === '23505'
      ? 'Outro usuário acabou de cadastrar esta peça. Recarregue e tente de novo.'
      : `Falha ao salvar o cadastro da peça: ${error?.message ?? 'resposta vazia'}`);
  }

  const salvo = data as CadastroBom;
  if (atual?.imagem_path && atual.imagem_path !== salvo.imagem_path) await removerFotoBom(atual.imagem_path);
  return { ...salvo, url_imagem: salvo.imagem_path ? await obterUrlFotoCatalogo(salvo.imagem_path, BUCKET_CATALOGO) : null };
}

/**
 * Carimba a data da impressão nas peças que já têm cadastro. Peça sem cadastro
 * imprime com os dados da BOM e não guarda a data. Falha aqui não desfaz o PDF.
 */
export async function marcarEtiquetasBomImpressas(chaves: string[], projeto = PROJETO_PADRAO): Promise<string | null> {
  const lista = [...new Set(chaves.filter(Boolean))];
  if (lista.length === 0 || !supabase) return null;
  const agora = new Date().toISOString();
  const { error } = await tabela().update({ etiqueta_impressa_em: agora }).eq('projeto', projeto).in('part_number_norm', lista);
  if (error) {
    console.warn('[almoxBomCadastroApi] Falha ao marcar etiquetas impressas:', error);
    return null;
  }
  return agora;
}

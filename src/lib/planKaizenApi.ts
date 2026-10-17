/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulários › Planejamento — Aqui TEN Melhoria! (Kaizen, FRM.ENG-0017).
 *
 * Código KZN-DDMMYY-NN com índice reiniciado por mês, gerado pelo trigger
 * `plan_kaizen_antes_gravar` no banco — assim o registro que entra pela fila
 * offline ganha o código só quando chega ao servidor, sem colisão entre
 * aparelhos. Fotos passam por `comprimirImagemUpload` antes do Storage.
 */

import { supabase } from '../db/supabaseClient';
import { comprimirImagemUpload } from './imageCompression';

const BUCKET = 'plan-kaizen';
const db = () => (supabase.from as any)('plan_kaizen');

export type KaizenImpacto = 'SEGURANCA' | 'MEIO_AMBIENTE' | 'QUALIDADE' | 'PRODUTIVIDADE' | 'CUSTO';
export type KaizenStatus = 'REGISTRADO' | 'IMPLANTADO' | 'CANCELADO';
/** Em que bloco do formulário a foto entra: 1 (problema), 3 (melhoria) ou 4 (resultado). */
export type KaizenFotoTipo = 'problema' | 'solucao' | 'resultado';

export const KAIZEN_IMPACTOS: { valor: KaizenImpacto; rotulo: string }[] = [
  { valor: 'SEGURANCA', rotulo: 'Segurança' },
  { valor: 'MEIO_AMBIENTE', rotulo: 'Meio ambiente' },
  { valor: 'QUALIDADE', rotulo: 'Qualidade' },
  { valor: 'PRODUTIVIDADE', rotulo: 'Produtividade' },
  { valor: 'CUSTO', rotulo: 'Custo' },
];

export const KAIZEN_STATUS_ROTULO: Record<KaizenStatus, string> = {
  REGISTRADO: 'Aguardando validação',
  IMPLANTADO: 'Implantado',
  CANCELADO: 'Cancelado',
};

export interface KaizenFoto {
  id: string;
  path: string;
  name: string;
  size: number;
  mime_type: string;
  tipo: KaizenFotoTipo;
  created_at: string;
  /** URL assinada de leitura; expira — sempre reassinar a partir do `path`. */
  preview_url?: string;
}

export interface Kaizen {
  id: string;
  codigo: string | null;
  data_registro: string;
  pessoa_id: string | null;
  nome_profissional: string;
  matricula: string | null;
  setor: string;
  responsavel_setor: string | null;
  impactos: KaizenImpacto[];
  problema: string;
  causa: string;
  solucao: string;
  resultado: string | null;
  ganho_estimado: number | null;
  fotos: KaizenFoto[];
  status: KaizenStatus;
  aplicavel_outros_setores: boolean | null;
  validacao_obs: string | null;
  validado_por: string | null;
  validado_por_nome: string | null;
  validado_em: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  excluido_em: string | null;
}

export type NovoKaizenInput = Pick<
  Kaizen,
  | 'data_registro' | 'pessoa_id' | 'nome_profissional' | 'matricula' | 'setor' | 'responsavel_setor'
  | 'impactos' | 'problema' | 'causa' | 'solucao' | 'resultado' | 'ganho_estimado'
>;

export interface FotoKaizenNova {
  file: File;
  tipo: KaizenFotoTipo;
}

async function uploadFoto(kaizenId: string, item: FotoKaizenNova): Promise<KaizenFoto> {
  const blob = await comprimirImagemUpload(item.file);
  const ehJpeg = blob !== item.file;
  const extensao = ehJpeg ? 'jpg' : (item.file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileId = Math.random().toString(36).substring(2, 9);
  const path = `${kaizenId}/${item.tipo}_${fileId}.${extensao}`;
  const mime = ehJpeg ? 'image/jpeg' : item.file.type;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw new Error(`Falha no upload da foto: ${error.message}`);

  return {
    id: fileId,
    path,
    name: item.file.name,
    size: blob.size,
    mime_type: mime,
    tipo: item.tipo,
    created_at: new Date().toISOString(),
  };
}

async function subirFotos(kaizenId: string, fotos: FotoKaizenNova[]): Promise<{ ok: KaizenFoto[]; falhas: number }> {
  const ok: KaizenFoto[] = [];
  let falhas = 0;
  for (const item of fotos) {
    try {
      ok.push(await uploadFoto(kaizenId, item));
    } catch (err) {
      console.warn('Falha no upload de foto do Kaizen:', err);
      falhas++;
    }
  }
  return { ok, falhas };
}

/** Pede URLs novas para as fotos (as gravadas no JSON expiram). */
export async function assinarFotosKaizen(lista: Kaizen[]): Promise<Kaizen[]> {
  const paths = lista.flatMap(k => (k.fotos || []).map(f => f.path)).filter(Boolean);
  if (paths.length === 0) return lista;

  const urls: Record<string, string> = {};
  try {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
    (data || []).forEach(item => {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    });
  } catch (err) {
    console.warn('Erro ao assinar fotos do Kaizen:', err);
  }

  return lista.map(k => ({
    ...k,
    fotos: (k.fotos || []).map(f => ({ ...f, preview_url: urls[f.path] || '' })),
  }));
}

export async function listarKaizens(): Promise<Kaizen[]> {
  const { data, error } = await db()
    .select('*')
    .is('excluido_em', null)
    .order('data_registro', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return assinarFotosKaizen((data || []) as Kaizen[]);
}

/** Grava o Kaizen. `falhasFoto` diz quantas fotos não subiram (o registro sai mesmo assim). */
export async function criarKaizen(
  input: NovoKaizenInput,
  fotos: FotoKaizenNova[] = [],
): Promise<{ kaizen: Kaizen; falhasFoto: number }> {
  const id = crypto.randomUUID();
  const { ok, falhas } = await subirFotos(id, fotos);

  const { data, error } = await db()
    .insert({ ...input, id, fotos: ok })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return { kaizen: data as Kaizen, falhasFoto: falhas };
}

/**
 * Edição pelo autor ou admin (a RLS recusa os demais). `fotosMantidas` são as
 * já gravadas que continuam; as tiradas da lista saem também do Storage
 * (falha ao apagar o arquivo não impede a edição).
 */
export async function atualizarKaizen(
  kaizen: Kaizen,
  input: NovoKaizenInput,
  fotosMantidas: KaizenFoto[],
  novas: FotoKaizenNova[] = [],
): Promise<{ falhasFoto: number }> {
  const { ok, falhas } = await subirFotos(kaizen.id, novas);
  const mantidas = fotosMantidas.map(({ preview_url: _url, ...f }) => f);

  const { error } = await db().update({ ...input, fotos: [...mantidas, ...ok] }).eq('id', kaizen.id);
  if (error) throw new Error(error.message);

  const ficam = new Set(mantidas.map(f => f.path));
  const removidas = (kaizen.fotos || []).map(f => f.path).filter(p => p && !ficam.has(p));
  if (removidas.length) {
    await supabase.storage.from(BUCKET).remove(removidas).catch(err => console.warn('Fotos removidas do Kaizen ficaram no Storage:', err));
  }
  return { falhasFoto: falhas };
}

/** Acrescenta fotos a um Kaizen já gravado (ex.: foto do resultado depois de implantar). */
export async function adicionarFotosKaizen(kaizen: Kaizen, fotos: FotoKaizenNova[]): Promise<KaizenFoto[]> {
  const { ok } = await subirFotos(kaizen.id, fotos);
  if (ok.length === 0) throw new Error('Nenhuma foto foi enviada.');

  const semUrl = (kaizen.fotos || []).map(({ preview_url: _url, ...f }) => f);
  const { error } = await db().update({ fotos: [...semUrl, ...ok] }).eq('id', kaizen.id);
  if (error) throw new Error(error.message);
  return ok;
}

/** Responsável pelo Setor confirma que o Kaizen foi implantado. */
export async function validarKaizen(id: string, aplicavelOutrosSetores: boolean, obs?: string): Promise<void> {
  const { error } = await (supabase.rpc as any)('plan_kaizen_validar', {
    p_id: id,
    p_aplicavel_outros_setores: aplicavelOutrosSetores,
    p_obs: obs ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function excluirKaizen(id: string, excluidoPor: string): Promise<void> {
  const { error } = await db()
    .update({ excluido_em: new Date().toISOString(), excluido_por: excluidoPor })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

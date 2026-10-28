/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Validação Técnica — I/O de `sup_validacao_tecnica`. Tabela nova fora de
 * `database.types.ts`, daí o `as any`. Regras em `validacaoTecnica.ts`.
 *
 * Os anexos sobem ANTES do insert (o id do chamado nasce no cliente), já
 * comprimidos por `prepareAttachment` na tela (regra 1 do app).
 */

import { supabase } from '../db/supabaseClient';
import type { PreparedAttachment } from './imageCompression';
import type { AnexoValidacao, UsuarioMarcado, ValidacaoTecnica } from './validacaoTecnica';

const TABELA = 'sup_validacao_tecnica';
const BUCKET = 'request-attachments';

export async function listarValidacoesTecnicas(): Promise<ValidacaoTecnica[]> {
  const { data, error } = await (supabase as any)
    .from(TABELA)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ValidacaoTecnica[];
}

export interface NovaValidacao {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
  setor_id: string;
  setor_nome: string | null;
  descricao: string;
  links: string[];
  marcados: UsuarioMarcado[];
}

function extensao(nome: string, mime: string): string {
  const ext = nome.match(/\.([a-z0-9]+)$/i)?.[1];
  if (ext) return ext.toLowerCase();
  return mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] || 'bin';
}

/** Abre o chamado: sobe os anexos e grava. Devolve o registro com o código. */
export async function abrirValidacaoTecnica(
  dados: NovaValidacao,
  arquivos: PreparedAttachment[],
  usuario: { id: string; nome: string },
): Promise<ValidacaoTecnica> {
  const id = crypto.randomUUID();
  const anexos: AnexoValidacao[] = [];
  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i];
    const path = `validacao-tecnica/${id}/${i + 1}.${extensao(a.name, a.mimeType)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, a.blob, { contentType: a.mimeType, upsert: true });
    if (error) throw new Error(`Falha ao enviar ${a.name}: ${error.message}`);
    anexos.push({ path, nome: a.name, tipo: a.mimeType });
  }

  const { data, error } = await (supabase as any)
    .from(TABELA)
    .insert({
      id,
      ...dados,
      anexos,
      marcados_ids: dados.marcados.map(m => m.id),
      criado_por: usuario.id,
      criado_por_nome: usuario.nome,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as ValidacaoTecnica;
}

export async function decidirValidacaoTecnica(id: string, aprovar: boolean, parecer: string): Promise<void> {
  const { error } = await (supabase as any).rpc('sup_validacao_tecnica_decidir', {
    p_id: id,
    p_aprovar: aprovar,
    p_parecer: parecer || null,
  });
  if (error) throw new Error(error.message);
}

/** URLs assinadas (24 h) dos anexos, por caminho. */
export async function assinarAnexosValidacao(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 24);
  if (error) throw new Error(error.message);
  const urls: Record<string, string> = {};
  (data || []).forEach(d => { if (d.path && d.signedUrl) urls[d.path] = d.signedUrl; });
  return urls;
}

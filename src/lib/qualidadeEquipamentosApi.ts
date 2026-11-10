import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../db/supabaseClient';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import { dataHojeLocal } from './dataLocal';
import { prepareAttachment } from './imageCompression';
import type { CategoriaEquipamento, DadosEquipamento, EquipamentoQualidade, EventoEquipamento, LinhaImportacaoEquipamento } from './qualidadeEquipamentos';

const db = supabase as SupabaseClient;
const BUCKET = 'qua-equipamentos';
export async function listarEquipamentosQualidade(): Promise<EquipamentoQualidade[]> {
  const registros: EquipamentoQualidade[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await db.from('qua_equipamentos').select('*').order('id').range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    registros.push(...(data || []));
    if ((data?.length || 0) < 1000) return registros;
  }
}
export async function listarEventosEquipamento(id?: string): Promise<EventoEquipamento[]> {
  const eventos: EventoEquipamento[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    let query = db.from('qua_equipamentos_eventos').select('*').order('criado_em', { ascending: false }).order('id').range(inicio, inicio + 999);
    if (id) query = query.eq('equipamento_id', id);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    eventos.push(...(data || []));
    if ((data?.length || 0) < 1000) return eventos;
  }
}
/** Índice EQP reinicia por mês. Inclui arquivados para nunca reutilizar códigos.
 * A unicidade é garantida pelo banco; concorrência repete a leitura antes de tentar novamente. */
async function proximoIndiceEquipamento(dataISO: string): Promise<number> {
  const registros = await listarEquipamentosQualidade();
  const mesCodigo = dataISO.slice(5, 7) + dataISO.slice(2, 4);
  return proximoIndiceCodigo('EQP', registros.filter(r => r.codigo.split('-')[1]?.slice(2) === mesCodigo).map(r => r.codigo));
}
export interface NovoEventoEquipamento { tipo: string; descricao: string; data_evento: string; anexo_path?: string; anexo_nome?: string }
export async function salvarEquipamentoQualidade(categoria: CategoriaEquipamento, dados: DadosEquipamento, atual: EquipamentoQualidade | null, evento: NovoEventoEquipamento, arquivado = atual?.arquivado || false): Promise<string> {
  const hoje = dataHojeLocal();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = atual?.codigo || gerarCodigoFormulario('EQP', hoje, await proximoIndiceEquipamento(hoje));
    const { data, error } = await db.rpc('qua_equipamento_salvar', { p_id: atual?.id || null, p_versao: atual?.versao || null, p_registro: { categoria, dados, codigo, data_registro: hoje, arquivado }, p_evento: evento });
    if (!error) return data as string;
    if (error.code !== '23505' || atual || tentativa === 2) throw new Error(error.message);
  }
  throw new Error('Não foi possível reservar o código. Atualize e tente novamente.');
}
export async function importarEquipamentosQualidade(linhas: LinhaImportacaoEquipamento[], arquivo: string): Promise<{ novos: number; ignorados: number }> {
  const hoje = dataHojeLocal();
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const indice = await proximoIndiceEquipamento(hoje);
    const { data, error } = await db.rpc('qua_equipamentos_importar', { p_linhas: linhas.map((l, i) => ({ ...l, codigo: gerarCodigoFormulario('EQP', hoje, indice + i) })), p_arquivo: arquivo, p_data: hoje });
    if (!error) return data as { novos: number; ignorados: number };
    if (error.code !== '23505' || tentativa === 2) throw new Error(error.message);
  }
  throw new Error('Falha ao importar. Nenhum registro foi alterado.');
}
export async function enviarAnexoEquipamento(file: File): Promise<{ anexo_path: string; anexo_nome: string }> {
  const preparado = await prepareAttachment(file);
  URL.revokeObjectURL(preparado.previewUrl);
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error('Sessão expirada. Entre novamente.');
  const path = `${user.id}/${crypto.randomUUID()}/${preparado.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await db.storage.from(BUCKET).upload(path, preparado.blob, { upsert: false, contentType: preparado.mimeType });
  if (error) throw new Error(error.message);
  return { anexo_path: path, anexo_nome: file.name };
}
export async function removerAnexoOrfaoEquipamento(path: string): Promise<void> {
  const { error } = await db.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
export async function abrirAnexoEquipamento(path: string): Promise<string> {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

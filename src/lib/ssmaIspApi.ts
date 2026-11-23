import { supabase } from '../db/supabaseClient';
import type { Tables } from '../db/database.types';
import { gerarCodigoFormulario } from './codigosFormulario';
import { comprimirImagemUpload } from './imageCompression';
import { ficouNaFila, type ExclusaoRegistro } from './ssmaSegurancaRegistro';

export type ItemIsp = Tables<'ssma_isp_itens'>;
export type AcaoIsp = Omit<Tables<'ssma_isp_acoes'>, 'inspecao_id' | 'ordem'>;
export type CabecalhoIsp = Pick<Tables<'ssma_isp_inspecoes'>,
  'data' | 'inicio' | 'area' | 'responsavel_area' | 'inspetor' | 'tst' | 'duracao_min' | 'inspecionados' | 'hhi' | 'comentarios'>;
export type DadosIsp = CabecalhoIsp & { respostas: Record<string, number>; acoes: AcaoIsp[] };
export type RegistroIsp = DadosIsp & ExclusaoRegistro & { id: string; codigo: string; fotos: string[] };
export type PeriodoIsp = { de: string; ate: string };
export type FotoIsp = { id: string; arquivo: File };
export const GRUPOS_ISP = ['G', 'M', 'L'] as const;
export const TAMANHO_PAGINA_ISP = 20;
const bucket = () => supabase.storage.from('ssma-isp');

export async function listarItensIsp() {
  const { data, error } = await supabase.from('ssma_isp_itens').select('*').order('ordem');
  if (error) throw error;
  if (data.length !== 43) throw new Error('O checklist da revisão 01 está indisponível para este perfil.');
  return data;
}

/** O banco reserva o índice por dia dentro da transação. A apresentação usa o código comum do SISTEN. */
export async function listarInspecoesIsp(periodo: PeriodoIsp, pagina: number, incluirExcluidos = false) {
  let query = supabase.from('ssma_isp_inspecoes').select(
    'id,data,indice,inicio,area,responsavel_area,inspetor,tst,duracao_min,inspecionados,hhi,comentarios,fotos,criado_por,excluido_em,excluido_por,motivo_exclusao,ssma_isp_respostas(item,quantidade,ssma_isp_acoes(ordem,item,quantidade,descricao,responsavel,prazo,rnc))',
  );
  if (!incluirExcluidos) query = query.is('excluido_em', null);
  if (periodo.de) query = query.gte('data', periodo.de);
  if (periodo.ate) query = query.lte('data', periodo.ate);
  const inicio = pagina * TAMANHO_PAGINA_ISP;
  const { data, error } = await query.order('data', { ascending: false }).order('indice', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA_ISP - 1);
  if (error) throw error;
  return data.map(({ indice, ssma_isp_respostas, ...registro }): RegistroIsp => ({
    ...registro, codigo: gerarCodigoFormulario('ISP', registro.data, indice),
    respostas: Object.fromEntries(ssma_isp_respostas.map(r => [r.item, r.quantidade])),
    acoes: ssma_isp_respostas.flatMap(r => r.ssma_isp_acoes).sort((a, b) => a.ordem - b.ordem),
  }));
}

export async function inspecoesParaExportar(periodo: PeriodoIsp) {
  const registros: RegistroIsp[] = [];
  for (let pagina = 0; ; pagina++) {
    const lote = await listarInspecoesIsp(periodo, pagina);
    registros.push(...lote);
    if (lote.length < TAMANHO_PAGINA_ISP) return registros;
  }
}

/** Devolve `offline: true` quando a inspeção ficou na fila do aparelho (sem rede). */
export async function registrarIsp(id: string, usuarioId: string, dados: DadosIsp, arquivos: FotoIsp[]): Promise<{ offline: boolean }> {
  const fotos: string[] = [];
  let podeDescartar = true;
  try {
    for (const { id: fotoId, arquivo } of arquivos) {
      const blob = await comprimirImagemUpload(arquivo);
      const extensao = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
      if (!extensao || blob.size > 10 * 1024 * 1024) throw new Error('Use fotos JPG, PNG ou WebP de até 10 MB após compressão.');
      const caminho = [usuarioId, id, fotoId + '.' + extensao].join('/');
      const { error } = await bucket().upload(caminho, blob, { contentType: blob.type });
      // A mesma seleção mantém o caminho ao repetir um envio interrompido.
      if (error && String(error.statusCode) !== '409' && error.name !== 'Duplicate' && !/already exists/i.test(error.message)) throw error;
      fotos.push(caminho);
    }
    // Se a rede cair após o envio, a transação ainda pode confirmar. As fotos
    // ficam no mesmo caminho para a repetição idempotente do registro.
    podeDescartar = false;
    const { error } = await supabase.rpc('ssma_isp_registrar', { p_id: id, p_dados: { ...dados, fotos } });
    if (error) {
      podeDescartar = /^[0-9A-Z]{5}$/.test(error.code);
      throw error;
    }
    return { offline: await ficouNaFila('isp', id) };
  } catch (error) {
    // A política de Storage preserva fotos de uma gravação já confirmada pelo servidor.
    if (podeDescartar && fotos.length) await bucket().remove(fotos).catch(() => {});
    throw error;
  }
}

export async function assinarFotosIsp(caminhos: string[]) {
  if (!caminhos.length) return [];
  const { data, error } = await bucket().createSignedUrls(caminhos, 600);
  if (error) throw error;
  return data.map(foto => {
    if (foto.error || !foto.signedUrl) throw new Error('Não foi possível carregar uma foto da inspeção.');
    return foto.signedUrl;
  });
}

export function totalIsp(respostas: Record<string, number>, grupo = '') {
  return Object.entries(respostas).reduce((total, [item, qtd]) => total + (item.startsWith(grupo) ? qtd : 0), 0);
}

export const dataIspBR = (data: string) => data.split('-').reverse().join('/');
export const erroIsp = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Falha ao acessar a inspeção.';


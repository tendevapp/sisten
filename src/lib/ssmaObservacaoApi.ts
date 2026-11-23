import { supabase } from '../db/supabaseClient';
import type { Tables } from '../db/database.types';
import { gerarCodigoFormulario } from './codigosFormulario';
import { ficouNaFila } from './ssmaSegurancaRegistro';

type Cartao = Tables<'ssma_oc_registros'>;
type CamposServidor = 'id' | 'indice' | 'criado_em' | 'criado_por' | 'hash_envio' | 'excluido_em' | 'excluido_por' | 'motivo_exclusao';
export type ItemObservacao = Tables<'ssma_oc_itens'>;
export type DadosObservacao = Omit<Cartao, CamposServidor> & { itens: number[]; desvios: string[] };
export type RegistroObservacao = DadosObservacao & Pick<Cartao, 'criado_por' | 'excluido_em' | 'excluido_por' | 'motivo_exclusao'>
  & { id: string; indice: number; codigo: string };
export type PeriodoObservacao = { de: string; ate: string };
export const tamanhoPagina = 20;

export function agruparChecklist(itens: ItemObservacao[]) {
  const grupos = new Map<string, ItemObservacao[]>();
  for (const item of itens) {
    const grupo = grupos.get(item.grupo);
    if (grupo) grupo.push(item);
    else grupos.set(item.grupo, [item]);
  }
  return [...grupos.entries()];
}

export function desviosPorHora(quantidade: number, minutos: number) {
  return minutos > 0 ? quantidade * 60 / minutos : 0;
}

export async function listarChecklistObservacao() {
  const { data, error } = await supabase.from('ssma_oc_itens').select('*').order('id');
  if (error) throw error;
  if (data.length !== 35) throw new Error('O checklist da revisão 04 está indisponível. Atualize para tentar novamente.');
  return data;
}

/** Devolve `offline: true` quando o cartão ficou na fila do aparelho (sem rede). */
export async function registrarObservacao(id: string, dados: DadosObservacao): Promise<{ offline: boolean }> {
  const { error } = await supabase.rpc('ssma_oc_registrar', {p_id: id, p_dados: dados});
  if (error) throw error;
  return { offline: await ficouNaFila('oc', id) };
}

// O banco reserva o índice por dia. Checklist e relatos são lidos com o cartão.
async function consultar(periodo: PeriodoObservacao, pagina: number, incluirExcluidos: boolean,
  cursor?: Pick<Cartao, 'data'|'indice'>): Promise<RegistroObservacao[]> {
  let query = supabase.from('ssma_oc_registros').select(
    'id,indice,data,nome,local,turno_letra,lider_area,duracao_min,pessoas_contatadas,pessoas_observadas,praticas_seguras,criado_por,excluido_em,excluido_por,motivo_exclusao,ssma_oc_marcacoes(item_id),ssma_oc_desvios(ordem,descricao)'
  );
  if (!incluirExcluidos) query = query.is('excluido_em', null);
  if (periodo.de) query = query.gte('data', periodo.de);
  if (periodo.ate) query = query.lte('data', periodo.ate);
  if (cursor) query = query.or(`data.lt.${cursor.data},and(data.eq.${cursor.data},indice.lt.${cursor.indice})`);
  const inicio = pagina * tamanhoPagina;
  const { data, error } = await query.order('data', {ascending:false}).order('indice', {ascending:false}).range(inicio, inicio+tamanhoPagina-1);
  if (error) throw error;
  return data.map(({ssma_oc_marcacoes, ssma_oc_desvios, ...r}) => ({ ...r,
    codigo: gerarCodigoFormulario('OC', r.data, r.indice),
    itens: ssma_oc_marcacoes.map(m => m.item_id),
    desvios: [...ssma_oc_desvios].sort((a,b) => a.ordem-b.ordem).map(d => d.descricao),
  }));
}

export const listarObservacoes = (periodo: PeriodoObservacao, pagina: number, incluirExcluidos = false) =>
  consultar(periodo, pagina, incluirExcluidos);

export async function observacoesParaExportar(periodo: PeriodoObservacao) {
  const registros: RegistroObservacao[] = [];
  let cursor: RegistroObservacao | undefined;
  for (;;) {
    const pagina = await consultar(periodo, 0, false, cursor);
    registros.push(...pagina);
    if (pagina.length < tamanhoPagina) return registros;
    cursor = pagina[pagina.length-1];
  }
}

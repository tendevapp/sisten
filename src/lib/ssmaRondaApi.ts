import { supabase } from '../db/supabaseClient';
import type { Tables } from '../db/database.types';
import { gerarCodigoFormulario } from './codigosFormulario';
import { ficouNaFila } from './ssmaSegurancaRegistro';

export const categoriasRonda = [
  { chave: 'epi', nome: 'Falta de equipamentos de proteção individual' },
  { chave: 'queda', nome: 'Risco de queda de materiais e pessoas' },
  { chave: 'organizacao', nome: 'Falta de organização e limpeza' },
  { chave: 'protecao_coletiva', nome: 'Falta de proteção coletiva' },
] as const;

type Ronda = Tables<'ssma_rondas'>;
type CamposServidor = 'id' | 'indice' | 'criado_em' | 'criado_por' | 'hash_envio' | 'excluido_em' | 'excluido_por' | 'motivo_exclusao';
export type ParticipanteRonda = Pick<Tables<'ssma_ronda_participantes'>, 'nome' | 'assinatura'>;
export type DadosRonda = Omit<Ronda, CamposServidor> & { participantes: ParticipanteRonda[] };
export type RegistroRonda = DadosRonda & Pick<Ronda, 'criado_por' | 'excluido_em' | 'excluido_por' | 'motivo_exclusao'> & { id: string; codigo: string };
export type PeriodoRonda = { de: string; ate: string };
export const paginaRondas = 20;

const COLUNAS_RESUMO = 'id,indice,data,hora,gerente,frentes,epi,queda,organizacao,protecao_coletiva,criado_por,excluido_em,excluido_por,motivo_exclusao';
const COLUNAS_COMPLETAS = COLUNAS_RESUMO + ',assinatura_gerente,boas_praticas,observacoes,ssma_ronda_participantes(ordem,nome,assinatura)';

export function totalRonda(ronda: Pick<Ronda, typeof categoriasRonda[number]['chave']>) {
  return categoriasRonda.reduce((soma, { chave }) => soma + ronda[chave], 0);
}

// O índice é reservado por dia, na transação de gravação.
function comCodigo<T extends Pick<Ronda, 'data' | 'indice'>>(ronda: T) {
  return { ...ronda, codigo: gerarCodigoFormulario('RST', ronda.data, ronda.indice) };
}

type LinhaCompleta = Omit<RegistroRonda, 'codigo' | 'participantes'> & Pick<Ronda, 'indice'> & {
  ssma_ronda_participantes: (ParticipanteRonda & { ordem: number })[];
};

function montar({ ssma_ronda_participantes, ...ronda }: LinhaCompleta): RegistroRonda {
  return { ...comCodigo(ronda), participantes: [...ssma_ronda_participantes].sort((a, b) => a.ordem - b.ordem) };
}

export async function listarRondas(periodo: PeriodoRonda, pagina: number, incluirExcluidos = false) {
  let consulta = supabase.from('ssma_rondas').select(COLUNAS_RESUMO);
  if (!incluirExcluidos) consulta = consulta.is('excluido_em', null);
  if (periodo.de) consulta = consulta.gte('data', periodo.de);
  if (periodo.ate) consulta = consulta.lte('data', periodo.ate);
  const inicio = pagina * paginaRondas;
  const { data, error } = await consulta.order('data', { ascending: false }).order('indice', { ascending: false })
    .range(inicio, inicio + paginaRondas - 1);
  if (error) throw error;
  return data.map(comCodigo);
}

export type ResumoRonda = Awaited<ReturnType<typeof listarRondas>>[number];

export async function obterRonda(id: string): Promise<RegistroRonda> {
  const { data, error } = await supabase.from('ssma_rondas').select(COLUNAS_COMPLETAS).eq('id', id).single();
  if (error) throw error;
  return montar(data as unknown as LinhaCompleta);
}

/** Devolve `offline: true` quando a ronda ficou na fila do aparelho (sem rede). */
export async function registrarRonda(id: string, dados: DadosRonda): Promise<{ offline: boolean }> {
  const { error } = await supabase.rpc('ssma_ronda_registrar', { p_id: id, p_dados: dados });
  if (error) throw error;
  return { offline: await ficouNaFila('ronda', id) };
}

export async function rondasParaExportar(periodo: PeriodoRonda) {
  // Paginação por chave estável para que inclusões simultâneas não desloquem as
  // páginas. Uma consulta por página, com os participantes embutidos.
  const registros: RegistroRonda[] = [];
  let cursor: Pick<Ronda, 'data' | 'indice'> | undefined;
  for (;;) {
    let consulta = supabase.from('ssma_rondas').select(COLUNAS_COMPLETAS).is('excluido_em', null);
    if (periodo.de) consulta = consulta.gte('data', periodo.de);
    if (periodo.ate) consulta = consulta.lte('data', periodo.ate);
    if (cursor) consulta = consulta.or(`data.lt.${cursor.data},and(data.eq.${cursor.data},indice.lt.${cursor.indice})`);
    const { data, error } = await consulta.order('data', { ascending: false }).order('indice', { ascending: false }).limit(paginaRondas);
    if (error) throw error;
    const linhas = data as unknown as LinhaCompleta[];
    registros.push(...linhas.map(montar));
    if (linhas.length < paginaRondas) return registros;
    cursor = linhas[linhas.length - 1];
  }
}

/**
 * Cliente Supabase para monitoramento de IP por usuario:
 * - registro fire-and-forget de login/sessao/troca de IP via RPC server-side;
 * - consulta de acessos classificados e gestao da whitelist (somente admin via RLS).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../db/supabaseClient';
import {
  dataInicioPeriodo,
  normalizarEntradaCidr,
  type AcessoIpRegistro,
  type IpConfiavelCorporativo,
  type PeriodoMonitorIp,
  type TipoEventoIp,
} from './monitoramentoIp';

const SESSION_KEY = 'usage_session_id';
const INTERVALO_MIN_SESSAO_MS = 10 * 60 * 1000;

let ultimoEnvioSessaoMs = 0;
let ultimoEnvioLoginMs = 0;
let ultimoIpDetectado: { ip: string | null; pais: string | null } = { ip: null, pais: null };

function obterClienteSemTipagemRestrita(): SupabaseClient | null {
  return supabase ? (supabase as unknown as SupabaseClient) : null;
}

function obterOuCriarSessionId(): string {
  try {
    const existente = sessionStorage.getItem(SESSION_KEY);
    if (existente) return existente;
    const novo =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, novo);
    return novo;
  } catch {
    return `sess_${Date.now()}`;
  }
}

export interface ResultadoRegistroIp {
  ok: boolean;
  ip?: string;
  tipo_evento?: TipoEventoIp;
  pais?: string | null;
  motivo?: string;
}

/**
 * Registra o IP do usuario autenticado no servidor.
 * Nunca lanca excecao para a UI: falhas de rede ou offline sao ignoradas.
 */
export async function registrarAcessoIp(
  tipoEvento: 'login' | 'sessao' = 'sessao',
  opcoes?: { forcar?: boolean },
): Promise<ResultadoRegistroIp | null> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) return null;

  const agora = Date.now();
  if (!opcoes?.forcar) {
    if (tipoEvento === 'login' && agora - ultimoEnvioLoginMs < 15_000) {
      return null;
    }
    if (tipoEvento === 'sessao' && agora - ultimoEnvioSessaoMs < INTERVALO_MIN_SESSAO_MS) {
      return null;
    }
  }

  if (tipoEvento === 'login') ultimoEnvioLoginMs = agora;
  ultimoEnvioSessaoMs = agora;

  try {
    const { data, error } = await client.rpc('registrar_acesso_ip', {
      p_tipo_evento: tipoEvento,
      p_session_id: obterOuCriarSessionId(),
    });
    if (error) {
      console.debug('monitoramentoIp: falha ao registrar acesso (ignorado)', error.message);
      return null;
    }
    const res = (data ?? null) as ResultadoRegistroIp | null;
    if (res?.ok && res.ip) {
      ultimoIpDetectado = { ip: res.ip, pais: res.pais ?? null };
    }
    return res;
  } catch (err) {
    console.debug('monitoramentoIp: erro ao registrar acesso (ignorado)', err);
    return null;
  }
}

export function obterUltimoIpDetectadoCache(): { ip: string | null; pais: string | null } {
  return ultimoIpDetectado;
}

export async function detectarMeuIpAtual(): Promise<{ ip: string | null; pais: string | null }> {
  const res = await registrarAcessoIp('sessao', { forcar: true });
  if (res?.ok && res.ip) {
    return { ip: res.ip, pais: res.pais ?? null };
  }
  return ultimoIpDetectado;
}

export async function listarAcessosIp(periodo: PeriodoMonitorIp = '7d'): Promise<AcessoIpRegistro[]> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) return [];

  const inicio = dataInicioPeriodo(periodo);
  let query = client
    .from('vw_core_acessos_ip_monitor')
    .select('*')
    .order('ultimo_visto_em', { ascending: false })
    .limit(2000);

  if (inicio) {
    query = query.gte('ultimo_visto_em', inicio);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao carregar monitoramento de IPs: ${error.message}`);
  }
  return (data ?? []) as AcessoIpRegistro[];
}

export async function listarIpsConfiaveis(): Promise<IpConfiavelCorporativo[]> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) return [];

  const { data, error } = await client
    .from('core_ips_confiaveis')
    .select('*')
    .order('ativo', { ascending: false })
    .order('rotulo', { ascending: true });

  if (error) {
    throw new Error(`Falha ao carregar redes confiáveis: ${error.message}`);
  }
  return (data ?? []) as IpConfiavelCorporativo[];
}

export async function adicionarIpConfiavel(params: {
  cidr: string;
  rotulo: string;
  descricao?: string;
  criadoPor: string;
}): Promise<IpConfiavelCorporativo> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) throw new Error('Supabase não inicializado.');

  const validacao = normalizarEntradaCidr(params.cidr);
  if (!validacao.valido) {
    throw new Error(validacao.erro || 'IP ou CIDR inválido.');
  }

  const rotulo = params.rotulo.trim();
  if (rotulo.length < 2) {
    throw new Error('Informe um rótulo descritivo para a rede (mínimo 2 caracteres).');
  }

  const { data, error } = await client
    .from('core_ips_confiaveis')
    .insert({
      cidr: validacao.normalizado,
      rotulo,
      descricao: params.descricao?.trim() || null,
      ativo: true,
      criado_por: params.criadoPor,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`O endereço/faixa ${validacao.normalizado} já está cadastrado na lista confiável.`);
    }
    throw new Error(`Falha ao cadastrar rede confiável: ${error.message}`);
  }
  return data as IpConfiavelCorporativo;
}

export async function alternarIpConfiavel(id: string, ativo: boolean): Promise<void> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) throw new Error('Supabase não inicializado.');

  const { error } = await client
    .from('core_ips_confiaveis')
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(`Falha ao atualizar status da rede: ${error.message}`);
  }
}

export async function removerIpConfiavel(id: string): Promise<void> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) throw new Error('Supabase não inicializado.');

  const { error } = await client
    .from('core_ips_confiaveis')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Falha ao remover rede confiável: ${error.message}`);
  }
}

export async function aprovarIpParaUsuario(params: {
  userId: string;
  ip: string;
  rotulo?: string;
  aprovadoPor: string;
}): Promise<void> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) throw new Error('Supabase não inicializado.');

  const { error } = await client
    .from('core_usuarios_ips_conhecidos')
    .upsert(
      {
        user_id: params.userId,
        ip_address: params.ip.trim(),
        rotulo: params.rotulo?.trim() || 'IP aprovado pelo administrador',
        aprovado_por: params.aprovadoPor,
        aprovado_em: new Date().toISOString(),
      },
      { onConflict: 'user_id,ip_address' },
    );

  if (error) {
    throw new Error(`Falha ao aprovar IP para o usuário: ${error.message}`);
  }
}

export async function revogarIpDoUsuario(id: string): Promise<void> {
  const client = obterClienteSemTipagemRestrita();
  if (!client) throw new Error('Supabase não inicializado.');

  const { error } = await client
    .from('core_usuarios_ips_conhecidos')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Falha ao remover confiança do IP: ${error.message}`);
  }
}


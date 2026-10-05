/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regime tributário do fornecedor (Simples Nacional / MEI) para o mapa
 * comparativo e o export SAP.
 *
 * Fonte: a mesma rota do Cadastro SAP — Edge Function `consultar-cnpj`
 * (`cnpjLookup.ts`), que lê a Receita via BrasilAPI → ReceitaWS → cnpj.ws.
 * Conferida em 05/10/2026 contra o `simples_nacional_sap` da ZL0136: 10 de 10
 * fornecedores batem.
 *
 * Cada consulta é gravada em `sup_fornecedor_regime_fiscal` e vale por
 * `VALIDADE_DIAS`: sem isso, abrir o mapa de um processo com seis fornecedores
 * dispararia seis consultas às bases públicas (que limitam a poucas por
 * minuto) toda vez. Sem a tabela (ou sem permissão de gravar) o resultado
 * fica só na memória da sessão — a consulta continua valendo, só não é
 * lembrada na próxima.
 */

import { supabase } from '../db/supabaseClient';
import { cnpjValido, consultarCnpj } from './cnpjLookup';
import type { CnpjInfo } from './cnpjLookup';

export const VALIDADE_DIAS = 30;
const TABELA = 'sup_fornecedor_regime_fiscal';
/** Intervalo entre consultas ao servidor — as bases públicas derrubam rajada. */
const PAUSA_ENTRE_CONSULTAS_MS = 400;

export interface RegimeFornecedor {
  /** CNPJ só com dígitos. */
  cnpj: string;
  simples: boolean;
  mei: boolean;
  /** Ex.: "ATIVA", "INAPTA", "BAIXADA". */
  situacaoCadastral: string | null;
  razaoSocial: string | null;
  /** Base que respondeu (BrasilAPI, ReceitaWS, cnpj.ws). */
  fonte: string | null;
  /** ISO 8601. */
  consultadoEm: string;
}

export const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

/** MEI é Simples para fins de crédito e de código de imposto. */
export const ehSimplesParaImposto = (r: Pick<RegimeFornecedor, 'simples' | 'mei'>) => r.simples || r.mei;

export function regimeVencido(r: Pick<RegimeFornecedor, 'consultadoEm'>, agora: Date = new Date()): boolean {
  const t = Date.parse(r.consultadoEm);
  if (!Number.isFinite(t)) return true;
  return agora.getTime() - t > VALIDADE_DIAS * 86_400_000;
}

/** Situação diferente de ATIVA (inapta, suspensa, baixada) — o fornecedor não deveria receber pedido. */
export const situacaoIrregular = (r: Pick<RegimeFornecedor, 'situacaoCadastral'>) =>
  !!r.situacaoCadastral && r.situacaoCadastral.toUpperCase() !== 'ATIVA';

export function regimeDeConsulta(info: CnpjInfo, agora: Date = new Date()): RegimeFornecedor {
  return {
    cnpj: soDigitos(info.cnpj),
    simples: info.simples,
    mei: info.mei,
    situacaoCadastral: info.situacaoCadastral || null,
    razaoSocial: info.razaoSocial || null,
    fonte: info.fonte ?? null,
    consultadoEm: agora.toISOString(),
  };
}

// Memória da sessão: vale mesmo sem a tabela de cache.
const memoria = new Map<string, RegimeFornecedor>();

/** Cliente sem tipos gerados para a tabela nova (ainda fora de `database.types.ts`). */
const tabela = () => (supabase as unknown as { from: (t: string) => any }).from(TABELA);

function linhaParaRegime(r: any): RegimeFornecedor {
  return {
    cnpj: r.cnpj,
    simples: !!r.simples,
    mei: !!r.mei,
    situacaoCadastral: r.situacao_cadastral ?? null,
    razaoSocial: r.razao_social ?? null,
    fonte: r.fonte ?? null,
    consultadoEm: r.consultado_em,
  };
}

/** Lê o que já foi consultado. Falha (tabela ausente, sem permissão) devolve só o que há na memória. */
export async function lerRegimesGravados(cnpjs: string[]): Promise<Map<string, RegimeFornecedor>> {
  const out = new Map<string, RegimeFornecedor>();
  const unicos = [...new Set(cnpjs.map(soDigitos).filter(c => c.length === 14))];
  for (const c of unicos) { const m = memoria.get(c); if (m) out.set(c, m); }

  const faltam = unicos.filter(c => !out.has(c));
  if (faltam.length === 0) return out;
  try {
    const { data, error } = await tabela().select('*').in('cnpj', faltam);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const reg = linhaParaRegime(r);
      memoria.set(reg.cnpj, reg);
      out.set(reg.cnpj, reg);
    }
  } catch (err) {
    console.warn('Cache de regime fiscal indisponível; usando só a memória da sessão.', err);
  }
  return out;
}

async function gravarRegime(r: RegimeFornecedor, usuario: string | null): Promise<void> {
  memoria.set(r.cnpj, r);
  try {
    const { error } = await tabela().upsert({
      cnpj: r.cnpj,
      simples: r.simples,
      mei: r.mei,
      situacao_cadastral: r.situacaoCadastral,
      razao_social: r.razaoSocial,
      fonte: r.fonte,
      consultado_em: r.consultadoEm,
      consultado_por: usuario,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn('Não foi possível gravar o regime fiscal consultado; vale só nesta sessão.', err);
  }
}

/** Consulta um CNPJ na Receita (via Edge Function) e grava. Lança com mensagem pronta para exibir. */
export async function consultarERegistrarRegime(cnpj: string, usuario: string | null): Promise<RegimeFornecedor> {
  const info = await consultarCnpj(cnpj);
  const regime = regimeDeConsulta(info);
  await gravarRegime(regime, usuario);
  return regime;
}

export interface ResultadoRegimes {
  regimes: Map<string, RegimeFornecedor>;
  /** CNPJ → motivo, para quem não deu para consultar. */
  falhas: Map<string, string>;
}

/**
 * Regime de cada CNPJ: o gravado, se tem menos de `VALIDADE_DIAS`; senão
 * consulta (um por vez, com pausa). Quando a reconsulta falha, o regime
 * vencido continua valendo — melhor um dado de 40 dias que nenhum.
 * `aoResolver` é chamado a cada CNPJ concluído, para a tela atualizar aos poucos.
 */
export async function resolverRegimes(
  cnpjs: string[],
  opcoes: { usuario?: string | null; forcar?: boolean; aoResolver?: (r: RegimeFornecedor) => void } = {},
): Promise<ResultadoRegimes> {
  const unicos = [...new Set(cnpjs.map(soDigitos).filter(c => c.length === 14))];
  const falhas = new Map<string, string>();
  for (const c of cnpjs.map(soDigitos)) {
    if (c && c.length !== 14) falhas.set(c, 'CNPJ incompleto na proposta');
  }
  const regimes = await lerRegimesGravados(unicos);
  for (const r of regimes.values()) if (!regimeVencido(r) && !opcoes.forcar) opcoes.aoResolver?.(r);

  const pendentes = unicos.filter(c => {
    const r = regimes.get(c);
    return opcoes.forcar || !r || regimeVencido(r);
  });

  let primeira = true;
  for (const c of pendentes) {
    if (!cnpjValido(c)) { falhas.set(c, 'CNPJ inválido (dígito verificador)'); continue; }
    if (!primeira) await new Promise(res => setTimeout(res, PAUSA_ENTRE_CONSULTAS_MS));
    primeira = false;
    try {
      const r = await consultarERegistrarRegime(c, opcoes.usuario ?? null);
      regimes.set(c, r);
      opcoes.aoResolver?.(r);
    } catch (err) {
      falhas.set(c, (err as Error).message);
      const antigo = regimes.get(c);
      if (antigo) opcoes.aoResolver?.(antigo);
    }
  }
  return { regimes, falhas };
}

/** Texto curto para o tooltip: o que o regime significa para a decisão e de onde veio. */
export function descreverRegime(r: RegimeFornecedor): string {
  const quando = new Date(r.consultadoEm);
  const data = Number.isNaN(quando.getTime()) ? '' : quando.toLocaleDateString('pt-BR');
  const origem = `Receita Federal${r.fonte ? ` via ${r.fonte}` : ''}${data ? `, consultado em ${data}` : ''}`;
  const linhas = [
    r.mei ? 'Microempreendedor Individual (MEI).'
      : r.simples ? 'Optante pelo Simples Nacional.'
        : 'Não é optante do Simples Nacional.',
    ehSimplesParaImposto(r)
      ? 'ICMS só gera crédito se a nota destacar o crédito do Simples; sem destaque, não há crédito de ICMS (o mapa não estima). PIS/COFINS segue creditando. No SAP, usar o código de imposto da série Simples.'
      : 'Destaca ICMS e IPI normalmente na nota.',
    r.situacaoCadastral ? `Situação cadastral: ${r.situacaoCadastral}.` : null,
    origem,
  ];
  return linhas.filter(Boolean).join('\n');
}

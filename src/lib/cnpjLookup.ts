/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Consulta de CNPJ em bases públicas para pré-preencher o cadastro de fornecedor.
 *
 * A consulta em si roda no Edge Function `consultar-cnpj` (server-side), que
 * encadeia BrasilAPI → ReceitaWS → cnpj.ws. Chamar direto do navegador não
 * funciona de forma confiável: só a BrasilAPI libera CORS e ela derruba a
 * conexão sob rate limit ("Failed to fetch"). Aqui ficam só as funções puras
 * (máscara, dígito verificador, sugestão de regime) e o disparo da função.
 *
 * O regime devolvido é uma sugestão: quem abre a solicitação confirma (MEI,
 * Simples, Presumido...), porque a base da Receita atrasa e o enquadramento
 * muda o fluxo (MEI exige CPF + documentos do titular).
 */

import { supabase } from '../db/supabaseClient';

export const REGIMES_TRIBUTARIOS = [
  'MEI',
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'Imune / Isento',
  'Não informado',
] as const;

export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

export interface CnpjInfo {
  cnpj: string; // formatado 00.000.000/0001-00
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string; // ex.: "ATIVA"
  regimeSugerido: RegimeTributario;
  mei: boolean;
  simples: boolean;
  porte: string;
  naturezaJuridica: string;
  cnaePrincipal: string;
  endereco: string; // logradouro, número, bairro numa linha
  municipio: string;
  uf: string;
  cep: string;
  email: string;
  telefone: string;
  fonte?: string; // qual base respondeu (BrasilAPI, ReceitaWS, cnpj.ws)
}

const digitos = (v: string): string => (v || '').replace(/\D/g, '');

/** Aplica a máscara 00.000.000/0001-00 conforme o usuário digita. */
export function formatarCnpj(v: string): string {
  const d = digitos(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Máscara 000.000.000-00 para o CPF do titular do MEI. */
export function formatarCpf(v: string): string {
  const d = digitos(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Validação dos dígitos verificadores do CNPJ (não consulta a Receita). */
export function cnpjValido(v: string): boolean {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string): number => {
    let soma = 0;
    let peso = base.length - 7;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/** Validação dos dígitos verificadores do CPF. */
export function cpfValido(v: string): boolean {
  const c = digitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number): number => {
    let soma = 0;
    for (let i = 0; i < len; i += 1) soma += Number(c[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Sugere o regime a partir das flags de opção da Receita. */
export function regimeSugerido(mei: boolean, simples: boolean): RegimeTributario {
  if (mei) return 'MEI';
  if (simples) return 'Simples Nacional';
  return 'Não informado';
}

/**
 * Consulta o CNPJ pelo Edge Function e devolve os campos já normalizados.
 * Lança `Error` com mensagem pronta para exibir quando o CNPJ é inválido, não
 * existe na base ou os serviços estão fora.
 */
export async function consultarCnpj(entrada: string): Promise<CnpjInfo> {
  const c = digitos(entrada);
  if (!cnpjValido(c)) {
    throw new Error('CNPJ inválido. Confira os 14 dígitos.');
  }

  const { data, error } = await supabase.functions.invoke('consultar-cnpj', {
    body: { cnpj: c },
  });

  if (error) {
    const contexto = (error as { context?: { json?: () => Promise<unknown> } }).context;
    const corpo = typeof contexto?.json === 'function'
      ? await contexto.json().catch(() => null)
      : null;
    const msg = (corpo as { erro?: { mensagem?: string } } | null)?.erro?.mensagem;
    throw new Error(msg ?? error.message ?? 'Não foi possível consultar o CNPJ agora.');
  }

  if ((data as { erro?: { mensagem?: string } } | null)?.erro) {
    throw new Error((data as { erro: { mensagem?: string } }).erro.mensagem ?? 'Não foi possível consultar o CNPJ.');
  }

  return data as CnpjInfo;
}

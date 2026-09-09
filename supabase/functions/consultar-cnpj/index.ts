/**
 * Consulta um CNPJ em bases públicas e devolve os campos já normalizados para o
 * cadastro de fornecedor (SISTEN → Nova Solicitação → Cadastro SAP).
 *
 * Por que um Edge Function e não `fetch` direto do navegador: a única base
 * pública com CORS liberado é a BrasilAPI, e ela derruba a conexão sob rate
 * limit ("Failed to fetch" no browser). Aqui no servidor não há CORS, dá para
 * encadear BrasilAPI → ReceitaWS → cnpj.ws e ainda repetir a BrasilAPI quando
 * ela responde 429.
 *
 * O regime devolvido é só uma sugestão — quem abre a solicitação confirma
 * (MEI, Simples, Presumido...), porque a base da Receita atrasa e o
 * enquadramento muda o fluxo (MEI exige CPF + documentos do titular).
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const REGIMES = ['MEI', 'Simples Nacional', 'Não informado'] as const;
type Regime = (typeof REGIMES)[number];

interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  regimeSugerido: Regime;
  mei: boolean;
  simples: boolean;
  porte: string;
  naturezaJuridica: string;
  cnaePrincipal: string;
  endereco: string;
  municipio: string;
  uf: string;
  cep: string;
  email: string;
  telefone: string;
  fonte: string;
}

const digitos = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

function cnpjValido(c: string): boolean {
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

function formatarCnpj(c: string): string {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatarCep(v: unknown): string {
  const d = digitos(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function regimeDe(mei: boolean, simples: boolean): Regime {
  if (mei) return 'MEI';
  if (simples) return 'Simples Nacional';
  return 'Não informado';
}

function juntar(partes: unknown[], sep = ', '): string {
  return partes.map((p) => String(p ?? '').trim()).filter(Boolean).join(sep);
}

async function comTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** BrasilAPI — https://brasilapi.com.br/api/cnpj/v1/{cnpj}. Repete 1x no 429. */
async function viaBrasilApi(c: string): Promise<CnpjInfo | null> {
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const r = await comTimeout(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    if (r.status === 404) throw new HttpErro(404, 'CNPJ não encontrado na base da Receita Federal.');
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 1200));
      continue;
    }
    if (!r.ok) return null;
    const j = await r.json();
    const mei = j.opcao_pelo_mei === true;
    const simples = j.opcao_pelo_simples === true;
    return {
      cnpj: formatarCnpj(c),
      razaoSocial: String(j.razao_social ?? '').trim(),
      nomeFantasia: String(j.nome_fantasia ?? '').trim(),
      situacaoCadastral: String(j.descricao_situacao_cadastral ?? '').trim().toUpperCase(),
      regimeSugerido: regimeDe(mei, simples),
      mei,
      simples,
      porte: String(j.porte ?? '').trim(),
      naturezaJuridica: String(j.natureza_juridica ?? '').trim(),
      cnaePrincipal: j.cnae_fiscal
        ? juntar([j.cnae_fiscal, j.cnae_fiscal_descricao], ' — ')
        : '',
      endereco: juntar([
        juntar([j.descricao_tipo_de_logradouro, j.logradouro], ' '),
        j.numero ? `nº ${j.numero}` : '',
        j.complemento,
        j.bairro,
      ]),
      municipio: String(j.municipio ?? '').trim(),
      uf: String(j.uf ?? '').trim().toUpperCase(),
      cep: formatarCep(j.cep),
      email: String(j.email ?? '').trim().toLowerCase(),
      telefone: juntar([j.ddd_telefone_1, j.ddd_telefone_2], ' / '),
      fonte: 'BrasilAPI',
    };
  }
  return null;
}

/** ReceitaWS — https://receitaws.com.br/v1/cnpj/{cnpj} (sem CORS, só server). */
async function viaReceitaWs(c: string): Promise<CnpjInfo | null> {
  const r = await comTimeout(`https://receitaws.com.br/v1/cnpj/${c}`);
  if (!r.ok) return null;
  const j = await r.json();
  if (j.status === 'ERROR') {
    if (/n[aã]o\s+encontrad/i.test(String(j.message ?? ''))) {
      throw new HttpErro(404, 'CNPJ não encontrado na base da Receita Federal.');
    }
    return null;
  }
  const mei = j?.simei?.optante === true;
  const simples = j?.simples?.optante === true;
  const atividade = Array.isArray(j.atividade_principal) ? j.atividade_principal[0] : null;
  return {
    cnpj: formatarCnpj(c),
    razaoSocial: String(j.nome ?? '').trim(),
    nomeFantasia: String(j.fantasia ?? '').trim(),
    situacaoCadastral: String(j.situacao ?? '').trim().toUpperCase(),
    regimeSugerido: regimeDe(mei, simples),
    mei,
    simples,
    porte: String(j.porte ?? '').trim(),
    naturezaJuridica: String(j.natureza_juridica ?? '').trim(),
    cnaePrincipal: atividade ? juntar([atividade.code, atividade.text], ' — ') : '',
    endereco: juntar([j.logradouro, j.numero ? `nº ${j.numero}` : '', j.complemento, j.bairro]),
    municipio: String(j.municipio ?? '').trim(),
    uf: String(j.uf ?? '').trim().toUpperCase(),
    cep: formatarCep(j.cep),
    email: String(j.email ?? '').trim().toLowerCase(),
    telefone: String(j.telefone ?? '').trim(),
    fonte: 'ReceitaWS',
  };
}

/** cnpj.ws público — https://publica.cnpj.ws/cnpj/{cnpj} (3 req/min, só server). */
async function viaCnpjWs(c: string): Promise<CnpjInfo | null> {
  const r = await comTimeout(`https://publica.cnpj.ws/cnpj/${c}`);
  if (r.status === 404) throw new HttpErro(404, 'CNPJ não encontrado na base da Receita Federal.');
  if (!r.ok) return null;
  const j = await r.json();
  const est = j.estabelecimento ?? {};
  const mei = j?.simples?.mei === 'Sim';
  const simples = j?.simples?.simples === 'Sim';
  const ativ = est.atividade_principal ?? {};
  return {
    cnpj: formatarCnpj(c),
    razaoSocial: String(j.razao_social ?? '').trim(),
    nomeFantasia: String(est.nome_fantasia ?? '').trim(),
    situacaoCadastral: String(est.situacao_cadastral ?? '').trim().toUpperCase(),
    regimeSugerido: regimeDe(mei, simples),
    mei,
    simples,
    porte: String(j?.porte?.descricao ?? '').trim(),
    naturezaJuridica: String(j?.natureza_juridica?.descricao ?? '').trim(),
    cnaePrincipal: ativ.subclasse ? juntar([ativ.subclasse, ativ.descricao], ' — ') : '',
    endereco: juntar([
      juntar([est.tipo_logradouro, est.logradouro], ' '),
      est.numero ? `nº ${est.numero}` : '',
      est.complemento,
      est.bairro,
    ]),
    municipio: String(est?.cidade?.nome ?? '').trim(),
    uf: String(est?.estado?.sigla ?? '').trim().toUpperCase(),
    cep: formatarCep(est.cep),
    email: String(est.email ?? '').trim().toLowerCase(),
    telefone: est.ddd1 && est.telefone1 ? `(${est.ddd1}) ${est.telefone1}` : '',
    fonte: 'cnpj.ws',
  };
}

class HttpErro extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const corpo = await req.json().catch(() => ({}));
    const c = digitos(corpo?.cnpj);

    if (!cnpjValido(c)) {
      return json({ erro: { mensagem: 'CNPJ inválido. Confira os 14 dígitos.' } }, 400);
    }

    const fontes = [viaBrasilApi, viaReceitaWs, viaCnpjWs];
    const falhas: string[] = [];

    for (const consultar of fontes) {
      try {
        const info = await consultar(c);
        if (info) return json(info);
        falhas.push(`${consultar.name}: sem resposta útil`);
      } catch (e) {
        if (e instanceof HttpErro && e.status === 404) {
          return json({ erro: { mensagem: e.message } }, 404);
        }
        falhas.push(`${consultar.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    console.error('consultar-cnpj: todas as fontes falharam', falhas);
    return json(
      { erro: { mensagem: 'Serviços de consulta de CNPJ indisponíveis no momento. Tente de novo em instantes ou preencha os campos manualmente.' } },
      502,
    );
  } catch (e) {
    return json({ erro: { mensagem: e instanceof Error ? e.message : String(e) } }, 500);
  }
});

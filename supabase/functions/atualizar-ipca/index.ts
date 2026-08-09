/**
 * Atualiza public.ipca_indice com os meses novos do IPCA publicados pelo IBGE.
 *
 * Fonte: agregada 1737, variável 2266 — "IPCA - Número-índice (base: dezembro
 * de 1993 = 100)". Guardamos o número-índice e não a variação percentual: assim
 * corrigir um valor de um mês a outro é uma divisão, sem acumular arredondamento
 * ao longo de 140 fatores encadeados.
 *
 * Idempotente por construção (upsert em `mes`), então pode rodar todo dia. O
 * IBGE publica o índice de um mês por volta do dia 10 do mês seguinte; até lá a
 * chamada simplesmente não traz nada novo.
 *
 * Ao final chama refresh_benchmark_material(), porque a referência de preço da
 * auditoria é calculada com o índice do último mês — índice novo, referência
 * nova.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Um mês antes da compra mais antiga de pedidosforn — nada anterior é útil.
const INICIO_SERIE = '201410';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Busca da série a partir do mês seguinte ao último que já temos. Sem
    // registro nenhum (base recém-criada), busca a série inteira.
    const { data: ultimo, error: erroUltimo } = await supabase
      .from('ipca_indice')
      .select('mes')
      .order('mes', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroUltimo) throw new Error(`Falha ao ler ipca_indice: ${erroUltimo.message}`);

    const inicio = ultimo?.mes ? proximoPeriodo(ultimo.mes) : INICIO_SERIE;
    const fim = periodoDe(new Date());

    // O IBGE devolve 400 quando o período inicial é maior que o final, o que
    // acontece de forma legítima quando já estamos em dia.
    if (inicio > fim) {
      return json({ inseridos: 0, mensagem: 'Série já está no mês corrente.' });
    }

    const url =
      `https://servicodados.ibge.gov.br/api/v3/agregados/1737/periodos/${inicio}-${fim}` +
      `/variaveis/2266?localidades=N1[all]`;

    const resposta = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resposta.ok) {
      throw new Error(`API do IBGE respondeu ${resposta.status}`);
    }

    const linhas = paraLinhas(await resposta.json());
    if (linhas.length === 0) {
      return json({ inseridos: 0, mensagem: 'Nenhum mês novo publicado.' });
    }

    const { error: erroUpsert } = await supabase
      .from('ipca_indice')
      .upsert(linhas, { onConflict: 'mes' });

    if (erroUpsert) throw new Error(`Falha ao gravar ipca_indice: ${erroUpsert.message}`);

    // A referência de preço muda junto com o índice; sem o refresh a auditoria
    // continuaria corrigindo para o mês anterior sem avisar ninguém.
    const { error: erroRefresh } = await supabase.rpc('refresh_benchmark_material');
    if (erroRefresh) {
      return json({
        inseridos: linhas.length,
        ultimo_mes: linhas[linhas.length - 1].mes,
        aviso: `Índice gravado, mas o benchmark não recalculou: ${erroRefresh.message}`,
      });
    }

    return json({
      inseridos: linhas.length,
      ultimo_mes: linhas[linhas.length - 1].mes,
    });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/** 'AAAAMM' do mês da data informada. */
function periodoDe(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 'AAAA-MM-DD' (primeiro dia do mês) → 'AAAAMM' do mês seguinte. */
function proximoPeriodo(mesIso: string): string {
  const [ano, mes] = mesIso.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes, 1)); // mes é 1-based; Date é 0-based ⇒ mês seguinte
  return periodoDe(d);
}

/**
 * Extrai `[{ mes, numero_indice }]` do formato aninhado da API do IBGE.
 * Valores não numéricos ('...' para mês ainda não divulgado) são descartados —
 * gravá-los como zero corromperia todo fator de correção que os usasse.
 */
function paraLinhas(payload: unknown): Array<{ mes: string; numero_indice: number }> {
  const serie = (payload as any)?.[0]?.resultados?.[0]?.series?.[0]?.serie;
  if (!serie || typeof serie !== 'object') return [];

  return Object.entries(serie as Record<string, string>)
    .map(([periodo, valor]) => ({
      mes: `${periodo.slice(0, 4)}-${periodo.slice(4, 6)}-01`,
      numero_indice: Number(valor),
    }))
    .filter((l) => Number.isFinite(l.numero_indice) && l.numero_indice > 0)
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

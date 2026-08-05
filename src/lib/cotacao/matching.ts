/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Casamento determinístico entre o que foi extraído da proposta e os
 * catálogos de domínio `impostos` (150 códigos SAP) e `ddp` (100 códigos de
 * condição de pagamento). A IA não escolhe o código: ela devolve a
 * semântica (quais tributos aparecem, o prazo em dias), e esta camada faz o
 * casamento contra o catálogo real.
 *
 * Motivo de não deixar a IA escolher direto: injetar 250 linhas de catálogo
 * em todo prompt gasta token à toa e abre espaço para código alucinado; uma
 * regra determinística é auditável, testável e corrigível sem reescrever o
 * prompt. O comprador sempre pode trocar na lista suspensa — isto é só a
 * sugestão inicial.
 */

export interface CodigoDDP {
  ddp: string;
  descricao: string;
}

export interface CodigoImposto {
  incoterms: string;
  descricao: string;
}

// ============================================================================
// DDP — condição de pagamento
// ============================================================================

export interface SugestaoDDP {
  codigo: string | null;
  confianca: number;
  /** "a combinar" (ou nenhum prazo reconhecível) — fica pendente com alerta na UI. */
  pendente: boolean;
  detalhe: string;
}

const RE_A_COMBINAR = /A\s*COMBINAR|COMBINAR/;
const RE_PRAZO_DIAS = /(\d+)\s*(?:DIAS?|DD\s*L[IÍ]Q\.?|DDL)/;
const RE_DESCRICAO_DIAS_SIMPLES = /^Dentro de (\d+) dias s\/desconto$/i;

/** Mapa dias→código, construído a partir das descrições "Dentro de N dias
 * s/desconto" do catálogo — nunca do texto do código em si (código "20" no
 * catálogo real significa "30 dias Fora Quinzena", não 20 dias). Prefere
 * códigos puramente numéricos quando dois códigos descrevem o mesmo prazo. */
function construirMapaDiasParaCodigo(catalogo: CodigoDDP[]): Map<number, string> {
  const ordenado = [...catalogo].sort((a, b) => {
    const aNumerico = /^\d+$/.test(a.ddp) ? 0 : 1;
    const bNumerico = /^\d+$/.test(b.ddp) ? 0 : 1;
    return aNumerico - bNumerico;
  });
  const mapa = new Map<number, string>();
  for (const item of ordenado) {
    const m = item.descricao.match(RE_DESCRICAO_DIAS_SIMPLES);
    if (m && !mapa.has(Number(m[1]))) {
      mapa.set(Number(m[1]), item.ddp);
    }
  }
  return mapa;
}

/**
 * "30 DDLIQ", "A prazo - 30 dias" e "30 DIAS" convergem no mesmo código;
 * "a combinar" fica pendente com alerta em vez de arriscar um código errado.
 */
export function sugerirDDP(condicaoTexto: string | null | undefined, catalogo: CodigoDDP[]): SugestaoDDP {
  const texto = (condicaoTexto ?? '').trim();
  if (!texto) {
    return { codigo: null, confianca: 0, pendente: false, detalhe: 'Condição de pagamento não informada.' };
  }

  const normalizado = texto.toUpperCase();
  if (RE_A_COMBINAR.test(normalizado)) {
    return { codigo: null, confianca: 0, pendente: true, detalhe: `Condição "${texto}" — confirmar prazo com o fornecedor antes de fechar.` };
  }

  const match = normalizado.match(RE_PRAZO_DIAS);
  if (!match) {
    return { codigo: null, confianca: 0, pendente: true, detalhe: `Não foi possível identificar um prazo em dias em "${texto}".` };
  }

  const dias = Number(match[1]);
  const codigo = construirMapaDiasParaCodigo(catalogo).get(dias) ?? null;
  if (!codigo) {
    return { codigo: null, confianca: 0, pendente: true, detalhe: `Prazo de ${dias} dias identificado em "${texto}", mas nenhum código DDP cadastrado corresponde exatamente.` };
  }
  return { codigo, confianca: 0.85, pendente: false, detalhe: `"${texto}" → ${dias} dias corridos.` };
}

// ============================================================================
// Impostos — quais tributos incidem no item
// ============================================================================

export interface PerfilFiscal {
  icms: boolean;
  ipi: boolean;
  st: boolean;
  /** Os documentos reais não trazem uma coluna DIFAL explícita por item —
   * fica sempre false na sugestão automática; o comprador ajusta na lista
   * suspensa quando souber que a operação é interestadual para consumo. */
  difal: boolean;
  pisCofins: boolean;
}

export function perfilFiscalDoItem(item: {
  icms_percentual?: number | null;
  ipi_percentual?: number | null;
  st_percentual?: number | null;
  st_valor?: number | null;
  pis_percentual?: number | null;
  cofins_percentual?: number | null;
}): PerfilFiscal {
  return {
    icms: (item.icms_percentual ?? 0) > 0,
    ipi: (item.ipi_percentual ?? 0) > 0,
    st: (item.st_percentual ?? 0) > 0 || (item.st_valor ?? 0) > 0,
    difal: false,
    pisCofins: (item.pis_percentual ?? 0) > 0 || (item.cofins_percentual ?? 0) > 0,
  };
}

interface EntradaFiscalParseada extends PerfilFiscal {
  codigo: string;
  descricao: string;
}

const PREFIXO_ENTRADA_CONSUMO = /^Entr\.?\s*Consumo:\s*/i;
const TOKENS_RECONHECIDOS = new Set(['ICMS', 'IPI', 'ST', 'DIFAL']);

/**
 * Só interpreta composições simples de "Entrada para Consumo" (ICMS/IPI/ST/
 * DIFAL/PIS-COFINS). Variantes com Simples Nacional, FCI, alíquota "4%" ou
 * "s/recup" exigem julgamento fiscal humano e ficam fora da sugestão
 * automática — o comprador escolhe entre elas manualmente quando aplicável.
 */
function parsearCatalogoImpostos(catalogo: CodigoImposto[]): EntradaFiscalParseada[] {
  const parseadas: EntradaFiscalParseada[] = [];
  for (const item of catalogo) {
    const cabecalho = item.descricao.match(PREFIXO_ENTRADA_CONSUMO);
    if (!cabecalho) continue;
    const resto = item.descricao.slice(cabecalho[0].length);

    if (/simples nacional|fci|s\/\s*recup|\d%/i.test(resto)) continue;

    if (/^sem impostos/i.test(resto)) {
      parseadas.push({ codigo: item.incoterms, descricao: item.descricao, icms: false, ipi: false, st: false, difal: false, pisCofins: false });
      continue;
    }

    const partes = resto.split('+').map(p => p.trim().toUpperCase());
    const semPisCofins = partes.filter(p => p !== 'PIS/COFINS');
    if (semPisCofins.length === 0 || semPisCofins.some(p => !TOKENS_RECONHECIDOS.has(p))) continue;

    parseadas.push({
      codigo: item.incoterms,
      descricao: item.descricao,
      icms: partes.includes('ICMS'),
      ipi: partes.includes('IPI'),
      st: partes.includes('ST'),
      difal: partes.includes('DIFAL'),
      pisCofins: partes.includes('PIS/COFINS'),
    });
  }
  return parseadas;
}

export interface SugestaoImposto {
  codigo: string | null;
  confianca: number;
  detalhe: string;
}

/** Casa o perfil fiscal do item contra o catálogo de "Entrada para Consumo". */
export function sugerirImposto(perfil: PerfilFiscal, catalogo: CodigoImposto[]): SugestaoImposto {
  const candidatos = parsearCatalogoImpostos(catalogo);
  const mesmosTributos = (c: EntradaFiscalParseada) =>
    c.icms === perfil.icms && c.ipi === perfil.ipi && c.st === perfil.st && c.difal === perfil.difal;

  const exato = candidatos.find(c => mesmosTributos(c) && c.pisCofins === perfil.pisCofins);
  if (exato) return { codigo: exato.codigo, confianca: 0.9, detalhe: exato.descricao };

  // Sem exigir PIS/COFINS igual — nem toda combinação tem par espelhado com PIS/COFINS no catálogo.
  const semExigirPisCofins = candidatos.find(mesmosTributos);
  if (semExigirPisCofins) return { codigo: semExigirPisCofins.codigo, confianca: 0.7, detalhe: semExigirPisCofins.descricao };

  return { codigo: null, confianca: 0, detalhe: 'Nenhum código de imposto cadastrado corresponde exatamente à combinação de tributos identificada — selecione manualmente.' };
}

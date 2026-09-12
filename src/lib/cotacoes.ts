/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lógica pura do módulo de Análise e Mapa de Cotações: normalização dos
 * campos extraídos por IA (sempre string | null), validação de completude,
 * conferência de totais, ranking de sugestão de vínculo e o reparo de JSON
 * truncado usado tanto pela Edge Function quanto pela tela de teste.
 *
 * Nenhuma função aqui importa de `db/` — tudo é testável sem rede nem DOM
 * (o Vitest deste projeto roda `environment: 'node'` e só coleta
 * `src/**\/*.test.ts`, então esta é a única camada com cobertura de teste).
 */

import { formatarDataDDMMYY, gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';
import type {
  CampoFaltante,
  CotacaoProposta,
  CotacaoPropostaDraft,
  CotacaoPropostaItemDraft,
  CotacaoProcessoItem,
  ItemPropostaExtraido,
  PropostaExtraida,
  SugestaoVinculo,
  ValidacaoProposta,
} from '../types';

/** Chave do `sessionStorage` usada para levar a seleção de `ri` da Central de Compras até a tela de cotações. */
export const RASCUNHO_COTACAO_KEY = 'sisten_cotacao_processo_rascunho';

/**
 * Chave do `localStorage` por processo para as propostas extraídas por IA
 * ainda não salvas — se a aba fechar ou a página recarregar antes de
 * "Salvar proposta", a extração não se perde e não precisa chamar a API de
 * novo. `localStorage` (não `sessionStorage`) porque precisa sobreviver ao
 * fechamento da aba.
 */
export function chaveRascunhoPropostas(processoId: string): string {
  return `sisten_cotacao_propostas_rascunho_${processoId}`;
}

// =====================================================================
// Normalizadores
// =====================================================================

/** Placeholders que a IA foi instruída a não usar, mas pode devolver mesmo assim. */
const PLACEHOLDERS_VAZIOS = new Set(['n/a', 'na', '-', '--', 'null', 'nao informado', 'não informado', 'nao consta', 'não consta']);

export function temValor(v: string | null | undefined): boolean {
  if (v == null) return false;
  const t = String(v).trim();
  return t !== '' && !PLACEHOLDERS_VAZIOS.has(t.toLowerCase());
}

/** CNPJ só dígitos, ou `null` se não tiver exatamente 14 (evita string truncada/lixo parcial). */
export function normalizarCnpj(bruto: string | null | undefined): string | null {
  if (!temValor(bruto)) return null;
  const digitos = String(bruto).replace(/\D/g, '');
  return digitos.length === 14 ? digitos : null;
}

export function formatarCnpj(digitos: string | null | undefined): string {
  if (!digitos || digitos.length !== 14) return digitos ?? '';
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// Milhar agrupado sem parte decimal, ex.: "1.234" ou "12.345.678" — mesma
// heurística de src/lib/mb51.ts:78, reaproveitada em vez de reinventada.
const THOUSANDS_ONLY_RE = /^\d{1,3}(\.\d{3})+$/;

/**
 * Converte string monetária/numérica para `number`. `0` é preço legítimo e
 * retorna `0`, não `null` — só entrada vazia/placeholder retorna `null`.
 */
export function parseMoeda(bruto: string | null | undefined): number | null {
  if (!temValor(bruto)) return null;
  let s = String(bruto).trim().replace(/^R\$\s*/i, '');

  let negativo = false;
  if (s.startsWith('-')) { negativo = true; s = s.slice(1).trim(); }
  else if (s.endsWith('-')) { negativo = true; s = s.slice(0, -1).trim(); }
  if (!s) return null;

  let normalizado: string;
  if (s.includes(',')) {
    // "1.234,56" -> "1234.56"
    normalizado = s.replace(/\./g, '').replace(',', '.');
  } else if (THOUSANDS_ONLY_RE.test(s)) {
    // "1.234" (sem parte decimal) -> separador de milhar -> "1234"
    normalizado = s.replace(/\./g, '');
  } else {
    // "1234.56" ou "1234" -> já é ponto decimal
    normalizado = s;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function parseQuantidade(bruto: string | null | undefined): number | null {
  return parseMoeda(bruto);
}

/** Percentual em pontos percentuais (ex.: `"18"` ou `"18%"` -> 18). `"0,18"` vira 0.18 — ambíguo, ver validação. */
export function parsePercentual(bruto: string | null | undefined): number | null {
  if (!temValor(bruto)) return null;
  const semSinal = String(bruto).trim().replace(/%$/, '').trim();
  return parseMoeda(semSinal);
}

const BR_DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte para ISO `AAAA-MM-DD`. Datas por extenso ("16 de agosto de 2026") não são reconhecidas — retorna `null`. */
export function parseDataBR(bruto: string | null | undefined): string | null {
  if (!temValor(bruto)) return null;
  const s = String(bruto).trim();

  const isoPart = s.split('T')[0];
  if (ISO_DATE_RE.test(isoPart)) return isoPart;

  const m = s.match(BR_DATE_RE);
  if (m) {
    const dia = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    const ano = m[3];
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

/** `Validade_Proposta` é às vezes uma data, às vezes um prazo ("30 dias") — separa nas duas colunas do schema. */
export function parseValidade(bruto: string | null | undefined): { data: string | null; texto: string | null } {
  if (!temValor(bruto)) return { data: null, texto: null };
  const data = parseDataBR(bruto);
  return data ? { data, texto: null } : { data: null, texto: String(bruto).trim() };
}

/** Extrai um número de dias de um texto de prazo ("15 dias úteis" -> 15). `null` quando não há número reconhecível. */
export function parsePrazoDias(bruto: string | null | undefined): number | null {
  if (!temValor(bruto)) return null;
  const m = String(bruto).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** `"São Paulo/SP"`, `"SAO PAULO - SP"` -> `{cidade, uf}`. Sem UF reconhecível, uf fica `null`. */
export function parseCidadeUF(bruto: string | null | undefined): { cidade: string | null; uf: string | null } {
  if (!temValor(bruto)) return { cidade: null, uf: null };
  const s = String(bruto).trim();
  const m = s.match(/^(.+?)[\s/–-]+([A-Za-z]{2})$/);
  if (m) {
    return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
  }
  return { cidade: s, uf: null };
}

export function parseFreteModalidade(bruto: string | null | undefined): 'CIF' | 'FOB' | 'OUTRO' | null {
  if (!temValor(bruto)) return null;
  const s = String(bruto).trim().toUpperCase();
  if (s.includes('CIF')) return 'CIF';
  if (s.includes('FOB')) return 'FOB';
  return 'OUTRO';
}

/** NFD, remove diacríticos, maiúsculas, colapsa espaços — usada para casar com `descricao_norm` de `cotacao_descricao_map`. */
export function normalizarDescricao(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Qualificadores de tipo societário que aparecem no fim (às vezes no meio,
 * antes de "LTDA") da razão social e não ajudam a reconhecer o fornecedor
 * numa coluna estreita — só o nome de fantasia ajuda. Ordem importa: mais
 * específico primeiro, para não sobrar "SOCIEDADE" de uma combinação maior.
 */
const SUFIXOS_SOCIETARIOS = [
  'SOCIEDADE EMPRESARIA LIMITADA', 'SOCIEDADE UNIPESSOAL LIMITADA', 'SOCIEDADE UNIPESSOAL DE ADVOGADOS',
  'SOCIEDADE UNIPESSOAL', 'SOCIEDADE LIMITADA', 'SOCIEDADE ANONIMA', 'SOCIEDADE SIMPLES',
  'EMPRESA INDIVIDUAL DE RESPONSABILIDADE LIMITADA', 'EIRELI', 'LTDA\\.?', 'S/A', 'S\\.A\\.?', '\\bSA\\b',
  '\\bME\\b', '\\bEPP\\b', '\\bMEI\\b',
] as const;

const RE_SUFIXO_SOCIETARIO = new RegExp(`\\s*(${SUFIXOS_SOCIETARIOS.join('|')})\\s*$`, 'i');

/**
 * Nome curto de exibição para coluna estreita (mapa comparativo): tira os
 * qualificadores societários do fim da razão social, repetindo enquanto
 * houver mais de um (ex.: "... SOCIEDADE UNIPESSOAL LTDA" tem dois). Nunca
 * mexe no resto do nome — "COMERCIO", "IMPORTACAO" etc. costumam ser o que
 * diferencia dois fornecedores parecidos, então ficam. Devolve a razão
 * social original se a limpeza esvaziar tudo (nome só com sigla societária).
 */
export function nomeFornecedorCurto(razaoSocial: string | null | undefined): string {
  const bruto = (razaoSocial ?? '').trim();
  if (!bruto) return '';
  let atual = bruto;
  for (let i = 0; i < 4; i++) {
    const cortado = atual.replace(RE_SUFIXO_SOCIETARIO, '').replace(/[-,]\s*$/, '').trim();
    if (cortado === atual) break;
    atual = cortado;
  }
  return atual || bruto;
}

// =====================================================================
// Conversão do contrato da IA -> rascunho editável
// =====================================================================

let contadorChave = 0;
function proximaChave(prefixo: string): string {
  contadorChave += 1;
  return `${prefixo}_${Date.now()}_${contadorChave}`;
}

function itemParaDraft(item: ItemPropostaExtraido): CotacaoPropostaItemDraft {
  return {
    _key: proximaChave('item'),
    processo_item_id: null,
    fora_escopo: false,
    vinculo_origem: 'manual',
    vinculo_score: null,
    ri: null,
    material_code: null,

    item_numero: item.Item_Numero != null ? Number(item.Item_Numero) || null : null,
    codigo_produto: item.Codigo_Produto ?? null,
    descricao_produto: item.Descricao_Produto ?? '',
    marca_fabricante: item.Marca_Fabricante ?? null,
    unidade_medida: item.Unidade_Medida ?? null,
    ncm: item.NCM ?? null,
    cst: item.CST ?? null,
    cfop: item.CFOP ?? null,
    quantidade: parseQuantidade(item.Quantidade),
    preco_unitario: parseMoeda(item.Preco_Unitario),
    preco_total_item: parseMoeda(item.Preco_Total_Item),
    aliquota_icms_pct: parsePercentual(item.Aliquota_ICMS_Pct),
    aliquota_pis_pct: parsePercentual(item.Aliquota_PIS_Pct),
    aliquota_cofins_pct: parsePercentual(item.Aliquota_COFINS_Pct),
    aliquota_ipi_pct: parsePercentual(item.Aliquota_IPI_pct),

    desconsiderado: false,
    // O vínculo sugerido pela IA e suas divergências só viram estado do item
    // depois de resolvidos contra o escopo real do processo (vinculoCotacao.ts):
    // a IA devolve um RI em texto, que pode não existir neste processo.
    vinculo_divergencias: [],
    peso_unitario_kg: parseMoeda(item.Peso_Unitario_Kg),
    peso_origem: temValor(item.Peso_Unitario_Kg) ? 'ia' : null,
    frete_teorico: null,
    codigo_fiscal: null,
    preco_liquido_unitario: null,
    preco_liquido_total: null,
    custo_total_item: null,

    extraido_raw: item,
  };
}

/** Converte uma proposta extraída pela IA (tudo `string|null`) no rascunho editável persistido pela grade. */
export function normalizarProposta(bruta: PropostaExtraida, ctx: { arquivoOrigem?: string } = {}): CotacaoPropostaDraft {
  const validade = parseValidade(bruta.Validade_Proposta);
  const cidadeUfFornecedor = parseCidadeUF(bruta.Fornecedor_Cidade_UF);
  const cidadeUfCliente = parseCidadeUF(bruta.Cliente_Cidade_UF);

  return {
    _key: proximaChave('proposta'),
    _salvo: false,
    _extraido_em: new Date().toISOString(),

    arquivo_origem: bruta.Arquivo_Origem ?? ctx.arquivoOrigem ?? null,
    numero_proposta: bruta.Numero_Proposta ?? null,
    data_emissao: parseDataBR(bruta.Data_Emissao),
    validade_data: validade.data,
    validade_texto: validade.texto,

    fornecedor_razao_social: bruta.Fornecedor_Razao_Social ?? null,
    fornecedor_cnpj: normalizarCnpj(bruta.Fornecedor_CNPJ),
    fornecedor_inscricao_estadual: bruta.Fornecedor_Inscricao_Estadual ?? null,
    fornecedor_cidade: cidadeUfFornecedor.cidade,
    fornecedor_uf: cidadeUfFornecedor.uf,
    fornecedor_telefone: bruta.Fornecedor_Telefone ?? null,

    cod_vendor: null,
    contato_id: null,
    fornecedor_match: 'nao_encontrado',

    vendedor_nome: bruta.Vendedor_Nome ?? null,
    vendedor_email: bruta.Vendedor_Email ?? null,
    vendedor_telefone: bruta.Vendedor_Telefone ?? null,

    cliente_razao_social: bruta.Cliente_Razao_Social ?? null,
    cliente_cnpj: normalizarCnpj(bruta.Cliente_CNPJ),
    cliente_inscricao_estadual: bruta.Cliente_Inscricao_Estadual ?? null,
    cliente_cidade: cidadeUfCliente.cidade,
    cliente_uf: cidadeUfCliente.uf,

    condicao_pagamento: bruta.Condicao_Pagamento ?? null,
    forma_pagamento: bruta.Forma_Pagamento ?? null,
    prazo_entrega_texto: bruta.Prazo_Entrega ?? null,
    prazo_entrega_dias: parsePrazoDias(bruta.Prazo_Entrega),
    frete_modalidade: parseFreteModalidade(bruta.Frete_Modalidade),
    transportadora_indicada: bruta.Transportadora_Indicada ?? null,
    faturamento_minimo: parseMoeda(bruta.Faturamento_Minimo),
    // O frete em reais não vem da IA (a proposta raramente destaca) — o
    // comprador informa no mapa comparativo, onde ele muda a decisão.
    valor_frete: null,
    dados_bancarios_pix: bruta.Dados_Bancarios_PIX ?? null,
    valor_total_orcamento: parseMoeda(bruta.Valor_Total_Orcamento),
    observacoes_gerais: bruta.Observacoes_Gerais ?? null,

    campos_faltantes: [],
    revisado: false,
    extracao_id: null,
    extraido_raw: bruta,

    itens: (bruta.itens ?? []).map(itemParaDraft),
  };
}

/**
 * Converte uma CotacaoProposta salva no Supabase para CotacaoPropostaDraft,
 * permitindo recarregar uma cotacao extraida anteriormente sem novo custo de IA.
 */
export function propostaParaDraft(
  p: CotacaoProposta,
  opts: { novoProcessoId?: string } = {}
): CotacaoPropostaDraft {
  const mesmoProcesso = !opts.novoProcessoId || opts.novoProcessoId === p.processo_id;
  return {
    ...p,
    id: mesmoProcesso ? p.id : undefined,
    processo_id: opts.novoProcessoId ?? p.processo_id,
    _key: mesmoProcesso ? p.id : `proposta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    _salvo: mesmoProcesso,
    _extraido_em: p.created_at,
    itens: (p.itens ?? []).map(i => ({
      ...i,
      id: mesmoProcesso ? i.id : undefined,
      proposta_id: mesmoProcesso ? i.proposta_id : undefined,
      _key: mesmoProcesso ? i.id : `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      valor_unitario: i.valor_unitario ?? null,
      quantidade: i.quantidade ?? null,
      desconsiderado: i.desconsiderado ?? false,
      vinculo_divergencias: i.vinculo_divergencias ?? [],
      peso_unitario_kg: i.peso_unitario_kg ?? null,
      peso_origem: i.peso_origem ?? null,
      frete_teorico: i.frete_teorico ?? null,
      codigo_fiscal: i.codigo_fiscal ?? null,
      preco_liquido_unitario: i.preco_liquido_unitario ?? null,
      preco_liquido_total: i.preco_liquido_total ?? null,
      custo_total_item: i.custo_total_item ?? null,
      ipi_percentual: i.ipi_percentual ?? null,
      icms_percentual: i.icms_percentual ?? null,
    })),
  };
}

// =====================================================================
// Validação
// =====================================================================

/** Rótulos legíveis para os campos de bloqueio/aviso, usados nos chips da grade. */
const ROTULOS: Record<string, string> = {
  fornecedor_identificacao: 'Fornecedor (razão social ou CNPJ)',
  numero_proposta: 'Número da proposta',
  data_emissao: 'Data de emissão',
  validade: 'Validade da proposta',
  condicao_pagamento: 'Condição de pagamento',
  prazo_entrega: 'Prazo de entrega',
  frete_modalidade: 'Modalidade de frete',
  vendedor_email: 'E-mail do vendedor',
  descricao_produto: 'Descrição do produto',
  quantidade: 'Quantidade',
  preco_unitario: 'Preço unitário',
  vinculo: 'Vínculo com item de RM',
  unidade_medida: 'Unidade de medida',
  preco_total_item: 'Preço total do item',
  ncm: 'NCM',
  aliquota_icms_pct: 'Alíquota de ICMS',
};

function campo(campoId: string, nivel: 'bloqueio' | 'aviso'): CampoFaltante {
  return { campo: campoId, rotulo: ROTULOS[campoId] ?? campoId, nivel };
}

/**
 * Valida uma proposta segundo os níveis definidos no design do módulo:
 * bloqueio = mínimo para a linha ser útil no mapa comparativo futuro;
 * aviso = falta, mas não impede salvar.
 */
export function validarProposta(p: CotacaoPropostaDraft): ValidacaoProposta {
  const bloqueios: CampoFaltante[] = [];
  const avisos: CampoFaltante[] = [];

  if (!temValor(p.fornecedor_razao_social) && !p.fornecedor_cnpj) {
    bloqueios.push(campo('fornecedor_identificacao', 'bloqueio'));
  }
  if (!temValor(p.numero_proposta)) avisos.push(campo('numero_proposta', 'aviso'));
  if (!p.data_emissao) avisos.push(campo('data_emissao', 'aviso'));
  if (!p.validade_data && !temValor(p.validade_texto)) avisos.push(campo('validade', 'aviso'));
  if (!temValor(p.condicao_pagamento)) avisos.push(campo('condicao_pagamento', 'aviso'));
  if (!temValor(p.prazo_entrega_texto)) avisos.push(campo('prazo_entrega', 'aviso'));
  if (!p.frete_modalidade) avisos.push(campo('frete_modalidade', 'aviso'));
  if (!temValor(p.vendedor_email)) avisos.push(campo('vendedor_email', 'aviso'));

  let itensComBloqueio = 0;
  for (const item of p.itens) {
    // Item desconsiderado não vira linha do mapa nem do pedido: exigir preço,
    // quantidade ou vínculo dele seria travar o salvamento por causa de uma
    // linha que o comprador já decidiu ignorar.
    if (item.desconsiderado) continue;
    let itemBloqueado = false;
    if (!temValor(item.descricao_produto)) { bloqueios.push(campo('descricao_produto', 'bloqueio')); itemBloqueado = true; }
    if (item.quantidade == null) { bloqueios.push(campo('quantidade', 'bloqueio')); itemBloqueado = true; }
    if (item.preco_unitario == null) { bloqueios.push(campo('preco_unitario', 'bloqueio')); itemBloqueado = true; }
    if (!item.processo_item_id && !item.fora_escopo) { bloqueios.push(campo('vinculo', 'bloqueio')); itemBloqueado = true; }
    if (itemBloqueado) itensComBloqueio += 1;

    if (!temValor(item.unidade_medida)) avisos.push(campo('unidade_medida', 'aviso'));
    if (item.preco_total_item == null) avisos.push(campo('preco_total_item', 'aviso'));
    if (!temValor(item.ncm)) avisos.push(campo('ncm', 'aviso'));
    if (item.aliquota_icms_pct == null) avisos.push(campo('aliquota_icms_pct', 'aviso'));

    // "0,18" é ambíguo entre "0.18 pontos percentuais" (quase certamente um
    // erro de leitura de "18%") e um valor real muito baixo — sinalizado
    // como aviso porque não há como desambiguar a partir da string sozinha.
    for (const aliquota of [item.aliquota_icms_pct, item.aliquota_pis_pct, item.aliquota_cofins_pct, item.aliquota_ipi_pct]) {
      if (aliquota != null && aliquota > 0 && aliquota < 1) {
        avisos.push({ campo: 'aliquota_suspeita', rotulo: `Alíquota suspeita (${aliquota}) — confira se não deveria ser ${(aliquota * 100).toFixed(0)}`, nivel: 'aviso' });
        break;
      }
    }
  }

  const camposCabecalho = 25;
  const camposItem = 15;
  const totalCampos = camposCabecalho + p.itens.length * camposItem;
  const bloqueiosUnicos = new Set(bloqueios.map(b => b.campo)).size;
  const preenchidos = Math.max(0, totalCampos - bloqueios.length - avisos.filter(a => a.campo !== 'aliquota_suspeita').length);

  return {
    bloqueios,
    avisos,
    preenchidos,
    total: totalCampos,
    divergenciaTotalPct: conferirTotais(p)?.divergenciaPct ?? null,
  };
}

export function podeSalvar(v: ValidacaoProposta): boolean {
  return v.bloqueios.length === 0;
}

/**
 * Compara a soma de `preco_total_item` com `valor_total_orcamento`. Sinal
 * mais barato de que a IA perdeu ou duplicou uma linha — sempre aviso,
 * nunca bloqueio, porque desconto e frete quebram a soma legitimamente.
 */
export function conferirTotais(p: CotacaoPropostaDraft): { somaItens: number; informado: number | null; divergenciaPct: number | null } | null {
  const parcelas = p.itens.map(i => i.preco_total_item).filter((n): n is number => n != null);
  if (p.valor_total_orcamento == null || p.valor_total_orcamento === 0 || parcelas.length === 0) {
    return { somaItens: parcelas.reduce((a, b) => a + b, 0), informado: p.valor_total_orcamento, divergenciaPct: null };
  }
  const somaItens = parcelas.reduce((a, b) => a + b, 0);
  const divergenciaPct = Math.abs(somaItens - p.valor_total_orcamento) / Math.abs(p.valor_total_orcamento) * 100;
  return { somaItens, informado: p.valor_total_orcamento, divergenciaPct };
}

// =====================================================================
// Vínculo com itens de RM
// =====================================================================

/**
 * Auto-seleção deliberadamente conservadora: um vínculo errado pré-marcado é
 * pior que um vazio (o revisor confirma no piloto automático e o preço vai
 * para o item errado, silenciosamente). Só autosselect quando o melhor
 * candidato é claramente único, ou quando vem da memória confirmada
 * (`origem: 'aprendido'`, score >= 0.90).
 */
export function deveAutoSelecionar(melhor: SugestaoVinculo | undefined, segundo: SugestaoVinculo | undefined): boolean {
  if (!melhor) return false;
  if (melhor.origem === 'aprendido' && melhor.score >= 0.90) return true;
  if (melhor.score < 0.45) return false;
  if (segundo && melhor.score - segundo.score < 0.10) return false;
  return true;
}

/**
 * Aplica as sugestões retornadas por `sugerir_vinculos_cotacao` aos itens do
 * rascunho, respeitando `deveAutoSelecionar`.
 *
 * Só mexe em item ainda sem decisão: vínculo resolvido à mão, vindo da IA
 * que leu a proposta, marcado como fora do escopo ou desconsiderado já é
 * informação melhor que a semelhança de texto, e o trigrama não pode
 * desfazer nenhuma delas por cima.
 */
export function aplicarSugestoes(
  itens: CotacaoPropostaItemDraft[],
  sugestoesPorIdx: Map<number, SugestaoVinculo[]>
): CotacaoPropostaItemDraft[] {
  return itens.map((item, idx) => {
    if (item.processo_item_id || item.fora_escopo || item.desconsiderado) return item;
    const candidatos = sugestoesPorIdx.get(idx);
    if (!candidatos || candidatos.length === 0) return item;
    const [melhor, segundo] = candidatos;
    if (!deveAutoSelecionar(melhor, segundo)) return item;
    return {
      ...item,
      processo_item_id: melhor.processo_item_id,
      ri: melhor.ri,
      material_code: melhor.material_code,
      vinculo_origem: melhor.origem === 'aprendido' ? 'aprendido' : 'sugerido',
      vinculo_score: melhor.score,
    };
  });
}

/** Itens do escopo do processo cobertos por pelo menos uma linha da proposta, e os que ficaram sem oferta. */
export function coberturaEscopo(
  escopo: CotacaoProcessoItem[],
  itens: CotacaoPropostaItemDraft[]
): { cobertos: string[]; semOferta: CotacaoProcessoItem[] } {
  const cobertosSet = new Set(itens.filter(i => i.processo_item_id && !i.desconsiderado).map(i => i.processo_item_id as string));
  const cobertos = escopo.filter(e => cobertosSet.has(e.id)).map(e => e.ri);
  const semOferta = escopo.filter(e => !cobertosSet.has(e.id));
  return { cobertos, semOferta };
}

// =====================================================================
// Reparo de JSON truncado
// =====================================================================

/**
 * Fecha um JSON cortado por `max_tokens` no fim do último objeto completo.
 * Com a estrutura aninhada (`propostas` -> `itens`) o corte pode cair em
 * qualquer nível, então o fechamento é contado com uma pilha de `{`/`[`,
 * respeitando strings e escapes — uma chave dentro de uma descrição de
 * produto não pode confundir a contagem.
 *
 * Espelho testado do que a Edge Function `extrair-cotacao` faz (duplicado
 * lá porque o Deno não resolve os imports transitivos de `src/lib`).
 */
export function repararJsonTruncado(bruto: string): unknown {
  const ultimoFechado = bruto.lastIndexOf('}');
  if (ultimoFechado === -1) throw new Error('Resposta da IA veio cortada antes do primeiro objeto completo.');
  const prefixo = bruto.slice(0, ultimoFechado + 1);

  const pilha: string[] = [];
  let emString = false;
  let escapado = false;
  for (const c of prefixo) {
    if (escapado) { escapado = false; continue; }
    if (c === '\\') { escapado = true; continue; }
    if (c === '"') { emString = !emString; continue; }
    if (emString) continue;
    if (c === '{' || c === '[') pilha.push(c);
    else if (c === '}' || c === ']') pilha.pop();
  }

  const fecho = pilha.reverse().map(c => (c === '{' ? '}' : ']')).join('');
  return JSON.parse(prefixo + fecho);
}

// =====================================================================
// Codigo de Processo de Cotacao (Padrao COT-DDMMYY-INDICE)
// =====================================================================

/**
 * Monta o codigo de cotacao no padrao obrigatorio do SISTEN: `COT-DDMMYY-INDICE`.
 * Ex.: `COT-040926-01`, `COT-040926-02`.
 */
export function gerarCodigoCotacao(
  dataISO?: string | null,
  indice: number | string = 1,
): string {
  return gerarCodigoFormulario('COT', dataISO, indice);
}

/**
 * Calcula o proximo indice sequencial para cotacoes no mes da data informada.
 * Ignora codigos legados fora do padrao (ex.: `COT-2026-5WD82`) ou de outros meses.
 */
export function proximoIndiceCotacao(
  codigosExistentes: (string | null | undefined)[],
  dataISO?: string | null,
): number {
  const ddmmyy = formatarDataDDMMYY(dataISO);
  const mmyy = ddmmyy.slice(2); // ex: '0926'
  const regexMes = new RegExp(`^COT-\\d{2}${mmyy}-(\\d+)$`, 'i');

  const codigosMes = (codigosExistentes || []).filter(c => {
    if (!c) return false;
    return regexMes.test(String(c).trim());
  });

  return proximoIndiceCodigo('COT', codigosMes);
}


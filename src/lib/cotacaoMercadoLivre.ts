/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cotações — compra pelo Mercado Livre.
 *
 * O ML não manda proposta em PDF: o comprador tira um print do anúncio. Esse
 * print não passa pela IA — ele vira o "arquivo original" da proposta e o
 * comprador digita o que importa para o mapa (loja, preço por item, frete,
 * prazo). Aqui ficam as regras puras: o título do processo pelas descrições,
 * a marca "Mercado Livre" no título e a montagem do rascunho de proposta no
 * mesmo formato das propostas extraídas, para o card, o salvamento e o mapa
 * tratarem igual.
 */

import { normalizarProposta } from './cotacoes';
import type { CotacaoProcessoItem, CotacaoPropostaDraft, PropostaExtraida } from '../types';

export const ROTULO_MERCADO_LIVRE = 'Mercado Livre';
/** Prefixo da razão social das propostas do ML: cada loja vira uma coluna própria no mapa. */
export const FORNECEDOR_MERCADO_LIVRE = 'MERCADO LIVRE';

/** Tamanho a partir do qual o complemento do título é cortado com "...". */
export const MAX_COMPLEMENTO_TITULO = 40;

function capitalizar(palavra: string): string {
  return palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1).toLocaleLowerCase('pt-BR');
}

/**
 * Complemento do título com a primeira palavra da descrição de cada item, sem
 * repetir e na ordem do escopo: "Sinaleiro", "Sinaleiro, Disjuntor, Cabo".
 * Passando de `max` caracteres, para na última palavra que coube e põe "...".
 */
export function complementoPelasDescricoes(textos: (string | null | undefined)[], max = MAX_COMPLEMENTO_TITULO): string {
  const palavras: string[] = [];
  const vistas = new Set<string>();
  for (const texto of textos) {
    const primeira = (texto ?? '').trim().split(/[\s,;/]+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, '');
    if (!primeira) continue;
    const chave = primeira.toLocaleLowerCase('pt-BR');
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    palavras.push(capitalizar(primeira));
  }

  let resultado = '';
  for (const p of palavras) {
    const proximo = resultado ? `${resultado}, ${p}` : p;
    if (proximo.length > max) return resultado ? `${resultado}...` : `${p.slice(0, Math.max(1, max - 3))}...`;
    resultado = proximo;
  }
  return resultado;
}

const temMercadoLivre = (texto: string) => /mercado\s*livre/i.test(texto);

/** Acrescenta (ou tira) "Mercado Livre" no complemento do título, sem duplicar. */
export function complementoComMercadoLivre(complemento: string, mercadoLivre: boolean): string {
  const base = complemento.trim();
  if (mercadoLivre) {
    if (temMercadoLivre(base)) return base;
    return base ? `${base} — ${ROTULO_MERCADO_LIVRE}` : ROTULO_MERCADO_LIVRE;
  }
  return base.replace(/\s*[—-]?\s*mercado\s*livre\s*/i, ' ').replace(/\s+/g, ' ').trim();
}

export interface ItemPropostaMl {
  processoItemId: string;
  /** Título do anúncio (opcional); sem ele, vale a descrição do item da RM. */
  descricaoAnuncio?: string | null;
  quantidade: number | null;
  precoUnitario: number | null;
}

export interface DadosPropostaMl {
  /** Nome da loja no ML ("MANUKS FERRAMENTAS"). */
  loja: string;
  linkAnuncio?: string | null;
  /** Frete em reais (0 = frete grátis). */
  frete?: number | null;
  /** Texto do prazo ("Chegará quinta-feira", "3 dias úteis"). */
  prazoEntrega?: string | null;
  observacao?: string | null;
  arquivoOrigem: string | null;
  itens: ItemPropostaMl[];
}

/** O que falta para montar a proposta — lista vazia quando dá para lançar. */
export function validarPropostaMl(d: DadosPropostaMl): string[] {
  const erros: string[] = [];
  if (!d.loja.trim()) erros.push('Informe a loja do Mercado Livre.');
  if (d.itens.length === 0) erros.push('Marque pelo menos um item cotado no anúncio.');
  d.itens.forEach((it, i) => {
    if (!(it.precoUnitario != null && it.precoUnitario > 0)) erros.push(`Item ${i + 1}: informe o preço unitário.`);
    if (!(it.quantidade != null && it.quantidade > 0)) erros.push(`Item ${i + 1}: informe a quantidade.`);
  });
  if (d.frete != null && !(d.frete >= 0)) erros.push('Frete inválido.');
  return erros;
}

const moedaTexto = (v: number) => v.toFixed(2).replace('.', ',');

function hojeBR(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(agora.getDate())}/${p(agora.getMonth() + 1)}/${agora.getFullYear()}`;
}

/**
 * Monta o rascunho da proposta do ML no mesmo formato das extraídas pela IA
 * (passa por `normalizarProposta`), já vinculado aos itens da RM escolhidos —
 * sem IA, sem Markdown. O print entra como arquivo original e sobe ao salvar.
 */
export function montarPropostaMercadoLivre(
  d: DadosPropostaMl,
  escopo: Pick<CotacaoProcessoItem, 'id' | 'ri' | 'material_code' | 'texto_breve' | 'unidade_medida'>[],
  agora = new Date(),
): CotacaoPropostaDraft {
  const porId = new Map(escopo.map(e => [e.id, e]));
  const loja = d.loja.trim().toUpperCase();
  const obs = [
    'Proposta lançada à mão a partir do print do Mercado Livre.',
    d.linkAnuncio?.trim() ? `Anúncio: ${d.linkAnuncio.trim()}` : null,
    d.observacao?.trim() || null,
  ].filter(Boolean).join('\n');

  const bruta: PropostaExtraida = {
    Arquivo_Origem: d.arquivoOrigem,
    Numero_Proposta: null,
    Data_Emissao: hojeBR(agora),
    Validade_Proposta: null,
    Fornecedor_Razao_Social: `${FORNECEDOR_MERCADO_LIVRE} — ${loja}`,
    Fornecedor_CNPJ: null,
    Fornecedor_Inscricao_Estadual: null,
    Fornecedor_Cidade_UF: null,
    Fornecedor_Telefone: null,
    Vendedor_Nome: loja,
    Vendedor_Email: null,
    Vendedor_Telefone: null,
    Cliente_Razao_Social: null,
    Cliente_CNPJ: null,
    Cliente_Inscricao_Estadual: null,
    Cliente_Cidade_UF: null,
    Condicao_Pagamento: 'À vista',
    Forma_Pagamento: 'Cartão (Mercado Livre)',
    Prazo_Entrega: d.prazoEntrega?.trim() || null,
    // A loja entrega no endereço: o frete do anúncio já é o frete real.
    Frete_Modalidade: 'CIF',
    Transportadora_Indicada: null,
    Faturamento_Minimo: null,
    Dados_Bancarios_PIX: null,
    Valor_Total_Orcamento: null,
    Valor_Frete_Destacado: d.frete != null ? moedaTexto(d.frete) : null,
    Valor_Desconto: null,
    Observacoes_Gerais: obs,
    itens: d.itens.map((it, i) => {
      const e = porId.get(it.processoItemId);
      const total = it.precoUnitario != null && it.quantidade != null ? it.precoUnitario * it.quantidade : null;
      return {
        Item_Numero: String(i + 1),
        Codigo_Produto: null,
        Descricao_Produto: it.descricaoAnuncio?.trim() || e?.texto_breve || '',
        Marca_Fabricante: null,
        Unidade_Medida: e?.unidade_medida ?? null,
        NCM: null,
        CST: null,
        CFOP: null,
        Quantidade: it.quantidade != null ? String(it.quantidade).replace('.', ',') : null,
        Preco_Unitario: it.precoUnitario != null ? moedaTexto(it.precoUnitario) : null,
        Preco_Total_Item: total != null ? moedaTexto(total) : null,
        Aliquota_ICMS_Pct: null,
        Aliquota_PIS_Pct: null,
        Aliquota_COFINS_Pct: null,
        Aliquota_IPI_pct: null,
        Peso_Unitario_Kg: null,
        Vinculo_RI: e?.ri ?? null,
        Vinculo_Divergencias: null,
      };
    }),
  };

  const draft = normalizarProposta(bruta, { arquivoOrigem: d.arquivoOrigem ?? undefined });
  draft.itens = draft.itens.map((item, i) => {
    const e = porId.get(d.itens[i].processoItemId);
    return e ? { ...item, processo_item_id: e.id, ri: e.ri, material_code: e.material_code, vinculo_origem: 'manual' } : item;
  });
  return draft;
}


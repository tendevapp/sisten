/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Utilitario para formatacao e geracao de e-mail de cobranca de PO para fornecedores
 * na Central de Compras (filtro Sem MIGO).
 * Modulo puro para facilitar testes unitarios sem dependencia de DOM.
 */

import { formatDateBR } from './format';
import type { ContatoFornecedor } from '../types';

export interface LinhaItemCobrancaPo {
  material: string;
  descricao: string;
  quantidade?: number | null;
  unidade?: string | null;
  previsao?: string | null;
  rm?: string | null;
}

export interface ParametrosCorpoCobrancaPo {
  fornecedorNome?: string;
  docCompra: string;
  dataPedido?: string;
  previsaoGeral?: string;
  itens: LinhaItemCobrancaPo[];
  solicitanteNome?: string;
}

/**
 * Normaliza e resolve os e-mails de contato do fornecedor a partir da base local.
 * Prioriza busca por codigo do fornecedor (com e sem zeros a esquerda) e depois por nome.
 * Reune e-mail geral e do representante, retornando lista separada por ponto e virgula.
 * Caso nao encontre nenhum e-mail valido, retorna string vazia para abertura em branco.
 */
export function obterEmailsFornecedor(
  fornecedorCode?: string | null,
  fornecedorNome?: string | null,
  contatosLocais: ContatoFornecedor[] = [],
): string {
  const codeRaw = (fornecedorCode || '').trim();
  const codeSemZeros = codeRaw.replace(/^0+/, '');
  const codeDezDigitos = codeRaw ? codeRaw.padStart(10, '0') : '';
  const nomeLimpo = (fornecedorNome || '').trim().toLowerCase();

  const encontrados: ContatoFornecedor[] = [];

  for (const c of contatosLocais) {
    const cCode = (c.cod_vendor || '').trim();
    const cCodeSemZeros = cCode.replace(/^0+/, '');
    const cCodeDez = cCode ? cCode.padStart(10, '0') : '';
    const cNome = (c.fornecedor || '').trim().toLowerCase();
    const cFantasia = (c.nome_fantasia || '').trim().toLowerCase();

    const matchCode = codeRaw && (cCode === codeRaw || cCodeSemZeros === codeSemZeros || cCodeDez === codeDezDigitos);
    const matchNome = nomeLimpo && (cNome === nomeLimpo || cFantasia === nomeLimpo);

    if (matchCode || matchNome) {
      encontrados.push(c);
    }
  }

  const emailsSet = new Set<string>();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const item of encontrados) {
    const candidatos = [item.email, item.representante_email];
    for (const cand of candidatos) {
      if (!cand) continue;
      // Suporta caso o campo tenha mais de um e-mail separado por virgula ou ponto e virgula
      const partes = cand.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean);
      for (const p of partes) {
        if (emailRegex.test(p)) {
          emailsSet.add(p.toLowerCase());
        }
      }
    }
  }

  return Array.from(emailsSet).join('; ');
}

/**
 * Monta o assunto padrao do e-mail de cobranca conforme especificacao:
 * Atualizacao do PO-[numero do PO]
 */
export function montarAssuntoCobrancaPo(docCompra: string): string {
  const poLimpo = (docCompra || '').trim();
  return `Atualização do PO-${poLimpo}`;
}

/**
 * Monta o corpo cordial do e-mail de cobranca com os dados do PO e itens.
 */
export function montarCorpoCobrancaPo(params: ParametrosCorpoCobrancaPo): string {
  const {
    fornecedorNome,
    docCompra,
    dataPedido,
    previsaoGeral,
    itens,
    solicitanteNome,
  } = params;

  const nomeDestinatario = (fornecedorNome || '').trim() || 'Fornecedor';
  const dataPedFmt = dataPedido ? formatDateBR(dataPedido) : '—';
  const prevGeralFmt = previsaoGeral ? formatDateBR(previsaoGeral) : 'A confirmar';

  const linhasItens = itens.map((it, idx) => {
    const numItem = idx + 1;
    const desc = it.descricao?.trim() || 'Item sem descrição';
    const mat = it.material?.trim() ? `[${it.material.trim()}] ` : '';
    const qtd = it.quantidade != null ? `${it.quantidade} ${it.unidade || 'UN'}` : '—';
    const prev = it.previsao ? formatDateBR(it.previsao) : 'A confirmar';
    const rmInfo = it.rm ? ` (RM: ${it.rm})` : '';

    return `  ${numItem}. ${mat}${desc}${rmInfo}\n     Quantidade: ${qtd} | Previsão de Entrega: ${prev}`;
  });

  const blocoItens = linhasItens.length > 0
    ? linhasItens.join('\n\n')
    : '  • Informações dos itens conforme pedido registrado no sistema.';

  return `Prezada equipe da ${nomeDestinatario},

Entramos em contato para solicitar uma atualização sobre o status de atendimento e entrega do pedido de compra abaixo:

• Pedido de Compra (PO): ${docCompra}
• Data do Pedido: ${dataPedFmt}
• Previsão de Entrega: ${prevGeralFmt}

Itens do Pedido:
${blocoItens}

Poderiam, por gentileza, nos confirmar a previsão atualizada de entrega e informar se já temos número de Nota Fiscal (NF) emitida ou previsão de faturamento e coleta?

Caso haja qualquer pendência ou necessidade de alinhamento, permanecemos à disposição.

Agradecemos desde já pela atenção e parceria de sempre.`;
}

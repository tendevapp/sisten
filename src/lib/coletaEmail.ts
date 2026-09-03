/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Monta a "Lista de Coleta" enviada à logística a partir dos itens marcados na
 * aba Sem MIGO da Central de Compras: o material já está pronto no fornecedor e
 * alguém precisa ir buscar. O destinatário lê o texto no Outlook e sai a campo
 * com ele — por isso o agrupamento é por FORNECEDOR (uma parada de coleta por
 * bloco), não por PO.
 *
 * Módulo puro: a montagem do texto é o que precisa de teste e não deve depender
 * de React nem do Supabase. Mesma divisão de `expedicaoEmail.ts`.
 */

import { formatBRL, formatDateBR } from './format';

/** Chave do gatilho em `config_envio_emails` (Admin › E-mails). */
export const CHAVE_CONFIG_COLETA = 'coleta_jacobina';
export const ASSUNTO_COLETA_PADRAO = 'Coleta Jacobina';
export const DESTINATARIO_COLETA_PADRAO = 'andre.araujo@ten.ind.br';

export interface LinhaColeta {
  /** Data da coleta = previsão de entrega efetiva do item (ISO), quando houver. */
  dataColeta: string | null;
  fornecedor: string;
  rm: string;
  po: string;
  codigoItem: string;
  material: string;
  quantidade?: number | null;
  unidade?: string | null;
  valor?: number | null;
}

/**
 * "Coleta Jacobina — TRANSPORTADORA X (3 itens)". A transportadora entra no
 * assunto porque a lista costuma ser filtrada por ela: quem recebe já sabe, na
 * caixa de entrada, de quem é a viagem.
 */
export function montarAssuntoColeta(params: {
  assuntoBase?: string | null;
  transportadora?: string | null;
  quantidadeItens: number;
}): string {
  const base = (params.assuntoBase || ASSUNTO_COLETA_PADRAO).trim() || ASSUNTO_COLETA_PADRAO;
  const transp = (params.transportadora || '').trim();
  const qtd = params.quantidadeItens;
  const sufixo = `${qtd} ${qtd === 1 ? 'item' : 'itens'}`;
  return transp ? `${base} — ${transp} (${sufixo})` : `${base} (${sufixo})`;
}

/** "10 UN" · "10" quando não há unidade · "—" quando não há quantidade. */
function quantidadeTexto(quantidade?: number | null, unidade?: string | null): string {
  if (quantidade === null || quantidade === undefined || Number.isNaN(quantidade)) return '—';
  const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(quantidade);
  const un = (unidade || '').trim();
  return un ? `${numero} ${un}` : numero;
}

function textoOuTraco(valor?: string | null): string {
  const v = (valor || '').trim();
  return v || '—';
}

/**
 * Uma linha por item, com os campos na ordem em que a logística lê: quando
 * buscar, de quem, o que é (RM/PO/código/material) e quanto.
 */
function linhaItem(linha: LinhaColeta): string {
  const campos = [
    `Data da coleta: ${linha.dataColeta ? formatDateBR(linha.dataColeta) : 'a definir'}`,
    `RM: ${textoOuTraco(linha.rm)}`,
    `PO: ${textoOuTraco(linha.po)}`,
    `Código: ${textoOuTraco(linha.codigoItem)}`,
    `Material: ${textoOuTraco(linha.material)}`,
    `Qtd: ${quantidadeTexto(linha.quantidade, linha.unidade)}`,
    `Valor: ${linha.valor === null || linha.valor === undefined ? '—' : formatBRL(linha.valor)}`,
  ];
  return `- ${campos.join(' | ')}`;
}

/**
 * Corpo em texto puro (o `mailto:` não carrega HTML). Blocos por fornecedor,
 * ordenados por nome; dentro do bloco, os itens seguem a data de coleta — o que
 * vence antes aparece antes.
 */
export function montarCorpoColeta(params: {
  linhas: LinhaColeta[];
  transportadora?: string | null;
  solicitante?: string | null;
}): string {
  const { linhas } = params;
  const partes: string[] = [];

  partes.push('Segue a lista de coleta para busca do material junto aos fornecedores.');
  partes.push('');

  const transp = (params.transportadora || '').trim();
  if (transp) partes.push(`Transportadora: ${transp}`);
  partes.push(`Itens: ${linhas.length}`);

  const total = linhas.reduce((acc, l) => acc + (l.valor || 0), 0);
  if (total > 0) partes.push(`Valor total: ${formatBRL(total)}`);
  partes.push('');

  const porFornecedor = new Map<string, LinhaColeta[]>();
  for (const linha of linhas) {
    const chave = textoOuTraco(linha.fornecedor);
    const grupo = porFornecedor.get(chave);
    if (grupo) grupo.push(linha);
    else porFornecedor.set(chave, [linha]);
  }

  const fornecedores = Array.from(porFornecedor.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  for (const fornecedor of fornecedores) {
    const itens = [...(porFornecedor.get(fornecedor) || [])].sort((a, b) => {
      if (a.dataColeta && b.dataColeta) return a.dataColeta < b.dataColeta ? -1 : 1;
      if (a.dataColeta) return -1;
      if (b.dataColeta) return 1;
      return a.po.localeCompare(b.po);
    });
    partes.push(`FORNECEDOR: ${fornecedor}`);
    for (const item of itens) partes.push(linhaItem(item));
    partes.push('');
  }

  const solicitante = (params.solicitante || '').trim();
  if (solicitante) partes.push(`Solicitado por: ${solicitante}`);

  return partes.join('\n').trimEnd();
}

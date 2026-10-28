/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Central de Compras — I/O de `sup_ml_itens` (itens destinados à compra pelo
 * Mercado Livre). Supabase direto, mesmo padrão de `diligenciamentoApi.ts`:
 * tabela nova fora de `database.types.ts`, daí o `as any` no `.from()`.
 * As regras estão em `compraMercadoLivre.ts`.
 */

import { supabase } from '../db/supabaseClient';
import type { ItemMercadoLivre } from './compraMercadoLivre';
import { comprimirImagemUpload } from './imageCompression';
import type { DetalheCompraMl } from './detalheCompraMl';

interface Usuario { id: string; nome: string }

export async function listarItensMercadoLivre(): Promise<ItemMercadoLivre[]> {
  const { data, error } = await (supabase as any).from('sup_ml_itens').select('*');
  if (error) throw new Error(error.message);
  return (data || []) as ItemMercadoLivre[];
}

export interface DadosItemMl {
  ri: string;
  rm: string | null;
  item_reqc: string | null;
  material_code: string | null;
  texto_breve: string | null;
  qtd: number | null;
  unidade: string | null;
}

/**
 * Destina o item ao ML (ou troca o link). Upsert por `ri`; o corpo não leva
 * `numero_compra`, então trocar o link de um item já comprado não apaga a compra.
 */
export async function salvarLinkMercadoLivre(
  item: DadosItemMl,
  link: string,
  usuario: Usuario,
  jaExiste: boolean,
  print?: File | null,
): Promise<void> {
  // undefined preserva o anexo atual; null remove o vínculo na Central.
  let comprovante: ItemMercadoLivre['comprovante'] | undefined = print === null ? null : undefined;
  if (print) {
    if (!print.type.startsWith('image/')) throw new Error('Envie uma imagem como comprovante.');
    if (print.size > 10 * 1024 * 1024) throw new Error('O print deve ter até 10 MB.');
    const blob = await comprimirImagemUpload(print, { maxDimensao: 2400, qualidade: 0.9 });
    const nome = blob === print ? print.name : print.name.replace(/\.[^.]+$/, '') + '.jpg';
    const path = `mercado-livre/${encodeURIComponent(item.ri)}/${crypto.randomUUID()}-${nome.replace(/[^\w.-]/g, '_').slice(-80)}`;
    const { error } = await supabase.storage.from('cotacoes-arquivos').upload(path, blob, { contentType: blob.type || print.type });
    if (error) throw new Error(`Falha ao enviar o print: ${error.message}`);
    comprovante = { nome, path, mime_type: blob.type || print.type, tamanho_bytes: blob.size };
  }
  const agora = new Date().toISOString();
  const autoria = jaExiste
    ? {}
    : { criado_por_id: usuario.id, criado_por_nome: usuario.nome };
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .upsert({
      ...item,
      link,
      ...(comprovante !== undefined ? { comprovante } : {}),
      ...autoria,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: agora,
    }, { onConflict: 'ri' });
  if (error) {
    if (print && comprovante) await supabase.storage.from('cotacoes-arquivos').remove([comprovante.path]);
    throw new Error(error.message);
  }
}

/** Tira o item do ML (volta a ser só um item da Central). */
export async function removerItemMercadoLivre(ri: string): Promise<void> {
  const { error } = await (supabase as any).from('sup_ml_itens').delete().eq('ri', ri);
  if (error) throw new Error(error.message);
}

/**
 * Grava o número da compra do ML em vários itens de uma vez (o carrinho
 * fechado). `numero` null desfaz o vínculo.
 */
export async function registrarCompraMercadoLivre(
  ris: string[],
  numero: string | null,
  usuario: Usuario,
): Promise<void> {
  if (ris.length === 0) return;
  const agora = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .update({
      numero_compra: numero,
      compra_registrada_em: numero ? agora : null,
      compra_registrada_por_nome: numero ? usuario.nome : null,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: agora,
    })
    .in('ri', ris);
  if (error) throw new Error(error.message);
}

/**
 * Dados da compra colados do "Detalhe da compra" do ML e o boleto, para o
 * Financeiro (fin_ml_compras). Vai pela RPC porque o comprador não tem a
 * permissão de lançar baixa; campos do boleto só seguem quando preenchidos,
 * para não apagar o que o Financeiro já gravou.
 */
export interface DadosCompraMlFinanceiro {
  detalhe: DetalheCompraMl | null;
  detalheTexto: string | null;
  valorBoleto: number | null;
  vencimento: string | null;
  linhaDigitavel: string | null;
}

export async function registrarDetalheCompraMl(numero: string, dados: DadosCompraMlFinanceiro, usuario: Usuario): Promise<void> {
  const d = dados.detalhe;
  const p: Record<string, unknown> = {};
  if (d) {
    Object.assign(p, {
      data_compra: d.dataCompra,
      qtd_produtos: d.qtdProdutos,
      valor_produtos: d.valorProdutos,
      valor_frete: d.valorFrete,
      valor_total: d.valorTotal,
      forma_pagamento: d.formaPagamento,
      numero_pagamento: d.numeroPagamento,
      status_pagamento_ml: d.statusPagamento,
      endereco_entrega: d.endereco,
      pacotes: d.pacotes.length ? d.pacotes : null,
    });
  }
  if (dados.detalheTexto) p.detalhe_texto = dados.detalheTexto;
  if (dados.valorBoleto != null) p.valor_boleto = dados.valorBoleto;
  if (dados.vencimento) p.vencimento = dados.vencimento;
  if (dados.linhaDigitavel) p.linha_digitavel = dados.linhaDigitavel;
  if (Object.keys(p).length === 0) return;
  const { error } = await (supabase as any).rpc('sup_ml_registrar_detalhe_compra', {
    p_numero: numero,
    p_dados: p,
    p_por_nome: usuario.nome,
  });
  if (error) throw new Error(error.message);
}

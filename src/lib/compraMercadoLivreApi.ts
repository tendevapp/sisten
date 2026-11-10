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
import type { DadosCompraMl, ItemMercadoLivre, NotaFiscalMl } from './compraMercadoLivre';
import { comprimirImagemUpload } from './imageCompression';
import type { DetalheCompraMl } from './detalheCompraMl';
import type { NovaOcorrenciaMl, OcorrenciaMl } from './ocorrenciasMl';

interface Usuario { id: string; nome: string }

export async function listarItensMercadoLivre(): Promise<ItemMercadoLivre[]> {
  const { data, error } = await (supabase as any).from('sup_ml_itens').select('*');
  if (error) throw new Error(error.message);
  return (data || []) as ItemMercadoLivre[];
}

/**
 * Data e total de cada compra (fin_ml_compras, preenchidos quando o comprador
 * cola o "Detalhe da compra"). Leitura liberada a todo usuário autenticado.
 */
export async function listarDadosComprasMl(): Promise<DadosCompraMl[]> {
  const { data, error } = await (supabase as any).from('fin_ml_compras').select('numero_compra, data_compra, valor_total');
  if (error) throw new Error(error.message);
  return (data || []) as DadosCompraMl[];
}

/** O que já está gravado da compra — preenche a edição dos dados na Central. */
export interface DadosCompraMlGravados {
  detalhe_texto: string | null;
  valor_boleto: number | null;
  vencimento: string | null;
  linha_digitavel: string | null;
  pago_em: string | null;
  detalhe_registrado_por_nome: string | null;
}

export async function obterDadosCompraMl(numero: string): Promise<DadosCompraMlGravados | null> {
  const { data, error } = await (supabase as any)
    .from('fin_ml_compras')
    .select('detalhe_texto, valor_boleto, vencimento, linha_digitavel, pago_em, detalhe_registrado_por_nome')
    .eq('numero_compra', numero)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as DadosCompraMlGravados | null;
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
 * Grava (ou apaga, com `codigo` null) o código do fornecedor SAP da loja que
 * vendeu o item. O status do comprador é ajustado pela tela.
 */
export async function registrarFornecedorMercadoLivre(ri: string, codigo: string | null, usuario: Usuario): Promise<void> {
  const agora = new Date().toISOString();
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .update({
      fornecedor_codigo: codigo,
      fornecedor_registrado_em: codigo ? agora : null,
      fornecedor_registrado_por_nome: codigo ? usuario.nome : null,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: agora,
    })
    .eq('ri', ri);
  if (error) throw new Error(error.message);
}

/**
 * Nome do fornecedor no cadastro importado do SAP (sup_fornecedores_cidades),
 * para a tela confirmar o código colado. null quando o código ainda não está
 * na base — fornecedor recém-cadastrado só aparece na próxima importação.
 */
export async function buscarNomeFornecedorSap(codigo: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sup_fornecedores_cidades')
    .select('forn_nome')
    .eq('forn_codigo', codigo)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { forn_nome?: string | null } | null)?.forn_nome ?? null;
}

const BUCKET_NF_ML = 'cotacoes-arquivos';
export const TAMANHO_MAXIMO_NF_ML = 10 * 1024 * 1024;

async function notasFiscaisAtuais(ri: string): Promise<NotaFiscalMl[]> {
  const { data, error } = await (supabase as any).from('sup_ml_itens').select('notas_fiscais').eq('ri', ri).maybeSingle();
  if (error) throw new Error(error.message);
  return ((data?.notas_fiscais ?? []) as NotaFiscalMl[]);
}

async function gravarNotasFiscais(ri: string, notas: NotaFiscalMl[], usuario: Usuario): Promise<void> {
  const { error } = await (supabase as any)
    .from('sup_ml_itens')
    .update({
      notas_fiscais: notas,
      atualizado_por_id: usuario.id,
      atualizado_por_nome: usuario.nome,
      updated_at: new Date().toISOString(),
    })
    .eq('ri', ri);
  if (error) throw new Error(error.message);
}

/**
 * Anexa a NF do item (PDF ou imagem). Imagem passa pela compressão padrão,
 * com lado maior de 2400 px para o texto da nota continuar legível. Lê a
 * lista do banco antes de gravar para não perder NF que outro comprador
 * anexou nesse meio-tempo.
 */
export async function anexarNotaFiscalMl(ri: string, arquivo: File, usuario: Usuario): Promise<NotaFiscalMl[]> {
  const ehPdf = arquivo.type === 'application/pdf' || /\.pdf$/i.test(arquivo.name);
  const ehImagem = arquivo.type.startsWith('image/');
  if (!ehPdf && !ehImagem) throw new Error('Envie a NF em PDF ou como imagem.');
  if (arquivo.size > TAMANHO_MAXIMO_NF_ML) throw new Error('A NF deve ter até 10 MB.');
  const blob: Blob = ehImagem ? await comprimirImagemUpload(arquivo, { maxDimensao: 2400, qualidade: 0.85 }) : arquivo;
  const base = (arquivo.name || 'nota-fiscal').replace(/\.[^.]+$/, '') || 'nota-fiscal';
  const nome = ehPdf ? `${base}.pdf` : blob === arquivo ? arquivo.name || `${base}.png` : `${base}.jpg`;
  const mime = ehPdf ? 'application/pdf' : blob.type || arquivo.type;
  const path = `mercado-livre/${encodeURIComponent(ri)}/nf/${crypto.randomUUID()}-${nome.replace(/[^\w.-]/g, '_').slice(-80)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET_NF_ML).upload(path, blob, { contentType: mime });
  if (upErr) throw new Error(`Falha ao enviar a NF: ${upErr.message}`);
  const nota: NotaFiscalMl = {
    nome, path, mime_type: mime, tamanho_bytes: blob.size,
    enviado_em: new Date().toISOString(), enviado_por_nome: usuario.nome,
  };
  try {
    const notas = [...(await notasFiscaisAtuais(ri)), nota];
    await gravarNotasFiscais(ri, notas, usuario);
    return notas;
  } catch (e) {
    await supabase.storage.from(BUCKET_NF_ML).remove([path]);
    throw e;
  }
}

/** Tira a NF do item e apaga o arquivo do Storage. */
export async function removerNotaFiscalMl(ri: string, path: string, usuario: Usuario): Promise<NotaFiscalMl[]> {
  const notas = (await notasFiscaisAtuais(ri)).filter(n => n.path !== path);
  await gravarNotasFiscais(ri, notas, usuario);
  const { error } = await supabase.storage.from(BUCKET_NF_ML).remove([path]);
  if (error) console.warn('NF retirada do item, mas o arquivo ficou no Storage:', error.message);
  return notas;
}

/** Link temporário da NF: para ver (sem `baixarComo`) ou baixar com o nome do arquivo. */
export async function urlNotaFiscalMl(path: string, baixarComo?: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET_NF_ML)
    .createSignedUrl(path, 60 * 60, baixarComo ? { download: baixarComo } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Não foi possível abrir a NF.');
  return data.signedUrl;
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
      valor_desconto: d.valorDesconto,
      valor_cupom: d.valorCupom,
      valor_reembolso: d.valorReembolso,
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

// ---------------------------------------------------------------------
// Devolução e reembolso por item (sup_ml_ocorrencias) — ver ocorrenciasMl.ts
// ---------------------------------------------------------------------

const dbOcorrencias = () => (supabase as any).from('sup_ml_ocorrencias');

/** Lançamentos válidos (não excluídos) de todos os itens do ML. */
export async function listarOcorrenciasMl(): Promise<OcorrenciaMl[]> {
  const { data, error } = await dbOcorrencias().select('*').is('excluido_em', null).order('created_at');
  if (error) throw new Error(error.message);
  return (data || []) as OcorrenciaMl[];
}

/** Lança devolução/reembolso no item, na compra em que ele está agora. */
export async function registrarOcorrenciaMl(
  item: Pick<ItemMercadoLivre, 'ri' | 'numero_compra'>,
  nova: NovaOcorrenciaMl,
  usuario: Usuario,
): Promise<void> {
  const { error } = await dbOcorrencias().insert({
    ri: item.ri,
    numero_compra: item.numero_compra,
    ...nova,
    criado_por_id: usuario.id,
    criado_por_nome: usuario.nome,
  });
  if (error) throw new Error(error.message);
}

/** Devolução com recompra: marca que o item foi comprado de novo (nº da nova compra é opcional). */
export async function marcarRecompraMl(id: string, numeroCompra: string | null, usuario: Usuario): Promise<void> {
  const { error } = await dbOcorrencias().update({
    recompra_feita_em: new Date().toISOString(),
    recompra_feita_por_nome: usuario.nome,
    recompra_numero_compra: numeroCompra,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Exclusão lógica: o lançamento sai da Central e do Financeiro, mas fica no banco. */
export async function excluirOcorrenciaMl(id: string, usuario: Usuario): Promise<void> {
  const { error } = await dbOcorrencias().update({
    excluido_em: new Date().toISOString(),
    excluido_por_nome: usuario.nome,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

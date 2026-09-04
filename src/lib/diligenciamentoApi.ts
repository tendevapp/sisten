/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Diligenciamento de PO — I/O do Supabase para `sup_diligenciamento_itens` e
 * `sup_prazos_transporte`, e a ponte de escrita para o Rastreio Compras.
 *
 * Supabase direto, sem passar pelo cache do `localDb`: são duas tabelas
 * novas, de baixo volume, no mesmo padrão de `rhApi.ts`/`portariaApi.ts`. As
 * duas ainda não estão em `database.types.ts`, então o `.from()` usa
 * `as any` — mesmo padrão já usado em `rhApi.ts` para `rh_rotas` até o
 * arquivo de tipos ser regerado.
 *
 * A leitura do que já existe no SAP (pedido, remessa, valor, fornecedor) usa
 * o cache do `localDb` (`getEnrichedSAPRequisicoes`, `getCidadeForn`,
 * `getAlmoxarifadoChegadasMap`); a agregação e os cálculos ficam em
 * `lib/diligenciamento.ts`.
 */

import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import type { DiligenciamentoItem, PrazoTransporte, Transportadora } from '../types';

/* Leitura --------------------------------------------------------------- */

export async function listarDiligenciamentoItens(): Promise<DiligenciamentoItem[]> {
  const { data, error } = await (supabase as any).from('sup_diligenciamento_itens').select('*');
  if (error) throw new Error(error.message);
  return (data || []) as DiligenciamentoItem[];
}

export async function listarPrazosTransporte(): Promise<PrazoTransporte[]> {
  const { data, error } = await (supabase as any)
    .from('sup_prazos_transporte')
    .select('*')
    .order('uf')
    .order('transportadora');
  if (error) throw new Error(error.message);
  return (data || []) as PrazoTransporte[];
}

export async function listarTransportadoras(): Promise<Transportadora[]> {
  const { data, error } = await (supabase as any)
    .from('sup_transportadoras')
    .select('*')
    .order('nome');
  if (error) throw new Error(error.message);
  return (data || []) as Transportadora[];
}

/* Escrita — sup_transportadoras ---------------------------------------- */

/** Cria (sem `id`) ou renomeia (com `id`) uma transportadora do cadastro. */
export async function salvarTransportadora(nome: string, id?: string): Promise<void> {
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) throw new Error('Informe o nome da transportadora.');
  const q = id
    ? (supabase as any).from('sup_transportadoras')
        .update({ nome: nomeLimpo, updated_at: new Date().toISOString() }).eq('id', id)
    : (supabase as any).from('sup_transportadoras').insert({ nome: nomeLimpo });
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function definirTransportadoraAtiva(id: string, ativo: boolean): Promise<void> {
  const { error } = await (supabase as any)
    .from('sup_transportadoras')
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function excluirTransportadora(id: string): Promise<void> {
  const { error } = await (supabase as any).from('sup_transportadoras').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * UF bruta (`regiao_uf`) do pedido ativo mais recente de cada RI, lida do
 * cache local da ZL0132 (`localDb.getPedidosForn()`). Fallback quando o
 * fornecedor ainda não tem linha em `cidadeforn` — ver
 * `lib/diligenciamento.ts` (`ufDoFornecedor`).
 *
 * `regiao_uf` não está declarado no tipo `PedidoForn` (a interface só cobre
 * os campos que o app já usava antes desta tela), mas a linha bruta da
 * ZL0132 sempre carrega a coluna — daí o `as any` pontual.
 */
export function regiaoUfBrutaPorRi(): Map<string, string> {
  const porRi = new Map<string, { uf: string; dataDoc: string }>();
  for (const p of localDb.getPedidosForn()) {
    const raw = p as any;
    const ri = String(raw.ri || '').trim();
    const uf = String(raw.regiao_uf || '').trim();
    if (!ri || !uf) continue;
    const dataDoc = String(raw.data_doc || '');
    const atual = porRi.get(ri);
    if (!atual || dataDoc > atual.dataDoc) porRi.set(ri, { uf, dataDoc });
  }
  return new Map(Array.from(porRi.entries()).map(([ri, v]) => [ri, v.uf]));
}

/* Escrita — sup_diligenciamento_itens ------------------------------------ */

export interface PatchDiligenciamentoItem {
  transportadora?: string | null;
  data_faturamento_transportadora?: string | null;
  previsao_manual?: string | null;
}

/**
 * Grava o mesmo patch em um ou mais itens (RI) de uma vez — é como a edição
 * no cabeçalho do PO aplica a todos os itens abertos dele, e a edição de um
 * único item chama esta mesma função com uma lista de um elemento só.
 *
 * Upsert por `ri_po` (item de RM + pedido): o diligenciamento é do PEDIDO, e
 * um item comprado em dois POs tem transportadora e previsão próprias em cada.
 * PostgREST monta o `ON CONFLICT DO UPDATE SET` só com as
 * colunas presentes no corpo da requisição, então um patch parcial (ex.: só
 * `transportadora`) não apaga `data_faturamento_transportadora`/`previsao_manual`
 * já gravados noutra edição.
 */
export async function salvarDiligenciamentoItens(
  riPos: string[],
  docCompraPorRiPo: Map<string, string>,
  patch: PatchDiligenciamentoItem,
  usuario: { id: string; nome: string },
): Promise<void> {
  if (riPos.length === 0) return;
  const agora = new Date().toISOString();

  const linhas = riPos.map(riPo => ({
    ri_po: riPo,
    // O `ri` sai da própria chave: `ri_po` é `<ri>-<PO>` e o `ri` não tem hífen.
    ri: riPo.split('-')[0],
    doc_compra: docCompraPorRiPo.get(riPo) || null,
    ...patch,
    atualizado_por_id: usuario.id,
    atualizado_por_nome: usuario.nome,
    updated_at: agora,
  }));

  const { error } = await (supabase as any)
    .from('sup_diligenciamento_itens')
    .upsert(linhas, { onConflict: 'ri_po' });
  if (error) throw new Error(error.message);
}

/**
 * Troca de transportadora: além de gravar o nome, limpa a previsão manual do
 * item — uma previsão digitada à mão para uma transportadora não deve
 * sobreviver escondida atrás da escolha de outra. Ver o comentário em
 * `sup_diligenciamento_itens.sql`.
 */
export async function trocarTransportadora(
  riPos: string[],
  docCompraPorRiPo: Map<string, string>,
  transportadora: string,
  usuario: { id: string; nome: string },
): Promise<void> {
  await salvarDiligenciamentoItens(riPos, docCompraPorRiPo, { transportadora, previsao_manual: null }, usuario);
}

/* Escrita — sup_prazos_transporte ----------------------------------------- */

export async function salvarPrazoTransporte(
  uf: string,
  transportadora: string,
  diasCorridos: number,
): Promise<void> {
  const { error } = await (supabase as any)
    .from('sup_prazos_transporte')
    .upsert(
      { uf: uf.toUpperCase(), transportadora, dias_corridos: diasCorridos, updated_at: new Date().toISOString() },
      { onConflict: 'uf,transportadora' },
    );
  if (error) throw new Error(error.message);
}

export async function excluirPrazoTransporte(id: string): Promise<void> {
  const { error } = await (supabase as any).from('sup_prazos_transporte').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* Escrita de volta no Rastreio Compras ------------------------------------- */

export interface ResultadoGravacaoRastreio {
  ok: string[];
  falhas: string[];
}

/**
 * Leva a previsão de chegada (calculada ou editada à mão no painel) até o
 * Rastreio Compras: grava `data_entrega_prevista` e já confirma para
 * `data_entrega_confirmada` — a única data que o Rastreio exibe ao
 * solicitante (ver `localDb.confirmDeliveryDate`).
 *
 * Reaproveita `localDb.updateBuyerFields`, passando adiante a observação e o
 * status atuais de cada RI: essa função sempre regrava `obs_comprador`
 * inteiro, então gravar `''`/`undefined` ali apagaria uma nota do comprador
 * que não tem nada a ver com esta tela.
 *
 * Não escreve em `dt_remessa` (ZL0132): é dado bruto do SAP, sobrescrito na
 * próxima importação, e o Rastreio deliberadamente nunca a usa como prazo.
 */
export async function gravarPrevisaoNoRastreio(
  ris: string[],
  novaData: string,
): Promise<ResultadoGravacaoRastreio> {
  const requisicoesPorRi = new Map(localDb.getRequisicoes().map(r => [r.ri, r]));
  const falhas: string[] = [];
  const ok: string[] = [];

  for (const ri of ris) {
    const req = requisicoesPorRi.get(ri);
    if (!req) { falhas.push(ri); continue; }

    const salvou = await localDb.updateBuyerFields(ri, req.obs_comprador || '', novaData, req.item_status);
    if (!salvou) { falhas.push(ri); continue; }

    const confirmou = await localDb.confirmDeliveryDate(ri);
    if (!confirmou) { falhas.push(ri); continue; }

    ok.push(ri);
  }

  return { ok, falhas };
}

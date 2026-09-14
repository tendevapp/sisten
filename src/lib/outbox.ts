/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fila de gravação offline (outbox) — genérica, primeiro consumidor é o
 * módulo Produção.
 *
 * O SISTEN hoje é online puro: toda escrita vai direto ao Supabase e falha na
 * hora sem rede. No chão de fábrica isso custa o lançamento inteiro (medições,
 * fotos) a cada queda de sinal. O outbox guarda a mutação em IndexedDB — via
 * `idb-keyval`, já dependência do app (ver `db/localDb.ts`) — e reenvia quando
 * a rede volta, sem o usuário refazer nada.
 *
 * Duas peças fecham o ciclo:
 *   1. `client_id` gerado no aparelho (`gerarUUID()`) viaja no payload e vira
 *      `unique` na tabela de destino — um reenvio duplicado bate no
 *      `on conflict (client_id) do nothing` da RPC e não duplica a linha.
 *   2. O item só sai da fila quando o servidor confirma. Falha de rede ou do
 *      próprio servidor deixa o item pendente para a próxima tentativa.
 *
 * As fotos (Blob) viajam dentro do próprio item, não só o payload JSON — sem
 * isso a foto se perderia ao recarregar a página offline (é a lacuna do
 * rascunho em localStorage do Recebimento, que serializa sem os `File`).
 *
 * Não é testado por vitest: o ambiente de teste roda em Node sem IndexedDB
 * (`vitest.config.ts`: `environment: 'node'`) — mesmo motivo por que
 * `db/localDb.ts` e as camadas `*Api.ts` do repo não têm `.test.ts`. A lógica
 * pura fica em `lib/producao.ts`, que é testável.
 */

import { get, set, del, keys } from 'idb-keyval';

/** Prefixo de chave no IndexedDB — isola o outbox de qualquer outro uso do idb-keyval. */
const PREFIXO_CHAVE = 'sisten_outbox_';

export interface OutboxArquivo {
  /** Nome do campo no payload que este arquivo preenche (ex.: `evidencias[0]`). */
  campo: string;
  blob: Blob;
  nome: string;
  mimeType: string;
}

export interface OutboxItem<TPayload = Record<string, unknown>> {
  /** `client_id` — chave de idempotência, gerado com `gerarUUID()` no aparelho. */
  id: string;
  /** Discrimina o tipo de mutação (`'prod_lancamento'`, ...) — um outbox serve vários módulos. */
  tipo: string;
  payload: TPayload;
  arquivos?: OutboxArquivo[];
  criadoEm: string;
  tentativas: number;
  ultimoErro?: string | null;
}

const chaveDe = (id: string) => `${PREFIXO_CHAVE}${id}`;

// Ouvintes locais (mesma aba) para o chip de status reagir a mudanças na
// fila sem precisar reconsultar o IndexedDB a cada renderização — o mesmo
// padrão de `localDb.subscribe()`.
const ouvintes = new Set<() => void>();
function notificar(): void {
  ouvintes.forEach(fn => fn());
}

/** Assina mudanças na fila (item entrou, saiu, ou teve nova tentativa). Devolve a função de cancelar. */
export function subscribe(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Enfileira uma mutação. Chame antes de tentar o envio — sucesso imediato só remove em seguida. */
export async function enfileirar<T>(item: {
  id: string;
  tipo: string;
  payload: T;
  arquivos?: OutboxArquivo[];
}): Promise<void> {
  const registro: OutboxItem<T> = {
    ...item,
    tentativas: 0,
    ultimoErro: null,
    criadoEm: new Date().toISOString(),
  };
  await set(chaveDe(item.id), registro);
  notificar();
}

/** Itens pendentes de um tipo, do mais antigo para o mais novo (ordem de envio). */
export async function listarPendentes<T = Record<string, unknown>>(tipo?: string): Promise<OutboxItem<T>[]> {
  const todasChaves = await keys();
  const relevantes = todasChaves.filter(
    (k): k is string => typeof k === 'string' && k.startsWith(PREFIXO_CHAVE),
  );
  const itens = await Promise.all(relevantes.map(k => get<OutboxItem<T>>(k)));
  return itens
    .filter((i): i is OutboxItem<T> => !!i && (!tipo || i.tipo === tipo))
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

/** Remove um item — chamar só depois que o servidor confirmou o registro. */
export async function remover(id: string): Promise<void> {
  await del(chaveDe(id));
  notificar();
}

/** Marca uma tentativa falha, preservando o item na fila para a próxima rodada. */
async function registrarFalha(id: string, erro: string): Promise<void> {
  const atual = await get<OutboxItem>(chaveDe(id));
  if (!atual) return;
  await set(chaveDe(id), { ...atual, tentativas: atual.tentativas + 1, ultimoErro: erro });
  notificar();
}

let processando = false;

/**
 * Percorre a fila de um tipo tentando reenviar cada item, na ordem em que
 * entrou. `handler` deve lançar em caso de falha (rede, validação, permissão)
 * — o item permanece na fila; se resolver, o item sai. Uma execução por vez
 * (chamadas concorrentes — polling + foco + clique manual — não duplicam
 * envio).
 */
export async function processarFila<T = Record<string, unknown>>(
  tipo: string,
  handler: (item: OutboxItem<T>) => Promise<void>,
): Promise<{ enviados: number; falharam: number }> {
  if (processando) return { enviados: 0, falharam: 0 };
  processando = true;
  let enviados = 0;
  let falharam = 0;
  try {
    const pendentes = await listarPendentes<T>(tipo);
    for (const item of pendentes) {
      try {
        await handler(item);
        await remover(item.id);
        enviados++;
      } catch (err) {
        await registrarFalha(item.id, err instanceof Error ? err.message : String(err));
        falharam++;
      }
    }
  } finally {
    processando = false;
  }
  return { enviados, falharam };
}

/** Conta os pendentes de um tipo — para o chip "N lançamentos aguardando envio". */
export async function contarPendentes(tipo?: string): Promise<number> {
  return (await listarPendentes(tipo)).length;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Backup da fila offline no servidor — regras puras.
 *
 * O aparelho guarda no IndexedDB o que ainda não subiu. Se o celular quebra,
 * é formatado, ou o registro fica preso (recusado, ou de outro usuário que
 * não volta a entrar naquele aparelho), o admin não tinha como ver nem
 * recuperar. Agora, com rede, o aparelho manda uma cópia de cada item da fila
 * para `ops_fila_backup` (só o admin lê) e as fotos/assinaturas para o bucket
 * privado `ops-fila-backup`. A Central de Sincronização mostra o conteúdo e
 * baixa o backup.
 *
 * Não faz backup de tudo na hora: o que sobe normal sobe em segundos, e
 * mandar a foto duas vezes dobraria o tráfego. Entra o que está na fila há
 * mais de `IDADE_MINIMA_BACKUP_MS`, o que o servidor recusou e o que é de
 * outro usuário do aparelho.
 */

import type { OperacaoFila } from './filaSupabase';
import type { PendenciaOffline } from '../qualidadeOffline';
import type { OutboxItem } from '../outbox';
import { pareceFalhaDeRede } from '../rede';

export type FilaBackup = 'formularios' | 'qualidade' | 'producao';

export interface ItemBackup {
  fila: FilaBackup;
  itemId: string;
  donoId: string | null;
  donoNome: string | null;
  rotulo: string;
  resumo: string;
  estado: string;
  erro: string | null;
  criadoEm: string;
  /** Conteúdo legível, com os arquivos trocados por `{ __arquivo: n, tipo, tamanho }`. */
  conteudo: unknown;
  arquivos: Blob[];
}

export const IDADE_MINIMA_BACKUP_MS = 2 * 60_000;

export function chaveBackup(dispositivo: string, fila: FilaBackup, itemId: string): string {
  return `${dispositivo}:${fila}:${itemId}`;
}

function ehBlob(valor: unknown): valor is Blob {
  return typeof Blob !== 'undefined' && valor instanceof Blob;
}

/** Troca cada Blob por uma marca (`__arquivo` = posição em `arquivos`) e devolve os arquivos. */
export function separarArquivos(valor: unknown): { valor: unknown; arquivos: Blob[] } {
  const arquivos: Blob[] = [];
  const andar = (v: unknown): unknown => {
    if (ehBlob(v)) {
      arquivos.push(v);
      return { __arquivo: arquivos.length - 1, tipo: v.type || 'application/octet-stream', tamanho: v.size };
    }
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(andar);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, andar(x)]));
    }
    return v;
  };
  return { valor: andar(valor), arquivos };
}

/** FNV-1a 32 bits em hexa: barato, só para saber se o item mudou desde o último backup. */
export function hashTexto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function deveFazerBackup(
  item: { criadoEm: string; estado: string; donoId: string | null },
  usuarioAtual: string,
  agora: number,
): boolean {
  if (item.estado === 'erro') return true;
  if (item.donoId && item.donoId !== usuarioAtual) return true;
  const criado = Date.parse(item.criadoEm);
  return !Number.isFinite(criado) || agora - criado >= IDADE_MINIMA_BACKUP_MS;
}

function corpoLegivel(corpo: OperacaoFila['corpo']): unknown {
  if (!corpo) return null;
  if (corpo.tipo === 'texto') {
    try { return JSON.parse(corpo.texto); } catch { return corpo.texto; }
  }
  if (corpo.tipo === 'blob') return corpo.blob;
  return corpo.partes.map(([nome, valor, arquivo]) => ({ campo: nome, valor, arquivo: arquivo ?? null }));
}

export function itemDeOperacao(op: OperacaoFila): ItemBackup {
  // Cabeçalhos guardados já não têm token (cabecalhosGuardaveis); o caminho e o corpo bastam para refazer.
  const { valor, arquivos } = separarArquivos({
    tipo: op.tipo, metodo: op.metodo, caminho: op.caminho, tabela: op.tabela ?? null, rpc: op.rpc ?? null,
    corpo: corpoLegivel(op.corpo), tentativas: op.tentativas,
  });
  return {
    fila: 'formularios', itemId: op.id, donoId: op.usuarioId, donoNome: op.usuarioNome ?? null,
    rotulo: op.rotulo, resumo: op.resumo, estado: op.estado, erro: op.erro, criadoEm: op.criadoEm,
    conteudo: valor, arquivos,
  };
}

export function itemDePendencia(p: PendenciaOffline, rotulo: string): ItemBackup {
  const { valor, arquivos } = separarArquivos({
    modulo: p.modulo, novo: p.novo, input: p.input, acao: p.acao,
    fotosNovas: p.fotosNovas, fotosRemovidas: p.fotosRemovidas,
    assinaturasNovas: p.assinaturasNovas, assinaturasRemovidas: p.assinaturasRemovidas,
    tentativas: p.tentativas,
  });
  return {
    fila: 'qualidade', itemId: `${p.modulo}:${p.id}`, donoId: p.usuarioId, donoNome: p.usuarioNome ?? null,
    rotulo, resumo: '', estado: p.estado, erro: p.ultimoErro ?? null, criadoEm: p.criadoEm,
    conteudo: valor, arquivos,
  };
}

/** O outbox da Produção não guarda o dono: é de quem está logado no aparelho. */
export function itemDeOutbox(o: OutboxItem, donoId: string, donoNome: string): ItemBackup {
  const { valor, arquivos } = separarArquivos({ tipo: o.tipo, payload: o.payload, arquivos: o.arquivos ?? [], tentativas: o.tentativas });
  return {
    fila: 'producao', itemId: o.id, donoId, donoNome,
    // Falha de rede no outbox não é recusa do servidor (mesma regra da Central).
    rotulo: o.tipo, resumo: '', estado: o.ultimoErro && !pareceFalhaDeRede(o.ultimoErro) ? 'erro' : 'pendente',
    erro: o.ultimoErro ?? null, criadoEm: o.criadoEm,
    conteudo: valor, arquivos,
  };
}

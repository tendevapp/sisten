/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Envio do backup da fila offline (regras em `backupFila.ts`). É a borda:
 * IndexedDB, Storage e RPC — sem teste de unidade.
 *
 * Roda junto do reporter da Central (a cada 2 min e a cada mudança). Lê as
 * três filas do aparelho, de TODOS os usuários dele, e manda só o que mudou
 * desde o último backup (hash guardado no aparelho). Fotos e assinaturas vão
 * para `ops-fila-backup/<quem enviou>/<aparelho>/...`; o resto pela RPC
 * `ops_fila_backup_registrar`, que também marca o que saiu da fila.
 */

import { supabase } from '../../db/supabaseClient';
import { listarPendencias, type ModuloOffline } from '../qualidadeOffline';
import { listarPendentes } from '../outbox';
import { listarOperacoes } from './filaSupabase';
import { obterIdAparelho } from './aparelho';
import { resumirPlataforma } from './snapshotSincronizacao';
import {
  chaveBackup, deveFazerBackup, hashTexto, itemDeOperacao, itemDeOutbox, itemDePendencia, type ItemBackup,
} from './backupFila';

const BUCKET = 'ops-fila-backup';
const CHAVE_HASHES = 'sisten_backup_fila_hashes';
const LOTE = 50;

const MODULOS_QUALIDADE: { modulo: ModuloOffline; rotulo: string }[] = [
  { modulo: 'qua_expedicao', rotulo: 'Checklist de Expedição' },
  { modulo: 'qua_internos', rotulo: 'Checklist de Internos Mecânicos' },
];

let ultimosPresentes = '';

function lerHashes(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CHAVE_HASHES) || '{}'); } catch { return {}; }
}

function gravarHashes(h: Record<string, string>): void {
  try { localStorage.setItem(CHAVE_HASHES, JSON.stringify(h)); } catch { /* sem espaço: reenvia depois, sem perda */ }
}

const seguro = (texto: string) => texto.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

async function coletarItens(usuario: { id: string; name: string }): Promise<ItemBackup[]> {
  const [ops, porModulo, outbox] = await Promise.all([
    listarOperacoes(),
    Promise.all(MODULOS_QUALIDADE.map(m => listarPendencias(m.modulo))),
    listarPendentes(),
  ]);
  return [
    ...ops.map(itemDeOperacao),
    ...porModulo.flatMap((lista, i) => lista.map(p => itemDePendencia(p, MODULOS_QUALIDADE[i].rotulo))),
    ...outbox.map(o => itemDeOutbox(o, usuario.id, usuario.name)),
  ];
}

/** Manda ao servidor o backup do que mudou na fila. Falha (sem rede) fica para a próxima vez. */
export async function enviarBackupFila(usuario: { id: string; name: string }): Promise<void> {
  if (!supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const dispositivo = obterIdAparelho();
  const itens = await coletarItens(usuario);
  const presentes = itens.map(i => chaveBackup(dispositivo, i.fila, i.itemId));
  const hashes = lerHashes();
  const agora = Date.now();

  const novos: { chave: string; hash: string; linha: Record<string, unknown> }[] = [];
  for (const item of itens) {
    if (!deveFazerBackup({ criadoEm: item.criadoEm, estado: item.estado, donoId: item.donoId }, usuario.id, agora)) continue;
    const chave = chaveBackup(dispositivo, item.fila, item.itemId);
    const hash = hashTexto(JSON.stringify({ c: item.conteudo, e: item.estado, r: item.erro, a: item.arquivos.map(a => a.size) }));
    if (hashes[chave] === hash) continue;

    const arquivos: { n: number; caminho: string; tipo: string; tamanho: number }[] = [];
    for (const [n, blob] of item.arquivos.entries()) {
      const caminho = `${usuario.id}/${seguro(dispositivo)}/${item.fila}/${seguro(item.itemId)}/${hash}-${n}`;
      const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, {
        contentType: blob.type || 'application/octet-stream', upsert: false,
      });
      // Já subiu numa tentativa anterior com o mesmo hash: vale.
      if (error && !/exist|duplicate/i.test(error.message)) throw error;
      arquivos.push({ n, caminho, tipo: blob.type || 'application/octet-stream', tamanho: blob.size });
    }
    novos.push({
      chave, hash,
      linha: {
        fila: item.fila, item_id: item.itemId, dono_id: item.donoId, dono_nome: item.donoNome,
        rotulo: item.rotulo, resumo: item.resumo, estado: item.estado, erro: item.erro, criado_em: item.criadoEm,
        conteudo: item.conteudo, arquivos, hash,
      },
    });
  }

  const assinaturaPresentes = presentes.slice().sort().join('|');
  if (!novos.length && assinaturaPresentes === ultimosPresentes) return;

  const plataforma = resumirPlataforma(typeof navigator === 'undefined' ? '' : navigator.userAgent);
  // Lotes: a RPC aceita até 200; o último lote leva a lista de presentes (marca o que saiu).
  const lotes = novos.length ? Array.from({ length: Math.ceil(novos.length / LOTE) }, (_, i) => novos.slice(i * LOTE, (i + 1) * LOTE)) : [[]];
  for (const [i, lote] of lotes.entries()) {
    const ultimo = i === lotes.length - 1;
    const { error } = await (supabase.rpc as any)('ops_fila_backup_registrar', {
      p_device_id: dispositivo,
      p_plataforma: plataforma,
      p_itens: lote.map(n => n.linha),
      p_presentes: ultimo ? presentes : null,
    });
    if (error) throw new Error(error.message);
    lote.forEach(n => { hashes[n.chave] = n.hash; });
  }
  // Guarda só os hashes do que ainda está na fila.
  const vivos = new Set(presentes);
  gravarHashes(Object.fromEntries(Object.entries(hashes).filter(([k]) => vivos.has(k))));
  ultimosPresentes = assinaturaPresentes;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reporter da Central de Sincronização: lê as três filas offline do aparelho
 * (formulários, checklists da Qualidade, outbox da Produção), monta o resumo
 * (`construirSnapshot`) e manda ao servidor pela RPC
 * `registrar_sincronizacao_aparelho`. É a borda: IndexedDB e rede, sem teste de
 * unidade — a conta está em `snapshotSincronizacao.ts`.
 *
 * Quando reporta:
 *  - ao abrir o app (sempre, mesmo com a fila vazia: limpa um resumo velho de
 *    uma sessão que fechou antes de esvaziar);
 *  - 5 s depois de qualquer mudança em qualquer das filas;
 *  - ao voltar a rede e ao voltar o foco da aba;
 *  - a cada 2 min enquanto houver fila (batimento: sem ele, um aparelho com a
 *    fila parada pareceria "sumido").
 *
 * Fila vazia e sem mudança não gera chamada. A RPC não está em
 * `configFormularios.ts` de propósito: sem rede ela falha em vez de entrar na
 * fila — reportar o estado da fila na própria fila não faria sentido.
 */

import { supabase } from '../../db/supabaseClient';
import { listarPendencias, assinarPendencias, type ModuloOffline } from '../qualidadeOffline';
import { listarPendentes, subscribe as assinarOutbox } from '../outbox';
import { pareceFalhaDeRede } from '../rede';
import { assinarFilaOffline, listarOperacoes } from './filaSupabase';
import { obterIdAparelho } from './aparelho';
import {
  construirSnapshot,
  resumirPlataforma,
  snapshotsIguais,
  type EntradaFila,
  type SnapshotFila,
} from './snapshotSincronizacao';

const MODULOS_QUALIDADE: { modulo: ModuloOffline; rotulo: string }[] = [
  { modulo: 'qua_expedicao', rotulo: 'Checklist de Expedição' },
  { modulo: 'qua_internos', rotulo: 'Checklist de Internos Mecânicos' },
];

export const ATRASO_MUDANCA_MS = 5_000;
export const BATIMENTO_MS = 2 * 60_000;

/** Lê as três filas do aparelho e devolve o resumo. */
export async function coletarSnapshot(usuarioId: string): Promise<SnapshotFila> {
  const [operacoes, pendenciasPorModulo, outbox] = await Promise.all([
    listarOperacoes(usuarioId),
    Promise.all(MODULOS_QUALIDADE.map(m => listarPendencias(m.modulo, usuarioId))),
    listarPendentes(),
  ]);

  const formularios: EntradaFila[] = operacoes.map(op => ({
    estado: op.estado,
    criadoEm: op.criadoEm,
    erro: op.erro,
    rotulo: op.rotulo,
  }));

  const qualidade: EntradaFila[] = pendenciasPorModulo.flatMap((lista, i) =>
    lista.map(p => ({
      estado: p.estado,
      criadoEm: p.criadoEm,
      erro: p.ultimoErro,
      rotulo: MODULOS_QUALIDADE[i].rotulo,
    })),
  );

  // O outbox não tem estado: o que ele guarda é "tentou e falhou" ou "ainda não tentou".
  // Falha de rede não é erro do servidor — fica como pendente.
  const producao: EntradaFila[] = outbox.map(item => ({
    estado: item.ultimoErro && !pareceFalhaDeRede(item.ultimoErro) ? 'erro' : 'pendente',
    criadoEm: item.criadoEm,
    erro: item.ultimoErro ?? null,
    rotulo: item.tipo,
  }));

  return construirSnapshot({ formularios, qualidade, producao });
}

export interface UsuarioReporter {
  id: string;
  name: string;
}

interface UltimoEnvio {
  snapshot: SnapshotFila;
  online: boolean;
  em: number;
}

/**
 * Liga o reporter. Devolve a função que desliga tudo (assinaturas, timers e
 * listeners). Pensado para o `useEffect` de um componente montado uma vez.
 */
export function iniciarReporterSincronizacao(usuario: UsuarioReporter): () => void {
  let parado = false;
  let ultimo: UltimoEnvio | null = null;
  let agendado: number | undefined;
  let emAndamento = false;

  const reportar = async () => {
    if (parado || emAndamento) return;
    emAndamento = true;
    try {
      const snapshot = await coletarSnapshot(usuario.id);
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      const agora = Date.now();

      if (ultimo) {
        const igual = snapshotsIguais(ultimo.snapshot, snapshot) && ultimo.online === online;
        const filaVazia = snapshot.pendentes === 0;
        const batimentoVencido = agora - ultimo.em >= BATIMENTO_MS;
        // Sem mudança: fila vazia fica quieta; fila com itens só bate de tempos em tempos.
        if (igual && (filaVazia || !batimentoVencido)) return;
      }

      const { error } = await (supabase.rpc as any)('registrar_sincronizacao_aparelho', {
        p_device_id: obterIdAparelho(),
        p_user_name: usuario.name,
        p_plataforma: resumirPlataforma(typeof navigator === 'undefined' ? '' : navigator.userAgent),
        p_online: online,
        p_pendentes: snapshot.pendentes,
        p_com_erro: snapshot.comErro,
        p_mais_antigo_em: snapshot.maisAntigoEm,
        p_ultimo_erro: snapshot.ultimoErro,
        p_ultimo_erro_rotulo: snapshot.ultimoErroRotulo,
        p_detalhes: snapshot.detalhes,
      });
      if (!error) ultimo = { snapshot, online, em: agora };
    } catch {
      /* sem rede ou servidor fora: tenta de novo no próximo gatilho */
    } finally {
      emAndamento = false;
    }
  };

  const agendar = (ms = ATRASO_MUDANCA_MS) => {
    if (agendado !== undefined) window.clearTimeout(agendado);
    agendado = window.setTimeout(() => {
      agendado = undefined;
      void reportar();
    }, ms);
  };

  const aoVoltarRede = () => agendar(3_000);
  const aoVoltarFoco = () => {
    if (document.visibilityState === 'visible') agendar(1_500);
  };

  const cancelarAssinaturas = [assinarFilaOffline(() => agendar()), assinarPendencias(() => agendar()), assinarOutbox(() => agendar())];
  window.addEventListener('online', aoVoltarRede);
  document.addEventListener('visibilitychange', aoVoltarFoco);
  const batimento = window.setInterval(() => void reportar(), BATIMENTO_MS);

  agendar(2_000); // primeiro reporte, depois de o app assentar

  return () => {
    parado = true;
    if (agendado !== undefined) window.clearTimeout(agendado);
    window.clearInterval(batimento);
    window.removeEventListener('online', aoVoltarRede);
    document.removeEventListener('visibilitychange', aoVoltarFoco);
    cancelarAssinaturas.forEach(cancelar => cancelar());
  };
}

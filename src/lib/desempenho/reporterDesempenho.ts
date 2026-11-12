/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reporter do Monitor de Desempenho: a cada 5 min fecha a janela do
 * acumulador (`medidorFetch.ts`) e manda o resumo pela RPC
 * `registrar_desempenho_cliente`. É também o batimento de "usuários online":
 * com a aba à vista ele manda mesmo sem nenhuma chamada.
 *
 * Se o envio falhar (servidor travado, sem rede), a janela volta ao
 * acumulador e vai junto na próxima — é justamente o período lento que mais
 * interessa. Ao fechar a aba, o que não subiu fica no localStorage e sobe na
 * próxima abertura.
 *
 * A RPC não está em `configFormularios.ts` de propósito: sem rede ela falha
 * em vez de entrar na fila offline.
 */

import { supabase } from '../../db/supabaseClient';
import { obterIdAparelho } from '../offline/aparelho';
import { resumirPlataforma } from '../offline/snapshotSincronizacao';
import type { SnapshotDesempenho } from './acumulador';
import { acumuladorDesempenho, observarNavegador, paginaAtual } from './medidorFetch';

export const INTERVALO_MS = 5 * 60_000;
const PRIMEIRO_ENVIO_MS = 30_000;
const CHAVE_PENDENTE = 'sisten_desempenho_pendente';
/** Janela guardada há mais que isso não vale mais a pena subir. */
const VALIDADE_PENDENTE_MS = 24 * 60 * 60_000;

function conexao(): string | null {
  const c = (navigator as any).connection;
  return c?.effectiveType ? String(c.effectiveType) : null;
}

function memoriaMb(): number | null {
  const m = (performance as any).memory;
  return m?.usedJSHeapSize ? Math.round(m.usedJSHeapSize / 1_048_576) : null;
}

function restaurarPendente(): void {
  try {
    const bruto = localStorage.getItem(CHAVE_PENDENTE);
    if (!bruto) return;
    localStorage.removeItem(CHAVE_PENDENTE);
    const s = JSON.parse(bruto) as SnapshotDesempenho;
    if (s && typeof s.inicio === 'number' && Date.now() - s.inicio < VALIDADE_PENDENTE_MS) acumuladorDesempenho.mesclar(s);
  } catch {
    /* storage bloqueado ou conteúdo velho: segue sem */
  }
}

function guardarPendente(): void {
  try {
    if (!acumuladorDesempenho.temDados()) return;
    const s = acumuladorDesempenho.extrair(Date.now());
    localStorage.setItem(CHAVE_PENDENTE, JSON.stringify(s));
    acumuladorDesempenho.mesclar(s); // a aba pode não fechar (pagehide do bfcache)
  } catch {
    /* sem storage */
  }
}

export function iniciarReporterDesempenho(): () => void {
  let parado = false;
  let enviando = false;
  observarNavegador();
  restaurarPendente();
  paginaAtual();

  const enviar = async () => {
    if (parado || enviando) return;
    const visivel = document.visibilityState === 'visible';
    // Aba escondida e sem nada medido: nem batimento (o usuário não está ali).
    if (!visivel && !acumuladorDesempenho.temDados()) return;
    enviando = true;
    const janela = acumuladorDesempenho.extrair(Date.now());
    try {
      const { error } = await (supabase.rpc as any)('registrar_desempenho_cliente', {
        p_device_id: obterIdAparelho(),
        p_plataforma: resumirPlataforma(navigator.userAgent || ''),
        p_conexao: conexao(),
        p_janela_inicio: new Date(janela.inicio).toISOString(),
        p_janela_fim: new Date(janela.fim).toISOString(),
        p_resumo: {
          requisicoes: janela.requisicoes,
          tempo_ms: janela.tempo_ms,
          lentas: janela.lentas,
          erros: janela.erros,
          bytes: janela.bytes,
          travamentos: janela.travamentos,
          travamento_ms: janela.travamento_ms,
          travamento_max_ms: janela.travamento_max_ms,
          storage_n: janela.storage_n,
          storage_bytes: janela.storage_bytes,
          memoria_mb: memoriaMb(),
          pagina_atual: paginaAtual(),
          visivel,
        },
        p_endpoints: janela.endpoints,
        p_paginas: janela.paginas,
      });
      if (error) acumuladorDesempenho.mesclar(janela);
    } catch {
      acumuladorDesempenho.mesclar(janela);
    } finally {
      enviando = false;
    }
  };

  // Navegação dentro do app sem chamada nenhuma também é visita.
  const vigiaPagina = window.setInterval(() => paginaAtual(), 5_000);
  const primeiro = window.setTimeout(() => void enviar(), PRIMEIRO_ENVIO_MS);
  const ciclo = window.setInterval(() => void enviar(), INTERVALO_MS);
  window.addEventListener('pagehide', guardarPendente);

  return () => {
    parado = true;
    window.clearInterval(vigiaPagina);
    window.clearTimeout(primeiro);
    window.clearInterval(ciclo);
    window.removeEventListener('pagehide', guardarPendente);
  };
}

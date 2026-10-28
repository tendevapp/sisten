/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Indicadores (bolinha vermelha) do menu lateral: itens em aberto que esperam
 * o usuario em "Pendencias" e "Aprovacoes". Compras vem do localDb (reativo);
 * retiradas sem saldo e notas do Processamento de NF vem do banco e sao relidas
 * a cada 3 minutos. A bolinha de Pendencias soma todas as abas que o usuario ve.
 *
 * So contagem (`count`, sem linhas) e so com a aba visivel: o menu roda em toda
 * aba aberta do dia inteiro; em 28/10/2026 a leitura de linhas completas a cada
 * minuto, inclusive em abas escondidas, ajudou a saturar o banco.
 */

import { useEffect, useState } from 'react';
import { localDb } from '../db/localDb';
import type { Profile } from '../types';
import { canAccessPage } from './pages';
import { podeAprovar } from './solicitacoesCentral';
import { contarRetiradasSemSaldo } from './solicitacaoExtraApi';
import { podeDarBaixaRetirada } from './retiradaSemSaldoBaixa';
import { setoresDeAprovacao } from './solicitacaoExtra';
import { contarNotasAguardando } from './supPendenciasApi';

const INTERVALO_MS = 3 * 60_000;

export interface IndicadoresMenu {
  /** Itens em aberto por id de pagina do menu (ex.: `sol_aprovacoes`). */
  [pageId: string]: number;
}

export function contarComprasPendentes(user: Profile): number {
  return localDb
    .getRequests()
    .filter((r) => r.status === 'pendente' && podeAprovar(r, user)).length;
}

export function useIndicadoresMenu(user: Profile): IndicadoresMenu {
  const [compras, setCompras] = useState(() => contarComprasPendentes(user));
  const [aprovacaoRetirada, setAprovacaoRetirada] = useState(0);
  const [baixaRetirada, setBaixaRetirada] = useState(0);
  const [notasProcessamento, setNotasProcessamento] = useState(0);

  const ehAprovador = user.roles.includes('admin') || (user.aprovador_setores?.length ?? 0) > 0;
  const ehAlmox = podeDarBaixaRetirada(user);
  const veProcessamento = canAccessPage(user, 'sup_pendencias_processamento');

  useEffect(() => {
    const atualizar = () => setCompras(contarComprasPendentes(user));
    atualizar();
    return localDb.subscribe(atualizar);
  }, [user]);

  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      if (document.hidden) return;
      if (ehAprovador) {
        contarRetiradasSemSaldo({ aprovacao: 'PENDENTE', setores: setoresDeAprovacao(user) })
          .then((n) => { if (ativo) setAprovacaoRetirada(n); })
          .catch(() => { /* sem a contagem o menu segue sem a bolinha */ });
      }
      if (ehAlmox) {
        contarRetiradasSemSaldo({ status: 'PENDENTE' })
          .then((n) => { if (ativo) setBaixaRetirada(n); })
          .catch(() => { /* idem */ });
      }
      if (veProcessamento) {
        contarNotasAguardando()
          .then((n) => { if (ativo) setNotasProcessamento(n); })
          .catch(() => { /* idem */ });
      }
    };
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    // Volta ao primeiro plano: atualiza na hora em vez de esperar o próximo ciclo.
    const aoVoltar = () => { if (!document.hidden) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { ativo = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [user, ehAprovador, ehAlmox, veProcessamento]);

  const aprovacoes = canAccessPage(user, 'sol_aprovacoes') ? compras + aprovacaoRetirada : 0;
  const pendencias = canAccessPage(user, 'geral_pendencias')
    ? aprovacaoRetirada + baixaRetirada + (veProcessamento ? notasProcessamento : 0)
    : 0;

  return { sol_aprovacoes: aprovacoes, geral_pendencias: pendencias };
}

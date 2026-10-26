/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Indicadores (bolinha vermelha) do menu lateral: itens em aberto que esperam
 * o usuario em "Pendencias" e "Aprovacoes". Compras vem do localDb (reativo);
 * retiradas sem saldo vem do banco e sao relidas a cada minuto.
 */

import { useEffect, useState } from 'react';
import { localDb } from '../db/localDb';
import type { Profile } from '../types';
import { canAccessPage } from './pages';
import { podeAprovar } from './solicitacoesCentral';
import { listarRetiradasSemSaldo } from './solicitacaoExtraApi';
import { podeDarBaixaRetirada } from './retiradaSemSaldoBaixa';
import { setoresDeAprovacao } from '../components/aprovacoes/RetiradasSemSaldoPainel';

const INTERVALO_MS = 60_000;

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

  const ehAprovador = user.roles.includes('admin') || (user.aprovador_setores?.length ?? 0) > 0;
  const ehAlmox = podeDarBaixaRetirada(user);

  useEffect(() => {
    const atualizar = () => setCompras(contarComprasPendentes(user));
    atualizar();
    return localDb.subscribe(atualizar);
  }, [user]);

  useEffect(() => {
    let ativo = true;
    const carregar = () => {
      if (ehAprovador) {
        listarRetiradasSemSaldo({ aprovacao: 'PENDENTE', setores: setoresDeAprovacao(user) })
          .then((l) => { if (ativo) setAprovacaoRetirada(l.length); })
          .catch(() => { /* sem a contagem o menu segue sem a bolinha */ });
      }
      if (ehAlmox) {
        listarRetiradasSemSaldo({ status: 'PENDENTE' })
          .then((l) => { if (ativo) setBaixaRetirada(l.length); })
          .catch(() => { /* idem */ });
      }
    };
    carregar();
    const timer = window.setInterval(carregar, INTERVALO_MS);
    return () => { ativo = false; window.clearInterval(timer); };
  }, [user, ehAprovador, ehAlmox]);

  const aprovacoes = canAccessPage(user, 'sol_aprovacoes') ? compras + aprovacaoRetirada : 0;
  const pendencias = canAccessPage(user, 'geral_pendencias') ? aprovacaoRetirada + baixaRetirada : 0;

  return { sol_aprovacoes: aprovacoes, geral_pendencias: pendencias };
}

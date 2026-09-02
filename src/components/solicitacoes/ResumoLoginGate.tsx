/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Decide se o resumo de login aparece — e monta o conteúdo dele.
 *
 * Fica separado do modal porque o momento certo de abrir não é o do primeiro
 * render: a sessão começa com o cache local possivelmente vazio e a primeira
 * sincronização com o Supabase chega depois. Abrir na montagem mostraria "nada
 * de novo" para quem tem cinco pendências. Por isso este componente escuta o
 * `localDb.subscribe` e reavalia até ter o que dizer, desistindo em silêncio se
 * nada aparecer.
 *
 * O carimbo de "última visita" só é atualizado quando o usuário abre a Central
 * (ver `registrarVisita`), então o resumo continua comparando contra a última
 * vez que a pessoa realmente olhou a lista, não contra o último login.
 */

import { useEffect, useState } from 'react';
import { localDb } from '../../db/localDb';
import { Profile } from '../../types';
import { rotuloStatus } from '../../lib/solicitacoes';
import {
  ResumoUsuario, indexarEventos, lerEstadoLeitura, montarResumo,
  resumoTemConteudo, universoVisivel,
} from '../../lib/solicitacoesCentral';
import ResumoLoginModal, { marcarResumoVisto, resumoJaVistoHoje } from './ResumoLoginModal';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

function calcular(user: Profile): ResumoUsuario {
  const estado = lerEstadoLeitura(user.id);
  const universo = universoVisivel(localDb.getRequests(), user);
  const eventos = indexarEventos(localDb.getAllRequestComments(), localDb.getAllRequestHistory());
  const naoLidas = localDb.getNotifications(user.id).filter(n => !n.is_read).length;

  return montarResumo(universo, user, estado, eventos, naoLidas, rotuloStatus);
}

export default function ResumoLoginGate({ user, onNavigate }: Props) {
  const [resumo, setResumo] = useState<ResumoUsuario | null>(null);

  useEffect(() => {
    if (resumoJaVistoHoje(user.id)) return;

    const avaliar = () => {
      // `resumoJaVistoHoje` é relido a cada disparo: se o usuário já fechou o
      // modal nesta sessão, um sync posterior não deve reabri-lo.
      if (resumoJaVistoHoje(user.id)) return;

      const proximo = calcular(user);
      if (resumoTemConteudo(proximo)) {
        setResumo(proximo);
        marcarResumoVisto(user.id);
      }
    };

    avaliar();
    return localDb.subscribe(avaliar);
  }, [user.id]);

  if (!resumo) return null;

  return (
    <ResumoLoginModal
      user={user}
      resumo={resumo}
      onNavigate={onNavigate}
      onClose={() => setResumo(null)}
    />
  );
}

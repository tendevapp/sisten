/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carga única das abas por tramo: estado atual, situações, metas e prazos.
 */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../../ui/Toast';
import { listarMetasMarco, listarPrazosMarco, listarSituacoes, listarTramosAtuais } from '../../../../lib/producaoTramosApi';
import type { MetaMarco, PrazoMarco, SituacaoTramo, TramoAtual } from '../../../../lib/producaoTramos';

export interface DadosTramos {
  tramos: TramoAtual[];
  situacoes: SituacaoTramo[];
  metas: MetaMarco[];
  prazos: PrazoMarco[];
}

export function useDadosTramos() {
  const toast = useToast();
  const [dados, setDados] = useState<DadosTramos | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [tramos, situacoes, metas, prazos] = await Promise.all([listarTramosAtuais(), listarSituacoes(), listarMetasMarco(), listarPrazosMarco()]);
      setDados({ tramos, situacoes, metas, prazos });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível carregar os tramos.');
    } finally {
      setCarregando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { dados, carregando, recarregar: carregar };
}

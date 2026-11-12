/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Liga o reporter do Monitor de Desempenho (lib/desempenho/reporterDesempenho.ts)
 * enquanto houver usuário logado. Não desenha nada; montado uma vez no App,
 * ao lado do `ReporterSincronizacao`. Trocar de usuário reinicia o reporter.
 */

import { useEffect } from 'react';
import { iniciarReporterDesempenho } from '../../lib/desempenho/reporterDesempenho';

export default function ReporterDesempenho({ usuarioId }: { usuarioId: string }) {
  useEffect(() => iniciarReporterDesempenho(), [usuarioId]);
  return null;
}

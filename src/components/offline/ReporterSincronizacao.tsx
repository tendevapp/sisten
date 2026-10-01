/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Liga o reporter da Central de Sincronização (lib/offline/reporterSincronizacao.ts)
 * enquanto houver usuário logado. Não desenha nada; montado uma vez no App,
 * ao lado de `FilaOfflineFormularios`.
 */

import { useEffect } from 'react';
import { iniciarReporterSincronizacao } from '../../lib/offline/reporterSincronizacao';

interface Props {
  usuarioId: string;
  usuarioNome: string;
}

export default function ReporterSincronizacao({ usuarioId, usuarioNome }: Props) {
  useEffect(() => iniciarReporterSincronizacao({ id: usuarioId, name: usuarioNome }), [usuarioId, usuarioNome]);
  return null;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aviso na tela de login: registros feitos sem rede que ainda estão neste
 * aparelho. A fila é por usuário — só sobe quando quem gravou entra de novo —
 * então o aviso diz de quem é, para não ficar nada esquecido no aparelho.
 */

import { useEffect, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { listarOperacoes } from '../../lib/offline/filaSupabase';
import { pendenciasPorUsuario, type PendenciaUsuario } from '../../lib/offline/planoEnvio';

export default function AvisoPendenciasAparelho() {
  const [pendencias, setPendencias] = useState<PendenciaUsuario[]>([]);

  useEffect(() => {
    let ativo = true;
    listarOperacoes()
      .then(ops => { if (ativo) setPendencias(pendenciasPorUsuario(ops)); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  if (!pendencias.length) return null;
  const total = pendencias.reduce((s, p) => s + p.total, 0);

  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <CloudUpload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-bold">
          {total === 1 ? '1 registro feito sem rede ainda está' : `${total} registros feitos sem rede ainda estão`} neste aparelho
        </p>
        <ul className="space-y-0.5">
          {pendencias.map(p => (
            <li key={p.usuarioId}>
              {p.nome || 'Usuário anterior'}: {p.total} {p.total === 1 ? 'registro' : 'registros'}
              {p.comErro > 0 && ` (${p.comErro} recusado${p.comErro === 1 ? '' : 's'} pelo servidor)`}
            </li>
          ))}
        </ul>
        <p>Eles sobem sozinhos quando essa pessoa entrar neste aparelho com rede.</p>
      </div>
    </div>
  );
}

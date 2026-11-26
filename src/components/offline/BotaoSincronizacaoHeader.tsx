/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Botão do cabeçalho: abre a fila de sincronização do próprio usuário (o
 * mesmo painel do selo do canto) para ver o que está no aparelho e mandar
 * sincronizar na hora. Fica sempre à mão — o selo só aparece com fila ou sem
 * rede. O número é o que ainda não subiu; vermelho quando o servidor recusou algo.
 */

import { useEffect, useState } from 'react';
import { CloudUpload, Loader2 } from 'lucide-react';
import {
  EVENTO_ABRIR_SINCRONIZACAO, assinarFilaOffline, listarOperacoes, sincronizandoFila,
} from '../../lib/offline/filaSupabase';

export default function BotaoSincronizacaoHeader({ usuarioId }: { usuarioId: string }) {
  const [total, setTotal] = useState(0);
  const [comErro, setComErro] = useState(0);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    const ler = () => {
      listarOperacoes(usuarioId)
        .then(ops => {
          if (!ativo) return;
          setTotal(ops.length);
          setComErro(ops.filter(op => op.estado === 'erro').length);
          setEnviando(sincronizandoFila());
        })
        .catch(() => {});
    };
    ler();
    const cancelar = assinarFilaOffline(ler);
    return () => { ativo = false; cancelar(); };
  }, [usuarioId]);

  const rotulo = total === 0
    ? 'Sincronização: nada pendente neste aparelho'
    : `Sincronização: ${total === 1 ? '1 registro' : `${total} registros`} no aparelho${comErro ? `, ${comErro} recusado${comErro === 1 ? '' : 's'}` : ''}`;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_SINCRONIZACAO))}
      aria-label={rotulo}
      title={rotulo}
      className="relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      {enviando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CloudUpload className="h-5 w-5" aria-hidden="true" />}
      {total > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${comErro ? 'bg-red-600' : 'bg-amber-500'}`}
        >
          {total > 99 ? '99+' : total}
        </span>
      )}
    </button>
  );
}

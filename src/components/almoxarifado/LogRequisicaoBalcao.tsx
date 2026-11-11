/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log de alterações de uma Requisição no Balcão (`alm_req_balcao_alteracoes`):
 * criação, edição, exportação, reabertura, importação do doc. SAP… Usado no
 * detalhe da requisição e no Relatório × MB51.
 */

import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { formatDateTimeBR } from '../../lib/format';
import { listarAlteracoesBalcao, type ReqBalcaoAlteracao } from '../../lib/requisicaoBalcaoApi';
import { ROTULO_ACAO_LOG } from '../../lib/logRequisicaoBalcao';

/** Log de alterações da requisição — carregado ao abrir o detalhe. */
export default function LogAlteracoes({ requisicaoId }: { requisicaoId: string }) {
  const [log, setLog] = useState<ReqBalcaoAlteracao[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    listarAlteracoesBalcao(requisicaoId)
      .then((l) => { if (vivo) setLog(l); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Falha ao carregar o log.'); });
    return () => { vivo = false; };
  }, [requisicaoId]);

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
        <History className="h-3.5 w-3.5" /> Log de alterações
      </h3>
      {erro ? (
        <p className="text-[11px]" style={{ color: 'var(--status-critical)' }}>{erro}</p>
      ) : log === null ? (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando…</p>
      ) : log.length === 0 ? (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Nenhum registro (requisição anterior ao log).</p>
      ) : (
        <ol className="space-y-2">
          {log.map((a) => (
            <li key={a.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
                <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {ROTULO_ACAO_LOG[a.acao] ?? a.acao}{a.resumo && <span className="font-medium" style={{ color: 'var(--ink-secondary)' }}> · {a.resumo}</span>}
                </span>
                <span style={{ color: 'var(--ink-muted)' }}>{a.alterado_por_nome ?? '—'} · {formatDateTimeBR(a.created_at)}</span>
              </div>
              {a.alteracoes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {a.alteracoes.map((d, k) => (
                    <li key={k}>
                      <span className="font-semibold">{d.campo}:</span>{' '}
                      <span className="line-through" style={{ color: 'var(--ink-muted)' }}>{d.de ?? '—'}</span>
                      {' → '}<span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{d.para ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}


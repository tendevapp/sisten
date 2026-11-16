/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etapa 1 da importação da planilha concluída da Requisição no Balcão: a MB51.
 *
 * A planilha volta com doc. e "Concluído" também em linha que o SAP não lançou
 * (ex.: 4904102226 sem o arame 1047385). Só a MB51 mostra isso, então antes de
 * gravar a tela diz quando a MB51 foi importada, até que data ela vai e quais
 * documentos desta planilha ela ainda não tem — e deixa importar a MB51 ali
 * mesmo, para quem tem acesso.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { formatDateBR, formatDateTimeBR } from '../../../lib/format';
import { localDb } from '../../../db/localDb';
import PlanilhaSapUploadButton from '../PlanilhaSapUploadButton';
import { avaliarMb51ParaPlanilha, type AvisoMb51, type UltimaImportacaoMb51 } from '../../../lib/requisicaoBalcaoAuditoria';
import { documentosNaMb51, ultimaImportacaoMb51 } from '../../../lib/requisicaoBalcaoAuditoriaApi';

interface Props {
  /** Documentos SAP distintos da planilha. */
  docs: string[];
  podeImportarMb51: boolean;
  /** Avisa o pai da avaliação (null enquanto carrega), para o rótulo do botão de seguir. */
  onAviso: (aviso: AvisoMb51 | null) => void;
}

function tempoDesde(horas: number): string {
  if (horas < 1) return 'há menos de 1 hora';
  if (horas < 48) return `há ${Math.round(horas)} h`;
  return `há ${Math.floor(horas / 24)} dias`;
}

export const ESTILO_BOTAO_MB51 =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer disabled:opacity-50 bg-[var(--brand)] hover:opacity-90';

export default function AvisoMb51Importacao({ docs, podeImportarMb51, onAviso }: Props) {
  const [ultima, setUltima] = useState<UltimaImportacaoMb51 | null>(null);
  const [aviso, setAviso] = useState<AvisoMb51 | null>(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setErro('');
    setAviso(null);
    onAviso(null);
    try {
      const [u, presentes] = await Promise.all([ultimaImportacaoMb51(), documentosNaMb51(docs)]);
      const a = avaliarMb51ParaPlanilha(docs, presentes, u);
      setUltima(u);
      setAviso(a);
      onAviso(a);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível ler a MB51.');
      // Sem a leitura, segue como desatualizada: o usuário confirma antes de gravar.
      const a = avaliarMb51ParaPlanilha(docs, [], { importadaEm: null });
      onAviso(a);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.join('|'), versao]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="space-y-3">
      <div
        className="flex gap-2 rounded-xl border px-3 py-2.5 text-xs"
        style={{ borderColor: 'var(--status-serious)', background: 'color-mix(in srgb, var(--status-serious) 8%, transparent)', color: 'var(--ink-primary)' }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--status-serious)' }} />
        <div className="space-y-1">
          <p className="font-bold">Importe a MB51 antes de importar a planilha.</p>
          <p style={{ color: 'var(--ink-secondary)' }}>
            A planilha volta com documento e "Concluído" também em linha que o SAP não lançou. Depois de gravar, cada documento é
            conferido com a MB51 e as divergências aparecem aqui para correção — com a MB51 desatualizada, os documentos novos
            ficam sem conferência.
          </p>
        </div>
      </div>

      {erro && <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>}

      {!aviso && !erro ? (
        <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a MB51…
        </p>
      ) : aviso && ultima && (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
            <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Última importação da MB51</dt>
            <dd className="mt-0.5 font-bold" style={{ color: 'var(--ink-primary)' }}>
              {ultima.importadaEm
                ? <>{formatDateTimeBR(ultima.importadaEm)} <span className="font-normal" style={{ color: 'var(--ink-secondary)' }}>({tempoDesde(aviso.horasDesdeImportacao ?? 0)})</span></>
                : 'Nunca importada'}
            </dd>
            {ultima.importadaEm && (
              <dd className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                {ultima.por || '—'}{ultima.arquivo && <> · {ultima.arquivo}</>}
                {ultima.lancamentosAte && <> · lançamentos até {formatDateBR(ultima.lancamentosAte)}</>}
              </dd>
            )}
          </div>
          <div
            className="rounded-lg border p-2.5"
            style={{ borderColor: aviso.faltando.length ? 'var(--status-critical)' : 'var(--status-good)' }}
          >
            <dt className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Documentos desta planilha</dt>
            {aviso.docs.length === 0 ? (
              <dd className="mt-0.5" style={{ color: 'var(--ink-secondary)' }}>Nenhum documento SAP na planilha.</dd>
            ) : aviso.faltando.length === 0 ? (
              <dd className="mt-0.5 flex items-center gap-1.5 font-bold" style={{ color: 'var(--status-good)' }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Os {aviso.docs.length} já estão na MB51
              </dd>
            ) : (
              <>
                <dd className="mt-0.5 font-bold" style={{ color: 'var(--status-critical)' }}>
                  {aviso.faltando.length} de {aviso.docs.length} ainda não estão na MB51
                </dd>
                <dd className="font-mono text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {aviso.faltando.slice(0, 12).join(', ')}{aviso.faltando.length > 12 && ` +${aviso.faltando.length - 12}`}
                </dd>
              </>
            )}
          </div>
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {podeImportarMb51 ? (
          <PlanilhaSapUploadButton
            sigla="MB51"
            descricao="Movimentações de Estoque — importa apenas os registros novos"
            importar={(rawRows, filename, onProgress) => localDb.importMB51Raw(rawRows, filename, 'upsert', onProgress)}
            onImportado={() => setVersao((v) => v + 1)}
            className={ESTILO_BOTAO_MB51}
          />
        ) : (
          <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
            Você não tem acesso à importação da MB51 — peça a quem importa (Almoxarifado › Movimentações) antes de seguir.
          </p>
        )}
        <button
          type="button"
          onClick={() => setVersao((v) => v + 1)}
          className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Verificar de novo
        </button>
      </div>
    </div>
  );
}

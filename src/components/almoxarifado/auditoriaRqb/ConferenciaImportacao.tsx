/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etapa 3 da importação da planilha concluída: depois de gravar, confere cada
 * documento × material da planilha com a MB51 (RPC `alm_rqb_divergencias_doc`
 * com `p_docs` e `p_todas`) e mostra o que falta para correção. A soma é de
 * todas as RQBs que apontam para o documento, não só as desta planilha.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from 'lucide-react';
import { formatBRL } from '../../../lib/format';
import { localDb } from '../../../db/localDb';
import PlanilhaSapUploadButton from '../PlanilhaSapUploadButton';
import { ListaDivergenciasDoc } from './DivergenciasDocumento';
import {
  resumirConferenciaImportacao, type LinhaDivergenciaDoc,
} from '../../../lib/requisicaoBalcaoAuditoria';
import { listarDivergenciasDoc } from '../../../lib/requisicaoBalcaoAuditoriaApi';

const ESTILO_BOTAO_MB51 =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer disabled:opacity-50 bg-[var(--brand)] hover:opacity-90';

interface Props {
  docs: string[];
  podeImportarMb51: boolean;
  onAbrirRequisicao: (requisicaoId: string, codigo: string) => void;
}

export default function ConferenciaImportacao({ docs, podeImportarMb51, onAbrirRequisicao }: Props) {
  const [linhas, setLinhas] = useState<LinhaDivergenciaDoc[] | null>(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setErro('');
    setLinhas(null);
    if (docs.length === 0) { setLinhas([]); return; }
    try {
      setLinhas(await listarDivergenciasDoc({ base: 'exportacao', docs, todas: true }));
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível conferir com a MB51.');
      setLinhas([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.join('|'), versao]);

  useEffect(() => { void carregar(); }, [carregar]);

  const r = linhas ? resumirConferenciaImportacao(linhas) : null;

  return (
    <div className="space-y-3">
      {linhas === null ? (
        <p className="flex items-center gap-2 py-6 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo os {docs.length} documento(s) com a MB51…
        </p>
      ) : erro ? (
        <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>
      ) : r && (
        <div className="space-y-2">
          {r.faltas === 0 && r.pendentes === 0 ? (
            <Faixa cor="var(--status-good)" icone={<CheckCircle2 className="h-4 w-4" />}>
              <strong>Tudo lá.</strong> {r.ok} documento × material conferido(s): a MB51 tem cada material na quantidade das RQBs.
              {r.aMais > 0 && <> {r.aMais} documento(s) com quantidade a mais (outra baixa no mesmo documento).</>}
            </Faixa>
          ) : null}
          {r.faltas > 0 && (
            <Faixa cor="var(--status-critical)" icone={<AlertTriangle className="h-4 w-4" />}>
              <strong>{r.faltas} documento × material com baixa faltando</strong> (~{formatBRL(r.valorFalta)}) em{' '}
              {r.requisicoesComFalta.length} requisição(ões). A planilha marcou "Concluído", mas a MB51 não tem o lançamento.
              <span className="mt-1 block" style={{ color: 'var(--ink-secondary)' }}>
                Para corrigir: lance no SAP o que falta e informe o novo documento na requisição. Não reabra a requisição inteira
                se outros itens dela já foram baixados — sairia em dobro. Confira antes os lançamentos avulsos próximos: podem ser
                a correção já feita.
              </span>
            </Faixa>
          )}
          {r.pendentes > 0 && (
            <Faixa cor="var(--ink-muted)" icone={<Clock className="h-4 w-4" />}>
              <strong>{r.pendentes} ainda sem conferência:</strong> o documento é mais novo que a MB51 importada. Importe a MB51 e
              clique em "Conferir de novo" — ou confira depois no Relatório × MB51.
            </Faixa>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
              {r.pares} documento × material · {r.ok} confere · {r.faltas} faltando · {r.pendentes} sem MB51
            </span>
            <button
              type="button"
              onClick={() => setVersao((v) => v + 1)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Conferir de novo
            </button>
            {r.pendentes > 0 && podeImportarMb51 && (
              <PlanilhaSapUploadButton
                sigla="MB51"
                descricao="Movimentações de Estoque — importa apenas os registros novos"
                importar={(rawRows, filename, onProgress) => localDb.importMB51Raw(rawRows, filename, 'upsert', onProgress)}
                onImportado={() => setVersao((v) => v + 1)}
                className={ESTILO_BOTAO_MB51}
              />
            )}
          </div>
        </div>
      )}

      {linhas && linhas.length > 0 && (
        <ListaDivergenciasDoc
          linhas={linhas}
          busca=""
          compacto
          arquivoExcel="conferencia_importacao_rqb_x_mb51.xlsx"
          onAbrirRequisicao={onAbrirRequisicao}
          podeAbrir={() => true}
        />
      )}
    </div>
  );
}

function Faixa({ cor, icone, children }: { cor: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex gap-2 rounded-xl border px-3 py-2.5 text-xs"
      style={{ borderColor: cor, background: `color-mix(in srgb, ${cor} 8%, transparent)`, color: 'var(--ink-primary)' }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: cor }}>{icone}</span>
      <div>{children}</div>
    </div>
  );
}

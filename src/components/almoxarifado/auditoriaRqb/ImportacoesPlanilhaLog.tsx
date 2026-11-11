/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log › Importações: cada importação da planilha concluída — quem, quando,
 * quantas linhas a planilha tinha, quantas gravaram doc. SAP, quantas já
 * estavam iguais, não encontradas ou sem doc. — e, aberta, linha a linha com
 * o lote de exportação de cada RQB.
 */

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { formatDateTimeBR } from '../../../lib/format';
import {
  listarImportacoesBalcao, type ImportacaoBalcao, type LinhaImportacaoLog, type ResultadoLinhaImportacao,
} from '../../../lib/requisicaoBalcaoApi';
import { ROTULO_RESULTADO_IMPORTACAO, filtrarImportacoes, linhasDaImportacao } from '../../../lib/logRequisicaoBalcao';

const COR_RESULTADO: Record<ResultadoLinhaImportacao, string> = {
  gravado: 'var(--status-good)',
  igual: 'var(--ink-muted)',
  nao_encontrado: 'var(--status-critical)',
  sem_doc: 'var(--status-serious)',
  fora_da_gravacao: 'var(--ink-muted)',
};

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <span className="whitespace-nowrap text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
      {rotulo} <strong className="tabular" style={{ color: valor > 0 && cor ? cor : 'var(--ink-primary)' }}>{valor}</strong>
    </span>
  );
}

interface Props {
  de: string;
  ate: string;
  busca: string;
  versao: number;
  onAbrirCodigo: (codigo: string) => void;
  podeAbrirCodigo: (codigo: string) => boolean;
}

export default function ImportacoesPlanilhaLog({ de, ate, busca, versao, onAbrirCodigo, podeAbrirCodigo }: Props) {
  const toast = useToast();
  const [imps, setImps] = useState<ImportacaoBalcao[] | null>(null);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro('');
    setImps(null);
    listarImportacoesBalcao(de, ate)
      .then((l) => { if (vivo) setImps(l); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível carregar as importações.'); });
    return () => { vivo = false; };
  }, [de, ate, versao]);

  const filtradas = useMemo(() => filtrarImportacoes(imps ?? [], busca), [imps, busca]);

  const exportarXlsx = () => {
    const dados = filtradas.flatMap((i) => linhasDaImportacao(i, busca).map((l) => ({
      'Importada em': formatDateTimeBR(i.created_at),
      'Usuário': i.importado_por_nome ?? '',
      Arquivo: i.arquivo ?? '',
      RQB: l.codigo,
      Material: l.material,
      'Doc. SAP': l.doc_sap ?? '',
      'Doc. anterior': l.doc_anterior ?? '',
      Resultado: ROTULO_RESULTADO_IMPORTACAO[l.resultado] ?? l.resultado,
      Motivo: l.motivo ?? '',
      'Lote de exportação': l.lote ?? '',
      'Reconstruída do log antigo': i.reconstruida ? 'Sim' : '',
    })));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Importacoes');
    XLSX.writeFile(wb, `importacoes_planilha_concluida_${de || 'inicio'}_${ate || 'hoje'}.xlsx`);
    toast.success(`${dados.length} linha(s) exportada(s).`);
  };

  if (erro) return <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>;
  if (!imps) {
    return (
      <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando as importações…
      </p>
    );
  }

  const linhaRqb = (l: LinhaImportacaoLog) => (
    podeAbrirCodigo(l.codigo) ? (
      <button
        type="button"
        onClick={() => onAbrirCodigo(l.codigo)}
        className="cursor-pointer font-mono font-bold underline decoration-dotted underline-offset-2"
        style={{ color: 'var(--brand)' }}
        aria-label={`Abrir a requisição ${l.codigo}`}
      >
        {l.codigo}
      </button>
    ) : (
      <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.codigo}</span>
    )
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {filtradas.length} importação(ões). As anteriores a hoje foram montadas a partir do log antigo e só mostram as linhas que
          gravaram doc. SAP. Daqui em diante entra a planilha inteira, inclusive linhas sem doc. e não encontradas.
        </p>
        <button
          type="button"
          onClick={exportarXlsx}
          disabled={filtradas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-40"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <Download className="h-3.5 w-3.5" /> Excel
        </button>
      </div>

      {filtradas.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhuma importação no período com essa busca.</p>
      )}

      {filtradas.map((i) => {
        const abertaAqui = aberta === i.id;
        const linhas = abertaAqui ? linhasDaImportacao(i, busca) : [];
        return (
          <div key={i.id} className="rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <button
              type="button"
              onClick={() => setAberta(abertaAqui ? null : i.id)}
              aria-expanded={abertaAqui}
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left"
            >
              {abertaAqui
                ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} />
                : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <strong className="tabular" style={{ color: 'var(--ink-primary)' }}>{formatDateTimeBR(i.created_at)}</strong>
                  <span style={{ color: 'var(--ink-secondary)' }}>{i.importado_por_nome ?? '—'}</span>
                  <span className="truncate" style={{ color: 'var(--ink-muted)' }}>{i.arquivo ?? '—'}</span>
                  {i.reconstruida && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: 'var(--ink-muted)', background: 'var(--surface)' }}>
                      do log antigo
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {!i.reconstruida && <Numero rotulo="Linhas na planilha" valor={i.total_linhas} />}
                  <Numero rotulo="Gravadas" valor={i.gravados} cor="var(--status-good)" />
                  {!i.reconstruida && <Numero rotulo="Já iguais" valor={i.iguais} />}
                  {!i.reconstruida && <Numero rotulo="Não encontradas" valor={i.nao_encontrados} cor="var(--status-critical)" />}
                  {!i.reconstruida && <Numero rotulo="Sem doc. SAP" valor={i.sem_doc_sap} cor="var(--status-serious)" />}
                  {!i.reconstruida && i.sem_codigo > 0 && <Numero rotulo="Sem RQB" valor={i.sem_codigo} cor="var(--status-serious)" />}
                  <Numero rotulo="RQBs" valor={i.requisicoes} />
                </div>
                {(i.lotes?.length ?? 0) > 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Lotes: <span className="font-mono">{i.lotes.join(', ')}</span>
                  </div>
                )}
                {(i.docs?.length ?? 0) > 0 && (
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Docs SAP: <span className="font-mono">{i.docs.join(', ')}</span>
                  </div>
                )}
              </div>
            </button>
            {abertaAqui && (
              <div className="border-t px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                {linhas.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Sem linhas registradas.</p>
                ) : (
                  <ul className="divide-y text-[11px]" style={{ borderColor: 'var(--hairline)' }}>
                    {linhas.map((l, k) => (
                      <li key={k} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1" style={{ borderColor: 'var(--hairline)' }}>
                        <span className="w-28 shrink-0">{linhaRqb(l)}</span>
                        <span className="w-20 shrink-0 font-mono" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                        <span className="w-24 shrink-0 font-mono" style={{ color: 'var(--ink-secondary)' }}>
                          {l.doc_anterior && <span className="mr-1 line-through" style={{ color: 'var(--ink-muted)' }}>{l.doc_anterior}</span>}
                          {l.doc_sap || '—'}
                        </span>
                        <span className="font-bold" style={{ color: COR_RESULTADO[l.resultado] ?? 'var(--ink-muted)' }}>
                          {ROTULO_RESULTADO_IMPORTACAO[l.resultado] ?? l.resultado}
                        </span>
                        {l.motivo && <span style={{ color: 'var(--ink-muted)' }}>{l.motivo}</span>}
                        {l.lote && <span className="font-mono" style={{ color: 'var(--ink-muted)' }}>{l.lote}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

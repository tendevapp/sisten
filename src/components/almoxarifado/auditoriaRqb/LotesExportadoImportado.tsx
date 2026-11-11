/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Log › Exportado × importado: por lote exportado, quantos itens voltaram
 * com doc. SAP da planilha concluída, quantos não, quantas importações o
 * tocaram e quais documentos da MB51 do dia (e do seguinte) não estão
 * vinculados a nenhuma RQB mas têm material de item pendente do lote — o
 * doc. que provavelmente faltou importar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../../lib/format';
import { listarLotesImportacaoBalcao, type LoteImportacaoBalcao } from '../../../lib/requisicaoBalcaoApi';
import { filtrarLotes } from '../../../lib/logRequisicaoBalcao';

interface Props {
  de: string;
  ate: string;
  busca: string;
  versao: number;
  onAbrirRequisicao: (requisicaoId: string) => void;
  podeAbrir: (requisicaoId: string) => boolean;
}

export default function LotesExportadoImportado({ de, ate, busca, versao, onAbrirRequisicao, podeAbrir }: Props) {
  const toast = useToast();
  const [lotes, setLotes] = useState<LoteImportacaoBalcao[] | null>(null);
  const [erro, setErro] = useState('');
  const [soPendentes, setSoPendentes] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro('');
    setLotes(null);
    listarLotesImportacaoBalcao(de, ate)
      .then((l) => { if (vivo) setLotes(l); })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível carregar os lotes.'); });
    return () => { vivo = false; };
  }, [de, ate, versao]);

  const filtrados = useMemo(() => filtrarLotes(lotes ?? [], { busca, soPendentes }), [lotes, busca, soPendentes]);
  const totais = useMemo(() => {
    const t = { lotes: 0, itens: 0, semDoc: 0, nuncaImportados: 0 };
    for (const l of lotes ?? []) {
      t.lotes += 1;
      t.itens += l.itens_vigentes;
      t.semDoc += l.itens_sem_doc;
      if (l.itens_vigentes > 0 && l.itens_com_doc === 0) t.nuncaImportados += 1;
    }
    return t;
  }, [lotes]);

  const exportarXlsx = () => {
    const dados = filtrados.flatMap((l): Record<string, string | number>[] => {
      const sugestao = l.mb51_sem_vinculo.map((m) => `${m.doc} (${m.tipo}, ${formatDateBR(m.data)}, ${m.materiais_pendentes} mat.)`).join(' | ');
      const base = {
        Lote: l.arquivo,
        'Exportado em': formatDateTimeBR(l.exportada_em),
        'Exportado por': l.exportado_por ?? '',
        'Itens no lote': l.itens_vigentes,
        'Com doc. SAP': l.itens_com_doc,
        'Sem doc. SAP': l.itens_sem_doc,
        'Importações': l.importacoes,
        'Última importação': l.ultima_importacao_em ? formatDateTimeBR(l.ultima_importacao_em) : '',
        'MB51 sem vínculo': sugestao,
      };
      if (l.pendentes.length === 0) return [{ ...base, RQB: '', Material: '', 'Descrição': '', Quantidade: '', 'Depósito': '', Tipo: '' }];
      return l.pendentes.map((p) => ({
        ...base, RQB: p.codigo, Material: p.material, 'Descrição': p.descricao ?? '', Quantidade: p.quantidade,
        'Depósito': p.deposito ?? '', Tipo: p.tipo,
      }));
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Exportado x importado');
    XLSX.writeFile(wb, `rqb_exportado_x_importado_${de || 'inicio'}_${ate || 'hoje'}.xlsx`);
    toast.success(`${dados.length} linha(s) exportada(s).`);
  };

  if (erro) return <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>;
  if (!lotes) {
    return (
      <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando os lotes…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          {totais.lotes} lote(s) exportado(s) no período · {totais.itens} item(ns) ·{' '}
          <strong style={{ color: totais.semDoc ? 'var(--status-critical)' : 'var(--ink-primary)' }}>{totais.semDoc} sem doc. SAP</strong>
          {totais.nuncaImportados > 0 && <> · <strong style={{ color: 'var(--status-critical)' }}>{totais.nuncaImportados} lote(s) sem nenhum doc.</strong></>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSoPendentes((v) => !v)}
            aria-pressed={soPendentes}
            className="rounded-full border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
            style={soPendentes
              ? { borderColor: 'var(--brand)', background: 'var(--brand)', color: 'white' }
              : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            Só lotes com item sem doc.
          </button>
          <button
            type="button"
            onClick={exportarXlsx}
            disabled={filtrados.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>

      {filtrados.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {soPendentes ? 'Todos os lotes do período voltaram com doc. SAP.' : 'Nenhum lote com essa busca.'}
        </p>
      )}

      {filtrados.map((l) => {
        const abertoAqui = aberto === l.exportacao_id;
        const nenhum = l.itens_vigentes > 0 && l.itens_com_doc === 0;
        const saiu = l.total_itens - l.itens_vigentes;
        const cor = l.itens_sem_doc === 0 ? 'var(--status-good)' : nenhum ? 'var(--status-critical)' : 'var(--status-serious)';
        return (
          <div
            key={l.exportacao_id}
            className="rounded-lg border"
            style={{ borderColor: 'var(--hairline)', boxShadow: l.itens_sem_doc > 0 ? `inset 3px 0 0 0 ${cor}` : undefined }}
          >
            <button
              type="button"
              onClick={() => setAberto(abertoAqui ? null : l.exportacao_id)}
              aria-expanded={abertoAqui}
              className="flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left"
            >
              {abertoAqui
                ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} />
                : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} />}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.arquivo}</span>
                  <span className="tabular" style={{ color: 'var(--ink-secondary)' }}>{formatDateTimeBR(l.exportada_em)}</span>
                  <span style={{ color: 'var(--ink-muted)' }}>{l.exportado_por ?? '—'}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  <span>Itens <strong className="tabular" style={{ color: 'var(--ink-primary)' }}>{l.itens_vigentes}</strong></span>
                  <span>Com doc. SAP <strong className="tabular" style={{ color: 'var(--ink-primary)' }}>{l.itens_com_doc}</strong></span>
                  <span>Sem doc. SAP <strong className="tabular" style={{ color: l.itens_sem_doc ? cor : 'var(--ink-primary)' }}>{l.itens_sem_doc}</strong></span>
                  <span>
                    Importações <strong className="tabular" style={{ color: l.importacoes ? 'var(--ink-primary)' : 'var(--status-critical)' }}>{l.importacoes}</strong>
                    {l.ultima_importacao_em && <> · última {formatDateTimeBR(l.ultima_importacao_em)}</>}
                  </span>
                  {saiu > 0 && <span style={{ color: 'var(--ink-muted)' }}>{saiu} item(ns) saíram do lote (reabertos/reexportados)</span>}
                </div>
                {nenhum && (
                  <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--status-critical)' }}>
                    <AlertTriangle className="h-3 w-3" />
                    {l.importacoes === 0 ? 'A planilha concluída deste lote nunca foi importada.' : 'Importado, mas nenhum item recebeu doc. SAP.'}
                  </div>
                )}
                {l.mb51_sem_vinculo.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    <span title="Documentos da MB51 do dia da exportação e do seguinte que nenhuma RQB tem como doc. SAP e que trazem material de item pendente deste lote">
                      MB51 sem vínculo:
                    </span>
                    {l.mb51_sem_vinculo.map((m) => (
                      <span
                        key={`${m.doc}-${m.data}`}
                        className="rounded px-1.5 py-0.5 font-mono"
                        style={{ background: 'color-mix(in srgb, var(--status-serious) 12%, transparent)', color: 'var(--ink-primary)' }}
                        title={`${m.linhas} linha(s) na MB51 · ${m.materiais_pendentes} material(is) pendente(s) do lote`}
                      >
                        {m.doc} · {m.tipo} · {formatDateBR(m.data)} · {m.materiais_pendentes} mat.
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
            {abertoAqui && (
              <div className="border-t px-3 py-2" style={{ borderColor: 'var(--hairline)' }}>
                {l.pendentes.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Todos os itens têm doc. SAP{l.docs_lote ? `: ${l.docs_lote}` : ''}.
                  </p>
                ) : (
                  <ul className="divide-y text-[11px]" style={{ borderColor: 'var(--hairline)' }}>
                    {l.pendentes.map((p) => (
                      <li key={`${p.requisicao_id}-${p.ordem}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1" style={{ borderColor: 'var(--hairline)' }}>
                        <span className="w-28 shrink-0">
                          {podeAbrir(p.requisicao_id) ? (
                            <button
                              type="button"
                              onClick={() => onAbrirRequisicao(p.requisicao_id)}
                              className="cursor-pointer font-mono font-bold underline decoration-dotted underline-offset-2"
                              style={{ color: 'var(--brand)' }}
                              aria-label={`Abrir a requisição ${p.codigo}`}
                            >
                              {p.codigo}
                            </button>
                          ) : (
                            <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{p.codigo}</span>
                          )}
                        </span>
                        <span className="w-20 shrink-0 font-mono" style={{ color: 'var(--ink-primary)' }}>{p.material}</span>
                        <span className="min-w-0 flex-1" style={{ color: 'var(--ink-secondary)' }}>{p.descricao}</span>
                        <span className="tabular font-semibold" style={{ color: 'var(--ink-primary)' }}>{formatQtd(p.quantidade)} {p.unidade}</span>
                        <span className="font-mono" style={{ color: 'var(--ink-muted)' }}>dep. {p.deposito ?? '—'}</span>
                        <span style={{ color: 'var(--ink-muted)' }}>{p.tipo === 'transferencia' ? 'Transferência' : 'Saída'}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {l.docs_lote && l.pendentes.length > 0 && (
                  <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>Docs já vinculados no lote: <span className="font-mono">{l.docs_lote}</span></p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

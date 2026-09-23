/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin → Exportar. Central de exportações em planilha.
 *
 * Primeira exportação: "Fornecedores × ZL0136 mês a mês" — a lista de
 * fornecedores do controle orçamentário do Financeiro (`fin_fornecedores_planilha`),
 * com os principais itens comprados de cada um e o valor de NF mês a mês desde
 * jan/26. A prévia mostra a qualidade do vínculo antes de baixar: linhas sem
 * código SAP e fornecedores com NF que não estão na lista.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Link2, Loader2, ListPlus, Receipt } from 'lucide-react';
import type { Profile } from '../../types';
import { formatBRL } from '../../lib/format';
import KpiCard from '../../components/charts/KpiCard';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableEmpty } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { carregarExportFornecedores, gerarXlsxFornecedores } from '../../lib/exportFornecedoresPlanilha';
import { ResultadoExportFornecedores, rotuloMes } from '../../lib/fornecedoresPlanilha';

interface Props {
  user: Profile;
}

export default function ExportarAdmin({ user: _user }: Props) {
  const toast = useToast();
  const [resultado, setResultado] = useState<ResultadoExportFornecedores | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForaDaLista, setMostrarForaDaLista] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarExportFornecedores()
      .then(res => { if (ativo) setResultado(res); })
      .catch(err => {
        if (!ativo) return;
        console.error('[ExportarAdmin] Erro ao carregar exportação de fornecedores:', err);
        setErro(err?.message || 'Erro ao carregar os dados da exportação.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const resumo = useMemo(() => {
    if (!resultado) return null;
    const fornecedores = resultado.linhas.filter(l => l.situacao !== 'lancamento_sem_nf');
    return {
      fornecedores: fornecedores.length,
      vinculados: fornecedores.filter(l => l.situacao !== 'sem_vinculo').length,
      semVinculo: fornecedores.filter(l => l.situacao === 'sem_vinculo'),
      semNf: fornecedores.filter(l => l.situacao === 'sem_nf_2026').length,
      totalForaDaLista: resultado.foraDaLista.reduce((s, f) => s + f.total, 0),
    };
  }, [resultado]);

  const handleExportar = () => {
    if (!resultado) return;
    try {
      gerarXlsxFornecedores(resultado);
    } catch (err: any) {
      console.error('[ExportarAdmin] Erro ao gerar planilha:', err);
      toast.error(err?.message || 'Erro ao gerar a planilha.');
    }
  };

  const periodo = resultado && resultado.meses.length > 0
    ? `${rotuloMes(resultado.meses[0])} a ${rotuloMes(resultado.meses[resultado.meses.length - 1])}`
    : '';

  return (
    <div className="space-y-6 select-text max-w-[1100px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <FileSpreadsheet className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Exportar
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">Planilhas geradas a partir dos dados do SAP carregados no SISTEN.</p>
      </div>

      <section className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="max-w-[680px]">
            <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Fornecedores × ZL0136 mês a mês</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-secondary)' }}>
              A lista de fornecedores do controle orçamentário, na ordem e nas seções da planilha do Financeiro, com os
              principais itens comprados de cada um (para identificar o que é) e o valor das notas fiscais mês a mês
              {periodo ? ` (${periodo})` : ' desde jan/26'}. Remessa, retorno e ativo ficam numa coluna à parte.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportar}
            disabled={carregando || !resultado}
            className="px-4 h-9 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-60 shrink-0"
            style={{ background: 'var(--brand)' }}
          >
            {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar planilha
          </button>
        </div>

        {erro ? (
          <TableEmpty icon={AlertTriangle} title="Não foi possível carregar a exportação" hint={erro} />
        ) : carregando || !resultado || !resumo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                label="Fornecedores vinculados ao SAP"
                display={`${resumo.vinculados} de ${resumo.fornecedores}`}
                share={resumo.fornecedores ? resumo.vinculados / resumo.fornecedores : 0}
                detail={`${resumo.semNf} sem NF em 2026`}
                icon={Link2}
              />
              <KpiCard
                label="Total da lista (NF)"
                value={resultado.totalListaSemDuplicidade}
                format={formatBRL}
                share={resultado.totalRealizadoGeral ? resultado.totalListaSemDuplicidade / resultado.totalRealizadoGeral : 0}
                detail="Fornecedor repetido contado uma vez"
                icon={Receipt}
              />
              <KpiCard
                label="Com NF e fora da lista"
                value={resumo.totalForaDaLista}
                format={formatBRL}
                share={resultado.totalRealizadoGeral ? resumo.totalForaDaLista / resultado.totalRealizadoGeral : 0}
                detail={`${resultado.foraDaLista.length} fornecedores · clique para ver`}
                icon={ListPlus}
                accent="var(--status-warning)"
                onClick={() => setMostrarForaDaLista(v => !v)}
              />
              <KpiCard
                label="Realizado ZL0136 no período"
                value={resultado.totalRealizadoGeral}
                format={formatBRL}
                detail="Todos os fornecedores"
                icon={FileSpreadsheet}
              />
            </div>

            {resumo.semVinculo.length > 0 && (
              <div className="rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}>
                <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {resumo.semVinculo.length} nomes da lista não foram encontrados no cadastro SAP:
                </span>{' '}
                {resumo.semVinculo.map(l => l.nomePlanilha).join(' · ')}. Eles saem na planilha sem valores.
              </div>
            )}

            {mostrarForaDaLista && (
              <TableShell maxHeight="50vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Código" />
                    <Th label="Fornecedor" />
                    <Th label="Principais itens" />
                    <Th label="Total 2026" align="right" />
                  </TableHeadRow>
                  <TableBody>
                    {resultado.foraDaLista.map(f => (
                      <Tr key={f.codigo}>
                        <Td mono>{f.codigo}</Td>
                        <Td truncate title={f.nome}>{f.nome}</Td>
                        <Td truncate title={f.principaisItens}>{f.principaisItens}</Td>
                        <Td align="right" numeric strong>{formatBRL(f.total)}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </table>
              </TableShell>
            )}
          </>
        )}
      </section>
    </div>
  );
}

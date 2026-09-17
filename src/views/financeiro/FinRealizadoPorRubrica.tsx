/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório de Realizado por Rubrica (Financeiro) — 1ª etapa.
 *
 * Mostra, por rubrica orçamentária, o total de pedidos colocados (SAP
 * ZL0132) e pagamentos realizados (SAP FBL1N), resolvidos via
 * `fin_rubrica_mapeamentos`. Sem orçado e sem separação DIRETO/INDIRETO —
 * isso fica para quando o orçamento planejado sair da planilha e entrar no
 * banco. A linha "Sem rubrica" mostra o que ainda não tem mapeamento
 * cadastrado, para orientar os ajustes na tela de manutenção
 * (`/admin/rubricas-financeiro`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight, Download, HelpCircle, Loader2, ShoppingCart, Wallet } from 'lucide-react';
import { Profile, FinRealizadoRubricaLinha } from '../../types';
import { formatBRL } from '../../lib/format';
import KpiCard from '../../components/charts/KpiCard';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableSkeleton, TableEmpty } from '../../components/ui/DataTable';
import { obterRelatorioRealizadoPorRubrica, RelatorioRealizadoPorRubrica, coletarIdsComDescendentes } from '../../lib/rubricasFinanceiroApi';
import { exportarRealizadoPorRubricaXlsx } from '../../lib/exportRubricasFinanceiro';
import { useToast } from '../../components/ui/Toast';
import RubricaDetalheModal from '../../components/financeiro/RubricaDetalheModal';
import RubricaSerieTemporalChart from '../../components/financeiro/RubricaSerieTemporalChart';

interface FinRealizadoPorRubricaProps {
  user: Profile;
}

export default function FinRealizadoPorRubrica({ user: _user }: FinRealizadoPorRubricaProps) {
  const toast = useToast();
  const [relatorio, setRelatorio] = useState<RelatorioRealizadoPorRubrica | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [detalheAberto, setDetalheAberto] = useState<{ titulo: string; rubricaIds: string[] | null } | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    obterRelatorioRealizadoPorRubrica()
      .then(res => {
        if (!ativo) return;
        setRelatorio(res);
        // Abre por padrão as rubricas-pai que têm filhos, para o usuário já
        // ver a composição sem precisar clicar uma a uma.
        const paisComFilhos = res.linhas.filter(l => l.filhos.length > 0).map(l => l.rubrica?.id || '');
        setExpandidos(new Set(paisComFilhos));
      })
      .catch(err => {
        if (!ativo) return;
        console.error('[FinRealizadoPorRubrica] Erro ao carregar relatório:', err);
        setErro(err?.message || 'Erro ao carregar o relatório.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => { ativo = false; };
  }, []);

  const linhasAchatadas = useMemo(() => {
    if (!relatorio) return [];
    const resultado: FinRealizadoRubricaLinha[] = [];
    const visitar = (linha: FinRealizadoRubricaLinha) => {
      resultado.push(linha);
      const id = linha.rubrica?.id;
      if (id && expandidos.has(id)) {
        linha.filhos.forEach(visitar);
      }
    };
    relatorio.linhas.forEach(visitar);
    return resultado;
  }, [relatorio, expandidos]);

  const alternarExpandido = (id: string) => {
    setExpandidos(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const abrirComposicao = (linha: FinRealizadoRubricaLinha) => {
    if (!linha.rubrica) {
      setDetalheAberto({ titulo: 'Sem rubrica (sem mapeamento cadastrado)', rubricaIds: null });
      return;
    }
    setDetalheAberto({ titulo: linha.rubrica.nome, rubricaIds: coletarIdsComDescendentes(linha) });
  };

  const handleExportar = async () => {
    setExportando(true);
    try {
      await exportarRealizadoPorRubricaXlsx();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar a exportação.');
    } finally {
      setExportando(false);
    }
  };

  if (erro) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <TableEmpty icon={HelpCircle} title="Não foi possível carregar o relatório" hint={erro} />
      </div>
    );
  }

  return (
    <div className="space-y-6 select-text max-w-[1200px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Realizado por Rubrica
          </h2>
          <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
            Pedidos colocados e pagamentos realizados agrupados por rubrica de custo. Ainda sem orçado (o orçamento
            planejado está em planilha) e sem separação Direto/Indireto — 1ª etapa para validar a classificação com os
            números reais antes de modelar o orçamento.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportar}
          disabled={exportando || carregando}
          className="px-4 h-9 rounded-lg text-xs font-bold flex items-center gap-1.5 border disabled:opacity-60 shrink-0"
          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          title="Exportar detalhe de pedidos e pagamentos para auditoria"
        >
          {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Exportar para auditoria
        </button>
      </div>

      {carregando || !relatorio ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
          <TableSkeleton columns={4} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Total Pedidos Colocados"
              value={relatorio.totalGeralPedidos}
              format={formatBRL}
              icon={ShoppingCart}
            />
            <KpiCard
              label="Total Pagamentos Realizados"
              value={relatorio.totalGeralPagamentos}
              format={formatBRL}
              icon={Wallet}
            />
            <KpiCard
              label="Sem Rubrica (Pedidos)"
              value={relatorio.semRubrica.valorPedidos}
              format={formatBRL}
              detail={relatorio.totalGeralPedidos
                ? `${((relatorio.semRubrica.valorPedidos / relatorio.totalGeralPedidos) * 100).toFixed(0)}% do total de pedidos ainda sem mapeamento`
                : undefined}
              icon={HelpCircle}
              accent="var(--warning, #f59e0b)"
            />
          </div>

          <RubricaSerieTemporalChart />

          <TableShell maxHeight="70vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="Rubrica" />
                <Th label="Pedidos Colocados" align="right" />
                <Th label="Qtd. Pedidos" align="right" />
                <Th label="Pagamentos Realizados" align="right" />
              </TableHeadRow>
              <TableBody>
                {linhasAchatadas.map((linha, idx) => {
                  const id = linha.rubrica?.id || `sem-rubrica-${idx}`;
                  const temFilhos = linha.filhos.length > 0;
                  const expandido = linha.rubrica ? expandidos.has(linha.rubrica.id) : false;
                  const semRubrica = !linha.rubrica;
                  return (
                    <Tr key={id} onClick={() => abrirComposicao(linha)} title="Ver composição do valor para auditoria">
                      <Td strong={linha.nivel === 0}>
                        <span style={{ paddingLeft: linha.nivel * 20 }} className="inline-flex items-center gap-1.5">
                          {temFilhos ? (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); linha.rubrica && alternarExpandido(linha.rubrica.id); }}
                              className="shrink-0 cursor-pointer"
                              aria-label={expandido ? 'Recolher' : 'Expandir'}
                            >
                              {expandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="inline-block w-3.5" />
                          )}
                          <span className={semRubrica ? 'italic underline decoration-dotted underline-offset-2' : 'underline decoration-dotted underline-offset-2'} style={semRubrica ? { color: 'var(--ink-muted)' } : undefined}>
                            {linha.rubrica?.nome || 'Sem rubrica (sem mapeamento cadastrado)'}
                          </span>
                        </span>
                      </Td>
                      <Td align="right" numeric strong={linha.nivel === 0}>{formatBRL(linha.valorPedidos)}</Td>
                      <Td align="right" numeric>{linha.qtdPedidos.toLocaleString('pt-BR')}</Td>
                      <Td align="right" numeric strong={linha.nivel === 0}>{formatBRL(linha.valorPagamentos)}</Td>
                    </Tr>
                  );
                })}
              </TableBody>
            </table>
          </TableShell>
        </>
      )}

      {detalheAberto && (
        <RubricaDetalheModal
          titulo={detalheAberto.titulo}
          rubricaIds={detalheAberto.rubricaIds}
          onFechar={() => setDetalheAberto(null)}
        />
      )}
    </div>
  );
}

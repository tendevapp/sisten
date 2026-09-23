/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório de Realizado por Rubrica (Financeiro), medido pela NOTA FISCAL.
 *
 * Pedido colocado é compromisso; o realizado é a NF de entrada (ZL0136). Cada
 * item vem de `vw_fin_nf_realizado_rubrica` com duas classificações:
 * - natureza fiscal pelo CFOP — separa custo (material de produção, uso e
 *   consumo, serviço, frete, energia, devolução) do que é só movimentação
 *   (remessa/retorno, outras entradas, imobilizado);
 * - rubrica pelo de-para CFOP → fornecedor → código de serviço → grupo de
 *   mercadoria (manutenção em `/admin/rubricas-financeiro`).
 *
 * A "ponte" mostra como o total de NFs de fornecedor chega ao realizado, e o
 * pago rastreado (FBL1N por fornecedor + NF) serve de prova: o que não é
 * custo praticamente não tem pagamento.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Download, Factory, HelpCircle, Receipt, Tags,
} from 'lucide-react';
import { Profile, FinRubrica } from '../../types';
import { formatBRL, formatPct } from '../../lib/format';
import KpiCard from '../../components/charts/KpiCard';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableSkeleton, TableEmpty } from '../../components/ui/DataTable';
import { listarRubricas, carregarLinhasRealizadoNf } from '../../lib/rubricasFinanceiroApi';
import {
  baldeDaLinha, coletarIdsComDescendentes, filtrarPorPeriodo, LinhaArvoreRubrica, LinhaNfRealizado,
  montarRelatorio, NaturezaFiscal, resumirPorNatureza,
} from '../../lib/realizadoRubricaNf';
import { exportarRealizadoPorRubricaXlsx } from '../../lib/exportRubricasFinanceiro';
import { useToast } from '../../components/ui/Toast';
import RubricaDetalheModal from '../../components/financeiro/RubricaDetalheModal';
import RubricaSerieTemporalChart from '../../components/financeiro/RubricaSerieTemporalChart';

interface FinRealizadoPorRubricaProps {
  user: Profile;
}

interface Detalhe {
  titulo: string;
  subtitulo?: string;
  linhas: LinhaNfRealizado[];
}

const pct = (parte: number, todo: number) => (todo ? (parte / todo) * 100 : 0);

export default function FinRealizadoPorRubrica({ user: _user }: FinRealizadoPorRubricaProps) {
  const toast = useToast();
  const [rubricas, setRubricas] = useState<FinRubrica[]>([]);
  const [linhas, setLinhas] = useState<LinhaNfRealizado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [mesDe, setMesDe] = useState('');
  const [mesAte, setMesAte] = useState('');
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    Promise.all([listarRubricas(), carregarLinhasRealizadoNf()])
      .then(([r, l]) => {
        if (!ativo) return;
        setRubricas(r);
        setLinhas(l);
        // Abre por padrão as rubricas-pai com filhos, para já mostrar a composição.
        setExpandidos(new Set(r.filter(x => r.some(f => f.rubrica_pai_id === x.id)).map(x => x.id)));
      })
      .catch(err => {
        if (!ativo) return;
        console.error('[FinRealizadoPorRubrica] Erro ao carregar relatório:', err);
        setErro(err?.message || 'Erro ao carregar o relatório.');
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const linhasPeriodo = useMemo(() => filtrarPorPeriodo(linhas, mesDe, mesAte), [linhas, mesDe, mesAte]);
  const relatorio = useMemo(() => montarRelatorio(rubricas, linhasPeriodo), [rubricas, linhasPeriodo]);
  const ponte = useMemo(() => resumirPorNatureza(linhasPeriodo), [linhasPeriodo]);
  const totalNf = useMemo(() => ponte.reduce((s, n) => s + n.valor, 0), [ponte]);

  const linhasArvore = useMemo(() => {
    const resultado: LinhaArvoreRubrica[] = [];
    const visitar = (l: LinhaArvoreRubrica) => {
      resultado.push(l);
      if (expandidos.has(l.rubrica.id)) l.filhos.forEach(visitar);
    };
    relatorio.arvore.forEach(visitar);
    return resultado;
  }, [relatorio, expandidos]);

  const alternarExpandido = (id: string) => {
    setExpandidos(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };

  const abrirRubrica = (linha: LinhaArvoreRubrica) => {
    const ids = new Set(coletarIdsComDescendentes(linha));
    setDetalhe({
      titulo: linha.rubrica.nome,
      linhas: linhasPeriodo.filter(l => baldeDaLinha(l) === 'rubrica' && ids.has(l.rubrica_id!)),
    });
  };

  const abrirBalde = (balde: 'material_producao' | 'sem_rubrica') => {
    setDetalhe(balde === 'material_producao'
      ? {
        titulo: 'Material de produção (fora das rubricas)',
        subtitulo: 'Compra para industrialização sem rubrica — custo direto das torres',
        linhas: linhasPeriodo.filter(l => baldeDaLinha(l) === 'material_producao'),
      }
      : {
        titulo: 'Sem rubrica (a classificar)',
        subtitulo: 'Custo sem de-para por fornecedor, código de serviço ou grupo de mercadoria',
        linhas: linhasPeriodo.filter(l => baldeDaLinha(l) === 'sem_rubrica'),
      });
  };

  const abrirNatureza = (natureza: NaturezaFiscal, rotulo: string, descricao: string) => {
    setDetalhe({ titulo: rotulo, subtitulo: descricao, linhas: linhasPeriodo.filter(l => l.natureza === natureza) });
  };

  const handleExportar = () => {
    try {
      const sufixo = mesDe || mesAte ? `-${mesDe || 'inicio'}_${mesAte || 'fim'}` : '';
      exportarRealizadoPorRubricaXlsx(relatorio, linhasPeriodo, sufixo);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao gerar a exportação.');
    }
  };

  if (erro) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <TableEmpty icon={HelpCircle} title="Não foi possível carregar o relatório" hint={erro} />
      </div>
    );
  }

  const { realizado, emRubricas, materialProducao, semRubrica } = relatorio;
  const inputMes = 'px-2.5 h-9 border rounded-lg text-xs';
  const estiloInput = { borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' };

  return (
    <div className="space-y-6 select-text max-w-[1200px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex items-start justify-between flex-wrap gap-3">
        <div className="max-w-[720px]">
          <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
            <BarChart3 className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
            Realizado por Rubrica
          </h2>
          <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
            Medido pelas notas fiscais de entrada (ZL0136), não pelos pedidos. O CFOP separa o que é custo do que é só
            movimentação fiscal; a rubrica vem do de-para por fornecedor, código de serviço e grupo de mercadoria. O pago
            rastreado (FBL1N) confirma a leitura.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Lançamento de</span>
            <input type="month" value={mesDe} onChange={e => setMesDe(e.target.value)} className={inputMes} style={estiloInput} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>até</span>
            <input type="month" value={mesAte} onChange={e => setMesAte(e.target.value)} className={inputMes} style={estiloInput} />
          </label>
          <button
            type="button"
            onClick={handleExportar}
            disabled={carregando}
            className="px-4 h-9 rounded-lg text-xs font-bold flex items-center gap-1.5 border disabled:opacity-60 shrink-0"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
            title="Exportar resumo, ponte por natureza, fornecedores e itens de NF para auditoria"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar para auditoria
          </button>
        </div>
      </div>

      {carregando ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
          <TableSkeleton columns={6} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Realizado (NF)"
              value={realizado.valor}
              format={formatBRL}
              detail={`${realizado.qtdNfs.toLocaleString('pt-BR')} NFs · pago rastreado ${formatBRL(realizado.valorPago)}`}
              icon={Receipt}
              emphasize
            />
            <KpiCard
              label="Classificado em rubricas"
              value={emRubricas.valor}
              format={formatBRL}
              share={realizado.valor ? emRubricas.valor / realizado.valor : 0}
              detail={`${formatPct(pct(emRubricas.valor, realizado.valor))} do realizado`}
              icon={Tags}
            />
            <KpiCard
              label="Material de produção"
              value={materialProducao.valor}
              format={formatBRL}
              share={realizado.valor ? materialProducao.valor / realizado.valor : 0}
              detail="Fora das rubricas — custo direto"
              icon={Factory}
              accent="var(--series-3)"
              onClick={() => abrirBalde('material_producao')}
            />
            <KpiCard
              label="Sem rubrica (a classificar)"
              value={semRubrica.valor}
              format={formatBRL}
              share={realizado.valor ? semRubrica.valor / realizado.valor : 0}
              detail={`${formatPct(pct(semRubrica.valor, realizado.valor))} do realizado · clique para ver`}
              icon={HelpCircle}
              accent="var(--status-warning)"
              onClick={() => abrirBalde('sem_rubrica')}
            />
          </div>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Ponte de validação — NF de fornecedor até o realizado</h3>
              <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                Natureza de cada item pelo CFOP. O que não entra no realizado quase não tem pagamento — é remessa, retorno,
                comodato ou ativo. Clique numa linha para ver as notas.
              </p>
            </div>
            <TableShell>
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Natureza fiscal" />
                  <Th label="Regra" />
                  <Th label="No realizado" />
                  <Th label="Valor NF" align="right" />
                  <Th label="Pago rastreado" align="right" />
                  <Th label="% pago" align="right" />
                </TableHeadRow>
                <TableBody>
                  {ponte.map(n => (
                    <Tr
                      key={n.natureza}
                      onClick={() => abrirNatureza(n.natureza, n.rotulo, n.descricao)}
                      title="Ver as notas desta natureza"
                      className={n.entraRealizado ? '' : 'opacity-70'}
                    >
                      <Td strong>{n.rotulo}</Td>
                      <Td truncate title={n.descricao}>{n.descricao}</Td>
                      <Td>
                        <span className="inline-flex items-center gap-1" style={{ color: n.entraRealizado ? 'var(--status-good)' : 'var(--ink-muted)' }}>
                          {n.entraRealizado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleSlash className="h-3.5 w-3.5" />}
                          {n.entraRealizado ? 'Sim' : 'Não'}
                        </span>
                      </Td>
                      <Td align="right" numeric strong>{formatBRL(n.valor)}</Td>
                      <Td align="right" numeric>{formatBRL(n.valorPago)}</Td>
                      <Td align="right" numeric>{n.valor > 0 ? formatPct(pct(n.valorPago, n.valor)) : '—'}</Td>
                    </Tr>
                  ))}
                  <Tr>
                    <Td strong colSpan={3}>Total de NFs de fornecedor</Td>
                    <Td align="right" numeric strong>{formatBRL(totalNf)}</Td>
                    <Td align="right" numeric>{formatBRL(ponte.reduce((s, n) => s + n.valorPago, 0))}</Td>
                    <Td align="right" numeric>—</Td>
                  </Tr>
                  <Tr accent="var(--brand)">
                    <Td strong colSpan={3}>Realizado (entra no relatório)</Td>
                    <Td align="right" numeric strong>{formatBRL(realizado.valor)}</Td>
                    <Td align="right" numeric>{formatBRL(realizado.valorPago)}</Td>
                    <Td align="right" numeric>{formatPct(pct(realizado.valorPago, realizado.valor))}</Td>
                  </Tr>
                </TableBody>
              </table>
            </TableShell>
          </section>

          <RubricaSerieTemporalChart
            linhas={linhasPeriodo}
            carregando={carregando}
            onAbrirDetalhe={(titulo, l) => setDetalhe({ titulo, linhas: l })}
          />

          <TableShell maxHeight="70vh">
            <table className="w-full text-xs">
              <TableHeadRow>
                <Th label="Rubrica" />
                <Th label="Realizado NF" align="right" />
                <Th label="Pago rastreado" align="right" />
                <Th label="NFs" align="right" />
                <Th label="Fornecedores" align="right" />
                <Th label="% do realizado" align="right" />
              </TableHeadRow>
              <TableBody>
                {linhasArvore.map(linha => {
                  const temFilhos = linha.filhos.length > 0;
                  const expandido = expandidos.has(linha.rubrica.id);
                  const vazia = linha.valor === 0 && linha.qtdItens === 0;
                  return (
                    <Tr
                      key={linha.rubrica.id}
                      onClick={() => abrirRubrica(linha)}
                      title="Ver composição por fornecedor, item e nota"
                      className={vazia ? 'opacity-50' : ''}
                    >
                      <Td strong={linha.nivel === 0}>
                        <span style={{ paddingLeft: linha.nivel * 20 }} className="inline-flex items-center gap-1.5">
                          {temFilhos ? (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); alternarExpandido(linha.rubrica.id); }}
                              className="shrink-0 cursor-pointer"
                              aria-label={expandido ? 'Recolher' : 'Expandir'}
                            >
                              {expandido ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <span className="inline-block w-3.5" />
                          )}
                          <span className="underline decoration-dotted underline-offset-2">{linha.rubrica.nome}</span>
                        </span>
                      </Td>
                      <Td align="right" numeric strong={linha.nivel === 0}>{formatBRL(linha.valor)}</Td>
                      <Td align="right" numeric>{formatBRL(linha.valorPago)}</Td>
                      <Td align="right" numeric>{linha.qtdNfs.toLocaleString('pt-BR')}</Td>
                      <Td align="right" numeric>{linha.qtdFornecedores.toLocaleString('pt-BR')}</Td>
                      <Td align="right" numeric>{formatPct(pct(linha.valor, realizado.valor))}</Td>
                    </Tr>
                  );
                })}
                {[
                  { chave: 'material_producao' as const, rotulo: 'Material de produção (fora das rubricas)', ag: materialProducao },
                  { chave: 'sem_rubrica' as const, rotulo: 'Sem rubrica (a classificar)', ag: semRubrica },
                ].map(b => (
                  <Tr key={b.chave} onClick={() => abrirBalde(b.chave)} title="Ver composição por fornecedor, item e nota">
                    <Td strong>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block w-3.5" />
                        <span className="italic underline decoration-dotted underline-offset-2" style={{ color: 'var(--ink-muted)' }}>{b.rotulo}</span>
                      </span>
                    </Td>
                    <Td align="right" numeric strong>{formatBRL(b.ag.valor)}</Td>
                    <Td align="right" numeric>{formatBRL(b.ag.valorPago)}</Td>
                    <Td align="right" numeric>{b.ag.qtdNfs.toLocaleString('pt-BR')}</Td>
                    <Td align="right" numeric>{b.ag.qtdFornecedores.toLocaleString('pt-BR')}</Td>
                    <Td align="right" numeric>{formatPct(pct(b.ag.valor, realizado.valor))}</Td>
                  </Tr>
                ))}
                <Tr accent="var(--brand)">
                  <Td strong><span className="pl-5">Total realizado</span></Td>
                  <Td align="right" numeric strong>{formatBRL(realizado.valor)}</Td>
                  <Td align="right" numeric>{formatBRL(realizado.valorPago)}</Td>
                  <Td align="right" numeric>{realizado.qtdNfs.toLocaleString('pt-BR')}</Td>
                  <Td align="right" numeric>{realizado.qtdFornecedores.toLocaleString('pt-BR')}</Td>
                  <Td align="right" numeric>{formatPct(100)}</Td>
                </Tr>
              </TableBody>
            </table>
          </TableShell>
        </>
      )}

      {detalhe && (
        <RubricaDetalheModal
          titulo={detalhe.titulo}
          subtitulo={detalhe.subtitulo}
          linhas={detalhe.linhas}
          onFechar={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

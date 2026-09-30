/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Painel da ficha completa de EPI de um colaborador: cadastro do RH, totais de
 * todas as entregas e o detalhamento item a item (código SAP, tamanho, CA,
 * M.E.D., devolução e situação da assinatura). Fica acima do documento no
 * desenho do papel.
 */

import { useMemo } from 'react';
import { MOTIVOS_MED, formatarDataBR, formatarQuantidade, resumirFichasColaborador } from '../../../lib/fichaEpi';
import type { CadastroRhColaborador, SsmaFichaEpi } from '../../../lib/ssmaFichaEpiApi';

interface Props {
  /** Todas as fichas do colaborador, inclusive canceladas. */
  fichas: SsmaFichaEpi[];
  cadastro: CadastroRhColaborador | null;
}

const thCls = 'px-3 py-2.5 font-bold';

function Dado({ rotulo, valor }: { rotulo: string; valor?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={valor || undefined}>{valor || '—'}</dd>
    </div>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string | number; destaque?: 'aviso' | 'perigo' }) {
  const cor = destaque === 'aviso' ? 'text-amber-700 dark:text-amber-400' : destaque === 'perigo' ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-50';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`text-base font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}

function situacaoAssinatura(f: SsmaFichaEpi): { texto: string; cls: string } {
  if (f.status === 'CANCELADA') return { texto: 'Cancelada', cls: 'text-red-600 dark:text-red-400' };
  if (f.assinatura_pendente) return { texto: 'Assinatura pendente', cls: 'font-bold text-amber-700 dark:text-amber-400' };
  if (f.origem === 'HISTORICO_PAPEL') return { texto: 'Ficha física', cls: 'text-slate-500' };
  return { texto: `Assinada${f.assinado_em ? ` em ${formatarDataBR(f.assinado_em.slice(0, 10))}` : ''}`, cls: 'text-emerald-700 dark:text-emerald-400' };
}

export default function FichaEpiColaboradorResumo({ fichas, cadastro }: Props) {
  const resumo = useMemo(() => resumirFichasColaborador(fichas), [fichas]);
  const recente = useMemo(
    () => [...fichas].sort((a, b) => b.data_entrega.localeCompare(a.data_entrega) || b.created_at.localeCompare(a.created_at))[0],
    [fichas],
  );
  const linhas = useMemo(
    () => [...fichas]
      .sort((a, b) => b.data_entrega.localeCompare(a.data_entrega) || b.created_at.localeCompare(a.created_at))
      .flatMap(f => [...f.itens].sort((a, b) => a.ordem - b.ordem).map(item => ({ ficha: f, item }))),
    [fichas],
  );
  if (!recente) return null;

  const setorRh = [cadastro?.macroarea, cadastro?.area, cadastro?.subsetor].filter(Boolean);

  return (
    <div className="mb-4 space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Dados do colaborador</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <Dado rotulo="Nome" valor={recente.nome} />
          <Dado rotulo="Matrícula / registro" valor={recente.registro} />
          <Dado rotulo="Cargo (RH)" valor={cadastro?.cargo ?? recente.cargo_rh} />
          <Dado rotulo="Função na matriz de EPI" valor={recente.funcao_nome} />
          <Dado rotulo="Setor na última ficha" valor={recente.setor} />
          <Dado rotulo="Área do RH" valor={setorRh.length ? [...new Set(setorRh)].join(' / ') : null} />
          <Dado rotulo="Liderança" valor={cadastro?.lideranca} />
          <Dado rotulo="Turno" valor={cadastro?.turno} />
          <Dado rotulo="Vínculo" valor={cadastro?.tipo_vinculo} />
          <Dado rotulo="Situação no RH" valor={cadastro ? `${cadastro.ativo ? 'Ativo' : 'Inativo'}${cadastro.situacao ? ` · ${cadastro.situacao}` : ''}` : null} />
          <Dado rotulo="Admissão" valor={formatarDataBR(resumo.dataAdmissao) || null} />
          <Dado rotulo="Demissão" valor={formatarDataBR(resumo.dataDemissao) || null} />
        </dl>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Indicador rotulo="Fichas" valor={resumo.fichasAtivas + (resumo.fichasCanceladas ? ` (+${resumo.fichasCanceladas} canc.)` : '')} />
        <Indicador rotulo="Tipos de EPI" valor={resumo.epis} />
        <Indicador rotulo="Unidades" valor={formatarQuantidade(resumo.unidades)} />
        <Indicador rotulo="Em uso" valor={formatarQuantidade(resumo.emUso)} />
        <Indicador rotulo="Devolvidas" valor={formatarQuantidade(resumo.devolvidos)} />
        <Indicador rotulo="Perda / dano" valor={formatarQuantidade(resumo.perdas)} destaque={resumo.perdas ? 'perigo' : undefined} />
        <Indicador rotulo="Assin. pendentes" valor={resumo.assinaturasPendentes} destaque={resumo.assinaturasPendentes ? 'aviso' : undefined} />
        <Indicador rotulo="Primeira · última" valor={`${formatarDataBR(resumo.primeiraEntrega).slice(0, 5)} · ${formatarDataBR(resumo.ultimaEntrega).slice(0, 5)}`} />
      </div>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Todas as entregas ({linhas.length} itens)</h3>
          <p className="text-xs text-slate-500">Da mais recente para a mais antiga. O documento abaixo mostra as mesmas entregas no desenho do papel.</p>
        </div>
        <div className="max-h-[380px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className={`${thCls} pl-4`}>Entrega</th>
                <th className={thCls}>Ficha</th>
                <th className={thCls}>EPI</th>
                <th className={thCls}>Cód. SAP</th>
                <th className={thCls}>Tam.</th>
                <th className={thCls}>C.A.</th>
                <th className={`${thCls} text-right`}>Qtd.</th>
                <th className={thCls}>M.E.D.</th>
                <th className={thCls}>Devolução</th>
                <th className={thCls}>Assinatura</th>
                <th className={`${thCls} pr-4`}>Lançada por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {linhas.map(({ ficha, item }) => {
                const situacao = situacaoAssinatura(ficha);
                return (
                  <tr key={item.id} className={`text-slate-700 dark:text-slate-200 ${ficha.status === 'CANCELADA' ? 'opacity-50 line-through' : ''}`}>
                    <td className="px-3 py-2 pl-4 whitespace-nowrap">{formatarDataBR(ficha.data_entrega)}</td>
                    <td className="px-3 py-2 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">{ficha.codigo}</td>
                    <td className="px-3 py-2 font-semibold">
                      {item.descricao}
                      {item.fora_da_matriz && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">fora da matriz</span>}
                    </td>
                    <td className="px-3 py-2 font-mono">{item.codigo_sap || '—'}</td>
                    <td className="px-3 py-2">{item.tamanho || '—'}</td>
                    <td className="px-3 py-2">{item.ca || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarQuantidade(item.quantidade)}</td>
                    <td className={`px-3 py-2 ${item.motivo === 3 ? 'font-bold text-red-600 dark:text-red-400' : ''}`} title={MOTIVOS_MED[item.motivo]}>{item.motivo}. {MOTIVOS_MED[item.motivo]}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.data_devolucao ? formatarDataBR(item.data_devolucao) : <span className="text-slate-400">em uso</span>}</td>
                    <td className={`px-3 py-2 whitespace-nowrap ${situacao.cls}`}>{situacao.texto}</td>
                    <td className="px-3 py-2 pr-4 text-slate-500">{ficha.criado_por_nome || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

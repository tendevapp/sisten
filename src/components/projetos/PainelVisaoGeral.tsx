/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Visão Geral — matriz de progresso e o que trava a próxima torre.
 *
 * A matriz é a pergunta que a planilha nunca respondeu de relance: em que
 * etapa está cada um dos 5 tramos de cada torre. Uma célula por tramo, na cor
 * do estado.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, Factory, PackageCheck, TriangleAlert } from 'lucide-react';
import KpiCard from '../charts/KpiCard';
import { formatInt, formatQtd } from '../../lib/format';
import { COR_ESTADO, ROTULO_ESTADO, TRAMOS, type EstadoCelula, type Tramo } from '../../lib/projetos';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';
import type { AbaProjetos } from '../../views/projetos/Projetos';

interface Props {
  dados: DadosProjetos;
  onIrPara: (aba: AbaProjetos) => void;
}

export default function PainelVisaoGeral({ dados, onIrPara }: Props) {
  const { tramosDoSubprojeto, autonomia, rateio, projecao, kits, subprojetoAtivo, loading } = dados;
  const [celulaAberta, setCelulaAberta] = useState<string | null>(null);

  /**
   * Estado de cada célula. `disponivel_separar` é derivado — o tramo está
   * pendente E a autonomia daquele tramo cobre pelo menos um kit. Guardar isso
   * no banco seria guardar uma conta que muda a cada NF recebida.
   */
  const estadoDaCelula = useMemo(() => {
    const podeSeparar = new Map<Tramo, boolean>(
      autonomia.map((a) => [a.tramo, a.kitsPossiveis > 0]),
    );
    const mapa = new Map<string, EstadoCelula>();
    for (const t of tramosDoSubprojeto) {
      const estado: EstadoCelula =
        t.status === 'pendente' && podeSeparar.get(t.tramo as Tramo) ? 'disponivel_separar' : (t.status as EstadoCelula);
      mapa.set(t.id, estado);
    }
    return mapa;
  }, [tramosDoSubprojeto, autonomia]);

  const torres = useMemo(() => {
    const porTorre = new Map<number, Record<string, string>>();
    for (const t of tramosDoSubprojeto) {
      const linha = porTorre.get(t.torre_numero) ?? {};
      linha[t.tramo] = t.id;
      porTorre.set(t.torre_numero, linha);
    }
    return Array.from(porTorre.entries()).sort((a, b) => a[0] - b[0]);
  }, [tramosDoSubprojeto]);

  const contagem = useMemo(() => {
    const c: Record<EstadoCelula, number> = {
      pendente: 0, disponivel_separar: 0, em_premontagem: 0, kit_pronto: 0, entregue: 0,
    };
    estadoDaCelula.forEach((estado) => { c[estado] += 1; });
    return c;
  }, [estadoDaCelula]);

  const torresCompletas = useMemo(
    () => torres.filter(([, linha]) => TRAMOS.every((t) => estadoDaCelula.get(linha[t]) === 'entregue')).length,
    [torres, estadoDaCelula],
  );

  const kitsNoBuffer = kits.filter((k) => k.status === 'pronto').length;
  const totalCelulas = tramosDoSubprojeto.length || 1;
  const menorAutonomia = autonomia.reduce((min, a) => Math.min(min, a.kitsPossiveis), Infinity);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Torres entregues"
          value={torresCompletas}
          format={(v) => `${formatInt(v)} de ${subprojetoAtivo?.torres_previstas ?? 0}`}
          detail="Os 5 tramos entregues à produção"
          icon={CheckCircle2}
          accent="var(--abc-a)"
          share={torresCompletas / (subprojetoAtivo?.torres_previstas || 1)}
          emphasize
        />
        <KpiCard
          label="Kits prontos no buffer"
          value={kitsNoBuffer}
          format={formatInt}
          detail="Montados, aguardando chamada da produção"
          icon={PackageCheck}
          accent="var(--series-1)"
          share={kitsNoBuffer / totalCelulas}
        />
        <KpiCard
          label="Torres completas possíveis"
          value={rateio.torresCompletas}
          format={formatInt}
          detail="Com o saldo de hoje, rateado T1→T5"
          icon={Factory}
          accent="var(--series-3)"
          onClick={() => onIrPara('posicao')}
        />
        <KpiCard
          label="Menor autonomia por tramo"
          display={Number.isFinite(menorAutonomia) ? `${formatInt(menorAutonomia)} kit(s)` : '—'}
          detail={
            autonomia.find((a) => a.kitsPossiveis === menorAutonomia)?.gargalo?.partNumber
              ? `Gargalo: ${autonomia.find((a) => a.kitsPossiveis === menorAutonomia)!.gargalo!.partNumber}`
              : 'Sem consumo cadastrado'
          }
          icon={Boxes}
          accent={menorAutonomia === 0 ? 'var(--abc-c)' : 'var(--abc-b)'}
          onClick={() => onIrPara('posicao')}
        />
      </div>

      {projecao.alertaCompraComplementar && (
        <button
          onClick={() => onIrPara('paineis')}
          className="w-full text-left flex items-start gap-3.5 p-5 border border-amber-300 dark:border-amber-800/60 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <TriangleAlert className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Alerta de compra complementar — {formatInt(projecao.deficits.length)} item(ns) não fecham o pedido
            </p>
            <p className="text-xs mt-1 text-amber-800 dark:text-amber-300/90">
              Faltam {formatQtd(projecao.deficits.reduce((s, d) => s + d.deficit, 0))} peças para as{' '}
              {formatInt(projecao.torresRestantes)} torres restantes. Maior déficit:{' '}
              <strong>{projecao.deficits[0]?.partNumber}</strong> ({formatQtd(projecao.deficits[0]?.deficit)}). Ver detalhe →
            </p>
          </div>
        </button>
      )}

      {/* Legenda + matriz */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              Matriz de progresso — {subprojetoAtivo?.nome ?? 'Subprojeto'}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Uma linha por torre, uma coluna por tramo. Clique numa célula para ver a série.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(ROTULO_ESTADO) as EstadoCelula[]).map((estado) => (
              <span key={estado} className="inline-flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                <span className="h-3 w-3 rounded" style={{ background: COR_ESTADO[estado] }} aria-hidden="true" />
                {ROTULO_ESTADO[estado]} ({contagem[estado]})
              </span>
            ))}
          </div>
        </div>

        {loading && <div className="h-40 rounded-lg animate-pulse" style={{ background: 'var(--hairline)' }} />}

        {!loading && !torres.length && (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--ink-muted)' }}>
            Nenhum tramo cadastrado para este subprojeto.
          </p>
        )}

        {!loading && torres.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate" style={{ borderSpacing: '3px' }}>
              <thead>
                <tr>
                  <th className="text-left font-bold px-2 py-1" style={{ color: 'var(--ink-muted)' }}>Torre</th>
                  {TRAMOS.map((t) => (
                    <th key={t} className="font-bold px-2 py-1" style={{ color: 'var(--ink-muted)' }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {torres.map(([numero, linha]) => (
                  <tr key={numero}>
                    <td className="px-2 py-1 font-bold whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>
                      Torre {String(numero).padStart(2, '0')}
                    </td>
                    {TRAMOS.map((tramo) => {
                      const id = linha[tramo];
                      const estado = id ? estadoDaCelula.get(id) ?? 'pendente' : 'pendente';
                      const aberta = celulaAberta === id;
                      return (
                        <td key={tramo} className="p-0">
                          <button
                            onClick={() => setCelulaAberta(aberta ? null : id)}
                            disabled={!id}
                            title={id ? `${id} — ${ROTULO_ESTADO[estado]}` : 'Sem cadastro'}
                            className="w-full min-w-[64px] rounded px-2 py-2 text-[10px] font-bold transition-transform hover:scale-105 cursor-pointer disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-1"
                            style={{
                              background: COR_ESTADO[estado],
                              color: '#fff',
                              outlineColor: 'var(--brand)',
                              boxShadow: aberta ? '0 0 0 2px var(--ink-primary)' : undefined,
                            }}
                          >
                            {aberta ? id : ROTULO_ESTADO[estado].split(' ')[0]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top gargalos: o que impede o próximo kit de cada tramo */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <h3 className="text-sm font-extrabold mb-1" style={{ color: 'var(--ink-primary)' }}>
          O que trava o próximo kit
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--ink-muted)' }}>
          O item de menor razão saldo ÷ consumo em cada tramo. Zerar esse item é o que libera a separação.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {autonomia.map((a) => (
            <div key={a.tramo} className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>{a.tramo}</span>
                <span
                  className="text-lg font-extrabold"
                  style={{ color: a.kitsPossiveis > 0 ? 'var(--abc-a)' : 'var(--abc-c)' }}
                >
                  {formatInt(a.kitsPossiveis)}
                </span>
              </div>
              <p className="text-[10px] mb-2" style={{ color: 'var(--ink-muted)' }}>
                kit(s) separáveis · {formatInt(a.itensNoKit)} itens no romaneio
              </p>
              {a.gargalo ? (
                <div className="text-[11px] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                  <p className="font-bold truncate" title={a.gargalo.descricao}>{a.gargalo.partNumber}</p>
                  <p style={{ color: 'var(--ink-muted)' }}>
                    saldo {formatQtd(a.gargalo.saldo)} · precisa {formatQtd(a.gargalo.consumoPorKit)}/kit
                  </p>
                </div>
              ) : (
                <p className="text-[11px] flex items-center gap-1" style={{ color: 'var(--ink-muted)' }}>
                  <AlertTriangle className="h-3 w-3" /> sem consumo na BOM
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

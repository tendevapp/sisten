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
import { TRAMOS, type EstadoCelula, type Tramo } from '../../lib/projetos';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';
import type { AbaProjetos } from '../../views/projetos/Projetos';
import type { Profile } from '../../types';
import MatrizAutonomiaKits from './MatrizAutonomiaKits';

interface Props {
  dados: DadosProjetos;
  user: Profile;
  onIrPara: (aba: AbaProjetos) => void;
}

export default function PainelVisaoGeral({ dados, user, onIrPara }: Props) {
  const { tramosDoSubprojeto, autonomia, rateio, projecao, kits, subprojetoAtivo } = dados;

  /**
   * Estado de cada célula para o indicador de torres entregues.
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

      {/* Matriz de Autonomia de Kits por Tramo — substitui a antiga matriz de progresso */}
      <MatrizAutonomiaKits dados={dados} user={user} />

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

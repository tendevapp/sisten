/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças visuais da Auditoria de contratos: selo de severidade, selo do tipo de
 * ocorrência, barra de consumo e gráfico de faturamento por mês.
 */

import React from 'react';
import { Banknote, History, Link2, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import {
  CATEGORIA_REGRA, ROTULO_CURTO_REGRA, ROTULO_REGRA, rotuloMes, somarMeses,
  type AuditoriaContrato, type CategoriaRegra, type RegraAuditoria, type Severidade,
} from '../../lib/contratosAuditoria';

export const CorSeveridade: Record<Severidade | 'ok', string> = {
  critico: 'var(--status-critical)',
  alerta: 'var(--status-warning)',
  info: 'var(--ink-muted)',
  ok: 'var(--status-good)',
};

export const RotuloSeveridade: Record<Severidade | 'ok', string> = {
  critico: 'Crítico',
  alerta: 'Alerta',
  info: 'Informativo',
  ok: 'Sem ocorrência',
};

export function SeloSeveridade({ severidade, n }: { severidade: Severidade | 'ok'; n?: number }) {
  const cor = CorSeveridade[severidade];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
      style={{ color: severidade === 'info' ? 'var(--ink-secondary)' : cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />
      {n !== undefined ? `${n} ${RotuloSeveridade[severidade].toLowerCase()}` : RotuloSeveridade[severidade]}
    </span>
  );
}

/** Lançado ÷ valor global. Passa de 100% em vermelho; a partir de 80% em amarelo. */
export function BarraConsumo({ consumo }: { consumo: number | null }) {
  if (consumo === null) {
    return <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>sem valor global</span>;
  }
  const cor = consumo > 1.005 ? 'var(--status-critical)' : consumo >= 0.8 ? 'var(--status-warning)' : 'var(--status-good)';
  const largura = Math.max(0, Math.min(1, consumo)) * 100;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: 'var(--surface-sunken)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(consumo * 100)}
        aria-label="Consumo do contrato"
      >
        <div className="h-full rounded-full" style={{ width: `${largura}%`, background: cor }} />
      </div>
      <span className="text-[11px] font-bold tabular w-12 text-right" style={{ color: cor }}>
        {(consumo * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Tipo de ocorrência                                                     */
/* --------------------------------------------------------------------- */

export const IconeCategoria: Record<CategoriaRegra, LucideIcon> = {
  valor: Wallet,
  faturamento: Receipt,
  pagamento: Banknote,
  vinculo: Link2,
  cadastro: History,
};

/** Selo de uma ocorrência: ícone da categoria + rótulo curto, na cor da severidade. */
export function SeloOcorrencia({ regra, severidade, destaque }: { regra: RegraAuditoria; severidade: Severidade; destaque?: boolean }) {
  const cor = CorSeveridade[severidade];
  const Icone = IconeCategoria[CATEGORIA_REGRA[regra]];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap"
      style={{
        color: severidade === 'info' ? 'var(--ink-secondary)' : cor,
        background: `color-mix(in srgb, ${cor} ${destaque ? 22 : 12}%, transparent)`,
        boxShadow: destaque ? `inset 0 0 0 1px ${cor}` : undefined,
      }}
      title={`${RotuloSeveridade[severidade]} · ${ROTULO_REGRA[regra]}`}
    >
      <Icone className="h-3 w-3 shrink-0" aria-hidden />
      {ROTULO_CURTO_REGRA[regra]}
    </span>
  );
}

/** Até `max` selos das ocorrências mais graves (a regra filtrada vem primeiro) e "+N". */
export function ResumoOcorrencias({ a, regraEmFoco, max = 2 }: { a: AuditoriaContrato; regraEmFoco?: RegraAuditoria | null; max?: number }) {
  if (a.ocorrencias.length === 0) return <SeloSeveridade severidade="ok" />;
  const lista = regraEmFoco
    ? [...a.ocorrencias].sort((x, y) => Number(y.regra === regraEmFoco) - Number(x.regra === regraEmFoco))
    : a.ocorrencias;
  const resto = lista.length - max;
  return (
    <div className="flex flex-wrap items-center gap-1" title={lista.map(o => `${RotuloSeveridade[o.severidade]}: ${o.titulo}`).join('\n')}>
      {lista.slice(0, max).map((o, i) => (
        <SeloOcorrencia key={`${o.regra}-${i}`} regra={o.regra} severidade={o.severidade} destaque={o.regra === regraEmFoco} />
      ))}
      {resto > 0 && <span className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>+{resto}</span>}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/* Faturamento por mês                                                    */
/* --------------------------------------------------------------------- */

type TipoBarra = 'real' | 'acima' | 'projetado' | 'sem_saldo';

interface Barra {
  mes: string;
  valor: number;
  tipo: TipoBarra;
  documentos?: number;
  acumulado?: number;
}

const LIMITE_MESES_PROJETADOS = 24;

function montarBarras(a: AuditoriaContrato): Barra[] {
  const barras: Barra[] = a.faturamentoMensal.map(m => ({
    mes: m.mes, valor: m.valor, tipo: m.acima ? 'acima' : 'real', documentos: m.documentos.length, acumulado: m.acumulado,
  }));
  const pj = a.projecao;
  if (pj) {
    let restante = pj.saldo;
    for (let i = 1; i <= Math.min(pj.mesesRestantes, LIMITE_MESES_PROJETADOS); i++) {
      barras.push({
        mes: somarMeses(pj.ultimoMes, i),
        valor: pj.ritmoMensal,
        tipo: restante >= pj.ritmoMensal - 0.01 ? 'projetado' : 'sem_saldo',
      });
      restante -= pj.ritmoMensal;
    }
  }
  return barras;
}

const ESTILO_BARRA: Record<TipoBarra, React.CSSProperties> = {
  real: { background: 'var(--brand)' },
  acima: { background: 'var(--status-critical)' },
  projetado: { background: 'color-mix(in srgb, var(--brand) 14%, transparent)', border: '1.5px dashed var(--brand)' },
  sem_saldo: { background: 'color-mix(in srgb, var(--status-critical) 14%, transparent)', border: '1.5px dashed var(--status-critical)' },
};

const LEGENDA: Record<TipoBarra, string> = {
  real: 'Faturado',
  acima: 'Acima da parcela',
  projetado: 'Projeção com saldo',
  sem_saldo: 'Projeção sem saldo',
};

const compacto = (v: number) => v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Barras do faturado por mês de competência, a linha da parcela cadastrada e,
 * no contrato mensal vigente, os meses que faltam no ritmo atual — tracejados
 * em vermelho quando o saldo não cobre.
 */
export function GraficoFaturamento({ a }: { a: AuditoriaContrato }) {
  const barras = montarBarras(a);
  if (barras.length < 2) return null;
  const parcela = a.parcela && a.periodicidade === 'mensal' ? a.parcela : null;
  const max = Math.max(...barras.map(b => b.valor), parcela ?? 0) * 1.15 || 1;
  const tipos = (['real', 'acima', 'projetado', 'sem_saldo'] as TipoBarra[]).filter(t => barras.some(b => b.tipo === t));
  const mostrarValores = barras.length <= 16;
  const pj = a.projecao;
  const resumo = [
    parcela ? `Parcela ${brl(parcela)}` : null,
    pj ? `ritmo atual ${brl(pj.ritmoMensal)}/mês` : null,
    pj ? `${pj.mesesRestantes} ${pj.mesesRestantes === 1 ? 'mês' : 'meses'} até o fim da vigência` : null,
  ].filter(Boolean).join(' · ');
  const descricao = barras
    .map(b => `${rotuloMes(b.mes)} ${brl(b.valor)}${b.tipo === 'real' ? '' : ` (${LEGENDA[b.tipo].toLowerCase()})`}`)
    .join('; ');

  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Faturamento por mês</p>
        {resumo && <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{resumo}</p>}
      </div>

      <div className="relative mt-4 h-36" role="img" aria-label={`Faturado por mês: ${descricao}`}>
        {parcela && (
          <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ bottom: `${(parcela / max) * 100}%` }}>
            <div className="border-t border-dashed" style={{ borderColor: 'var(--ink-secondary)' }} />
            <span className="absolute left-0 -top-4 text-[10px] font-bold px-1 rounded" style={{ color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}>
              Parcela {compacto(parcela)}
            </span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end gap-1">
          {barras.map(b => (
            <div
              key={b.mes}
              className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
              title={`${rotuloMes(b.mes)} · ${LEGENDA[b.tipo]} · ${brl(b.valor)}${b.documentos ? ` · ${b.documentos} doc.` : ''}${b.acumulado ? ` · acumula ${b.acumulado} parcelas (mês anterior sem fatura)` : ''}`}
            >
              {mostrarValores && b.valor > 0 && (
                <span
                  className="text-[10px] font-bold tabular leading-none mb-0.5 whitespace-nowrap"
                  style={{ color: b.tipo === 'acima' || b.tipo === 'sem_saldo' ? 'var(--status-critical)' : 'var(--ink-secondary)' }}
                >
                  {compacto(b.valor)}
                </span>
              )}
              <div
                className="w-full max-w-[36px] rounded-t"
                style={{ height: `${Math.max(b.valor > 0 ? 2 : 0, (b.valor / max) * 100)}%`, ...ESTILO_BARRA[b.tipo] }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1 mt-1 border-t pt-1" style={{ borderColor: 'var(--hairline)' }}>
        {barras.map((b, i) => (
          <span
            key={b.mes}
            className="flex-1 min-w-0 text-center text-[10px] tabular truncate"
            style={{ color: b.tipo === 'projetado' || b.tipo === 'sem_saldo' ? 'var(--ink-muted)' : 'var(--ink-secondary)' }}
          >
            {barras.length > 14 && i % 2 === 1 ? '' : rotuloMes(b.mes)}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
        {tipos.map(t => (
          <span key={t} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--ink-secondary)' }}>
            <span className="h-2.5 w-2.5 rounded-sm" style={ESTILO_BARRA[t]} />{LEGENDA[t]}
          </span>
        ))}
        {parcela && (
          <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--ink-secondary)' }}>
            <span className="w-3 border-t border-dashed" style={{ borderColor: 'var(--ink-secondary)' }} />Parcela cadastrada
          </span>
        )}
      </div>
    </div>
  );
}

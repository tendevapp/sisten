/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barra de filtro global da página de suprimentos.
 *
 * Extraída do antigo DemandDashboard, onde valia só para aquela tela. Agora o
 * estado vive no shell e o mesmo recorte atravessa as quatro abas — o gestor
 * escolhe o período uma vez e compara indicadores que falam do mesmo conjunto,
 * em vez de alternar entre telas com filtros divergentes.
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Criticidade, Granularidade, CompradorInfo } from '../../lib/demandas';
import { TipoDemanda } from '../../lib/demandas';
import { formatInt } from '../../lib/format';

export interface EstadoFiltros {
  granularidade: Granularidade;
  dateFrom: string;
  dateTo: string;
  tipo: 'todos' | TipoDemanda;
  criticidade: 'todas' | Criticidade;
  area: string;
  comprador: string;
}

interface FiltrosSuprimentosProps {
  filtros: EstadoFiltros;
  onChange: (patch: Partial<EstadoFiltros>) => void;
  onReset: () => void;
  areas: string[];
  compradores: CompradorInfo[];
  totalFiltrado: number;
  /** Oculta o seletor de granularidade nas abas que não têm série temporal. */
  mostrarGranularidade?: boolean;
}

const selectClass =
  'rounded-lg border py-1.5 px-3 text-xs cursor-pointer transition-colors duration-150 focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--ink-secondary)] focus:outline-[var(--brand)]';

export default function FiltrosSuprimentos({
  filtros,
  onChange,
  onReset,
  areas,
  compradores,
  totalFiltrado,
  mostrarGranularidade = true,
}: FiltrosSuprimentosProps) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-wrap items-center gap-3 sticky top-2 z-10 backdrop-blur-sm"
      style={{
        borderColor: 'var(--hairline)',
        background: 'color-mix(in srgb, var(--surface-card) 92%, transparent)',
        boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
      }}
    >
      {mostrarGranularidade && (
        <div
          className="flex items-center gap-1 rounded-lg border p-0.5"
          style={{ borderColor: 'var(--hairline)' }}
          role="group"
          aria-label="Granularidade"
        >
          {(['dia', 'semana', 'mes'] as Granularidade[]).map(g => (
            <button
              key={g}
              onClick={() => onChange({ granularidade: g })}
              aria-pressed={filtros.granularidade === g}
              className="px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150"
              style={
                filtros.granularidade === g
                  ? { background: 'var(--brand)', color: '#ffffff' }
                  : { color: 'var(--ink-muted)' }
              }
            >
              {g === 'dia' ? 'Dia' : g === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      )}

      <input
        type="date"
        value={filtros.dateFrom}
        onChange={e => onChange({ dateFrom: e.target.value })}
        className={selectClass}
        title="Data inicial"
        aria-label="Data inicial"
      />
      <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>até</span>
      <input
        type="date"
        value={filtros.dateTo}
        onChange={e => onChange({ dateTo: e.target.value })}
        className={selectClass}
        title="Data final"
        aria-label="Data final"
      />

      <select
        value={filtros.tipo}
        onChange={e => onChange({ tipo: e.target.value as EstadoFiltros['tipo'] })}
        className={selectClass}
        aria-label="Tipo de demanda"
      >
        <option value="todos">Todos os tipos</option>
        <option value="material">Materiais</option>
        <option value="servico">Serviços</option>
      </select>

      <select
        value={filtros.criticidade}
        onChange={e => onChange({ criticidade: e.target.value as EstadoFiltros['criticidade'] })}
        className={selectClass}
        aria-label="Criticidade"
      >
        <option value="todas">Todas as criticidades</option>
        <option value="normal">Normal</option>
        <option value="urgente">Urgente</option>
        <option value="maquina_parada">Máquina Parada</option>
      </select>

      <select
        value={filtros.area}
        onChange={e => onChange({ area: e.target.value })}
        className={selectClass}
        aria-label="Área solicitante"
      >
        <option value="todas">Todas as áreas</option>
        {areas.map(a => <option key={a} value={a}>{a}</option>)}
      </select>

      <select
        value={filtros.comprador}
        onChange={e => onChange({ comprador: e.target.value })}
        className={selectClass}
        aria-label="Comprador"
      >
        <option value="todos">Todos os compradores</option>
        {compradores.map(c => (
          <option key={c.grupo_compras} value={c.grupo_compras}>{c.nome_comprador}</option>
        ))}
      </select>

      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-1"
        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', outlineColor: 'var(--brand)' }}
        title="Voltar ao padrão: últimos 90 dias, sem recortes"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Limpar
      </button>

      <span className="ml-auto text-xs tabular" style={{ color: 'var(--ink-muted)' }}>
        {formatInt(totalFiltrado)} requisições no filtro
      </span>
    </div>
  );
}

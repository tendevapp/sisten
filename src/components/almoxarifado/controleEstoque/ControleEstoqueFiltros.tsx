import React from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import type { FiltrosControleEstoque } from '../../../lib/controleEstoqueApi';

export interface OpcoesFiltrosControleEstoque {
  depositos: string[];
  categorias: string[];
  aplicacoes: string[];
  projetos: string[];
}

interface Props {
  filtros: FiltrosControleEstoque;
  opcoes: OpcoesFiltrosControleEstoque;
  onChange: (filtros: FiltrosControleEstoque) => void;
  onLimpar: () => void;
}

const selectClass = 'h-9 rounded-lg border px-2.5 text-xs font-semibold bg-[var(--surface-card)] border-[var(--hairline)] text-[var(--ink-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30';

export default function ControleEstoqueFiltros({ filtros, opcoes, onChange, onLimpar }: Props) {
  const atualizar = <K extends keyof FiltrosControleEstoque>(chave: K, valor: FiltrosControleEstoque[K]) => {
    onChange({ ...filtros, [chave]: valor });
  };

  return (
    <div className="rounded-xl border p-3" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
          <Filter className="h-3.5 w-3.5" /> Filtros
        </span>
        <label className="relative shrink-0 w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={filtros.busca ?? ''}
            onChange={event => atualizar('busca', event.target.value)}
            placeholder="Palavras-chave (material, descrição, categoria)"
            className={`${selectClass} w-full pl-8 font-normal`}
          />
        </label>
        <select value={filtros.deposito ?? ''} onChange={event => atualizar('deposito', event.target.value || undefined)} className={selectClass}>
          <option value="">Depósito: todos</option>
          {opcoes.depositos.map(valor => <option key={valor} value={valor}>{valor}</option>)}
        </select>
        <select value={filtros.categoria ?? ''} onChange={event => atualizar('categoria', event.target.value || undefined)} className={selectClass}>
          <option value="">Categoria: todas</option>
          {opcoes.categorias.map(valor => <option key={valor} value={valor}>{valor}</option>)}
        </select>
        <select value={filtros.aplicacao ?? ''} onChange={event => atualizar('aplicacao', event.target.value || undefined)} className={selectClass}>
          <option value="">Aplicação: todas</option>
          {opcoes.aplicacoes.map(valor => <option key={valor} value={valor}>{valor}</option>)}
        </select>
        <select value={filtros.status ?? ''} onChange={event => atualizar('status', (event.target.value || undefined) as FiltrosControleEstoque['status'])} className={selectClass}>
          <option value="">Status: todos</option>
          <option value="CRITICO">Crítico</option>
          <option value="ALERTA">Alerta</option>
          <option value="OK">OK</option>
          <option value="SEM_DADOS">Sem dados</option>
        </select>
        <select value={filtros.temRm === undefined ? '' : String(filtros.temRm)} onChange={event => atualizar('temRm', event.target.value === '' ? undefined : event.target.value === 'true')} className={selectClass}>
          <option value="">RM: todas</option>
          <option value="true">Com RM</option>
          <option value="false">Sem RM</option>
        </select>
        <select value={filtros.temPo === undefined ? '' : String(filtros.temPo)} onChange={event => atualizar('temPo', event.target.value === '' ? undefined : event.target.value === 'true')} className={selectClass}>
          <option value="">PO: todos</option>
          <option value="true">Com PO</option>
          <option value="false">Sem PO</option>
        </select>
        <select value={filtros.recebimento ?? ''} onChange={event => atualizar('recebimento', (event.target.value || undefined) as FiltrosControleEstoque['recebimento'])} className={selectClass}>
          <option value="">Recebimento: todos</option>
          <option value="COM_RECEBIMENTO">Com recebimento</option>
          <option value="SEM_RECEBIMENTO">Sem recebimento</option>
        </select>
        <select value={filtros.projeto ?? ''} onChange={event => atualizar('projeto', event.target.value || undefined)} className={selectClass}>
          <option value="">Projeto: todos</option>
          {opcoes.projetos.map(valor => <option key={valor} value={valor}>{valor}</option>)}
        </select>
        <button type="button" onClick={onLimpar} className="h-9 shrink-0 rounded-lg border px-3 text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--surface-raised)]" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          <RotateCcw className="h-3.5 w-3.5" /> Limpar
        </button>
      </div>
    </div>
  );
}

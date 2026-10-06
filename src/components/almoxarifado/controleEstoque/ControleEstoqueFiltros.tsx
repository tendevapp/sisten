import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import type { FiltrosControleEstoque } from '../../../lib/controleEstoqueApi';
import { formatDeposito } from '../../../lib/almoxarifado';
import FilterDropdown from '../../ui/FilterDropdown';
import SearchKeywordsChips from '../../ui/SearchKeywordsChips';

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

export default function ControleEstoqueFiltros({ filtros, opcoes, onChange, onLimpar }: Props) {
  const atualizar = <K extends keyof FiltrosControleEstoque>(chave: K, valor: FiltrosControleEstoque[K]) => {
    onChange({ ...filtros, [chave]: valor });
  };

  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}>
      {/* Cada palavra confirmada com Enter vira um chip; o material precisa conter todos. */}
      <SearchKeywordsChips
        chips={filtros.palavrasChave ?? []}
        onChangeChips={chips => atualizar('palavrasChave', chips.length > 0 ? chips : undefined)}
        placeholder="Digite uma palavra e aperte Enter (material, descrição, categoria, aplicação)"
        accent="brand"
        compact
      />
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
          <Filter className="h-3.5 w-3.5" /> Filtros
        </span>

        <FilterDropdown
          label="Depósito"
          value={filtros.deposito}
          onChange={val => atualizar('deposito', val)}
          options={opcoes.depositos}
          renderOption={formatDeposito}
          preferredWidth={320}
          title="Filtrar por depósito"
        />

        <FilterDropdown
          label="Projeto / Consumo"
          allLabel="Todos"
          value={filtros.tipoItem}
          onChange={val => atualizar('tipoItem', val as FiltrosControleEstoque['tipoItem'])}
          options={[
            { value: 'projeto', label: 'Projeto (100000…)', sublabel: 'Itens com código de projeto' },
            { value: 'consumo', label: 'Consumo', sublabel: 'Demais itens e consumíveis' },
          ]}
          preferredWidth={260}
          title="Filtrar por natureza do material: Projeto (100000…) ou Consumo"
        />

        <FilterDropdown
          label="Categoria"
          allLabel="Todas"
          value={filtros.categoria}
          onChange={val => atualizar('categoria', val)}
          options={opcoes.categorias}
          preferredWidth={260}
          title="Filtrar por categoria"
        />

        <FilterDropdown
          label="Aplicação"
          allLabel="Todas"
          value={filtros.aplicacao}
          onChange={val => atualizar('aplicacao', val)}
          options={opcoes.aplicacoes}
          preferredWidth={260}
          title="Filtrar por aplicação"
        />

        <FilterDropdown
          label="Status"
          allLabel="Todos"
          value={filtros.status}
          onChange={val => atualizar('status', val as FiltrosControleEstoque['status'])}
          options={[
            { value: 'CRITICO', label: 'Crítico' },
            { value: 'ALERTA', label: 'Alerta' },
            { value: 'OK', label: 'OK' },
            { value: 'SEM_DADOS', label: 'Sem dados' },
          ]}
          preferredWidth={200}
          title="Filtrar por status"
        />

        <FilterDropdown
          label="RM"
          allLabel="Todas"
          value={filtros.temRm === undefined ? undefined : String(filtros.temRm)}
          onChange={val => atualizar('temRm', val === undefined ? undefined : val === 'true')}
          options={[
            { value: 'true', label: 'Com RM' },
            { value: 'false', label: 'Sem RM' },
          ]}
          preferredWidth={180}
          title="Filtrar por RM"
        />

        <FilterDropdown
          label="PO"
          allLabel="Todos"
          value={filtros.temPo === undefined ? undefined : String(filtros.temPo)}
          onChange={val => atualizar('temPo', val === undefined ? undefined : val === 'true')}
          options={[
            { value: 'true', label: 'Com PO' },
            { value: 'false', label: 'Sem PO' },
          ]}
          preferredWidth={180}
          title="Filtrar por PO"
        />

        <FilterDropdown
          label="Recebimento"
          allLabel="Todos"
          value={filtros.recebimento}
          onChange={val => atualizar('recebimento', val as FiltrosControleEstoque['recebimento'])}
          options={[
            { value: 'COM_RECEBIMENTO', label: 'Com recebimento' },
            { value: 'SEM_RECEBIMENTO', label: 'Sem recebimento' },
          ]}
          preferredWidth={220}
          title="Filtrar por recebimento"
        />

        {opcoes.projetos.length > 0 && (
          <FilterDropdown
            label="Torre (BOM)"
            allLabel="Todas"
            value={filtros.projeto}
            onChange={val => atualizar('projeto', val)}
            options={opcoes.projetos}
            preferredWidth={220}
            title="Filtrar por projeto de torre (BOM)"
          />
        )}

        <button
          type="button"
          onClick={onLimpar}
          className="h-8 shrink-0 rounded-lg border px-2.5 text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--surface-raised)] cursor-pointer transition-colors"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          title="Limpar todos os filtros"
        >
          <RotateCcw className="h-3 w-3" /> Limpar
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useFilterDropdownPosition } from './useFilterDropdownPosition';

export interface FilterDropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface FilterDropdownProps {
  /** Rótulo principal exibido no botão (ex: "Depósito", "Categoria"). */
  label: string;
  /** Valor atualmente selecionado. Undefined/vazio = todos. */
  value?: string;
  /** Callback acionado ao escolher uma opção ou limpar. */
  onChange: (value: string | undefined) => void;
  /** Lista de opções (pode ser lista de strings ou objetos com value e label). */
  options: (string | FilterDropdownOption)[];
  /** Rótulo da opção neutra/limpa (padrão: "Todos"). */
  allLabel?: string;
  /** Ícone opcional exibido à esquerda do botão. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Formatação personalizada para cada opção caso a lista seja de strings cruas. */
  renderOption?: (option: string) => string;
  /** Exibe campo de busca no painel suspenso. Padrão: automático a partir de 7 opções. */
  searchable?: boolean;
  /** Largura ideal do painel suspenso ao abrir (padrão: 260px). */
  preferredWidth?: number;
  /** Classes extras para o botão disparador. */
  className?: string;
  /** Tooltip do botão. */
  title?: string;
}

/**
 * Filtro suspenso compacto (Single Select) do SISTEN.
 *
 * Mantém o botão na barra de filtros compacto e com largura contida,
 * e abre um menu suspenso flutuante (portal ancorado via useFilterDropdownPosition)
 * com largura expandida para ler descrições longas sem forçar rolagem na barra.
 */
export default function FilterDropdown({
  label,
  value,
  onChange,
  options,
  allLabel = 'Todos',
  icon: Icon,
  renderOption,
  searchable,
  preferredWidth = 260,
  className = '',
  title,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const coords = useFilterDropdownPosition(open, containerRef, preferredWidth);

  // Normaliza lista de opções em objetos padronizados
  const opcoesNormalizadas = useMemo<FilterDropdownOption[]>(() => {
    return options.map(opt => {
      if (typeof opt === 'string') {
        return {
          value: opt,
          label: renderOption ? renderOption(opt) : opt,
        };
      }
      return opt;
    });
  }, [options, renderOption]);

  const selecionado = useMemo(() => {
    if (!value) return null;
    return opcoesNormalizadas.find(o => o.value === value) ?? null;
  }, [opcoesNormalizadas, value]);

  const showSearch = searchable ?? opcoesNormalizadas.length >= 7;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const opcoesVisiveis = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return opcoesNormalizadas;
    return opcoesNormalizadas.filter(o => {
      return o.label.toLowerCase().includes(q) || (o.sublabel && o.sublabel.toLowerCase().includes(q)) || o.value.toLowerCase().includes(q);
    });
  }, [opcoesNormalizadas, query]);

  const ativo = Boolean(value);

  const selecionarOpcao = (val: string | undefined) => {
    onChange(val);
    setOpen(false);
  };

  const rotuloExibido = selecionado ? selecionado.label : allLabel;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title || (selecionado ? `${label}: ${selecionado.label}` : `${label}: ${allLabel}`)}
        className={`h-8 rounded-lg border px-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 cursor-pointer select-none max-w-[170px] ${
          ativo
            ? 'border-[var(--brand)] text-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] font-bold'
            : 'border-[var(--hairline)] text-[var(--ink-secondary)] bg-[var(--surface-card)] hover:bg-[var(--surface-raised)]'
        } ${className}`}
      >
        {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${ativo ? 'text-[var(--brand)]' : 'text-[var(--ink-muted)]'}`} />}
        <span className="truncate">
          <span className="opacity-75">{label}:</span> <span className={ativo ? 'font-black' : ''}>{rotuloExibido}</span>
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 ml-auto transition-transform opacity-70 ${open ? 'rotate-180' : ''}`} />
      </button>

      {ativo && !open && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onChange(undefined);
          }}
          aria-label={`Limpar filtro ${label}`}
          title={`Limpar filtro ${label}`}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-[var(--brand)] text-white p-0.5 shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}

      {open && coords && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/15 sm:bg-transparent"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="listbox"
            className="fixed z-50 overflow-hidden flex flex-col rounded-xl border shadow-2xl animate-fade-in"
            style={{
              top: coords.top,
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              background: 'var(--surface-card)',
              borderColor: 'var(--hairline)',
            }}
          >
            {showSearch && (
              <div className="relative border-b p-2 shrink-0" style={{ borderColor: 'var(--hairline)' }}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Buscar em ${label}...`}
                  className="w-full pl-8 pr-2 py-1.5 rounded-lg border text-xs font-semibold focus:outline-none"
                  style={{
                    background: 'var(--surface-sunken)',
                    borderColor: 'var(--hairline)',
                    color: 'var(--ink-primary)',
                  }}
                />
              </div>
            )}

            <div className="overflow-y-auto flex-1 p-1 [scrollbar-width:thin]">
              {/* Opção Todos */}
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => selecionarOpcao(undefined)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs font-bold transition-colors cursor-pointer"
                style={{
                  background: !value ? 'color-mix(in srgb, var(--brand) 10%, transparent)' : 'transparent',
                  color: !value ? 'var(--brand)' : 'var(--ink-secondary)',
                }}
              >
                <span>{label}: {allLabel}</span>
                {!value && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--brand)' }} />}
              </button>

              {opcoesVisiveis.length === 0 && (
                <p className="px-3 py-4 text-xs font-semibold text-center" style={{ color: 'var(--ink-muted)' }}>Nenhuma opção encontrada</p>
              )}

              {opcoesVisiveis.map(opcao => {
                const marcada = value === opcao.value;
                return (
                  <button
                    key={opcao.value}
                    type="button"
                    role="option"
                    aria-selected={marcada}
                    onClick={() => selecionarOpcao(opcao.value)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer hover:bg-[var(--surface-raised)]"
                    style={{
                      background: marcada ? 'color-mix(in srgb, var(--brand) 12%, transparent)' : undefined,
                      color: marcada ? 'var(--brand)' : 'var(--ink-primary)',
                      fontWeight: marcada ? 700 : 500,
                    }}
                  >
                    <div className="min-w-0 flex-1 leading-snug">
                      <span className="break-words">{opcao.label}</span>
                      {opcao.sublabel && (
                        <span className="block text-[10px]" style={{ color: 'var(--ink-muted)' }}>{opcao.sublabel}</span>
                      )}
                    </div>
                    {marcada && <Check className="h-3.5 w-3.5 shrink-0 ml-1.5" style={{ color: 'var(--brand)' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

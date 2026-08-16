/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Campo de busca de material com sugestões.
 *
 * Existe porque o catálogo tem ~2,6 mil códigos de 7 a 18 dígitos que ninguém
 * decora: digitar o código inteiro de memória é inviável, e digitar parte da
 * descrição sem ver o que casa deixa o usuário adivinhando. As sugestões
 * mostram código, descrição e tipo (projeto/consumo) antes do commit, então a
 * escolha é feita olhando, não lembrando.
 *
 * A busca casa código E descrição: quem sabe o código digita o código, quem
 * lembra "cabo flexível" digita isso.
 *
 * Ao selecionar, o campo passa a mostrar a DESCRIÇÃO, não o código: depois de
 * escolher, ninguém relê "100000000000044436" para conferir o que selecionou —
 * relê "TOWER SECTION 120HH". O código continua sendo o que filtra, informado
 * ao pai por `onSelecionarMaterial`, então a tabela recorta num material só em
 * vez de em todos que compartilham uma palavra na descrição. Digitar de novo
 * desfaz a seleção e volta ao filtro por texto livre.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import { Search, X, Boxes, Hammer } from 'lucide-react';
import { isProjetoItem } from '../../lib/almoxarifado';

export interface SugestaoMaterial {
  material: string;
  descricao?: string | null;
}

interface MaterialSearchInputProps {
  valor: string;
  onChange: (v: string) => void;
  /** Universo de materiais para sugerir. Deduplicado internamente. */
  materiais: SugestaoMaterial[];
  /**
   * Código do material escolhido numa sugestão, ou null quando o usuário
   * voltou a digitar texto livre. É por ele que o pai deve filtrar — `valor`
   * carrega a descrição, que é ambígua entre materiais parecidos.
   */
  onSelecionarMaterial?: (material: string | null) => void;
  /** Código atualmente selecionado, para o campo exibir o chip do código. */
  materialSelecionado?: string | null;
  placeholder?: string;
  className?: string;
}

const MAX_SUGESTOES = 8;

/** Normaliza para casar sem depender de acento ou caixa. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export default function MaterialSearchInput({
  valor, onChange, materiais, onSelecionarMaterial, materialSelecionado,
  placeholder = 'Material, descrição, documento...', className = '',
}: MaterialSearchInputProps) {
  const [aberto, setAberto] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // Deduplica por código mantendo a primeira descrição não vazia encontrada.
  const universo = useMemo(() => {
    const mapa = new Map<string, string>();
    materiais.forEach(m => {
      if (!m.material) return;
      const cod = m.material.trim();
      if (!cod) return;
      const atual = mapa.get(cod);
      if (!atual && m.descricao) mapa.set(cod, m.descricao.trim());
      else if (!mapa.has(cod)) mapa.set(cod, '');
    });
    return Array.from(mapa.entries()).map(([material, descricao]) => ({ material, descricao }));
  }, [materiais]);

  const sugestoes = useMemo(() => {
    const q = normalizar(valor.trim());
    if (q.length < 2) return [];

    const porCodigo: typeof universo = [];
    const porDescricao: typeof universo = [];

    for (const item of universo) {
      const cod = item.material.toLowerCase();
      if (cod.includes(q)) {
        porCodigo.push(item);
      } else if (item.descricao && normalizar(item.descricao).includes(q)) {
        porDescricao.push(item);
      }
      // Para cedo: já há material suficiente para preencher a lista com
      // sobra, e varrer 2,6 mil itens a cada tecla não paga o custo.
      if (porCodigo.length >= MAX_SUGESTOES) break;
    }

    // Código antes de descrição: quem digita dígitos quase sempre quer o
    // código, e prefixo antes de "contém" no meio.
    porCodigo.sort((a, b) => {
      const pa = a.material.toLowerCase().startsWith(q) ? 0 : 1;
      const pb = b.material.toLowerCase().startsWith(q) ? 0 : 1;
      return pa !== pb ? pa - pb : a.material.localeCompare(b.material);
    });

    return [...porCodigo, ...porDescricao].slice(0, MAX_SUGESTOES);
  }, [valor, universo]);

  // Com material já escolhido a lista não acrescenta nada — reabre só quando o
  // usuário volta a digitar (o onChange do input limpa a seleção).
  const exibirLista = aberto && sugestoes.length > 0 && !materialSelecionado;

  useEffect(() => { setDestaque(0); }, [valor]);

  useEffect(() => {
    if (!exibirLista) return;
    const aoClicarFora = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [exibirLista]);

  const selecionar = useCallback((material: string, descricao: string) => {
    // Mostra a descrição e guarda o código: depois de escolher, o que se relê
    // para conferir é o nome do material, não a sequência de dígitos.
    // Sem descrição cadastrada não há o que mostrar além do próprio código.
    onChange(descricao || material);
    onSelecionarMaterial?.(material);
    setAberto(false);
    inputRef.current?.focus();
  }, [onChange, onSelecionarMaterial]);

  const aoTeclar = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setAberto(false);
      return;
    }
    if (!exibirLista) {
      // Seta para baixo com o campo já preenchido reabre a lista fechada
      // por Escape, sem obrigar a apagar e redigitar.
      if (e.key === 'ArrowDown' && sugestoes.length > 0) {
        setAberto(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDestaque(d => (d + 1) % sugestoes.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque(d => (d - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === 'Enter') {
      // Só intercepta o Enter quando há uma sugestão destacada; caso
      // contrário o texto livre digitado continua valendo como filtro.
      const alvo = sugestoes[destaque];
      if (alvo) {
        e.preventDefault();
        selecionar(alvo.material, alvo.descricao);
      }
    }
  }, [exibirLista, sugestoes, destaque, selecionar]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={exibirLista}
        aria-controls={exibirLista ? listboxId : undefined}
        aria-activedescendant={exibirLista ? `${listboxId}-${destaque}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={valor}
        onChange={e => {
          onChange(e.target.value);
          // Editar o texto desfaz a seleção: o campo volta a ser filtro livre,
          // senão continuaria recortando pelo código antigo enquanto mostra
          // outra coisa escrita.
          onSelecionarMaterial?.(null);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={aoTeclar}
        className="w-full pl-8 py-2 text-xs rounded-lg border outline-none transition-all focus:outline-2 focus:outline-offset-1"
        style={{
          borderColor: materialSelecionado ? 'var(--brand)' : 'var(--hairline)',
          background: 'var(--surface-raised)',
          color: 'var(--ink-primary)',
          outlineColor: 'var(--brand)',
          // Abre espaço à direita para o chip do código mais o botão de limpar.
          paddingRight: materialSelecionado ? 132 : 28,
        }}
      />

      {/* O código não some da tela: vira etiqueta ao lado, para o campo dizer
          o nome do material sem esconder qual código está de fato filtrando. */}
      {materialSelecionado && (
        <span
          className="absolute right-8 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded pointer-events-none max-w-[96px] truncate"
          style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}
          title={`Filtrando pelo material ${materialSelecionado}`}
        >
          {materialSelecionado}
        </span>
      )}

      {valor && (
        <button
          onClick={() => {
            onChange('');
            onSelecionarMaterial?.(null);
            setAberto(false);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
          style={{ color: 'var(--ink-muted)' }}
          title="Limpar pesquisa"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {exibirLista && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Materiais sugeridos"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border shadow-lg"
          style={{
            borderColor: 'var(--hairline)',
            background: 'var(--surface-card)',
            boxShadow: '0 8px 24px -6px rgb(0 0 0 / 0.18)',
          }}
        >
          {sugestoes.map((s, i) => {
            const projeto = isProjetoItem(s.material);
            const Icone = projeto ? Hammer : Boxes;
            const ativo = i === destaque;
            return (
              <li
                key={s.material}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={ativo}
                onMouseEnter={() => setDestaque(i)}
                onMouseDown={e => { e.preventDefault(); selecionar(s.material, s.descricao); }}
                className="flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b last:border-b-0"
                style={{
                  borderColor: 'var(--hairline)',
                  background: ativo ? 'var(--surface-raised)' : 'transparent',
                }}
              >
                <Icone className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
                <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: 'var(--ink-primary)' }}>
                  {s.material}
                </span>
                <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: 'var(--ink-secondary)' }}>
                  {s.descricao || '—'}
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                >
                  {projeto ? 'Projeto' : 'Consumo'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

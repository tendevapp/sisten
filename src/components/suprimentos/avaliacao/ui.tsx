/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Peças visuais da Ava. Fornecedor: estrelas, chips de seleção, busca de
 * fornecedor (ZL0132) e indicadores. Tudo em tokens do tema (claro/escuro).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, Search, Star, X } from 'lucide-react';
import { buscarFornecedores, type FornecedorOpcao } from '../../../lib/avaliacaoFornecedoresApi';
import { ROTULO_ESTRELAS } from '../../../lib/avaliacaoFornecedores';

export const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

export const rotuloCls = 'block text-[11px] font-bold uppercase tracking-wide mb-1.5 text-[var(--ink-muted)]';

// ---------------------------------------------------------------------------
// Estrelas
// ---------------------------------------------------------------------------

export function Estrelas({
  valor, onChange, tamanho = 'md', mostrarRotulo = false,
}: { valor: number | null; onChange?: (v: number) => void; tamanho?: 'sm' | 'md' | 'lg'; mostrarRotulo?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const atual = hover ?? valor ?? 0;
  const px = tamanho === 'lg' ? 'h-8 w-8' : tamanho === 'md' ? 'h-5 w-5' : 'h-3.5 w-3.5';
  const editavel = !!onChange;
  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center" onMouseLeave={() => setHover(null)} role={editavel ? 'radiogroup' : undefined} aria-label="Nota em estrelas">
        {[1, 2, 3, 4, 5].map(n => {
          const cheia = n <= Math.round(atual);
          const icone = (
            <Star
              className={`${px} transition-transform`}
              style={{ color: cheia ? '#f59e0b' : 'var(--hairline)', fill: cheia ? '#f59e0b' : 'transparent' }}
              strokeWidth={1.6}
            />
          );
          return editavel ? (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={valor === n}
              aria-label={`${n} estrela(s) — ${ROTULO_ESTRELAS[n]}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => onChange!(n)}
              className="p-0.5 hover:scale-110 active:scale-95 transition-transform"
            >
              {icone}
            </button>
          ) : (
            <span key={n} className="p-[1px]">{icone}</span>
          );
        })}
      </div>
      {mostrarRotulo && (
        <span className="text-sm font-bold min-w-[64px]" style={{ color: atual ? '#b45309' : 'var(--ink-muted)' }}>
          {atual ? ROTULO_ESTRELAS[Math.round(atual)] : 'Sem nota'}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

export function Chip({
  ativo, onClick, children, cor = 'var(--brand)', title, compacto,
}: { ativo: boolean; onClick: () => void; children: React.ReactNode; cor?: string; title?: string; compacto?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-all ${compacto ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}`}
      style={ativo
        ? { borderColor: cor, color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }
        : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-raised)' }}
    >
      {children}
    </button>
  );
}

/** Etiqueta só de leitura (categoria, gravidade, decisão...). */
export function Etiqueta({ cor, children, title }: { cor: string; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 13%, transparent)` }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Indicador
// ---------------------------------------------------------------------------

export function Indicador({
  icon: Icon, rotulo, valor, tom, onClick, dica,
}: { icon: typeof Star; rotulo: string; valor: React.ReactNode; tom: string; onClick?: () => void; dica?: string }) {
  const conteudo = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${tom} 14%, transparent)`, color: tom }}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold leading-tight" style={{ color: 'var(--ink-primary)' }}>{valor}</span>
        <span className="block text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left';
  const estilo = { borderColor: 'var(--hairline)', background: 'var(--surface-card)' };
  return onClick ? (
    <button type="button" title={dica} onClick={onClick} className={`${cls} transition-all hover:-translate-y-0.5`} style={estilo}>{conteudo}</button>
  ) : (
    <div title={dica} className={cls} style={estilo}>{conteudo}</div>
  );
}

// ---------------------------------------------------------------------------
// Busca de fornecedor (ZL0132)
// ---------------------------------------------------------------------------

export function BuscaFornecedor({
  valor, onChange, autoFocus,
}: { valor: FornecedorOpcao | null; onChange: (f: FornecedorOpcao | null) => void; autoFocus?: boolean }) {
  const [termo, setTermo] = useState('');
  const [opcoes, setOpcoes] = useState<FornecedorOpcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (valor) return;
    const t = termo.trim();
    if (t.length < 2) { setOpcoes([]); return; }
    const id = ++seq.current;
    setCarregando(true);
    const timer = setTimeout(async () => {
      try {
        const lista = await buscarFornecedores(t);
        if (id === seq.current) { setOpcoes(lista); setErro(''); }
      } catch (e: any) {
        if (id === seq.current) setErro(e?.message || 'Falha na busca.');
      } finally {
        if (id === seq.current) setCarregando(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [termo, valor]);

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--brand)', background: 'color-mix(in srgb, var(--brand) 6%, var(--surface-raised))' }}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--surface-card)', color: 'var(--brand)' }}>
          <Building2 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>{valor.fornecedor_nome}</div>
          <div className="text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>
            {valor.fornecedor_codigo ? `SAP ${valor.fornecedor_codigo}` : 'Sem código SAP'}
            {valor.cnpj ? ` · CNPJ ${formatarCnpj(valor.cnpj)}` : ''}
          </div>
        </div>
        <button type="button" onClick={() => { onChange(null); setTermo(''); }} className="rounded-md p-1.5 hover:bg-[var(--surface-card)]" aria-label="Trocar fornecedor" style={{ color: 'var(--ink-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const usarDigitado = termo.trim().length >= 3;
  return (
    <div className="relative">
      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
        <input
          autoFocus={autoFocus}
          value={termo}
          onChange={e => { setTermo(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 180)}
          placeholder="Nome, código SAP ou CNPJ do fornecedor…"
          className={`${inputCls} pl-9 pr-9`}
        />
        {carregando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin" style={{ color: 'var(--ink-muted)' }} />}
      </label>
      {aberto && (opcoes.length > 0 || usarDigitado || erro) && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          {erro && <div className="px-3 py-2 text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</div>}
          {opcoes.map(o => (
            <button
              key={o.fornecedor_codigo || o.fornecedor_nome}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(o); setAberto(false); }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--surface-raised)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold" style={{ color: 'var(--ink-primary)' }}>{o.fornecedor_nome}</span>
                <span className="block text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>
                  {o.fornecedor_codigo}{o.cnpj ? ` · ${formatarCnpj(o.cnpj)}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-muted)' }}>{o.pedidos ? `${o.pedidos} PO` : ''}</span>
            </button>
          ))}
          {usarDigitado && !carregando && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange({ fornecedor_codigo: null, fornecedor_nome: termo.trim().toUpperCase(), cnpj: null }); setAberto(false); }}
              className="w-full border-t px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--surface-raised)]"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Usar “{termo.trim().toUpperCase()}” (fornecedor fora da ZL0132)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Barra de porcentagem (nota FRM, OTD...). */
export function BarraPct({ valor, cor }: { valor: number | null; cor: string }) {
  const pct = valor == null ? 0 : Math.max(0, Math.min(1, valor)) * 100;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-raised)' }}>
      <span className="block h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
    </span>
  );
}

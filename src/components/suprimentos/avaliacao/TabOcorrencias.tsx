/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Aba "Ocorrências": no topo, os POs com pendência de recebimento / de NF que
 * ainda não viraram registro (um clique abre o lançamento já preenchido);
 * embaixo, os registros com busca e filtros.
 */

import React, { useMemo, useState } from 'react';
import {
  CheckSquare, ChevronDown, ChevronUp, ClipboardList, Inbox, Plus, Search, Square, Tags, XCircle,
} from 'lucide-react';
import type { Profile } from '../../../types';
import MultiSelectFilter from '../../ui/MultiSelectFilter';
import {
  CATEGORIAS, CATEGORIA_POR_ID, normalizarBusca, rotuloRefPendencia, rotuloTipo,
  type CategoriaOcorrencia,
} from '../../../lib/avaliacaoFornecedores';
import type { RegistroOcorrencia, SugestaoRegistro } from '../../../lib/avaliacaoFornecedoresApi';
import { formatarDataBR } from '../../../lib/fichaEpi';
import { podeEditarFormulario } from '../../../lib/permissoesFormularios';
import { Chip, Etiqueta, inputCls } from './ui';
import RegistroCartao from './RegistroCartao';

type Periodo = '30' | '90' | '365' | 'todos';

/** A sugestão é do usuário quando ele é o comprador do PO (id ou primeiro nome). */
export function sugestaoEhMinha(s: SugestaoRegistro, user: Profile): boolean {
  if (s.comprador_id && s.comprador_id === user.id) return true;
  const primeiro = (n?: string | null) => normalizarBusca(n).split(/\s+/)[0] || '';
  return !!s.comprador_nome && !s.comprador_id && primeiro(s.comprador_nome) === primeiro(user.name);
}

export default function TabOcorrencias({
  user, registros, sugestoes, carregando, onNovo, onRegistrarSugestao, onDispensar, onEditar, onExcluir, onFornecedor,
}: {
  user: Profile;
  registros: RegistroOcorrencia[];
  sugestoes: SugestaoRegistro[];
  carregando: boolean;
  onNovo: () => void;
  onRegistrarSugestao: (s: SugestaoRegistro) => void;
  onDispensar: (s: SugestaoRegistro) => void;
  onEditar: (r: RegistroOcorrencia) => void;
  onExcluir: (r: RegistroOcorrencia) => void;
  onFornecedor: (r: RegistroOcorrencia) => void;
}) {
  const minhasSugestoes = useMemo(() => sugestoes.filter(s => sugestaoEhMinha(s, user)), [sugestoes, user]);
  const [soMinhasSug, setSoMinhasSug] = useState<boolean | null>(null);
  const filtrarMinhas = soMinhasSug ?? minhasSugestoes.length > 0;
  const [verTodasSug, setVerTodasSug] = useState(false);
  const listaSug = filtrarMinhas ? minhasSugestoes : sugestoes;
  const sugVisiveis = verTodasSug ? listaSug : listaSug.slice(0, 6);

  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>('90');
  const [categorias, setCategorias] = useState<Set<string>>(new Set());
  const [soMeus, setSoMeus] = useState(false);

  const filtrados = useMemo(() => {
    const desde = periodo === 'todos' ? '' : dataMenosDias(Number(periodo));
    const termo = normalizarBusca(busca);
    return registros.filter(r => {
      if (desde && r.data_registro < desde) return false;
      if (soMeus && r.criado_por !== user.id) return false;
      if (categorias.size && !(r.ocorrencias || []).some(o => categorias.has(o.categoria))) return false;
      if (termo) {
        const alvo = normalizarBusca([
          r.codigo, r.fornecedor_nome, r.fornecedor_codigo, r.nro_pedido, r.nota_fiscal, r.material_resumo, r.criado_por_nome,
          ...(r.ocorrencias || []).map(o => `${rotuloTipo(o.tipo)} ${o.descricao}`),
        ].filter(Boolean).join(' '));
        if (!termo.split(/\s+/).every(t => alvo.includes(t))) return false;
      }
      return true;
    });
  }, [registros, busca, periodo, categorias, soMeus, user.id]);

  return (
    <div className="space-y-6">
      {/* Sugestões */}
      <section className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              <Inbox className="h-4 w-4" style={{ color: 'var(--brand)' }} />
              POs com pendência para registrar
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: listaSug.length ? '#d97706' : 'var(--ink-muted)' }}>{listaSug.length}</span>
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Pendências de recebimento (avaria, falta, parcial…) e de NF dos últimos 120 dias que ainda não viraram ocorrência.
            </p>
          </div>
          <button type="button" onClick={() => setSoMinhasSug(!filtrarMinhas)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold"
            style={{ borderColor: filtrarMinhas ? 'var(--brand)' : 'var(--hairline)', color: filtrarMinhas ? 'var(--brand)' : 'var(--ink-secondary)' }}>
            {filtrarMinhas ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} Só os meus POs ({minhasSugestoes.length})
          </button>
        </header>

        {listaSug.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
            {carregando ? 'Carregando…' : 'Nada pendente — toda pendência já virou registro ou foi dispensada.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
            {sugVisiveis.map(s => (
              <div key={s.nro_pedido} className="flex flex-col justify-between gap-3 rounded-xl border p-3.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>PO {s.nro_pedido}</span>
                    <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{formatarDataBR(s.data)}</span>
                  </div>
                  <div className="truncate text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }} title={s.fornecedor_nome || ''}>{s.fornecedor_nome || 'Fornecedor não identificado'}</div>
                  <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Comprador: <b>{s.comprador_nome || '—'}</b></div>
                  <div className="flex flex-wrap gap-1">
                    {s.refs.slice(0, 5).map(r => (
                      <Etiqueta key={r.ref} cor={r.origem === 'PEND_NF' ? CATEGORIA_POR_ID.NOTA_FISCAL.cor : CATEGORIA_POR_ID.QUALIDADE.cor}>
                        {rotuloRefPendencia(r)}
                      </Etiqueta>
                    ))}
                    {s.refs.length > 5 && <Etiqueta cor="#64748b">+{s.refs.length - 5}</Etiqueta>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onRegistrarSugestao(s)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
                    <ClipboardList className="h-3.5 w-3.5" /> Registrar
                  </button>
                  <button type="button" onClick={() => onDispensar(s)} title="Não é falha do fornecedor / não registrar" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                    <XCircle className="h-3.5 w-3.5" /> Dispensar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {listaSug.length > 6 && (
          <button type="button" onClick={() => setVerTodasSug(v => !v)} className="flex w-full items-center justify-center gap-1 border-t py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}>
            {verTodasSug ? <><ChevronUp className="h-3.5 w-3.5" /> Mostrar menos</> : <><ChevronDown className="h-3.5 w-3.5" /> Ver todos ({listaSug.length})</>}
          </button>
        )}
      </section>

      {/* Registros */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>Registros <span style={{ color: 'var(--ink-muted)' }}>({filtrados.length})</span></h3>
          <button type="button" onClick={onNovo} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>
            <Plus className="h-4 w-4" /> Nova ocorrência
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Fornecedor, PO, NF, código, tipo…" className={`${inputCls} pl-9`} />
          </label>
          <MultiSelectFilter
            label="Categoria"
            icon={Tags}
            options={CATEGORIAS.map(c => c.id)}
            selected={categorias}
            onChange={setCategorias}
            renderOption={o => CATEGORIA_POR_ID[o as CategoriaOcorrencia]?.rotulo || o}
          />
          <div className="flex items-center gap-1">
            {([['30', '30 dias'], ['90', '90 dias'], ['365', '12 meses'], ['todos', 'Tudo']] as [Periodo, string][]).map(([v, r]) => (
              <Chip key={v} compacto ativo={periodo === v} onClick={() => setPeriodo(v)}>{r}</Chip>
            ))}
          </div>
          <Chip compacto ativo={soMeus} onClick={() => setSoMeus(v => !v)}>Só os meus</Chip>
        </div>

        {filtrados.length === 0 ? (
          <div className="rounded-xl border py-12 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            {carregando ? 'Carregando registros…' : registros.length === 0
              ? 'Nenhuma ocorrência registrada ainda. Comece pelos POs com pendência acima ou em “Nova ocorrência”.'
              : 'Nada com esses filtros.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtrados.map(r => (
              <RegistroCartao
                key={r.id}
                registro={r}
                podeEditar={podeEditarFormulario(user, r)}
                onEditar={() => onEditar(r)}
                onExcluir={() => onExcluir(r)}
                onFornecedor={() => onFornecedor(r)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function dataMenosDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

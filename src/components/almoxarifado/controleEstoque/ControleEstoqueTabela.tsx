import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Pencil, ShieldAlert } from 'lucide-react';
import type { ControleEstoqueAnalise } from '../../../lib/controleEstoque';
import { formatBRL, formatQtd } from '../../../lib/almoxarifado';
import { formatInt } from '../../../lib/format';
import Pagination from '../../ui/Pagination';

interface Props {
  linhas: ControleEstoqueAnalise[];
  loading?: boolean;
  onSelecionar: (linha: ControleEstoqueAnalise) => void;
  onEditar?: (linha: ControleEstoqueAnalise) => void;
}

const PAGE_SIZE = 50;

const statusVisual = {
  CRITICO: { label: 'Crítico', cor: 'var(--status-critical)', fundo: 'color-mix(in srgb, var(--status-critical) 12%, transparent)' },
  ALERTA: { label: 'Alerta', cor: 'var(--status-warning)', fundo: 'color-mix(in srgb, var(--status-warning) 12%, transparent)' },
  OK: { label: 'OK', cor: 'var(--status-good)', fundo: 'color-mix(in srgb, var(--status-good) 12%, transparent)' },
  SEM_DADOS: { label: 'Sem dados', cor: 'var(--ink-muted)', fundo: 'var(--surface-sunken)' },
} as const;

export const StatusBadge = ({ status }: { status: keyof typeof statusVisual }) => {
  const visual = statusVisual[status];
  return <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide" style={{ color: visual.cor, background: visual.fundo }}>{visual.label}</span>;
};

export default function ControleEstoqueTabela({ linhas, loading, onSelecionar, onEditar }: Props) {
  const [pagina, setPagina] = useState(0);
  useEffect(() => setPagina(0), [linhas]);
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / PAGE_SIZE));
  const visiveis = useMemo(() => linhas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [linhas, pagina]);

  if (loading) {
    return <div className="rounded-xl border p-8 text-center text-sm animate-pulse" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>Carregando posição, consumo e ciclo de compras...</div>;
  }
  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <ShieldAlert className="mx-auto h-8 w-8 mb-2" style={{ color: 'var(--ink-muted)' }} />
        <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>Nenhum material encontrado</p>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>Ajuste os filtros ou confirme se as bases SAP foram atualizadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden md:block overflow-auto max-h-[64vh] rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <table className="min-w-[1580px] w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-raised)' }}>
            <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
              {['Material / descrição', 'Categoria / aplicação', 'Saldo', 'Consumo/dia', 'Mínimo', 'Máximo', 'Comprar', 'Valor', 'Status', 'Cobertura', 'Autonomia', 'RM', 'PO', 'Recebido', ''].map(titulo => (
                <th key={titulo} className="px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>{titulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map(linha => {
              const { item, faixa } = linha;
              return (
                <tr key={`${item.centro}-${item.material}`} className="border-b cursor-pointer hover:bg-[var(--surface-raised)]" style={{ borderColor: 'var(--hairline)' }} onClick={() => onSelecionar(linha)}>
                  <td className="px-3 py-2.5 max-w-72">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black" style={{ color: 'var(--ink-primary)' }}>{item.material}</span>
                      {item.tem_override && <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>override</span>}
                    </div>
                    <p className="truncate mt-0.5" title={item.descricao ?? ''} style={{ color: 'var(--ink-muted)' }}>{item.descricao || 'Sem descrição'}</p>
                  </td>
                  <td className="px-3 py-2.5 max-w-56">
                    <p className="truncate font-semibold" title={item.categoria ?? ''}>{item.categoria || '—'}</p>
                    <p className="truncate text-[10px]" title={item.aplicacao ?? ''} style={{ color: 'var(--ink-muted)' }}>{item.aplicacao || '—'}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular font-bold">{formatQtd(item.saldo_reposicao)} {item.umb ?? ''}</td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.consumoDia === null ? '—' : formatQtd(faixa.consumoDia)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.estoqueMinimo === null ? '—' : formatQtd(faixa.estoqueMinimo)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.estoqueMaximo === null ? '—' : formatQtd(faixa.estoqueMaximo)}</td>
                  <td className="px-3 py-2.5 text-right tabular font-black" style={{ color: faixa.quantidadeComprar ? 'var(--status-critical)' : 'var(--ink-primary)' }}>{faixa.quantidadeComprar === null ? '—' : formatQtd(faixa.quantidadeComprar)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.valorComprar === null ? '—' : formatBRL(faixa.valorComprar)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={faixa.status} /></td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.coberturaDias === null ? '—' : `${formatInt(faixa.coberturaDias)} d`}</td>
                  <td className="px-3 py-2.5 text-right tabular">{faixa.autonomiaTorres === null ? '—' : formatQtd(faixa.autonomiaTorres)}</td>
                  <td className="px-3 py-2.5 text-right tabular">{item.rms_abertas}</td>
                  <td className="px-3 py-2.5 text-right tabular">{item.pos_abertas}</td>
                  <td className="px-3 py-2.5 text-right tabular">{formatQtd(item.quantidade_recebida)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      {onEditar && <button type="button" aria-label="Editar parâmetros" onClick={event => { event.stopPropagation(); onEditar(linha); }} className="rounded-lg p-1.5 hover:bg-[var(--surface-sunken)]"><Pencil className="h-3.5 w-3.5" /></button>}
                      <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {visiveis.map(linha => {
          const { item, faixa } = linha;
          return (
            <button key={`${item.centro}-${item.material}`} type="button" onClick={() => onSelecionar(linha)} className="rounded-xl border p-4 text-left" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-black truncate" style={{ color: 'var(--ink-primary)' }}>{item.material}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>{item.descricao || 'Sem descrição'}</p>
                </div>
                <StatusBadge status={faixa.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Saldo</p><p className="font-black tabular">{formatQtd(item.saldo_reposicao)}</p></div>
                <div><p className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Mínimo</p><p className="font-black tabular">{faixa.estoqueMinimo === null ? '—' : formatQtd(faixa.estoqueMinimo)}</p></div>
                <div><p className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Comprar</p><p className="font-black tabular" style={{ color: faixa.quantidadeComprar ? 'var(--status-critical)' : undefined }}>{faixa.quantidadeComprar === null ? '—' : formatQtd(faixa.quantidadeComprar)}</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                <span>{item.rms_abertas} RM · {item.pos_abertas} PO · {formatQtd(item.quantidade_recebida)} recebido</span>
                <span className="flex items-center gap-1">Detalhar <ChevronRight className="h-3.5 w-3.5" /></span>
              </div>
            </button>
          );
        })}
      </div>

      <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} info={`${linhas.length.toLocaleString('pt-BR')} materiais`} />
    </div>
  );
}

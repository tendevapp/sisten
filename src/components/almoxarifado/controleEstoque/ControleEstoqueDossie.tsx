import React, { useEffect, useMemo, useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import { exportarDossieExcel, type LinhaDossie } from '../../../lib/controleEstoqueDossie';
import { formatQtd } from '../../../lib/almoxarifado';
import { formatDateBR, formatInt } from '../../../lib/format';
import Pagination from '../../ui/Pagination';
import { StatusBadge } from './ControleEstoqueTabela';

interface Props {
  linhas: LinhaDossie[];
  loading?: boolean;
  onSelecionar: (chave: string) => void;
}

const PAGE_SIZE = 50;

const tom = (token: string, pct = 14) => `color-mix(in srgb, ${token} ${pct}%, transparent)`;

// Grupos de colunas com a mesma leitura de cor da planilha de origem.
const GRUPOS = [
  { titulo: 'Estoque', cor: tom('var(--series-4)'), colunas: ['Material', 'Texto breve material', 'Total Stk (ZL0024)', 'UM'] },
  { titulo: 'Faixa da planilha', cor: tom('var(--series-3)'), colunas: ['Stk Mínimo', 'PR (RM)'] },
  { titulo: 'Mínimo SISTEN', cor: tom('var(--series-2)'), colunas: ['Sft STK (mínimo)', 'PR'] },
  { titulo: 'Situação', cor: tom('var(--status-warning)'), colunas: ['Status', 'Cobertura (dias)'] },
  { titulo: 'Requisição', cor: tom('var(--status-good)'), colunas: ['RM', 'Data RM', 'Requisitante', 'Quant. solicitada', 'Existe RM?'] },
  { titulo: 'Pedido e chegada', cor: tom('var(--series-1)'), colunas: ['Pedido', 'Data pedido', 'Chegou?', 'Quant. chegou'] },
] as const;

const ALINHADAS_DIREITA = new Set(['Total Stk (ZL0024)', 'Stk Mínimo', 'PR (RM)', 'Sft STK (mínimo)', 'PR', 'Cobertura (dias)', 'Quant. solicitada', 'Quant. chegou']);

const vazio = <span style={{ color: 'var(--ink-muted)' }}>—</span>;
const qtd = (valor: number | null) => (valor === null ? vazio : formatQtd(valor));

const SimNao = ({ valor, bom }: { valor: boolean; bom: boolean }) => {
  const ok = valor === bom;
  const cor = ok ? 'var(--status-good)' : 'var(--status-critical)';
  return (
    <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-black" style={{ color: cor, background: tom(cor, 12) }}>
      {valor ? 'SIM' : 'NÃO'}
    </span>
  );
};

export default function ControleEstoqueDossie({ linhas, loading, onSelecionar }: Props) {
  const [somenteReposicao, setSomenteReposicao] = useState(true);
  const [pagina, setPagina] = useState(0);

  const visiveis = useMemo(
    () => (somenteReposicao ? linhas.filter(l => l.status === 'CRITICO' || l.status === 'ALERTA') : linhas),
    [linhas, somenteReposicao],
  );
  const materiais = useMemo(() => new Set(visiveis.map(l => l.material)).size, [visiveis]);
  useEffect(() => setPagina(0), [visiveis]);

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / PAGE_SIZE));
  const pagina50 = useMemo(() => visiveis.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [visiveis, pagina]);

  if (loading) {
    return <div className="rounded-xl border p-8 text-center text-sm animate-pulse" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>Montando o dossiê dos materiais...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={somenteReposicao} onChange={e => setSomenteReposicao(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
          Só materiais Crítico ou Alerta
        </label>
        <div className="flex items-center gap-3">
          <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            {formatInt(materiais)} materiais · {formatInt(visiveis.length)} linhas
          </span>
          <button
            type="button"
            onClick={() => exportarDossieExcel(visiveis)}
            disabled={visiveis.length === 0}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
          >
            <Download className="h-3.5 w-3.5" /> Exportar dossiê
          </button>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <ShieldAlert className="mx-auto h-8 w-8 mb-2" style={{ color: 'var(--ink-muted)' }} />
          <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>Nenhum material neste recorte</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>Ajuste os filtros ou desmarque "Só materiais Crítico ou Alerta".</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-auto max-h-[64vh] rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <table className="min-w-[1700px] w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-raised)' }}>
                <tr>
                  {GRUPOS.map(grupo => (
                    <th key={grupo.titulo} colSpan={grupo.colunas.length} className="px-3 py-1.5 text-center text-[10px] font-black uppercase tracking-wider border-l" style={{ background: grupo.cor, color: 'var(--ink-primary)', borderColor: 'var(--hairline)' }}>
                      {grupo.titulo}
                    </th>
                  ))}
                </tr>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  {GRUPOS.flatMap(grupo => grupo.colunas.map((coluna, i) => (
                    <th key={`${grupo.titulo}-${coluna}`} className={`px-3 py-2 text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${ALINHADAS_DIREITA.has(coluna) ? 'text-right' : 'text-left'} ${i === 0 ? 'border-l' : ''}`} style={{ background: grupo.cor, color: 'var(--ink-muted)', borderColor: 'var(--hairline)' }}>{coluna}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {pagina50.map(linha => {
                  const repetida = !linha.primeiraDoMaterial;
                  const esmaecido = repetida ? { color: 'var(--ink-muted)' } : undefined;
                  return (
                    <tr
                      key={linha.chave}
                      onClick={() => onSelecionar(linha.chave)}
                      className="cursor-pointer hover:bg-[var(--surface-raised)]"
                      style={{ borderTop: linha.primeiraDoMaterial ? '2px solid var(--hairline)' : '1px dashed var(--hairline)' }}
                    >
                      <td className="px-3 py-2 font-mono font-black whitespace-nowrap" style={esmaecido}>{linha.material}</td>
                      <td className="px-3 py-2 max-w-64"><p className="truncate" title={linha.descricao ?? ''} style={esmaecido}>{linha.descricao || 'Sem descrição'}</p></td>
                      <td className="px-3 py-2 text-right tabular font-bold" style={esmaecido} title={linha.saldoTotal !== linha.saldo ? `Saldo total ${formatQtd(linha.saldoTotal)} (inclui depósitos fora da reposição)` : undefined}>{formatQtd(linha.saldo)}</td>
                      <td className="px-3 py-2" style={esmaecido}>{linha.umb ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular border-l" style={esmaecido}>{qtd(linha.minimo)}</td>
                      <td className="px-3 py-2 text-right tabular font-black" style={repetida ? esmaecido : { color: linha.propostaRm ? 'var(--status-critical)' : undefined }}>{qtd(linha.propostaRm)}</td>
                      <td className="px-3 py-2 text-right tabular border-l" style={esmaecido}>{qtd(linha.minimoSisten)}</td>
                      <td className="px-3 py-2 text-right tabular" style={esmaecido} title="2 × mínimo SISTEN, mesma relação da planilha">{qtd(linha.prSisten)}</td>
                      <td className="px-3 py-2 border-l"><StatusBadge status={linha.status} /></td>
                      <td className="px-3 py-2 text-right tabular" style={esmaecido}>{linha.coberturaDias === null ? vazio : formatInt(linha.coberturaDias)}</td>
                      <td className="px-3 py-2 font-mono border-l">{linha.rm ?? vazio}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{linha.dataRm ? formatDateBR(linha.dataRm) : vazio}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{linha.requisitante ?? vazio}</td>
                      <td className="px-3 py-2 text-right tabular">{qtd(linha.quantidadeSolicitada)}</td>
                      <td className="px-3 py-2"><SimNao valor={linha.existeRm} bom /></td>
                      <td className="px-3 py-2 font-mono border-l">{linha.pedido ?? vazio}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{linha.dataPedido ? formatDateBR(linha.dataPedido) : vazio}</td>
                      <td className="px-3 py-2"><SimNao valor={linha.chegou} bom /></td>
                      <td className="px-3 py-2 text-right tabular">{qtd(linha.quantidadeChegou)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {pagina50.map(linha => (
              <button key={linha.chave} type="button" onClick={() => onSelecionar(linha.chave)} className="rounded-xl border p-4 text-left" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black truncate" style={{ color: 'var(--ink-primary)' }}>{linha.material}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>{linha.descricao || 'Sem descrição'}</p>
                  </div>
                  <StatusBadge status={linha.status} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {([['Saldo', qtd(linha.saldo)], ['Mínimo', qtd(linha.minimo)], ['Comprar', qtd(linha.propostaRm)], ['Cobert.', linha.coberturaDias === null ? vazio : `${formatInt(linha.coberturaDias)} d`]] as const).map(([rotulo, valor]) => (
                    <div key={rotulo}><p className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</p><p className="font-black tabular text-xs">{valor}</p></div>
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>RM</dt><dd className="font-mono">{linha.rm ?? 'Sem RM'}{linha.dataRm ? ` · ${formatDateBR(linha.dataRm)}` : ''}</dd></div>
                  <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Requisitante</dt><dd>{linha.requisitante ?? '—'}</dd></div>
                  <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Pedido</dt><dd className="font-mono">{linha.pedido ?? '—'}{linha.dataPedido ? ` · ${formatDateBR(linha.dataPedido)}` : ''}</dd></div>
                  <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Chegou?</dt><dd><SimNao valor={linha.chegou} bom />{linha.quantidadeChegou !== null ? ` ${formatQtd(linha.quantidadeChegou)}` : ''}</dd></div>
                </dl>
              </button>
            ))}
          </div>

          <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} info={`${formatInt(visiveis.length)} linhas`} />
        </>
      )}
    </div>
  );
}

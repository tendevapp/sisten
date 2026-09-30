import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CornerDownRight, Download, ShieldAlert } from 'lucide-react';
import {
  ROTULO_SITUACAO_CHEGADA,
  exportarDossieExcel,
  type EntregaDossie,
  type LinhaDossie,
  type ResumoCompraDossie,
  type SituacaoChegada,
} from '../../../lib/controleEstoqueDossie';
import { formatQtd } from '../../../lib/almoxarifado';
import { formatDateBR, formatInt } from '../../../lib/format';
import Pagination from '../../ui/Pagination';
import { StatusBadge } from './StatusBadge';

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
  { titulo: 'Pedido e chegada', cor: tom('var(--series-1)'), colunas: ['Pedido', 'Data pedido', 'Quant. pedida', 'Chegou?', 'Quant. chegou', 'A chegar', 'Entregas'] },
] as const;

const TOTAL_COLUNAS = GRUPOS.reduce((total, grupo) => total + grupo.colunas.length, 0);

const ALINHADAS_DIREITA = new Set([
  'Total Stk (ZL0024)', 'Stk Mínimo', 'PR (RM)', 'Sft STK (mínimo)', 'PR', 'Cobertura (dias)',
  'Quant. solicitada', 'Quant. pedida', 'Quant. chegou', 'A chegar',
]);

const vazio = <span style={{ color: 'var(--ink-muted)' }}>—</span>;
const qtd = (valor: number | null) => (valor === null ? vazio : formatQtd(valor));

const COR_SITUACAO: Record<SituacaoChegada, string> = {
  SIM: 'var(--status-good)',
  PARCIAL: 'var(--status-warning)',
  NAO: 'var(--status-critical)',
  SEM_PEDIDO: 'var(--ink-muted)',
};

const SituacaoBadge = ({ situacao }: { situacao: SituacaoChegada }) => (
  <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-black whitespace-nowrap" style={{ color: COR_SITUACAO[situacao], background: tom(COR_SITUACAO[situacao], 12) }}>
    {ROTULO_SITUACAO_CHEGADA[situacao]}
  </span>
);

const SimNao = ({ valor }: { valor: boolean }) => {
  const cor = valor ? 'var(--status-good)' : 'var(--status-critical)';
  return (
    <span className="inline-flex rounded px-2 py-0.5 text-[10px] font-black" style={{ color: cor, background: tom(cor, 12) }}>
      {valor ? 'SIM' : 'NÃO'}
    </span>
  );
};

/** "chegou / pedido" com barra de progresso: a entrega parcial se lê de relance. */
const Chegada = ({ linha }: { linha: LinhaDossie }) => {
  if (linha.quantidadePedida === null) return <>{qtd(linha.quantidadeChegou)}</>;
  const chegou = linha.quantidadeChegou ?? 0;
  const pct = linha.quantidadePedida > 0 ? Math.min(100, (chegou / linha.quantidadePedida) * 100) : 0;
  return (
    <div className="min-w-24">
      <p className="text-right tabular whitespace-nowrap">
        <span className="font-bold">{formatQtd(chegou)}</span>
        <span style={{ color: 'var(--ink-muted)' }}> / {formatQtd(linha.quantidadePedida)}</span>
      </p>
      <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-sunken)' }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COR_SITUACAO[linha.situacao] }} />
      </div>
    </div>
  );
};

const ResumoMaterial = ({ resumo }: { resumo: ResumoCompraDossie }) => {
  if (resumo.rms === 0 && resumo.pedidos === 0) return null;
  const itens = [
    `${resumo.rms} RM`,
    `${resumo.pedidos} ${resumo.pedidos === 1 ? 'pedido' : 'pedidos'}`,
    `solicitado ${formatQtd(resumo.solicitado)}`,
    `pedido ${formatQtd(resumo.pedido)}`,
    `chegou ${formatQtd(resumo.chegou)}`,
    `a chegar ${formatQtd(resumo.aChegar)}`,
  ];
  return (
    <p className="mt-0.5 text-[10px] leading-snug" style={{ color: 'var(--ink-muted)' }} title="Totais de compra do material. Pedido que atende várias RMs é contado uma vez.">
      {itens.join(' · ')}
    </p>
  );
};

const ListaEntregas = ({ entregas }: { entregas: EntregaDossie[] }) => (
  entregas.length === 0
    ? <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhuma entrega registrada na MB51 para este pedido.</p>
    : (
      <table className="text-xs border-collapse">
        <thead>
          <tr style={{ color: 'var(--ink-muted)' }}>
            {['Data', 'Documento MB51', 'Lançamento', 'Quantidade', 'Acumulado'].map((titulo, i) => (
              <th key={titulo} className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider ${i >= 3 ? 'text-right' : 'text-left'}`}>{titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entregas.map((entrega, i) => (
            <tr key={`${entrega.documento}-${i}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
              <td className="px-3 py-1 whitespace-nowrap">{entrega.data ? formatDateBR(entrega.data) : '—'}</td>
              <td className="px-3 py-1 font-mono">{entrega.documento ?? '—'}</td>
              <td className="px-3 py-1" style={{ color: entrega.estorno ? 'var(--status-critical)' : undefined }}>{entrega.estorno ? 'Estorno (102)' : 'Entrada (101)'}</td>
              <td className="px-3 py-1 text-right tabular font-bold" style={{ color: entrega.estorno ? 'var(--status-critical)' : undefined }}>{formatQtd(entrega.quantidade)}</td>
              <td className="px-3 py-1 text-right tabular">{formatQtd(entrega.acumulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
);

export default function ControleEstoqueDossie({ linhas, loading, onSelecionar }: Props) {
  const [somenteReposicao, setSomenteReposicao] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const visiveis = useMemo(
    () => (somenteReposicao ? linhas.filter(l => l.status === 'CRITICO' || l.status === 'ALERTA') : linhas),
    [linhas, somenteReposicao],
  );
  const materiais = useMemo(() => new Set(visiveis.map(l => l.material)).size, [visiveis]);
  useEffect(() => { setPagina(0); setAbertas(new Set()); }, [visiveis]);

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / PAGE_SIZE));
  const pagina50 = useMemo(() => visiveis.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE), [visiveis, pagina]);

  const alternar = (chave: string) => setAbertas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(chave)) proximo.delete(chave); else proximo.add(chave);
    return proximo;
  });

  if (loading) {
    return <div className="rounded-xl border p-8 text-center text-sm animate-pulse" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>Montando o dossiê dos materiais...</div>;
  }

  const BotaoEntregas = ({ linha }: { linha: LinhaDossie }) => {
    if (linha.entregas.length === 0) return vazio;
    const aberta = abertas.has(linha.chave);
    const Icone = aberta ? ChevronDown : ChevronRight;
    return (
      <button
        type="button"
        aria-expanded={aberta}
        onClick={event => { event.stopPropagation(); alternar(linha.chave); }}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap hover:bg-[var(--surface-sunken)] cursor-pointer"
        style={{ color: 'var(--brand)' }}
      >
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {linha.entregas.length} {linha.entregas.length === 1 ? 'entrega' : 'entregas'}
      </button>
    );
  };

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

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
        Cada linha liga uma RM ao pedido que a atendeu. RM dividida em vários pedidos ocupa uma linha por pedido; pedido em aberto sem RM entra como linha própria.
        Chegada: <strong>SIM</strong> = recebido tudo, <strong>PARCIAL</strong> = entrega incompleta, <strong>NÃO</strong> = nada recebido. Abra <em>Entregas</em> para ver cada lançamento da MB51, com estornos.
      </p>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <ShieldAlert className="mx-auto h-8 w-8 mb-2" style={{ color: 'var(--ink-muted)' }} />
          <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>Nenhum material neste recorte</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>Ajuste os filtros ou desmarque "Só materiais Crítico ou Alerta".</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-auto max-h-[64vh] rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <table className="min-w-[2000px] w-full border-collapse text-xs">
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
                  const aberta = abertas.has(linha.chave);
                  return (
                    <Fragment key={linha.chave}>
                      <tr
                        onClick={() => onSelecionar(linha.chave)}
                        className="cursor-pointer hover:bg-[var(--surface-raised)]"
                        style={{ borderTop: linha.primeiraDoMaterial ? '2px solid var(--hairline)' : '1px dashed var(--hairline)' }}
                      >
                        <td className="px-3 py-2 font-mono font-black whitespace-nowrap" style={esmaecido}>{linha.material}</td>
                        <td className="px-3 py-2 max-w-72">
                          <p className="truncate" title={linha.descricao ?? ''} style={esmaecido}>{linha.descricao || 'Sem descrição'}</p>
                          {linha.resumo && <ResumoMaterial resumo={linha.resumo} />}
                        </td>
                        <td className="px-3 py-2 text-right tabular font-bold" style={esmaecido} title={linha.saldoTotal !== linha.saldo ? `Saldo total ${formatQtd(linha.saldoTotal)} (inclui depósitos fora da reposição)` : undefined}>{formatQtd(linha.saldo)}</td>
                        <td className="px-3 py-2" style={esmaecido}>{linha.umb ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular border-l" style={esmaecido}>{qtd(linha.minimo)}</td>
                        <td className="px-3 py-2 text-right tabular font-black" style={repetida ? esmaecido : { color: linha.propostaRm ? 'var(--status-critical)' : undefined }}>{qtd(linha.propostaRm)}</td>
                        <td className="px-3 py-2 text-right tabular border-l" style={esmaecido}>{qtd(linha.minimoSisten)}</td>
                        <td className="px-3 py-2 text-right tabular" style={esmaecido} title="2 × mínimo SISTEN, mesma relação da planilha">{qtd(linha.prSisten)}</td>
                        <td className="px-3 py-2 border-l"><StatusBadge status={linha.status} /></td>
                        <td className="px-3 py-2 text-right tabular" style={esmaecido}>{linha.coberturaDias === null ? vazio : formatInt(linha.coberturaDias)}</td>
                        <td className="px-3 py-2 font-mono border-l whitespace-nowrap">
                          {linha.rmRepetida
                            ? <span className="inline-flex items-center gap-1 text-[10px] font-sans" style={{ color: 'var(--ink-muted)' }} title="Mesma RM da linha acima, atendida por outro pedido"><CornerDownRight className="h-3 w-3" aria-hidden="true" /> mesma RM</span>
                            : linha.rm
                              ? <>{linha.rm}{linha.itemRm && <span style={{ color: 'var(--ink-muted)' }}> /{linha.itemRm}</span>}</>
                              : vazio}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{!linha.rmRepetida && linha.dataRm ? formatDateBR(linha.dataRm) : vazio}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{!linha.rmRepetida && linha.requisitante ? linha.requisitante : vazio}</td>
                        <td className="px-3 py-2 text-right tabular">{linha.rmRepetida ? vazio : qtd(linha.quantidadeSolicitada)}</td>
                        <td className="px-3 py-2"><SimNao valor={linha.existeRm} /></td>
                        <td className="px-3 py-2 font-mono border-l whitespace-nowrap">
                          {linha.pedido
                            ? <>{linha.pedido}{linha.itemPedido && <span style={{ color: 'var(--ink-muted)' }}> /{linha.itemPedido}</span>}</>
                            : vazio}
                          {linha.pedidoCompartilhado && <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-sans font-bold" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }} title="Este pedido atende mais de uma RM do material; é contado uma vez nos totais.">compartilhado</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{linha.dataPedido ? formatDateBR(linha.dataPedido) : vazio}</td>
                        <td className="px-3 py-2 text-right tabular">{qtd(linha.quantidadePedida)}</td>
                        <td className="px-3 py-2"><SituacaoBadge situacao={linha.situacao} /></td>
                        <td className="px-3 py-2"><Chegada linha={linha} /></td>
                        <td className="px-3 py-2 text-right tabular" style={linha.aChegar ? { color: 'var(--status-warning)', fontWeight: 700 } : undefined}>{qtd(linha.aChegar)}</td>
                        <td className="px-3 py-2"><BotaoEntregas linha={linha} /></td>
                      </tr>
                      {aberta && (
                        <tr style={{ background: 'var(--surface-sunken)' }}>
                          <td colSpan={TOTAL_COLUNAS} className="px-6 py-3">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                              Entregas do pedido {linha.pedido}{linha.itemPedido ? ` · item ${linha.itemPedido}` : ''}
                            </p>
                            <ListaEntregas entregas={linha.entregas} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {pagina50.map(linha => (
              <div key={linha.chave} className="rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <button type="button" onClick={() => onSelecionar(linha.chave)} className="w-full p-4 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-black truncate" style={{ color: 'var(--ink-primary)' }}>{linha.material}</p>
                      <p className="text-xs truncate mt-0.5" style={{ color: 'var(--ink-muted)' }}>{linha.descricao || 'Sem descrição'}</p>
                      {linha.resumo && <ResumoMaterial resumo={linha.resumo} />}
                    </div>
                    <StatusBadge status={linha.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {([['Saldo', qtd(linha.saldo)], ['Mínimo', qtd(linha.minimo)], ['Comprar', qtd(linha.propostaRm)], ['Cobert.', linha.coberturaDias === null ? vazio : `${formatInt(linha.coberturaDias)} d`]] as const).map(([rotulo, valor]) => (
                      <div key={rotulo}><p className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</p><p className="font-black tabular text-xs">{valor}</p></div>
                    ))}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>RM</dt><dd className="font-mono">{linha.rmRepetida ? 'mesma RM' : linha.rm ?? 'Sem RM'}{!linha.rmRepetida && linha.dataRm ? ` · ${formatDateBR(linha.dataRm)}` : ''}</dd></div>
                    <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Solicitado</dt><dd>{linha.rmRepetida ? '—' : <>{qtd(linha.quantidadeSolicitada)}{linha.requisitante ? ` · ${linha.requisitante}` : ''}</>}</dd></div>
                    <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Pedido</dt><dd className="font-mono">{linha.pedido ?? '—'}{linha.itemPedido ? ` /${linha.itemPedido}` : ''}{linha.dataPedido ? ` · ${formatDateBR(linha.dataPedido)}` : ''}</dd></div>
                    <div><dt className="text-[9px] uppercase font-bold" style={{ color: 'var(--ink-muted)' }}>Chegada</dt><dd><SituacaoBadge situacao={linha.situacao} /> {linha.quantidadePedida !== null ? `${formatQtd(linha.quantidadeChegou ?? 0)} / ${formatQtd(linha.quantidadePedida)}` : ''}</dd></div>
                  </dl>
                </button>
                {linha.entregas.length > 0 && (
                  <div className="border-t px-4 py-2" style={{ borderColor: 'var(--hairline)' }}>
                    <BotaoEntregas linha={linha} />
                    {abertas.has(linha.chave) && <div className="mt-2 overflow-x-auto"><ListaEntregas entregas={linha.entregas} /></div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} info={`${formatInt(visiveis.length)} linhas`} />
        </>
      )}
    </div>
  );
}

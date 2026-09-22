/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fichas de EPI emitidas: busca por colaborador, matrícula, código ou função.
 * Cartões no celular, tabela no desktop (padrão TableCards/TableDesktop).
 */

import { useEffect, useState } from 'react';
import { ClipboardList, Loader2, Search } from 'lucide-react';
import { TableCardRow, TableCards, TableDesktop } from '../../ui/DataTable';
import { useToast } from '../../ui/Toast';
import type { Profile } from '../../../types';
import FichaEpiDetalheModal from './FichaEpiDetalheModal';
import { formatarDataBR, formatarQuantidade } from '../../../lib/fichaEpi';
import { listarFichas, mensagemErroFichaEpi, type SsmaFichaEpi } from '../../../lib/ssmaFichaEpiApi';

interface Props {
  user: Profile;
  /** Filtro inicial (ex.: nome do colaborador vindo da nova ficha). */
  buscaInicial?: string;
}

function resumoItens(ficha: SsmaFichaEpi) {
  const unidades = ficha.itens.reduce((s, i) => s + Number(i.quantidade), 0);
  const devolvidos = ficha.itens.filter(i => i.data_devolucao).length;
  return { unidades, devolvidos };
}

function Situacao({ ficha }: { ficha: SsmaFichaEpi }) {
  const { devolvidos } = resumoItens(ficha);
  if (ficha.status === 'CANCELADA') {
    return <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">Cancelada</span>;
  }
  if (devolvidos === ficha.itens.length && devolvidos > 0) {
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Devolvida</span>;
  }
  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
      Assinada{devolvidos ? ` · ${devolvidos} devolv.` : ''}
    </span>
  );
}

export default function FichasEpiLista({ user, buscaInicial = '' }: Props) {
  const toast = useToast();
  const [busca, setBusca] = useState(buscaInicial);
  const [fichas, setFichas] = useState<SsmaFichaEpi[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<SsmaFichaEpi | null>(null);

  const carregar = async (termo: string) => {
    setCarregando(true);
    try {
      setFichas(await listarFichas({ busca: termo }));
    } catch (erro) {
      toast.error(mensagemErroFichaEpi(erro));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => carregar(busca), 300);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Search className="h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por colaborador, matrícula, código da ficha ou função" className="w-full bg-transparent py-2.5 text-sm outline-none" />
        {carregando && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </label>

      {!carregando && fichas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-slate-700">
          <ClipboardList className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{busca ? 'Nenhuma ficha encontrada' : 'Nenhuma ficha lançada ainda'}</h2>
          <p className="mt-1 text-xs text-slate-500">As fichas aparecem aqui assim que o colaborador assina a entrega.</p>
        </div>
      ) : (
        <>
          <TableCards>
            {fichas.map(f => {
              const { unidades } = resumoItens(f);
              return (
                <TableCardRow key={f.id} onClick={() => setAberta(f)} accent={f.status === 'CANCELADA' ? '#dc2626' : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{f.nome}</p>
                      <p className="text-xs text-slate-500">{f.funcao_nome}</p>
                    </div>
                    <Situacao ficha={f} />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-mono">{f.codigo}</span> · {formatarDataBR(f.data_entrega)} · {f.itens.length} EPIs / {formatarQuantidade(unidades)} un.
                  </p>
                </TableCardRow>
              );
            })}
          </TableCards>

          <TableDesktop>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-bold">Código</th>
                    <th className="px-3 py-3 font-bold">Entrega</th>
                    <th className="px-3 py-3 font-bold">Colaborador</th>
                    <th className="px-3 py-3 font-bold">Função</th>
                    <th className="px-3 py-3 text-right font-bold">EPIs</th>
                    <th className="px-3 py-3 text-right font-bold">Unidades</th>
                    <th className="px-3 py-3 font-bold">Lançada por</th>
                    <th className="px-4 py-3 text-right font-bold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fichas.map(f => {
                    const { unidades } = resumoItens(f);
                    return (
                      <tr
                        key={f.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setAberta(f)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberta(f); } }}
                        className={`cursor-pointer transition-colors hover:bg-emerald-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 dark:hover:bg-emerald-950/20 ${f.status === 'CANCELADA' ? 'opacity-60' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">{f.codigo}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{formatarDataBR(f.data_entrega)}</td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{f.nome}</p>
                          <p className="font-mono text-[11px] text-slate-500">{f.registro}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{f.funcao_nome}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{f.itens.length}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{formatarQuantidade(unidades)}</td>
                        <td className="px-3 py-3 text-slate-500">{f.criado_por_nome || '—'}</td>
                        <td className="px-4 py-3 text-right"><Situacao ficha={f} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableDesktop>
        </>
      )}

      {aberta && (
        <FichaEpiDetalheModal
          user={user}
          pessoaId={aberta.pessoa_id}
          fichaId={aberta.id}
          onClose={() => setAberta(null)}
          onAlterada={() => carregar(busca)}
        />
      )}
    </div>
  );
}

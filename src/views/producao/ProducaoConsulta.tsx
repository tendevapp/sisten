/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Produção > Consulta — lista filtrável dos lançamentos, com abertura da
 * Ficha da Virola por linha. Tabela responsiva no padrão do SISTEN
 * (`TableCards`/`TableDesktop`, ver `components/ui/DataTable.tsx`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, FileSearch, FileDown } from 'lucide-react';
import {
  TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableDesktop, TableCards, TableCardRow, TableEmpty,
} from '../../components/ui/DataTable';
import FichaVirolaModal from '../../components/producao/FichaVirolaModal';
import { formatDateBR } from '../../lib/format';
import type { Profile } from '../../types';
import {
  listarEtapas,
  listarLancamentos,
  type EtapaProducao,
  type LancamentoProducao,
  type FiltrosConsultaProducao,
} from '../../lib/producaoApi';
import type { StatusLancamento } from '../../lib/producao';
import { exportProducaoLancamentoPdf } from '../../lib/pdfExport/exportProducaoPdf';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const COR_STATUS: Record<string, string> = {
  aprovado: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  reprovado: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  pendente: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  refugado: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
};

export default function ProducaoConsulta({}: Props) {
  const [etapas, setEtapas] = useState<EtapaProducao[]>([]);
  const [linhas, setLinhas] = useState<LancamentoProducao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [etapaId, setEtapaId] = useState('');
  const [status, setStatus] = useState<StatusLancamento | ''>('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [termo, setTermo] = useState('');

  const [fichaAberta, setFichaAberta] = useState<LancamentoProducao | null>(null);

  useEffect(() => {
    listarEtapas().then(setEtapas).catch(() => {});
  }, []);

  useEffect(() => {
    setCarregando(true);
    const filtros: FiltrosConsultaProducao = {
      etapaId: etapaId || undefined,
      status: status || undefined,
      dataInicial: dataInicial || undefined,
      dataFinal: dataFinal || undefined,
      termo: termo || undefined,
    };
    const timer = setTimeout(() => {
      listarLancamentos(filtros)
        .then(setLinhas)
        .finally(() => setCarregando(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [etapaId, status, dataInicial, dataFinal, termo]);

  const nomeEtapa = useMemo(() => {
    const mapa = new Map(etapas.map(e => [e.id, e.nome]));
    return (id: string) => mapa.get(id) ?? id;
  }, [etapas]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">Consulta de Produção</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Todos os lançamentos de qualidade, por etapa e período.</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={etapaId}
          onChange={e => setEtapaId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">Todas as etapas</option>
          {etapas.map(e => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value as StatusLancamento | '')}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <option value="">Todos os status</option>
          <option value="aprovado">Aprovado</option>
          <option value="reprovado">Reprovado</option>
          <option value="pendente">Pendente</option>
          <option value="refugado">Refugado</option>
        </select>
        <input
          type="date"
          value={dataInicial}
          onChange={e => setDataInicial(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <input
          type="date"
          value={dataFinal}
          onChange={e => setDataFinal(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Código, virola ou rastreabilidade..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : linhas.length === 0 ? (
        <TableEmpty icon={FileSearch} title="Nenhum lançamento encontrado" hint="Ajuste os filtros para ver mais resultados." />
      ) : (
        <>
          <TableCards>
            {linhas.map(l => (
                  <TableCardRow key={l.id} onClick={() => setFichaAberta(l)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{l.codigo}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${COR_STATUS[l.status] ?? ''}`}>
                    {l.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Torre {l.torre_numero} • {l.tramo} • {l.virola}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {nomeEtapa(l.etapa_id)} • {formatDateBR(l.data_liberacao)}
                </p>
                <button type="button" onClick={e => { e.stopPropagation(); void exportProducaoLancamentoPdf(l, nomeEtapa(l.etapa_id)); }} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600"><FileDown className="h-3.5 w-3.5" /> Exportar PDF</button>
              </TableCardRow>
            ))}
          </TableCards>

          <TableDesktop>
            <TableShell>
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Código" />
                  <Th label="Etapa" />
                  <Th label="Torre/Tramo/Virola" />
                  <Th label="Status" />
                  <Th label="Data" />
                  <Th label="Executante" />
                  <Th label="PDF" />
                </TableHeadRow>
                <TableBody>
                  {linhas.map(l => (
                    <Tr key={l.id} onClick={() => setFichaAberta(l)}>
                      <Td mono strong>{l.codigo}</Td>
                      <Td>{nomeEtapa(l.etapa_id)}</Td>
                      <Td>Torre {l.torre_numero} • {l.tramo} • {l.virola}</Td>
                      <Td>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${COR_STATUS[l.status] ?? ''}`}>
                          {l.status}
                        </span>
                      </Td>
                      <Td>{formatDateBR(l.data_liberacao)}</Td>
                      <Td truncate>{l.executante_nome ?? '—'}</Td>
                      <Td><button type="button" onClick={e => { e.stopPropagation(); void exportProducaoLancamentoPdf(l, nomeEtapa(l.etapa_id)); }} className="inline-flex items-center gap-1 text-blue-600"><FileDown className="h-3.5 w-3.5" /> PDF</button></Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </TableDesktop>
        </>
      )}

      {fichaAberta && (
        <FichaVirolaModal
          virolaId={fichaAberta.virola_id}
          torreNumero={fichaAberta.torre_numero}
          tramo={fichaAberta.tramo}
          virola={fichaAberta.virola}
          onClose={() => setFichaAberta(null)}
        />
      )}
    </div>
  );
}

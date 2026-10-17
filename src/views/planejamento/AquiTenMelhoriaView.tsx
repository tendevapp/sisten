/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulários › Planejamento › Aqui TEN Melhoria! (Kaizen, FRM.ENG-0017).
 * Aba "Novo Kaizen" para lançar e aba "Registros" com todos os Kaizens —
 * todos veem, só autor/admin altera, e o Responsável pelo Setor valida.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, FileDown, Lightbulb, ListChecks, PlusCircle, RefreshCw, Search } from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../../components/ui/Toast';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableEmpty, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../components/ui/DataTable';
import KaizenForm from '../../components/planejamento/KaizenForm';
import KaizenDetalheModal from '../../components/planejamento/KaizenDetalheModal';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import { gerarKaizenPdf } from '../../lib/pdfExport/exportKaizenPdf';
import { formatarDataBR } from '../../lib/fichaEpi';
import { KAIZEN_STATUS_ROTULO, listarKaizens, type Kaizen, type KaizenStatus } from '../../lib/planKaizenApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'novo' | 'registros';

const COR_STATUS: Record<KaizenStatus, string> = {
  REGISTRADO: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  IMPLANTADO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  CANCELADO: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

function Status({ status }: { status: KaizenStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COR_STATUS[status]}`}>{KAIZEN_STATUS_ROTULO[status]}</span>;
}

function BotaoPdf({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Exportar PDF"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
    >
      <FileDown className="h-3.5 w-3.5" /> PDF
    </button>
  );
}

export default function AquiTenMelhoriaView({ user, onNavigate }: Props) {
  const toast = useToast();
  const [aba, setAba] = useState<Aba>('novo');
  const [lista, setLista] = useState<Kaizen[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<KaizenStatus | 'todos'>('todos');
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [pdfDe, setPdfDe] = useState<Kaizen | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarKaizens());
    } catch (err) {
      toast.error(`Falha ao carregar os Kaizens: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter(k => {
      if (filtroStatus !== 'todos' && k.status !== filtroStatus) return false;
      if (!termo) return true;
      return [k.codigo, k.nome_profissional, k.matricula, k.setor, k.problema, k.solucao]
        .some(v => (v || '').toLowerCase().includes(termo));
    });
  }, [lista, busca, filtroStatus]);

  const aberto = lista.find(k => k.id === abertoId) || null;
  const pendentes = lista.filter(k => k.status === 'REGISTRADO').length;

  const abaClasse = (ativa: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
      ativa ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-700 dark:text-blue-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios/planejamento')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          Voltar para Planejamento
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            <Lightbulb className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl">Aqui TEN Melhoria!</h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Kaizen · FRM.ENG-0017 — viu um desperdício e tem a solução? Registre aqui, com fotos.
            </p>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80 sm:inline-flex">
        <button type="button" className={abaClasse(aba === 'novo')} onClick={() => setAba('novo')}>
          <PlusCircle className="h-3.5 w-3.5" /> Novo Kaizen
        </button>
        <button type="button" className={abaClasse(aba === 'registros')} onClick={() => setAba('registros')}>
          <ListChecks className="h-3.5 w-3.5" /> Registros ({lista.length})
          {pendentes > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendentes}</span>}
        </button>
      </div>

      {aba === 'novo' ? (
        <KaizenForm
          user={user}
          onSalvo={() => {
            carregar();
            setAba('registros');
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por código, nome, setor ou texto..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <select
              value={filtroStatus}
              onChange={e => setFiltroStatus(e.target.value as KaizenStatus | 'todos')}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="todos">Todas as situações</option>
              {(Object.keys(KAIZEN_STATUS_ROTULO) as KaizenStatus[]).map(s => (
                <option key={s} value={s}>{KAIZEN_STATUS_ROTULO[s]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:text-blue-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          {filtrados.length === 0 ? (
            <TableEmpty
              icon={Lightbulb}
              title={carregando ? 'Carregando...' : 'Nenhum Kaizen encontrado'}
              hint={carregando ? undefined : 'Registre a primeira melhoria na aba "Novo Kaizen".'}
            />
          ) : (
            <>
              <TableCards>
                {filtrados.map(k => (
                  // Sem onClick no cartão: ele teria de ser <button> e o botão de PDF ficaria aninhado.
                  <TableCardRow key={k.id}>
                    <button type="button" onClick={() => setAbertoId(k.id)} className="block w-full space-y-2 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{k.codigo || 'Pendente de sincronização'}</span>
                        <Status status={k.status} />
                      </div>
                      <p className="line-clamp-2 text-sm text-slate-800 dark:text-slate-100">{k.problema}</p>
                    </button>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="min-w-0 flex-1 truncate">{k.nome_profissional} · {k.setor} · {formatarDataBR(k.data_registro)}</span>
                      {k.fotos?.length > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5"><Camera className="h-3 w-3" />{k.fotos.length}</span>
                      )}
                      <BotaoPdf onClick={() => setPdfDe(k)} />
                    </div>
                  </TableCardRow>
                ))}
              </TableCards>
              <TableDesktop>
                <TableShell>
                  <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th label="Código" />
                    <Th label="Data" />
                    <Th label="Profissional" />
                    <Th label="Setor" />
                    <Th label="Problema" />
                    <Th label="Fotos" align="right" />
                    <Th label="Situação" />
                    <Th label="PDF" align="center" />
                  </TableHeadRow>
                  <TableBody>
                    {filtrados.map(k => (
                      <Tr key={k.id} onClick={() => setAbertoId(k.id)}>
                        <Td><span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{k.codigo || '—'}</span></Td>
                        <Td>{formatarDataBR(k.data_registro)}</Td>
                        <Td>{k.nome_profissional}</Td>
                        <Td>{k.setor}</Td>
                        <Td><span className="line-clamp-1 max-w-xs">{k.problema}</span></Td>
                        <Td align="right" numeric>{k.fotos?.length || 0}</Td>
                        <Td><Status status={k.status} /></Td>
                        <Td>
                          <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                            <BotaoPdf onClick={() => setPdfDe(k)} />
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TableBody>
                  </table>
                </TableShell>
              </TableDesktop>
            </>
          )}
        </div>
      )}

      {aberto && (
        <KaizenDetalheModal
          user={user}
          kaizen={aberto}
          onClose={() => setAbertoId(null)}
          onAlterado={carregar}
          onExportarPdf={() => setPdfDe(aberto)}
        />
      )}

      {pdfDe && (
        <PdfPreviewModal
          gerar={() => gerarKaizenPdf(pdfDe)}
          tituloPadrao={`Kaizen ${pdfDe.codigo || ''}`.trim()}
          onClose={() => setPdfDe(null)}
        />
      )}
    </div>
  );
}

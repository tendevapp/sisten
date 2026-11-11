/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório × MB51 › Log: o log de todas as Requisições no Balcão num período
 * (criação, edição, exportação, reabertura, importação do doc. SAP…), com
 * busca no conteúdo, filtro por ação e por hora do dia, e o tempo desde o
 * evento anterior da mesma RQB — para reconstruir a sequência de uma
 * ocorrência (ex.: exportada 15:35, reaberta 15:38, exportada de novo no dia
 * seguinte).
 *
 * Fica montado enquanto a janela de detalhe de uma RQB está aberta por cima
 * (`visivel` = false), para não perder a busca nem recarregar ao voltar.
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Loader2, RefreshCw, Search, X } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { formatDateTimeBR } from '../../../lib/format';
import { dataHojeLocal, dataLocalMaisDias } from '../../../lib/dataLocal';
import { listarLogGeralBalcao, type ReqBalcaoAlteracaoGeral } from '../../../lib/requisicaoBalcaoApi';
import {
  ROTULO_ACAO_LOG, contarPorAcao, contarPorHora, filtrarLog, formatarIntervalo, intervaloDesdeAnterior,
  type AcaoLog,
} from '../../../lib/logRequisicaoBalcao';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../ui/DataTable';
import ImportacoesPlanilhaLog from './ImportacoesPlanilhaLog';
import LotesExportadoImportado from './LotesExportadoImportado';

type Aba = 'eventos' | 'importacoes' | 'lotes';

const ABAS: { id: Aba; rotulo: string; busca: string; exemplo: string }[] = [
  { id: 'eventos', rotulo: 'Eventos', busca: 'Pesquisar (RQB, usuário, item, arquivo, o que mudou)', exemplo: 'Ex.: RQB-300926-10 reabertura' },
  { id: 'importacoes', rotulo: 'Importações da planilha', busca: 'Pesquisar (RQB, material, doc. SAP, lote, usuário, resultado)', exemplo: 'Ex.: 4904074972 ou não encontrado' },
  { id: 'lotes', rotulo: 'Exportado × importado', busca: 'Pesquisar (lote, RQB, material, doc. da MB51)', exemplo: 'Ex.: 20261001_1411 ou 4904074972' },
];

const PAGINA = 300;

const COR_ACAO: Record<AcaoLog, string> = {
  criacao: 'var(--ink-muted)',
  edicao: 'var(--brand)',
  exclusao: 'var(--status-critical)',
  doc_sap: 'var(--status-good)',
  exportacao: 'var(--status-good)',
  reabertura: 'var(--status-serious)',
  importacao_sap: 'var(--brand)',
  restauracao: 'var(--status-serious)',
};

const campoClasse = 'rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]';
const campoEstilo: React.CSSProperties = { borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' };
const rotuloClasse = 'text-[10px] font-bold uppercase tracking-wide';

function SeloAcao({ acao }: { acao: AcaoLog }) {
  const cor = COR_ACAO[acao] ?? 'var(--ink-muted)';
  return (
    <span
      className="inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}
    >
      {ROTULO_ACAO_LOG[acao] ?? acao}
    </span>
  );
}

function Alteracoes({ e }: { e: ReqBalcaoAlteracaoGeral }) {
  if (!e.resumo && (e.alteracoes ?? []).length === 0) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
  return (
    <div className="space-y-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
      {e.resumo && <div>{e.resumo}</div>}
      {(e.alteracoes ?? []).map((d, k) => (
        <div key={k}>
          <span className="font-semibold">{d.campo}:</span>{' '}
          <span className="line-through" style={{ color: 'var(--ink-muted)' }}>{d.de ?? '—'}</span>
          {' → '}<span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{d.para ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  visivel: boolean;
  onClose: () => void;
  /** Abre o detalhe da RQB; só vem quando a requisição está carregada no relatório. */
  onAbrirRequisicao: (requisicaoId: string) => void;
  podeAbrir: (requisicaoId: string) => boolean;
  /** Id da RQB pelo código, quando está carregada no relatório. */
  idPorCodigo: (codigo: string) => string | undefined;
}

export default function LogGeralModal({ visivel, onClose, onAbrirRequisicao, podeAbrir, idPorCodigo }: Props) {
  const toast = useToast();
  const idBusca = useId();
  const idDe = useId();
  const idAte = useId();
  const [de, setDe] = useState(() => dataLocalMaisDias(-30));
  const [ate, setAte] = useState(() => dataHojeLocal());
  const [eventos, setEventos] = useState<ReqBalcaoAlteracaoGeral[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [acao, setAcao] = useState<AcaoLog | 'todas'>('todas');
  const [hora, setHora] = useState<number | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [aba, setAba] = useState<Aba>('eventos');
  const [versao, setVersao] = useState(0);
  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setEventos(await listarLogGeralBalcao(de, ate));
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar o log.');
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setLimite(PAGINA); }, [busca, acao, hora, de, ate]);

  const intervalos = useMemo(() => intervaloDesdeAnterior(eventos), [eventos]);
  // Contagens por ação respeitam busca e hora; as por hora respeitam busca e ação.
  const semAcao = useMemo(() => filtrarLog(eventos, { busca, acao: 'todas', hora }), [eventos, busca, hora]);
  const semHora = useMemo(() => filtrarLog(eventos, { busca, acao, hora: null }), [eventos, busca, acao]);
  const filtrados = useMemo(() => filtrarLog(semAcao, { busca: '', acao, hora: null }), [semAcao, acao]);
  const porAcao = useMemo(() => contarPorAcao(semAcao), [semAcao]);
  const porHora = useMemo(() => contarPorHora(semHora), [semHora]);
  const maxHora = Math.max(1, ...porHora);
  const acoesPresentes = (Object.keys(ROTULO_ACAO_LOG) as AcaoLog[]).filter((a) => (porAcao[a] ?? 0) > 0 || a === acao);
  const usuarios = useMemo(() => new Set(filtrados.map((e) => e.alterado_por_nome || '—')).size, [filtrados]);
  const rqbs = useMemo(() => new Set(filtrados.map((e) => e.requisicao_id)).size, [filtrados]);
  const visiveis = filtrados.slice(0, limite);

  const exportarXlsx = () => {
    const dados = filtrados.map((e) => {
      const iv = intervalos.get(e.id);
      return {
        'Data/hora': formatDateTimeBR(e.created_at),
        RQB: e.codigo ?? '',
        'Ação': ROTULO_ACAO_LOG[e.acao] ?? e.acao,
        'Usuário': e.alterado_por_nome ?? '',
        Resumo: e.resumo ?? '',
        'Alterações': (e.alteracoes ?? []).map((d) => `${d.campo}: ${d.de ?? '—'} → ${d.para ?? '—'}`).join(' | '),
        'Desde o evento anterior da RQB': iv != null ? formatarIntervalo(iv) : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Log RQB');
    XLSX.writeFile(wb, `log_requisicao_balcao_${de || 'inicio'}_${ate || 'hoje'}.xlsx`);
    toast.success(`${dados.length} evento(s) exportado(s).`);
  };

  if (!visivel) return null;

  const codigoRqb = (e: ReqBalcaoAlteracaoGeral) => (
    podeAbrir(e.requisicao_id) ? (
      <button
        type="button"
        onClick={(ev) => { ev.stopPropagation(); onAbrirRequisicao(e.requisicao_id); }}
        className="cursor-pointer font-mono font-bold underline decoration-dotted underline-offset-2"
        style={{ color: 'var(--brand)' }}
        aria-label={`Abrir a requisição ${e.codigo ?? ''}`}
      >
        {e.codigo ?? '—'}
      </button>
    ) : (
      <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }} title="Fora do período carregado no relatório">
        {e.codigo ?? '—'}
      </span>
    )
  );

  const intervalo = (e: ReqBalcaoAlteracaoGeral) => {
    const iv = intervalos.get(e.id);
    if (iv == null) return null;
    return (
      <span className="text-[10px]" style={{ color: iv < 15 * 60000 ? 'var(--status-serious)' : 'var(--ink-muted)' }} title="Tempo desde o evento anterior da mesma requisição">
        +{formatarIntervalo(iv)}
      </span>
    );
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-6xl" ariaLabel="Log da Requisição no Balcão">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Log da Requisição no Balcão</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Todas as requisições: criação, edição, exportação, reabertura e importação da planilha concluída, com usuário e horário.
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--hairline)' }} role="tablist" aria-label="Partes do log">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className="-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-xs font-bold"
                style={aba === a.id
                  ? { borderColor: 'var(--brand)', color: 'var(--ink-primary)' }
                  : { borderColor: 'transparent', color: 'var(--ink-muted)' }}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
              <label htmlFor={idBusca} className={rotuloClasse} style={{ color: 'var(--ink-muted)' }}>
                {abaAtual.busca}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
                <input
                  id={idBusca}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={abaAtual.exemplo}
                  className={`w-full pl-8 ${campoClasse}`}
                  style={campoEstilo}
                />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor={idDe} className={rotuloClasse} style={{ color: 'var(--ink-muted)' }}>De</label>
              <input id={idDe} type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} className={campoClasse} style={campoEstilo} />
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor={idAte} className={rotuloClasse} style={{ color: 'var(--ink-muted)' }}>Até</label>
              <input id={idAte} type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} className={campoClasse} style={campoEstilo} />
            </div>
            <button
              type="button"
              onClick={() => { if (aba === 'eventos') void carregar(); else setVersao((v) => v + 1); }}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </button>
            {aba === 'eventos' && (
              <button
                type="button"
                onClick={exportarXlsx}
                disabled={filtrados.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-40"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <Download className="h-3.5 w-3.5" /> Excel
              </button>
            )}
          </div>

          {aba === 'importacoes' && (
            <ImportacoesPlanilhaLog
              de={de}
              ate={ate}
              busca={busca}
              versao={versao}
              onAbrirCodigo={(c) => { const id = idPorCodigo(c); if (id) onAbrirRequisicao(id); }}
              podeAbrirCodigo={(c) => { const id = idPorCodigo(c); return !!id && podeAbrir(id); }}
            />
          )}
          {aba === 'lotes' && (
            <LotesExportadoImportado
              de={de}
              ate={ate}
              busca={busca}
              versao={versao}
              onAbrirRequisicao={onAbrirRequisicao}
              podeAbrir={podeAbrir}
            />
          )}

          {aba === 'eventos' && (<>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por ação">
            <button
              type="button"
              onClick={() => setAcao('todas')}
              aria-pressed={acao === 'todas'}
              className="rounded-full border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
              style={acao === 'todas'
                ? { borderColor: 'var(--brand)', background: 'var(--brand)', color: 'white' }
                : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Todas · {semAcao.length}
            </button>
            {acoesPresentes.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAcao(acao === a ? 'todas' : a)}
                aria-pressed={acao === a}
                className="rounded-full border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
                style={acao === a
                  ? { borderColor: COR_ACAO[a], background: `color-mix(in srgb, ${COR_ACAO[a]} 16%, transparent)`, color: 'var(--ink-primary)' }
                  : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                {ROTULO_ACAO_LOG[a]} · {porAcao[a] ?? 0}
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={rotuloClasse} style={{ color: 'var(--ink-muted)' }}>Eventos por hora do dia — clique para filtrar</span>
              {hora != null && (
                <button
                  type="button"
                  onClick={() => setHora(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                  style={{ color: 'var(--brand)' }}
                >
                  <X className="h-3 w-3" /> {String(hora).padStart(2, '0')}h
                </button>
              )}
            </div>
            <div className="flex h-14 items-end gap-0.5" role="group" aria-label="Eventos por hora do dia">
              {porHora.map((n, h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(hora === h ? null : h)}
                  aria-pressed={hora === h}
                  aria-label={`${String(h).padStart(2, '0')}h: ${n} evento(s)`}
                  title={`${String(h).padStart(2, '0')}h — ${n} evento(s)`}
                  className="flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end"
                >
                  <span
                    className="block w-full rounded-t-sm"
                    style={{
                      height: `${n === 0 ? 2 : Math.max(8, (n / maxHora) * 100)}%`,
                      background: hora === h ? 'var(--brand)' : n === 0 ? 'var(--hairline)' : 'color-mix(in srgb, var(--brand) 45%, transparent)',
                    }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] tabular" style={{ color: 'var(--ink-muted)' }}>
              <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>23h</span>
            </div>
          </div>

          {erro ? (
            <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>
          ) : carregando && eventos.length === 0 ? (
            <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando o log…
            </p>
          ) : filtrados.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhum evento com esses filtros.</p>
          ) : (
            <>
              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {filtrados.length} evento(s) · {rqbs} requisição(ões) · {usuarios} usuário(s). Em laranja, o evento que veio menos de 15 min depois do anterior da mesma RQB.
              </p>
              <TableCards>
                {visiveis.map((e) => (
                  <TableCardRow key={e.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      {codigoRqb(e)}
                      <SeloAcao acao={e.acao} />
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                      {formatDateTimeBR(e.created_at)} · {e.alterado_por_nome ?? '—'} {intervalo(e)}
                    </div>
                    <Alteracoes e={e} />
                  </TableCardRow>
                ))}
              </TableCards>
              <TableDesktop>
                <TableShell maxHeight="55vh">
                  <table className="w-full text-xs">
                    <TableHeadRow>
                      <Th label="Data/hora" />
                      <Th label="Ação" />
                      <Th label="RQB" />
                      <Th label="Usuário" />
                      <Th label="O que mudou" />
                    </TableHeadRow>
                    <TableBody>
                      {visiveis.map((e) => (
                        <Tr key={e.id}>
                          <Td className="whitespace-nowrap">
                            <div className="tabular">{formatDateTimeBR(e.created_at)}</div>
                            {intervalo(e)}
                          </Td>
                          <Td><SeloAcao acao={e.acao} /></Td>
                          <Td className="whitespace-nowrap">{codigoRqb(e)}</Td>
                          <Td>{e.alterado_por_nome ?? '—'}</Td>
                          <Td><Alteracoes e={e} /></Td>
                        </Tr>
                      ))}
                    </TableBody>
                  </table>
                </TableShell>
              </TableDesktop>
              {filtrados.length > limite && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setLimite((n) => n + PAGINA)}
                    className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                    style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  >
                    Mostrar mais ({filtrados.length - limite} restantes)
                  </button>
                </div>
              )}
            </>
          )}
          </>)}
        </div>
      </ModalBody>
    </Modal>
  );
}

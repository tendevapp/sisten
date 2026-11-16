/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Relatório × MB51 › Por documento SAP: uma linha por documento × material em
 * que as RQBs não batem com o que o documento tem na MB51 (RPC
 * `alm_rqb_divergencias_doc`). A planilha concluída volta com doc. e
 * "Concluído" também em linhas que o SAP não lançou — é aqui que elas
 * aparecem, com a falta, o valor estimado e lançamentos avulsos próximos que
 * podem ser a correção feita à mão.
 *
 * `ListaDivergenciasDoc` é a lista em si (filtros, tabela, Excel) e recebe as
 * linhas prontas — a conferência da importação da planilha usa a mesma.
 */

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { formatBRL, formatDateBR, formatQtd } from '../../../lib/format';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../ui/DataTable';
import {
  DICA_SITUACAO_DOC, ROTULO_SITUACAO_DOC, filtrarDivergenciasDoc, totalizarDivergenciasDoc,
  type FiltroPeriodo, type FiltroSituacaoDoc, type LinhaDivergenciaDoc, type SituacaoConferenciaDoc,
} from '../../../lib/requisicaoBalcaoAuditoria';
import { listarDivergenciasDoc } from '../../../lib/requisicaoBalcaoAuditoriaApi';
import { Selo } from './selos';

interface Props {
  periodo: FiltroPeriodo;
  busca: string;
  /** Muda quando o usuário pede "Atualizar". */
  versao: number;
  onAbrirRequisicao: (requisicaoId: string) => void;
  podeAbrir: (requisicaoId: string) => boolean;
  onMaterial: (material: string) => void;
}

export const COR_SITUACAO_DOC: Record<SituacaoConferenciaDoc, string> = {
  fora_do_doc: 'var(--status-critical)',
  parcial: 'var(--status-critical)',
  doc_nao_encontrado: 'var(--status-serious)',
  a_mais: 'var(--ink-muted)',
  ok: 'var(--status-good)',
  mb51_pendente: 'var(--ink-muted)',
};
const COR_SITUACAO = COR_SITUACAO_DOC;

const FILTROS: { id: FiltroSituacaoDoc; rotulo: string }[] = [
  { id: 'faltas', rotulo: 'Baixa faltando' },
  { id: 'fora_do_doc', rotulo: ROTULO_SITUACAO_DOC.fora_do_doc },
  { id: 'parcial', rotulo: ROTULO_SITUACAO_DOC.parcial },
  { id: 'doc_nao_encontrado', rotulo: ROTULO_SITUACAO_DOC.doc_nao_encontrado },
  { id: 'a_mais', rotulo: ROTULO_SITUACAO_DOC.a_mais },
  { id: 'mb51_pendente', rotulo: ROTULO_SITUACAO_DOC.mb51_pendente },
  { id: 'ok', rotulo: ROTULO_SITUACAO_DOC.ok },
  { id: 'todas', rotulo: 'Todas' },
];

const PAGINA = 200;

export default function DivergenciasDocumento({ periodo, busca, versao, onAbrirRequisicao, podeAbrir, onMaterial }: Props) {
  const [linhas, setLinhas] = useState<LinhaDivergenciaDoc[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    setErro('');
    setLinhas(null);
    listarDivergenciasDoc({ base: periodo.base, de: periodo.de, ate: periodo.ate })
      .then((l) => { if (vivo) setLinhas(l); })
      .catch((e: any) => { if (vivo) setErro(e?.message || 'Não foi possível carregar a conferência por documento.'); });
    return () => { vivo = false; };
  }, [periodo.base, periodo.de, periodo.ate, versao]);

  return (
    <ListaDivergenciasDoc
      linhas={linhas}
      erro={erro}
      busca={busca}
      onAbrirRequisicao={onAbrirRequisicao}
      podeAbrir={podeAbrir}
      onMaterial={onMaterial}
    />
  );
}

interface ListaProps {
  /** null = carregando. */
  linhas: LinhaDivergenciaDoc[] | null;
  erro?: string;
  busca: string;
  onAbrirRequisicao: (requisicaoId: string, codigo: string) => void;
  podeAbrir: (requisicaoId: string) => boolean;
  onMaterial?: (material: string) => void;
  /** Sem o quadro de explicação no topo (a conferência da importação tem o seu). */
  compacto?: boolean;
  arquivoExcel?: string;
}

export function ListaDivergenciasDoc({
  linhas, erro = '', busca, onAbrirRequisicao, podeAbrir, onMaterial, compacto = false,
  arquivoExcel = 'rqb_x_mb51_por_documento.xlsx',
}: ListaProps) {
  const toast = useToast();
  const [situacao, setSituacao] = useState<FiltroSituacaoDoc>('faltas');
  const [semAvulso, setSemAvulso] = useState(false);
  const [limite, setLimite] = useState(PAGINA);

  useEffect(() => { setLimite(PAGINA); }, [busca, situacao, semAvulso, linhas]);

  const daBusca = useMemo(
    () => filtrarDivergenciasDoc(linhas ?? [], { busca, situacao: 'todas', semAvulso }),
    [linhas, busca, semAvulso],
  );
  const totais = useMemo(() => totalizarDivergenciasDoc(daBusca), [daBusca]);
  const filtradas = useMemo(
    () => filtrarDivergenciasDoc(daBusca, { busca: '', situacao }),
    [daBusca, situacao],
  );
  const visiveis = filtradas.slice(0, limite);
  const mb51Ate = linhas?.find((l) => l.mb51_ate)?.mb51_ate ?? null;

  const contagem = (f: FiltroSituacaoDoc) => (f === 'todas' ? { pares: daBusca.length, valor: totais.faltas.valor } : totais[f]);

  const exportarXlsx = () => {
    const dados = filtradas.map((l) => ({
      'Situação': ROTULO_SITUACAO_DOC[l.situacao],
      'Data doc.': l.doc_data ?? '',
      'Doc. SAP': l.doc,
      Material: l.material,
      'Descrição': l.descricao ?? '',
      Unidade: l.unidade ?? '',
      Tipo: l.tipo_movimento === 'transferencia' ? 'Transferência' : 'Saída',
      'Depósito origem': l.deposito ?? '',
      'Qtd. nas RQBs': l.qtd_rqbs,
      'Qtd. no documento': l.qtd_doc,
      Falta: l.falta,
      'Preço médio MB51': l.preco_medio ?? '',
      'Valor estimado da falta': l.valor_falta,
      'Lançado no doc. como': l.lancado_como ?? '',
      'Linhas de RQB': l.rqbs.length,
      RQBs: l.rqbs.map((r) => `${r.codigo} (${formatQtd(r.quantidade)})`).join(', '),
      'Lançamentos avulsos próximos (sem RQB)': l.avulsos ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Doc x material');
    XLSX.writeFile(wb, arquivoExcel);
    toast.success(`${dados.length} linha(s) exportada(s).`);
  };

  const Rqbs = ({ l }: { l: LinhaDivergenciaDoc }) => (
    <span className="flex flex-wrap gap-1">
      {l.rqbs.map((r) => {
        const pode = podeAbrir(r.requisicao_id);
        return (
          <button
            key={r.item_id}
            type="button"
            disabled={!pode}
            onClick={(e) => { e.stopPropagation(); onAbrirRequisicao(r.requisicao_id, r.codigo); }}
            className="rounded border px-1 py-0.5 font-mono text-[10px] font-bold enabled:cursor-pointer enabled:hover:underline disabled:cursor-default"
            style={{ borderColor: 'var(--hairline)', color: pode ? 'var(--ink-primary)' : 'var(--ink-secondary)' }}
            aria-label={pode ? `Abrir ${r.codigo} com detalhes e log` : undefined}
            title={pode ? 'Abrir a requisição com detalhes e log' : 'Requisição fora da lista carregada'}
          >
            {r.codigo} <span className="font-normal">({formatQtd(r.quantidade)})</span>
          </button>
        );
      })}
    </span>
  );

  return (
    <div className="space-y-3">
      {!compacto && <div
        className="rounded-xl border px-3 py-2 text-xs"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
      >
        Cada linha é um <strong>documento SAP × material</strong>: o que as RQBs com esse documento pediram contra o que o
        documento tem na MB51 (qualquer saída do material). A planilha concluída volta com documento e "Concluído" também em
        linhas que o SAP não lançou. Valor pelo preço médio do material na MB51.
        {mb51Ate && <> MB51 importada até <strong>{formatDateBR(mb51Ate)}</strong> — documento posterior ainda não entra.</>}
      </div>}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Situação do documento">
        {FILTROS.filter((f) => (f.id !== 'ok' && f.id !== 'mb51_pendente') || contagem(f.id).pares > 0).map((f) => {
          const ativo = situacao === f.id;
          const c = contagem(f.id);
          const alerta = (f.id === 'faltas' || f.id === 'fora_do_doc' || f.id === 'parcial') && c.pares > 0;
          const cor = 'var(--status-critical)';
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setSituacao(f.id)}
              aria-pressed={ativo}
              title={f.id !== 'faltas' && f.id !== 'todas' ? DICA_SITUACAO_DOC[f.id] : undefined}
              className="rounded-lg border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
              style={ativo
                ? { background: alerta ? cor : 'var(--brand)', borderColor: 'transparent', color: '#fff' }
                : { borderColor: alerta ? cor : 'var(--hairline)', color: alerta ? cor : 'var(--ink-secondary)' }}
            >
              {f.rotulo} ({c.pares}{c.valor > 0 && f.id !== 'a_mais' && f.id !== 'ok' && f.id !== 'mb51_pendente' ? ` · ${formatBRL(c.valor)}` : ''})
            </button>
          );
        })}
        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
          <input type="checkbox" checked={semAvulso} onChange={(e) => setSemAvulso(e.target.checked)} />
          Só sem lançamento avulso próximo
        </label>
        <button
          type="button"
          onClick={exportarXlsx}
          disabled={filtradas.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-40"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <Download className="h-3.5 w-3.5" /> Excel da lista
        </button>
      </div>

      {erro ? (
        <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>{erro}</div>
      ) : linhas === null ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo documento por documento…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {linhas.length === 0 ? 'Todos os documentos batem com as RQBs no período.' : 'Nada encontrado com esses filtros.'}
        </div>
      ) : (
        <>
          <TableCards>
            {visiveis.map((l) => (
              <TableCardRow key={`${l.doc}|${l.material}`} accent={COR_SITUACAO[l.situacao]}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                    {l.doc}{l.doc_data && <span className="font-sans font-normal" style={{ color: 'var(--ink-muted)' }}> · {formatDateBR(l.doc_data)}</span>}
                  </span>
                  <Selo texto={ROTULO_SITUACAO_DOC[l.situacao]} cor={COR_SITUACAO[l.situacao]} dica={DICA_SITUACAO_DOC[l.situacao]} />
                </div>
                <button type="button" onClick={() => onMaterial?.(l.material)} className="text-left text-xs cursor-pointer hover:underline" style={{ color: 'var(--ink-primary)' }}>
                  <span className="font-mono font-bold">{l.material}</span> {l.descricao}
                </button>
                <div className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  RQBs {formatQtd(l.qtd_rqbs)} · documento {formatQtd(l.qtd_doc)} {l.unidade}
                  {l.falta > 0 && <strong style={{ color: 'var(--status-critical)' }}> · faltam {formatQtd(l.falta)} ({formatBRL(l.valor_falta)})</strong>}
                  {l.falta < 0 && <> · {formatQtd(-l.falta)} a mais</>}
                  {' '}· dep. {l.deposito}
                </div>
                {l.lancado_como && <div className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>No doc.: {l.lancado_como}</div>}
                {l.avulsos && <div className="text-[11px]" style={{ color: 'var(--status-serious)' }}>Avulsos próximos: {l.avulsos}</div>}
                <Rqbs l={l} />
              </TableCardRow>
            ))}
          </TableCards>
          <TableDesktop>
            <TableShell maxHeight="65vh">
              <table className="w-full text-xs">
                <TableHeadRow>
                  <Th label="Doc. SAP" />
                  <Th label="Material" />
                  <Th label="Situação" />
                  <Th label="RQBs" align="right" />
                  <Th label="No doc." align="right" />
                  <Th label="Falta" align="right" />
                  <Th label="Valor est." align="right" />
                  <Th label="Lançado no doc. / avulsos próximos" />
                  <Th label="Requisições" />
                </TableHeadRow>
                <TableBody>
                  {visiveis.map((l) => (
                    <Tr key={`${l.doc}|${l.material}`} accent={COR_SITUACAO[l.situacao]}>
                      <Td mono strong>
                        {l.doc}
                        <div className="font-sans text-[10px] font-normal" style={{ color: 'var(--ink-muted)' }}>
                          {l.doc_data ? formatDateBR(l.doc_data) : 'fora da MB51'}
                          {l.data_exportacao && <> · exp. {formatDateBR(l.data_exportacao)}</>}
                        </div>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => onMaterial?.(l.material)}
                          className="text-left cursor-pointer hover:underline"
                          title="Ver todas as requisições e a MB51 deste material"
                        >
                          <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                          <div className="max-w-[240px] truncate text-[11px]">{l.descricao}</div>
                        </button>
                        <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                          {l.tipo_movimento === 'transferencia' ? 'Transf.' : 'Saída'} · dep. {l.deposito}
                        </div>
                      </Td>
                      <Td><Selo texto={ROTULO_SITUACAO_DOC[l.situacao]} cor={COR_SITUACAO[l.situacao]} dica={DICA_SITUACAO_DOC[l.situacao]} /></Td>
                      <Td numeric align="right">{formatQtd(l.qtd_rqbs)} <span className="font-normal">{l.unidade}</span></Td>
                      <Td numeric align="right">{formatQtd(l.qtd_doc)}</Td>
                      <Td numeric align="right" strong>
                        <span style={{ color: l.falta > 0 ? 'var(--status-critical)' : 'var(--ink-secondary)' }}>
                          {l.falta > 0 ? formatQtd(l.falta) : `+${formatQtd(-l.falta)}`}
                        </span>
                      </Td>
                      <Td numeric align="right">{l.falta > 0 ? formatBRL(l.valor_falta) : '—'}</Td>
                      <Td>
                        <div className="max-w-[260px] font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{l.lancado_como || '—'}</div>
                        {l.avulsos && (
                          <div
                            className="max-w-[260px] text-[10px]"
                            style={{ color: 'var(--status-serious)' }}
                            title="Lançamentos do material sem RQB de 2 dias antes a 7 dias depois do documento — podem ser a correção feita à mão."
                          >
                            Avulsos: {l.avulsos}
                          </div>
                        )}
                      </Td>
                      <Td><div className="max-w-[320px]"><Rqbs l={l} /></div></Td>
                    </Tr>
                  ))}
                </TableBody>
              </table>
            </TableShell>
          </TableDesktop>
          {filtradas.length > limite && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setLimite((n) => n + PAGINA)}
                className="rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                Mostrar mais ({filtradas.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

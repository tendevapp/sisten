/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado › Requisição no Balcão › Relatório × MB51.
 *
 * Pesquisa por item (ou RQB, colaborador, PEP, doc.) e mostra todas as
 * requisições com datas de criação e exportação, totais e status — e confere
 * se o que está "Exportada" apareceu na MB51. A conferência item a item vem do
 * banco (`alm_rqb_auditoria_mb51`): pelo doc. SAP do item, pelo dia da
 * exportação ou pelo dia de uma exportação anterior. "Não exportada" e
 * "Aguardando confirmação" ainda não têm como estar na MB51.
 *
 * - Clique na linha: janela com a requisição inteira e o log.
 * - "Agrupado por item": um bloco por material, com totais.
 * - Seleção (material + depósito): abre um Inventário Cíclico para confirmar a
 *   quantidade física.
 * - Material escolhido: a MB51 dele dia a dia ao lado do que foi exportado —
 *   é por ali que se investiga a falta (ex.: RQB-300926-10, blusão 1291809).
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft, CheckSquare, ChevronDown, ChevronRight, ClipboardList, Download, Loader2, PackageSearch, RefreshCw,
  Search, Square, X,
} from 'lucide-react';
import type { Profile } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { confirmar } from '../../lib/confirmar';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { paraISOLocal } from '../../lib/dataLocal';
import { canAccessForm } from '../../lib/pages';
import FiltroPeriodoRequisicao from '../../components/almoxarifado/FiltroPeriodoRequisicao';
import DetalheAuditoriaModal from '../../components/almoxarifado/auditoriaRqb/DetalheAuditoriaModal';
import { DetalheMb51, SeloStatus } from '../../components/almoxarifado/auditoriaRqb/selos';
import {
  TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr,
} from '../../components/ui/DataTable';
import {
  ROTULO_CONFERIDO_POR, ROTULO_STATUS_MB51, ROTULO_STATUS_RQB, chaveContagem, contarAuditoria, ehDivergente,
  filtrarAuditoria, itensParaContar, resumirPorMaterial,
  type FiltroConferencia, type FiltroPeriodo, type LinhaAuditoriaRqb, type ResumoMaterial, type StatusRqb,
} from '../../lib/requisicaoBalcaoAuditoria';
import {
  abrirInventarioDaAuditoria, auditarRequisicoesMb51, movimentosMb51DoMaterial, type MovimentoMb51,
} from '../../lib/requisicaoBalcaoAuditoriaApi';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const ROTULO_CONFERENCIA: Record<FiltroConferencia, string> = {
  todas: 'Todas',
  divergentes: 'Divergentes',
  outra_data: 'Em outra data',
  ok: 'Na MB51',
  mb51_pendente: 'MB51 não importada',
  reexportadas: 'Reexportada sem reabrir',
  sem_exportar: 'Sem exportar',
};

const PAGINA = 300;
const GRUPOS_POR_PAGINA = 40;

/** Caixa de seleção de linha/grupo — não deixa o clique abrir o detalhe. */
function Marcar({ marcado, parcial, rotulo, onClick }: { marcado: boolean; parcial?: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={rotulo}
      aria-pressed={marcado}
      className="cursor-pointer p-0.5"
    >
      {marcado
        ? <CheckSquare className="h-4 w-4" style={{ color: 'var(--brand)' }} />
        : <Square className="h-4 w-4" style={{ color: parcial ? 'var(--brand)' : 'var(--ink-muted)' }} />}
    </button>
  );
}

const botaoSecundario = 'rounded-lg border px-2.5 py-1.5 text-[11px] font-bold cursor-pointer';
const estiloSecundario: React.CSSProperties = { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' };

export default function RequisicaoBalcaoRelatorio({ user, onNavigate }: Props) {
  const toast = useToast();
  const idBusca = useId();
  const idStatus = useId();
  const [periodo, setPeriodo] = useState<FiltroPeriodo>({ base: 'exportacao', de: '', ate: '' });
  const [linhas, setLinhas] = useState<LinhaAuditoriaRqb[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusRqb | 'todos'>('todos');
  const [conferencia, setConferencia] = useState<FiltroConferencia>('todas');
  const [visao, setVisao] = useState<'itens' | 'agrupado'>('itens');
  const [material, setMaterial] = useState<string | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [limiteGrupos, setLimiteGrupos] = useState(GRUPOS_POR_PAGINA);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [abrindoInventario, setAbrindoInventario] = useState(false);
  const podeInventario = canAccessForm(user, 'form_almoxarifado_inventario');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setLinhas(await auditarRequisicoesMb51({ base: periodo.base, de: periodo.de, ate: periodo.ate }));
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar o relatório.');
    } finally {
      setCarregando(false);
    }
  }, [periodo.base, periodo.de, periodo.ate]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setLimite(PAGINA); setLimiteGrupos(GRUPOS_POR_PAGINA); }, [busca, status, conferencia, material, visao, periodo]);

  const mb51Ate = useMemo(() => linhas.find((l) => l.mb51_ate)?.mb51_ate ?? null, [linhas]);

  // Busca e status valem para tudo; a conferência só para a lista.
  const doMaterial = useMemo(
    () => (material ? linhas.filter((l) => l.material === material) : linhas),
    [linhas, material],
  );
  const semConferencia = useMemo(
    () => filtrarAuditoria(doMaterial, { busca, status, conferencia: 'todas' }),
    [doMaterial, busca, status],
  );
  const filtradas = useMemo(
    () => filtrarAuditoria(semConferencia, { busca: '', status: 'todos', conferencia }),
    [semConferencia, conferencia],
  );
  const contagem = useMemo(() => contarAuditoria(semConferencia), [semConferencia]);
  const porMaterial = useMemo(() => resumirPorMaterial(filtradas), [filtradas]);
  const linhasPorMaterial = useMemo(() => {
    const m = new Map<string, LinhaAuditoriaRqb[]>();
    for (const l of filtradas) {
      const lista = m.get(l.material);
      if (lista) lista.push(l); else m.set(l.material, [l]);
    }
    return m;
  }, [filtradas]);
  const itensDetalhe = useMemo(
    () => (detalhe ? linhas.filter((l) => l.requisicao_id === detalhe) : []),
    [linhas, detalhe],
  );

  // Busca que é exatamente um código de material: já abre o item.
  useEffect(() => {
    const t = busca.trim().replace(/^0+/, '');
    if (!material && /^\d{5,}$/.test(t) && linhas.some((l) => l.material === t)) setMaterial(t);
  }, [busca, linhas, material]);

  const contagemConferencia: Record<FiltroConferencia, number> = {
    todas: contagem.itens,
    divergentes: contagem.divergentes,
    outra_data: contagem.outraData,
    ok: contagem.ok,
    mb51_pendente: contagem.mb51Pendente,
    reexportadas: contagem.reexportadas,
    sem_exportar: contagem.semExportar,
  };

  /* Seleção para o inventário (material + depósito) ------------------------ */

  const alternarItens = (ls: LinhaAuditoriaRqb[]) => {
    const chaves = itensParaContar(ls).map(chaveContagem);
    setSelecao((s) => {
      const n = new Set(s);
      const todas = chaves.every((c) => n.has(c));
      for (const c of chaves) { if (todas) n.delete(c); else n.add(c); }
      return n;
    });
  };
  const estadoSelecao = (ls: LinhaAuditoriaRqb[]) => {
    const chaves = itensParaContar(ls).map(chaveContagem);
    const n = chaves.filter((c) => selecao.has(c)).length;
    return { marcado: n > 0 && n === chaves.length, parcial: n > 0 && n < chaves.length };
  };
  const selecionarDivergentes = () => {
    const chaves = itensParaContar(filtradas.filter(ehDivergente)).map(chaveContagem);
    setSelecao((s) => new Set([...s, ...chaves]));
  };

  const abrirInventario = async () => {
    const itens = [...selecao].map((c) => { const [m, d] = c.split('|'); return { material: m, deposito: d }; });
    if (itens.length === 0) return;
    const ok = await confirmar({
      titulo: 'Abrir inventário cíclico?',
      mensagem: `Abre um inventário (INV) com ${itens.length} item(ns) — material e depósito — para contar e confirmar a quantidade física. Item que já está em contagem aberta noutro inventário é recusado.`,
      confirmarLabel: 'Abrir inventário',
    });
    if (!ok) return;
    setAbrindoInventario(true);
    try {
      const rqbs = [...new Set(linhas
        .filter((l) => l.deposito && selecao.has(chaveContagem({ material: l.material, deposito: l.deposito })) && ehDivergente(l))
        .map((l) => l.codigo))];
      const obs = `Conferência Requisição no Balcão × MB51.${rqbs.length ? ` RQBs divergentes: ${rqbs.slice(0, 40).join(', ')}${rqbs.length > 40 ? '…' : ''}` : ''}`;
      const r = await abrirInventarioDaAuditoria(itens, user, obs);
      toast.success(`Inventário ${r.codigo} aberto com ${itens.length} item(ns).`);
      setSelecao(new Set());
      onNavigate(`/formularios/almoxarifado-inventario?id=${r.id}`);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível abrir o inventário.');
    } finally {
      setAbrindoInventario(false);
    }
  };

  const exportarXlsx = () => {
    const dados = filtradas.map((l) => ({
      RQB: l.codigo,
      'Criação': l.data_criacao,
      'Exportação': l.data_exportacao ?? '',
      Arquivo: l.arquivo ?? '',
      'Exportações': l.exportacoes ?? '',
      'Reexportada sem reabrir': l.reexportada_sem_reabrir ? 'Sim' : '',
      Status: ROTULO_STATUS_RQB[l.status],
      'Conferência MB51': l.mb51_status ? ROTULO_STATUS_MB51[l.mb51_status] : '',
      'Conferido': l.conferido_por ? ROTULO_CONFERIDO_POR[l.conferido_por] : '',
      Colaborador: l.colaborador ?? '',
      Tipo: l.tipo_movimento,
      Material: l.material,
      'Descrição': l.descricao ?? '',
      Quantidade: l.quantidade,
      Unidade: l.unidade ?? '',
      'Depósito': l.deposito ?? '',
      'Depósito destino': l.deposito_destino ?? '',
      PEP: l.pep ?? '',
      'Doc. SAP (item)': l.item_doc_sap || l.doc_sap || '',
      'Coberto na MB51': l.mb51_coberto ?? '',
      'MB51 no dia': l.mb51_qtd_dia ?? '',
      'Exportado no dia': l.esperado_dia ?? '',
      'Docs MB51': l.mb51_docs ?? '',
      'Lançado depois': l.outra_data ?? '',
      'Antes da exportação': l.mb51_antes ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RQB x MB51');
    XLSX.writeFile(wb, `rqb_x_mb51${material ? `_${material}` : ''}.xlsx`);
    toast.success(`${dados.length} linha(s) exportada(s).`);
  };

  const visiveis = filtradas.slice(0, limite);
  const gruposVisiveis = porMaterial.slice(0, limiteGrupos);

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado-requisicao-balcao')}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Voltar para Requisição no Balcão
          </button>
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>Requisição no Balcão × MB51</h1>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Tudo que foi exportado tem de estar na MB51: pelo doc. SAP do item ou, sem ele, no dia da exportação (mesmo material e
            depósito; saída 221/201/241, transferência 311).{mb51Ate && <> MB51 importada até <strong>{formatDateBR(mb51Ate)}</strong>.</>}
            {' '}Clique na linha para ver a requisição e o log.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void carregar()} className={`inline-flex items-center gap-1.5 ${botaoSecundario}`} style={estiloSecundario}>
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            type="button"
            onClick={exportarXlsx}
            disabled={filtradas.length === 0}
            className={`inline-flex items-center gap-1.5 disabled:opacity-40 ${botaoSecundario}`}
            style={estiloSecundario}
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
          <label htmlFor={idBusca} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
            Item, RQB, colaborador, PEP ou documento
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input
              id={idBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: 1291809 ou blusão"
              className="w-full rounded-lg border py-1.5 pl-8 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <label htmlFor={idStatus} className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Status</label>
          <select
            id={idStatus}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusRqb | 'todos')}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
          >
            <option value="todos">Todos</option>
            {(Object.keys(ROTULO_STATUS_RQB) as StatusRqb[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS_RQB[s]}</option>)}
          </select>
        </div>
        <FiltroPeriodoRequisicao valor={periodo} onChange={setPeriodo} />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Conferência com a MB51">
        {(Object.keys(ROTULO_CONFERENCIA) as FiltroConferencia[]).map((f) => {
          const ativo = conferencia === f;
          const alerta = (f === 'divergentes' || f === 'reexportadas') && contagemConferencia[f] > 0;
          const cor = f === 'reexportadas' ? 'var(--status-serious)' : 'var(--status-critical)';
          return (
            <button
              key={f}
              type="button"
              onClick={() => setConferencia(f)}
              aria-pressed={ativo}
              className="rounded-lg border px-2.5 py-1 text-[11px] font-bold cursor-pointer"
              style={ativo
                ? { background: alerta ? cor : 'var(--brand)', borderColor: 'transparent', color: '#fff' }
                : { borderColor: alerta ? cor : 'var(--hairline)', color: alerta ? cor : 'var(--ink-secondary)' }}
            >
              {ROTULO_CONFERENCIA[f]} ({contagemConferencia[f]})
            </button>
          );
        })}
        <div className="ml-auto inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }}>
          {(['itens', 'agrupado'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisao(v)}
              aria-pressed={visao === v}
              className="rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={visao === v ? { background: 'var(--brand)', color: '#fff' } : { color: 'var(--ink-secondary)' }}
            >
              {v === 'itens' ? 'Por requisição' : 'Agrupado por item'}
            </button>
          ))}
        </div>
      </div>

      {podeInventario && (
        <div
          className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: selecao.size > 0 ? 'var(--brand)' : 'var(--hairline)', background: 'var(--surface-raised)' }}
        >
          <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
            {selecao.size > 0
              ? <><strong style={{ color: 'var(--ink-primary)' }}>{selecao.size}</strong> item(ns) (material + depósito) para contar</>
              : 'Marque os itens para confirmar a quantidade física no Inventário Cíclico.'}
          </span>
          <div className="flex flex-wrap gap-2">
            {contagem.divergentes > 0 && (
              <button type="button" onClick={selecionarDivergentes} className={botaoSecundario} style={estiloSecundario}>
                Marcar divergentes da lista
              </button>
            )}
            {selecao.size > 0 && (
              <button
                type="button"
                onClick={() => setSelecao(new Set())}
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer hover:underline"
                style={{ color: 'var(--ink-muted)' }}
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={() => void abrirInventario()}
              disabled={selecao.size === 0 || abrindoInventario}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--brand)' }}
            >
              {abrindoInventario ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
              Abrir inventário cíclico
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>{erro}</div>
      )}

      {material && (
        <PainelMaterial
          material={material}
          linhas={semConferencia}
          onFechar={() => { setMaterial(null); if (busca.trim().replace(/^0+/, '') === material) setBusca(''); }}
        />
      )}

      {carregando && linhas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Conferindo com a MB51…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          Nada encontrado com esses filtros.
        </div>
      ) : visao === 'agrupado' ? (
        <div className="space-y-2">
          {gruposVisiveis.map((m) => {
            const ls = linhasPorMaterial.get(m.material) ?? [];
            const sel = estadoSelecao(ls);
            return (
              <GrupoItem
                key={m.material}
                resumo={m}
                linhas={ls}
                podeSelecionar={podeInventario}
                marcado={sel.marcado}
                parcial={sel.parcial}
                onMarcar={() => alternarItens(ls)}
                onAbrir={(id) => setDetalhe(id)}
                onVerMb51={() => setMaterial(m.material)}
              />
            );
          })}
          {porMaterial.length > gruposVisiveis.length && (
            <div className="text-center">
              <button type="button" onClick={() => setLimiteGrupos((n) => n + GRUPOS_POR_PAGINA)} className={botaoSecundario} style={estiloSecundario}>
                Mostrar mais itens ({porMaterial.length - gruposVisiveis.length} restantes)
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <TableCards>
            {visiveis.map((l) => (
              <TableCardRow key={l.item_id} onClick={() => setDetalhe(l.requisicao_id)} accent={ehDivergente(l) ? 'var(--status-critical)' : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    {podeInventario && (
                      <Marcar
                        {...estadoSelecao([l])}
                        rotulo={`Marcar ${l.material} no depósito ${l.deposito} para o inventário`}
                        onClick={() => alternarItens([l])}
                      />
                    )}
                    <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.codigo}</span>
                  </span>
                  <SeloStatus l={l} />
                </div>
                <div className="text-xs" style={{ color: 'var(--ink-primary)' }}>
                  <span className="font-mono font-bold">{l.material}</span> {l.descricao} — <strong>{formatQtd(l.quantidade)} {l.unidade}</strong>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  Criada {formatDateBR(l.data_criacao)}
                  {l.data_exportacao && <> · exportada {formatDateBR(l.data_exportacao)}</>} · dep. {l.deposito}
                  {l.colaborador && <> · {l.colaborador}</>}
                </div>
                <DetalheMb51 l={l} />
              </TableCardRow>
            ))}
          </TableCards>
          <TableDesktop>
            <TableShell maxHeight="65vh">
              <TabelaLinhas
                linhas={visiveis}
                mostrarMaterial
                podeSelecionar={podeInventario}
                estadoSelecao={estadoSelecao}
                onMarcar={(l) => alternarItens([l])}
                onAbrir={(id) => setDetalhe(id)}
                onMaterial={(m) => setMaterial(m)}
              />
            </TableShell>
          </TableDesktop>
          {filtradas.length > limite && (
            <div className="text-center">
              <button type="button" onClick={() => setLimite((n) => n + PAGINA)} className={botaoSecundario} style={estiloSecundario}>
                Mostrar mais ({filtradas.length - limite} restantes)
              </button>
            </div>
          )}
        </>
      )}

      {detalhe && itensDetalhe.length > 0 && (
        <DetalheAuditoriaModal itens={itensDetalhe} onClose={() => setDetalhe(null)} />
      )}
    </div>
  );
}

/* Tabela de linhas (desktop) --------------------------------------------------- */

function TabelaLinhas({
  linhas, mostrarMaterial, podeSelecionar, estadoSelecao, onMarcar, onAbrir, onMaterial,
}: {
  linhas: LinhaAuditoriaRqb[];
  mostrarMaterial: boolean;
  podeSelecionar: boolean;
  estadoSelecao: (ls: LinhaAuditoriaRqb[]) => { marcado: boolean; parcial: boolean };
  onMarcar: (l: LinhaAuditoriaRqb) => void;
  onAbrir: (requisicaoId: string) => void;
  onMaterial?: (material: string) => void;
}) {
  return (
    <table className="w-full text-xs">
      <TableHeadRow>
        {podeSelecionar && <Th label="" width="w-8" />}
        <Th label="RQB" />
        <Th label="Criação" />
        <Th label="Exportação" />
        {mostrarMaterial && <Th label="Material" />}
        <Th label="Qtd." align="right" />
        <Th label="Dep." />
        <Th label="Colaborador / PEP" />
        <Th label="Status" />
        <Th label="Conferência MB51" />
      </TableHeadRow>
      <TableBody>
        {linhas.map((l) => (
          <Tr
            key={l.item_id}
            onClick={() => onAbrir(l.requisicao_id)}
            title="Abrir a requisição com detalhes e log"
            accent={ehDivergente(l) ? 'var(--status-critical)' : undefined}
          >
            {podeSelecionar && (
              <Td>
                <Marcar
                  {...estadoSelecao([l])}
                  rotulo={`Marcar ${l.material} no depósito ${l.deposito} para o inventário`}
                  onClick={() => onMarcar(l)}
                />
              </Td>
            )}
            <Td mono strong>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAbrir(l.requisicao_id); }}
                className="cursor-pointer hover:underline"
                aria-label={`Abrir ${l.codigo} com detalhes e log`}
              >
                {l.codigo}
              </button>
              <div className="font-sans text-[10px] font-normal" style={{ color: 'var(--ink-muted)' }}>
                {l.tipo_movimento === 'transferencia' ? `Transf. → ${l.deposito_destino ?? '—'}` : 'Saída'}
              </div>
            </Td>
            <Td numeric>{formatDateBR(l.data_criacao)}</Td>
            <Td numeric>
              {l.data_exportacao ? formatDateBR(l.data_exportacao) : '—'}
              {l.exportada_em && (
                <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }} title={l.arquivo ?? undefined}>
                  {formatDateTimeBR(l.exportada_em).slice(-5)}{l.exportacoes_qtd > 1 && ` · ${l.exportacoes_qtd}ª exportação`}
                </div>
              )}
            </Td>
            {mostrarMaterial && (
              <Td>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMaterial?.(l.material); }}
                  className="text-left cursor-pointer hover:underline"
                  title="Ver todas as requisições e a MB51 deste material"
                >
                  <span className="font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>{l.material}</span>
                  <div className="max-w-[260px] truncate text-[11px]">{l.descricao}</div>
                </button>
              </Td>
            )}
            <Td numeric align="right" strong>{formatQtd(l.quantidade)} <span className="font-normal">{l.unidade}</span></Td>
            <Td mono>{l.deposito}</Td>
            <Td>
              <div className="max-w-[180px] truncate" title={l.colaborador ?? undefined}>{l.colaborador || '—'}</div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--ink-muted)' }}>{l.pep || ''}</div>
            </Td>
            <Td><SeloStatus l={l} /></Td>
            <Td><DetalheMb51 l={l} /></Td>
          </Tr>
        ))}
      </TableBody>
    </table>
  );
}

/* Agrupado por item ------------------------------------------------------------ */

function GrupoItem({
  resumo, linhas, podeSelecionar, marcado, parcial, onMarcar, onAbrir, onVerMb51,
}: {
  resumo: ResumoMaterial;
  linhas: LinhaAuditoriaRqb[];
  podeSelecionar: boolean;
  marcado: boolean;
  parcial: boolean;
  onMarcar: () => void;
  onAbrir: (requisicaoId: string) => void;
  onVerMb51: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const m = resumo;
  const falta = m.qtdExportada - m.qtdNaMb51;
  const depositos = [...new Set(linhas.map((l) => l.deposito).filter(Boolean))].join(', ');
  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: m.divergentes > 0 ? 'var(--status-critical)' : 'var(--hairline)', background: 'var(--surface-card)' }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {podeSelecionar && (
          <Marcar marcado={marcado} parcial={parcial} rotulo={`Marcar ${m.material} para o inventário`} onClick={onMarcar} />
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
        >
          {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{m.material}</span>{' '}
            <span className="text-xs" style={{ color: 'var(--ink-primary)' }}>{m.descricao}</span>
            <span className="block text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
              {m.requisicoes} RQB · {linhas.length} linha(s) · dep. {depositos || '—'} · total {formatQtd(m.qtdTotal)} {m.unidade} ·
              exportado {formatQtd(m.qtdExportada)} · na MB51 {formatQtd(m.qtdNaMb51)}
              {m.qtdSemExportar > 0 && <> · sem exportar {formatQtd(m.qtdSemExportar)}</>}
              {falta > 0 && <strong style={{ color: 'var(--status-critical)' }}> · faltam {formatQtd(falta)} na MB51</strong>}
            </span>
          </span>
        </button>
        <button type="button" onClick={onVerMb51} className="rounded-lg border px-2 py-1 text-[11px] font-bold cursor-pointer" style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}>
          MB51 do item
        </button>
      </div>
      {aberto && (
        <>
          <div className="divide-y border-t lg:hidden" style={{ borderColor: 'var(--hairline)' }}>
            {linhas.map((l) => (
              <button
                key={l.item_id}
                type="button"
                onClick={() => onAbrir(l.requisicao_id)}
                className="block w-full space-y-1 px-3 py-2 text-left cursor-pointer"
                style={{ boxShadow: ehDivergente(l) ? 'inset 3px 0 0 0 var(--status-critical)' : undefined }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{l.codigo}</span>
                  <SeloStatus l={l} />
                </div>
                <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  {formatQtd(l.quantidade)} {l.unidade} · criada {formatDateBR(l.data_criacao)}
                  {l.data_exportacao && <> · exportada {formatDateBR(l.data_exportacao)}</>} · dep. {l.deposito}
                </div>
                <DetalheMb51 l={l} />
              </button>
            ))}
          </div>
          <div className="hidden overflow-x-auto border-t lg:block" style={{ borderColor: 'var(--hairline)' }}>
            <TabelaLinhas
              linhas={linhas}
              mostrarMaterial={false}
              podeSelecionar={false}
              estadoSelecao={() => ({ marcado: false, parcial: false })}
              onMarcar={() => undefined}
              onAbrir={onAbrir}
            />
          </div>
        </>
      )}
    </section>
  );
}

/* Material escolhido: totais + MB51 dia a dia --------------------------------- */

interface DiaMaterial {
  data: string;
  exportado: number;
  mb51: number;
  rqbs: string[];
  docs: string[];
}

/** Junta, por dia, o que as RQBs exportaram e o que a MB51 lançou (saída − estorno; transferência pela origem). */
function diasDoMaterial(linhas: LinhaAuditoriaRqb[], movs: MovimentoMb51[]): DiaMaterial[] {
  const dias = new Map<string, DiaMaterial>();
  const dia = (d: string) => {
    let x = dias.get(d);
    if (!x) { x = { data: d, exportado: 0, mb51: 0, rqbs: [], docs: [] }; dias.set(d, x); }
    return x;
  };
  for (const l of linhas) {
    if (l.status !== 'exportada' || !l.data_exportacao) continue;
    const x = dia(l.data_exportacao);
    x.exportado += l.quantidade;
    if (!x.rqbs.includes(l.codigo)) x.rqbs.push(l.codigo);
  }
  for (const m of movs) {
    const q = Number(m.qtd_um_registro) || 0;
    const ehSaida = ['201', '221', '241'].includes(m.tipo_movimento) && q < 0;
    const ehEstorno = ['202', '222', '242'].includes(m.tipo_movimento) && q > 0;
    const ehTransfOrigem = m.tipo_movimento === '311' && q < 0;
    const ehEstornoTransf = m.tipo_movimento === '312' && q > 0;
    if (!ehSaida && !ehEstorno && !ehTransfOrigem && !ehEstornoTransf) continue;
    const x = dia(m.data_lancamento);
    x.mb51 += -q;
    if (!x.docs.includes(m.doc_material)) x.docs.push(m.doc_material);
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}

function PainelMaterial({ material, linhas, onFechar }: { material: string; linhas: LinhaAuditoriaRqb[]; onFechar: () => void }) {
  const [movs, setMovs] = useState<MovimentoMb51[] | null>(null);
  const [erro, setErro] = useState('');
  const [verMovs, setVerMovs] = useState(false);

  const desde = useMemo(() => {
    const datas = linhas.map((l) => l.data_criacao).filter(Boolean).sort();
    if (!datas[0]) return null;
    const d = new Date(`${datas[0]}T12:00:00`);
    d.setDate(d.getDate() - 7);
    return paraISOLocal(d);
  }, [linhas]);

  useEffect(() => {
    let ativo = true;
    setMovs(null);
    setErro('');
    movimentosMb51DoMaterial(material, desde)
      .then((m) => { if (ativo) setMovs(m); })
      .catch((e: any) => { if (ativo) setErro(e?.message || 'Não foi possível ler a MB51.'); });
    return () => { ativo = false; };
  }, [material, desde]);

  const resumo = resumirPorMaterial(linhas)[0];
  const dias = useMemo(() => diasDoMaterial(linhas, movs ?? []), [linhas, movs]);

  return (
    <section className="space-y-3 rounded-xl border p-3" style={{ borderColor: 'var(--brand)', background: 'var(--surface-raised)' }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <PackageSearch className="mt-0.5 h-4 w-4" style={{ color: 'var(--brand)' }} />
          <div>
            <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              <span className="font-mono">{material}</span> {resumo?.descricao}
            </h2>
            {resumo && (
              <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                {resumo.requisicoes} requisição(ões) · total {formatQtd(resumo.qtdTotal)} {resumo.unidade} · exportado {formatQtd(resumo.qtdExportada)} ·
                na MB51 no dia da exportação {formatQtd(resumo.qtdNaMb51)} · sem exportar {formatQtd(resumo.qtdSemExportar)}
                {resumo.divergentes > 0 && <strong style={{ color: 'var(--status-critical)' }}> · {resumo.divergentes} item(ns) divergente(s)</strong>}
              </p>
            )}
          </div>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar o material" className="rounded-lg p-1 cursor-pointer hover:opacity-70" style={{ color: 'var(--ink-muted)' }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {erro ? (
        <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>
      ) : movs === null ? (
        <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo a MB51…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr style={{ background: 'var(--surface)' }}>
                  {['Dia', 'Exportado (RQB)', 'MB51 (saída/transf.)', 'Diferença', 'Requisições', 'Docs MB51'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => {
                  const dif = d.mb51 - d.exportado;
                  const cor = dif < 0 ? 'var(--status-critical)' : dif > 0 ? 'var(--status-serious)' : 'var(--status-good)';
                  return (
                    <tr key={d.data} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-2 py-1.5 font-semibold tabular" style={{ color: 'var(--ink-primary)' }}>{formatDateBR(d.data)}</td>
                      <td className="px-2 py-1.5 tabular">{formatQtd(d.exportado)}</td>
                      <td className="px-2 py-1.5 tabular">{formatQtd(d.mb51)}</td>
                      <td className="px-2 py-1.5 font-bold tabular" style={{ color: cor }}>
                        {dif === 0 ? 'ok' : dif < 0 ? `faltam ${formatQtd(-dif)}` : `+${formatQtd(dif)} sem RQB`}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{d.rqbs.join(', ') || '—'}</td>
                      <td className="px-2 py-1.5 font-mono" style={{ color: 'var(--ink-muted)' }}>{d.docs.join(', ') || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>
            Dia a dia, todos os depósitos. "Sem RQB" é lançamento na MB51 sem requisição exportada naquele dia (baixa direta, outro
            processo ou requisição lançada em outra data). A conferência item a item, acima, separa por depósito.
          </p>
          <button
            type="button"
            onClick={() => setVerMovs((v) => !v)}
            className="text-[11px] font-bold hover:underline cursor-pointer"
            style={{ color: 'var(--brand)' }}
          >
            {verMovs ? 'Ocultar' : 'Ver'} os {movs.length} lançamento(s) da MB51
          </button>
          {verMovs && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    {['Lançamento', 'Doc.', 'Mov.', 'Dep.', 'Qtd.', 'PEP', 'Usuário', 'Referência / texto'].map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-2 py-1 tabular">{formatDateBR(m.data_lancamento)}</td>
                      <td className="px-2 py-1 font-mono">{m.doc_material}</td>
                      <td className="px-2 py-1 font-mono">{m.tipo_movimento}</td>
                      <td className="px-2 py-1 font-mono">{m.deposito}</td>
                      <td className="px-2 py-1 tabular font-semibold">{formatQtd(m.qtd_um_registro)}</td>
                      <td className="px-2 py-1 font-mono">{m.elemento_pep || '—'}</td>
                      <td className="px-2 py-1">{m.nome_usuario || '—'}</td>
                      <td className="px-2 py-1">{[m.referencia, m.texto_cabecalho_doc].filter(Boolean).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

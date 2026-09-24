/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Inventário Cíclico (FRM.ALM-0015).
 *
 * Substitui a "Ficha de Inventário Cíclico" em papel. O responsável escolhe
 * os itens a contar — a tela sugere a curva 80/20 do(s) depósito(s) — e o
 * almoxarife conta um a um. Cada contagem é enviada e fica gravada sem
 * poder ser alterada; o banco compara com o saldo da ZL0024 e responde só
 * "bateu / não bateu" (contagem cega).
 *
 * Divergiu: a tela pergunta se quer recontar. Sim → abre a próxima
 * contagem ao lado da anterior (até 3). Não → mostra o saldo da ZL0024 e
 * grava o alerta; depois de ver o saldo o item não aceita nova contagem.
 *
 * O resultado sai em planilha e em PDF.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Check, ClipboardList, Download, Eye, FileText, Loader2, Plus, RefreshCw, RotateCcw, Search, Trash2,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { localDb } from '../../db/localDb';
import { formatDeposito, ordenarDepositos } from '../../lib/almoxarifado';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import {
  FORM_CODIGO_INVENTARIO, MAX_CONTAGENS, ROTULO_CRITERIO, ROTULO_STATUS_ITEM, chaveItem, itemEncerrado, montarCandidatos,
  proximaContagem, resumirInventario,
  type CandidatoInventario, type ClasseCurva, type CriterioCurva, type ItemInventario, type StatusItemInventario,
} from '../../lib/inventarioCiclico';
import {
  adicionarItensInventario, criarInventario, encerrarItemInventario, excluirInventario, listarInventarios, registrarContagem,
  removerItemInventario, type InventarioRow, type ResultadoContagem,
} from '../../lib/inventarioCiclicoApi';
import { exportarPlanilhaInventario } from '../../lib/inventarioCiclicoPlanilha';
import { exportInventarioCiclicoPdf } from '../../lib/pdfExport/exportInventarioCiclicoPdf';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import type { EstoqueGiro, EstoqueItem, Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-sm font-medium focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

const btnSec =
  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer disabled:opacity-50';
const btnPri =
  'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-50';

function Campo({ rotulo, children, obrigatorio }: { rotulo: string; children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>
        {rotulo} {obrigatorio && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const TOKEN_STATUS: Record<StatusItemInventario, string> = {
  pendente: 'var(--ink-muted)',
  aguardando_decisao: 'var(--status-serious)',
  conferido: 'var(--status-good)',
  divergente: 'var(--status-critical)',
};

function Chip({ token, children }: { token: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${token} 14%, transparent)`, color: token }}
    >
      {children}
    </span>
  );
}

function ChipStatusItem({ status }: { status: StatusItemInventario }) {
  return (
    <Chip token={TOKEN_STATUS[status]}>
      {status === 'conferido' && <Check className="h-3 w-3" />}
      {(status === 'divergente' || status === 'aguardando_decisao') && <AlertTriangle className="h-3 w-3" />}
      {ROTULO_STATUS_ITEM[status]}
    </Chip>
  );
}

// Depósitos e critério da última seleção — conveniência do aparelho.
const CHAVE_PREFERENCIAS = 'sisten_inventario_ciclico_selecao';
interface Preferencias { depositos: string[]; criterio: CriterioCurva }
function lerPreferencias(): Preferencias {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFERENCIAS) || '{}');
    return {
      depositos: Array.isArray(p.depositos) ? p.depositos : ['0001', '0002'],
      criterio: p.criterio === 'valor' ? 'valor' : 'consumo',
    };
  } catch {
    return { depositos: ['0001', '0002'], criterio: 'consumo' };
  }
}
function gravarPreferencias(p: Preferencias): void {
  try { localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify(p)); } catch { /* sem storage: só não lembra */ }
}

// ===========================================================================
// Tela
// ===========================================================================

export default function InventarioCiclico({ user, onNavigate }: Props) {
  const toast = useToast();
  const [inventarios, setInventarios] = useState<InventarioRow[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [giro, setGiro] = useState<EstoqueGiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ inventario?: InventarioRow } | null>(null);
  const [busca, setBusca] = useState('');

  const recarregarInventarios = useCallback(async () => {
    try {
      setInventarios(await listarInventarios());
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os inventários.');
    }
  }, [toast]);

  const recarregar = useCallback(async (forcar = false) => {
    setLoading(true);
    try {
      const [est, gir] = await Promise.all([
        localDb.fetchEstoque(forcar),
        localDb.fetchGiroEstoque(forcar).catch(() => [] as EstoqueGiro[]),
        recarregarInventarios(),
      ]);
      setEstoque(est);
      setGiro(gir);
    } finally {
      setLoading(false);
    }
  }, [recarregarInventarios]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const aberto = inventarios.find((i) => i.id === abertoId) ?? null;

  const filtrados = useMemo(() => {
    const t = semAcento(busca.trim());
    if (!t) return inventarios;
    return inventarios.filter((i) =>
      semAcento([i.codigo, i.criado_por_nome, i.conferente_nome, ...i.itens.map((x) => `${x.material} ${x.descricao}`)].join(' ')).includes(t),
    );
  }, [inventarios, busca]);

  const emAberto = inventarios.filter((i) => i.status === 'aberto').length;
  const comDivergencia = inventarios.filter((i) => i.itens.some((x) => x.status === 'divergente')).length;

  const modalNovo = novo && (
    <ModalSelecaoItens
      user={user}
      estoque={estoque}
      giro={giro}
      inventario={novo.inventario}
      onClose={() => setNovo(null)}
      onSalvo={async (id) => {
        setNovo(null);
        await recarregarInventarios();
        setAbertoId(id);
      }}
    />
  );

  if (aberto) {
    return (
      <>
        <VistaInventario
          user={user}
          inv={aberto}
          onVoltar={() => setAbertoId(null)}
          onRecarregar={recarregarInventarios}
          onAdicionar={() => setNovo({ inventario: aberto })}
          onExcluido={async () => { setAbertoId(null); await recarregarInventarios(); }}
        />
        {modalNovo}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado')}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Voltar para Almoxarifado
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>Inventário Cíclico</h1>
            <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)', color: 'var(--ink-muted)' }}>
              {FORM_CODIGO_INVENTARIO}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            Contagem cega dos itens selecionados, comparada com o saldo da ZL0024.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => void recarregar(true)} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={() => setNovo({})} disabled={loading} className={btnPri} style={{ background: 'var(--brand)' }}>
            <Plus className="h-4 w-4" /> Novo inventário
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Indicador rotulo="Inventários" valor={inventarios.length} />
        <Indicador rotulo="Em andamento" valor={emAberto} destaque={emAberto > 0} />
        <Indicador rotulo="Com divergência" valor={comDivergencia} critico={comDivergencia > 0} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código, responsável, conferente ou material"
          className={`${inputCls} pl-8 text-xs`}
        />
      </div>

      {loading && inventarios.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {inventarios.length === 0 ? 'Nenhum inventário registrado ainda.' : 'Nada encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map((inv) => <CartaoInventario key={inv.id} inv={inv} onAbrir={() => setAbertoId(inv.id)} />)}
        </div>
      )}

      {modalNovo}
    </div>
  );
}

function Indicador({ rotulo, valor, destaque, critico }: { rotulo: string; valor: number | string; destaque?: boolean; critico?: boolean }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      <span
        className="block text-2xl font-extrabold tabular-nums"
        style={{ color: critico ? 'var(--status-critical)' : destaque ? 'var(--status-serious)' : 'var(--ink-primary)' }}
      >
        {valor}
      </span>
    </div>
  );
}

function BarraProgresso({ inv }: { inv: InventarioRow }) {
  const r = resumirInventario(inv.itens);
  const pct = (n: number) => (r.total > 0 ? (n / r.total) * 100 : 0);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink-muted) 15%, transparent)' }}>
      <div style={{ width: `${pct(r.conferidos)}%`, background: 'var(--status-good)' }} />
      <div style={{ width: `${pct(r.divergentes)}%`, background: 'var(--status-critical)' }} />
      <div style={{ width: `${pct(r.aguardando)}%`, background: 'var(--status-serious)' }} />
    </div>
  );
}

function CartaoInventario({ inv, onAbrir }: { inv: InventarioRow; onAbrir: () => void }) {
  const r = resumirInventario(inv.itens);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="block w-full rounded-xl border px-4 py-3 text-left transition-colors hover:border-[var(--brand)]"
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>{inv.codigo}</span>
          {inv.status === 'concluido'
            ? <Chip token="var(--status-good)"><Check className="h-3 w-3" /> Concluído</Chip>
            : <Chip token="var(--brand)">Em andamento</Chip>}
          {r.divergentes > 0 && <Chip token="var(--status-critical)"><AlertTriangle className="h-3 w-3" /> {r.divergentes} divergente(s)</Chip>}
          {r.aguardando > 0 && <Chip token="var(--status-serious)">{r.aguardando} aguardando decisão</Chip>}
        </div>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{formatDateBR(inv.data)}</span>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
        {r.total} item(ns) · {r.conferidos + r.divergentes} encerrado(s)
        {r.acuracidade != null && <> · acuracidade {r.acuracidade.toFixed(0)}%</>}
        {' · '}{inv.criado_por_nome || '—'}
        {inv.conferente_nome && <> · conferente {inv.conferente_nome}</>}
      </p>
      <div className="mt-2"><BarraProgresso inv={inv} /></div>
    </button>
  );
}

// ===========================================================================
// Seleção dos itens (novo inventário ou acréscimo)
// ===========================================================================

const LIMITE_LISTA = 300;
const COR_CLASSE: Record<ClasseCurva, string> = {
  A: 'var(--status-critical)',
  B: 'var(--status-serious)',
  C: 'var(--ink-muted)',
};

function ModalSelecaoItens({
  user, estoque, giro, inventario, onClose, onSalvo,
}: {
  user: Profile;
  estoque: EstoqueItem[];
  giro: EstoqueGiro[];
  /** Presente = acrescentar itens a este inventário. */
  inventario?: InventarioRow;
  onClose: () => void;
  onSalvo: (id: string) => void | Promise<void>;
}) {
  const toast = useToast();
  const pref = useMemo(lerPreferencias, []);
  const [data, setData] = useState(hojeISO());
  const [conferente, setConferente] = useState('');
  const [observacao, setObservacao] = useState('');
  const [depositos, setDepositos] = useState<string[]>(pref.depositos);
  const [criterio, setCriterio] = useState<CriterioCurva>(giro.length > 0 ? pref.criterio : 'valor');
  const [texto, setTexto] = useState('');
  const [soClasseA, setSoClasseA] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, CandidatoInventario>>(new Map());
  const [salvando, setSalvando] = useState(false);

  const jaNoInventario = useMemo(
    () => new Set((inventario?.itens || []).map((i) => chaveItem(i.material, i.deposito))),
    [inventario],
  );

  const depositosDisponiveis = useMemo(
    () => ordenarDepositos(new Set(estoque.map((e) => String(e.deposito ?? '').trim().padStart(4, '0')).filter((d) => d !== '0000'))),
    [estoque],
  );

  const candidatos = useMemo(
    () => montarCandidatos(estoque, giro, criterio, depositos).filter((c) => !jaNoInventario.has(c.chave)),
    [estoque, giro, criterio, depositos, jaNoInventario],
  );

  const visiveis = useMemo(() => {
    const termos = semAcento(texto.trim()).split(/\s+/).filter(Boolean);
    return candidatos.filter((c) => {
      if (soClasseA && c.classe !== 'A') return false;
      if (termos.length === 0) return true;
      const alvo = semAcento(`${c.material} ${c.descricao}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [candidatos, texto, soClasseA]);

  const qtdClasseA = candidatos.filter((c) => c.classe === 'A').length;

  const alternar = (c: CandidatoInventario) => setMarcados((m) => {
    const n = new Map(m);
    if (n.has(c.chave)) n.delete(c.chave); else n.set(c.chave, c);
    return n;
  });

  const marcarVarios = (lista: CandidatoInventario[], valor: boolean) => setMarcados((m) => {
    const n = new Map(m);
    lista.forEach((c) => (valor ? n.set(c.chave, c) : n.delete(c.chave)));
    return n;
  });

  const alternarDeposito = (d: string) =>
    setDepositos((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));

  const salvar = async () => {
    if (marcados.size === 0) { toast.error('Selecione ao menos um item para contar.'); return; }
    setSalvando(true);
    gravarPreferencias({ depositos, criterio });
    const itens = [...marcados.values()]
      .sort((a, b) => a.deposito.localeCompare(b.deposito) || a.posicao - b.posicao)
      .map((c) => ({ material: c.material, deposito: c.deposito, classe: c.classe }));
    try {
      if (inventario) {
        const n = await adicionarItensInventario(inventario.id, itens);
        toast.success(`${n} item(ns) acrescentado(s) ao ${inventario.codigo}.`);
        await onSalvo(inventario.id);
      } else {
        const depTxt = depositos.length > 0 ? depositos.join(', ') : 'todos os depósitos';
        const r = await criarInventario({
          data,
          criterio: `Curva 80/20 por ${ROTULO_CRITERIO[criterio].toLowerCase()} — ${depTxt}`,
          observacao: observacao.trim() || null,
          conferente_nome: conferente.trim() || null,
          criado_por_nome: user.name,
        }, itens);
        toast.success(`Inventário ${r.codigo} aberto com ${itens.length} item(ns).`);
        await onSalvo(r.id);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar o inventário.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel="Seleção de itens do inventário" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          {inventario ? `Acrescentar itens · ${inventario.codigo}` : 'Novo inventário cíclico'}
        </h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Selecione os itens a contar. O saldo do sistema não aparece — a contagem é cega.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {!inventario && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Data da conferência" obrigatorio>
              <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            </Campo>
            <Campo rotulo="Conferente">
              <input
                value={conferente}
                onChange={(e) => setConferente(e.target.value.toUpperCase())}
                placeholder="Quem vai contar"
                className={inputCls}
              />
            </Campo>
            <Campo rotulo="Observação">
              <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputCls} />
            </Campo>
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            Depósitos {depositos.length === 0 && '(nenhum marcado = todos)'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {depositosDisponiveis.map((d) => {
              const ativo = depositos.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => alternarDeposito(d)}
                  title={formatDeposito(d)}
                  className="rounded-full border px-2.5 py-1 text-[11px] font-bold"
                  style={ativo
                    ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'white' }
                    : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  {formatDeposito(d)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }}>
            {(Object.keys(ROTULO_CRITERIO) as CriterioCurva[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCriterio(c)}
                disabled={c === 'consumo' && giro.length === 0}
                title={c === 'consumo' && giro.length === 0 ? 'Giro de estoque indisponível' : undefined}
                className="rounded-md px-2.5 py-1 text-[11px] font-bold disabled:opacity-40"
                style={criterio === c ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
              >
                Curva por {ROTULO_CRITERIO[c].toLowerCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => marcarVarios(candidatos.filter((c) => c.classe === 'A'), true)}
            disabled={qtdClasseA === 0}
            className={btnSec}
            style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
          >
            <Check className="h-3.5 w-3.5" /> Marcar os 80/20 (classe A · {qtdClasseA})
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
            <input type="checkbox" checked={soClasseA} onChange={(e) => setSoClasseA(e.target.checked)} />
            Só classe A
          </label>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Filtrar por código ou descrição"
            className={`${inputCls} pl-8 text-xs`}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
          <span>
            {visiveis.length} candidato(s){visiveis.length > LIMITE_LISTA && ` — mostrando os ${LIMITE_LISTA} primeiros da curva`}
          </span>
          <span className="flex gap-3">
            <button type="button" onClick={() => marcarVarios(visiveis.slice(0, LIMITE_LISTA), true)} className="hover:underline" style={{ color: 'var(--brand)' }}>
              Marcar visíveis
            </button>
            <button type="button" onClick={() => setMarcados(new Map())} className="hover:underline">Limpar seleção</button>
          </span>
        </div>

        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
          {visiveis.length === 0 ? (
            <p className="py-8 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhum item nesse filtro.</p>
          ) : visiveis.slice(0, LIMITE_LISTA).map((c) => {
            const marcado = marcados.has(c.chave);
            return (
              <label
                key={c.chave}
                className="flex cursor-pointer items-center gap-3 px-3 py-2"
                style={{ borderColor: 'var(--hairline)', background: marcado ? 'color-mix(in srgb, var(--brand) 7%, transparent)' : undefined }}
              >
                <input type="checkbox" checked={marcado} onChange={() => alternar(c)} className="shrink-0" />
                <span className="w-7 shrink-0 text-center text-[11px] font-extrabold" style={{ color: COR_CLASSE[c.classe] }}>{c.classe}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{c.descricao || '—'}</span>
                  <span className="block text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>
                    {c.material} · {formatDeposito(c.deposito)} · {c.unidade}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: 'var(--ink-muted)' }}>#{c.posicao}</span>
              </label>
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>{marcados.size} item(ns) selecionado(s)</span>
        <button onClick={onClose} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
        <button onClick={() => void salvar()} disabled={salvando || marcados.size === 0} className={btnPri} style={{ background: 'var(--brand)' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
          {inventario ? 'Acrescentar itens' : 'Abrir inventário'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Inventário aberto: lista de itens e contagem
// ===========================================================================

type FiltroItens = 'todos' | 'abertos' | StatusItemInventario;
const ROTULO_FILTRO: Record<FiltroItens, string> = {
  todos: 'Todos',
  abertos: 'Em aberto',
  pendente: 'A contar',
  aguardando_decisao: 'Aguardando decisão',
  conferido: 'Conferidos',
  divergente: 'Divergentes',
};

function VistaInventario({
  user, inv, onVoltar, onRecarregar, onAdicionar, onExcluido,
}: {
  user: Profile;
  inv: InventarioRow;
  onVoltar: () => void;
  onRecarregar: () => Promise<void>;
  onAdicionar: () => void;
  onExcluido: () => Promise<void>;
}) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroItens>('abertos');
  const [busca, setBusca] = useState('');
  const [contandoId, setContandoId] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'xlsx' | 'pdf' | null>(null);
  const r = resumirInventario(inv.itens);
  const dono = podeEditarFormulario(user, inv);
  const algumContado = inv.itens.some((i) => i.contagens.length > 0);

  const contagemFiltro = useMemo(() => {
    const c: Record<FiltroItens, number> = { todos: r.total, abertos: r.pendentes + r.aguardando, pendente: r.pendentes, aguardando_decisao: r.aguardando, conferido: r.conferidos, divergente: r.divergentes };
    return c;
  }, [r]);

  const itens = useMemo(() => {
    const t = semAcento(busca.trim());
    return inv.itens.filter((i) => {
      if (filtro === 'abertos' && itemEncerrado(i)) return false;
      if (filtro !== 'todos' && filtro !== 'abertos' && i.status !== filtro) return false;
      return !t || semAcento(`${i.material} ${i.descricao}`).includes(t);
    });
  }, [inv.itens, filtro, busca]);

  const contando = inv.itens.find((i) => i.id === contandoId) ?? null;
  // Depois de encerrar um item, "Próximo" leva ao seguinte em aberto na ordem da ficha.
  const proximoAberto = (depoisDe: string) => {
    const lista = inv.itens;
    const idx = lista.findIndex((i) => i.id === depoisDe);
    return [...lista.slice(idx + 1), ...lista.slice(0, idx)].find((i) => !itemEncerrado(i) && i.id !== depoisDe) ?? null;
  };

  const exportar = async (tipo: 'xlsx' | 'pdf') => {
    setExportando(tipo);
    try {
      if (tipo === 'xlsx') exportarPlanilhaInventario(inv);
      else await exportInventarioCiclicoPdf(inv);
      if (r.pendentes + r.aguardando > 0) {
        toast.warning('Exportado com itens em aberto — o saldo da ZL0024 só sai para item encerrado.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao exportar.');
    } finally {
      setExportando(null);
    }
  };

  const remover = async (item: ItemInventario) => {
    if (!window.confirm(`Tirar ${item.material} (${item.descricao}) da lista?`)) return;
    try { await removerItemInventario(item.id); await onRecarregar(); }
    catch (err: any) { toast.error(err?.message || 'Falha ao remover.'); }
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir o inventário ${inv.codigo}? Sai da tela, mas permanece no banco.`)) return;
    try { await excluirInventario(inv.id, user.name); toast.success(`${inv.codigo} excluído.`); await onExcluido(); }
    catch (err: any) { toast.error(err?.message || 'Falha ao excluir.'); }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onVoltar}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Inventários
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>{inv.codigo}</h1>
            {inv.status === 'concluido'
              ? <Chip token="var(--status-good)"><Check className="h-3 w-3" /> Concluído</Chip>
              : <Chip token="var(--brand)">Em andamento</Chip>}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            {formatDateBR(inv.data)} · responsável {inv.criado_por_nome || '—'}
            {inv.conferente_nome && <> · conferente {inv.conferente_nome}</>}
            {inv.criterio && <> · {inv.criterio}</>}
          </p>
          {inv.observacao && <p className="text-xs mt-0.5" style={{ color: 'var(--ink-secondary)' }}>{inv.observacao}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void exportar('xlsx')} disabled={!!exportando} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            {exportando === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Planilha
          </button>
          <button onClick={() => void exportar('pdf')} disabled={!!exportando} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            {exportando === 'pdf' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} PDF
          </button>
          {dono && inv.status === 'aberto' && (
            <button onClick={onAdicionar} className={btnSec} style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              <Plus className="h-3.5 w-3.5" /> Itens
            </button>
          )}
          {dono && !algumContado && (
            <button onClick={() => void excluir()} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--status-critical)' }}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Indicador rotulo="A contar" valor={r.pendentes} />
        <Indicador rotulo="Aguardando decisão" valor={r.aguardando} destaque={r.aguardando > 0} />
        <Indicador rotulo="Divergentes" valor={r.divergentes} critico={r.divergentes > 0} />
        <Indicador rotulo="Acuracidade" valor={r.acuracidade == null ? '—' : `${r.acuracidade.toFixed(0)}%`} />
      </div>
      <BarraProgresso inv={inv} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 overflow-x-auto no-scrollbar rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }}>
          {(Object.keys(ROTULO_FILTRO) as FiltroItens[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold"
              style={filtro === f ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
            >
              {ROTULO_FILTRO[f]} ({contagemFiltro[f]})
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Material ou descrição" className={`${inputCls} pl-8 text-xs`} />
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {filtro === 'abertos' && r.total > 0 ? 'Todos os itens foram encerrados.' : 'Nenhum item nesse filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item) => (
            <LinhaItem
              key={item.id}
              item={item}
              numero={inv.itens.indexOf(item) + 1}
              podeRemover={dono && item.contagens.length === 0}
              onAbrir={() => setContandoId(item.id)}
              onRemover={() => void remover(item)}
            />
          ))}
        </div>
      )}

      {contando && (
        <ModalContagem
          key={contando.id}
          user={user}
          item={contando}
          numero={inv.itens.indexOf(contando) + 1}
          onRecarregar={onRecarregar}
          onProximo={() => setContandoId(proximoAberto(contando.id)?.id ?? null)}
          temProximo={proximoAberto(contando.id) != null}
          onClose={() => setContandoId(null)}
        />
      )}
    </div>
  );
}

function LinhaItem({
  item, numero, podeRemover, onAbrir, onRemover,
}: { item: ItemInventario; numero: number; podeRemover: boolean; onAbrir: () => void; onRemover: () => void }) {
  const encerrado = itemEncerrado(item);
  const token = TOKEN_STATUS[item.status];
  return (
    <div
      className="flex items-stretch gap-2 rounded-xl border"
      style={{ borderColor: item.status === 'pendente' ? 'var(--hairline)' : `color-mix(in srgb, ${token} 45%, var(--hairline))`, background: 'var(--surface-raised)' }}
    >
      <button type="button" onClick={onAbrir} className="min-w-0 flex-1 px-3 py-2.5 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold tabular-nums" style={{ color: 'var(--ink-muted)' }}>{numero}.</span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{item.descricao || '—'}</span>
          <ChipStatusItem status={item.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono">{item.material}</span>
          <span>{formatDeposito(item.deposito)}</span>
          {item.classe && <span>Classe {item.classe}</span>}
          {item.contagens.map((c) => (
            <span key={c.id} className="font-semibold" style={{ color: c.divergente ? 'var(--status-critical)' : 'var(--status-good)' }}>
              {c.numero}ª: {formatQtd(c.quantidade)} {item.unidade}
            </span>
          ))}
          {encerrado && item.saldo_sistema != null && (
            <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>
              ZL0024: {formatQtd(item.saldo_sistema)}
              {item.diferenca ? ` (${item.diferenca > 0 ? '+' : ''}${formatQtd(item.diferenca)})` : ''}
            </span>
          )}
        </div>
      </button>
      {podeRemover && (
        <button type="button" onClick={onRemover} title="Tirar da lista" className="shrink-0 px-3" style={{ color: 'var(--ink-muted)' }}>
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de contagem
// ---------------------------------------------------------------------------

type Fase = 'contar' | 'decidir' | 'final';

function faseInicial(item: ItemInventario): Fase {
  if (itemEncerrado(item)) return 'final';
  if (item.status === 'aguardando_decisao') return 'decidir';
  return 'contar';
}

function ModalContagem({
  user, item, numero, onRecarregar, onProximo, temProximo, onClose,
}: {
  user: Profile;
  item: ItemInventario;
  numero: number;
  onRecarregar: () => Promise<void>;
  onProximo: () => void;
  temProximo: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [fase, setFase] = useState<Fase>(() => faseInicial(item));
  const [qtd, setQtd] = useState('');
  const [endereco, setEndereco] = useState('');
  const [validade, setValidade] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<ResultadoContagem | null>(null);
  const qtdRef = useRef<HTMLInputElement>(null);

  // A fase segue o item quando ele recarrega (ex.: outro aparelho encerrou).
  useEffect(() => {
    if (itemEncerrado(item)) setFase('final');
  }, [item]);

  useEffect(() => {
    if (fase === 'contar') qtdRef.current?.focus();
  }, [fase]);

  const proxima = proximaContagem(item);
  const qtdNum = qtd.trim() === '' ? NaN : Number(qtd.replace(',', '.'));
  const qtdValida = Number.isFinite(qtdNum) && qtdNum >= 0;

  const enviar = async () => {
    if (!qtdValida) { toast.error('Informe a quantidade contada (zero ou mais).'); return; }
    setEnviando(true);
    try {
      const r = await registrarContagem(item.id, {
        quantidade: qtdNum,
        endereco: endereco.trim() || null,
        validade: validade || null,
        observacao: obs.trim() || null,
        por: user.name,
      });
      setUltimo(r);
      setQtd(''); setObs('');
      await onRecarregar();
      if (!r.divergente) {
        toast.success(`${r.numero}ª contagem confere com a ZL0024.`);
        setFase('final');
      } else if (r.pode_recontar) {
        setFase('decidir');
      } else {
        toast.warning(`Divergente após ${r.numero} contagens — alerta gravado.`);
        setFase('final');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao enviar a contagem.');
      await onRecarregar();
    } finally {
      setEnviando(false);
    }
  };

  const encerrar = async () => {
    setEnviando(true);
    try {
      await encerrarItemInventario(item.id, user.name);
      toast.warning('Divergência registrada — alerta gravado.');
      await onRecarregar();
      setFase('final');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao encerrar o item.');
    } finally {
      setEnviando(false);
    }
  };

  const nContagens = item.contagens.length;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Contagem do item" disableOutsideClose={fase === 'contar' && qtd !== ''}>
      <ModalHeader onClose={onClose}>
        <p className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
          Item {numero} · <span className="font-mono">{item.material}</span> · {formatDeposito(item.deposito)}
        </p>
        <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>{item.descricao || '—'}</h2>
      </ModalHeader>
      <ModalBody className="space-y-4">
        {nContagens > 0 && (
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Contagens enviadas (não podem ser alteradas)</span>
            {item.contagens.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                style={{ borderColor: `color-mix(in srgb, ${c.divergente ? 'var(--status-critical)' : 'var(--status-good)'} 40%, var(--hairline))` }}
              >
                <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                  {c.numero}ª contagem: <span className="tabular-nums">{formatQtd(c.quantidade)}</span> {item.unidade}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                  {c.contado_por_nome || '—'} · {formatDateTimeBR(c.created_at)}
                </span>
                {(c.endereco_encontrado || c.validade || c.observacao) && (
                  <span className="basis-full text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    {[c.endereco_encontrado && `Endereço ${c.endereco_encontrado}`, c.validade && `Validade ${formatDateBR(c.validade)}`, c.observacao]
                      .filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {fase === 'contar' && proxima != null && (
          <div className="space-y-3">
            <Campo rotulo={`${proxima}ª contagem — quantidade encontrada (${item.unidade || 'UMB'})`} obrigatorio>
              <input
                ref={qtdRef}
                inputMode="decimal"
                value={qtd}
                onChange={(e) => setQtd(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter' && qtdValida && !enviando) void enviar(); }}
                placeholder="0"
                className={`${inputCls} text-lg font-extrabold tabular-nums`}
              />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Endereço encontrado">
                <input value={endereco} onChange={(e) => setEndereco(e.target.value.toUpperCase())} placeholder="Ex.: 101.ARAMES" className={inputCls} />
              </Campo>
              <Campo rotulo="Data de validade">
                <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className={inputCls} />
              </Campo>
            </div>
            <Campo rotulo="Observação">
              <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
            </Campo>
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Ao enviar, a contagem fica gravada e não pode ser alterada.
            </p>
          </div>
        )}

        {fase === 'decidir' && (
          <div
            className="space-y-2 rounded-xl border px-4 py-3"
            style={{ borderColor: 'var(--status-critical)', background: 'color-mix(in srgb, var(--status-critical) 8%, transparent)' }}
          >
            <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--status-critical)' }}>
              <AlertTriangle className="h-4 w-4" />
              {ultimo ? `${ultimo.numero}ª contagem divergente` : 'Contagem divergente'} do saldo do sistema
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
              Quer fazer mais uma contagem? A nova fica ao lado da anterior, sem substituí-la
              ({nContagens} de {MAX_CONTAGENS}). Se não, o saldo da ZL0024 é exibido, o alerta é gravado e o item
              não aceita mais contagem.
            </p>
          </div>
        )}

        {fase === 'final' && (
          <ResultadoFinal item={item} />
        )}
      </ModalBody>
      <ModalFooter>
        {fase === 'contar' && (
          <>
            <button onClick={onClose} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
            <button onClick={() => void enviar()} disabled={enviando || !qtdValida} className={btnPri} style={{ background: 'var(--brand)' }}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enviar contagem
            </button>
          </>
        )}
        {fase === 'decidir' && (
          <>
            <button onClick={() => void encerrar()} disabled={enviando} className={btnSec} style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Não, mostrar saldo
            </button>
            <button onClick={() => setFase('contar')} disabled={enviando || proxima == null} className={btnPri} style={{ background: 'var(--brand)' }}>
              <RotateCcw className="h-4 w-4" /> Sim, nova contagem
            </button>
          </>
        )}
        {fase === 'final' && (
          <>
            <button onClick={onClose} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Fechar</button>
            {temProximo && (
              <button onClick={onProximo} className={btnPri} style={{ background: 'var(--brand)' }}>Próximo item</button>
            )}
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

function ResultadoFinal({ item }: { item: ItemInventario }) {
  if (!itemEncerrado(item)) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Atualizando…
      </div>
    );
  }
  const ok = item.status === 'conferido';
  const token = ok ? 'var(--status-good)' : 'var(--status-critical)';
  return (
    <div className="space-y-2 rounded-xl border px-4 py-3" style={{ borderColor: token, background: `color-mix(in srgb, ${token} 8%, transparent)` }}>
      <p className="flex items-center gap-2 text-sm font-extrabold" style={{ color: token }}>
        {ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {ok ? 'Conferido — bate com a ZL0024' : 'Divergente — alerta gravado'}
      </p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <span className="block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Contado</span>
          <span className="block text-base font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{formatQtd(item.qtd_final)}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Saldo ZL0024</span>
          <span className="block text-base font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{formatQtd(item.saldo_sistema)}</span>
        </div>
        <div>
          <span className="block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Diferença</span>
          <span className="block text-base font-extrabold tabular-nums" style={{ color: token }}>
            {item.diferenca && item.diferenca > 0 ? '+' : ''}{formatQtd(item.diferenca)}
          </span>
        </div>
      </div>
      {item.alerta && <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{item.alerta}</p>}
    </div>
  );
}

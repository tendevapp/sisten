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
  AlertTriangle, ArrowLeft, Camera, Check, ClipboardList, CloudOff, Download, Eye, FileText,
  Image as ImageIcon, Loader2, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { localDb } from '../../db/localDb';
import { formatDeposito, ordenarDepositos } from '../../lib/almoxarifado';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { extrairPalavrasChave, casarTokens } from '../../lib/buscaKeywords';
import {
  FORM_CODIGO_INVENTARIO, MAX_CONTAGENS, ROTULO_CRITERIO, ROTULO_STATUS_ITEM, chaveItem, coberturaInventario, diasEntre,
  historicoPorItem, itemEncerrado, montarCandidatos, podeExcluirInventario, proximaContagem, resumirInventario, rotuloDias,
  type CandidatoInventario, type ClasseCurva, type CoberturaInventario, type CriterioCurva, type HistoricoItem,
  type ItemInventario, type StatusItemInventario,
} from '../../lib/inventarioCiclico';
import {
  adicionarItensInventario, criarInventario, encerrarItemInventario, excluirInventario, listarInventarios, registrarContagem,
  removerItemInventario, type InventarioRow, type ResultadoContagem,
} from '../../lib/inventarioCiclicoApi';
import { exportarPlanilhaInventario } from '../../lib/inventarioCiclicoPlanilha';
import { exportInventarioCiclicoPdf } from '../../lib/pdfExport/exportInventarioCiclicoPdf';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { ehRespostaOffline } from '../../lib/offline/configFormularios';
import { argumentosNaFila, assinarFilaOffline } from '../../lib/offline/filaSupabase';
import {
  buscarFotosCatalogoPorCodigosSap,
  salvarItemCatalogo,
  type CatalogoItem,
} from '../../lib/almoxCatalogoApi';
import { comprimirImagemUpload } from '../../lib/imageCompression';

/** Itens com contagem guardada no aparelho (sem rede) — ainda sem resultado do servidor. */
function useItensContadosNaFila(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let ativo = true;
    const ler = () => argumentosNaFila('alm_inv_registrar_contagem')
      .then(args => { if (ativo) setIds(new Set(args.map(a => String(a.p_item_id)))); })
      .catch(() => {});
    ler();
    const cancelar = assinarFilaOffline(ler);
    return () => { ativo = false; cancelar(); };
  }, []);
  return ids;
}
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
    const tokens = extrairPalavrasChave(busca);
    if (tokens.length === 0) return inventarios;
    return inventarios.filter((i) => {
      const alvos = [
        i.codigo,
        i.criado_por_nome,
        i.conferente_nome,
        ...i.itens.map((x) => `${x.material} ${x.descricao}`),
      ];
      return casarTokens(alvos, tokens);
    });
  }, [inventarios, busca]);

  const historico = useMemo(() => historicoPorItem(inventarios), [inventarios]);
  const cobertura = useMemo(() => coberturaInventario(estoque, historico), [estoque, historico]);

  const emAberto = inventarios.filter((i) => i.status === 'aberto').length;
  const comDivergencia = inventarios.filter((i) => i.itens.some((x) => x.status === 'divergente')).length;

  const confirmarExcluirInventario = async (inv: InventarioRow) => {
    const algumContado = inv.itens.some((i) => i.contagens.length > 0);
    const msg = algumContado
      ? `Excluir o inventário ${inv.codigo}? Ele possui contagens registradas. Esta exclusão só é permitida para administradores. O inventário sairá da listagem, mas continuará registrado no banco.`
      : `Excluir o inventário ${inv.codigo}? Sai da tela, mas permanece no banco.`;
    if (!window.confirm(msg)) return;
    try {
      await excluirInventario(inv.id, user.name);
      toast.success(`Inventário ${inv.codigo} excluído com sucesso.`);
      await recarregarInventarios();
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao excluir inventário.');
    }
  };

  const modalNovo = novo && (
    <ModalSelecaoItens
      user={user}
      estoque={estoque}
      giro={giro}
      historico={historico}
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

      <PainelCobertura cobertura={cobertura} carregando={loading && estoque.length === 0} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por palavras-chave (código, responsável, conferente ou material)..."
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
          {filtrados.map((inv) => (
            <CartaoInventario
              key={inv.id}
              inv={inv}
              podeExcluir={podeExcluirInventario(user, inv)}
              onAbrir={() => setAbertoId(inv.id)}
              onExcluir={() => void confirmarExcluirInventario(inv)}
            />
          ))}
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

/** Quanto do almoxarifado (material × depósito na ZL0024) já foi contado ao menos uma vez. */
function PainelCobertura({ cobertura, carregando, rotulo = 'Cobertura do almoxarifado' }: {
  cobertura: CoberturaInventario;
  carregando?: boolean;
  rotulo?: string;
}) {
  const faltam = cobertura.total - cobertura.inventariados;
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
        {carregando ? (
          <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando ZL0024…</span>
        ) : (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
            {cobertura.inventariados} de {cobertura.total} item(ns) inventariado(s) · faltam {faltam}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
          {cobertura.pct.toFixed(1).replace('.', ',')}%
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--ink-muted) 15%, transparent)' }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(cobertura.pct, 100)}%`, background: 'var(--brand)' }} />
        </div>
      </div>
      <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
        Item = material × depósito na posição atual da ZL0024; inventariado = contado ao menos uma vez.
      </p>
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

function CartaoInventario({
  inv,
  onAbrir,
  onExcluir,
  podeExcluir,
}: {
  inv: InventarioRow;
  onAbrir: () => void;
  onExcluir?: () => void;
  podeExcluir?: boolean;
}) {
  const r = resumirInventario(inv.itens);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="group relative block w-full rounded-xl border px-4 py-3 text-left transition-colors hover:border-[var(--brand)] cursor-pointer"
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{formatDateBR(inv.data)}</span>
          {podeExcluir && onExcluir && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExcluir();
              }}
              title="Excluir inventário"
              className="rounded-lg p-1.5 text-[var(--ink-muted)] hover:text-[var(--status-critical)] hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--ink-secondary)' }}>
        {r.total} item(ns) · {r.conferidos + r.divergentes} encerrado(s)
        {r.acuracidade != null && <> · acuracidade {r.acuracidade.toFixed(0)}%</>}
        {' · '}{inv.criado_por_nome || '—'}
        {inv.conferente_nome && <> · conferente {inv.conferente_nome}</>}
      </p>
      <div className="mt-2"><BarraProgresso inv={inv} /></div>
    </div>
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
  user, estoque, giro, historico, inventario, onClose, onSalvo,
}: {
  user: Profile;
  estoque: EstoqueItem[];
  giro: EstoqueGiro[];
  /** Último inventário de cada material × depósito. */
  historico: Map<string, HistoricoItem>;
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
  const [soDivergentes, setSoDivergentes] = useState(false);
  const hoje = hojeISO();
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
      if (soDivergentes && !historico.get(c.chave)?.jaDivergiu) return false;
      if (termos.length === 0) return true;
      const alvo = semAcento(`${c.material} ${c.descricao}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [candidatos, texto, soClasseA, soDivergentes, historico]);

  const qtdClasseA = candidatos.filter((c) => c.classe === 'A').length;
  const qtdDivergentesAnteriores = candidatos.filter((c) => historico.get(c.chave)?.jaDivergiu).length;
  const coberturaSelecao = useMemo(() => coberturaInventario(estoque, historico, depositos), [estoque, historico, depositos]);

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
          <button
            type="button"
            onClick={() => setSoDivergentes((v) => !v)}
            disabled={qtdDivergentesAnteriores === 0 && !soDivergentes}
            aria-pressed={soDivergentes}
            title="Itens que terminaram divergentes em inventário anterior"
            className={btnSec}
            style={soDivergentes
              ? { borderColor: 'var(--status-critical)', background: 'var(--status-critical)', color: 'white' }
              : { borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Divergências anteriores ({qtdDivergentesAnteriores})
          </button>
        </div>

        <PainelCobertura
          cobertura={coberturaSelecao}
          rotulo={depositos.length > 0 ? `Cobertura dos depósitos ${depositos.join(', ')}` : 'Cobertura do almoxarifado'}
        />

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
                  <ChipsHistorico h={historico.get(c.chave)} hoje={hoje} />
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

function ChipsHistorico({ h, hoje }: { h?: HistoricoItem; hoje: string }) {
  if (!h) {
    return <span className="mt-0.5 block text-[10px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Nunca inventariado</span>;
  }
  const dias = diasEntre(h.ultimaData, hoje);
  return (
    <span className="mt-0.5 flex flex-wrap gap-1">
      <Chip token="var(--brand)">
        Inventariado {rotuloDias(dias)} ({formatDateBR(h.ultimaData)}){h.vezes > 1 ? ` · ${h.vezes}x` : ''}
      </Chip>
      {h.jaDivergiu && <Chip token="var(--status-critical)"><AlertTriangle className="h-3 w-3" /> Já divergiu</Chip>}
    </span>
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
  const podeExcluir = podeExcluirInventario(user, inv);

  // Mapa de fotos do catálogo e Book de EPIs vinculadas aos materiais deste inventário
  const [mapaFotos, setMapaFotos] = useState<Map<string, CatalogoItem>>(new Map());
  const [imagemZoom, setImagemZoom] = useState<{ url: string; titulo: string; codigo: string } | null>(null);

  const codigosMateriais = useMemo(() => {
    return Array.from(new Set(inv.itens.map((i) => i.material))).filter(Boolean);
  }, [inv.itens]);

  useEffect(() => {
    let ativo = true;
    if (codigosMateriais.length === 0) return;
    buscarFotosCatalogoPorCodigosSap(codigosMateriais)
      .then((mapa) => {
        if (ativo) setMapaFotos(mapa);
      })
      .catch((err) => {
        console.warn('[InventarioCiclico] Falha ao carregar fotos do catálogo:', err);
      });
    return () => { ativo = false; };
  }, [codigosMateriais]);

  const handleFotoSalva = (codigoSap: string, itemCatalogo: CatalogoItem) => {
    setMapaFotos((prev) => {
      const novo = new Map(prev);
      novo.set(codigoSap, itemCatalogo);
      return novo;
    });
  };

  const contagemFiltro = useMemo(() => {
    const c: Record<FiltroItens, number> = { todos: r.total, abertos: r.pendentes + r.aguardando, pendente: r.pendentes, aguardando_decisao: r.aguardando, conferido: r.conferidos, divergente: r.divergentes };
    return c;
  }, [r]);

  const itens = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    return inv.itens.filter((i) => {
      if (filtro === 'abertos' && itemEncerrado(i)) return false;
      if (filtro !== 'todos' && filtro !== 'abertos' && i.status !== filtro) return false;
      if (tokens.length > 0 && !casarTokens([i.material, i.descricao], tokens)) return false;
      return true;
    });
  }, [inv.itens, filtro, busca]);

  const contando = inv.itens.find((i) => i.id === contandoId) ?? null;
  const naFila = useItensContadosNaFila();
  // Depois de encerrar um item, "Próximo" leva ao seguinte em aberto na ordem da ficha
  // (pulando os que já têm contagem guardada no aparelho).
  const proximoAberto = (depoisDe: string) => {
    const lista = inv.itens;
    const idx = lista.findIndex((i) => i.id === depoisDe);
    return [...lista.slice(idx + 1), ...lista.slice(0, idx)].find((i) => !itemEncerrado(i) && i.id !== depoisDe && !naFila.has(i.id)) ?? null;
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
    const msg = algumContado
      ? `Excluir o inventário ${inv.codigo}? Ele possui contagens registradas. Esta exclusão só é permitida para administradores. O inventário sairá da tela, mas continuará registrado no histórico do banco.`
      : `Excluir o inventário ${inv.codigo}? Sai da tela, mas permanece no banco.`;
    if (!window.confirm(msg)) return;
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
          {podeExcluir && (
            <button
              onClick={() => void excluir()}
              className={btnSec}
              style={{ borderColor: 'var(--hairline)', color: 'var(--status-critical)' }}
              title={algumContado ? 'Excluir inventário (permissão de administrador)' : 'Excluir inventário'}
            >
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
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item por palavras-chave (material ou descrição)..." className={`${inputCls} pl-8 text-xs`} />
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
              fotoItem={mapaFotos.get(item.material)}
              podeRemover={dono && item.contagens.length === 0 && !naFila.has(item.id)}
              contadoNaFila={naFila.has(item.id)}
              onAbrir={() => {
                if (naFila.has(item.id)) { toast.info('Este item já tem contagem guardada neste aparelho. O resultado aparece quando sincronizar.'); return; }
                setContandoId(item.id);
              }}
              onVerZoom={(url, titulo, codigo) => setImagemZoom({ url, titulo, codigo })}
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
          fotoItem={mapaFotos.get(contando.material)}
          onFotoSalva={(salvo) => handleFotoSalva(contando.material, salvo)}
          onVerZoom={(url, titulo, codigo) => setImagemZoom({ url, titulo, codigo })}
          onRecarregar={onRecarregar}
          onProximo={() => setContandoId(proximoAberto(contando.id)?.id ?? null)}
          temProximo={proximoAberto(contando.id) != null}
          onClose={() => setContandoId(null)}
        />
      )}

      {/* Modal: Zoom da foto do material */}
      {imagemZoom && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setImagemZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-slate-950 flex items-center justify-between border-b border-slate-800">
              <div>
                <span className="font-mono text-xs text-amber-400 font-bold mr-2">
                  SAP {imagemZoom.codigo}
                </span>
                <span className="text-sm font-semibold text-white">
                  {imagemZoom.titulo}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setImagemZoom(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center bg-black/50 overflow-auto max-h-[75vh]">
              <img
                src={imagemZoom.url}
                alt={imagemZoom.titulo}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaItem({
  item, numero, fotoItem, podeRemover, contadoNaFila, onAbrir, onVerZoom, onRemover,
}: {
  item: ItemInventario;
  numero: number;
  fotoItem?: CatalogoItem;
  podeRemover: boolean;
  contadoNaFila?: boolean;
  onAbrir: () => void;
  onVerZoom?: (url: string, titulo: string, codigo: string) => void;
  onRemover: () => void;
}) {
  const encerrado = itemEncerrado(item);
  const token = TOKEN_STATUS[item.status];
  return (
    <div
      className="flex items-stretch gap-2 rounded-xl border transition-all hover:border-slate-400 dark:hover:border-slate-600"
      style={{ borderColor: item.status === 'pendente' ? 'var(--hairline)' : `color-mix(in srgb, ${token} 45%, var(--hairline))`, background: 'var(--surface-raised)' }}
    >
      <div className="flex items-center pl-3 py-2 shrink-0">
        {fotoItem?.url_imagem ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onVerZoom?.(fotoItem.url_imagem!, item.descricao, item.material);
            }}
            className="relative group h-12 w-12 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-2xs hover:scale-105 transition"
            title="Ver foto do material cadastrada no catálogo"
          >
            <img src={fotoItem.url_imagem} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
              <Eye className="h-3.5 w-3.5" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onAbrir}
            className="h-12 w-12 rounded-lg border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition cursor-pointer"
            title="Sem foto no catálogo — clique para abrir contagem e cadastrar foto"
          >
            <Camera className="h-4 w-4" />
            <span className="text-[8px] font-bold mt-0.5 leading-none">+foto</span>
          </button>
        )}
      </div>

      <button type="button" onClick={onAbrir} className="min-w-0 flex-1 px-2.5 py-2.5 text-left cursor-pointer">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-extrabold tabular-nums" style={{ color: 'var(--ink-muted)' }}>{numero}.</span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{item.descricao || '—'}</span>
          {fotoItem?.url_imagem && (
            fotoItem.codigo_registro?.startsWith('EPI-') ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <ShieldCheck className="h-2.5 w-2.5" /> EPI
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Check className="h-2.5 w-2.5" /> Foto
              </span>
            )
          )}
          {contadoNaFila
            ? <Chip token="var(--status-serious)"><CloudOff className="h-3 w-3" /> Contagem no aparelho</Chip>
            : <ChipStatusItem status={item.status} />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono font-semibold">{item.material}</span>
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
        <button type="button" onClick={onRemover} title="Tirar da lista" className="shrink-0 px-3 cursor-pointer hover:text-rose-600 transition" style={{ color: 'var(--ink-muted)' }}>
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
  user, item, numero, fotoItem, onFotoSalva, onVerZoom, onRecarregar, onProximo, temProximo, onClose,
}: {
  user: Profile;
  item: ItemInventario;
  numero: number;
  fotoItem?: CatalogoItem;
  onFotoSalva?: (itemCatalogo: CatalogoItem) => void;
  onVerZoom?: (url: string, titulo: string, codigo: string) => void;
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
  const [fotoAtual, setFotoAtual] = useState<CatalogoItem | null>(fotoItem ?? null);
  const [modalFotoAberto, setModalFotoAberto] = useState(false);
  const qtdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFotoAtual(fotoItem ?? null);
  }, [fotoItem]);

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
      if (ehRespostaOffline(r)) {
        // Sem rede a contagem fica na fila do aparelho; quem compara com a
        // ZL0024 (e pede recontagem) é o servidor, no envio.
        toast.info('Sem conexão: contagem guardada neste aparelho. A comparação com a ZL0024 acontece quando sincronizar.');
        setQtd(''); setObs('');
        if (temProximo) onProximo(); else onClose();
        return;
      }
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
        {/* Card de Foto de Cadastro do Material */}
        <div
          className="rounded-xl border p-3 flex flex-col sm:flex-row items-center gap-3 transition-all"
          style={{
            borderColor: fotoAtual?.url_imagem
              ? 'color-mix(in srgb, var(--brand) 30%, var(--hairline))'
              : 'color-mix(in srgb, var(--status-serious) 40%, var(--hairline))',
            background: 'var(--surface-raised)',
          }}
        >
          {fotoAtual?.url_imagem ? (
            <div className="relative group shrink-0">
              <img
                src={fotoAtual.url_imagem}
                alt={item.descricao}
                className="h-20 w-20 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shadow-xs cursor-pointer hover:opacity-90 transition"
                onClick={() => onVerZoom?.(fotoAtual.url_imagem!, item.descricao, item.material)}
              />
              <button
                type="button"
                onClick={() => onVerZoom?.(fotoAtual.url_imagem!, item.descricao, item.material)}
                className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-[10px] font-bold gap-1 cursor-pointer"
                title="Ampliar foto"
              >
                <Eye className="h-3.5 w-3.5" /> Ampliar
              </button>
            </div>
          ) : (
            <div className="h-20 w-20 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
              <Camera className="h-6 w-6 stroke-1 mb-0.5" />
              <span className="text-[9px] font-bold text-center leading-tight">Sem foto</span>
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1 text-center sm:text-left w-full">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <span className="font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                SAP {item.material}
              </span>
              {fotoAtual?.url_imagem ? (
                fotoAtual.codigo_registro?.startsWith('EPI-') ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <ShieldCheck className="h-3 w-3" /> Book EPI {fotoAtual.observacao || ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Check className="h-3 w-3" /> Foto no Catálogo
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  Pendente de Foto
                </span>
              )}
            </div>

            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              {fotoAtual?.url_imagem
                ? 'Foto vinculada ao cadastro deste item no catálogo.'
                : 'Aproveite o momento da contagem física para tirar a foto de cadastro deste item!'}
            </p>

            <div className="pt-1 flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <button
                type="button"
                onClick={() => setModalFotoAberto(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-white shadow-xs"
                style={{ background: fotoAtual?.url_imagem ? 'var(--ink-secondary)' : 'var(--brand)' }}
              >
                <Camera className="h-3.5 w-3.5" />
                {fotoAtual?.url_imagem ? 'Alterar / Tirar Nova Foto' : 'Tirar Foto de Cadastro'}
              </button>

              {fotoAtual?.url_imagem && (
                <button
                  type="button"
                  onClick={() => onVerZoom?.(fotoAtual.url_imagem!, item.descricao, item.material)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver ampliada
                </button>
              )}
            </div>
          </div>
        </div>

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

      {modalFotoAberto && (
        <ModalCapturaFotoInventario
          user={user}
          item={item}
          fotoExistenteUrl={fotoAtual?.url_imagem}
          onSalvo={(salvo) => {
            setFotoAtual(salvo);
            onFotoSalva?.(salvo);
          }}
          onClose={() => setModalFotoAberto(false)}
        />
      )}
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

// ---------------------------------------------------------------------------
// Modal: Capturar / Cadastrar Foto do Material durante a contagem
// ---------------------------------------------------------------------------

function ModalCapturaFotoInventario({
  user,
  item,
  fotoExistenteUrl,
  onSalvo,
  onClose,
}: {
  user: Profile;
  item: ItemInventario;
  fotoExistenteUrl?: string | null;
  onSalvo: (itemCatalogo: CatalogoItem) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(fotoExistenteUrl ?? null);
  const [salvando, setSalvando] = useState(false);
  const [obs, setObs] = useState('Foto registrada durante inventário cíclico');

  const handleSelecionarArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setArquivo(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const itemClp = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!itemClp) return;
    const f = itemClp.getAsFile();
    if (!f) return;
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setArquivo(f);
    setPreviewUrl(URL.createObjectURL(f));
    toast.success('Imagem colada da área de transferência.');
  };

  const salvarFoto = async () => {
    if (!arquivo && !fotoExistenteUrl) {
      toast.warning('Tire uma foto ou selecione uma imagem do material.');
      return;
    }

    setSalvando(true);
    try {
      // Busca dados cadastrais adicionais no estoque local para enriquecer o catálogo
      const itemEstoque = localDb.getEstoque()?.find((e) => e.material === item.material);

      const salvo = await salvarItemCatalogo({
        codigo_sap: item.material,
        descricao: item.descricao,
        texto_tecnico: itemEstoque?.texto_pedido_compra || null,
        grp_mercad: itemEstoque?.grp_mercad || null,
        grupo_mercadorias: itemEstoque?.grupo_mercadorias || null,
        umb: item.unidade || itemEstoque?.umb || 'UN',
        fotoArquivo: arquivo,
        observacao: obs.trim() || undefined,
      }, user);

      onSalvo(salvo);
      toast.success(`Foto do material ${item.material} cadastrada no catálogo com sucesso!`);
      onClose();
    } catch (err: any) {
      console.error('[ModalCapturaFotoInventario] Erro ao salvar foto:', err);
      toast.error(err?.message || 'Falha ao salvar foto do item no catálogo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="Cadastrar foto do material">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-amber-600" />
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>
            Foto de Cadastro do Material
          </h2>
        </div>
        <p className="text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>
          SAP {item.material} · {item.descricao}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div onPaste={handlePaste} className="space-y-4">
          <div className="space-y-2">
            {previewUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex items-center justify-center h-56">
                <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
                    setArquivo(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                  title="Trocar foto"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center space-y-2">
                <Camera className="h-10 w-10 mx-auto text-slate-400" />
                <p className="text-xs text-slate-500">
                  Tire a foto diretamente com a câmera do celular/tablet ou anexe um arquivo. Suporta colar imagem (Ctrl+V).
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer shadow-xs">
                    <Camera className="h-3.5 w-3.5" />
                    Abrir Câmera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleSelecionarArquivo}
                      className="hidden"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                    <Upload className="h-3.5 w-3.5" />
                    Escolher Arquivo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSelecionarArquivo}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <Campo rotulo="Observação do Cadastro">
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Foto registrada durante inventário cíclico"
              className={inputCls}
            />
          </Campo>
          <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            A foto é comprimida automaticamente e fica vinculada ao catálogo do almoxarifado, aparecendo nas requisições e compras.
          </p>
        </div>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={salvando}
          className={btnSec}
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void salvarFoto()}
          disabled={salvando || (!arquivo && !fotoExistenteUrl)}
          className={btnPri}
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Comprimindo & Salvando…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Salvar Foto no Catálogo
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

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

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, BarChart3, Camera, Check, ChevronRight, ClipboardList, CloudOff, Download, Eye, FileText,
  Image as ImageIcon, ListOrdered, Loader2, Map as IconeMapa, MapPin, Plus, RefreshCw, RotateCcw, Route, Search, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useLightbox } from '../../components/ui/Lightbox';
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
import { baixaPendenteDoItem, codigosDoRetrato } from '../../lib/inventarioBaixaPendente';
import {
  adicionarItensInventario, buscarInventario, criarInventario, encerrarItemInventario, excluirInventario, listarInventarios, registrarContagem,
  removerItemInventario, type InventarioRow, type ResultadoContagem,
} from '../../lib/inventarioCiclicoApi';
import { exportarPlanilhaInventario } from '../../lib/inventarioCiclicoPlanilha';
import PdfPreviewModal from '../../components/ui/PdfPreviewModal';
import type { PdfGerado } from '../../lib/pdfExport/core';
import { exportInventarioCiclicoPdf, gerarInventarioCiclicoPdf } from '../../lib/pdfExport/exportInventarioCiclicoPdf';
import { hojeISO } from '../../lib/recebimentoAlmox';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { canAccessPage } from '../../lib/pages';
import { ehRespostaOffline } from '../../lib/offline/configFormularios';
import { argumentosNaFila, assinarFilaOffline } from '../../lib/offline/filaSupabase';
import {
  buscarFotosCatalogoPorCodigosSap,
  salvarItemCatalogo,
  type CatalogoItem,
} from '../../lib/almoxCatalogoApi';
import { comprimirImagemUpload } from '../../lib/imageCompression';
import { EVENTO_ITEM_QR_INVENTARIO, consumirItemInventarioPendente } from '../../lib/etiquetaMaterial';
import ImportarInventarioModal from '../../components/almoxarifado/ImportarInventarioModal';
import DivergenciasInventarioModal from '../../components/almoxarifado/DivergenciasInventarioModal';
import { OPCOES_FILTRO_DATA, intervaloDoFiltro, type FiltroDataAlteracao } from '../../lib/filtroDataAlteracao';
import { agruparPorData, dataNoIntervalo } from '../../lib/inventarioPorData';
import { diaLocal } from '../../lib/sessaoDiaria';
import { CAUSAS_INVENTARIO, rotuloCausa, sugerirEscopoRapido, type CausaInventario, type PendenciaContagem } from '../../lib/inventarioAuditoria';
import { contextoAuditoriaInventario, type PendenciaSapContagem } from '../../lib/inventarioCiclicoApi';
import { useReservasInventario } from '../../lib/useReservasInventario';
import { gravarPreferenciasInventario, lerPreferenciasInventario, prepararContagemDoMaterial } from '../../lib/inventarioAtalho';
import { confirmar } from '../../lib/confirmar';
import { chavePosicao, grupoDoRoteiro, indexarPosicoes, ordenarPorRoteiro } from '../../lib/inventarioRoteiro';
import { separarPosicoes } from '../../lib/gembaEndereco';
import { descreverPosicao } from '../../lib/gembaLayout';

// Gemba 2D numa janela por cima da lista/contagem — só baixa quando alguém abre o mapa.
const GembaLocalizacaoModal = lazy(() => import('../../components/almoxarifado/gemba/GembaLocalizacaoModal'));

/** Itens com contagem guardada no aparelho (sem rede) — ainda sem resultado do servidor. */
function useItensContadosNaFila(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let ativo = true;
    // A auditada é a atual; a antiga fica para contagens guardadas antes da troca.
    const ler = () => Promise.all([argumentosNaFila('alm_inv_registrar_contagem_auditada'), argumentosNaFila('alm_inv_registrar_contagem')])
      .then(([novas, antigas]) => { if (ativo) setIds(new Set([...novas, ...antigas].map(a => String(a.p_item_id)))); })
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

// ===========================================================================
// Tela
// ===========================================================================

function idInventarioDaRota(): string | null {
  const hash = window.location.hash || '';
  const i = hash.indexOf('?');
  const doHash = i === -1 ? null : new URLSearchParams(hash.slice(i + 1)).get('id');
  return doHash || new URLSearchParams(window.location.search).get('id');
}

export default function InventarioCiclico({ user, onNavigate }: Props) {
  const toast = useToast();
  const [inventarios, setInventarios] = useState<InventarioRow[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [giro, setGiro] = useState<EstoqueGiro[]>([]);
  const [loading, setLoading] = useState(true);
  // Link da notificação: `#/formularios/almoxarifado-inventario?id=…` — o id vem
  // depois do `#` (antes lia só `location.search` e o inventário nunca abria).
  const [abertoId, setAbertoId] = useState<string | null>(() => idInventarioDaRota());
  const [novo, setNovo] = useState<{ inventario?: InventarioRow } | null>(null);
  const [busca, setBusca] = useState('');
  const [importando, setImportando] = useState(false);
  const [filtroData, setFiltroData] = useState<FiltroDataAlteracao>('todas');
  const [periodoData, setPeriodoData] = useState({ de: '', ate: '' });
  // Janela de divergências: de todos os inventários (null) ou de um só.
  const [divergencias, setDivergencias] = useState<{ inventarioId: string | null } | null>(null);
  const podeImportar = user.roles?.includes('admin') || user.page_access?.almox_importar_planilhas === true;
  // Item lido no QR do cabeçalho e a contagem que a vista do inventário deve abrir.
  const [itemQr, setItemQr] = useState<{ codigo: string; n: number } | null>(null);
  const [abrirContagem, setAbrirContagem] = useState<{ itemId: string; n: number } | null>(null);
  /** Posição de estoque (ZL0024) por material × depósito: localização e roteiro da contagem. */
  const posicoesZl = useMemo(() => indexarPosicoes(estoque), [estoque]);

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

  // QR do cabeçalho: consome o item pendente ao abrir e acorda com a tela já aberta.
  useEffect(() => {
    const ler = () => {
      const codigo = consumirItemInventarioPendente();
      if (codigo) setItemQr((atual) => ({ codigo, n: (atual?.n ?? 0) + 1 }));
    };
    ler();
    window.addEventListener(EVENTO_ITEM_QR_INVENTARIO, ler);
    return () => window.removeEventListener(EVENTO_ITEM_QR_INVENTARIO, ler);
  }, []);

  const qrAplicado = useRef(0);
  const abrirContagemDoQr = useCallback(async (codigo: string) => {
    try {
      const r = await prepararContagemDoMaterial(codigo, user, estoque, giro);
      if (r.tipo === 'cancelado') return;
      if (r.tipo === 'fora_zl0024') {
        toast.error(`Item ${codigo} não está na ZL0024 — não há saldo para inventariar.`);
        return;
      }
      setInventarios(r.inventarios);
      if (r.tipo === 'offline') {
        toast.info('Contagem guardada sem rede. Ela aparece aqui quando sincronizar.');
        return;
      }
      if (r.tipo === 'de_outro') {
        toast.warning(`Item já selecionado no inventário ${r.inventario.codigo}, de ${r.inventario.criado_por_nome || 'outro responsável'}.`);
        return;
      }
      setAbertoId(r.inventario.id);
      setAbrirContagem((atual) => ({ itemId: r.item.id, n: (atual?.n ?? 0) + 1 }));
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível abrir a contagem do item lido.');
    }
  }, [estoque, giro, toast, user]);

  // Com a tela carregada, abre a contagem do item lido (uma vez por leitura).
  useEffect(() => {
    if (!itemQr || itemQr.n <= qrAplicado.current || loading) return;
    qrAplicado.current = itemQr.n;
    void abrirContagemDoQr(itemQr.codigo);
  }, [itemQr, loading, abrirContagemDoQr]);

  const aberto = inventarios.find((i) => i.id === abertoId) ?? null;

  // Aberto por link mas fora da lista carregada (mais antigo que a janela):
  // busca pelo id uma vez e põe na lista.
  const buscadoPorId = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !abertoId || aberto || buscadoPorId.current === abertoId) return;
    buscadoPorId.current = abertoId;
    const id = abertoId;
    buscarInventario(id)
      .then((inv) => {
        if (!inv) { toast.error('Inventário não encontrado.'); setAbertoId(null); return; }
        setInventarios((lista) => (lista.some((i) => i.id === inv.id) ? lista : [inv, ...lista]));
      })
      .catch((err) => toast.error(`Não foi possível abrir o inventário: ${err instanceof Error ? err.message : String(err)}`));
  }, [loading, abertoId, aberto, toast]);

  const filtrados = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    const intervalo = intervaloDoFiltro(filtroData, periodoData);
    return inventarios.filter((i) => {
      if (!dataNoIntervalo(i.data, intervalo)) return false;
      if (tokens.length === 0) return true;
      const alvos = [
        i.codigo,
        i.criado_por_nome,
        i.conferente_nome,
        ...i.itens.map((x) => `${x.material} ${x.descricao}`),
      ];
      return casarTokens(alvos, tokens);
    });
  }, [inventarios, busca, filtroData, periodoData]);

  // Separação por dia do inventário (a lista já vem do mais recente).
  const gruposPorData = useMemo(() => {
    const agora = new Date();
    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    return agruparPorData(filtrados, diaLocal(agora), diaLocal(ontem));
  }, [filtrados]);

  const historico = useMemo(() => historicoPorItem(inventarios), [inventarios]);
  const cobertura = useMemo(() => coberturaInventario(estoque, historico), [estoque, historico]);

  const emAberto = inventarios.filter((i) => i.status === 'aberto').length;
  const comDivergencia = inventarios.filter((i) => i.itens.some((x) => x.status === 'divergente')).length;

  const confirmarExcluirInventario = async (inv: InventarioRow) => {
    const algumContado = inv.itens.some((i) => i.contagens.length > 0);
    const msg = algumContado
      ? `Excluir o inventário ${inv.codigo}? Ele possui contagens registradas. Esta exclusão só é permitida para administradores. O inventário sairá da listagem, mas continuará registrado no banco.`
      : `Excluir o inventário ${inv.codigo}? Sai da tela, mas permanece no banco.`;
    if (!await confirmar({ titulo: 'Excluir inventário?', mensagem: msg, confirmarLabel: 'Excluir', variante: 'perigo' })) return;
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
          posicoes={posicoesZl}
          onNavigate={onNavigate}
          abrirContagem={abrirContagem}
          onVoltar={() => { setAbertoId(null); setAbrirContagem(null); }}
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
        <div className="flex flex-wrap items-center gap-2">
          {podeImportar && <button onClick={() => setImportando(true)} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}><Upload className="h-3.5 w-3.5" /> Importar planilha</button>}
          {canAccessPage(user, 'almox_inventario_analise') && (
            <button onClick={() => onNavigate('/almoxarifado/inventario-analise')} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              <BarChart3 className="h-3.5 w-3.5" /> Inventário
            </button>
          )}
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
        <Indicador
          rotulo="Com divergência"
          valor={comDivergencia}
          critico={comDivergencia > 0}
          onClick={comDivergencia > 0 ? () => setDivergencias({ inventarioId: null }) : undefined}
          dica="Ver os itens divergentes e abrir recontagem"
        />
      </div>

      <PainelCobertura cobertura={cobertura} carregando={loading && estoque.length === 0} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por palavras-chave (código, responsável, conferente ou material)..."
            className={`${inputCls} pl-8 text-xs`}
          />
        </div>
        <select
          value={filtroData}
          onChange={(e) => setFiltroData(e.target.value as FiltroDataAlteracao)}
          aria-label="Filtrar pela data do inventário"
          className={`${inputCls} w-auto text-xs`}
        >
          {OPCOES_FILTRO_DATA.map((op) => (
            <option key={op.valor} value={op.valor}>{op.valor === 'todas' ? 'Todas as datas' : op.rotulo}</option>
          ))}
        </select>
        {filtroData === 'periodo' && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
            <label className="flex items-center gap-1">De
              <input type="date" value={periodoData.de} onChange={(e) => setPeriodoData((p) => ({ ...p, de: e.target.value }))} className={`${inputCls} w-auto py-1.5 text-xs`} />
            </label>
            <label className="flex items-center gap-1">Até
              <input type="date" value={periodoData.ate} onChange={(e) => setPeriodoData((p) => ({ ...p, ate: e.target.value }))} className={`${inputCls} w-auto py-1.5 text-xs`} />
            </label>
          </div>
        )}
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
        <div className="space-y-5">
          {gruposPorData.map((grupo) => (
            <section key={grupo.data} className="space-y-2" aria-label={grupo.rotulo}>
              <h2
                className="flex items-baseline justify-between gap-2 border-b pb-1 text-xs font-extrabold"
                style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
              >
                {grupo.rotulo}
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                  {grupo.itens.length} inventário(s)
                </span>
              </h2>
              {grupo.itens.map((inv) => (
                <CartaoInventario
                  key={inv.id}
                  inv={inv}
                  podeExcluir={podeExcluirInventario(user, inv)}
                  onAbrir={() => setAbertoId(inv.id)}
                  onExcluir={() => void confirmarExcluirInventario(inv)}
                  onVerDivergencias={() => setDivergencias({ inventarioId: inv.id })}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {modalNovo}
      {importando && <ImportarInventarioModal onClose={() => setImportando(false)} onImportado={recarregarInventarios} />}
      {divergencias && (
        <DivergenciasInventarioModal
          user={user}
          inventarios={inventarios}
          estoque={estoque}
          inventarioId={divergencias.inventarioId}
          onClose={() => setDivergencias(null)}
          onAbrirInventario={(id) => { setDivergencias(null); setAbertoId(id); }}
          onCriado={async (id) => {
            setDivergencias(null);
            await recarregarInventarios();
            setAbertoId(id);
          }}
        />
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, destaque, critico, onClick, dica }: {
  rotulo: string; valor: number | string; destaque?: boolean; critico?: boolean;
  /** Com ação, o indicador vira botão (ex.: abrir a lista de divergências). */
  onClick?: () => void; dica?: string;
}) {
  const conteudo = (
    <>
      <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      <span
        className="block text-2xl font-extrabold tabular-nums"
        style={{ color: critico ? 'var(--status-critical)' : destaque ? 'var(--status-serious)' : 'var(--ink-primary)' }}
      >
        {valor}
      </span>
      {onClick && <span className="block text-[10px] font-bold underline" style={{ color: 'var(--ink-secondary)' }}>Ver itens</span>}
    </>
  );
  const estilo = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)' };
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={dica}
      className="rounded-xl border px-4 py-3 text-left cursor-pointer transition-colors hover:border-[var(--status-critical)]"
      style={estilo}
    >
      {conteudo}
    </button>
  ) : (
    <div className="rounded-xl border px-4 py-3" style={estilo}>{conteudo}</div>
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
  onVerDivergencias,
}: {
  inv: InventarioRow;
  onAbrir: () => void;
  onExcluir?: () => void;
  podeExcluir?: boolean;
  onVerDivergencias?: () => void;
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
          {r.divergentes > 0 && (onVerDivergencias ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onVerDivergencias(); }}
              onKeyDown={(e) => e.stopPropagation()}
              title="Ver os itens divergentes e abrir recontagem"
              className="cursor-pointer rounded-full hover:opacity-80"
            >
              <Chip token="var(--status-critical)"><AlertTriangle className="h-3 w-3" /> {r.divergentes} divergente(s)</Chip>
            </button>
          ) : <Chip token="var(--status-critical)"><AlertTriangle className="h-3 w-3" /> {r.divergentes} divergente(s)</Chip>)}
          {r.aguardando > 0 && <Chip token="var(--status-serious)">{r.aguardando} aguardando decisão</Chip>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>{formatDateBR(inv.data)}</span>
          {podeExcluir && onExcluir && (
            <button aria-label="Excluir inventário"
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
        {r.baixaPendente > 0 && <> · {r.baixaPendente} com baixa pendente (fora da %)</>}
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
  const pref = useMemo(lerPreferenciasInventario, []);
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
  const [tempo, setTempo] = useState('');
  const [unidadeTempo, setUnidadeTempo] = useState<'minutos' | 'horas' | 'turnos' | 'dias'>('minutos');
  const [horasJornada, setHorasJornada] = useState(8);
  const [minPorItem, setMinPorItem] = useState(2);
  const [pendenciasEscopo, setPendenciasEscopo] = useState<PendenciaContagem[]>([]);
  const [verificandoEscopo, setVerificandoEscopo] = useState(false);
  const [resumoEscopo, setResumoEscopo] = useState('');
  const aoPerderReserva = useCallback(() => setResumoEscopo(''), []);
  const reservas = useReservasInventario(marcados, setMarcados, aoPerderReserva);
  const tempoMin = tempo.trim() ? Number(tempo.replace(',', '.')) * (unidadeTempo === 'minutos' ? 1 : unidadeTempo === 'horas' ? 60 : horasJornada * 60) : 30;

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

  const alternar = (c: CandidatoInventario) => {
    if (!reservas.pronto || reservas.ocupado || reservas.ocupadas.has(c.chave)) return;
    setResumoEscopo('');
    const n = new Map(marcados);
    if (n.has(c.chave)) n.delete(c.chave); else n.set(c.chave, c);
    void reservas.aplicar(n);
  };

  const marcarVarios = (lista: CandidatoInventario[], valor: boolean) => {
    if (!reservas.pronto || reservas.ocupado) return;
    setResumoEscopo(''); const n = new Map(marcados);
    lista.filter(c => !reservas.ocupadas.has(c.chave)).forEach((c) => (valor ? n.set(c.chave, c) : n.delete(c.chave)));
    void reservas.aplicar(n);
  };

  const sugerir = async () => {
    setVerificandoEscopo(true);
    try {
      const ctx = await contextoAuditoriaInventario();
      setPendenciasEscopo(ctx.pendencias);
      const r = sugerirEscopoRapido(visiveis.filter(c => !reservas.ocupadas.has(c.chave)), estoque, historico, ctx.pendencias, hoje, tempoMin, minPorItem);
      if (!r.itens.length) { toast.warning('Nenhum item cabe nesse tempo com as premissas atuais ou os itens têm pendências. Amplie o tempo ou regularize as movimentações.'); return; }
      if (!await reservas.aplicar(new Map(r.itens.map(c => [c.chave, c])))) return;
      setResumoEscopo(`Escopo rápido: ${r.itens.length} itens; estimativa ${r.minutos} min em ${Math.round(tempoMin)} min disponíveis. Premissas: ${minPorItem} min/item, preparação 5 min, reserva 20%, adicionais por endereço/unidade e deslocamento. Prioridade: divergências anteriores, classe A e cobertura. ${r.excluidosPendencia} itens excluídos por pendência de movimentação.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Falha ao verificar pendências do escopo.'); }
    finally { setVerificandoEscopo(false); }
  };

  const alternarDeposito = (d: string) =>
    setDepositos((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));

  const salvar = async () => {
    if (marcados.size === 0) { toast.error('Selecione ao menos um item para contar.'); return; }
    if (!reservas.pronto || reservas.ocupado) { toast.error('Aguarde a verificação das reservas antes de salvar.'); return; }
    setSalvando(true);
    gravarPreferenciasInventario({ depositos, criterio });
    const selecionados = [...marcados.values()];
    if (!resumoEscopo) selecionados.sort((a, b) => a.deposito.localeCompare(b.deposito) || a.posicao - b.posicao);
    const itens = selecionados.map((c) => ({ material: c.material, deposito: c.deposito, classe: c.classe }));
    try {
      if (inventario) {
        const n = await adicionarItensInventario(inventario.id, itens, reservas.sessao);
        toast.success(`${n} item(ns) acrescentado(s) ao ${inventario.codigo}.`);
        await onSalvo(inventario.id);
      } else {
        const depTxt = depositos.length > 0 ? depositos.join(', ') : 'todos os depósitos';
        const r = await criarInventario({
          data,
          criterio: `Curva 80/20 por ${ROTULO_CRITERIO[criterio].toLowerCase()} — ${depTxt}`,
          observacao: [observacao.trim(), resumoEscopo].filter(Boolean).join('\n') || null,
          conferente_nome: conferente.trim() || null,
          criado_por_nome: user.name,
          reserva_sessao: reservas.sessao,
        }, itens);
        toast.success(`Inventário ${r.codigo} aberto com ${itens.length} item(ns).`);
        await onSalvo(r.id);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar o inventário.');
      await reservas.atualizar();
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
        <div className="rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--hairline)' }}>
          <strong>Seleção exclusiva por material e depósito</strong>
          <p>Ao marcar, o item fica reservado nesta seleção. Itens em outra seleção ou inventário em andamento não podem ser marcados. Ao fechar, a seleção é liberada; sem renovação, as reservas temporárias expiram em até 2 minutos.</p>
          {!reservas.pronto && !reservas.erro && <p role="status">Verificando disponibilidade…</p>}
          {reservas.erro && <p role="alert" className="text-rose-600">{reservas.erro}</p>}
          <button type="button" onClick={() => void reservas.atualizar()} disabled={reservas.ocupado} className="mt-1 font-bold underline">Atualizar disponibilidade</button>
        </div>
        <section className="space-y-2 rounded-xl border p-3 text-xs" style={{ borderColor: 'var(--hairline)' }}>
          <strong>Sugerir escopo rápido de contagem</strong>
          <div className="grid gap-2 sm:grid-cols-4">
            <Campo rotulo="Tempo disponível (opcional)"><input className={inputCls} type="number" min="0.1" step="any" value={tempo} placeholder="Sem informar: 30 min" onChange={e => { setTempo(e.target.value); setResumoEscopo(''); }} /></Campo>
            <Campo rotulo="Unidade de tempo"><select className={inputCls} value={unidadeTempo} onChange={e => { setUnidadeTempo(e.target.value as typeof unidadeTempo); setResumoEscopo(''); }}><option value="minutos">Minutos</option><option value="horas">Horas</option><option value="turnos">Turnos</option><option value="dias">Dias</option></select></Campo>
            <Campo rotulo="Minutos por item (premissa)"><input className={inputCls} type="number" min="0.1" step="0.5" value={minPorItem} onChange={e => { setMinPorItem(Number(e.target.value)); setResumoEscopo(''); }} /></Campo>
            {(unidadeTempo === 'turnos' || unidadeTempo === 'dias') && <Campo rotulo="Horas úteis por turno/dia"><input className={inputCls} type="number" min="1" max="24" value={horasJornada} onChange={e => { setHorasJornada(Number(e.target.value)); setResumoEscopo(''); }} /></Campo>}
          </div>
          <p>Estimativa operacional ajustável, com reserva de 20%. Prioriza risco e cobertura; não substitui um plano estatístico de auditoria. Cada rodada depende de nova atualização e liberação da gestão.</p>
          <button type="button" onClick={() => void sugerir()} disabled={verificandoEscopo || !reservas.pronto || reservas.ocupado || !Number.isFinite(tempoMin) || tempoMin <= 0 || minPorItem <= 0 || horasJornada < 1 || horasJornada > 24} className={btnSec} style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>{verificandoEscopo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}Sugerir escopo rápido</button>
          {resumoEscopo && <p role="status">{resumoEscopo}</p>}
          {!!pendenciasEscopo.length && <p>Materiais com saída extraordinária ou requisição pendente não entram na sugestão. Regularize em Pendências antes de incluí-los.</p>}
        </section>
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
            <button type="button" disabled={reservas.ocupado} onClick={() => { setResumoEscopo(''); void reservas.aplicar(new Map()); }} className="hover:underline">Limpar seleção</button>
          </span>
        </div>

        <div className="divide-y rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
          {visiveis.length === 0 ? (
            <p className="py-8 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhum item nesse filtro.</p>
          ) : visiveis.slice(0, LIMITE_LISTA).map((c) => {
            const marcado = marcados.has(c.chave);
            const reserva = reservas.ocupadas.get(c.chave);
            return (
              <label
                key={c.chave}
                className="flex cursor-pointer items-center gap-3 px-3 py-2"
                style={{ borderColor: 'var(--hairline)', background: marcado ? 'color-mix(in srgb, var(--brand) 7%, transparent)' : undefined }}
              >
                <input type="checkbox" checked={marcado} disabled={!!reserva || !reservas.pronto || reservas.ocupado || salvando} onChange={() => alternar(c)} className="shrink-0" />
                <span className="w-7 shrink-0 text-center text-[11px] font-extrabold" style={{ color: COR_CLASSE[c.classe] }}>{c.classe}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{c.descricao || '—'}</span>
                  <span className="block text-[11px] font-mono" style={{ color: 'var(--ink-muted)' }}>
                    {c.material} · {formatDeposito(c.deposito)} · {c.unidade}
                  </span>
                  <ChipsHistorico h={historico.get(c.chave)} hoje={hoje} />
                  {reserva && <span className="mt-1 block text-[11px] font-bold" style={{ color: 'var(--status-serious)' }}>Reservado por {reserva.responsavel}{reserva.inventario ? ` · ${reserva.inventario}` : ' · seleção em andamento'}</span>}
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
        <button onClick={() => void salvar()} disabled={salvando || !reservas.pronto || reservas.ocupado || verificandoEscopo || marcados.size === 0} className={btnPri} style={{ background: 'var(--brand)' }}>
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
/** No celular os filtros quebram linha: rótulo curto. */
const ROTULO_FILTRO_CURTO: Partial<Record<FiltroItens, string>> = { aguardando_decisao: 'Aguardando' };
/** Ordem do filtro no celular: o que se usa durante a contagem primeiro. */
const ORDEM_FILTRO: FiltroItens[] = ['abertos', 'pendente', 'aguardando_decisao', 'divergente', 'conferido', 'todos'];

type OrdemItens = 'roteiro' | 'lista';
const CHAVE_ORDEM = 'sisten_inv_ordem_itens';
function lerOrdem(): OrdemItens {
  try { return localStorage.getItem(CHAVE_ORDEM) === 'lista' ? 'lista' : 'roteiro'; } catch { return 'roteiro'; }
}

function VistaInventario({
  user, inv, posicoes, onNavigate, abrirContagem, onVoltar, onRecarregar, onAdicionar, onExcluido,
}: {
  user: Profile;
  inv: InventarioRow;
  /** Posições da ZL0024 por `chavePosicao(material, depósito)`. */
  posicoes: Map<string, string[]>;
  onNavigate?: (path: string) => void;
  /** Item a contar assim que a vista abre (leitura de QR); `n` distingue leituras do mesmo item. */
  abrirContagem?: { itemId: string; n: number } | null;
  onVoltar: () => void;
  onRecarregar: () => Promise<void>;
  onAdicionar: () => void;
  onExcluido: () => Promise<void>;
}) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroItens>('abertos');
  const [busca, setBusca] = useState('');
  const [contandoId, setContandoId] = useState<string | null>(abrirContagem?.itemId ?? null);
  const [exportando, setExportando] = useState<'xlsx' | 'pdf' | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ gerar: () => Promise<PdfGerado>; titulo?: string } | null>(null);
  const [ordem, setOrdemEstado] = useState<OrdemItens>(lerOrdem);
  const setOrdem = (o: OrdemItens) => {
    setOrdemEstado(o);
    try { localStorage.setItem(CHAVE_ORDEM, o); } catch { /* só não lembra */ }
  };
  const [obsAberta, setObsAberta] = useState(false);
  const [mapa, setMapa] = useState<{ item: ItemInventario; posicoes: string[]; sobreModal: boolean } | null>(null);
  const podeGemba = canAccessPage(user, 'almox_gemba');
  const r = resumirInventario(inv.itens);
  const dono = podeEditarFormulario(user, inv);
  const algumContado = inv.itens.some((i) => i.contagens.length > 0);
  const podeExcluir = podeExcluirInventario(user, inv);

  // Mapa de fotos do catálogo e Book de EPIs vinculadas aos materiais deste inventário
  const [mapaFotos, setMapaFotos] = useState<Map<string, CatalogoItem>>(new Map());
  // Visualizador padrão (z acima de qualquer Modal, Esc só fecha ele): o
  // overlay próprio que havia aqui abria atrás do modal de contagem.
  const lightbox = useLightbox();
  const setImagemZoom = useCallback((z: { url: string; titulo: string; codigo: string }) => {
    lightbox.abrir([{ url: z.url, legenda: `SAP ${z.codigo} · ${z.titulo}` }], 0, { copiar: true });
  }, [lightbox.abrir]);

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

  /** Posição do item: ZL0024 do depósito; sem ela, a do cadastro do catálogo. */
  const posicoesDe = useCallback((i: ItemInventario): string[] => {
    const daZl = posicoes.get(chavePosicao(i.material, i.deposito));
    if (daZl?.length) return daZl;
    return separarPosicoes(mapaFotos.get(i.material)?.posicao_estoque);
  }, [posicoes, mapaFotos]);

  /** Ordem de trabalho: pela posição (roteiro no galpão) ou a da ficha. */
  const ordenados = useMemo(
    () => (ordem === 'roteiro' ? ordenarPorRoteiro(inv.itens, posicoesDe) : inv.itens),
    [inv.itens, ordem, posicoesDe],
  );

  const contagemFiltro = useMemo(() => {
    const c: Record<FiltroItens, number> = { todos: r.total, abertos: r.pendentes + r.aguardando, pendente: r.pendentes, aguardando_decisao: r.aguardando, conferido: r.conferidos, divergente: r.divergentes };
    return c;
  }, [r]);

  const itens = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    return ordenados.filter((i) => {
      if (filtro === 'abertos' && itemEncerrado(i)) return false;
      if (filtro !== 'todos' && filtro !== 'abertos' && i.status !== filtro) return false;
      if (tokens.length > 0 && !casarTokens([i.material, i.descricao, ...posicoesDe(i)], tokens)) return false;
      return true;
    });
  }, [ordenados, filtro, busca, posicoesDe]);

  useEffect(() => {
    if (abrirContagem) setContandoId(abrirContagem.itemId);
  }, [abrirContagem?.n]);

  const contando = inv.itens.find((i) => i.id === contandoId) ?? null;
  const naFila = useItensContadosNaFila();
  // Depois de encerrar um item, "Próximo" leva ao seguinte em aberto na ordem da ficha
  // (pulando os que já têm contagem guardada no aparelho).
  const proximoAberto = (depoisDe: string) => {
    const lista = ordenados;
    const idx = lista.findIndex((i) => i.id === depoisDe);
    return [...lista.slice(idx + 1), ...lista.slice(0, idx)].find((i) => !itemEncerrado(i) && i.id !== depoisDe && !naFila.has(i.id)) ?? null;
  };

  /** Primeiro item em aberto do roteiro — a barra "Contar próximo" do celular. */
  const proximoParaContar = inv.status === 'aberto'
    ? ordenados.find((i) => !itemEncerrado(i) && !naFila.has(i.id)) ?? null
    : null;

  const abrirItem = (item: ItemInventario) => {
    if (naFila.has(item.id)) { toast.info('Este item já tem contagem guardada neste aparelho. O resultado aparece quando sincronizar.'); return; }
    setContandoId(item.id);
  };

  const exportar = async (tipo: 'xlsx' | 'pdf') => {
    if (tipo === 'pdf') {
      setPdfPreview({
        gerar: () => gerarInventarioCiclicoPdf(inv),
        titulo: `Inventário Cíclico — ${inv.codigo}`,
      });
      if (r.pendentes + r.aguardando > 0) {
        toast.warning('Exportado com itens em aberto — o saldo da ZL0024 só sai para item encerrado.');
      }
      return;
    }
    setExportando(tipo);
    try {
      exportarPlanilhaInventario(inv);
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
    if (!await confirmar({ titulo: 'Tirar da lista?', mensagem: `Tirar ${item.material} (${item.descricao}) da lista?`, confirmarLabel: 'Tirar da lista', variante: 'perigo' })) return;
    try { await removerItemInventario(item.id); await onRecarregar(); }
    catch (err: any) { toast.error(err?.message || 'Falha ao remover.'); }
  };

  const excluir = async () => {
    const msg = algumContado
      ? `Excluir o inventário ${inv.codigo}? Ele possui contagens registradas. Esta exclusão só é permitida para administradores. O inventário sairá da tela, mas continuará registrado no histórico do banco.`
      : `Excluir o inventário ${inv.codigo}? Sai da tela, mas permanece no banco.`;
    if (!await confirmar({ titulo: 'Excluir inventário?', mensagem: msg, confirmarLabel: 'Excluir', variante: 'perigo' })) return;
    try { await excluirInventario(inv.id, user.name); toast.success(`${inv.codigo} excluído.`); await onExcluido(); }
    catch (err: any) { toast.error(err?.message || 'Falha ao excluir.'); }
  };

  return (
    <div className={`mx-auto max-w-5xl space-y-4 px-4 pt-4 sm:py-6 ${proximoParaContar ? 'pb-28 sm:pb-6' : 'pb-6'}`}>
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
          {inv.observacao && (
            <div className="mt-0.5">
              <p className={`text-xs ${obsAberta ? '' : 'line-clamp-2 sm:line-clamp-none'}`} style={{ color: 'var(--ink-secondary)' }}>{inv.observacao}</p>
              {inv.observacao.length > 90 && (
                <button
                  type="button"
                  onClick={() => setObsAberta((v) => !v)}
                  aria-expanded={obsAberta}
                  className="min-h-8 text-[11px] font-bold sm:hidden"
                  style={{ color: 'var(--brand)' }}
                >
                  {obsAberta ? 'Ver menos' : 'Ver mais'}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button onClick={() => void exportar('xlsx')} disabled={!!exportando} className={`${btnSec} min-h-10 sm:min-h-0`} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            {exportando === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Planilha
          </button>
          <button onClick={() => void exportar('pdf')} disabled={!!exportando} className={`${btnSec} min-h-10 sm:min-h-0`} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            <FileText className="h-3.5 w-3.5" /> <span className="sm:hidden">PDF</span><span className="hidden sm:inline">Visualizar PDF</span>
          </button>
          {dono && inv.status === 'aberto' && (
            <button onClick={onAdicionar} className={`${btnSec} min-h-10 sm:min-h-0`} style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}>
              <Plus className="h-3.5 w-3.5" /> Itens
            </button>
          )}
          {podeExcluir && (
            <button
              onClick={() => void excluir()}
              className={`${btnSec} ml-auto min-h-10 min-w-10 justify-center sm:ml-0 sm:min-h-0 sm:min-w-0`}
              style={{ borderColor: 'var(--hairline)', color: 'var(--status-critical)' }}
              aria-label={algumContado ? 'Excluir inventário (permissão de administrador)' : 'Excluir inventário'}
              title={algumContado ? 'Excluir inventário (permissão de administrador)' : 'Excluir inventário'}
            >
              <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
            </button>
          )}
        </div>
      </div>

      {/* Celular: um cartão de progresso; os números filtram a lista. */}
      <ProgressoMobile inv={inv} filtro={filtro} onFiltrar={setFiltro} />

      <div className="hidden grid-cols-2 gap-3 sm:grid sm:grid-cols-4">
        <Indicador rotulo="A contar" valor={r.pendentes} />
        <Indicador rotulo="Aguardando decisão" valor={r.aguardando} destaque={r.aguardando > 0} />
        <Indicador rotulo="Divergentes" valor={r.divergentes} critico={r.divergentes > 0} />
        <Indicador rotulo="Acuracidade" valor={r.acuracidade == null ? '—' : `${r.acuracidade.toFixed(0)}%`} />
      </div>
      <div className="hidden sm:block"><BarraProgresso inv={inv} /></div>
      {r.baixaPendente > 0 && (
        <p className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-serious)' }} aria-hidden />
          <span>
            {r.baixaPendente} item(ns) contado(s) com retirada do balcão sem baixa no SAP: ficam fora da acuracidade.
            A lista para validar depois da regularização está na Análise de Inventário.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Celular: chips que quebram linha (nada some para o lado); zerados só aparecem no computador. */}
        <div
          className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:min-w-0 sm:flex-nowrap sm:gap-0 sm:overflow-x-auto sm:no-scrollbar sm:rounded-lg sm:border sm:p-0.5"
          style={{ borderColor: 'var(--hairline)' }}
          role="group"
          aria-label="Filtrar itens"
        >
          {ORDEM_FILTRO.map((f) => {
            const ativo = filtro === f;
            const oculto = !ativo && contagemFiltro[f] === 0 && f !== 'todos' && f !== 'abertos';
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={ativo}
                className={`${oculto ? 'hidden sm:inline-flex' : 'inline-flex'} min-h-9 shrink-0 items-center rounded-full border px-3 text-xs font-bold sm:min-h-0 sm:rounded-md sm:border-0 sm:px-2.5 sm:py-1 sm:text-[11px]`}
                style={ativo
                  ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'white' }
                  : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              >
                <span className="sm:hidden">{ROTULO_FILTRO_CURTO[f] ?? ROTULO_FILTRO[f]}</span>
                <span className="hidden sm:inline">{ROTULO_FILTRO[f]}</span>
                <span className="ml-1 tabular-nums opacity-80">{contagemFiltro[f]}</span>
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
          <input
            type="search"
            enterKeyHint="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material, descrição ou posição"
            aria-label="Buscar item"
            className={`${inputCls} min-h-10 pl-8 text-sm sm:min-h-0 sm:text-xs`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
          {itens.length} {itens.length === 1 ? 'item' : 'itens'}{ordem === 'roteiro' ? ' · na ordem do galpão' : ' · na ordem da ficha'}
        </span>
        <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Ordem dos itens">
          {([['roteiro', 'Por localização', Route], ['lista', 'Ordem da ficha', ListOrdered]] as const).map(([o, rotulo, Icone]) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrdem(o)}
              aria-pressed={ordem === o}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold sm:min-h-0 sm:py-1"
              style={ordem === o ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
            >
              <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          {filtro === 'abertos' && r.total > 0 ? 'Todos os itens foram encerrados.' : 'Nenhum item nesse filtro.'}
        </div>
      ) : (
        <div className="space-y-2">
          {itens.map((item, idx) => {
            const pos = posicoesDe(item);
            // No roteiro, um cabeçalho a cada estante/área nova do galpão.
            const grupo = ordem === 'roteiro' ? grupoDoRoteiro(pos[0]) : null;
            const grupoAnterior = ordem === 'roteiro' && idx > 0 ? grupoDoRoteiro(posicoesDe(itens[idx - 1])[0]) : null;
            return (
              <React.Fragment key={item.id}>
                {grupo && grupo !== grupoAnterior && (
                  <h3 className="flex items-center gap-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {grupo}
                  </h3>
                )}
                <LinhaItem
                  item={item}
                  numero={inv.itens.indexOf(item) + 1}
                  fotoItem={mapaFotos.get(item.material)}
                  posicoes={pos}
                  podeRemover={dono && item.contagens.length === 0 && !naFila.has(item.id)}
                  contadoNaFila={naFila.has(item.id)}
                  onAbrir={() => abrirItem(item)}
                  onVerZoom={(url, titulo, codigo) => setImagemZoom({ url, titulo, codigo })}
                  onVerMapa={() => setMapa({ item, posicoes: pos, sobreModal: false })}
                  onRemover={() => void remover(item)}
                />
              </React.Fragment>
            );
          })}
        </div>
      )}

      {contando && (
        <ModalContagem
          key={contando.id}
          user={user}
          item={contando}
          inventarioId={inv.id}
          numero={inv.itens.indexOf(contando) + 1}
          fotoItem={mapaFotos.get(contando.material)}
          posicoes={posicoesDe(contando)}
          onVerMapa={() => setMapa({ item: contando, posicoes: posicoesDe(contando), sobreModal: true })}
          onFotoSalva={(salvo) => handleFotoSalva(contando.material, salvo)}
          onVerZoom={(url, titulo, codigo) => setImagemZoom({ url, titulo, codigo })}
          onRecarregar={onRecarregar}
          onProximo={() => setContandoId(proximoAberto(contando.id)?.id ?? null)}
          temProximo={proximoAberto(contando.id) != null}
          onClose={() => setContandoId(null)}
        />
      )}

      {mapa && (
        <Suspense fallback={null}>
          <GembaLocalizacaoModal
            material={mapa.item.material}
            descricao={mapa.item.descricao}
            posicoes={mapa.posicoes}
            zIndexClassName={mapa.sobreModal ? 'z-[120]' : undefined}
            onClose={() => setMapa(null)}
            onAbrirGemba={podeGemba && onNavigate
              ? () => onNavigate(`/almoxarifado/gemba?item=${encodeURIComponent(mapa.item.material)}`)
              : undefined}
          />
        </Suspense>
      )}

      {/* Celular: o próximo item do roteiro sempre à mão. */}
      {proximoParaContar && !contando && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(15,23,42,0.08)] sm:hidden"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          <button
            type="button"
            onClick={() => abrirItem(proximoParaContar)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 py-2 text-left text-white transition-transform active:scale-[0.98]"
            style={{ background: 'var(--brand)' }}
          >
            <ClipboardList className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">
                Contar próximo <span className="font-semibold opacity-90">· {r.pendentes + r.aguardando} em aberto</span>
              </span>
              <span className="block truncate text-[11px] opacity-90">
                {posicoesDe(proximoParaContar)[0] ? `${posicoesDe(proximoParaContar)[0]} · ` : ''}{proximoParaContar.descricao}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}

      {lightbox.elemento}
      {pdfPreview && (
        <PdfPreviewModal
          gerar={pdfPreview.gerar}
          tituloPadrao={pdfPreview.titulo}
          onClose={() => setPdfPreview(null)}
        />
      )}
    </div>
  );
}

/** Celular: progresso do inventário num cartão só; os números filtram a lista. */
function ProgressoMobile({ inv, filtro, onFiltrar }: { inv: InventarioRow; filtro: FiltroItens; onFiltrar: (f: FiltroItens) => void }) {
  const r = resumirInventario(inv.itens);
  const encerrados = r.conferidos + r.divergentes;
  const numeros: { f: FiltroItens | null; rotulo: string; valor: string; cor?: string }[] = [
    { f: 'pendente', rotulo: 'A contar', valor: String(r.pendentes) },
    { f: 'aguardando_decisao', rotulo: 'Aguardando', valor: String(r.aguardando), cor: r.aguardando > 0 ? 'var(--status-serious)' : undefined },
    { f: 'divergente', rotulo: 'Divergentes', valor: String(r.divergentes), cor: r.divergentes > 0 ? 'var(--status-critical)' : undefined },
    { f: null, rotulo: 'Acuracidade', valor: r.acuracidade == null ? '—' : `${r.acuracidade.toFixed(0)}%` },
  ];
  return (
    <section className="rounded-xl border p-3 sm:hidden" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }} aria-label="Progresso do inventário">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Progresso</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{encerrados} de {r.total} encerrados</span>
      </div>
      <div className="mt-2"><BarraProgresso inv={inv} /></div>
      <div className="mt-2.5 grid grid-cols-4 gap-1">
        {numeros.map((n) => {
          const conteudo = (
            <>
              <span className="block text-base font-extrabold tabular-nums leading-tight" style={{ color: n.cor ?? 'var(--ink-primary)' }}>{n.valor}</span>
              <span className="block text-[10px] font-semibold leading-tight" style={{ color: 'var(--ink-muted)' }}>{n.rotulo}</span>
            </>
          );
          return n.f ? (
            <button
              key={n.rotulo}
              type="button"
              onClick={() => onFiltrar(n.f!)}
              aria-pressed={filtro === n.f}
              className="min-h-11 rounded-lg px-1 py-1 text-center transition-colors"
              style={filtro === n.f ? { background: 'color-mix(in srgb, var(--brand) 12%, transparent)' } : undefined}
            >
              {conteudo}
            </button>
          ) : (
            <div key={n.rotulo} className="min-h-11 px-1 py-1 text-center">{conteudo}</div>
          );
        })}
      </div>
    </section>
  );
}

function LinhaItem({
  item, numero, fotoItem, posicoes, podeRemover, contadoNaFila, onAbrir, onVerZoom, onVerMapa, onRemover,
}: {
  item: ItemInventario;
  numero: number;
  fotoItem?: CatalogoItem;
  /** Posições de estoque do item (ZL0024 do depósito ou cadastro). */
  posicoes: string[];
  podeRemover: boolean;
  contadoNaFila?: boolean;
  onAbrir: () => void;
  onVerZoom?: (url: string, titulo: string, codigo: string) => void;
  onVerMapa: () => void;
  onRemover: () => void;
}) {
  const encerrado = itemEncerrado(item);
  const token = TOKEN_STATUS[item.status];
  const posicao = posicoes[0] ?? null;
  const lugar = posicao ? descreverPosicao(posicao) : null;
  return (
    <div
      className="overflow-hidden rounded-xl border transition-all hover:border-slate-400 dark:hover:border-slate-600"
      style={{ borderColor: item.status === 'pendente' ? 'var(--hairline)' : `color-mix(in srgb, ${token} 45%, var(--hairline))`, background: 'var(--surface-raised)' }}
    >
      <div className="flex items-stretch gap-1">
        <div className="flex shrink-0 items-start py-2.5 pl-2.5">
          {fotoItem?.url_imagem ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onVerZoom?.(fotoItem.url_imagem!, item.descricao, item.material);
              }}
              className="relative group h-14 w-14 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-pointer shadow-2xs hover:scale-105 transition"
              aria-label={`Ver foto de ${item.descricao || item.material}`}
            >
              <img src={fotoItem.url_imagem} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                <Eye className="h-3.5 w-3.5" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onAbrir}
              className="h-14 w-14 rounded-lg border border-dashed border-amber-300 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col items-center justify-center text-amber-700 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition cursor-pointer"
              aria-label={`Sem foto: abrir contagem de ${item.descricao || item.material} para cadastrar a foto`}
            >
              <Camera className="h-4 w-4" />
              <span className="text-[10px] font-bold mt-0.5 leading-none">+foto</span>
            </button>
          )}
        </div>

        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 px-2 py-2.5 text-left cursor-pointer">
          <span className="flex items-start gap-1.5">
            <span className="shrink-0 text-[11px] font-extrabold tabular-nums leading-5" style={{ color: 'var(--ink-muted)' }}>{numero}.</span>
            <span className="min-w-0 flex-1 line-clamp-2 text-[13px] font-bold leading-5 sm:text-xs" style={{ color: 'var(--ink-primary)' }}>{item.descricao || '—'}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <span className="font-mono font-semibold">{item.material}</span>
            <span>{formatDeposito(item.deposito)}</span>
            {item.classe && <span>Classe {item.classe}</span>}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {contadoNaFila
              ? <Chip token="var(--status-serious)"><CloudOff className="h-3 w-3" /> Contagem no aparelho</Chip>
              : <ChipStatusItem status={item.status} />}
            {baixaPendenteDoItem(item) && (
              <span
                title={`Contado com retirada sem baixa no SAP (${codigosDoRetrato(baixaPendenteDoItem(item)!)}). Fica fora da acuracidade até recontar depois da regularização.`}
              >
                <Chip token="var(--status-serious)"><AlertTriangle className="h-3 w-3" /> Baixa pendente · fora da %</Chip>
              </span>
            )}
            {fotoItem?.url_imagem && fotoItem.codigo_registro?.startsWith('EPI-') && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <ShieldCheck className="h-2.5 w-2.5" /> EPI
              </span>
            )}
            {item.contagens.map((c) => (
              <span key={c.id} className="font-semibold" style={{ color: c.divergente ? 'var(--status-critical)' : 'var(--status-good)' }}>
                {c.numero}ª: {encerrado ? `${formatQtd(c.quantidade)} ${item.unidade || ''}` : 'enviada'}
              </span>
            ))}
            {encerrado && item.saldo_sistema != null && (
              <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>
                ZL0024: {formatQtd(item.saldo_sistema)}
                {item.diferenca ? ` (${item.diferenca > 0 ? '+' : ''}${formatQtd(item.diferenca)})` : ''}
              </span>
            )}
          </span>
        </button>
        {podeRemover && (
          <button
            aria-label={`Tirar ${item.material} da lista`}
            type="button"
            onClick={onRemover}
            title="Tirar da lista"
            className="flex w-11 shrink-0 items-start justify-center pt-3 cursor-pointer hover:text-rose-600 transition"
            style={{ color: 'var(--ink-muted)' }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Localização: toca para ver no Gemba 2D onde o item fica. */}
      {posicao ? (
        <button
          type="button"
          onClick={onVerMapa}
          aria-label={`Ver a posição ${posicao} no mapa do almoxarifado`}
          className="flex min-h-10 w-full items-center gap-2 border-t px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)]"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
          <span className="shrink-0 font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
            {posicao}{posicoes.length > 1 && <span className="font-sans font-semibold" style={{ color: 'var(--ink-muted)' }}> +{posicoes.length - 1}</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>{lugar ?? ''}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--brand)' }}>
            <IconeMapa className="h-3.5 w-3.5" aria-hidden="true" /> Mapa
          </span>
        </button>
      ) : (
        <p className="flex min-h-8 items-center gap-2 border-t px-3 text-[11px]" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Sem posição na ZL0024
        </p>
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

/**
 * Divergência: a contagem não espera a gestão atualizar a ZL0024, mas quem
 * contou precisa saber de quando é o saldo comparado e avisar a gestão.
 */
function AvisoGestaoDivergencia({ importadaEm, pendencias }: { importadaEm: string | null; pendencias?: PendenciaSapContagem[] }) {
  return (
    <div className="space-y-1.5 rounded-lg px-3 py-2 text-xs" style={{ background: 'color-mix(in srgb, var(--status-serious) 12%, transparent)', color: 'var(--ink-primary)' }}>
      <p>
        Comparado com a ZL0024 importada em <strong>{importadaEm ? formatDateTimeBR(importadaEm) : 'data não identificada'}</strong>.
        Avise a gestão do almoxarifado para conferir a divergência — pode ser movimentação depois dessa importação.
      </p>
      {pendencias && pendencias.length > 0 && (
        <div>
          <p className="font-bold">Este material tem movimentação ainda sem baixa no SAP — a diferença pode vir dela:</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {pendencias.map((p) => (
              <li key={`${p.codigo}-${p.tipo}`}><span className="font-mono font-bold">{p.codigo}</span> — {p.motivo}</li>
            ))}
          </ul>
          <p className="mt-1" style={{ color: 'var(--ink-secondary)' }}>Na recontagem, a causa provável é "Movimentação / documento pendente".</p>
        </div>
      )}
    </div>
  );
}

export function ModalContagem({
  user, item, inventarioId, numero, fotoItem, posicoes, onVerMapa, onFotoSalva, onVerZoom, onRecarregar, onProximo, temProximo, onClose,
}: {
  user: Profile;
  item: ItemInventario;
  inventarioId: string;
  numero: number;
  fotoItem?: CatalogoItem;
  /** Posições de estoque do item, para achar no galpão. */
  posicoes?: string[];
  /** Abre o Gemba 2D com a posição. */
  onVerMapa?: () => void;
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
  /** Contagem/encerramento foi para a fila do aparelho: o resultado só existe depois de sincronizar. */
  const [guardadaNoAparelho, setGuardadaNoAparelho] = useState(false);
  const [fotoAtual, setFotoAtual] = useState<CatalogoItem | null>(fotoItem ?? null);
  const [modalFotoAberto, setModalFotoAberto] = useState(false);
  const qtdRef = useRef<HTMLInputElement>(null);
  const [causa, setCausa] = useState<CausaInventario | ''>('');
  const [causaDetalhe, setCausaDetalhe] = useState('');
  const [validadeNaoSeAplica, setValidadeNaoSeAplica] = useState(false);
  // Início da contagem (vai para a duração gravada); renova a cada nova contagem.
  const iniciadaRef = useRef<string>(new Date().toISOString());
  // Hora da última importação da ZL0024 — mostrada só quando a contagem diverge.
  const [zl0024ImportadaEm, setZl0024ImportadaEm] = useState<string | null>(null);
  // Movimentações sem baixa no SAP devolvidas pela última contagem divergente.
  const [pendenciasSap, setPendenciasSap] = useState<PendenciaSapContagem[]>([]);
  useEffect(() => {
    let ativo = true;
    contextoAuditoriaInventario(inventarioId)
      .then((ctx) => { if (ativo) setZl0024ImportadaEm(ctx.base?.updated_at ?? null); })
      .catch(() => { /* o aviso sai sem a hora */ });
    return () => { ativo = false; };
  }, [inventarioId]);

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
  const causaValida = !!causa && causaDetalhe.trim().length >= 5;

  const enviar = async () => {
    if (!qtdValida) { toast.error('Informe a quantidade contada (zero ou mais).'); return; }
    if ((proxima ?? 1) >= 2 && !causaValida) { toast.error('Informe a causa provável e o detalhe da recontagem.'); return; }
    setEnviando(true);
    try {
      const r = await registrarContagem(item.id, {
        quantidade: qtdNum,
        endereco: endereco.trim() || null,
        validade: validadeNaoSeAplica ? null : validade || null,
        observacao: obs.trim() || null,
        por: user.name,
        causa: causa || null, causaDetalhe: causaDetalhe.trim() || null,
        iniciadaEm: iniciadaRef.current,
      });
      if (ehRespostaOffline(r)) {
        // Sem rede: a comparação com a ZL0024 é do servidor. Não dá para dizer se confere.
        setQtd(''); setObs(''); setCausa(''); setCausaDetalhe('');
        setGuardadaNoAparelho(true);
        toast.success('Contagem guardada neste aparelho. Ela sobe sozinha quando a rede voltar, e o resultado aparece depois.');
        await onRecarregar();
        setFase('final');
        return;
      }
      setUltimo(r);
      if (r.zl0024_importada_em) setZl0024ImportadaEm(r.zl0024_importada_em);
      setPendenciasSap(r.divergente ? r.pendencias_sap ?? [] : []);
      setQtd(''); setObs(''); setCausa(''); setCausaDetalhe('');
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
    if (!causaValida) { toast.error('Informe a causa provável e o detalhe antes de encerrar.'); return; }
    setEnviando(true);
    try {
      const r = await encerrarItemInventario(item.id, causa as CausaInventario, causaDetalhe);
      if (ehRespostaOffline(r)) {
        setGuardadaNoAparelho(true);
        toast.success('Encerramento guardado neste aparelho. O saldo do sistema aparece quando sincronizar.');
        await onRecarregar();
        setFase('final');
        return;
      }
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
        {posicoes && posicoes.length > 0 && (
          onVerMapa ? (
            <button
              type="button"
              onClick={onVerMapa}
              aria-label={`Ver a posição ${posicoes[0]} no mapa do almoxarifado`}
              className="mt-1 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-2 text-[11px] font-bold"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
              <span className="font-mono" style={{ color: 'var(--ink-primary)' }}>{posicoes.join(', ')}</span>
              <span className="inline-flex shrink-0 items-center gap-1" style={{ color: 'var(--brand)' }}>
                · <IconeMapa className="h-3.5 w-3.5" aria-hidden="true" /> Mapa
              </span>
            </button>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span className="font-mono">{posicoes.join(', ')}</span>
            </p>
          )
        )}
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
              <span className="text-[10px] font-bold text-center leading-tight">Sem foto</span>
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
              {/* Com foto, trocar fica no Cadastro de Itens: na contagem só se tira a que falta. */}
              {!fotoAtual?.url_imagem && (
                <button
                  type="button"
                  onClick={() => setModalFotoAberto(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer text-white shadow-xs"
                  style={{ background: 'var(--brand)' }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Tirar Foto de Cadastro
                </button>
              )}

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
                  {c.numero}ª contagem: <span className="tabular-nums">{itemEncerrado(item) ? `${formatQtd(c.quantidade)} ${item.unidade || ''}` : 'enviada · quantidade oculta durante a recontagem'}</span>
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
                {c.causa && <span className="basis-full text-[11px]">Causa provável: {rotuloCausa(c.causa)} · {c.causa_detalhe}</span>}
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
                <input
                  type="date"
                  value={validadeNaoSeAplica ? '' : validade}
                  onChange={(e) => setValidade(e.target.value)}
                  disabled={validadeNaoSeAplica}
                  className={`${inputCls} disabled:opacity-50`}
                />
                <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={validadeNaoSeAplica}
                    onChange={(e) => { setValidadeNaoSeAplica(e.target.checked); if (e.target.checked) setValidade(''); }}
                    className="h-4 w-4 accent-[var(--brand)]"
                  />
                  Não se aplica
                </span>
              </Campo>
            </div>
            <Campo rotulo="Observação">
              <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputCls} />
            </Campo>
            {proxima >= 2 && <p className="text-xs">Prefira outro conferente para a recontagem. O saldo e as quantidades anteriores ficam ocultos nesta tela até o encerramento.</p>}
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Ao enviar, a contagem fica gravada e não pode ser alterada.
            </p>
          </div>
        )}

        {((fase === 'contar' && (proxima ?? 1) >= 2) || fase === 'decidir') && <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <Campo rotulo="Causa provável da diferença anterior" obrigatorio><select className={inputCls} value={causa} onChange={e => setCausa(e.target.value as CausaInventario | '')}><option value="">Selecione…</option>{Object.entries(CAUSAS_INVENTARIO).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Campo>
          <Campo rotulo="Detalhe / evidência / documento verificado" obrigatorio><textarea className={inputCls} value={causaDetalhe} onChange={e => setCausaDetalhe(e.target.value)} minLength={5} /></Campo>
          <p className="text-[11px]">Classificação declarada para investigação. Use “Em apuração” se a causa ainda não estiver comprovada.</p>
        </div>}

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
              não aceita mais contagem. Para decidir depois, feche sem recontar: o item fica em aberto neste inventário.
            </p>
            <AvisoGestaoDivergencia importadaEm={zl0024ImportadaEm} pendencias={pendenciasSap} />
          </div>
        )}

        {fase === 'final' && guardadaNoAparelho && (
          <p role="status" className="rounded-xl border px-3 py-2.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            Guardada neste aparelho, sem rede. Ela sobe sozinha quando a conexão voltar (selo de sincronização no canto da tela),
            e só então o sistema compara com a ZL0024. Até lá, este item fica marcado como contado e não aceita outra contagem aqui.
          </p>
        )}
        {fase === 'final' && !guardadaNoAparelho && (
          <>
            <ResultadoFinal item={item} />
            {item.status === 'divergente' && <AvisoGestaoDivergencia importadaEm={zl0024ImportadaEm} pendencias={pendenciasSap} />}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {fase === 'contar' && (
          <>
            <button onClick={onClose} className={btnSec} style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>Cancelar</button>
            <button onClick={() => void enviar()} disabled={enviando || !qtdValida || ((proxima ?? 1) >= 2 && !causaValida)} className={btnPri} style={{ background: 'var(--brand)' }}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enviar contagem
            </button>
          </>
        )}
        {fase === 'decidir' && (
          <>
            {/* Nem reconta nem encerra agora: o item segue "aguardando decisão" no inventário. */}
            <button
              onClick={() => { toast.info('Contagem em aberto: o item fica aguardando decisão neste inventário.'); onClose(); }}
              disabled={enviando}
              className={`${btnSec} sm:mr-auto`}
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              <X className="h-3.5 w-3.5" /> Fechar sem recontar
            </button>
            <button onClick={() => void encerrar()} disabled={enviando || !causaValida} className={btnSec} style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Não, mostrar saldo
            </button>
            <button onClick={() => { setFase('contar'); iniciadaRef.current = new Date().toISOString(); }} disabled={enviando || proxima == null} className={btnPri} style={{ background: 'var(--brand)' }}>
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
                <button aria-label="Trocar foto"
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

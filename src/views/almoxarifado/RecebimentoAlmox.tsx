/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Recebimento de material — hub e os dois formulários da doca.
 *
 * Estrutura igual à da Portaria: um hub com CARDS, cada card abre uma vista
 * dedicada (não uma aba). As vistas:
 *
 *   F1 · Ficha cega de volumes (RCV) — conta caixa/pallet e fotografa a carga
 *        como chegou da transportadora, ANTES de abrir volume.
 *   F2 · Recebimento e contagem (RCM) — puxa o PO, confere item a item com
 *        check, foto e observação; divergência abre uma NCR consolidada.
 *   ·  · Não conformidades — acompanhamento das NCRs abertas.
 *
 * O vínculo entre F1 e F2 é opcional. Serve item de projeto e de consumo no
 * mesmo formulário; a diferença é só o encaminhamento pós-conferência.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, ClipboardCheck, Loader2,
  PackageCheck, Plus, RefreshCw, Search, Truck, X,
} from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../components/ui/Modal';
import { useLightbox } from '../../components/ui/Lightbox';
import { TableEmpty } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { formatDateBR, formatDateTimeBR, formatQtd } from '../../lib/format';
import { localDb } from '../../db/localDb';
import {
  ACCEPT_ANEXO, AnexoInvalidoError, MAX_ANEXOS, type PreparedAttachment,
} from '../../lib/imageCompression';
import { prepararFotoCarimbada } from '../../lib/carimboFoto';
import {
  PREFIXO_RECEB, ROTULO_DIVERGENCIA, classificarDivergencia, cargaDivergente,
  entregaParcialAnterior, pendentePedido, resumoConferencia, tipoNcSugerido,
  type AnexoRecebimento, type DestinoPrevisto, type LinhaConferencia,
  type TipoDivergencia, type TipoEmbalagem,
} from '../../lib/recebimentoAlmox';
import {
  assinarEvidencias, carregarLinhasPedido, editarCarga, editarConferencia, editarNc,
  excluirCarga, excluirConferencia, hojeISO, listarAlteracoes, listarCargas, listarConferencias,
  listarNaoConformidades, listarTransportadorasSugeridas, marcarEncaminhadoProjetos,
  registrarCarga, registrarConferencia, subirEvidencia, atualizarNaoConformidade,
  type AlteracaoRow, type CargaRow, type ConferenciaRow,
  type NaoConformidadeRow, type NcAcao,
} from '../../lib/recebimentoAlmoxApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import type { Profile } from '../../types';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Vista = 'hub' | 'ficha' | 'contagem' | 'nc';

const inputCls =
  'w-full rounded-lg border py-2 px-3 text-xs font-medium focus:outline-2 focus:outline-offset-1 ' +
  'border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';

function Campo({ rotulo, children, erro }: { rotulo: string; children: React.ReactNode; erro?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      {children}
      {erro && <span className="block mt-1 text-[11px] text-rose-500">{erro}</span>}
    </label>
  );
}

const EMBALAGENS: TipoEmbalagem[] = ['caixa', 'pallet', 'fardo', 'amarrado', 'avulso', 'misto'];
const DESTINOS: { id: DestinoPrevisto; rotulo: string }[] = [
  { id: 'indefinido', rotulo: 'Indefinido' },
  { id: 'consumo', rotulo: 'Consumo' },
  { id: 'projeto', rotulo: 'Projeto' },
  { id: 'misto', rotulo: 'Misto' },
];

const FONTE_ROTULO: Record<string, string> = {
  cache_sap: 'Pedido do cache SAP',
  supabase: 'Pedido do servidor',
  manual: 'Digitado à mão',
  sem_pedido: 'Sem pedido',
};

// ===========================================================================
// Hub
// ===========================================================================

export default function RecebimentoAlmox({ user, onNavigate }: Props) {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>('hub');
  const [cargas, setCargas] = useState<CargaRow[]>([]);
  const [conferencias, setConferencias] = useState<ConferenciaRow[]>([]);
  const [ncs, setNcs] = useState<NaoConformidadeRow[]>([]);
  const [transportadoras, setTransportadoras] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<
    | { tipo: 'carga'; registro?: CargaRow }
    | { tipo: 'conferencia'; registro?: ConferenciaRow }
    | null
  >(null);
  const [ncEd, setNcEd] = useState<NaoConformidadeRow | null>(null);
  const [detalhe, setDetalhe] = useState<
    | { tipo: 'carga'; row: CargaRow }
    | { tipo: 'conferencia'; row: ConferenciaRow }
    | { tipo: 'nc'; row: NaoConformidadeRow }
    | null
  >(null);

  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cf, n, t] = await Promise.all([
        listarCargas(), listarConferencias(), listarNaoConformidades(), listarTransportadorasSugeridas(),
      ]);
      setCargas(c);
      setConferencias(cf);
      setNcs(n);
      setTransportadoras(t);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os recebimentos.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const ncAbertas = ncs.filter((n) => n.status !== 'resolvida').length;

  const cards = [
    {
      id: 'ficha' as Vista,
      codigo: PREFIXO_RECEB.carga,
      titulo: 'Ficha cega de volumes',
      desc: 'Contagem cega de caixas/pallets na doca e foto da carga consolidada, antes de abrir volume.',
      icon: Truck,
      cor: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
      badge: `${cargas.length} registrada(s)`,
    },
    {
      id: 'contagem' as Vista,
      codigo: PREFIXO_RECEB.conferencia,
      titulo: 'Recebimento e contagem',
      desc: 'Puxa a lista do pedido e valida quantidade item a item, com check, foto e observação.',
      icon: ClipboardCheck,
      cor: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
      badge: `${conferencias.length} conferência(s)`,
    },
    {
      id: 'nc' as Vista,
      codigo: PREFIXO_RECEB.naoConformidade,
      titulo: 'Não conformidades',
      desc: 'Divergência de quantidade ou avaria abre uma NCR consolidada — acompanhe a tratativa aqui.',
      icon: AlertTriangle,
      cor: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
      badge: `${ncAbertas} aberta(s)`,
    },
  ];

  const voltarAoHub = () => { setVista('hub'); setForm(null); setNcEd(null); setDetalhe(null); };

  const detalheModal = detalhe && (
    <ModalDetalhe
      tipo={detalhe.tipo}
      row={detalhe.row}
      cargas={cargas}
      podeEditar={
        detalhe.tipo === 'nc' ? true : podeEditarFormulario(user, detalhe.row as CargaRow | ConferenciaRow)
      }
      onEditar={() => {
        if (detalhe.tipo === 'carga') setForm({ tipo: 'carga', registro: detalhe.row });
        else if (detalhe.tipo === 'conferencia') setForm({ tipo: 'conferencia', registro: detalhe.row });
        else setNcEd(detalhe.row);
        setDetalhe(null);
      }}
      onClose={() => setDetalhe(null)}
    />
  );

  if (vista === 'ficha') {
    return (
      <>
        <VistaFichaCega
          cargas={cargas}
          loading={loading}
          podeEditar={(row) => podeEditarFormulario(user, row)}
          onVoltar={voltarAoHub}
          onNova={() => setForm({ tipo: 'carga' })}
          onEditar={(row) => setForm({ tipo: 'carga', registro: row })}
          onAbrir={(row) => setDetalhe({ tipo: 'carga', row })}
          onRecarregar={recarregar}
          onExcluir={async (id, codigo) => {
            if (!window.confirm(`Excluir a ficha cega ${codigo}? Sai da tela, mas permanece no banco.`)) return;
            try { await excluirCarga(id, user.id); toast.success(`${codigo} excluída.`); await recarregar(); }
            catch (err: any) { toast.error(err?.message || 'Falha ao excluir.'); }
          }}
        />
        {form?.tipo === 'carga' && (
          <ModalFichaCega
            user={user}
            transportadoras={transportadoras}
            registro={form.registro}
            onClose={() => setForm(null)}
            onSalvo={async () => { setForm(null); await recarregar(); }}
          />
        )}
        {detalheModal}
      </>
    );
  }

  if (vista === 'contagem') {
    return (
      <>
        <VistaContagem
          conferencias={conferencias}
          loading={loading}
          podeEditar={(row) => podeEditarFormulario(user, row)}
          onVoltar={voltarAoHub}
          onNova={() => setForm({ tipo: 'conferencia' })}
          onEditar={(row) => setForm({ tipo: 'conferencia', registro: row })}
          onAbrir={(row) => setDetalhe({ tipo: 'conferencia', row })}
          onRecarregar={recarregar}
          onEncaminhar={async (c) => {
            try {
              await marcarEncaminhadoProjetos(c.id);
              toast.success('Marcado. Abrindo a entrada de NF do módulo Projetos…');
              await recarregar();
              onNavigate('/almoxarifado/projetos/recebimento');
            } catch (err: any) {
              toast.error(err?.message || 'Falha ao marcar o encaminhamento.');
            }
          }}
          onExcluir={async (id, codigo) => {
            if (!window.confirm(`Excluir a conferência ${codigo}? Sai da tela, mas permanece no banco.`)) return;
            try { await excluirConferencia(id, user.id); toast.success(`${codigo} excluída.`); await recarregar(); }
            catch (err: any) { toast.error(err?.message || 'Falha ao excluir.'); }
          }}
        />
        {form?.tipo === 'conferencia' && (
          <ModalConferencia
            user={user}
            cargas={cargas}
            registro={form.registro}
            onClose={() => setForm(null)}
            onSalvo={async () => { setForm(null); await recarregar(); }}
          />
        )}
        {detalheModal}
      </>
    );
  }

  if (vista === 'nc') {
    return (
      <>
        <VistaNaoConformidades
          ncs={ncs}
          loading={loading}
          onVoltar={voltarAoHub}
          onRecarregar={recarregar}
          onAbrir={(row) => setDetalhe({ tipo: 'nc', row })}
          onEditar={(row) => setNcEd(row)}
          onStatus={async (id, status) => {
            try { await atualizarNaoConformidade(id, { status }, { id: user.id, nome: user.name }); await recarregar(); }
            catch (err: any) { toast.error(err?.message || 'Falha ao atualizar a NCR.'); }
          }}
        />
        {ncEd && (
          <ModalNc
            user={user}
            nc={ncEd}
            onClose={() => setNcEd(null)}
            onSalvo={async () => { setNcEd(null); await recarregar(); }}
          />
        )}
        {detalheModal}
      </>
    );
  }

  // Hub — cards
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <button
          type="button"
          onClick={() => onNavigate('/formularios')}
          className="group mb-3 inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all hover:opacity-90 active:scale-95"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para Módulos de Formulários</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <PackageCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ink-primary)' }}>Recebimento de material</h1>
            <p className="text-xs font-medium" style={{ color: 'var(--ink-muted)' }}>
              Ficha cega na doca · conferência contra o pedido na bancada · divergência vira NCR.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setVista(card.id)}
              className="group flex flex-col items-start justify-between rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
            >
              <div className="w-full">
                <div className="flex w-full items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.cor}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold" style={{ background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)', color: 'var(--ink-muted)' }}>
                    {card.codigo}
                  </span>
                </div>
                <h3 className="mt-3.5 text-base font-bold" style={{ color: 'var(--ink-primary)' }}>{card.titulo}</h3>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{card.desc}</p>
              </div>
              <div className="mt-5 flex w-full items-center justify-between border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>{card.badge}</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold transition-transform group-hover:translate-x-1" style={{ color: 'var(--brand)' }}>
                  Acessar <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Casca de vista — cabeçalho com "Voltar" + ação
// ===========================================================================

function VistaShell({
  titulo, subtitulo, onVoltar, onRecarregar, acao, children,
}: {
  titulo: string;
  subtitulo: string;
  onVoltar: () => void;
  onRecarregar: () => void;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onVoltar}
            className="group mb-2 inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Voltar para Recebimento de Material
          </button>
          <h1 className="text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>{titulo}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRecarregar}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
          {acao}
        </div>
      </div>
      {children}
    </div>
  );
}

function BotaoNovo({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95"
      style={{ background: 'var(--brand)' }}
    >
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

function CardBase({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border p-3 ${onClick ? 'cursor-pointer transition-colors hover:border-[var(--brand)]' : ''}`}
      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
    >
      {children}
    </div>
  );
}

/** Botão de ação num cartão clicável — não dispara o clique do cartão. */
function AcaoCard({ onClick, cor, children }: { onClick: () => void; cor: string; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-[11px] font-bold cursor-pointer hover:underline"
      style={{ color: cor }}
    >
      {children}
    </button>
  );
}

// ===========================================================================
// Vista — Ficha cega
// ===========================================================================

function VistaFichaCega({
  cargas, loading, podeEditar, onVoltar, onNova, onEditar, onAbrir, onRecarregar, onExcluir,
}: {
  cargas: CargaRow[];
  loading: boolean;
  podeEditar: (row: CargaRow) => boolean;
  onVoltar: () => void;
  onNova: () => void;
  onEditar: (row: CargaRow) => void;
  onAbrir: (row: CargaRow) => void;
  onRecarregar: () => void;
  onExcluir: (id: string, codigo: string) => void;
}) {
  return (
    <VistaShell
      titulo="Ficha cega de volumes"
      subtitulo="Toque num cartão para ver o preenchimento e o log. Só quem abriu (ou admin) edita; excluir tira da tela e mantém no banco."
      onVoltar={onVoltar}
      onRecarregar={onRecarregar}
      acao={<BotaoNovo onClick={onNova}>Nova ficha cega</BotaoNovo>}
    >
      {loading && <div className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}
      {!loading && !cargas.length && (
        <TableEmpty icon={Truck} title="Nenhuma carga registrada" hint="A ficha cega é a contagem de volumes na doca, antes de abrir caixa." />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {cargas.map((c) => (
          <CardBase key={c.id} onClick={() => onAbrir(c)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                  {c.codigo}
                  {c.evidencias.length > 0 && <Camera className="inline ml-1.5 h-3 w-3" style={{ color: 'var(--ink-muted)' }} />}
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--ink-secondary)' }}>
                  {c.transportadora}{c.veiculo_placa ? ` · ${c.veiculo_placa}` : ''}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={c.divergencia
                  ? { background: 'color-mix(in srgb, var(--status-critical) 14%, transparent)', color: 'var(--status-critical)' }
                  : { background: 'color-mix(in srgb, var(--ink-muted) 12%, transparent)', color: 'var(--ink-muted)' }}
              >
                {c.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <span>{formatDateBR(c.data)}</span>
              <span className="tabular-nums">
                {c.qtd_volumes_contada} vol.
                {c.qtd_volumes_declarada != null && c.qtd_volumes_declarada !== c.qtd_volumes_contada
                  ? ` (declarado ${c.qtd_volumes_declarada})` : ''}
              </span>
            </div>
            {(c.avaria_aparente || c.observacao) && (
              <p className="mt-1.5 text-[11px] italic" style={{ color: c.avaria_aparente ? 'var(--status-critical)' : 'var(--ink-muted)' }}>
                {c.avaria_aparente ? `Avaria: ${c.avaria_descricao || 'sinalizada'}` : c.observacao}
              </p>
            )}
            <div className="mt-2 flex items-center justify-end gap-3">
              <AcaoCard onClick={() => onAbrir(c)} cor="var(--ink-muted)">Detalhes</AcaoCard>
              {podeEditar(c) && (
                <>
                  <AcaoCard onClick={() => onEditar(c)} cor="var(--brand)">Editar</AcaoCard>
                  <AcaoCard onClick={() => onExcluir(c.id, c.codigo)} cor="var(--status-critical)">Excluir</AcaoCard>
                </>
              )}
            </div>
          </CardBase>
        ))}
      </div>
    </VistaShell>
  );
}

// ===========================================================================
// Vista — Recebimento e contagem
// ===========================================================================

function VistaContagem({
  conferencias, loading, podeEditar, onVoltar, onNova, onEditar, onAbrir, onRecarregar, onEncaminhar, onExcluir,
}: {
  conferencias: ConferenciaRow[];
  loading: boolean;
  podeEditar: (row: ConferenciaRow) => boolean;
  onVoltar: () => void;
  onNova: () => void;
  onEditar: (row: ConferenciaRow) => void;
  onAbrir: (row: ConferenciaRow) => void;
  onRecarregar: () => void;
  onEncaminhar: (c: ConferenciaRow) => void;
  onExcluir: (id: string, codigo: string) => void;
}) {
  return (
    <VistaShell
      titulo="Recebimento e contagem"
      subtitulo="Vários POs cabem numa conferência. Toque no cartão para ver o preenchimento e o log. Divergência abre uma NCR."
      onVoltar={onVoltar}
      onRecarregar={onRecarregar}
      acao={<BotaoNovo onClick={onNova}>Nova conferência</BotaoNovo>}
    >
      {loading && <div className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}
      {!loading && !conferencias.length && (
        <TableEmpty icon={ClipboardCheck} title="Nenhuma conferência" hint="Informe o número do pedido e valide as quantidades item a item." />
      )}

      <div className="space-y-2">
        {conferencias.map((c) => {
          const pos = c.pedidos?.length ? c.pedidos : c.nro_pedido ? [c.nro_pedido] : [];
          return (
          <CardBase key={c.id} onClick={() => onAbrir(c)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                  {c.codigo}
                  <span className="ml-2 font-medium" style={{ color: 'var(--ink-muted)' }}>
                    {pos.length ? `PO ${pos.join(' · ')}` : 'sem PO'}
                  </span>
                </p>
                <p className="text-[11px] truncate" style={{ color: 'var(--ink-secondary)' }}>
                  {c.fornecedor || '—'} · {formatDateBR(c.data)} · {c.tipo_item}
                </p>
              </div>
              {c.tem_nc && (
                <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white" style={{ background: 'var(--status-critical)' }}>
                  <AlertTriangle className="h-3 w-3" /> NCR
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
              <span>{c.total_itens} itens</span>
              <StatusChip texto={`${c.itens_ok} ok`} tom="ok" />
              {c.itens_divergentes > 0 && <StatusChip texto={`${c.itens_divergentes} diverg.`} tom="alerta" />}
              <span className="ml-1">{FONTE_ROTULO[c.fonte_pedido] ?? c.fonte_pedido}</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
              {c.tipo_item !== 'consumo' && !c.encaminhado_projetos && (
                <AcaoCard onClick={() => onEncaminhar(c)} cor="var(--brand)">Registrar entrada em Projetos →</AcaoCard>
              )}
              {c.encaminhado_projetos && (
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>encaminhado a Projetos</span>
              )}
              <AcaoCard onClick={() => onAbrir(c)} cor="var(--ink-muted)">Detalhes</AcaoCard>
              {podeEditar(c) && (
                <>
                  <AcaoCard onClick={() => onEditar(c)} cor="var(--brand)">Editar</AcaoCard>
                  <AcaoCard onClick={() => onExcluir(c.id, c.codigo)} cor="var(--status-critical)">Excluir</AcaoCard>
                </>
              )}
            </div>
          </CardBase>
          );
        })}
      </div>
    </VistaShell>
  );
}

// ===========================================================================
// Vista — Não conformidades
// ===========================================================================

function VistaNaoConformidades({
  ncs, loading, onVoltar, onRecarregar, onAbrir, onEditar, onStatus,
}: {
  ncs: NaoConformidadeRow[];
  loading: boolean;
  onVoltar: () => void;
  onRecarregar: () => void;
  onAbrir: (row: NaoConformidadeRow) => void;
  onEditar: (row: NaoConformidadeRow) => void;
  onStatus: (id: string, status: 'aberta' | 'em_tratativa' | 'resolvida') => void;
}) {
  return (
    <VistaShell
      titulo="Não conformidades de recebimento"
      subtitulo="Aberta quando a conferência acusa divergência. Toque para ver a tratativa e o log; Editar registra ação e foto."
      onVoltar={onVoltar}
      onRecarregar={onRecarregar}
    >
      {loading && <div className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}
      {!loading && !ncs.length && (
        <TableEmpty icon={Check} title="Nenhuma não conformidade" hint="Uma NCR é aberta automaticamente quando a conferência acusa divergência." />
      )}
      <div className="space-y-2">
        {ncs.map((n) => (
          <CardBase key={n.id} onClick={() => onAbrir(n)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                  {n.codigo}
                  <StatusChip
                    texto={n.status.replace('_', ' ')}
                    tom={n.status === 'resolvida' ? 'ok' : n.status === 'em_tratativa' ? 'atencao' : 'alerta'}
                  />
                  {n.severidade === 'alta' && <StatusChip texto="alta" tom="alerta" />}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  {n.fornecedor || '—'}{n.nro_pedido ? ` · PO ${n.nro_pedido}` : ''} · {n.tipo}
                </p>
              </div>
              <select
                value={n.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); onStatus(n.id, e.target.value as any); }}
                className="shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold cursor-pointer"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}
              >
                <option value="aberta">Aberta</option>
                <option value="em_tratativa">Em tratativa</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--ink-secondary)' }}>{n.descricao}</p>
            {Array.isArray(n.itens_resumo) && n.itens_resumo.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {n.itens_resumo.map((it: any, i: number) => (
                  <li key={i} className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                    {it.material_code} {it.descricao} — {it.tipo_divergencia}: recebido {formatQtd(it.qtd_recebida)}
                    {it.qtd_pedido != null ? ` de ${formatQtd(it.qtd_pedido)}` : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-end gap-3">
              {(n.acoes?.length ?? 0) > 0 && (
                <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{n.acoes.length} ação(ões)</span>
              )}
              <AcaoCard onClick={() => onAbrir(n)} cor="var(--ink-muted)">Detalhes</AcaoCard>
              <AcaoCard onClick={() => onEditar(n)} cor="var(--brand)">Editar</AcaoCard>
            </div>
          </CardBase>
        ))}
      </div>
    </VistaShell>
  );
}

// ===========================================================================
// Modal — Detalhamento (preenchimento + log no fim)
// ===========================================================================

const ROTULO_CAMPO: Record<string, string> = {
  data: 'Data', hora: 'Hora', transportadora: 'Transportadora', veiculo_placa: 'Placa',
  motorista: 'Motorista', doc_transporte: 'CT-e / canhoto', nota_fiscal: 'Nota fiscal',
  nro_pedido: 'PO', qtd_volumes_declarada: 'Volumes declarados', qtd_volumes_contada: 'Volumes contados',
  tipo_embalagem: 'Embalagem', lacre_integro: 'Lacre íntegro', avaria_aparente: 'Avaria aparente',
  avaria_descricao: 'Descrição da avaria', peso_declarado: 'Peso declarado', destino_previsto: 'Destino',
  observacao: 'Observação', evidencias: 'Fotos', fornecedor: 'Fornecedor', rm: 'RM',
  deposito: 'Depósito', tipo_item: 'Tipo de item', itens: 'Itens', status: 'Status',
  severidade: 'Severidade', responsavel: 'Responsável', descricao: 'Descrição', tipo: 'Tipo',
  resolucao: 'Resolução', acao: 'Ação registrada',
};

/** Linha rótulo + valor da folha de detalhamento. Esconde valores vazios. */
function DetLinha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  if (valor === null || valor === undefined || valor === '' || valor === '—') return null;
  return (
    <div className="flex gap-3 py-1 text-xs">
      <span className="w-36 shrink-0 font-bold" style={{ color: 'var(--ink-muted)' }}>{rotulo}</span>
      <span style={{ color: 'var(--ink-primary)' }}>{valor}</span>
    </div>
  );
}

/**
 * Evidências do bucket (URL assinada), abertas SEMPRE no visualizador do app.
 * `compacto`: só um ícone com a contagem (para linhas de item). Senão, tiras.
 */
function FotosAssinadas({
  paths, titulo, compacto, legenda, onAbrir,
}: {
  paths: string[];
  titulo?: string;
  compacto?: boolean;
  legenda?: string;
  onAbrir: (imgs: { url: string; legenda?: string }[], i: number) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (paths.length) assinarEvidencias(paths).then(setUrls).catch(() => setUrls({}));
  }, [paths.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!paths.length) return null;

  const imgs = paths.map((p) => ({ url: urls[p], legenda }));
  const abrir = (i: number) => onAbrir(imgs.filter((x) => x.url), i);

  if (compacto) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); abrir(0); }}
        className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold cursor-pointer hover:opacity-80"
        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        title="Ver fotos"
      >
        <Camera className="h-3 w-3" /> {paths.length}
      </button>
    );
  }

  return (
    <div>
      {titulo && <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{titulo}</p>}
      <div className="flex flex-wrap gap-2">
        {paths.map((p, i) => (
          <button
            key={p}
            onClick={(e) => { e.stopPropagation(); abrir(i); }}
            className="block h-16 w-16 overflow-hidden rounded-lg border cursor-pointer hover:opacity-80"
            style={{ borderColor: 'var(--hairline)', background: 'var(--hairline)' }}
          >
            {urls[p]
              ? <img src={urls[p]} alt="evidência" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center"><Camera className="h-4 w-4 opacity-30" /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Log de alterações do registro — sempre no fim da janela de detalhe. */
function LogAlteracoes({ entidade, entidadeId }: { entidade: 'carga' | 'conferencia' | 'nc'; entidadeId: string }) {
  const [linhas, setLinhas] = useState<AlteracaoRow[] | null>(null);
  useEffect(() => {
    listarAlteracoes(entidade, entidadeId).then(setLinhas).catch(() => setLinhas([]));
  }, [entidade, entidadeId]);
  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
        Log de alterações
      </p>
      {linhas === null && <div className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--hairline)' }} />}
      {linhas?.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Sem edições — está como foi criado.</p>
      )}
      <ul className="space-y-2">
        {(linhas ?? []).map((a) => (
          <li key={a.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>{a.alterado_por_nome || '—'}</span>
              <span>{formatDateTimeBR(a.created_at)}</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {a.alteracoes.map((m, i) => (
                <li key={i} className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                  <span className="font-bold">{ROTULO_CAMPO[m.campo] ?? m.campo}:</span>{' '}
                  <span style={{ color: 'var(--ink-muted)' }}>{m.de || '∅'}</span> → <span>{m.para || '∅'}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Chip de status do módulo. Usa a escala reservada `--status-*` de
 * `tokens.css` (good / warning-serious / critical) — não a rampa ABC, que
 * é toda azul. Sempre com rótulo; ícone fica a cargo de quem usa.
 */
type TomChip = 'ok' | 'atencao' | 'alerta' | 'neutro';

const COR_CHIP: Record<TomChip, { token: string; mix: number }> = {
  ok: { token: 'var(--status-good)', mix: 14 },
  atencao: { token: 'var(--status-serious)', mix: 16 },
  alerta: { token: 'var(--status-critical)', mix: 14 },
  neutro: { token: 'var(--ink-muted)', mix: 12 },
};

function StatusChip({ texto, tom }: { texto: string; tom: TomChip }) {
  const c = COR_CHIP[tom];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${c.token} ${c.mix}%, transparent)`, color: c.token }}
    >
      {texto}
    </span>
  );
}

const TOM_STATUS_NC: Record<string, TomChip> = {
  aberta: 'alerta', em_tratativa: 'atencao', resolvida: 'ok',
};

function ModalDetalhe({
  tipo, row, cargas, podeEditar, onEditar, onClose,
}: {
  tipo: 'carga' | 'conferencia' | 'nc';
  row: CargaRow | ConferenciaRow | NaoConformidadeRow;
  cargas: CargaRow[];
  podeEditar: boolean;
  onEditar: () => void;
  onClose: () => void;
}) {
  const lb = useLightbox();
  const codigo = (row as any).codigo as string;

  const geralPaths = ((row as any).evidencias as AnexoRecebimento[] | undefined)?.map((e) => e.path) ?? [];

  return (
    <>
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel={`Detalhes de ${codigo}`}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>{codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>Preenchimento do registro. O log fica no fim.</p>
      </ModalHeader>
      <ModalBody>
        {tipo === 'carga' && (() => {
          const c = row as CargaRow;
          return (
            <div className="space-y-3">
              <div>
                <DetLinha rotulo="Data" valor={formatDateBR(c.data)} />
                <DetLinha rotulo="Transportadora" valor={c.transportadora} />
                <DetLinha rotulo="Placa" valor={c.veiculo_placa} />
                <DetLinha rotulo="Motorista" valor={c.motorista} />
                <DetLinha rotulo="CT-e / canhoto" valor={c.doc_transporte} />
                <DetLinha rotulo="Nota fiscal" valor={c.nota_fiscal} />
                <DetLinha rotulo="PO" valor={c.nro_pedido} />
                <DetLinha rotulo="Volumes contados" valor={c.qtd_volumes_contada} />
                <DetLinha rotulo="Volumes declarados" valor={c.qtd_volumes_declarada} />
                <DetLinha rotulo="Embalagem" valor={c.tipo_embalagem} />
                <DetLinha rotulo="Lacre íntegro" valor={c.lacre_integro == null ? '' : c.lacre_integro ? 'Sim' : 'Não'} />
                <DetLinha rotulo="Avaria aparente" valor={c.avaria_aparente ? (c.avaria_descricao || 'Sim') : ''} />
                <DetLinha rotulo="Peso declarado" valor={c.peso_declarado} />
                <DetLinha rotulo="Destino" valor={c.destino_previsto} />
                <DetLinha rotulo="Status" valor={<StatusChip texto={c.status} tom={c.divergencia ? 'alerta' : 'neutro'} />} />
                <DetLinha rotulo="Observação" valor={c.observacao} />
                <DetLinha rotulo="Criado por" valor={c.criado_por_nome} />
              </div>
              <FotosAssinadas paths={geralPaths} titulo="Fotos da carga" legenda={c.codigo} onAbrir={lb.abrir} />
              <LogAlteracoes entidade="carga" entidadeId={c.id} />
            </div>
          );
        })()}

        {tipo === 'conferencia' && (() => {
          const c = row as ConferenciaRow;
          const pos = c.pedidos?.length ? c.pedidos : c.nro_pedido ? [c.nro_pedido] : [];
          const carga = c.carga_id ? cargas.find((x) => x.id === c.carga_id) : null;
          return (
            <div className="space-y-3">
              <div>
                <DetLinha rotulo="Data" valor={formatDateBR(c.data)} />
                <DetLinha rotulo="Pedidos (PO)" valor={pos.join(' · ')} />
                <DetLinha rotulo="Fornecedor" valor={c.fornecedor} />
                <DetLinha rotulo="RM" valor={c.rm} />
                <DetLinha rotulo="Depósito" valor={c.deposito} />
                <DetLinha rotulo="Tipo de item" valor={c.tipo_item} />
                <DetLinha rotulo="Ficha cega" valor={carga?.codigo} />
                <DetLinha rotulo="Origem da lista" valor={FONTE_ROTULO[c.fonte_pedido] ?? c.fonte_pedido} />
                <DetLinha
                  rotulo="Resumo"
                  valor={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span>{c.total_itens} itens</span>
                      <StatusChip texto={`${c.itens_ok} ok`} tom="ok" />
                      {c.itens.some((it) => it.parcial) && (
                        <StatusChip texto={`${c.itens.filter((it) => it.parcial).length} parcial`} tom="atencao" />
                      )}
                      {c.itens_divergentes > 0 && <StatusChip texto={`${c.itens_divergentes} divergentes`} tom="alerta" />}
                    </span>
                  }
                />
                <DetLinha rotulo="Observação" valor={c.observacao} />
                <DetLinha rotulo="Criado por" valor={c.criado_por_nome} />
              </div>

              <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                {c.itens.map((it, i) => {
                  const paths = (it.evidencias ?? []).map((e) => e.path);
                  const pend = pendentePedido(it.qtd_pedido ?? null, it.qtd_ja_fornecida ?? null);
                  const parcialAnt = entregaParcialAnterior(it.qtd_pedido ?? null, it.qtd_ja_fornecida ?? null);
                  const amberParcial = it.parcial && !it.divergencia;
                  const okVerde = it.conferido && !it.divergencia && !it.parcial;
                  return (
                    <div
                      key={i}
                      className="border-b p-2.5 last:border-b-0"
                      style={{
                        borderColor: 'var(--hairline)',
                        borderLeft: `3px solid ${it.divergencia ? 'var(--status-critical)' : amberParcial ? 'var(--status-serious)' : okVerde ? 'var(--status-good)' : 'transparent'}`,
                        background: it.divergencia ? 'color-mix(in srgb, var(--status-critical) 8%, transparent)' : amberParcial ? 'color-mix(in srgb, var(--status-serious) 10%, transparent)' : okVerde ? 'color-mix(in srgb, var(--status-good) 8%, transparent)' : undefined,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                          {it.material_code}{it.nro_pedido ? ` · PO ${it.nro_pedido}` : ''}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {paths.length > 0 && (
                            <FotosAssinadas paths={paths} compacto legenda={`${it.material_code} — ${c.codigo}`} onAbrir={lb.abrir} />
                          )}
                          {it.divergencia && it.tipo_divergencia && (
                            <StatusChip texto={ROTULO_DIVERGENCIA[it.tipo_divergencia as TipoDivergencia] ?? it.tipo_divergencia} tom="alerta" />
                          )}
                          {amberParcial && <StatusChip texto="parcial" tom="atencao" />}
                          {okVerde && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold uppercase" style={{ color: 'var(--status-good)' }}>
                              <Check className="h-3 w-3" /> conferido
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{it.descricao}</p>
                      {parcialAnt && (
                        <p className="mt-0.5 text-[10px] font-bold tabular-nums" style={{ color: 'var(--status-serious)' }}>
                          entrega parcial no PO — já recebido {formatQtd(parcialAnt.jaRecebido)} de {formatQtd(it.qtd_pedido ?? 0)}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                        recebido {formatQtd(it.qtd_recebida)} {it.unidade}
                        {it.qtd_pedido != null ? ` · pendente era ${formatQtd(pend)}` : ''}
                      </p>
                      {it.observacao && <p className="text-[11px] italic" style={{ color: 'var(--ink-muted)' }}>{it.observacao}</p>}
                    </div>
                  );
                })}
              </div>

              <FotosAssinadas paths={geralPaths} titulo="Foto geral do recebimento" legenda={c.codigo} onAbrir={lb.abrir} />
              <LogAlteracoes entidade="conferencia" entidadeId={c.id} />
            </div>
          );
        })()}

        {tipo === 'nc' && (() => {
          const n = row as NaoConformidadeRow;
          return (
            <div className="space-y-3">
              <div>
                <DetLinha rotulo="Status" valor={<StatusChip texto={n.status.replace('_', ' ')} tom={TOM_STATUS_NC[n.status] ?? 'neutro'} />} />
                <DetLinha rotulo="Severidade" valor={<StatusChip texto={n.severidade} tom={n.severidade === 'alta' ? 'alerta' : n.severidade === 'media' ? 'atencao' : 'neutro'} />} />
                <DetLinha rotulo="Tipo" valor={n.tipo} />
                <DetLinha rotulo="Fornecedor" valor={n.fornecedor} />
                <DetLinha rotulo="PO" valor={n.nro_pedido} />
                <DetLinha rotulo="Responsável" valor={n.responsavel} />
                <DetLinha rotulo="Descrição" valor={n.descricao} />
                <DetLinha rotulo="Resolução" valor={n.resolucao} />
                <DetLinha rotulo="Resolvida em" valor={n.resolvida_em ? formatDateTimeBR(n.resolvida_em) : ''} />
              </div>

              {Array.isArray(n.itens_resumo) && n.itens_resumo.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Itens divergentes</p>
                  <ul className="space-y-1">
                    {n.itens_resumo.map((it: any, i: number) => (
                      <li
                        key={i}
                        className="rounded-md p-2 text-[11px] tabular-nums"
                        style={{ borderLeft: '3px solid var(--status-critical)', background: 'color-mix(in srgb, var(--status-critical) 8%, transparent)', color: 'var(--ink-secondary)' }}
                      >
                        <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{it.material_code}</span> {it.descricao}
                        {' — '}
                        <span className="font-bold" style={{ color: 'var(--status-critical)' }}>{it.tipo_divergencia}</span>
                        {`: recebido ${formatQtd(it.qtd_recebida)}${it.qtd_pedido != null ? ` de ${formatQtd(it.qtd_pedido)}` : ''}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(n.acoes?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Ações da tratativa</p>
                  <ul className="space-y-2">
                    {n.acoes.map((a: NcAcao, i: number) => (
                      <li key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
                        <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                          <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>{a.por_nome || '—'}</span>
                          <span>{formatDateTimeBR(a.em)}</span>
                        </div>
                        {a.texto && <p className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-primary)' }}>{a.texto}</p>}
                        {(a.evidencias?.length ?? 0) > 0 && (
                          <div className="mt-1.5"><FotosAssinadas paths={a.evidencias.map((e) => e.path)} legenda={`Ação — ${n.codigo}`} onAbrir={lb.abrir} /></div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <FotosAssinadas paths={geralPaths} titulo="Fotos da NCR" legenda={n.codigo} onAbrir={lb.abrir} />
              <LogAlteracoes entidade="nc" entidadeId={n.id} />
            </div>
          );
        })()}
      </ModalBody>
      <ModalFooter>
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Fechar
        </button>
        {podeEditar && (
          <button onClick={onEditar} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white" style={{ background: 'var(--brand)' }}>
            Editar
          </button>
        )}
      </ModalFooter>
    </Modal>
    {lb.elemento}
    </>
  );
}

// ===========================================================================
// Galeria de fotos (input) — regra 1 do CLAUDE.md: comprime antes de subir
// ===========================================================================

function GaleriaFotos({
  arquivos, setArquivos, max = MAX_ANEXOS,
}: {
  arquivos: PreparedAttachment[];
  setArquivos: React.Dispatch<React.SetStateAction<PreparedAttachment[]>>;
  max?: number;
}) {
  const toast = useToast();
  const anexar = async (lista: FileList | null) => {
    if (!lista?.length) return;
    const restante = max - arquivos.length;
    if (restante <= 0) { toast.error(`Máximo de ${max} fotos.`); return; }
    for (const file of Array.from(lista).slice(0, restante)) {
      try {
        const preparado = await prepararFotoCarimbada(file);
        setArquivos((a) => [...a, preparado]);
      } catch (err) {
        toast.error(err instanceof AnexoInvalidoError ? err.message : 'Não foi possível anexar.');
      }
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {arquivos.map((a, i) => (
        <div key={i} className="relative">
          <img src={a.previewUrl} alt={a.name} className="h-16 w-16 rounded-lg border object-cover" style={{ borderColor: 'var(--hairline)' }} />
          <button
            onClick={() => { URL.revokeObjectURL(a.previewUrl); setArquivos((x) => x.filter((_, j) => j !== i)); }}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-500 p-0.5 text-white cursor-pointer"
            aria-label="Remover foto"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {arquivos.length < max && (
        <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed hover:opacity-70" style={{ borderColor: 'var(--hairline)' }}>
          <Camera className="h-5 w-5" style={{ color: 'var(--ink-muted)' }} />
          <input type="file" accept={ACCEPT_ANEXO} capture="environment" multiple hidden onChange={(e) => { void anexar(e.target.files); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}

async function subirTodas(arquivos: PreparedAttachment[], codigo: string) {
  const out = [];
  for (const a of arquivos) out.push(await subirEvidencia(a, codigo));
  return out;
}

// ===========================================================================
// Modal — F1 Ficha cega
// ===========================================================================

/** A ficha cega registra a carga inteira: várias fotos são o esperado. */
const MAX_FOTOS_FICHA = 24;
/** Campos de texto da ficha cega ficam sempre em MAIÚSCULAS. */
const UP = (s: string) => s.toUpperCase();
const SO_DIGITOS = (s: string) => s.replace(/\D/g, '');

function ModalFichaCega({
  user, transportadoras, registro, onClose, onSalvo,
}: {
  user: Profile;
  transportadoras: string[];
  registro?: CargaRow;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const ed = registro;
  const numTxt = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState(ed?.data ?? hojeISO());
  const [transportadora, setTransportadora] = useState(ed?.transportadora ?? '');
  const [placa, setPlaca] = useState(ed?.veiculo_placa ?? '');
  const [motorista, setMotorista] = useState(ed?.motorista ?? '');
  const [docTransporte, setDocTransporte] = useState(ed?.doc_transporte ?? '');
  const [notaFiscal, setNotaFiscal] = useState(ed?.nota_fiscal ?? '');
  const [nroPedido, setNroPedido] = useState(ed?.nro_pedido ?? '');
  const [declarada, setDeclarada] = useState(numTxt(ed?.qtd_volumes_declarada));
  const [contada, setContada] = useState(ed ? String(ed.qtd_volumes_contada) : '');
  const [embalagem, setEmbalagem] = useState<TipoEmbalagem | ''>(ed?.tipo_embalagem ?? '');
  const [lacre, setLacre] = useState(ed?.lacre_integro ?? true);
  const [avaria, setAvaria] = useState(ed?.avaria_aparente ?? false);
  const [avariaDesc, setAvariaDesc] = useState(ed?.avaria_descricao ?? '');
  const [pesoDecl, setPesoDecl] = useState(numTxt(ed?.peso_declarado));
  const [destino, setDestino] = useState<DestinoPrevisto>(ed?.destino_previsto ?? 'indefinido');
  const [observacao, setObservacao] = useState(ed?.observacao ?? '');
  const [fotos, setFotos] = useState<PreparedAttachment[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const fotosExistentes = ed?.evidencias.length ?? 0;

  const contadaNum = Number(contada.replace(',', '.'));
  const declaradaNum = declarada.trim() ? Number(declarada.replace(',', '.')) : null;
  const diverge = Number.isFinite(contadaNum) && cargaDivergente({
    qtdVolumesDeclarada: declaradaNum,
    qtdVolumesContada: contadaNum,
    avariaAparente: avaria,
  });

  const salvar = async () => {
    const e: Record<string, string> = {};
    if (!transportadora.trim()) e.transportadora = 'Informe a transportadora.';
    if (!(contadaNum >= 0) || !contada.trim()) e.contada = 'Conte os volumes.';
    if (avaria && !avariaDesc.trim()) e.avaria = 'Descreva a avaria aparente.';
    setErros(e);
    const primeiro = Object.values(e)[0];
    if (primeiro) { toast.error(primeiro); return; }

    setSalvando(true);
    try {
      const codigoTmp = ed ? ed.codigo : `${PREFIXO_RECEB.carga}-${data}`;
      const novasFotos = await subirTodas(fotos, codigoTmp);
      const campos = {
        data,
        transportadora: transportadora.trim(),
        veiculo_placa: placa.trim().toUpperCase() || null,
        motorista: motorista.trim() || null,
        doc_transporte: docTransporte.trim() || null,
        nota_fiscal: notaFiscal.trim() || null,
        nro_pedido: nroPedido.trim() || null,
        qtd_volumes_declarada: declaradaNum,
        qtd_volumes_contada: Math.round(contadaNum),
        tipo_embalagem: embalagem || null,
        lacre_integro: lacre,
        avaria_aparente: avaria,
        avaria_descricao: avaria ? avariaDesc.trim() : null,
        peso_declarado: pesoDecl.trim() ? Number(pesoDecl.replace(',', '.')) : null,
        destino_previsto: destino,
        observacao: observacao.trim() || null,
      };

      if (ed) {
        const { alteracoes } = await editarCarga(
          ed.id,
          { ...campos, evidencias: [...ed.evidencias, ...novasFotos] },
          { id: user.id, nome: user.name },
        );
        toast.success(alteracoes ? `${ed.codigo}: ${alteracoes} campo(s) atualizado(s).` : `${ed.codigo}: nada mudou.`);
      } else {
        const { codigo, divergencia } = await registrarCarga({
          ...campos,
          evidencias: novasFotos,
          criado_por_id: user.id,
          criado_por_nome: user.name,
        });
        toast.success(`Ficha cega ${codigo} registrada.${divergencia ? ' Sinalizada como divergente.' : ''}`);
      }
      fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar a ficha cega.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={() => !salvando && onClose()} maxWidth="max-w-2xl" ariaLabel={ed ? `Editar ${ed.codigo}` : 'Nova ficha cega de volumes'} disableOutsideClose>
      <ModalHeader onClose={() => !salvando && onClose()}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          {ed ? `Editar ficha cega — ${ed.codigo}` : 'Ficha cega de volumes'}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          {ed ? 'As alterações ficam registradas no histórico do registro.' : 'Conte os volumes e fotografe a carga inteira. Não abra caixa aqui.'}
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <datalist id="receb-transportadoras">
            {transportadoras.map((t) => <option key={t} value={t} />)}
          </datalist>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} /></Campo>
            <Campo rotulo="Transportadora" erro={erros.transportadora}>
              <input
                list="receb-transportadoras"
                value={transportadora}
                onChange={(e) => setTransportadora(UP(e.target.value))}
                className={`${inputCls} uppercase`}
                placeholder="Escolha ou digite — entra na lista"
              />
            </Campo>
            <Campo rotulo="Placa do veículo"><input value={placa} onChange={(e) => setPlaca(UP(e.target.value))} className={`${inputCls} uppercase`} /></Campo>
            <Campo rotulo="Motorista"><input value={motorista} onChange={(e) => setMotorista(UP(e.target.value))} className={`${inputCls} uppercase`} /></Campo>
            <Campo rotulo="CT-e / romaneio / canhoto"><input value={docTransporte} onChange={(e) => setDocTransporte(UP(e.target.value))} className={`${inputCls} uppercase`} /></Campo>
            <Campo rotulo="Nota fiscal (se em mãos)"><input value={notaFiscal} onChange={(e) => setNotaFiscal(UP(e.target.value))} className={`${inputCls} uppercase`} /></Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Volumes — contagem" erro={erros.contada}>
              <input value={contada} onChange={(e) => setContada(e.target.value)} inputMode="numeric" className={inputCls} placeholder="Conte primeiro" />
            </Campo>
            <Campo rotulo="Volumes — declarado no doc.">
              <input value={declarada} onChange={(e) => setDeclarada(e.target.value)} inputMode="numeric" className={inputCls} />
            </Campo>
            <Campo rotulo="Embalagem">
              <select value={embalagem} onChange={(e) => setEmbalagem(e.target.value as TipoEmbalagem)} className={inputCls}>
                <option value="">—</option>
                {EMBALAGENS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          </div>

          {diverge && (
            <p className="rounded-lg border border-rose-300 bg-rose-50/50 px-3 py-2 text-[11px] font-bold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              Contagem diferente do declarado{avaria ? ' / avaria' : ''} — a carga será registrada como divergente.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Peso declarado (kg)"><input value={pesoDecl} onChange={(e) => setPesoDecl(e.target.value)} inputMode="decimal" className={inputCls} /></Campo>
            <Campo rotulo="Destino previsto">
              <select value={destino} onChange={(e) => setDestino(e.target.value as DestinoPrevisto)} className={inputCls}>
                {DESTINOS.map((d) => <option key={d.id} value={d.id}>{d.rotulo}</option>)}
              </select>
            </Campo>
            <Campo rotulo="PO (se já souber)"><input value={nroPedido} onChange={(e) => setNroPedido(SO_DIGITOS(e.target.value))} inputMode="numeric" className={inputCls} /></Campo>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
              <input type="checkbox" checked={lacre} onChange={(e) => setLacre(e.target.checked)} /> Lacre íntegro
            </label>
            <label className="flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--ink-secondary)' }}>
              <input type="checkbox" checked={avaria} onChange={(e) => setAvaria(e.target.checked)} /> Avaria aparente
            </label>
          </div>
          {avaria && (
            <Campo rotulo="Descrição da avaria" erro={erros.avaria}>
              <input value={avariaDesc} onChange={(e) => setAvariaDesc(UP(e.target.value))} className={`${inputCls} uppercase`} />
            </Campo>
          )}

          <Campo rotulo={`Fotos da carga (opcional, até ${MAX_FOTOS_FICHA})${fotosExistentes ? ` — ${fotosExistentes} já anexada(s); as novas somam` : ''}`}>
            <GaleriaFotos arquivos={fotos} setArquivos={setFotos} max={MAX_FOTOS_FICHA - fotosExistentes} />
          </Campo>

          <Campo rotulo="Observação"><textarea value={observacao} onChange={(e) => setObservacao(UP(e.target.value))} rows={2} className={`${inputCls} uppercase`} /></Campo>
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button onClick={() => void salvar()} disabled={salvando} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} {ed ? 'Salvar alterações' : 'Registrar carga'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Modal — F2 Recebimento e contagem
// ===========================================================================

interface LinhaUI extends LinhaConferencia {
  fotos: PreparedAttachment[];
}

function ModalConferencia({
  user, cargas, registro, onClose, onSalvo,
}: {
  user: Profile;
  cargas: CargaRow[];
  registro?: ConferenciaRow;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const ed = registro;
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [data, setData] = useState(ed?.data ?? hojeISO());
  const [cargaId, setCargaId] = useState(ed?.carga_id ?? '');
  /** Campo de busca: o PO a puxar agora. Vários POs viram várias buscas. */
  const [poBusca, setPoBusca] = useState('');
  const [fornecedor, setFornecedor] = useState(ed?.fornecedor ?? '');
  const [rm, setRm] = useState(ed?.rm ?? '');
  const [deposito, setDeposito] = useState(ed?.deposito ?? '');
  const [fonte, setFonte] = useState<'cache_sap' | 'supabase' | 'manual' | 'sem_pedido'>(ed?.fonte_pedido ?? 'sem_pedido');
  const [linhas, setLinhas] = useState<LinhaUI[]>(
    ed
      ? ed.itens.map<LinhaUI>((it) => ({
          linhaRef: it.linha_ref ?? null,
          nroPedido: it.nro_pedido ?? null,
          materialCode: it.material_code ?? '',
          descricao: it.descricao ?? '',
          unidade: it.unidade ?? '',
          qtdPedido: it.qtd_pedido ?? null,
          qtdJaFornecida: it.qtd_ja_fornecida ?? null,
          qtdRecebida: Number(it.qtd_recebida) || 0,
          conferido: it.conferido,
          itemManual: it.item_manual ?? false,
          avaria: it.tipo_divergencia === 'avaria',
          parcial: it.parcial ?? false,
          observacao: it.observacao ?? '',
          evidencias: it.evidencias ?? [],
          fotos: [],
        }))
      : [],
  );
  const [observacao, setObservacao] = useState(ed?.observacao ?? '');
  const [fotosCab, setFotosCab] = useState<PreparedAttachment[]>([]);
  const [ncResponsavel, setNcResponsavel] = useState('');
  const [ncSeveridade, setNcSeveridade] = useState<'baixa' | 'media' | 'alta'>('media');

  const cargasVinculaveis = cargas.filter((c) => c.status === 'recebida' || c.status === 'em_conferencia' || c.status === 'divergente');

  /** POs presentes na conferência, na ordem em que apareceram. */
  const pedidos = useMemo(() => {
    const vistos: string[] = [];
    for (const l of linhas) if (l.nroPedido && !vistos.includes(l.nroPedido)) vistos.push(l.nroPedido);
    return vistos;
  }, [linhas]);

  const buscarPedido = async () => {
    const alvo = SO_DIGITOS(poBusca).trim();
    if (!alvo) { toast.error('Informe o número do pedido.'); return; }
    if (pedidos.includes(alvo)) { toast.info(`PO ${alvo} já está na conferência.`); setPoBusca(''); return; }
    setBuscando(true);
    try {
      const res = await carregarLinhasPedido(alvo, localDb.getEnrichedSAPRequisicoes());
      if (res.fonte !== 'manual' && res.fonte !== 'sem_pedido') setFonte(res.fonte);
      if (res.fornecedor && !fornecedor) setFornecedor(res.fornecedor);
      if (!res.linhas.length) {
        toast.warning(`PO ${alvo} não encontrado no SAP. Adicione os itens à mão (o PO fica no item).`);
        setPoBusca('');
        return;
      }
      const jaTem = new Set(linhas.map((l) => l.linhaRef).filter(Boolean));
      const novas = res.linhas
        .filter((l) => !l.linhaRef || !jaTem.has(l.linhaRef))
        .map<LinhaUI>((l) => ({
          linhaRef: l.linhaRef,
          nroPedido: alvo,
          materialCode: l.materialCode,
          descricao: l.descricao,
          unidade: l.unidade,
          qtdPedido: l.qtdPedido,
          qtdJaFornecida: l.qtdJaFornecida,
          qtdRecebida: pendentePedido(l.qtdPedido, l.qtdJaFornecida),
          conferido: false,
          itemManual: false,
          avaria: false,
          parcial: false,
          observacao: '',
          evidencias: [],
          fotos: [],
        }));
      setLinhas((a) => [...a, ...novas]);
      if (res.linhas[0].rm && !rm) setRm(res.linhas[0].rm);
      setPoBusca('');

      const comParcial = novas.filter((l) => entregaParcialAnterior(l.qtdPedido, l.qtdJaFornecida));
      toast.success(`PO ${alvo}: ${novas.length} item(ns) — ${FONTE_ROTULO[res.fonte]}.`);
      if (comParcial.length) {
        toast.warning(
          `PO ${alvo} tem entrega parcial: ${comParcial.length} item(ns) já com recebimento anterior. ` +
          'O pendente já foi descontado; marque "parcial" no que ainda vier faltando.',
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao buscar o pedido.');
    } finally {
      setBuscando(false);
    }
  };

  const setLinha = (idx: number, patch: Partial<LinhaUI>) =>
    setLinhas((a) => a.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addManual = () =>
    setLinhas((a) => [...a, {
      linhaRef: null, nroPedido: SO_DIGITOS(poBusca).trim() || null,
      materialCode: '', descricao: '', unidade: 'UN',
      qtdPedido: null, qtdJaFornecida: null, qtdRecebida: 0,
      conferido: true, itemManual: true, avaria: false, parcial: false, observacao: '', evidencias: [], fotos: [],
    }]);

  const resumo = useMemo(() => resumoConferencia(linhas), [linhas]);

  const salvar = async () => {
    if (!linhas.length) { toast.error('Carregue o pedido ou adicione ao menos um item.'); return; }
    if (linhas.some((l) => !l.materialCode.trim())) { toast.error('Todo item precisa de um código de material.'); return; }

    setSalvando(true);
    try {
      const codigoTmp = ed ? ed.codigo : `${PREFIXO_RECEB.conferencia}-${data}`;
      const evidCabNovas = await subirTodas(fotosCab, codigoTmp);
      const evidCab = ed ? [...ed.evidencias, ...evidCabNovas] : evidCabNovas;

      const itens = [];
      for (const l of linhas) {
        const tipo = classificarDivergencia(l);
        const evidNovas = l.fotos.length ? await subirTodas(l.fotos, codigoTmp) : [];
        itens.push({
          linha_ref: l.linhaRef,
          nro_pedido: l.nroPedido,
          material_code: l.materialCode.trim(),
          descricao: l.descricao.trim() || null,
          unidade: l.unidade.trim() || null,
          qtd_pedido: l.qtdPedido,
          qtd_ja_fornecida: l.qtdJaFornecida,
          qtd_recebida: Number(l.qtdRecebida) || 0,
          conferido: l.conferido,
          divergencia: tipo !== null,
          tipo_divergencia: tipo,
          item_manual: l.itemManual,
          parcial: l.parcial,
          observacao: l.observacao.trim() || null,
          evidencias: [...l.evidencias, ...evidNovas],
        });
      }

      if (ed) {
        const { alteracoes, tem_nc, nc_codigo } = await editarConferencia(
          ed.id,
          {
            nro_pedido: pedidos[0] ?? null,
            pedidos,
            fornecedor: fornecedor.trim() || null,
            rm: rm.trim() || null,
            deposito: deposito.trim() || null,
            observacao: observacao.trim() || null,
            carga_id: cargaId || null,
            tipo_item: resumoConferencia(linhas).tipoItem,
            evidencias: evidCab,
          },
          itens,
          { id: user.id, nome: user.name },
        );
        [...fotosCab, ...linhas.flatMap((l) => l.fotos)].forEach((f) => URL.revokeObjectURL(f.previewUrl));
        toast.success(
          alteracoes ? `${ed.codigo}: ${alteracoes} alteração(ões) salva(s).` : `${ed.codigo}: nada mudou.`,
        );
        if (tem_nc && nc_codigo) toast.warning(`NCR ${nc_codigo} aberta pela nova divergência.`);
        onSalvo();
        return;
      }

      const divergentes = itens.filter((i) => i.divergencia);
      const nc = divergentes.length
        ? {
            tipo: tipoNcSugerido(resumo.tiposDivergencia),
            severidade: ncSeveridade,
            descricao:
              `Conferência ${pedidos.length ? 'dos PO ' + pedidos.join(' / ') : 'sem PO'} com ${divergentes.length} item(ns) divergente(s): ` +
              divergentes.map((i) => `${i.material_code} (${ROTULO_DIVERGENCIA[i.tipo_divergencia as TipoDivergencia] ?? i.tipo_divergencia})`).join(', '),
            responsavel: ncResponsavel.trim() || null,
            itens_resumo: divergentes.map((i) => ({
              material_code: i.material_code,
              descricao: i.descricao ?? '',
              qtd_pedido: i.qtd_pedido,
              qtd_recebida: i.qtd_recebida,
              tipo_divergencia: i.tipo_divergencia,
            })),
          }
        : null;

      const { codigo, tem_nc, nc_codigo } = await registrarConferencia({
        data,
        carga_id: cargaId || null,
        nro_pedido: pedidos[0] ?? null,
        pedidos,
        fornecedor: fornecedor.trim() || null,
        rm: rm.trim() || null,
        tipo_item: resumo.tipoItem,
        deposito: deposito.trim() || null,
        fonte_pedido: fonte,
        evidencias: evidCab,
        observacao: observacao.trim() || null,
        criado_por_id: user.id,
        criado_por_nome: user.name,
        itens,
        nc,
      });

      [...fotosCab, ...linhas.flatMap((l) => l.fotos)].forEach((f) => URL.revokeObjectURL(f.previewUrl));
      toast.success(`Conferência ${codigo} registrada.${tem_nc ? ` NCR ${nc_codigo} aberta.` : ''}`);
      if (resumo.tipoItem !== 'consumo') {
        toast.info('Há itens de projeto — use "Registrar entrada em Projetos" no cartão para explodir a BOM.');
      }
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar a conferência.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={() => !salvando && onClose()} maxWidth="max-w-3xl" ariaLabel={ed ? `Editar ${ed.codigo}` : 'Nova conferência de recebimento'} disableOutsideClose>
      <ModalHeader onClose={() => !salvando && onClose()}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          {ed ? `Editar conferência — ${ed.codigo}` : 'Recebimento e contagem'}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          {ed
            ? 'Ajuste o cabeçalho e a contagem. Uma nova divergência abre NCR; as alterações vão para o histórico.'
            : 'Puxe o pedido, confira quantidade item a item. Divergência abre uma NCR.'}
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} /></Campo>
            <Campo rotulo="Ficha cega vinculada (opcional)">
              <select value={cargaId} onChange={(e) => {
                setCargaId(e.target.value);
                const c = cargasVinculaveis.find((x) => x.id === e.target.value);
                if (c?.nro_pedido && !poBusca && !pedidos.length) setPoBusca(c.nro_pedido);
              }} className={inputCls}>
                <option value="">—</option>
                {cargasVinculaveis.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} · {c.transportadora} · {formatDateBR(c.data)}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo rotulo="Pedidos (PO) — adicione um por vez">
            <div className="flex gap-2">
              <input
                value={poBusca}
                onChange={(e) => setPoBusca(SO_DIGITOS(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void buscarPedido(); } }}
                inputMode="numeric"
                className={inputCls}
                placeholder="Ex.: 4500001234"
              />
              <button
                onClick={() => void buscarPedido()}
                disabled={buscando}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Adicionar PO
              </button>
            </div>
            {pedidos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pedidos.map((po) => (
                  <span key={po} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                    PO {po}
                    <button
                      onClick={() => setLinhas((a) => a.filter((l) => l.nroPedido !== po))}
                      className="cursor-pointer"
                      aria-label={`Remover PO ${po}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {fonte !== 'sem_pedido' && (
              <span className="mt-1 block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{FONTE_ROTULO[fonte]}</span>
            )}
          </Campo>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Fornecedor"><input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className={inputCls} /></Campo>
            <Campo rotulo="RM"><input value={rm} onChange={(e) => setRm(e.target.value)} className={inputCls} /></Campo>
            <Campo rotulo="Depósito / localizador"><input value={deposito} onChange={(e) => setDeposito(e.target.value)} className={inputCls} /></Campo>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                {resumo.total} itens · <span style={{ color: 'var(--status-good)' }}>{resumo.ok} ok</span>
                {resumo.parciais > 0 && <> · <span style={{ color: 'var(--status-serious)' }}>{resumo.parciais} parcial</span></>}
                {resumo.divergentes > 0 && <> · <span style={{ color: 'var(--status-critical)' }}>{resumo.divergentes} diverg.</span></>}
              </span>
              <button onClick={addManual} className="text-[11px] font-bold cursor-pointer hover:underline" style={{ color: 'var(--brand)' }}>
                + Item fora do pedido
              </button>
            </div>

            {!linhas.length && (
              <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[11px]" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                Puxe um PO ou adicione itens à mão.
              </p>
            )}

            {linhas.map((l, idx) => {
              const tipo = classificarDivergencia(l);
              const pend = pendentePedido(l.qtdPedido, l.qtdJaFornecida);
              const parcialAnt = entregaParcialAnterior(l.qtdPedido, l.qtdJaFornecida);
              const amberParcial = l.parcial && !tipo;
              const okVerde = l.conferido && !tipo && !l.parcial;
              return (
                <div
                  key={idx}
                  className="rounded-lg border p-2.5"
                  style={{
                    borderColor: tipo ? 'var(--status-critical)' : amberParcial ? 'var(--status-serious)' : okVerde ? 'var(--status-good)' : 'var(--hairline)',
                    borderLeftWidth: tipo || amberParcial || okVerde ? 3 : 1,
                    background: tipo ? 'color-mix(in srgb, var(--status-critical) 8%, transparent)' : amberParcial ? 'color-mix(in srgb, var(--status-serious) 10%, transparent)' : okVerde ? 'color-mix(in srgb, var(--status-good) 8%, transparent)' : 'var(--surface-raised)',
                  }}
                >
                  {l.itemManual ? (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input value={l.nroPedido ?? ''} onChange={(e) => setLinha(idx, { nroPedido: SO_DIGITOS(e.target.value) || null })} inputMode="numeric" placeholder="PO (opc.)" className={inputCls} />
                      <input value={l.materialCode} onChange={(e) => setLinha(idx, { materialCode: e.target.value })} placeholder="Cód. material" className={inputCls} />
                      <input value={l.descricao} onChange={(e) => setLinha(idx, { descricao: e.target.value })} placeholder="Descrição" className={`${inputCls} sm:col-span-2`} />
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
                        {l.materialCode}
                        {l.nroPedido && <span className="ml-2 font-medium" style={{ color: 'var(--ink-muted)' }}>PO {l.nroPedido}</span>}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>{l.descricao}</p>
                    </div>
                  )}

                  {parcialAnt && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: 'color-mix(in srgb, var(--status-serious) 14%, transparent)', color: 'var(--status-serious)' }}>
                      <AlertTriangle className="h-3 w-3" /> Entrega parcial no PO — já recebido {formatQtd(parcialAnt.jaRecebido)} de {formatQtd(l.qtdPedido ?? 0)} · pendente {formatQtd(parcialAnt.pendente)}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {!l.itemManual && (
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                        pendente {formatQtd(pend)} {l.unidade}
                      </span>
                    )}
                    <label className="flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--ink-secondary)' }}>
                      recebido
                      <input
                        value={String(l.qtdRecebida)}
                        onChange={(e) => setLinha(idx, { qtdRecebida: Number(e.target.value.replace(',', '.')) || 0 })}
                        inputMode="decimal"
                        className="w-20 rounded border px-2 py-1 text-right text-xs tabular-nums font-bold"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface)', color: 'var(--ink-primary)' }}
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-secondary)' }}>
                      <input type="checkbox" checked={l.conferido} onChange={(e) => setLinha(idx, { conferido: e.target.checked })} /> conferido
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-secondary)' }} title="Chegou parte do pendente; o resto vem em outra entrega. Não abre NC.">
                      <input type="checkbox" checked={l.parcial} onChange={(e) => setLinha(idx, { parcial: e.target.checked })} /> parcial
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-secondary)' }}>
                      <input type="checkbox" checked={l.avaria} onChange={(e) => setLinha(idx, { avaria: e.target.checked })} /> avaria
                    </label>
                    {tipo && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase" style={{ background: 'color-mix(in srgb, var(--status-critical) 14%, transparent)', color: 'var(--status-critical)' }}>
                        <AlertTriangle className="h-3 w-3" /> {ROTULO_DIVERGENCIA[tipo]}
                      </span>
                    )}
                    {amberParcial && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase" style={{ background: 'color-mix(in srgb, var(--status-serious) 16%, transparent)', color: 'var(--status-serious)' }}>
                        parcial
                      </span>
                    )}
                    {okVerde && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold uppercase" style={{ color: 'var(--status-good)' }}>
                        <Check className="h-3 w-3" /> ok
                      </span>
                    )}
                    <button onClick={() => setLinhas((a) => a.filter((_, j) => j !== idx))} className="ml-auto cursor-pointer" aria-label="Remover item">
                      <X className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    </button>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    <input
                      value={l.observacao}
                      onChange={(e) => setLinha(idx, { observacao: e.target.value })}
                      placeholder="Observação do item"
                      className={`${inputCls} w-full`}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Fotos do item</span>
                      {(l.evidencias.length > 0) && (
                        <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{l.evidencias.length} já anexada(s)</span>
                      )}
                      <GaleriaFotos
                        arquivos={l.fotos}
                        setArquivos={(updater) => setLinhas((a) => a.map((x, j) => (j === idx
                          ? { ...x, fotos: typeof updater === 'function' ? (updater as any)(x.fotos) : updater }
                          : x)))}
                        max={4}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {resumo.temNc && (
            <div className="rounded-lg border border-rose-300 bg-rose-50/40 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {resumo.divergentes} item(ns) divergente(s) — uma NCR será aberta
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Campo rotulo="Responsável pela tratativa">
                  <input value={ncResponsavel} onChange={(e) => setNcResponsavel(e.target.value)} className={inputCls} />
                </Campo>
                <Campo rotulo="Severidade">
                  <select value={ncSeveridade} onChange={(e) => setNcSeveridade(e.target.value as any)} className={inputCls}>
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </Campo>
              </div>
            </div>
          )}

          <Campo rotulo="Foto geral do recebimento (separada das fotos por item; carimbada com data/hora)">
            {ed && ed.evidencias.length > 0 && (
              <span className="mb-1 block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{ed.evidencias.length} já anexada(s); as novas somam.</span>
            )}
            <GaleriaFotos arquivos={fotosCab} setArquivos={setFotosCab} max={12} />
          </Campo>
          <Campo rotulo="Observação"><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls} /></Campo>
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button onClick={() => void salvar()} disabled={salvando} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          {ed ? 'Salvar alterações' : resumo.temNc ? 'Registrar com NCR' : 'Registrar conferência'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ===========================================================================
// Modal — NCR: tratativa (status, ação com foto, foto geral) + log
// ===========================================================================

const NC_TIPOS = ['falta', 'excedente', 'avaria', 'material_errado', 'sem_pedido', 'volume', 'outros'];

function ModalNc({
  user, nc, onClose, onSalvo,
}: {
  user: Profile;
  nc: NaoConformidadeRow;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(nc.status);
  const [severidade, setSeveridade] = useState(nc.severidade);
  const [tipo, setTipo] = useState(nc.tipo);
  const [responsavel, setResponsavel] = useState(nc.responsavel ?? '');
  const [descricao, setDescricao] = useState(nc.descricao ?? '');
  const [resolucao, setResolucao] = useState(nc.resolucao ?? '');
  const [acaoTexto, setAcaoTexto] = useState('');
  const [acaoFotos, setAcaoFotos] = useState<PreparedAttachment[]>([]);
  const [fotosGerais, setFotosGerais] = useState<PreparedAttachment[]>([]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const cod = nc.codigo;
      const gerais = fotosGerais.length ? await subirTodas(fotosGerais, cod) : [];
      const acaoEvid = acaoFotos.length ? await subirTodas(acaoFotos, cod) : [];
      const temAcao = acaoTexto.trim().length > 0 || acaoEvid.length > 0;

      const { alteracoes } = await editarNc(
        nc.id,
        {
          status,
          severidade,
          tipo,
          responsavel: responsavel.trim() || null,
          descricao: descricao.trim() || null,
          resolucao: resolucao.trim() || null,
          evidencias: [...nc.evidencias, ...gerais],
        },
        temAcao ? { texto: acaoTexto.trim() || null, evidencias: acaoEvid } : null,
        { id: user.id, nome: user.name },
      );

      [...acaoFotos, ...fotosGerais].forEach((f) => URL.revokeObjectURL(f.previewUrl));
      toast.success(
        temAcao
          ? `${cod}: ação registrada${alteracoes > 1 ? ` + ${alteracoes - 1} campo(s)` : ''}.`
          : alteracoes ? `${cod}: ${alteracoes} campo(s) atualizado(s).` : `${cod}: nada mudou.`,
      );
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar a NCR.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={() => !salvando && onClose()} maxWidth="max-w-2xl" ariaLabel={`Editar ${nc.codigo}`} disableOutsideClose>
      <ModalHeader onClose={() => !salvando && onClose()}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Não conformidade — {nc.codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Registre o andamento da tratativa. Tudo fica no log; as ações viram uma linha do tempo.
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
                <option value="aberta">Aberta</option>
                <option value="em_tratativa">Em tratativa</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </Campo>
            <Campo rotulo="Severidade">
              <select value={severidade} onChange={(e) => setSeveridade(e.target.value as any)} className={inputCls}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                {NC_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          </div>

          <Campo rotulo="Responsável pela tratativa">
            <input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={inputCls} />
          </Campo>
          <Campo rotulo="Descrição">
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className={inputCls} />
          </Campo>
          <Campo rotulo="Resolução (o que encerrou / vai encerrar)">
            <textarea value={resolucao} onChange={(e) => setResolucao(e.target.value)} rows={2} className={inputCls} />
          </Campo>

          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <p className="mb-2 text-[11px] font-extrabold" style={{ color: 'var(--ink-secondary)' }}>Registrar ação (andamento)</p>
            <Campo rotulo="Observação da ação">
              <textarea value={acaoTexto} onChange={(e) => setAcaoTexto(e.target.value)} rows={2} className={inputCls} placeholder="Ex.: contato com o fornecedor, coleta agendada…" />
            </Campo>
            <div className="mt-2">
              <span className="mb-1 block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Foto da ação (carimbada)</span>
              <GaleriaFotos arquivos={acaoFotos} setArquivos={setAcaoFotos} max={6} />
            </div>
          </div>

          <Campo rotulo={`Fotos gerais da NCR${nc.evidencias.length ? ` — ${nc.evidencias.length} já anexada(s)` : ''}`}>
            <GaleriaFotos arquivos={fotosGerais} setArquivos={setFotosGerais} max={12} />
          </Campo>

          {nc.acoes?.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Ações já registradas</p>
              <ul className="space-y-1.5">
                {nc.acoes.map((a: NcAcao, i: number) => (
                  <li key={i} className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    <span className="font-bold">{formatDateTimeBR(a.em)}</span> — {a.por_nome || '—'}: {a.texto || '(foto)'}
                    {(a.evidencias?.length ?? 0) > 0 ? ` · ${a.evidencias.length} foto(s)` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button onClick={() => void salvar()} disabled={salvando} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
        </button>
      </ModalFooter>
    </Modal>
  );
}

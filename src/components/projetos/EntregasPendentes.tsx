/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos › Recebimento — itens pendentes de entrega.
 *
 * Linhas da planilha de recebimento com CHECK vazio, 0 ou "-": estavam na
 * NF/romaneio, não vieram no carregamento. Ficam aqui até chegarem — a
 * importação seguinte dá baixa sozinha quando o mesmo item (e PO) é creditado
 * — ou até alguém dar baixa à mão: "Chegou" (com a NF, se souber) ou "Não
 * virá" (com o motivo). Quem lança também corrige (editar) e exclui —
 * exclusão lógica: some da lista e da baixa automática, fica no banco.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, PackageX, Pencil, RefreshCw, RotateCcw, Search, Trash2, XCircle } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { formatDateBR, formatQtd } from '../../lib/format';
import {
  editarEntregaPendente, excluirEntregasPendentes, listarEntregasPendentes, reabrirEntregaPendente, resolverEntregasPendentes,
  type ProjEntregaPendente, type StatusEntregaPendente,
} from '../../lib/projetosApi';
import { chaveNaoEntregue } from '../../lib/projetosImportacao';
import { normalizarPartNumber } from '../../lib/projetos';
import { parseMb51Number } from '../../lib/mb51';
import type { Profile } from '../../types';

const ROTULO_STATUS: Record<StatusEntregaPendente, string> = {
  PENDENTE: 'Aguardando entrega',
  ENTREGUE: 'Chegou',
  NAO_VIRA: 'Não virá',
};

const COR_STATUS: Record<StatusEntregaPendente, string> = {
  PENDENTE: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  ENTREGUE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  NAO_VIRA: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

/** Dias desde a NF (texto ISO, sem `new Date` no fuso). */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const hoje = new Date();
  return Math.floor((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(a, m - 1, d)) / 86_400_000);
}

export default function EntregasPendentes({ user, podeLancar, versao }: { user: Profile; podeLancar: boolean; versao?: unknown }) {
  const toast = useToast();
  const [lista, setLista] = useState<ProjEntregaPendente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<StatusEntregaPendente | 'todos'>('PENDENTE');
  const [busca, setBusca] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [resolvendo, setResolvendo] = useState<{ ids: string[]; status: 'ENTREGUE' | 'NAO_VIRA' } | null>(null);
  const [editando, setEditando] = useState<ProjEntregaPendente | null>(null);
  const [excluindo, setExcluindo] = useState<ProjEntregaPendente[] | null>(null);
  const [processandoExclusao, setProcessandoExclusao] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await listarEntregasPendentes());
    } catch (err: any) {
      toast.error(`Falha ao carregar as pendências de entrega: ${err?.message || err}`);
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => { void carregar(); }, [carregar, versao]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((p) => {
      if (filtro !== 'todos' && p.status !== filtro) return false;
      if (!termo) return true;
      return [p.part_number, p.cod_sap, p.descricao, p.numero_nf, p.pedido, p.numero_kit, p.aplicacao, p.observacao]
        .some((v) => (v || '').toLowerCase().includes(termo));
    });
  }, [lista, filtro, busca]);

  const pendentes = lista.filter((p) => p.status === 'PENDENTE');
  const pendentesVisiveis = filtrados.filter((p) => p.status === 'PENDENTE');
  const todosMarcados = pendentesVisiveis.length > 0 && pendentesVisiveis.every((p) => selecionados.has(p.id));

  const alternar = (id: string) => setSelecionados((atual) => {
    const n = new Set(atual);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const reabrir = async (p: ProjEntregaPendente) => {
    try {
      await reabrirEntregaPendente(p.id);
      toast.success(`${p.part_number} voltou para "Aguardando entrega".`);
      void carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível reabrir.');
    }
  };

  const excluir = async () => {
    if (!excluindo) return;
    setProcessandoExclusao(true);
    try {
      await excluirEntregasPendentes(excluindo.map((p) => p.id), { id: user.id, name: user.name });
      toast.success(`${excluindo.length} item(ns) excluído(s) do acompanhamento.`);
      setExcluindo(null);
      setSelecionados(new Set());
      void carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível excluir.');
    } finally {
      setProcessandoExclusao(false);
    }
  };

  // Nada pendente e nada resolvido: não ocupa espaço na tela.
  if (!carregando && lista.length === 0) return null;

  return (
    <section className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--hairline)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold flex items-center gap-1.5" style={{ color: 'var(--ink-primary)' }}>
            <PackageX className="h-4 w-4 text-violet-600 dark:text-violet-400" /> Itens pendentes de entrega
            {pendentes.length > 0 && <span className="rounded-full bg-violet-600 px-1.5 text-[10px] text-white">{pendentes.length}</span>}
          </h3>
          <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            Estavam na NF e não vieram no carregamento (CHECK vazio, 0 ou "-" na planilha). A importação seguinte dá baixa quando o item chega.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="PN, NF, PO, kit…"
              className="rounded-lg border py-1.5 pl-8 pr-2 text-xs"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            />
          </div>
          <select
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value as StatusEntregaPendente | 'todos'); setSelecionados(new Set()); }}
            className="rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
          >
            <option value="PENDENTE">Aguardando entrega</option>
            <option value="ENTREGUE">Chegaram</option>
            <option value="NAO_VIRA">Não virão</option>
            <option value="todos">Todos</option>
          </select>
          <button type="button" onClick={() => void carregar()} disabled={carregando} className="rounded-lg border p-1.5 cursor-pointer disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }} aria-label="Atualizar">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {podeLancar && pendentesVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-2 font-semibold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
            <input type="checkbox" checked={todosMarcados} onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(pendentesVisiveis.map((p) => p.id)))} />
            {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : 'Selecionar'}
          </label>
          <button
            type="button"
            disabled={!selecionados.size}
            onClick={() => setResolvendo({ ids: [...selecionados], status: 'ENTREGUE' })}
            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white cursor-pointer disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Chegou
          </button>
          <button
            type="button"
            disabled={!selecionados.size}
            onClick={() => setResolvendo({ ids: [...selecionados], status: 'NAO_VIRA' })}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-bold cursor-pointer disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <XCircle className="h-3.5 w-3.5" /> Não virá
          </button>
          <button
            type="button"
            disabled={!selecionados.size}
            onClick={() => setExcluindo(lista.filter((p) => selecionados.has(p.id)))}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-bold cursor-pointer text-rose-600 disabled:opacity-40"
            style={{ borderColor: 'var(--hairline)' }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        </div>
      )}

      {carregando && !lista.length ? (
        <p className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nada neste filtro.</p>
      ) : (
        <div className="overflow-x-auto max-h-[28rem] overflow-y-auto rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0" style={{ background: 'var(--surface-raised)' }}>
              <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                {['', 'NF', 'PO', 'Part number', 'Descrição', 'Esperado', 'Kit / aplicação', 'Obs.', 'Situação', ''].map((h, i) => (
                  <th key={h || i} className={`px-2.5 py-2 font-bold whitespace-nowrap ${i === 5 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => {
                const dias = p.status === 'PENDENTE' ? diasDesde(p.data_nf) : null;
                return (
                  <tr key={p.id} className="border-b align-top" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="px-2.5 py-2">
                      {podeLancar && p.status === 'PENDENTE' && (
                        <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar ${p.part_number}`} />
                      )}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>
                      <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{p.numero_nf}</span>
                      <span className="block text-[10px]">{formatDateBR(p.data_nf)}{dias != null && dias > 0 ? ` · há ${dias} dia(s)` : ''}</span>
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-mono" style={{ color: 'var(--ink-secondary)' }}>{p.pedido || '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-mono font-bold" style={{ color: 'var(--ink-primary)' }}>
                      {p.part_number}
                      {p.cod_sap && <span className="block text-[10px] font-normal">SAP {p.cod_sap}</span>}
                    </td>
                    <td className="px-2.5 py-2 min-w-[180px]" style={{ color: 'var(--ink-secondary)' }}>{p.descricao || '—'}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>
                      {p.quantidade_esperada != null ? `${formatQtd(p.quantidade_esperada)} ${p.uom || ''}` : '—'}
                    </td>
                    <td className="px-2.5 py-2" style={{ color: 'var(--ink-secondary)' }}>{[p.numero_kit, p.aplicacao].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-2.5 py-2 min-w-[140px]" style={{ color: 'var(--ink-secondary)' }}>{p.observacao || '—'}</td>
                    <td className="px-2.5 py-2">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                      {p.status !== 'PENDENTE' && (
                        <span className="block mt-0.5 text-[10px]" style={{ color: 'var(--ink-muted)' }}>
                          {[p.resolucao_nf && `NF ${p.resolucao_nf}`, p.resolucao_nota_codigo, p.resolvido_por_nome, p.resolucao_obs].filter(Boolean).join(' · ')}
                          {podeLancar && (
                            <button type="button" onClick={() => void reabrir(p)} className="ml-1 inline-flex items-center gap-0.5 font-bold cursor-pointer hover:underline">
                              <RotateCcw className="h-3 w-3" /> reabrir
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {podeLancar && (
                        <span className="inline-flex items-center gap-1">
                          {p.status === 'PENDENTE' && (
                            <button type="button" onClick={() => setEditando(p)} aria-label={`Editar ${p.part_number}`} title="Editar" className="rounded-md p-1 cursor-pointer hover:bg-[var(--surface-sunken)]" style={{ color: 'var(--ink-muted)' }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => setExcluindo([p])} aria-label={`Excluir ${p.part_number}`} title="Excluir" className="rounded-md p-1 cursor-pointer text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <EditarModal
          registro={editando}
          user={user}
          onClose={() => setEditando(null)}
          onFeito={() => { setEditando(null); void carregar(); }}
        />
      )}

      {excluindo && (
        <ConfirmDialog
          titulo={excluindo.length > 1 ? `Excluir ${excluindo.length} itens?` : 'Excluir item?'}
          mensagem={
            excluindo.length > 1
              ? `Os ${excluindo.length} itens saem do acompanhamento e da baixa automática. Reimportar a mesma planilha não os traz de volta.`
              : `${excluindo[0].part_number} (NF ${excluindo[0].numero_nf}) sai do acompanhamento e da baixa automática. Reimportar a mesma planilha não o traz de volta.`
          }
          confirmarLabel="Excluir"
          variante="perigo"
          confirmando={processandoExclusao}
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => void excluir()}
        />
      )}

      {resolvendo && (
        <ResolverModal
          ids={resolvendo.ids}
          status={resolvendo.status}
          user={user}
          onClose={() => setResolvendo(null)}
          onFeito={() => { setResolvendo(null); setSelecionados(new Set()); void carregar(); }}
        />
      )}
    </section>
  );
}

function ResolverModal({
  ids, status, user, onClose, onFeito,
}: {
  ids: string[];
  status: 'ENTREGUE' | 'NAO_VIRA';
  user: Profile;
  onClose: () => void;
  onFeito: () => void;
}) {
  const toast = useToast();
  const [nf, setNf] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const chegou = status === 'ENTREGUE';

  const confirmar = async () => {
    if (!chegou && !obs.trim()) { toast.warning('Informe por que o item não virá.'); return; }
    setSalvando(true);
    try {
      await resolverEntregasPendentes(ids, status, { nf, obs }, { id: user.id, name: user.name });
      toast.success(`${ids.length} item(ns) marcado(s) como "${chegou ? 'chegou' : 'não virá'}".`);
      onFeito();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível dar baixa.');
    } finally {
      setSalvando(false);
    }
  };

  const campo = 'w-full rounded-lg border px-3 py-2 text-sm';
  const estiloCampo = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel={chegou ? 'Marcar como entregue' : 'Marcar como não virá'} disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          {chegou ? 'Item chegou' : 'Item não virá'} — {ids.length} selecionado(s)
        </h3>
      </ModalHeader>
      <ModalBody className="space-y-3">
        {chegou && (
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>NF em que chegou (opcional)</label>
            <input value={nf} onChange={(e) => setNf(e.target.value)} className={campo} style={estiloCampo} />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>A baixa aqui não credita estoque — lance a entrada da NF normalmente.</p>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
            {chegou ? 'Observação' : 'Motivo'}{!chegou && <span className="text-red-500"> *</span>}
          </label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={campo} style={estiloCampo} />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
          style={{ background: chegou ? '#059669' : 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar
        </button>
      </ModalFooter>
    </Modal>
  );
}

function EditarModal({
  registro: r, user, onClose, onFeito,
}: {
  registro: ProjEntregaPendente;
  user: Profile;
  onClose: () => void;
  onFeito: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    part_number: r.part_number,
    cod_sap: r.cod_sap ?? '',
    descricao: r.descricao ?? '',
    quantidade_esperada: r.quantidade_esperada != null ? String(r.quantidade_esperada).replace('.', ',') : '',
    uom: r.uom ?? '',
    numero_nf: r.numero_nf,
    data_nf: r.data_nf?.slice(0, 10) ?? '',
    pedido: r.pedido ?? '',
    numero_kit: r.numero_kit ?? '',
    aplicacao: r.aplicacao ?? '',
    observacao: r.observacao ?? '',
  });
  const [salvando, setSalvando] = useState(false);
  const alterar = (campo: keyof typeof f, valor: string) => setF((atual) => ({ ...atual, [campo]: valor }));

  const salvar = async () => {
    const pnNorm = normalizarPartNumber(f.part_number);
    if (!pnNorm) { toast.warning('Informe o part number.'); return; }
    if (!f.numero_nf.trim()) { toast.warning('Informe a NF.'); return; }
    const qtd = f.quantidade_esperada.trim() ? parseMb51Number(f.quantidade_esperada) : null;
    if (f.quantidade_esperada.trim() && !(qtd != null && qtd > 0)) { toast.warning('Quantidade esperada inválida.'); return; }

    const t = (v: string) => v.trim() || null;
    const campos = {
      part_number: f.part_number.trim(), cod_sap: t(f.cod_sap), descricao: t(f.descricao), quantidade_esperada: qtd, uom: t(f.uom),
      numero_nf: f.numero_nf.trim(), data_nf: t(f.data_nf), pedido: t(f.pedido), numero_kit: t(f.numero_kit), aplicacao: t(f.aplicacao),
      observacao: t(f.observacao),
    };
    const chave = chaveNaoEntregue({ nf: campos.numero_nf, partNumberNorm: pnNorm, pedido: campos.pedido, numeroKit: campos.numero_kit, aplicacao: campos.aplicacao });
    setSalvando(true);
    try {
      await editarEntregaPendente(r, campos, chave, pnNorm, { name: user.name });
      toast.success(`${campos.part_number} atualizado.`);
      onFeito();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const campo = 'w-full rounded-lg border px-3 py-2 text-sm';
  const estilo = { borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' };
  const Rotulo = ({ children }: { children: string }) => <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>{children}</label>;

  return (
    <Modal onClose={onClose} maxWidth="max-w-xl" ariaLabel="Editar item pendente de entrega" disableOutsideClose={salvando}>
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Editar item pendente de entrega</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{r.part_number} · NF {r.numero_nf}</p>
      </ModalHeader>
      <ModalBody className="grid grid-cols-2 gap-3">
        <div><Rotulo>Part number *</Rotulo><input value={f.part_number} onChange={(e) => alterar('part_number', e.target.value)} className={`${campo} font-mono`} style={estilo} /></div>
        <div><Rotulo>Cód. SAP</Rotulo><input value={f.cod_sap} onChange={(e) => alterar('cod_sap', e.target.value)} className={`${campo} font-mono`} style={estilo} /></div>
        <div className="col-span-2"><Rotulo>Descrição</Rotulo><input value={f.descricao} onChange={(e) => alterar('descricao', e.target.value)} className={campo} style={estilo} /></div>
        <div><Rotulo>Quantidade esperada</Rotulo><input value={f.quantidade_esperada} onChange={(e) => alterar('quantidade_esperada', e.target.value)} inputMode="decimal" className={campo} style={estilo} /></div>
        <div><Rotulo>Unidade</Rotulo><input value={f.uom} onChange={(e) => alterar('uom', e.target.value)} className={campo} style={estilo} /></div>
        <div><Rotulo>NF *</Rotulo><input value={f.numero_nf} onChange={(e) => alterar('numero_nf', e.target.value)} className={campo} style={estilo} /></div>
        <div><Rotulo>Data da NF</Rotulo><input type="date" value={f.data_nf} onChange={(e) => alterar('data_nf', e.target.value)} className={campo} style={estilo} /></div>
        <div><Rotulo>PO</Rotulo><input value={f.pedido} onChange={(e) => alterar('pedido', e.target.value)} className={`${campo} font-mono`} style={estilo} /></div>
        <div><Rotulo>Número do kit</Rotulo><input value={f.numero_kit} onChange={(e) => alterar('numero_kit', e.target.value)} className={campo} style={estilo} /></div>
        <div className="col-span-2"><Rotulo>Aplicação</Rotulo><input value={f.aplicacao} onChange={(e) => alterar('aplicacao', e.target.value)} className={campo} style={estilo} /></div>
        <div className="col-span-2"><Rotulo>Obs.</Rotulo><textarea value={f.observacao} onChange={(e) => alterar('observacao', e.target.value)} rows={2} className={campo} style={estilo} /></div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inventário Cíclico — divergências e recontagem.
 *
 * Abre pelo indicador "Com divergência" (todas) ou pela etiqueta
 * "N divergente(s)" de um inventário (só as dele). Mostra contado × sistema,
 * diferença, causa e quem contou; marcados os itens, abre um inventário novo
 * ("Recontagem de divergências") só com eles, para confirmar.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, RotateCcw, Search } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { TableBody, TableCardRow, TableCards, TableDesktop, TableHeadRow, TableShell, Td, Th, Tr } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { formatDeposito } from '../../lib/almoxarifado';
import { formatDateBR, formatQtd } from '../../lib/format';
import { casarTokens, extrairPalavrasChave } from '../../lib/buscaKeywords';
import { rotuloCausa } from '../../lib/inventarioAuditoria';
import { criarInventario, type InventarioRow } from '../../lib/inventarioCiclicoApi';
import {
  CRITERIO_RECONTAGEM, divergenciasDosInventarios, itensParaRecontagem, podeRecontar, type LinhaDivergencia,
} from '../../lib/inventarioDivergencias';
import { chaveItem } from '../../lib/inventarioCiclico';
import { hojeISO } from '../../lib/recebimentoAlmox';
import type { EstoqueItem, Profile } from '../../types';

interface Props {
  user: Profile;
  inventarios: InventarioRow[];
  /** ZL0024 atual: item que saiu dela não entra em inventário novo. */
  estoque: EstoqueItem[];
  /** Começa mostrando só as divergências deste inventário. */
  inventarioId?: string | null;
  onClose: () => void;
  onCriado: (id: string) => void | Promise<void>;
  /** "Ver inventário": fecha a janela e abre o inventário da divergência. */
  onAbrirInventario: (id: string) => void;
}

const diferencaCor = (d: number | null) => (d == null || d === 0 ? 'var(--ink-secondary)' : 'var(--status-critical)');
const comSinal = (d: number | null) => (d == null ? '—' : `${d > 0 ? '+' : ''}${formatQtd(d)}`);

export default function DivergenciasInventarioModal({ user, inventarios, estoque, inventarioId = null, onClose, onCriado, onAbrirInventario }: Props) {
  const toast = useToast();
  const todas = useMemo(() => {
    const chaves = estoque.length > 0
      ? new Set(estoque.filter(e => e.material && e.deposito).map(e => chaveItem(String(e.material).trim(), String(e.deposito))))
      : undefined;
    return divergenciasDosInventarios(inventarios, chaves);
  }, [inventarios, estoque]);
  const [doInventario, setDoInventario] = useState<string | null>(inventarioId);
  const [incluirRecontadas, setIncluirRecontadas] = useState(false);
  const [busca, setBusca] = useState('');
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);

  const codigoFiltro = doInventario ? inventarios.find(i => i.id === doInventario)?.codigo ?? null : null;
  const visiveis = useMemo(() => {
    const tokens = extrairPalavrasChave(busca);
    return todas.filter(l => (incluirRecontadas || l.atual)
      && (!doInventario || l.inventarioId === doInventario)
      && (tokens.length === 0 || casarTokens([l.material, l.descricao, l.inventarioCodigo, l.contadoPor ?? ''], tokens)));
  }, [todas, incluirRecontadas, doInventario, busca]);
  const selecionaveis = visiveis.filter(podeRecontar);
  const escolhidas = visiveis.filter(l => marcadas.has(l.itemId) && podeRecontar(l));
  const itens = itensParaRecontagem(escolhidas);
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every(l => marcadas.has(l.itemId));

  const alternar = (id: string) => setMarcadas(m => {
    const n = new Set(m);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const alternarTodas = () => setMarcadas(todasMarcadas ? new Set() : new Set(selecionaveis.map(l => l.itemId)));

  const abrirRecontagem = async () => {
    if (itens.length === 0) return;
    const origem = Array.from(new Set(escolhidas.map(l => l.inventarioCodigo))).join(', ');
    setCriando(true);
    try {
      const r = await criarInventario({
        data: hojeISO(),
        criterio: CRITERIO_RECONTAGEM,
        observacao: `Recontagem das divergências de ${origem}.`,
        conferente_nome: user.name,
        criado_por_nome: user.name,
      }, itens);
      toast.success(`Inventário ${r.codigo || ''} aberto com ${itens.length} item(ns) para recontar.`);
      await onCriado(r.id);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível abrir o inventário de recontagem.');
    } finally {
      setCriando(false);
    }
  };

  const caixa = (l: LinhaDivergencia) => (
    <input
      type="checkbox"
      checked={marcadas.has(l.itemId) && podeRecontar(l)}
      disabled={!podeRecontar(l)}
      onChange={() => alternar(l.itemId)}
      onClick={e => e.stopPropagation()}
      aria-label={`Marcar ${l.material} ${formatDeposito(l.deposito)} para recontar`}
      className="h-4 w-4 cursor-pointer accent-[var(--brand)] disabled:cursor-not-allowed"
    />
  );
  // Dentro do rótulo/linha que marca a caixa: o clique não pode marcar junto.
  const verInventario = (l: LinhaDivergencia) => (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); onAbrirInventario(l.inventarioId); }}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold cursor-pointer hover:bg-[var(--surface-raised)]"
      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
      title={`Abrir o inventário ${l.inventarioCodigo}`}
    >
      <ExternalLink className="h-3 w-3" /> Ver inventário
    </button>
  );
  const situacao = (l: LinhaDivergencia) => (l.emRecontagem
    ? <span className="text-[11px] font-semibold" style={{ color: 'var(--status-serious)' }}>Já em recontagem no {l.emRecontagem}</span>
    : l.naZl0024 === false
      ? <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Fora da ZL0024 atual — não dá para recontar</span>
    : !l.atual
      ? <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Recontado depois</span>
      : null);

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel="Divergências do inventário cíclico">
      <ModalHeader onClose={onClose}>
        <h2 className="flex items-center gap-2 text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          <AlertTriangle className="h-4 w-4" style={{ color: 'var(--status-critical)' }} />
          Divergências{codigoFiltro ? ` do ${codigoFiltro}` : ''}
        </h2>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Marque os itens e abra um inventário novo só com eles para confirmar a contagem.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Material, descrição, inventário ou quem contou"
              className="w-full rounded-lg border py-2 pl-8 pr-3 text-xs border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)]"
            />
          </div>
          {codigoFiltro && (
            <button
              type="button"
              onClick={() => setDoInventario(null)}
              className="rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Ver de todos os inventários
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>
            <input type="checkbox" checked={incluirRecontadas} onChange={e => setIncluirRecontadas(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Incluir as já recontadas
          </label>
        </div>

        {visiveis.length === 0 ? (
          <p className="rounded-xl border border-dashed py-10 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            {todas.length === 0 ? 'Nenhum item divergente nos inventários.' : 'Nenhuma divergência com esse filtro.'}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2 px-1 text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>
              <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} disabled={selecionaveis.length === 0} className="h-4 w-4 accent-[var(--brand)]" />
              Marcar todas ({selecionaveis.length}) · {visiveis.length} divergência(s)
            </label>

            <TableCards>
              {visiveis.map(l => (
                <TableCardRow key={l.itemId} accent={marcadas.has(l.itemId) ? 'var(--brand)' : undefined}>
                  {/* O cartão todo é o rótulo da caixa: tocar em qualquer ponto marca. */}
                  <label className={`flex items-start gap-3 ${podeRecontar(l) ? 'cursor-pointer' : ''}`}>
                    <span className="pt-0.5">{caixa(l)}</span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-bold leading-snug" style={{ color: 'var(--ink-primary)' }}>{l.descricao || '—'}</p>
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                        <span className="font-mono font-bold">{l.material}</span> · {formatDeposito(l.deposito)} · {l.inventarioCodigo} · {formatDateBR(l.data)}
                      </p>
                      <p className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                        <span>Contado <strong className="block">{l.contado == null ? '—' : formatQtd(l.contado)} {l.unidade}</strong></span>
                        <span>Sistema <strong className="block">{l.sistema == null ? '—' : formatQtd(l.sistema)}</strong></span>
                        <span>Diferença <strong className="block" style={{ color: diferencaCor(l.diferenca) }}>{comSinal(l.diferenca)}</strong></span>
                      </p>
                      {l.causa && <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>Causa: {rotuloCausa(l.causa)}{l.causaDetalhe ? ` · ${l.causaDetalhe}` : ''}</p>}
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{l.contagens} contagem(ns){l.contadoPor ? ` · ${l.contadoPor}` : ''}</p>
                      {situacao(l)}
                      <span className="block pt-1">{verInventario(l)}</span>
                    </div>
                  </label>
                </TableCardRow>
              ))}
            </TableCards>

            <TableDesktop>
              <TableShell maxHeight="55vh">
                <table className="w-full text-xs">
                  <TableHeadRow>
                    <Th width="w-8"><input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} disabled={selecionaveis.length === 0} aria-label="Marcar todas" className="h-4 w-4 accent-[var(--brand)]" /></Th>
                    <Th label="Material" />
                    <Th label="Depósito" />
                    <Th label="Inventário" />
                    <Th label="Contado" align="right" />
                    <Th label="Sistema" align="right" />
                    <Th label="Diferença" align="right" />
                    <Th label="Causa" />
                    <Th label="Contagens" />
                  </TableHeadRow>
                  <TableBody>
                    {visiveis.map(l => (
                      <Tr key={l.itemId} onClick={podeRecontar(l) ? () => alternar(l.itemId) : undefined} accent={marcadas.has(l.itemId) ? 'var(--brand)' : undefined}>
                        <Td>{caixa(l)}</Td>
                        <Td>
                          <span className="block font-bold" style={{ color: 'var(--ink-primary)' }}>{l.descricao || '—'}</span>
                          <span className="font-mono text-[11px]">{l.material}</span>
                          {situacao(l) && <span className="block">{situacao(l)}</span>}
                        </Td>
                        <Td>{formatDeposito(l.deposito)}</Td>
                        <Td>
                          <span className="font-mono">{l.inventarioCodigo}</span>
                          <span className="block text-[11px]">{formatDateBR(l.data)}</span>
                          <span className="mt-1 block">{verInventario(l)}</span>
                        </Td>
                        <Td align="right" numeric>{l.contado == null ? '—' : formatQtd(l.contado)} {l.unidade}</Td>
                        <Td align="right" numeric>{l.sistema == null ? '—' : formatQtd(l.sistema)}</Td>
                        <Td align="right" numeric strong><span style={{ color: diferencaCor(l.diferenca) }}>{comSinal(l.diferenca)}</span></Td>
                        <Td truncate title={l.causaDetalhe ?? undefined}>{l.causa ? rotuloCausa(l.causa) : '—'}</Td>
                        <Td>{l.contagens}{l.contadoPor ? ` · ${l.contadoPor}` : ''}</Td>
                      </Tr>
                    ))}
                  </TableBody>
                </table>
              </TableShell>
            </TableDesktop>
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <span className="mr-auto text-xs" style={{ color: 'var(--ink-muted)' }}>
          {itens.length > 0 ? `${itens.length} item(ns) para recontar` : 'Nenhum item marcado'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={() => void abrirRecontagem()}
          disabled={criando || itens.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Abrir inventário de recontagem
        </button>
      </ModalFooter>
    </Modal>
  );
}

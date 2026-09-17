/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem — editar ordem já aberta.
 *
 * Blocos, cada um com uma implicação de estoque diferente (ver
 * `docs/superpowers/specs/2026-09-17-premontagem-editar-ordem-design.md`):
 *  - Cabeçalho (observação/qtd. kits) — sempre liberado, sem estoque.
 *  - Adicionar item — insere uma linha nova no romaneio (item esquecido na
 *    abertura); não debita sozinho, some para o check físico normal se a
 *    separação ainda não foi confirmada.
 *  - Itens — só depois da separação confirmada; corrige a quantidade
 *    debitada de um item (estorna e relança), inclusive os recém-
 *    adicionados que ainda estão com quantidade zero.
 *  - Ações de risco — trocar zona (recalcula o romaneio do zero, desfaz
 *    toda a separação já feita) e cancelar a ordem inteira.
 *
 * Só aparece para quem `podeEditarFormulario` autoriza (autor ou admin) —
 * a trava real está nas RPCs/RLS, isto é só para não oferecer um botão que
 * vai voltar erro.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Loader2, Plus, RefreshCw, Save, X } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import { formatDateTimeBR, formatQtd } from '../../lib/format';
import type { Tramo } from '../../lib/projetos';
import { subconjuntosDoTramo, type ArvoreBom } from '../../lib/projetosBom';
import { consumoDaZona, zonasDoTramo, zonaPorId, type ZonaDef } from '../../lib/projetosZonas';
import {
  adicionarItemPremontagem, cancelarOrdemPremontagem, editarCabecalhoPremontagem, editarItemPremontagem,
  listarAlteracoesPremontagem, trocarZonaPremontagem,
  type AlteracaoOrdemPremontagem, type TrocarZonaItemInput,
} from '../../lib/projetosApi';
import type { Profile, ProjItem, ProjOrdemItem, ProjOrdemPremontagem } from '../../types';

interface Props {
  ordem: ProjOrdemPremontagem;
  user: Profile;
  arvore: ArvoreBom;
  itens: ProjItem[];
  itemPorPn: Map<string, ProjItem>;
  saldoPorPn: Map<string, number>;
  onFechar: () => void;
  onSalvo: () => void;
}

export default function ModalEditarOrdemPremontagem({
  ordem, user, arvore, itens, itemPorPn, saldoPorPn, onFechar, onSalvo,
}: Props) {
  const toast = useToast();
  const usuario = { id: user.id, nome: user.name };

  const [observacao, setObservacao] = useState(ordem.observacao ?? '');
  const [quantidadeKits, setQuantidadeKits] = useState(String(ordem.quantidade_kits));
  const [salvandoCabecalho, setSalvandoCabecalho] = useState(false);

  const [itensOrdem, setItensOrdem] = useState(ordem.itens ?? []);
  const [qtdEmEdicao, setQtdEmEdicao] = useState<Record<string, string>>({});
  const [salvandoItemId, setSalvandoItemId] = useState<string | null>(null);

  const [buscaItem, setBuscaItem] = useState('');
  const [itemNovoId, setItemNovoId] = useState('');
  const [qtdNovoItem, setQtdNovoItem] = useState('');
  const [subconjuntoNovoItem, setSubconjuntoNovoItem] = useState('');
  const [adicionandoItem, setAdicionandoItem] = useState(false);

  const [zonaEscolhida, setZonaEscolhida] = useState<string>('');
  const [trocandoZona, setTrocandoZona] = useState(false);

  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);

  const [historico, setHistorico] = useState<AlteracaoOrdemPremontagem[] | null>(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const itemPorId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  const idsNoRomaneio = useMemo(() => new Set(itensOrdem.map((i) => i.item_id)), [itensOrdem]);
  const itensDisponiveis = useMemo(() => {
    const termo = buscaItem.trim().toLowerCase();
    if (!termo) return [];
    return itens
      .filter((i) => !idsNoRomaneio.has(i.id))
      .filter((i) => i.part_number.toLowerCase().includes(termo) || (i.descricao || i.description || '').toLowerCase().includes(termo))
      .slice(0, 20);
  }, [itens, idsNoRomaneio, buscaItem]);

  const zonasPossiveis = zonasDoTramo(ordem.tramo as Tramo) ?? [];
  const zonaAtual = zonaPorId(ordem.tramo as Tramo, ordem.zona);
  const podeTrocarZona = zonasPossiveis.length > 0 && ordem.status === 'em_processamento';
  const separacaoConfirmada = !!ordem.separacao_confirmada_em;

  const carregarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      setHistorico(await listarAlteracoesPremontagem(ordem.id));
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar o histórico de alterações.');
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const salvarCabecalho = async () => {
    const kits = parseInt(quantidadeKits, 10);
    if (!Number.isFinite(kits) || kits <= 0) {
      toast.error('Quantidade de kits deve ser maior que zero.');
      return;
    }
    setSalvandoCabecalho(true);
    try {
      await editarCabecalhoPremontagem(ordem.id, { observacao: observacao.trim() || null, quantidade_kits: kits }, usuario);
      toast.success('Cabeçalho da ordem atualizado.');
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível salvar o cabeçalho.');
    } finally {
      setSalvandoCabecalho(false);
    }
  };

  const salvarItem = async (itemId: string) => {
    const bruto = qtdEmEdicao[itemId];
    const valor = Number(String(bruto).replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      toast.error('Quantidade inválida.');
      return;
    }
    setSalvandoItemId(itemId);
    try {
      await editarItemPremontagem(itemId, valor, usuario);
      setItensOrdem((atual) => atual.map((i) => (i.id === itemId ? { ...i, qtd_separada: valor, separado: valor > 0 } : i)));
      setQtdEmEdicao((atual) => { const { [itemId]: _omit, ...resto } = atual; return resto; });
      toast.success('Quantidade corrigida — estoque ajustado.');
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível corrigir o item.');
    } finally {
      setSalvandoItemId(null);
    }
  };

  const adicionarItem = async () => {
    const item = itemPorId.get(itemNovoId);
    const qtd = Number(qtdNovoItem.replace(',', '.'));
    if (!item) { toast.error('Escolha um item.'); return; }
    if (!Number.isFinite(qtd) || qtd <= 0) { toast.error('Quantidade deve ser maior que zero.'); return; }

    setAdicionandoItem(true);
    try {
      const novoId = await adicionarItemPremontagem(
        ordem.id,
        { item_id: item.id, subconjunto: subconjuntoNovoItem.trim() || null, qtd_total: qtd, localizador: item.localizador ?? null },
        usuario,
      );
      const novoItem: ProjOrdemItem = {
        id: novoId,
        ordem_id: ordem.id,
        item_id: item.id,
        subconjunto: subconjuntoNovoItem.trim() || null,
        qtd_por_kit: ordem.quantidade_kits > 0 ? qtd / ordem.quantidade_kits : qtd,
        qtd_total: qtd,
        localizador: item.localizador ?? null,
        saldo_no_momento: null,
        separado: false,
        qtd_separada: 0,
        separado_em: null,
        separado_por_nome: null,
      };
      setItensOrdem((atual) => [...atual, novoItem]);
      setBuscaItem('');
      setItemNovoId('');
      setQtdNovoItem('');
      setSubconjuntoNovoItem('');
      toast.success(
        separacaoConfirmada
          ? `${item.part_number} adicionado — corrija a quantidade abaixo para debitar o estoque.`
          : `${item.part_number} adicionado ao romaneio — aparece na separação física normal.`,
      );
      onSalvo();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível adicionar o item.');
    } finally {
      setAdicionandoItem(false);
    }
  };

  /** Recalcula o romaneio da zona nova, no mesmo formato que a abertura de ordem já usa. */
  const montarItensDaZona = (zona: ZonaDef): TrocarZonaItemInput[] | null => {
    const consumo = consumoDaZona(arvore, ordem.tramo as Tramo, zona);
    const grupos = subconjuntosDoTramo(new Map([[ordem.tramo as Tramo, consumo]]), ordem.tramo as Tramo);
    const semCadastro: string[] = [];
    const payload: TrocarZonaItemInput[] = [];

    for (const g of grupos) {
      for (const i of g.itens) {
        if (itemPorPn.get(i.partNumberNorm)?.ignorar_premontagem) continue;
        const item = itemPorPn.get(i.partNumberNorm);
        if (!item) { semCadastro.push(i.partNumber); continue; }
        payload.push({
          item_id: item.id,
          subconjunto: g.nome === 'Avulsos do tramo' ? null : g.nome,
          qtd_por_kit: i.qtdPorTorre,
          qtd_total: i.qtdPorTorre * ordem.quantidade_kits,
          localizador: item.localizador ?? null,
        });
      }
    }

    if (semCadastro.length) {
      toast.error(`${semCadastro.length} item(ns) desta zona não têm cadastro no catálogo (${semCadastro.slice(0, 3).join(', ')}…) — avise a engenharia antes de trocar.`);
      return null;
    }
    return payload;
  };

  const confirmarTrocaZona = async () => {
    const zona = zonasPossiveis.find((z) => z.id === zonaEscolhida);
    if (!zona) { toast.error('Escolha a nova zona.'); return; }
    const itensNovos = montarItensDaZona(zona);
    if (!itensNovos) return;
    if (!itensNovos.length) { toast.error('A zona escolhida não tem itens no romaneio.'); return; }

    const ok = window.confirm(
      `Trocar para "${zona.rotulo}" desfaz toda a separação já feita nesta ordem — o estoque debitado será devolvido e será preciso separar de novo. Confirmar?`,
    );
    if (!ok) return;

    setTrocandoZona(true);
    try {
      await trocarZonaPremontagem(ordem.id, zona.id, itensNovos, usuario);
      toast.success(`Zona trocada para "${zona.rotulo}" — separação reaberta.`);
      onSalvo();
      onFechar();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível trocar a zona.');
    } finally {
      setTrocandoZona(false);
    }
  };

  const confirmarCancelamentoOrdem = async () => {
    setCancelando(true);
    try {
      await cancelarOrdemPremontagem(ordem.id, motivoCancelamento.trim(), usuario);
      toast.success('Ordem cancelada — estoque devolvido ao almoxarifado.');
      onSalvo();
      onFechar();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível cancelar a ordem.');
    } finally {
      setCancelando(false);
    }
  };

  return (
    <Modal onClose={onFechar} maxWidth="max-w-2xl" ariaLabel="Editar ordem de pré-montagem" disableOutsideClose>
      <ModalHeader onClose={onFechar}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Editar ordem — {ordem.codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Alterações ficam registradas no histórico desta ordem, com quem editou e quando.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-5">
          {/* Cabeçalho */}
          <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--hairline)' }}>
            <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>Cabeçalho</p>
            <Campo rotulo="Quantidade de kits">
              <input
                value={quantidadeKits}
                onChange={(e) => setQuantidadeKits(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                className={inputCls()}
              />
            </Campo>
            <Campo rotulo="Observação">
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls()} />
            </Campo>
            <div className="flex justify-end">
              <button
                onClick={() => void salvarCabecalho()}
                disabled={salvandoCabecalho}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-white disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                {salvandoCabecalho ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar cabeçalho
              </button>
            </div>
          </div>

          {/* Adicionar item ao romaneio */}
          {ordem.status === 'em_processamento' && (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>Adicionar item ao romaneio</p>
              <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {separacaoConfirmada
                  ? 'Item esquecido na abertura. Não debita sozinho — corrija a quantidade dele na lista abaixo para debitar.'
                  : 'Item esquecido na abertura. Aparece na separação física normal, junto com os demais.'}
              </p>
              <div className="relative">
                <input
                  value={buscaItem}
                  onChange={(e) => { setBuscaItem(e.target.value); setItemNovoId(''); }}
                  placeholder="Buscar por part number ou descrição…"
                  className={inputCls()}
                />
                {itensDisponiveis.length > 0 && !itemNovoId && (
                  <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                    {itensDisponiveis.map((i) => (
                      <li key={i.id}>
                        <button
                          onClick={() => { setItemNovoId(i.id); setBuscaItem(`${i.part_number} — ${i.descricao || i.description || ''}`); }}
                          className="w-full text-left px-3 py-1.5 text-xs cursor-pointer hover:opacity-80"
                          style={{ color: 'var(--ink-primary)' }}
                        >
                          <span className="font-bold">{i.part_number}</span>{' '}
                          <span style={{ color: 'var(--ink-muted)' }}>{i.descricao || i.description || ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {itemNovoId && (
                <div className="flex items-center gap-2">
                  <input
                    value={qtdNovoItem}
                    onChange={(e) => setQtdNovoItem(e.target.value)}
                    placeholder="Quantidade"
                    inputMode="decimal"
                    className="w-28 rounded border px-2 py-1.5 text-xs text-right tabular-nums font-bold"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                  />
                  <input
                    value={subconjuntoNovoItem}
                    onChange={(e) => setSubconjuntoNovoItem(e.target.value)}
                    placeholder="Subconjunto (opcional)"
                    className={`${inputCls()} flex-1`}
                  />
                  <button
                    onClick={() => void adicionarItem()}
                    disabled={adicionandoItem}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-white disabled:opacity-50"
                    style={{ background: 'var(--brand)' }}
                  >
                    {adicionandoItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Itens — correção pós-confirmação (inclui os recém-adicionados, ainda com qtd 0) */}
          {separacaoConfirmada && (
            <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>Itens do romaneio</p>
              <p className="text-[11px]" style={{ color: 'var(--abc-b)' }}>
                Esta ordem já confirmou a separação — mudar a quantidade de um item aqui ajusta o estoque na hora (estorna o débito antigo, se houver, e lança o novo).
              </p>
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {itensOrdem.map((oi) => {
                  const item = itemPorId.get(oi.item_id);
                  const emEdicao = qtdEmEdicao[oi.id] !== undefined;
                  return (
                    <li key={oi.id} className="flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate" style={{ color: 'var(--ink-primary)' }}>{item?.part_number ?? oi.item_id}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>
                          {item?.descricao || item?.description || '—'}
                          {!oi.separado && <span style={{ color: 'var(--abc-b)' }}> · ainda não debitado</span>}
                        </p>
                      </div>
                      <input
                        value={emEdicao ? qtdEmEdicao[oi.id] : String(oi.qtd_separada)}
                        onChange={(e) => setQtdEmEdicao((a) => ({ ...a, [oi.id]: e.target.value }))}
                        inputMode="decimal"
                        className="w-20 rounded border px-2 py-1 text-xs text-right tabular-nums font-bold"
                        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
                      />
                      <button
                        onClick={() => void salvarItem(oi.id)}
                        disabled={!emEdicao || salvandoItemId === oi.id}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border disabled:opacity-40"
                        style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
                      >
                        {salvandoItemId === oi.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Corrigir'}
                      </button>
                    </li>
                  );
                })}
                {!itensOrdem.length && (
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Nenhum item nesta ordem.</p>
                )}
              </ul>
            </div>
          )}

          {/* Ações de risco */}
          {ordem.status === 'em_processamento' && (
            <div className="rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/10 p-3 space-y-4">
              <p className="text-xs font-extrabold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Ações de risco
              </p>

              {podeTrocarZona && (
                <div className="space-y-2">
                  <p className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                    Zona atual: <strong>{zonaAtual?.rotulo ?? '—'}</strong>. Trocar recalcula o romaneio do zero e desfaz toda separação já feita.
                  </p>
                  <div className="flex items-center gap-2">
                    <select value={zonaEscolhida} onChange={(e) => setZonaEscolhida(e.target.value)} className={inputCls()}>
                      <option value="">Escolha a nova zona…</option>
                      {zonasPossiveis.filter((z) => z.id !== ordem.zona).map((z) => (
                        <option key={z.id} value={z.id}>{z.rotulo}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => void confirmarTrocaZona()}
                      disabled={!zonaEscolhida || trocandoZona}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border disabled:opacity-40"
                      style={{ borderColor: 'var(--abc-b)', color: 'var(--abc-b)' }}
                    >
                      {trocandoZona ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Trocar zona
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--hairline)' }}>
                {!confirmarCancelamento ? (
                  <button
                    onClick={() => setConfirmarCancelamento(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border"
                    style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancelar esta ordem
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] text-rose-700 dark:text-rose-300">
                      Cancelar devolve ao almoxarifado tudo que esta ordem já debitou. Não é possível desfazer.
                    </p>
                    <input
                      value={motivoCancelamento}
                      onChange={(e) => setMotivoCancelamento(e.target.value)}
                      placeholder="Motivo do cancelamento (opcional)"
                      className={inputCls()}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmarCancelamento(false)}
                        disabled={cancelando}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border disabled:opacity-50"
                        style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                      >
                        Voltar
                      </button>
                      <button
                        onClick={() => void confirmarCancelamentoOrdem()}
                        disabled={cancelando}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-white disabled:opacity-50"
                        style={{ background: 'var(--status-critical)' }}
                      >
                        {cancelando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        Confirmar cancelamento
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Histórico de alterações */}
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>Histórico de alterações</p>
              {historico === null && (
                <button
                  onClick={() => void carregarHistorico()}
                  disabled={carregandoHistorico}
                  className="text-[11px] font-bold cursor-pointer"
                  style={{ color: 'var(--brand)' }}
                >
                  {carregandoHistorico ? 'Carregando…' : 'Mostrar'}
                </button>
              )}
            </div>
            {historico !== null && (
              historico.length === 0 ? (
                <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>Nenhuma alteração registrada ainda.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                  {historico.map((h) => (
                    <li key={h.id} className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                      <span className="font-bold">{formatDateTimeBR(h.created_at)}</span> · {h.criado_por_nome} — {h.tipo}
                      {h.alteracoes.map((a, idx) => (
                        <span key={idx} className="block ml-3" style={{ color: 'var(--ink-muted)' }}>
                          {a.campo}: {String(a.de ?? '—')} → {String(a.para ?? '—')}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          <X className="h-3.5 w-3.5" /> Fechar
        </button>
      </ModalFooter>
    </Modal>
  );
}

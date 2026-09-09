/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Pré-montagem (F2 separação + F3 apontamento).
 *
 * O romaneio de um kit T1 tem ~289 part numbers. Solto, é uma parede de
 * parafusos; agrupado pelo subconjunto da Atlanta ("10481931 - Platform
 * D5081"), vira uma lista que se separa e se confere na bancada.
 *
 * A separação é recusada inteira se faltar UM item — e a recusa diz qual. Era
 * o que a planilha não fazia: ela deixava o estoque ir a -14 e ninguém sabia
 * se era erro de digitação ou ruptura de verdade.
 */

import React, { useMemo, useState } from 'react';
import { Check, ClipboardList, Loader2, PackageX, Plus, Wrench } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import { formatDateTimeBR, formatInt, formatQtd } from '../../lib/format';
import { PREFIXO, TRAMOS, type Tramo } from '../../lib/projetos';
import { subconjuntosDoTramo } from '../../lib/projetosBom';
import { concluirPremontagem, criarOrdemPremontagem, proximoCodigo, ProjSaldoInsuficienteError } from '../../lib/projetosApi';
import type { Profile, ProjOrdemPremontagem } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos; user: Profile; podeLancar: boolean }

type Faltante = ProjSaldoInsuficienteError['faltantes'][number];

export default function PainelPremontagem({ dados, user, podeLancar }: Props) {
  const toast = useToast();
  const { consumo, itemPorPn, saldoPorPn, ordens, tramosDoSubprojeto, subprojetoAtivo, autonomia, loading, recarregar } = dados;

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tramo, setTramo] = useState<Tramo>('T1');
  const [alvos, setAlvos] = useState<string[]>([]);
  const [observacao, setObservacao] = useState('');
  const [faltantes, setFaltantes] = useState<Faltante[]>([]);
  const [ordemApontar, setOrdemApontar] = useState<ProjOrdemPremontagem | null>(null);

  /** Tramos livres do subprojeto para o tramo escolhido. */
  const disponiveis = useMemo(
    () => tramosDoSubprojeto.filter((t) => t.tramo === tramo && t.status === 'pendente'),
    [tramosDoSubprojeto, tramo],
  );

  const grupos = useMemo(() => subconjuntosDoTramo(consumo, tramo), [consumo, tramo]);
  const kits = alvos.length;

  const romaneio = useMemo(
    () =>
      grupos.map((g) => ({
        ...g,
        itens: g.itens.map((i) => {
          const item = itemPorPn.get(i.partNumberNorm);
          const saldo = saldoPorPn.get(i.partNumberNorm) ?? 0;
          const total = i.qtdPorTorre * kits;
          return { ...i, itemId: item?.id ?? null, localizador: item?.localizador ?? null, saldo, total, falta: total > saldo };
        }),
      })),
    [grupos, itemPorPn, saldoPorPn, kits],
  );

  const semCadastro = useMemo(
    () => romaneio.flatMap((g) => g.itens).filter((i) => !i.itemId),
    [romaneio],
  );

  const limpar = () => { setAlvos([]); setObservacao(''); setFaltantes([]); };

  const gerar = async () => {
    if (!alvos.length) { toast.error('Escolha ao menos um tramo alvo.'); return; }
    if (semCadastro.length) {
      toast.error(`${semCadastro.length} item(ns) do romaneio não estão no catálogo — avise a engenharia.`);
      return;
    }
    setSalvando(true);
    setFaltantes([]);
    try {
      const codigo = await proximoCodigo(PREFIXO.ordem);
      await criarOrdemPremontagem({
        codigo,
        subprojeto_id: subprojetoAtivo?.id ?? null,
        tramo,
        quantidade_kits: kits,
        observacao: observacao.trim() || null,
        criado_por_id: user.id,
        criado_por_nome: user.name,
        itens: romaneio.flatMap((g) =>
          g.itens.map((i) => ({
            item_id: i.itemId!,
            subconjunto: g.nome === 'Avulsos do tramo' ? null : g.nome,
            qtd_por_kit: i.qtdPorTorre,
            qtd_total: i.total,
            localizador: i.localizador,
          })),
        ),
        alvos,
      });
      toast.success(`Ordem ${codigo} gerada — ${kits} kit(s) de ${tramo} em separação.`);
      setAberto(false);
      limpar();
      await recarregar(true);
    } catch (err: any) {
      if (err instanceof ProjSaldoInsuficienteError) {
        setFaltantes(err.faltantes);
        toast.error(`Separação bloqueada: ${err.faltantes.length} item(ns) sem saldo.`);
      } else {
        console.error(err);
        toast.error(err?.message || 'Não foi possível gerar a ordem.');
      }
    } finally {
      setSalvando(false);
    }
  };

  const apontar = async (ordem: ProjOrdemPremontagem, marcados: Record<string, boolean>, nc: string) => {
    const escolhidos = (ordem.kits ?? []).filter((k) => k.status === 'em_premontagem' && marcados[k.tramo_unidade_id]);
    if (!escolhidos.length) { toast.error('Marque ao menos um kit concluído.'); return; }
    setSalvando(true);
    try {
      const codigo = await proximoCodigo(PREFIXO.kit);
      const r = await concluirPremontagem(
        ordem.id,
        escolhidos.map((k) => ({
          tramo_unidade_id: k.tramo_unidade_id,
          codigo,
          qualidade_ok: !nc.trim(),
          nao_conformidade: nc.trim() || null,
        })),
        { nome: user.name },
      );
      toast.success(`${r.kits_concluidos} kit(s) no buffer${r.kits_restantes ? ` · ${r.kits_restantes} restante(s)` : ' · ordem concluída'}.`);
      setOrdemApontar(null);
      await recarregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível apontar a conclusão.');
    } finally {
      setSalvando(false);
    }
  };

  const emProcessamento = ordens.filter((o) => o.status === 'em_processamento');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(emProcessamento.length)} ordem(ns) em separação · {formatInt(ordens.length)} no total.
        </p>
        {podeLancar ? (
          <button
            onClick={() => { limpar(); setAberto(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="h-4 w-4" /> Nova ordem de separação
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Consulta apenas. Separar exige a permissão “Projetos: separar romaneio e apontar pré-montagem”.
          </p>
        )}
      </div>

      {loading && <div className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !ordens.length && (
        <TableEmpty
          icon={Wrench}
          title="Nenhuma ordem de pré-montagem"
          hint="Uma ordem debita as peças do almoxarifado e abre um kit por tramo alvo. Só é aceita com saldo para o romaneio inteiro."
        />
      )}

      {!loading && ordens.length > 0 && (
        <div className="space-y-3">
          {ordens.map((o) => {
            const prontos = (o.kits ?? []).filter((k) => k.status !== 'em_premontagem').length;
            const total = (o.kits ?? []).length;
            return (
              <div key={o.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
                      {o.codigo}
                      <Etiqueta status={o.status} />
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                      {o.quantidade_kits} kit(s) de {o.tramo} · {formatInt(o.itens?.length ?? 0)} itens no romaneio ·
                      {' '}aberta por {o.criado_por_nome} em {formatDateTimeBR(o.created_at)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-secondary)' }}>
                      {(o.kits ?? []).map((k) => k.rastreio).join(', ') || '—'}
                    </p>
                    {o.observacao && <p className="text-[11px] mt-1 italic" style={{ color: 'var(--ink-muted)' }}>{o.observacao}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                      {prontos}/{total} apontado(s)
                    </span>
                    {podeLancar && o.status === 'em_processamento' && (
                      <button
                        onClick={() => setOrdemApontar(o)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-80"
                        style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
                      >
                        <Check className="h-3.5 w-3.5" /> Apontar conclusão
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* F2 — nova ordem */}
      {aberto && (
        <Modal onClose={() => !salvando && setAberto(false)} maxWidth="max-w-4xl" ariaLabel="Nova ordem de separação" disableOutsideClose>
          <ModalHeader onClose={() => !salvando && setAberto(false)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Ordem de saída para pré-montagem</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              O romaneio é congelado no envio — a lista não muda debaixo de quem está separando.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Tramo alvo">
                  <select
                    value={tramo}
                    onChange={(e) => { setTramo(e.target.value as Tramo); setAlvos([]); setFaltantes([]); }}
                    className={inputCls()}
                  >
                    {TRAMOS.map((t) => {
                      const a = autonomia.find((x) => x.tramo === t);
                      return <option key={t} value={t}>{t} — {formatInt(a?.kitsPossiveis ?? 0)} kit(s) separáveis hoje</option>;
                    })}
                  </select>
                </Campo>
                <div className="flex items-end pb-1">
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {formatInt(disponiveis.length)} unidade(s) de {tramo} disponível(is) neste subprojeto.
                  </p>
                </div>
              </div>

              <Campo rotulo={`Tramos a montar (${kits} selecionado(s))`}>
                {disponiveis.length ? (
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                    {disponiveis.map((t) => {
                      const marcado = alvos.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => setAlvos((a) => (marcado ? a.filter((x) => x !== t.id) : [...a, t.id]))}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition-colors"
                          style={{
                            borderColor: marcado ? 'var(--brand)' : 'var(--hairline)',
                            background: marcado ? 'var(--brand)' : 'transparent',
                            color: marcado ? '#fff' : 'var(--ink-secondary)',
                          }}
                          title={`Torre ${t.torre_numero}`}
                        >
                          {t.id}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                    Nenhuma unidade de {tramo} pendente neste subprojeto — todas já estão em processo ou entregues.
                  </p>
                )}
              </Campo>

              {faltantes.length > 0 && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20 p-3">
                  <p className="text-xs font-extrabold flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                    <PackageX className="h-4 w-4" /> Separação bloqueada — {faltantes.length} item(ns) sem saldo
                  </p>
                  <div className="mt-2 max-h-48 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-rose-700/80 dark:text-rose-300/70">
                          <th className="text-left py-1">Part number</th>
                          <th className="text-right py-1">Precisa</th>
                          <th className="text-right py-1">Tem</th>
                          <th className="text-right py-1">Falta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faltantes.map((f) => (
                          <tr key={f.item_id} className="border-t border-rose-200/60 dark:border-rose-900/40">
                            <td className="py-1 text-rose-900 dark:text-rose-200">
                              <span className="font-bold">{f.part_number}</span>
                              <span className="ml-1.5 opacity-70">{f.descricao}</span>
                            </td>
                            <td className="py-1 text-right tabular-nums">{formatQtd(Number(f.necessario))}</td>
                            <td className="py-1 text-right tabular-nums">{formatQtd(Number(f.saldo))}</td>
                            <td className="py-1 text-right tabular-nums font-bold text-rose-700 dark:text-rose-300">{formatQtd(Number(f.falta))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {semCadastro.length > 0 && (
                <p className="text-xs px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300">
                  {semCadastro.length} item(ns) do romaneio não têm cadastro no catálogo do projeto
                  ({semCadastro.slice(0, 3).map((i) => i.partNumber).join(', ')}…) — a ordem não pode ser gerada.
                </p>
              )}

              {kits > 0 && (
                <div className="rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                  <p className="px-3 py-2 text-xs font-extrabold border-b" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                    Romaneio — {formatInt(romaneio.reduce((s, g) => s + g.itens.length, 0))} itens em {romaneio.length} subconjunto(s)
                  </p>
                  <div className="max-h-72 overflow-y-auto">
                    {romaneio.map((g) => (
                      <div key={g.nome}>
                        <p className="px-3 py-1.5 text-[11px] font-bold sticky top-0" style={{ background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}>
                          {g.nome} · {g.itens.length} itens
                        </p>
                        <table className="w-full text-[11px]">
                          <tbody>
                            {g.itens.map((i) => (
                              <tr key={i.partNumberNorm} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                                <td className="px-3 py-1" style={{ color: 'var(--ink-primary)' }}>
                                  <span className="font-bold">{i.partNumber}</span>
                                  <span className="ml-1.5" style={{ color: 'var(--ink-muted)' }}>{i.descricao}</span>
                                </td>
                                <td className="px-2 py-1 whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>{i.localizador || '—'}</td>
                                <td className="px-2 py-1 text-right tabular-nums" style={{ color: 'var(--ink-muted)' }}>{formatQtd(i.qtdPorTorre)}/kit</td>
                                <td className="px-2 py-1 text-right tabular-nums font-bold" style={{ color: 'var(--ink-primary)' }}>{formatQtd(i.total)}</td>
                                <td className="px-3 py-1 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: i.falta ? 'var(--abc-c)' : 'var(--abc-a)' }}>
                                  saldo {formatQtd(i.saldo)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Campo rotulo="Observação (opcional)">
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls()} />
              </Campo>
            </div>
          </ModalBody>

          <ModalFooter>
            <button onClick={() => setAberto(false)} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => void gerar()}
              disabled={salvando || !kits}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Gerar ordem e debitar
            </button>
          </ModalFooter>
        </Modal>
      )}

      {ordemApontar && (
        <ModalApontamento
          ordem={ordemApontar}
          salvando={salvando}
          onCancelar={() => setOrdemApontar(null)}
          onConfirmar={(marcados, nc) => void apontar(ordemApontar, marcados, nc)}
        />
      )}
    </div>
  );
}

/** F3 — apontamento de conclusão. Kit por kit, porque a bancada termina um de cada vez. */
function ModalApontamento({
  ordem, salvando, onCancelar, onConfirmar,
}: {
  ordem: ProjOrdemPremontagem;
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (marcados: Record<string, boolean>, naoConformidade: string) => void;
}) {
  const pendentes = (ordem.kits ?? []).filter((k) => k.status === 'em_premontagem');
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    Object.fromEntries(pendentes.map((k) => [k.tramo_unidade_id, true])),
  );
  const [nc, setNc] = useState('');

  const subconjuntos = Array.from(new Set((ordem.itens ?? []).map((i) => i.subconjunto).filter(Boolean))) as string[];

  return (
    <Modal onClose={onCancelar} maxWidth="max-w-2xl" ariaLabel="Apontar conclusão da pré-montagem" disableOutsideClose>
      <ModalHeader onClose={onCancelar}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Conclusão da pré-montagem — {ordem.codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Confirmar move o kit para o buffer, pronto para a produção chamar.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          <Campo rotulo="Kits concluídos">
            <div className="space-y-1.5">
              {pendentes.map((k) => (
                <label key={k.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: 'var(--hairline)' }}>
                  <input
                    type="checkbox"
                    checked={!!marcados[k.tramo_unidade_id]}
                    onChange={(e) => setMarcados((m) => ({ ...m, [k.tramo_unidade_id]: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  <span className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{k.rastreio}</span>
                </label>
              ))}
              {!pendentes.length && <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Todos os kits desta ordem já foram apontados.</p>}
            </div>
          </Campo>

          {subconjuntos.length > 0 && (
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                Subconjuntos deste kit — confira antes de confirmar
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {subconjuntos.map((s) => (
                  <li key={s} className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
                    <Check className="h-3 w-3 shrink-0" style={{ color: 'var(--abc-a)' }} /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Campo rotulo="Não-conformidade (deixe vazio se passou na qualidade)">
            <textarea value={nc} onChange={(e) => setNc(e.target.value)} rows={2} className={inputCls()} placeholder="Ex.: chapa 03 com empeno leve, liberada pela engenharia" />
          </Campo>
        </div>
      </ModalBody>

      <ModalFooter>
        <button onClick={onCancelar} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Cancelar
        </button>
        <button
          onClick={() => onConfirmar(marcados, nc)}
          disabled={salvando || !pendentes.length}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirmar no buffer
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Etiqueta({ status }: { status: string }) {
  const cor = status === 'concluida' ? 'var(--abc-a)' : status === 'cancelada' ? 'var(--ink-muted)' : 'var(--abc-b)';
  const rotulo = status === 'concluida' ? 'Concluída' : status === 'cancelada' ? 'Cancelada' : 'Em processamento';
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: cor, color: '#fff' }}>{rotulo}</span>
  );
}

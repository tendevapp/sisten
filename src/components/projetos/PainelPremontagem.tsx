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
 * T1 vai além: sua BOM sustenta 3 bancadas físicas simultâneas (Escada de
 * Acesso, Plataforma Inferior, Plataforma Superior/Média) mais um resíduo
 * estrutural/elétrico — ver `projetosZonas.ts`. Escolher uma zona separa só
 * a fatia daquele grupo, debitando o estoque igual a uma ordem normal, mas
 * reaproveitando o MESMO kit do tramo entre as 3-4 zonas (o RPC permite
 * reabrir um tramo `em_premontagem` só para uma zona ainda não separada).
 *
 * O apontamento de conclusão (F3) pode ser feito completo OU parcial — com
 * zona faltando, com nem todos os kits da ordem marcados. Nada bloqueia: o
 * que foi apontado vira saldo no buffer de kits para a produção na hora: o
 * resto fica como PENDÊNCIA ABERTA, visível no card da ordem e anotada na
 * não-conformidade do kit, até alguém completar a zona/kit que faltou.
 *
 * Itens marcados como "desconsiderados" (chapa/placa de aço, flange, cerca
 * quadrada — cadastro em `CadastroItensDesconsiderados`) nunca entram no
 * romaneio: não travam a liberação por saldo, não são debitados.
 *
 * A ordem NÃO debita ao ser aberta — só congela o romaneio e cria o kit.
 * Quem separa fisicamente vai dando check item a item (parcial inclusive);
 * só ao confirmar a separação o sistema debita o que foi de fato separado.
 */

import React, { useMemo, useState } from 'react';
import { AlertCircle, Check, ClipboardList, FileSpreadsheet, FileText, Loader2, PackageX, PackageCheck, Plus, Wrench } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import CadastroItensDesconsiderados from './CadastroItensDesconsiderados';
import { formatDateTimeBR, formatInt, formatQtd } from '../../lib/format';
import { PREFIXO, TRAMOS, type Tramo } from '../../lib/projetos';
import { subconjuntosDoTramo, type ConsumoItem } from '../../lib/projetosBom';
import { zonasDoTramo, zonaPorId, zonasPendentes, consumoDaZona, rotuloTramoComZona, type ZonaDef, type ZonaId } from '../../lib/projetosZonas';
import { exportarRomaneioExcel, exportarRomaneioPdf } from '../../lib/projetosRomaneioExport';
import {
  concluirPremontagem, confirmarSeparacaoPremontagem, criarOrdemPremontagem,
  marcarItemSeparado, proximoCodigo, ProjSaldoInsuficienteError,
} from '../../lib/projetosApi';
import type { Profile, ProjItem, ProjOrdemItem, ProjOrdemPremontagem } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos; user: Profile; podeLancar: boolean }

type Faltante = ProjSaldoInsuficienteError['faltantes'][number];

/** `[3,4,5]` → "Níveis 3–5"; `[4]` → "Nível 4". Não existe "o nível" de um item que atravessa vários grupos. */
function formatarNiveis(niveis: number[]): string {
  if (!niveis.length) return '—';
  if (niveis.length === 1) return `Nível ${niveis[0]}`;
  const contiguo = niveis.every((n, i) => i === 0 || n === niveis[i - 1] + 1);
  return contiguo ? `Níveis ${niveis[0]}–${niveis[niveis.length - 1]}` : `Níveis ${niveis.join(', ')}`;
}

/** Opção do seletor de alvo: um tramo sem zona, ou uma zona específica de um tramo com split. */
interface OpcaoAlvo {
  chave: string;
  tramo: Tramo;
  zona: ZonaDef | null;
  rotulo: string;
}

const OPCOES_ALVO: OpcaoAlvo[] = TRAMOS.flatMap((tramo) => {
  const zonas = zonasDoTramo(tramo);
  if (!zonas) return [{ chave: tramo, tramo, zona: null, rotulo: tramo }];
  return zonas.map((zona) => ({ chave: `${tramo}::${zona.id}`, tramo, zona, rotulo: rotuloTramoComZona(tramo, zona) }));
});

export default function PainelPremontagem({ dados, user, podeLancar }: Props) {
  const toast = useToast();
  const { arvore, consumo, itens, itemPorPn, saldoPorPn, ordens, tramosDoSubprojeto, subprojetoAtivo, autonomia, loading, recarregar } = dados;

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [opcaoChave, setOpcaoChave] = useState<string>(OPCOES_ALVO[0].chave);
  const [alvos, setAlvos] = useState<string[]>([]);
  const [observacao, setObservacao] = useState('');
  const [faltantes, setFaltantes] = useState<Faltante[]>([]);
  const [ordemApontar, setOrdemApontar] = useState<ProjOrdemPremontagem | null>(null);
  const [ordemSeparar, setOrdemSeparar] = useState<ProjOrdemPremontagem | null>(null);

  const opcao = OPCOES_ALVO.find((o) => o.chave === opcaoChave) ?? OPCOES_ALVO[0];
  const { tramo, zona } = opcao;

  const itemPorId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  /** Por tramo_unidade_id: quais zonas já têm ordem registrada (não excluída). */
  const zonasSeparadasPorUnidade = useMemo(() => {
    const m = new Map<string, Set<ZonaId>>();
    for (const o of ordens) {
      if (!o.zona) continue;
      for (const a of o.alvos ?? []) {
        const atual = m.get(a.tramo_unidade_id) ?? new Set<ZonaId>();
        atual.add(o.zona as ZonaId);
        m.set(a.tramo_unidade_id, atual);
      }
    }
    return m;
  }, [ordens]);

  /** Tramos disponíveis para a opção escolhida: pendentes, ou já em_premontagem com essa zona específica ainda faltando. */
  const disponiveis = useMemo(
    () =>
      tramosDoSubprojeto.filter((t) => {
        if (t.tramo !== tramo) return false;
        if (t.status === 'pendente') return true;
        if (zona && t.status === 'em_premontagem') {
          return !zonasSeparadasPorUnidade.get(t.id)?.has(zona.id);
        }
        return false;
      }),
    [tramosDoSubprojeto, tramo, zona, zonasSeparadasPorUnidade],
  );

  const consumoDoAlvo = useMemo<Map<string, ConsumoItem>>(
    () => (zona ? consumoDaZona(arvore, tramo, zona) : consumo.get(tramo) ?? new Map()),
    [arvore, consumo, tramo, zona],
  );

  /** Itens marcados como desconsiderados (cadastro) nunca entram no romaneio de uma OS. */
  const { consumoUtil, desconsiderados } = useMemo(() => {
    const util = new Map<string, ConsumoItem>();
    const fora: ConsumoItem[] = [];
    for (const [pn, item] of consumoDoAlvo) {
      if (itemPorPn.get(pn)?.ignorar_premontagem) fora.push(item);
      else util.set(pn, item);
    }
    return { consumoUtil: util, desconsiderados: fora };
  }, [consumoDoAlvo, itemPorPn]);

  const grupos = useMemo(
    () => subconjuntosDoTramo(new Map([[tramo, consumoUtil]]), tramo),
    [consumoUtil, tramo],
  );
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
        zona: zona?.id ?? null,
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
      toast.success(`Ordem ${codigo} aberta — ${kits} kit(s) de ${opcao.rotulo}. Separe os itens e confirme para debitar.`);
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

  /** Zonas que ainda faltam para o(s) tramo(s) alvo desta ordem terminarem de separar. */
  const zonasFaltantesDaOrdem = (ordem: ProjOrdemPremontagem): ZonaDef[] => {
    const t = ordem.tramo as Tramo;
    if (!zonasDoTramo(t)) return [];
    const alvosIds = (ordem.alvos ?? []).map((a) => a.tramo_unidade_id);
    const faltantes = new Map<ZonaId, ZonaDef>();
    for (const id of alvosIds) {
      const separadas = zonasSeparadasPorUnidade.get(id) ?? new Set<ZonaId>();
      for (const z of zonasPendentes(t, separadas)) faltantes.set(z.id, z);
    }
    return Array.from(faltantes.values());
  };

  const apontar = async (ordem: ProjOrdemPremontagem, marcados: Record<string, boolean>, nc: string, pendenciaZonas: ZonaDef[]) => {
    const escolhidos = (ordem.kits ?? []).filter((k) => k.status === 'em_premontagem' && marcados[k.tramo_unidade_id]);
    if (!escolhidos.length) { toast.error('Marque ao menos um kit concluído.'); return; }
    setSalvando(true);
    try {
      const codigo = await proximoCodigo(PREFIXO.kit);
      // Zona faltando não bloqueia — vira nota de pendência aberta no kit,
      // visível em toda tela que mostra não-conformidade (F4 inclusive).
      const notaPendencia = pendenciaZonas.length
        ? `Pendência aberta: falta separar ${pendenciaZonas.map((z) => z.rotulo).join(', ')}.`
        : '';
      const observacaoFinal = [notaPendencia, nc.trim()].filter(Boolean).join(' ');
      const r = await concluirPremontagem(
        ordem.id,
        escolhidos.map((k) => ({
          tramo_unidade_id: k.tramo_unidade_id,
          codigo,
          qualidade_ok: !observacaoFinal,
          nao_conformidade: observacaoFinal || null,
        })),
        { nome: user.name },
      );
      const avisoPendencia = pendenciaZonas.length ? ` — enviado parcial, pendência aberta (${pendenciaZonas.map((z) => z.rotulo).join(', ')})` : '';
      toast.success(`${r.kits_concluidos} kit(s) no buffer${r.kits_restantes ? ` · ${r.kits_restantes} restante(s)` : ' · ordem concluída'}${avisoPendencia}.`);
      setOrdemApontar(null);
      await recarregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível apontar a conclusão.');
    } finally {
      setSalvando(false);
    }
  };

  const emProcessamento = ordens.filter((o) => o.status === 'em_processamento');
  const aguardandoSeparacao = emProcessamento.filter((o) => !o.separacao_confirmada_em).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(emProcessamento.length)} ordem(ns) em andamento
          {aguardandoSeparacao > 0 && <> · {formatInt(aguardandoSeparacao)} aguardando separação física</>}
          {' '}· {formatInt(ordens.length)} no total.
        </p>
        <div className="flex items-center gap-2">
          <CadastroItensDesconsiderados itens={itens} onSalvo={() => void recarregar(true)} />
          {podeLancar && (
            <button
              onClick={() => { limpar(); setAberto(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95"
              style={{ background: 'var(--brand)' }}
            >
              <Plus className="h-4 w-4" /> Nova ordem de separação
            </button>
          )}
        </div>
      </div>
      {!podeLancar && (
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Consulta apenas. Separar exige a permissão “Projetos: separar romaneio e apontar pré-montagem”.
        </p>
      )}

      {loading && <div className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !ordens.length && (
        <TableEmpty
          icon={Wrench}
          title="Nenhuma ordem de pré-montagem"
          hint="Uma ordem congela o romaneio e abre o kit; o débito no almoxarifado só acontece quando a separação física é confirmada."
        />
      )}

      {!loading && ordens.length > 0 && (
        <div className="space-y-3">
          {ordens.map((o) => {
            const prontos = (o.kits ?? []).filter((k) => k.status !== 'em_premontagem').length;
            const total = (o.kits ?? []).length;
            const zonaDaOrdem = zonaPorId(o.tramo as Tramo, o.zona);
            const faltamZonas = o.status === 'em_processamento' ? zonasFaltantesDaOrdem(o) : [];
            const separado = (o.itens ?? []).filter((i) => i.separado).length;
            const totalItens = (o.itens ?? []).length;
            return (
              <div key={o.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
                      {o.codigo}
                      <Etiqueta status={o.status} separacaoConfirmada={!!o.separacao_confirmada_em} />
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                      {o.quantidade_kits} kit(s) de {rotuloTramoComZona(o.tramo as Tramo, zonaDaOrdem)} · {formatInt(totalItens)} itens no romaneio ·
                      {' '}aberta por {o.criado_por_nome} em {formatDateTimeBR(o.created_at)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-secondary)' }}>
                      {(o.kits ?? []).map((k) => k.rastreio).join(', ') || '—'}
                    </p>
                    {o.observacao && <p className="text-[11px] mt-1 italic" style={{ color: 'var(--ink-muted)' }}>{o.observacao}</p>}
                    {!o.separacao_confirmada_em && o.status === 'em_processamento' && (
                      <p className="text-[11px] mt-1.5" style={{ color: 'var(--abc-b)' }}>
                        {separado}/{totalItens} item(ns) já com check físico · nada foi debitado ainda.
                      </p>
                    )}
                    {o.separacao_confirmada_em && (
                      <p className="text-[11px] mt-1.5" style={{ color: 'var(--ink-muted)' }}>
                        Separação confirmada por {o.separacao_confirmada_por_nome} em {formatDateTimeBR(o.separacao_confirmada_em)}.
                      </p>
                    )}
                    {faltamZonas.length > 0 && (
                      <p className="text-[11px] mt-1.5 flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Faltam separar: {faltamZonas.map((z) => z.rotulo).join(', ')} — pode apontar parcial mesmo assim; fica como pendência aberta.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => exportarRomaneioExcel(o, arvore, itemPorId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border hover:opacity-80"
                      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                      title="Exportar romaneio em Excel (por níveis + consolidado)"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                    </button>
                    <button
                      onClick={() => void exportarRomaneioPdf(o, arvore, itemPorId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer border hover:opacity-80"
                      style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                      title="Exportar romaneio em PDF (por níveis + consolidado)"
                    >
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </button>
                    {podeLancar && o.status === 'em_processamento' && !o.separacao_confirmada_em && (
                      <button
                        onClick={() => setOrdemSeparar(o)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-80"
                        style={{ borderColor: 'var(--abc-b)', color: 'var(--abc-b)' }}
                      >
                        <PackageCheck className="h-3.5 w-3.5" /> Separar itens
                      </button>
                    )}
                    {podeLancar && o.status === 'em_processamento' && o.separacao_confirmada_em && (
                      <button
                        onClick={() => setOrdemApontar(o)}
                        title={faltamZonas.length > 0 ? `Zona(s) pendente(s): ${faltamZonas.map((z) => z.rotulo).join(', ')} — apontar aqui envia parcial, com pendência aberta` : undefined}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer border hover:opacity-80"
                        style={{ borderColor: faltamZonas.length > 0 ? 'var(--abc-b)' : 'var(--brand)', color: faltamZonas.length > 0 ? 'var(--abc-b)' : 'var(--brand)' }}
                      >
                        <Check className="h-3.5 w-3.5" /> Apontar conclusão{faltamZonas.length > 0 ? ' (parcial)' : ''}
                      </button>
                    )}
                    <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                      {prontos}/{total} apontado(s)
                    </span>
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
              O romaneio é congelado no envio, mas nada é debitado agora — a separação física confirma o débito depois.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Tramo / zona alvo">
                  <select
                    value={opcaoChave}
                    onChange={(e) => { setOpcaoChave(e.target.value); setAlvos([]); setFaltantes([]); }}
                    className={inputCls()}
                  >
                    {OPCOES_ALVO.map((o) => {
                      const a = autonomia.find((x) => x.tramo === o.tramo);
                      return (
                        <option key={o.chave} value={o.chave}>
                          {o.rotulo}{!o.zona ? ` — ${formatInt(a?.kitsPossiveis ?? 0)} kit(s) separáveis hoje` : ''}
                        </option>
                      );
                    })}
                  </select>
                </Campo>
                <div className="flex items-end pb-1">
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {formatInt(disponiveis.length)} unidade(s) de {tramo} disponível(is) para {zona ? zona.rotulo.toLowerCase() : 'separação'} neste subprojeto.
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
                          title={`Torre ${t.torre_numero}${t.status === 'em_premontagem' ? ' — já em separação (outra zona)' : ''}`}
                        >
                          {t.id}{t.status === 'em_premontagem' && '*'}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                    Nenhuma unidade de {tramo} disponível para {zona ? zona.rotulo.toLowerCase() : 'separação'} neste subprojeto — pendente ou com esta zona já separada.
                  </p>
                )}
                {disponiveis.some((t) => t.status === 'em_premontagem') && (
                  <p className="text-[10px] mt-1" style={{ color: 'var(--ink-muted)' }}>* já tem outra zona separada; esta ordem soma mais uma ao mesmo kit.</p>
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

              {desconsiderados.length > 0 && (
                <p className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                  {desconsiderados.length} item(ns) desconsiderado(s) desta OS pelo cadastro ({desconsiderados.slice(0, 3).map((i) => i.partNumber).join(', ')}
                  {desconsiderados.length > 3 ? '…' : ''}) — não entram no romaneio nem no débito.
                </p>
              )}

              {kits > 0 && (
                <div className="rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                  <p className="px-3 py-2 text-xs font-extrabold border-b" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
                    Romaneio de {opcao.rotulo} — {formatInt(romaneio.reduce((s, g) => s + g.itens.length, 0))} itens em {romaneio.length} subconjunto(s)
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
                                <td className="px-2 py-1 whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>{formatarNiveis(i.niveis)}</td>
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
              Abrir ordem
            </button>
          </ModalFooter>
        </Modal>
      )}

      {ordemSeparar && (
        <ModalSeparacao
          ordem={ordemSeparar}
          itemPorId={itemPorId}
          user={user}
          onCancelar={() => setOrdemSeparar(null)}
          onConfirmado={async () => { setOrdemSeparar(null); await recarregar(true); }}
        />
      )}

      {ordemApontar && (
        <ModalApontamento
          ordem={ordemApontar}
          faltamZonas={zonasFaltantesDaOrdem(ordemApontar)}
          salvando={salvando}
          onCancelar={() => setOrdemApontar(null)}
          onConfirmar={(marcados, nc, pendencia) => void apontar(ordemApontar, marcados, nc, pendencia)}
        />
      )}
    </div>
  );
}

/**
 * F2b — separação física: quem está na bancada dá check item a item (com a
 * quantidade que de fato separou) e só então confirma. Cada check já salva
 * na hora (sem debitar); "Confirmar separação" é o único ponto que debita —
 * e alerta antes se algo ficou sem check.
 */
function ModalSeparacao({
  ordem, itemPorId, user, onCancelar, onConfirmado,
}: {
  ordem: ProjOrdemPremontagem;
  itemPorId: Map<string, ProjItem>;
  user: Profile;
  onCancelar: () => void;
  onConfirmado: () => void;
}) {
  const toast = useToast();
  const [itens, setItens] = useState<ProjOrdemItem[]>(ordem.itens ?? []);
  const [marcandoId, setMarcandoId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const separados = itens.filter((i) => i.separado).length;
  const faltam = itens.length - separados;

  const alternar = async (item: ProjOrdemItem, qtd: number) => {
    setMarcandoId(item.id);
    const novoSeparado = !item.separado;
    try {
      await marcarItemSeparado(item.id, novoSeparado, novoSeparado ? qtd : 0, { nome: user.name });
      setItens((atual) =>
        atual.map((i) => (i.id === item.id ? { ...i, separado: novoSeparado, qtd_separada: novoSeparado ? qtd : 0 } : i)),
      );
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível marcar o item.');
    } finally {
      setMarcandoId(null);
    }
  };

  const mudarQtd = (item: ProjOrdemItem, qtd: number) => {
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, qtd_separada: qtd } : i)));
  };

  const confirmar = async () => {
    if (faltam > 0) {
      const ok = window.confirm(
        `${faltam} de ${itens.length} item(ns) ainda sem check — eles NÃO serão debitados e ficam fora do kit. Confirmar mesmo assim?`,
      );
      if (!ok) return;
    }
    setConfirmando(true);
    try {
      const r = await confirmarSeparacaoPremontagem(ordem.id, { id: user.id, nome: user.name });
      toast.success(
        `Separação confirmada — ${formatQtd(r.total_pecas_debitadas)} peças debitadas` +
          (r.itens_faltantes ? `, ${r.itens_faltantes} item(ns) ficaram de fora.` : '.'),
      );
      onConfirmado();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível confirmar a separação.');
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <Modal onClose={() => !confirmando && onCancelar()} maxWidth="max-w-2xl" ariaLabel="Separação física do romaneio" disableOutsideClose>
      <ModalHeader onClose={() => !confirmando && onCancelar()}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Separação física — {ordem.codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Marque cada item conforme separar na bancada. O débito só acontece ao confirmar — pode ser parcial.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <p className="text-xs font-bold" style={{ color: separados === itens.length ? 'var(--abc-a)' : 'var(--abc-b)' }}>
            {separados}/{itens.length} separado(s)
          </p>
          <div className="rounded-lg border max-h-[50vh] overflow-y-auto" style={{ borderColor: 'var(--hairline)' }}>
            <table className="w-full text-xs">
              <tbody>
                {itens.map((oi) => {
                  const item = itemPorId.get(oi.item_id);
                  return (
                    <tr key={oi.id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-3 py-2 w-10">
                        <button
                          onClick={() => void alternar(oi, oi.qtd_separada || oi.qtd_total)}
                          disabled={marcandoId === oi.id}
                          className="h-5 w-5 rounded border flex items-center justify-center cursor-pointer transition-colors disabled:opacity-50"
                          style={{ borderColor: oi.separado ? 'var(--abc-a)' : 'var(--hairline)', background: oi.separado ? 'var(--abc-a)' : 'transparent' }}
                          aria-label={oi.separado ? 'Desmarcar' : 'Marcar separado'}
                        >
                          {marcandoId === oi.id ? <Loader2 className="h-3 w-3 animate-spin" /> : oi.separado && <Check className="h-3.5 w-3.5 text-white" />}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{item?.part_number ?? oi.item_id}</p>
                        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                          {item?.descricao || item?.description || '—'}{oi.localizador ? ` · ${oi.localizador}` : ''} · previsto {formatQtd(oi.qtd_total)}
                        </p>
                      </td>
                      <td className="px-3 py-2 w-24 text-right">
                        <input
                          value={oi.separado ? oi.qtd_separada : ''}
                          onChange={(e) => {
                            const v = Number(e.target.value.replace(',', '.'));
                            if (Number.isFinite(v)) mudarQtd(oi, v);
                          }}
                          onBlur={() => { if (oi.separado) void marcarItemSeparado(oi.id, true, oi.qtd_separada, { nome: user.name }); }}
                          disabled={!oi.separado}
                          inputMode="decimal"
                          placeholder={oi.separado ? undefined : '—'}
                          className="w-full rounded border px-2 py-1 text-xs text-right tabular-nums font-bold focus:outline-2 disabled:opacity-40"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)', outlineColor: 'var(--brand)' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button onClick={onCancelar} disabled={confirmando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Fechar
        </button>
        <button
          onClick={() => void confirmar()}
          disabled={confirmando || separados === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
          style={{ background: 'var(--brand)' }}
        >
          {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Confirmar separação e debitar
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * F3 — apontamento de conclusão. Kit por kit, porque a bancada termina um de
 * cada vez. Pode confirmar mesmo com zona pendente ou nem todo kit marcado —
 * o que for apontado já vira saldo no buffer; o resto fica como pendência
 * aberta (anotada na não-conformidade do kit apontado).
 */
function ModalApontamento({
  ordem, faltamZonas, salvando, onCancelar, onConfirmar,
}: {
  ordem: ProjOrdemPremontagem;
  faltamZonas: ZonaDef[];
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (marcados: Record<string, boolean>, naoConformidade: string, pendenciaZonas: ZonaDef[]) => void;
}) {
  const pendentes = (ordem.kits ?? []).filter((k) => k.status === 'em_premontagem');
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    Object.fromEntries(pendentes.map((k) => [k.tramo_unidade_id, true])),
  );
  const [nc, setNc] = useState('');

  const subconjuntos = Array.from(new Set((ordem.itens ?? []).map((i) => i.subconjunto).filter(Boolean))) as string[];
  const totalMarcados = Object.values(marcados).filter(Boolean).length;
  const parcial = faltamZonas.length > 0 || totalMarcados < pendentes.length;

  return (
    <Modal onClose={onCancelar} maxWidth="max-w-2xl" ariaLabel="Apontar conclusão da pré-montagem" disableOutsideClose>
      <ModalHeader onClose={onCancelar}>
        <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Conclusão da pré-montagem — {ordem.codigo}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Confirmar move o(s) kit(s) marcado(s) para o buffer, pronto(s) para a produção chamar.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-4">
          {faltamZonas.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Zona(s) ainda não separada(s) neste tramo: <strong>{faltamZonas.map((z) => z.rotulo).join(', ')}</strong>.
                Você pode confirmar assim mesmo — o kit vai parcial para o buffer e fica registrada uma pendência aberta.
              </p>
            </div>
          )}

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
              {pendentes.length > 0 && totalMarcados < pendentes.length && (
                <p className="text-[11px]" style={{ color: 'var(--abc-b)' }}>
                  {pendentes.length - totalMarcados} kit(s) ficam de fora desta conclusão — continuam aguardando apontamento.
                </p>
              )}
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
          onClick={() => onConfirmar(marcados, nc, faltamZonas)}
          disabled={salvando || totalMarcados === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
          style={{ background: parcial ? 'var(--abc-b)' : 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {parcial ? 'Confirmar parcial no buffer' : 'Confirmar no buffer'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Etiqueta({ status, separacaoConfirmada }: { status: string; separacaoConfirmada: boolean }) {
  if (status === 'concluida') return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--abc-a)', color: '#fff' }}>Concluída</span>;
  if (status === 'cancelada') return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--ink-muted)', color: '#fff' }}>Cancelada</span>;
  if (!separacaoConfirmada) return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--abc-b)', color: '#fff' }}>Aguardando separação</span>;
  return <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'var(--series-3)', color: '#fff' }}>Separado — aguardando apontamento</span>;
}

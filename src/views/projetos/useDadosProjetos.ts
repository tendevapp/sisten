/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Estado compartilhado do módulo Projetos.
 *
 * A BOM tem 1.257 linhas e o catálogo 543 itens. Carregar isso por aba faria
 * cada troca de aba pagar o mesmo tráfego de novo, e as abas discordariam
 * entre si enquanto uma recarregava. Aqui os dados são carregados uma vez, na
 * view, e as abas recebem o resultado já derivado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listarBom,
  listarItens,
  listarKits,
  listarNotasEntrada,
  listarOrdens,
  listarSaldos,
  listarSobressalentes,
  listarSubprojetos,
  listarTramos,
  listarEntregas,
} from '../../lib/projetosApi';
import { montarArvore, consumoPorTramo, auditarBom, type ArvoreBom, type Pendencia } from '../../lib/projetosBom';
import {
  autonomiaPorTramo,
  ratearCascata,
  saldoProjetado,
  type AutonomiaTramo,
  type ProjecaoSubprojeto,
  type ResultadoRateio,
  type SaldosPorItem,
} from '../../lib/projetosAutonomia';
import { TRAMOS, type Tramo } from '../../lib/projetos';
import type {
  ProjBomNo,
  ProjEntregaProducao,
  ProjItem,
  ProjKit,
  ProjNotaEntrada,
  ProjOrdemPremontagem,
  ProjSaldoItem,
  ProjSobressalente,
  ProjSubprojeto,
  ProjTramoUnidade,
} from '../../types';

export interface DadosProjetos {
  loading: boolean;
  erro: string | null;
  recarregar: (silencioso?: boolean) => Promise<void>;

  bom: ProjBomNo[];
  arvore: ArvoreBom;
  pendencias: Pendencia[];
  itens: ProjItem[];
  saldos: ProjSaldoItem[];
  /** part_number_norm → saldo. */
  saldoPorPn: SaldosPorItem;
  /** part_number_norm → item do catálogo (a chave que liga BOM e estoque). */
  itemPorPn: Map<string, ProjItem>;

  subprojetos: ProjSubprojeto[];
  subprojetoAtivo: ProjSubprojeto | null;
  setSubprojetoAtivo: (id: string) => void;
  tramos: ProjTramoUnidade[];

  notas: ProjNotaEntrada[];
  ordens: ProjOrdemPremontagem[];
  kits: ProjKit[];
  entregas: ProjEntregaProducao[];
  sobressalentes: ProjSobressalente[];

  consumo: ReturnType<typeof consumoPorTramo>;
  autonomia: AutonomiaTramo[];
  rateio: ResultadoRateio;
  projecao: ProjecaoSubprojeto;

  /** Kits prontos no buffer, por tramo. */
  kitsProntosPorTramo: Map<Tramo, ProjKit[]>;
  /** Tramos do subprojeto ativo, na ordem torre → tramo. */
  tramosDoSubprojeto: ProjTramoUnidade[];
}

const ARVORE_VAZIA: ArvoreBom = { nos: [], porId: new Map(), raizes: [] };

export function useDadosProjetos(): DadosProjetos {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [bom, setBom] = useState<ProjBomNo[]>([]);
  const [itens, setItens] = useState<ProjItem[]>([]);
  const [saldos, setSaldos] = useState<ProjSaldoItem[]>([]);
  const [subprojetos, setSubprojetos] = useState<ProjSubprojeto[]>([]);
  const [tramos, setTramos] = useState<ProjTramoUnidade[]>([]);
  const [notas, setNotas] = useState<ProjNotaEntrada[]>([]);
  const [ordens, setOrdens] = useState<ProjOrdemPremontagem[]>([]);
  const [kits, setKits] = useState<ProjKit[]>([]);
  const [entregas, setEntregas] = useState<ProjEntregaProducao[]>([]);
  const [sobressalentes, setSobressalentes] = useState<ProjSobressalente[]>([]);
  const [subprojetoId, setSubprojetoId] = useState<string>('SP01');

  const recarregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErro(null);
    try {
      const [b, i, s, sp, t, n, o, k, e, so] = await Promise.all([
        listarBom(),
        listarItens(),
        listarSaldos(),
        listarSubprojetos(),
        listarTramos(),
        listarNotasEntrada(),
        listarOrdens(),
        listarKits(),
        listarEntregas(),
        listarSobressalentes(),
      ]);
      setBom(b); setItens(i); setSaldos(s); setSubprojetos(sp); setTramos(t);
      setNotas(n); setOrdens(o); setKits(k); setEntregas(e); setSobressalentes(so);
      if (sp.length && !sp.some((x) => x.id === subprojetoId)) setSubprojetoId(sp[0].id);
    } catch (err: any) {
      console.error('Falha ao carregar o módulo Projetos:', err);
      setErro(err?.message || 'Não foi possível carregar os dados do projeto.');
    } finally {
      setLoading(false);
    }
  }, [subprojetoId]);

  useEffect(() => { void recarregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const arvore = useMemo(() => (bom.length ? montarArvore(bom as any) : ARVORE_VAZIA), [bom]);
  const pendencias = useMemo(() => (bom.length ? auditarBom(arvore) : []), [arvore, bom.length]);
  const consumo = useMemo(() => consumoPorTramo(arvore), [arvore]);

  const itemPorPn = useMemo(() => {
    const m = new Map<string, ProjItem>();
    itens.forEach((i) => m.set(i.part_number_norm, i));
    return m;
  }, [itens]);

  const saldoPorPn = useMemo(() => {
    const m: SaldosPorItem = new Map();
    saldos.forEach((s) => m.set(s.part_number_norm, Number(s.saldo) || 0));
    return m;
  }, [saldos]);

  const autonomia = useMemo(() => autonomiaPorTramo(consumo, saldoPorPn), [consumo, saldoPorPn]);
  const rateio = useMemo(() => ratearCascata(consumo, saldoPorPn), [consumo, saldoPorPn]);

  const subprojetoAtivo = useMemo(
    () => subprojetos.find((s) => s.id === subprojetoId) ?? subprojetos[0] ?? null,
    [subprojetos, subprojetoId],
  );

  const tramosDoSubprojeto = useMemo(
    () =>
      tramos
        .filter((t) => t.subprojeto_id === subprojetoAtivo?.id)
        .sort((a, b) => a.torre_numero - b.torre_numero || a.tramo.localeCompare(b.tramo)),
    [tramos, subprojetoAtivo],
  );

  const kitsProntosPorTramo = useMemo(() => {
    const m = new Map<Tramo, ProjKit[]>(TRAMOS.map((t) => [t, [] as ProjKit[]]));
    kits.filter((k) => k.status === 'pronto').forEach((k) => m.get(k.tramo as Tramo)?.push(k));
    return m;
  }, [kits]);

  const projecao = useMemo(() => {
    // Torre concluída = os cinco tramos entregues à produção.
    const entreguesPorTorre = new Map<number, number>();
    tramosDoSubprojeto
      .filter((t) => t.status === 'entregue')
      .forEach((t) => entreguesPorTorre.set(t.torre_numero, (entreguesPorTorre.get(t.torre_numero) ?? 0) + 1));
    const concluidas = Array.from(entreguesPorTorre.values()).filter((n) => n === 5).length;

    // Peça retida em kit pronto: já saiu do almoxarifado mas não precisa ser
    // comprada de novo, então volta como crédito na projeção.
    const emKits: SaldosPorItem = new Map();
    for (const [tramo, lista] of kitsProntosPorTramo) {
      if (!lista.length) continue;
      for (const item of consumo.get(tramo)?.values() ?? []) {
        emKits.set(item.partNumberNorm, (emKits.get(item.partNumberNorm) ?? 0) + item.qtdPorTorre * lista.length);
      }
    }

    return saldoProjetado({
      torresTotais: subprojetoAtivo?.torres_previstas ?? 0,
      torresConcluidas: concluidas,
      consumo,
      saldos: saldoPorPn,
      emKits,
    });
  }, [tramosDoSubprojeto, kitsProntosPorTramo, consumo, saldoPorPn, subprojetoAtivo]);

  return {
    loading, erro, recarregar,
    bom, arvore, pendencias, itens, saldos, saldoPorPn, itemPorPn,
    subprojetos, subprojetoAtivo, setSubprojetoAtivo: setSubprojetoId, tramos,
    notas, ordens, kits, entregas, sobressalentes,
    consumo, autonomia, rateio, projecao,
    kitsProntosPorTramo, tramosDoSubprojeto,
  };
}

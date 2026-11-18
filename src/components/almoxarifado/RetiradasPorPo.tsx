/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Geral › Pendências › Retiradas sem saldo — visão "Por PO": os pedidos que
 * ainda precisam da NF lançada para as retiradas sem saldo darem baixa.
 * Regra de agrupamento em `lib/retiradasPorPo.ts`; o PO aberto de cada
 * material vem de `alm_situacao_material` (o mesmo do Ctrl+K).
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ClipboardCopy, Loader2, PackageCheck, ReceiptText, Search, ShoppingCart, Truck } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { formatarDataBR, hojeISO } from '../../lib/fichaEpi';
import { pendenciaNfDoMaterial, type PendenciaNfMaterial } from '../../lib/relatorioSolExtra';
import {
  agruparPorPo, itensAguardandoNf, situacaoGrupoPo, textoListaPos, type GrupoPo, type SituacaoGrupoPo,
} from '../../lib/retiradasPorPo';
import { buscarSituacaoMaterial } from '../../lib/situacaoMaterial';
import type { SolExtra } from '../../lib/solicitacaoExtraApi';

/** Consultas de PO em paralelo (sem afogar o banco). */
const PARALELO = 4;

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const SELO: Record<SituacaoGrupoPo, { rotulo: string; classe: string; icone: typeof Truck }> = {
  chegou: { rotulo: 'Chegou — falta MIGO', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300', icone: PackageCheck },
  atrasado: { rotulo: 'Entrega atrasada', classe: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300', icone: AlertTriangle },
  aguardando: { rotulo: 'Aguardando entrega', classe: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icone: Truck },
};

export default function RetiradasPorPo({
  registros, cobertura, saldoLido, onAbrir,
}: {
  /** Retiradas pendentes de baixa (todas, não só as filtradas). */
  registros: SolExtra[];
  cobertura: Map<string, boolean[]> | null;
  /** A ZL0024 terminou de carregar (com ou sem erro). */
  saldoLido: boolean;
  onAbrir: (registro: SolExtra) => void;
}) {
  const toast = useToast();
  const hoje = hojeISO();
  const itens = useMemo(() => itensAguardandoNf(registros, cobertura), [registros, cobertura]);
  const materiais = useMemo(() => [...new Set(itens.map(i => i.material))].sort(), [itens]);
  const porId = useMemo(() => new Map(registros.map(r => [r.id, r])), [registros]);

  const [pendencias, setPendencias] = useState<Map<string, PendenciaNfMaterial> | null>(null);
  const [lidos, setLidos] = useState(0);
  const [falhas, setFalhas] = useState(0);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!saldoLido) return;
    let vivo = true;
    setPendencias(null);
    setLidos(0);
    setFalhas(0);
    const mapa = new Map<string, PendenciaNfMaterial>();
    const fila = [...materiais];
    let erros = 0;
    const trabalhar = async () => {
      for (let mat = fila.shift(); mat && vivo; mat = fila.shift()) {
        try {
          mapa.set(mat, pendenciaNfDoMaterial(await buscarSituacaoMaterial(mat)));
        } catch (err) {
          erros++;
          console.warn(`PO pendente do material ${mat} não consultado:`, err);
        }
        if (vivo) setLidos(n => n + 1);
      }
    };
    Promise.all(Array.from({ length: PARALELO }, trabalhar)).then(() => {
      if (!vivo) return;
      setFalhas(erros);
      setPendencias(mapa);
    });
    return () => { vivo = false; };
  }, [materiais, saldoLido]);

  const grupos = useMemo(() => (pendencias ? agruparPorPo(itens, pendencias) : []), [itens, pendencias]);
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleUpperCase('pt-BR');
    if (!termo) return grupos;
    return grupos.filter(g => [
      g.pedido, g.fornecedor ?? '', ...g.rms,
      ...g.linhas.flatMap(l => [l.itemPedido, l.material, l.descricao, ...l.retiradas.map(r => r.codigo ?? '')]),
    ].some(t => t.toLocaleUpperCase('pt-BR').includes(termo)));
  }, [grupos, busca]);

  const resumo = useMemo(() => {
    const pos = grupos.filter(g => g.tipo === 'po');
    return {
      pos: pos.length,
      chegou: pos.filter(g => situacaoGrupoPo(g, hoje) === 'chegou').length,
      atrasado: pos.filter(g => situacaoGrupoPo(g, hoje) === 'atrasado').length,
      entregue: grupos.filter(g => g.tipo === 'po_entregue').reduce((s, g) => s + g.linhas.length, 0),
      semPo: grupos.filter(g => g.tipo === 'rm_sem_po' || g.tipo === 'sem_po').reduce((s, g) => s + g.linhas.length, 0),
    };
  }, [grupos, hoje]);

  const copiar = async () => {
    const texto = textoListaPos(visiveis);
    if (!texto) { toast.info('Nenhum PO na lista.'); return; }
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(`${texto.split('\n').length} PO(s) copiados.`);
    } catch {
      toast.error('Não foi possível copiar — o navegador bloqueou a área de transferência.');
    }
  };

  if (!saldoLido || !pendencias) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-8 text-xs text-slate-500 dark:border-slate-700">
        <Loader2 className="h-4 w-4 animate-spin" />
        {!saldoLido ? 'Lendo o saldo da ZL0024…' : `Consultando os POs abertos: ${lidos} de ${materiais.length} materiais…`}
      </div>
    );
  }

  if (!itens.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700">
        Todos os itens pendentes já têm saldo na ZL0024 — nenhum PO esperando NF.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span><strong className="text-slate-900 dark:text-slate-50">{resumo.pos}</strong> PO(s) aguardando NF</span>
        {resumo.chegou > 0 && <span className="text-emerald-700 dark:text-emerald-400"><strong>{resumo.chegou}</strong> já chegaram (falta MIGO)</span>}
        {resumo.atrasado > 0 && <span className="text-rose-700 dark:text-rose-400"><strong>{resumo.atrasado}</strong> com entrega atrasada</span>}
        {resumo.entregue > 0 && <span className="text-sky-700 dark:text-sky-400"><strong>{resumo.entregue}</strong> item(ns) com PO já entregue</span>}
        {resumo.semPo > 0 &&<span className="text-amber-700 dark:text-amber-400"><strong>{resumo.semPo}</strong> item(ns) sem PO</span>}
        {falhas > 0 && <span className="text-rose-600">{falhas} material(is) não consultado(s) — clique em Atualizar</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Buscar PO, fornecedor, material ou retirada</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="PO, fornecedor, material ou RSS"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <ClipboardCopy className="h-3.5 w-3.5" /> Copiar lista de POs
        </button>
      </div>

      {visiveis.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700">Nada encontrado.</p>
      )}

      <ul className="space-y-2">
        {visiveis.map(g => <CartaoPo key={g.chave} grupo={g} hoje={hoje} porId={porId} onAbrir={onAbrir} />)}
      </ul>
    </div>
  );
}

function CartaoPo({
  grupo: g, hoje, porId, onAbrir,
}: {
  grupo: GrupoPo;
  hoje: string;
  porId: Map<string, SolExtra>;
  onAbrir: (registro: SolExtra) => void;
}) {
  const situacao = g.tipo === 'po' ? situacaoGrupoPo(g, hoje) : null;
  const selo = situacao ? SELO[situacao] : null;
  const borda = g.tipo === 'po'
    ? 'border-slate-200 dark:border-slate-800'
    : g.tipo === 'po_entregue' ? 'border-sky-300 dark:border-sky-900' : 'border-amber-300 dark:border-amber-900';

  return (
    <li className={`rounded-xl border p-3 ${borda}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {g.tipo === 'po' ? (
            <p className="text-sm font-bold text-slate-900 dark:text-slate-50">
              <span className="font-mono text-blue-700 dark:text-blue-400">PO {g.pedido}</span>
              {g.fornecedor && <span className="font-semibold"> · {g.fornecedor}</span>}
            </p>
          ) : g.tipo === 'po_entregue' ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-bold text-sky-800 dark:text-sky-300">
                <ReceiptText className="h-4 w-4" /> PO já entregue — NF lançada, mas sem saldo no estoque
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Não falta NF: o saldo da MIGO já saiu (baixa direta no SAP?) ou não entrou em depósito. Se a baixa já foi feita no SAP, regularize a retirada com o documento; senão, confira a MIGO.
              </p>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
              <ShoppingCart className="h-4 w-4" />
              {g.tipo === 'rm_sem_po' ? 'Sem PO — RM aberta ainda sem pedido' : 'Sem PO nem RM aberta — verificar a compra'}
            </p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {g.linhas.length} {g.linhas.length === 1 ? 'item' : 'itens'} · {g.totalRetiradas} {g.totalRetiradas === 1 ? 'retirada' : 'retiradas'} · esperando desde {formatarDataBR(g.desde)}
            {g.rms.length > 0 && <> · RM {g.rms.join(', ')}</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {g.remessaPrevista && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
              <CalendarClock className="h-3 w-3" /> prev. {formatarDataBR(g.remessaPrevista)}
            </span>
          )}
          {selo && (
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${selo.classe}`}>
              <selo.icone className="h-3 w-3" /> {selo.rotulo}
            </span>
          )}
        </div>
      </div>

      <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {g.linhas.map(l => (
          <li key={`${l.itemPedido}|${l.material}`} className="flex flex-col gap-1 py-1.5 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-slate-800 dark:text-slate-100">
                {l.itemPedido && <span className="font-mono text-slate-500">{l.itemPedido.split('/')[1] ? `item ${l.itemPedido.split('/')[1]} · ` : ''}</span>}
                <span className="font-mono font-semibold">{l.material}</span> · {l.descricao}
              </p>
              <p className="flex flex-wrap gap-1 pt-0.5">
                {l.retiradas.map(r => {
                  const registro = porId.get(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!registro}
                      onClick={() => registro && onAbrir(registro)}
                      className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300"
                    >
                      {r.codigo || 'sem código'}
                    </button>
                  );
                })}
              </p>
            </div>
            <p className="shrink-0 whitespace-nowrap text-slate-600 tabular-nums dark:text-slate-300">
              <strong className="text-slate-900 dark:text-slate-50">{fmtQtd(l.quantidade)} {l.unidade}</strong> retirado
              {l.pendentePo != null && <span className="text-slate-500"> · {fmtQtd(l.pendentePo)} no PO</span>}
              {g.tipo === 'po_entregue' && (
                <span className="block text-right text-[11px] text-slate-500">
                  PO {l.itemPedido}{l.entradaEm ? ` · MIGO ${formatarDataBR(l.entradaEm)}` : ''}
                  {l.saidaSap && (
                    <span className="block font-semibold text-sky-800 dark:text-sky-300">
                      Saída SAP {l.saidaSap.tipo}{l.saidaSap.data ? ` em ${formatarDataBR(l.saidaSap.data)}` : ''} · {fmtQtd(l.saidaSap.quantidade)} {l.unidade}
                    </span>
                  )}
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </li>
  );
}

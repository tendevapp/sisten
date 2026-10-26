/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mini-relatório da situação de um material: saldo por depósito, RM aberta,
 * pedido (data, previsão de entrega, MIGO) e último movimento. Aparece no
 * Ctrl+K (ao escolher um material) e no diálogo do QR da etiqueta.
 *
 * Busca sozinho pelo código (`lib/situacaoMaterial`); compacto para caber num
 * diálogo de celular. O saldo começa recolhido ("Mostrar saldo"): a mesma
 * tela abre antes do inventário cíclico, que é contagem cega.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Boxes, ClipboardList, Eye, EyeOff, History, Loader2, MapPin, RefreshCw, Truck } from 'lucide-react';
import { formatQtd } from '../../lib/format';
import { hojeISO } from '../../lib/fichaEpi';
import { formatDeposito } from '../../lib/almoxarifado';
import {
  ROTULO_SITUACAO_PEDIDO, abaixoDoMinimo, aguardandoMigo, buscarSituacaoMaterial, documentoComItem, situacaoPedido,
  type ChegadaSituacao, type SituacaoMaterial, type SituacaoPedido,
} from '../../lib/situacaoMaterial';

/** `2026-10-09` → `09/10/26`, fatiando o texto (sem `new Date`). */
const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
};

const COR_PEDIDO: Record<SituacaoPedido, string> = {
  chegou: 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  atrasado: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300',
  aberto: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  recebido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
};

function Chip({ cor, children }: { cor: string; children: ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${cor}`}>{children}</span>;
}

function Secao({ icone: Icone, titulo, children }: { icone: typeof Boxes; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Icone className="h-3.5 w-3.5" /> {titulo}
      </h4>
      {children}
    </section>
  );
}

/** Chegada física ainda sem MIGO, dentro do cartão do pedido. */
function LinhaChegada({ chegada: c, umb, mostrarPedido }: { chegada: ChegadaSituacao; umb: string; mostrarPedido?: boolean }) {
  return (
    <p className="mt-1.5 rounded-md bg-violet-50 px-2 py-1 text-[11px] text-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
      Chegou {dataCurta(c.data)}
      {c.quantidade != null && <> · <span className="font-bold tabular-nums">{formatQtd(c.quantidade)} {c.unidade || umb}</span> contados</>}
      {c.parcial && ' (parcial)'}
      {c.divergencia && ` · divergência${c.tipo_divergencia ? ` (${c.tipo_divergencia.replace('_', ' ')})` : ''}`}
      {mostrarPedido && c.pedido && ` · PO ${c.pedido}`}
      {' · '}{c.codigo ?? 'marcado no Rastreio'}
      {c.registrado_por && ` · ${c.registrado_por}`}
      {' — '}está na prateleira, falta a MIGO
    </p>
  );
}

export default function SituacaoMaterialResumo({ material, mostrarCabecalho = true }: { material: string; mostrarCabecalho?: boolean }) {
  const [dados, setDados] = useState<SituacaoMaterial | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  // Recolhido a cada item: o saldo só aparece quando a pessoa pede.
  const [saldoVisivel, setSaldoVisivel] = useState(false);

  useEffect(() => {
    setSaldoVisivel(false);
  }, [material]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    buscarSituacaoMaterial(material, versao > 0)
      .then(d => { if (ativo) setDados(d); })
      .catch(e => {
        if (!ativo) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErro(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Sem conexão — a situação do item precisa do servidor.' : msg);
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [material, versao]);

  if (carregando && !dados) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando saldo, RM e pedidos…
      </p>
    );
  }
  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">Não foi possível ler a situação do item: {erro}</span>
        <button type="button" onClick={() => setVersao(v => v + 1)} className="font-bold underline">Tentar de novo</button>
      </div>
    );
  }
  if (!dados) return null;

  const hoje = hojeISO();
  const umb = dados.umb || '';
  const posicoes = [...new Set([dados.posicao_cadastro, ...dados.depositos.map(d => d.posicao)].filter((p): p is string => !!p?.trim()))];
  const abaixo = abaixoDoMinimo(dados);
  // RM que já virou pedido aparece no pedido; aqui fica só a que ainda espera compra.
  const rmsSemPedido = dados.rms.filter(r => r.situacao === 'sem_pedido');
  // Entrega que o comprador informou na RM, levada para o pedido dela.
  const entregaDaRm = new Map<string, { data: string; confirmada: boolean }>();
  for (const r of dados.rms) {
    if (r.pedido && r.entrega_prevista && !entregaDaRm.has(r.pedido)) entregaDaRm.set(r.pedido, { data: r.entrega_prevista, confirmada: r.entrega_confirmada });
  }
  // Chegada física sem MIGO entra no cartão do pedido (no primeiro, quando o
  // pedido tem mais de uma linha: a conferência é por RI-PO, não por item).
  const semMigo = aguardandoMigo(dados.chegadas).chegadas;
  const pedidosListados = new Set(dados.pedidos.map(p => p.pedido));
  const chegadasDoPedido = new Map<string, ChegadaSituacao[]>();
  const chegadasSemPedido: ChegadaSituacao[] = [];
  for (const c of semMigo) {
    if (c.pedido && pedidosListados.has(c.pedido)) chegadasDoPedido.set(c.pedido, [...(chegadasDoPedido.get(c.pedido) ?? []), c]);
    else chegadasSemPedido.push(c);
  }
  const pedidoComChegadaMostrada = new Set<string>();

  return (
    <div className="space-y-4 text-sm">
      {mostrarCabecalho && (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{dados.material}</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{dados.descricao || 'Sem descrição'}</p>
        </div>
      )}

      {/* Saldo: recolhido até a pessoa pedir — quem vai fazer o inventário
          cíclico não pode ver o saldo antes de contar (contagem cega). Tudo
          que entrega a quantidade (número, depósitos, "sem saldo", mínimo,
          fundo vermelho) fica atrás do botão. */}
      <div
        className={`rounded-xl border p-3 ${
          !saldoVisivel || dados.saldo_total > 0 ? 'border-slate-200 dark:border-slate-700' : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo ZL0024</p>
            {saldoVisivel ? (
              <p className={`text-2xl font-extrabold tabular-nums ${dados.saldo_total > 0 ? 'text-slate-900 dark:text-slate-50' : 'text-rose-700 dark:text-rose-300'}`}>
                {formatQtd(dados.saldo_total)} <span className="text-sm font-semibold text-slate-500">{umb}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-400">Oculto para não influenciar a contagem do inventário cíclico.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1">
            {saldoVisivel && dados.saldo_total <= 0 && <Chip cor="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Sem saldo</Chip>}
            {saldoVisivel && abaixo && <Chip cor="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Abaixo do mínimo ({formatQtd(dados.estoque_minimo ?? 0)})</Chip>}
            <button
              type="button"
              onClick={() => setSaldoVisivel(v => !v)}
              aria-expanded={saldoVisivel}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300"
            >
              {saldoVisivel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {saldoVisivel ? 'Ocultar saldo' : 'Mostrar saldo'}
            </button>
          </div>
        </div>
        {saldoVisivel && dados.depositos.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {dados.depositos.map(d => (
              <li key={d.deposito} className="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">{formatDeposito(d.deposito)}</span>{' '}
                <span className="font-bold tabular-nums text-slate-800 dark:text-slate-100">{formatQtd(d.saldo)}</span>
              </li>
            ))}
          </ul>
        )}
        {posicoes.length > 0 && (
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {posicoes.join(' · ')}
          </p>
        )}
      </div>

      {/* RM ainda sem pedido */}
      {rmsSemPedido.length > 0 && (
        <Secao icone={ClipboardList} titulo={`RM aberta sem pedido (${rmsSemPedido.length})`}>
          <ul className="space-y-1.5">
            {rmsSemPedido.map(r => (
              <li key={`${r.requisicao}-${r.item}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">RM {documentoComItem(r.requisicao, r.item)}</span>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                  {dataCurta(r.data)} · {formatQtd(r.quantidade ?? 0)} {umb}
                  {r.requisitante && ` · ${r.requisitante}`}
                  {r.entrega_prevista && ` · entrega ${r.entrega_confirmada ? 'confirmada' : 'prevista'} ${dataCurta(r.entrega_prevista)}`}
                </p>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {/* Pedidos — com a chegada física ainda sem MIGO dentro do cartão */}
      <Secao icone={Truck} titulo="Pedidos (PO)">
        {dados.pedidos.length === 0 && chegadasSemPedido.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum pedido para este material.</p>
        ) : (
          <ul className="space-y-1.5">
            {dados.pedidos.map(p => {
              const chegadas = !pedidoComChegadaMostrada.has(p.pedido) ? chegadasDoPedido.get(p.pedido) ?? [] : [];
              if (chegadas.length) pedidoComChegadaMostrada.add(p.pedido);
              const chegou = (chegadasDoPedido.get(p.pedido)?.length ?? 0) > 0;
              const sit = situacaoPedido(p, hoje, chegou);
              const daRm = entregaDaRm.get(p.pedido);
              return (
                <li key={`${p.pedido}-${p.item}`} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100">PO {documentoComItem(p.pedido, p.item)}</span>
                    <Chip cor={COR_PEDIDO[sit]}>{ROTULO_SITUACAO_PEDIDO[sit]}</Chip>
                  </div>
                  <p className="mt-0.5 truncate text-slate-600 dark:text-slate-300">
                    {dataCurta(p.data)}{p.fornecedor && ` · ${p.fornecedor}`}
                  </p>
                  <dl className="mt-1 grid grid-cols-3 gap-x-2 text-[11px]">
                    <div>
                      <dt className="text-slate-400">Prev. entrega</dt>
                      <dd className={`font-semibold ${sit === 'atrasado' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-100'}`}>{dataCurta(p.remessa_prevista)}</dd>
                      {daRm && p.quantidade_pendente > 0 && daRm.data.slice(0, 10) !== p.remessa_prevista?.slice(0, 10) && (
                        <dd className="text-[10px] text-slate-500">{daRm.confirmada ? 'confirmada' : 'comprador'} {dataCurta(daRm.data)}</dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-slate-400">MIGO</dt>
                      <dd className={`font-semibold ${chegou && p.quantidade_pendente > 0 ? 'text-violet-700 dark:text-violet-300' : 'text-slate-800 dark:text-slate-100'}`}>
                        {chegou && p.quantidade_pendente > 0 ? 'Pendente' : dataCurta(p.data_migo ?? p.ultima_entrada)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">{p.quantidade_pendente > 0 ? 'Falta receber' : 'Recebido'}</dt>
                      <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        {formatQtd(p.quantidade_pendente > 0 ? p.quantidade_pendente : (p.quantidade_fornecida ?? p.recebido_mb51 ?? 0))}
                        <span className="font-normal text-slate-400"> / {formatQtd(p.quantidade_pedida ?? 0)}</span>
                      </dd>
                    </div>
                  </dl>
                  {chegadas.map((c, i) => <LinhaChegada key={`${c.codigo ?? c.ri_po}-${i}`} chegada={c} umb={umb} />)}
                </li>
              );
            })}
            {chegadasSemPedido.length > 0 && (
              <li className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">
                <span className="font-bold text-slate-800 dark:text-slate-100">Chegada sem pedido na lista</span>
                {chegadasSemPedido.map((c, i) => <LinhaChegada key={`${c.codigo ?? c.ri_po}-${i}`} chegada={c} umb={umb} mostrarPedido />)}
              </li>
            )}
          </ul>
        )}
      </Secao>

      {/* Último movimento */}
      {dados.ultimo_movimento && (
        <Secao icone={History} titulo="Último movimento (MB51)">
          <p className="text-xs text-slate-700 dark:text-slate-200">
            {dataCurta(dados.ultimo_movimento.data)} · {dados.ultimo_movimento.tipo} {dados.ultimo_movimento.descricao}
            {' · '}<span className="font-semibold tabular-nums">{formatQtd(dados.ultimo_movimento.quantidade ?? 0)} {umb}</span>
            {dados.ultimo_movimento.deposito && ` · ${formatDeposito(dados.ultimo_movimento.deposito)}`}
          </p>
        </Secao>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-slate-800">
        <span>
          {dados.estoque_importado_em
            ? `ZL0024 importada em ${new Date(dados.estoque_importado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Data da ZL0024 desconhecida'}
          {dados.movimentos_importados_em && ` · MB51 em ${new Date(dados.movimentos_importados_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
          {' · '}retiradas ainda não lançadas no SAP não abatem
        </span>
        <button
          type="button"
          onClick={() => setVersao(v => v + 1)}
          disabled={carregando}
          className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-blue-700 disabled:opacity-50 dark:hover:text-blue-300"
        >
          <RefreshCw className={`h-3 w-3 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
    </div>
  );
}

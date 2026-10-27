/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mini-relatório da peça de projeto (etiqueta BOM, Ctrl+K): saldo do módulo
 * Projetos, localização, o que ainda vai chegar, autonomia por tramo e os
 * últimos movimentos. É o par de `SituacaoMaterialResumo` para a peça que não
 * tem SAP — quando tem, um botão abre também a situação na ZL0024.
 *
 * Busca sozinho pela chave (`lib/situacaoPecaProjeto`).
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Boxes, ChevronDown, ChevronUp, Gauge, History, Loader2, MapPin, RefreshCw, Truck } from 'lucide-react';
import { formatQtd } from '../../lib/format';
import { obterUrlFotoCatalogo } from '../../lib/almoxCatalogoApi';
import { interpretarPosicao, separarPosicoes } from '../../lib/gembaEndereco';
import { localizar } from '../../lib/gembaLayout';
import {
  buscarSituacaoPeca, calcularAutonomiaPeca, rotuloMovimentoPeca, type SituacaoPecaProjeto,
} from '../../lib/situacaoPecaProjeto';
import { useLightbox } from '../ui/Lightbox';
import SituacaoMaterialResumo from './SituacaoMaterialResumo';

/** `2026-10-09` → `09/10/26`, fatiando o texto (sem `new Date`). */
const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a.slice(2)}` : iso;
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

/** Posição digitada no cadastro com o caminho no galpão (Rua 03 › Bloco 01 › Andar 02). */
function textoPosicao(posicao: string): string {
  const e = interpretarPosicao(posicao);
  const loc = e ? localizar(e) : null;
  return loc ? `${posicao} (${loc.trilha.join(' › ')})` : posicao;
}

interface Props {
  /** Part number (com ou sem pontos) ou código SAP da peça. */
  chave: string;
  mostrarCabecalho?: boolean;
  /** Avisa quem montou o que a busca achou (`null` = não é peça do projeto). */
  onCarregado?: (dados: SituacaoPecaProjeto | null) => void;
}

export default function SituacaoPecaProjetoResumo({ chave, mostrarCabecalho = true, onCarregado }: Props) {
  const lightbox = useLightbox();
  const [dados, setDados] = useState<SituacaoPecaProjeto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [foto, setFoto] = useState<string | null>(null);
  const [verSap, setVerSap] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    setVerSap(false);
    buscarSituacaoPeca(chave, versao > 0)
      .then(d => {
        if (!ativo) return;
        setDados(d);
        onCarregado?.(d);
      })
      .catch(e => {
        if (!ativo) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErro(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Sem conexão — a situação da peça precisa do servidor.' : msg);
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
    // `onCarregado` muda a cada render de quem chama; a busca depende só da peça.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, versao]);

  // Foto só da peça aberta: poupa o egress do Storage.
  const caminhoFoto = dados?.cadastro_bom?.imagem_path ?? null;
  useEffect(() => {
    let ativo = true;
    setFoto(null);
    if (caminhoFoto) void obterUrlFotoCatalogo(caminhoFoto).then(url => { if (ativo) setFoto(url); });
    return () => { ativo = false; };
  }, [caminhoFoto]);

  if (carregando && !dados) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando saldo e consumo da peça…
      </p>
    );
  }
  if (erro) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">Não foi possível ler a situação da peça: {erro}</span>
        <button type="button" onClick={() => setVersao(v => v + 1)} className="font-bold underline">Tentar de novo</button>
      </div>
    );
  }
  if (!dados) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Peça <span className="font-mono font-bold">{chave}</span> não está no catálogo do projeto.
      </p>
    );
  }

  const { item, saldo, pendentes_entrega: chegando } = dados;
  const uom = item.uom || '';
  const autonomia = calcularAutonomiaPeca(saldo.saldo, dados.consumo);
  const posicoes = separarPosicoes(dados.cadastro_bom?.posicao_estoque);
  const descricao = dados.cadastro_bom?.etiqueta_descricao?.trim() || item.descricao || item.description || 'Sem descrição';

  return (
    <div className="space-y-4 text-sm">
      {mostrarCabecalho && (
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{item.part_number}</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{descricao}</p>
        </div>
      )}

      {/* Saldo do Projetos: entradas por NF menos o que saiu para kit e refugo. */}
      <div className={`rounded-xl border p-3 ${saldo.saldo > 0 ? 'border-slate-200 dark:border-slate-700' : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20'}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo no SISTEN (Projetos)</p>
            <p className={`text-2xl font-extrabold tabular-nums ${saldo.saldo > 0 ? 'text-slate-900 dark:text-slate-50' : 'text-rose-700 dark:text-rose-300'}`}>
              {formatQtd(saldo.saldo)} <span className="text-sm font-semibold text-slate-500">{uom}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Entrou {formatQtd(saldo.entradas)} · saiu {formatQtd(saldo.saidas)}
              {saldo.refugo > 0 && <> · refugo {formatQtd(saldo.refugo)}</>}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {saldo.saldo <= 0 && <Chip cor="bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">Zerado</Chip>}
              {item.fora_da_bom && <Chip cor="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Fora da BOM</Chip>}
              {item.ignorar_premontagem && <Chip cor="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Fora da pré-montagem</Chip>}
              {item.cod_sap && <Chip cor="bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">SAP {item.cod_sap.replace(/^0+/, '')}</Chip>}
            </div>
          </div>
          {foto && (
            <button type="button" onClick={() => lightbox.abrir([{ url: foto, legenda: descricao }])} className="shrink-0">
              <img src={foto} alt={descricao} className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700" />
            </button>
          )}
        </div>
        <p className="mt-2 flex items-start gap-1 text-xs text-slate-600 dark:text-slate-300">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {posicoes.length > 0 ? posicoes.map(textoPosicao).join(' · ') : 'Sem localização no Cadastro de Itens › BOM'}
        </p>
      </div>

      {/* Autonomia: quanto o saldo cobre de cada tramo e da torre. */}
      <Secao icone={Gauge} titulo="Autonomia pela BOM">
        {autonomia.tramos.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A peça não aparece no consumo dos tramos da BOM{item.fora_da_bom ? ' (cadastrada fora da BOM)' : ''}.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold tabular-nums text-slate-900 dark:text-slate-50">{formatQtd(autonomia.porTorre)} {uom}</span> por torre
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Fecha <span className="text-base font-extrabold tabular-nums text-slate-900 dark:text-slate-50">{formatQtd(autonomia.torres ?? 0)}</span> torre{autonomia.torres === 1 ? '' : 's'} completa{autonomia.torres === 1 ? '' : 's'}
              </p>
            </div>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {autonomia.tramos.map(t => {
                const cobre = t.pendentes === 0 || t.tramosCobertos >= t.pendentes;
                return (
                  <li key={t.tramo} className="flex items-center gap-2 py-1.5 text-xs">
                    <span className="w-9 shrink-0 font-mono font-extrabold text-slate-800 dark:text-slate-100">{t.tramo}</span>
                    <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-300">
                      {formatQtd(t.porTramo)} por tramo · <span className="font-bold tabular-nums text-slate-900 dark:text-slate-50">{formatQtd(t.tramosCobertos)}</span> tramo{t.tramosCobertos === 1 ? '' : 's'}
                      <span className="text-slate-400"> · {formatQtd(t.pendentes)} pendente{t.pendentes === 1 ? '' : 's'}</span>
                    </span>
                    <Chip cor={cobre
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'}
                    >
                      {cobre ? 'Cobre' : `${Math.round((t.tramosCobertos / t.pendentes) * 100)}%`}
                    </Chip>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              {autonomia.demandaPendente > 0
                ? autonomia.falta > 0
                  ? <>Os tramos pendentes pedem <b className="tabular-nums">{formatQtd(autonomia.demandaPendente)}</b>; faltam <b className="tabular-nums text-amber-700 dark:text-amber-300">{formatQtd(autonomia.falta)} {uom}</b>.</>
                  : <>O saldo cobre todos os tramos pendentes ({formatQtd(autonomia.demandaPendente)} {uom}).</>
                : 'Nenhum tramo pendente de kit.'}
              {' '}Cada tramo conta o saldo inteiro; os tramos dividem a mesma prateleira.
            </p>
          </div>
        )}
      </Secao>

      {chegando.quantidade > 0 && (
        <Secao icone={Truck} titulo="Ainda vai chegar">
          <p className="text-xs text-slate-700 dark:text-slate-200">
            <span className="font-bold tabular-nums">{formatQtd(chegando.quantidade)} {uom}</span> não entregues em{' '}
            {chegando.notas} NF{chegando.notas === 1 ? '' : 's'}
            {chegando.desde && ` (desde ${dataCurta(chegando.desde)})`} — acompanhamento do Recebimento.
          </p>
        </Secao>
      )}

      {dados.movimentos.length > 0 && (
        <Secao icone={History} titulo="Últimos movimentos">
          <ul className="space-y-1">
            {dados.movimentos.slice(0, 3).map((m, i) => (
              <li key={`${m.em}-${i}`} className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-slate-700 dark:text-slate-200">
                <span className="text-slate-500">{dataCurta(m.em)}</span>
                <span className="font-semibold">{rotuloMovimentoPeca(m.tipo)}</span>
                <span className={`font-bold tabular-nums ${m.quantidade < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                  {m.quantidade > 0 ? '+' : ''}{formatQtd(m.quantidade)}
                </span>
                {m.documento && <span className="font-mono text-[11px] text-slate-500">{m.documento}</span>}
                {m.tramo && <span className="text-slate-500">· {m.tramo}</span>}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {item.cod_sap && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setVerSap(v => !v)}
            aria-expanded={verSap}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
          >
            Situação no SAP (ZL0024, RM, pedidos)
            {verSap ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {verSap && (
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              <SituacaoMaterialResumo material={item.cod_sap} mostrarCabecalho={false} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-slate-800">
        <span>Saldo e movimentos do módulo Almoxarifado › Projetos; consumo pela BOM do {item.projeto.replace('_', ' ')}.</span>
        <button
          type="button"
          onClick={() => setVersao(v => v + 1)}
          disabled={carregando}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-slate-500 hover:text-blue-700 disabled:opacity-50 dark:hover:text-blue-300"
        >
          <RefreshCw className={`h-3 w-3 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
    </div>
  );
}

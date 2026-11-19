/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontamento de contagem da Simulação de baixas (TEMPORÁRIO). Mesmo layout
 * da lista do Inventário Cíclico — roteiro pelo galpão, cabeçalho por
 * estante, foto do catálogo — mas não é inventário: sem travas, uma contagem
 * só (recontar sobrescreve) e o físico esperado à vista. Grava em
 * `alm_simulacao_apontamentos`.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Camera, Check, ChevronRight, ClipboardList, Eye, ListOrdered, Loader2, MapPin, Route, Search } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { useLightbox } from '../../ui/Lightbox';
import { formatDeposito } from '../../../lib/almoxarifado';
import { formatDateTimeBR, formatQtd } from '../../../lib/format';
import { descreverPosicao } from '../../../lib/gembaLayout';
import { chavePosicao, grupoDoRoteiro, ordenarPorRoteiro } from '../../../lib/inventarioRoteiro';
import { buscarFotosCatalogoPorCodigosSap, type CatalogoItem } from '../../../lib/almoxCatalogoApi';
import {
  chaveApontamento, diferencaApontamento, situacaoApontamento, type ApontamentoSimulacao,
} from '../../../lib/apontamentoSimulacao';
import { salvarApontamentoSimulacao } from '../../../lib/apontamentoSimulacaoApi';
import type { PosicaoSimulada } from '../../../lib/simulacaoBaixas';

type Filtro = 'abertos' | 'contados' | 'diferenca' | 'todos';
type Ordem = 'roteiro' | 'lista';

const ROTULO_FILTRO: Record<Filtro, string> = { abertos: 'A contar', contados: 'Contados', diferenca: 'Com diferença', todos: 'Todos' };
const CHAVE_ORDEM = 'sisten.simulacao.apontamento.ordem';

const lerOrdem = (): Ordem => {
  try { return localStorage.getItem(CHAVE_ORDEM) === 'lista' ? 'lista' : 'roteiro'; } catch { return 'roteiro'; }
};
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export default function ApontamentoSimulacaoModal({
  posicoes, posicoesEstoque, zlEm, usuarioNome, apontamentos, onSalvo, onClose,
}: {
  /** Já sem os itens sem saldo na ZL0024 e sem EPI. */
  posicoes: PosicaoSimulada[];
  /** Posições de estoque da ZL0024 por `chavePosicao(material, depósito)`. */
  posicoesEstoque: Map<string, string[]>;
  zlEm: string;
  usuarioNome: string;
  apontamentos: Map<string, ApontamentoSimulacao>;
  onSalvo: (a: ApontamentoSimulacao) => void;
  onClose: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>('abertos');
  const [ordem, setOrdemEstado] = useState<Ordem>(lerOrdem);
  const [busca, setBusca] = useState('');
  const [contando, setContando] = useState<PosicaoSimulada | null>(null);
  const [fotos, setFotos] = useState<Map<string, CatalogoItem>>(new Map());
  const lightbox = useLightbox();

  const setOrdem = (o: Ordem) => {
    setOrdemEstado(o);
    try { localStorage.setItem(CHAVE_ORDEM, o); } catch { /* só não lembra */ }
  };

  useEffect(() => {
    let vivo = true;
    buscarFotosCatalogoPorCodigosSap(posicoes.map(p => p.material))
      .then(m => { if (vivo) setFotos(m); })
      .catch(err => console.warn('[ApontamentoSimulacao] fotos do catálogo indisponíveis:', err));
    return () => { vivo = false; };
  }, [posicoes]);

  const posicoesDe = (p: PosicaoSimulada) => posicoesEstoque.get(chavePosicao(p.material, p.deposito)) ?? [];
  const ordenados = useMemo(
    () => (ordem === 'roteiro' ? ordenarPorRoteiro(posicoes, posicoesDe) : posicoes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posicoes, ordem, posicoesEstoque],
  );
  const numero = useMemo(() => new Map(ordenados.map((p, i) => [chaveApontamento(p), i + 1])), [ordenados]);

  const situacao = (p: PosicaoSimulada) => situacaoApontamento(p.esperado, apontamentos.get(chaveApontamento(p))?.contado);
  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { abertos: 0, contados: 0, diferenca: 0, todos: posicoes.length };
    for (const p of posicoes) {
      const s = situacao(p);
      if (s === 'contar') c.abertos++;
      else { c.contados++; if (s === 'diferenca') c.diferenca++; }
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicoes, apontamentos]);

  const itens = useMemo(() => {
    const termos = normalizar(busca.trim()).split(/\s+/).filter(Boolean);
    return ordenados.filter(p => {
      const s = situacao(p);
      if (filtro === 'abertos' && s !== 'contar') return false;
      if (filtro === 'contados' && s === 'contar') return false;
      if (filtro === 'diferenca' && s !== 'diferenca') return false;
      if (!termos.length) return true;
      const alvo = normalizar([p.material, p.descricao, p.deposito, ...posicoesDe(p)].join(' '));
      return termos.every(t => alvo.includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordenados, filtro, busca, apontamentos]);

  /** Próximo a contar na ordem de trabalho, depois do atual. */
  const proximoAberto = (depois: PosicaoSimulada | null) => {
    const idx = depois ? ordenados.indexOf(depois) : -1;
    return [...ordenados.slice(idx + 1), ...ordenados.slice(0, Math.max(idx, 0))]
      .find(p => p !== depois && situacao(p) === 'contar') ?? null;
  };
  const proximo = proximoAberto(null);
  const feitos = posicoes.length - contagem.abertos;

  const verFoto = (p: PosicaoSimulada) => {
    const url = fotos.get(p.material)?.url_imagem;
    if (url) lightbox.abrir([{ url, legenda: `SAP ${p.material} · ${p.descricao}` }], 0, { copiar: true });
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel="Apontamento de contagem da simulação">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Apontamento de contagem</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          Conferência da simulação de baixas · corte da ZL0024 de {formatDateTimeBR(zlEm)} · não é inventário (uma contagem, sem travas)
        </p>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-3">
          <section className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }} aria-label="Progresso">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>Progresso</span>
              <span className="font-semibold tabular-nums" style={{ color: 'var(--ink-primary)' }}>
                {feitos} de {posicoes.length} contados{contagem.diferenca > 0 && <span style={{ color: 'var(--status-critical)' }}> · {contagem.diferenca} com diferença</span>}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--surface-sunken)' }}>
              <div className="h-full rounded-full" style={{ width: `${posicoes.length ? (feitos / posicoes.length) * 100 : 0}%`, background: 'var(--status-good)' }} />
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar itens">
              {(Object.keys(ROTULO_FILTRO) as Filtro[]).map(f => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filtro === f}
                  onClick={() => setFiltro(f)}
                  className="inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-bold sm:min-h-0 sm:py-1"
                  style={filtro === f
                    ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: 'white' }
                    : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                >
                  {ROTULO_FILTRO[f]} <span className="ml-1 tabular-nums opacity-80">{contagem[f]}</span>
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1 basis-48">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} aria-hidden="true" />
              <input
                type="search"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar material, descrição ou posição"
                aria-label="Buscar item"
                className="w-full rounded-lg border py-2 pl-8 pr-3 text-sm sm:text-xs"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
              {itens.length} {itens.length === 1 ? 'item' : 'itens'}{ordem === 'roteiro' ? ' · na ordem do galpão' : ' · por depósito e material'}
            </span>
            <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--hairline)' }} role="group" aria-label="Ordem dos itens">
              {([['roteiro', 'Por localização', Route], ['lista', 'Por material', ListOrdered]] as const).map(([o, rotulo, Icone]) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrdem(o)}
                  aria-pressed={ordem === o}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold sm:min-h-0 sm:py-1"
                  style={ordem === o ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
                >
                  <Icone className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
                </button>
              ))}
            </div>
          </div>

          {itens.length === 0 ? (
            <p className="rounded-xl border border-dashed py-10 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
              {filtro === 'abertos' && posicoes.length > 0 ? 'Todos os itens foram contados.' : 'Nenhum item nesse filtro.'}
            </p>
          ) : (
            <div className="space-y-2">
              {itens.map((p, idx) => {
                const pos = posicoesDe(p);
                const grupo = ordem === 'roteiro' ? grupoDoRoteiro(pos[0]) : null;
                const anterior = ordem === 'roteiro' && idx > 0 ? grupoDoRoteiro(posicoesDe(itens[idx - 1])[0]) : null;
                return (
                  <React.Fragment key={chaveApontamento(p)}>
                    {grupo && grupo !== anterior && (
                      <h4 className="flex items-center gap-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {grupo}
                      </h4>
                    )}
                    <LinhaApontamento
                      posicao={p}
                      numero={numero.get(chaveApontamento(p)) ?? idx + 1}
                      posicoes={pos}
                      foto={fotos.get(p.material)?.url_imagem ?? null}
                      apontamento={apontamentos.get(chaveApontamento(p))}
                      onAbrir={() => setContando(p)}
                      onVerFoto={() => verFoto(p)}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>Fechar</button>
        {proximo && (
          <button
            type="button"
            onClick={() => setContando(proximo)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
            style={{ background: 'var(--brand)' }}
          >
            <ClipboardList className="h-4 w-4" /> Contar próximo · {contagem.abertos} a contar <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </ModalFooter>

      {contando && (
        <ContarItem
          key={chaveApontamento(contando)}
          posicao={contando}
          numero={numero.get(chaveApontamento(contando)) ?? 0}
          posicoes={posicoesDe(contando)}
          zlEm={zlEm}
          usuarioNome={usuarioNome}
          anterior={apontamentos.get(chaveApontamento(contando))}
          temProximo={proximoAberto(contando) != null}
          onSalvo={(a, seguir) => {
            onSalvo(a);
            setContando(seguir ? proximoAberto(contando) : null);
          }}
          onClose={() => setContando(null)}
        />
      )}
      {lightbox.elemento}
    </Modal>
  );
}

function LinhaApontamento({
  posicao: p, numero, posicoes, foto, apontamento, onAbrir, onVerFoto,
}: {
  posicao: PosicaoSimulada;
  numero: number;
  posicoes: string[];
  foto: string | null;
  apontamento?: ApontamentoSimulacao;
  onAbrir: () => void;
  onVerFoto: () => void;
}) {
  const s = situacaoApontamento(p.esperado, apontamento?.contado);
  const dif = diferencaApontamento(p.esperado, apontamento?.contado);
  const token = s === 'coincide' ? 'var(--status-good)' : s === 'diferenca' ? 'var(--status-critical)' : 'var(--hairline)';
  const local = posicoes[0] ?? null;
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: s === 'contar' ? 'var(--hairline)' : `color-mix(in srgb, ${token} 45%, var(--hairline))`, background: 'var(--surface-raised)' }}>
      <div className="flex items-stretch gap-1">
        <div className="flex shrink-0 items-start py-2.5 pl-2.5">
          {foto ? (
            <button type="button" onClick={onVerFoto} aria-label={`Ver foto de ${p.descricao || p.material}`} className="group relative h-14 w-14 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
              <img src={foto} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition group-hover:opacity-100"><Eye className="h-3.5 w-3.5" /></span>
            </button>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
              <Camera className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </div>
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 px-2 py-2.5 text-left">
          <span className="flex items-start gap-1.5">
            <span className="shrink-0 text-[11px] font-extrabold tabular-nums leading-5" style={{ color: 'var(--ink-muted)' }}>{numero}.</span>
            <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-bold leading-5 sm:text-xs" style={{ color: 'var(--ink-primary)' }}>{p.descricao || '—'}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <span className="font-mono font-semibold">{p.material}</span>
            <span>{formatDeposito(p.deposito)}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--ink-primary)' }}>
              Esperado: {formatQtd(p.esperado)} {p.unidade}
            </span>
            {apontamento ? (
              <span className="inline-flex items-center gap-1 font-bold" style={{ color: token }}>
                <Check className="h-3 w-3" /> Contado {formatQtd(apontamento.contado)} {p.unidade}
                {dif != null && dif !== 0 && ` (${dif > 0 ? '+' : ''}${formatQtd(dif)})`}
              </span>
            ) : (
              <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>A contar</span>
            )}
          </span>
        </button>
      </div>
      {local ? (
        <p className="flex min-h-9 items-center gap-2 border-t px-3 py-1.5" style={{ borderColor: 'var(--hairline)' }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--status-critical)' }} aria-hidden="true" />
          <span className="shrink-0 font-mono text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
            {local}{posicoes.length > 1 && <span className="font-sans font-semibold" style={{ color: 'var(--ink-muted)' }}> +{posicoes.length - 1}</span>}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--ink-muted)' }}>{descreverPosicao(local) ?? ''}</span>
        </p>
      ) : (
        <p className="flex min-h-8 items-center gap-2 border-t px-3 text-[11px]" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Sem posição na ZL0024
        </p>
      )}
    </div>
  );
}

function ContarItem({
  posicao: p, numero, posicoes, zlEm, usuarioNome, anterior, temProximo, onSalvo, onClose,
}: {
  posicao: PosicaoSimulada;
  numero: number;
  posicoes: string[];
  zlEm: string;
  usuarioNome: string;
  anterior?: ApontamentoSimulacao;
  temProximo: boolean;
  onSalvo: (a: ApontamentoSimulacao, seguir: boolean) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const idQtd = useId();
  const idObs = useId();
  const [qtd, setQtd] = useState(anterior ? String(anterior.contado).replace('.', ',') : '');
  const [obs, setObs] = useState(anterior?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  // "3.360,5" (milhar com ponto) ou "1.5" (decimal com ponto, sem vírgula).
  const t = qtd.trim();
  const valor = t === '' ? null : Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  const valido = valor != null && Number.isFinite(valor) && valor >= 0;
  const dif = valido ? diferencaApontamento(p.esperado, valor) : null;

  const salvar = async (seguir: boolean) => {
    if (!valido) { toast.warning('Informe a quantidade contada.'); return; }
    setSalvando(true);
    try {
      const salvo = await salvarApontamentoSimulacao({
        zl_em: zlEm, material: p.material, deposito: p.deposito, unidade: p.unidade, descricao: p.descricao || null,
        posicao: posicoes[0] ?? null, esperado: p.esperado, contado: valor!, observacao: obs.trim() || null, contado_por_nome: usuarioNome,
      });
      toast.success(`${p.material}: ${formatQtd(valor)} ${p.unidade} apontado.`);
      onSalvo(salvo, seguir);
    } catch (err) {
      toast.error(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-md" zIndexClassName="z-[110]" ariaLabel={`Contar ${p.material}`}>
      <ModalHeader onClose={onClose}>
        <p className="font-mono text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>{numero}. {p.material} · {formatDeposito(p.deposito)}</p>
        <h3 className="line-clamp-2 text-base font-bold" style={{ color: 'var(--ink-primary)' }}>{p.descricao || '—'}</h3>
        {posicoes[0] && (
          <p className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
            <MapPin className="h-3.5 w-3.5" style={{ color: 'var(--status-critical)' }} aria-hidden="true" /> {posicoes.join(', ')}
          </p>
        )}
      </ModalHeader>
      <ModalBody>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void salvar(temProximo); }}>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {[['Saldo SAP', p.saldo], ['Saídas', -p.saidas], ['Entradas', p.entradas]].map(([r, v]) => (
              <div key={r as string} className="rounded-lg border p-2" style={{ borderColor: 'var(--hairline)' }}>
                <p style={{ color: 'var(--ink-muted)' }}>{r}</p>
                <p className="font-bold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{formatQtd(v as number | null)}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3 text-center" style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>Físico esperado</p>
            <p className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--ink-primary)' }}>{formatQtd(p.esperado)} <span className="text-sm">{p.unidade}</span></p>
          </div>
          <div>
            <label htmlFor={idQtd} className="block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Quantidade contada ({p.unidade})</label>
            <input
              id={idQtd}
              inputMode="decimal"
              autoFocus
              value={qtd}
              onChange={e => setQtd(e.target.value.replace(/[^\d.,]/g, ''))}
              className="mt-1 w-full rounded-xl border px-3 py-3 text-center text-2xl font-extrabold tabular-nums"
              style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
            />
            {dif != null && (
              <p className="mt-1 text-center text-xs font-bold" style={{ color: dif === 0 ? 'var(--status-good)' : 'var(--status-critical)' }}>
                {dif === 0 ? 'Coincide com o esperado' : `Diferença de ${dif > 0 ? '+' : ''}${formatQtd(dif)} ${p.unidade}`}
              </p>
            )}
          </div>
          <div>
            <label htmlFor={idObs} className="block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Observação (opcional)</label>
            <input id={idObs} value={obs} onChange={e => setObs(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }} />
          </div>
          {anterior && (
            <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Já apontado: {formatQtd(anterior.contado)} {p.unidade} por {anterior.contado_por_nome || '—'}{anterior.contado_em ? ` em ${formatDateTimeBR(anterior.contado_em)}` : ''}. Salvar de novo substitui.
            </p>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ color: 'var(--ink-secondary)' }}>Cancelar</button>
        <button type="button" disabled={salvando || !valido} onClick={() => void salvar(false)} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}>
          Salvar
        </button>
        {temProximo && (
          <button type="button" disabled={salvando || !valido} onClick={() => void salvar(true)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />} Salvar e próximo
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

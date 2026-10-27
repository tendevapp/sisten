/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Gemba: o galpão em 3D. Busca um item (código, descrição ou
 * posição) e acende o lugar exato (Rua/Anexo › Bloco › Andar › Apto) no padrão
 * de endereçamento do procedimento 5.5. Clicar num bloco lista o que tem nele.
 *
 * Itens: ZL0024, Cadastro de Itens (SAP e peças da BOM com localização) e a
 * última posição guardada — o zerado aparece com a etiqueta "Zerado".
 *
 * Só leitura. Links diretos: `#/almoxarifado/gemba?item=1174180` e `?pos=104.130218`.
 * Lógica em `lib/gembaEndereco.ts`, `lib/gembaLayout.ts` e `lib/gembaIndice.ts`.
 */

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, Box, ClipboardList, Home, Keyboard, Loader2, Map as MapIcon, MapPin, Navigation,
  PackageMinus, RefreshCw, Search, Warehouse, X,
} from 'lucide-react';
import type { Profile } from '../../types';
import { formatDeposito, formatQtd } from '../../lib/almoxarifado';
import { obterUrlFotoCatalogo } from '../../lib/almoxCatalogoApi';
import { carregarIndiceGemba } from '../../lib/gembaApi';
import { COR_BIN_VAZIO, COR_CARGA, ROTULO_CARGA, montarCargas, type TipoCarga } from '../../lib/gembaCarga';
import { doisDigitos, interpretarPosicao, type Endereco } from '../../lib/gembaEndereco';
import {
  buscarItensGemba, itemTemLugar, type IndiceGemba, type ItemGemba, type ItemNoBloco, type LocalItem,
} from '../../lib/gembaIndice';
import {
  ESTANTES, chaveBloco, localizar, vistaDoVao, vistaGeral, vistaPlanta, vistasRapidas, type Localizacao, type Vista,
} from '../../lib/gembaLayout';
import { useMovimentoReduzido } from '../../components/home/cenas/util';
import { useLightbox } from '../../components/ui/Lightbox';
import ErrorBoundary from '../../components/ErrorBoundary';
import EscolhaAcaoItemQr from '../../components/EscolhaAcaoItemQr';
import { acoesDoItemQr } from '../../lib/acoesQr';
import type { SelecaoVao } from '../../components/almoxarifado/gemba/GembaCena';

import Gemba2D from '../../components/almoxarifado/gemba/Gemba2D';

const GembaCena = lazy(() => import('../../components/almoxarifado/gemba/GembaCena'));

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

function parametroUrl(nome: string): string {
  return new URLSearchParams(window.location.hash.split('?')[1] || '').get(nome)?.trim() || '';
}

function temWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const MOTIVO_FORA: Record<string, string> = {
  externo: 'Fora deste galpão (depósito externo)',
  virtual: 'Depósito virtual: não tem lugar físico',
  desconhecido: 'Posição fora do padrão: confira no SAP ou no cadastro',
};

function textoSemLugar(endereco: Endereco | null): string {
  if (!endereco) return 'Sem posição cadastrada';
  if (endereco.tipo === 'fora') return MOTIVO_FORA[endereco.motivo];
  if (endereco.tipo === 'prateleira') return `Depósito ${endereco.deposito} não está no mapa`;
  return 'Lugar não encontrado no mapa';
}

const ORIGEM: Record<LocalItem['origem'], string> = {
  zl0024: 'ZL0024',
  cadastro: 'Cadastro',
  bom: 'Cadastro BOM',
  ultima: 'Última posição (zerado)',
  deposito: 'Sem endereço',
};

/** Etiqueta curta ao lado do item: zerado (sem saldo hoje) e peça da BOM. */
function Etiqueta({ tipo }: { tipo: 'zerado' | 'bom' }) {
  const zerado = tipo === 'zerado';
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide"
      style={zerado
        ? { background: 'rgba(220, 38, 38, 0.12)', color: '#b91c1c' }
        : { background: 'rgba(37, 99, 235, 0.12)', color: '#1d4ed8' }}
      title={zerado ? 'Sem saldo hoje; a posição é a última conhecida' : 'Peça da BOM (Cadastro de Itens › BOM)'}
    >
      {zerado ? 'Zerado' : 'BOM'}
    </span>
  );
}

function Etiquetas({ item }: { item: ItemGemba }) {
  if (!item.zerado && !item.partNumber) return null;
  return (
    <>
      {item.partNumber && <Etiqueta tipo="bom" />}
      {item.zerado && <Etiqueta tipo="zerado" />}
    </>
  );
}

function LocalChip({ local, ativo, onClick }: { local: LocalItem; ativo: boolean; onClick: () => void }) {
  const loc = local.localizacao;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!loc}
      className="w-full rounded-xl border px-3 py-2 text-left transition-all enabled:hover:opacity-90 enabled:active:scale-[0.99] disabled:cursor-default"
      style={{
        borderColor: ativo ? '#f59e0b' : 'var(--hairline)',
        background: ativo ? 'rgba(245, 158, 11, 0.12)' : 'var(--surface-raised)',
      }}
    >
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: loc ? '#f59e0b' : 'var(--ink-muted)' }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold leading-snug" style={{ color: 'var(--ink-primary)' }}>
            {loc ? loc.trilha.join(' › ') : textoSemLugar(local.endereco)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            {local.posicao && <span className="font-mono font-bold">{local.posicao}</span>}
            {local.deposito && <span>{formatDeposito(local.deposito)}</span>}
            {local.saldo != null && <span className="font-bold tabular-nums">Saldo {formatQtd(local.saldo)}</span>}
            <span>· {ORIGEM[local.origem]}</span>
          </div>
          {loc?.aproximado && (
            <div className="mt-1 text-[11px] font-semibold" style={{ color: '#b45309' }}>
              Aproximado: o mapa acende só o que se sabe desta posição.
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function linhaDoBloco(x: ItemNoBloco): string {
  const e = x.local.endereco;
  if (e?.tipo !== 'prateleira') return x.local.posicao;
  const andar = e.andar === 0 ? 'Chão' : `Andar ${doisDigitos(e.andar)}`;
  return e.apartamento != null ? `${andar} · Apto ${doisDigitos(e.apartamento)}` : andar;
}

const VISTAS_RAPIDAS = vistasRapidas();

const TIPOS_LEGENDA: TipoCarga[] = ['caixa', 'epi', 'saco', 'fardo', 'bobina', 'balde', 'perfil', 'miudeza'];

/** O que cada forma de carga quer dizer; escondida no celular para não tampar o mapa. */
function LegendaCarga() {
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 hidden max-w-[calc(100%-1rem)] lg:max-w-[58%] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold sm:flex"
      style={{ borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--surface-card) 88%, transparent)', color: 'var(--ink-secondary)' }}
    >
      {TIPOS_LEGENDA.map(t => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_CARGA[t] }} />
          {ROTULO_CARGA[t]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: COR_BIN_VAZIO, borderColor: 'var(--hairline)' }} />
        Bin vazio
      </span>
    </div>
  );
}

export default function Gemba({ user, onNavigate }: Props) {
  const reduzido = useMovimentoReduzido();
  const lightbox = useLightbox();
  const webgl = useMemo(temWebGL, []);
  // Sem WebGL só existe o 2D; com WebGL abre no 3D e o usuário alterna.
  const [modoEscolhido, setModoEscolhido] = useState<'3d' | '2d'>(() => (parametroUrl('vista') === '2d' ? '2d' : '3d'));
  const modo: '3d' | '2d' = webgl ? modoEscolhido : '2d';

  const [indice, setIndice] = useState<IndiceGemba | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [termo, setTermo] = useState(() => parametroUrl('item'));
  const [soSemLugar, setSoSemLugar] = useState(false);
  const [item, setItem] = useState<ItemGemba | null>(null);
  const [localAtivo, setLocalAtivo] = useState(0);
  const [posicaoAvulsa, setPosicaoAvulsa] = useState<string>(() => parametroUrl('pos'));
  const [selecao, setSelecao] = useState<SelecaoVao | null>(null);
  const [foto, setFoto] = useState<string | null>(null);
  // Mesma janela do "Ler QR": baixa no balcão ou inventário cíclico do item escolhido.
  const [acaoDoItem, setAcaoDoItem] = useState<string | null>(null);
  const acoes = useMemo(() => acoesDoItemQr(user), [user]);

  const [vista, setVista] = useState<Vista>(() => vistaGeral());
  const [versaoVista, setVersaoVista] = useState(0);
  const irPara = useCallback((v: Vista) => {
    setVista(v);
    setVersaoVista(n => n + 1);
  }, []);

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true);
    setErro(null);
    try {
      setIndice(await carregarIndiceGemba(forcar));
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar o estoque.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const escolherItem = useCallback((novo: ItemGemba | null) => {
    setItem(novo);
    setSelecao(null);
    setPosicaoAvulsa('');
    setFoto(null);
    const primeiro = novo ? novo.locais.findIndex(l => l.localizacao) : -1;
    setLocalAtivo(Math.max(0, primeiro));
    if (novo && primeiro >= 0) irPara(novo.locais[primeiro].localizacao!.vista);
  }, [irPara]);

  // Link direto ?pos=: acende a posição na hora, sem esperar o estoque.
  useEffect(() => {
    const pos = parametroUrl('pos');
    const endereco = pos ? interpretarPosicao(pos) : null;
    const loc = endereco ? localizar(endereco) : null;
    if (loc) irPara(loc.vista);
  }, [irPara]);

  // Link direto ?item=: abre o item já focado. Só na 1ª carga do estoque.
  const linkAplicado = useRef(false);
  useEffect(() => {
    if (!indice || linkAplicado.current) return;
    linkAplicado.current = true;
    const pedido = parametroUrl('item');
    // Peça da BOM que juntou com o material SAP fica no código SAP; o link vem pelo part number.
    const achado = indice.porCodigo.get(pedido) ?? indice.itens.find(i => i.partNumber === pedido);
    if (achado) escolherItem(achado);
  }, [indice, escolherItem]);

  // Foto só do item escolhido: poupa o egress do Storage.
  useEffect(() => {
    let vivo = true;
    if (item?.imagemPath) void obterUrlFotoCatalogo(item.imagemPath).then(url => { if (vivo) setFoto(url); });
    return () => { vivo = false; };
  }, [item]);

  const semLugar = useMemo(() => (indice ? indice.itens.filter(i => !itemTemLugar(i)) : []), [indice]);
  const resultados = useMemo(() => {
    if (!indice) return [];
    if (soSemLugar) return semLugar.slice(0, 200);
    return buscarItensGemba(indice, termo);
  }, [indice, termo, soSemLugar, semLugar]);

  const locaisDoItem = useMemo(() => (item ? item.locais.filter(l => l.localizacao) : []), [item]);
  const destaques = useMemo<Localizacao[]>(() => {
    if (item) return locaisDoItem.map(l => l.localizacao!);
    if (posicaoAvulsa) {
      const e = interpretarPosicao(posicaoAvulsa);
      const loc = e ? localizar(e) : null;
      return loc ? [loc] : [];
    }
    return [];
  }, [item, locaisDoItem, posicaoAvulsa]);
  const principal = item ? Math.max(0, locaisDoItem.indexOf(item.locais[localAtivo])) : 0;

  // Ruas sem endereçamento (0003, 0005): o painel lista o material do depósito, sem bloco.
  const semEnderecoDoDeposito = useCallback((deposito: string): ItemNoBloco[] => {
    if (!indice) return [];
    const lista: ItemNoBloco[] = [];
    for (const item of indice.itens) {
      for (const local of item.locais) {
        if (local.origem === 'deposito' && local.deposito === deposito) lista.push({ item, local });
      }
    }
    return lista;
  }, [indice]);

  const blocoSelecionado = useMemo(() => {
    if (!selecao) return null;
    const estante = ESTANTES.find(e => e.id === selecao.estanteId);
    if (!estante) return null;
    if (estante.blocos.length === 0) return { estante, bloco: null, itens: semEnderecoDoDeposito(estante.deposito) };
    const bloco = estante.blocos[selecao.indice];
    if (bloco == null) {
      return estante.semEnderecoNosVaosLivres ? { estante, bloco: null, itens: semEnderecoDoDeposito(estante.deposito) } : null;
    }
    return { estante, bloco, itens: indice?.porBloco.get(chaveBloco(estante.deposito, bloco)) ?? [] };
  }, [selecao, indice, semEnderecoDoDeposito]);

  const { cargas, porZona } = useMemo(
    () => (indice ? montarCargas(indice) : { cargas: [], porZona: {} as Record<string, number> }),
    [indice],
  );

  // Dica ao passar o mouse num vão: quantos itens com saldo há no bloco.
  const rotuloVao = useCallback((estanteId: string, i: number): string | null => {
    const estante = ESTANTES.find(e => e.id === estanteId);
    if (!estante || !indice) return null;
    if (estante.blocos.length === 0) {
      const n = semEnderecoDoDeposito(estante.deposito).length;
      return `${estante.trilha.join(' · ')} sem endereçamento: ${n} ${n === 1 ? 'item' : 'itens'}`;
    }
    const bloco = estante.blocos[i];
    if (bloco == null) {
      if (!estante.semEnderecoNosVaosLivres) return null;
      const n = semEnderecoDoDeposito(estante.deposito).length;
      return `${estante.trilha.join(' · ')} sem endereço: ${n} ${n === 1 ? 'item' : 'itens'}`;
    }
    const lista = (indice.porBloco.get(chaveBloco(estante.deposito, bloco)) ?? []).filter(x => (x.local.saldo ?? 0) > 0);
    const titulo = `${estante.trilha.join(' · ')} · Bloco ${doisDigitos(bloco)}`;
    if (lista.length === 0) return `${titulo}: vazio`;
    if (lista.length === 1) return `${titulo}: ${lista[0].item.descricao}`;
    return `${titulo}: ${lista.length} itens`;
  }, [indice, semEnderecoDoDeposito]);

  const clicarVao = useCallback((estanteId: string, i: number) => {
    const estante = ESTANTES.find(e => e.id === estanteId);
    if (!estante) return;
    setItem(null);
    setPosicaoAvulsa('');
    setSelecao({ estanteId, indice: i });
    irPara(vistaDoVao(estante, i));
  }, [irPara]);

  const limpar = () => {
    escolherItem(null);
    setSelecao(null);
    setPosicaoAvulsa('');
  };

  const painel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b p-4" style={{ borderColor: 'var(--hairline)' }}>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/almoxarifado')}
            className="group inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all hover:opacity-90 active:scale-95"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Almoxarifado
          </button>
          <button
            type="button"
            onClick={() => void carregar(true)}
            disabled={carregando}
            title="Recarregar o estoque"
            className="rounded-xl border p-1.5 transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <h1 className="flex items-center gap-2 text-xl font-extrabold" style={{ color: 'var(--ink-primary)' }}>
          <Warehouse className="h-6 w-6" style={{ color: 'var(--brand)' }} />
          Gemba
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>almoxarifado em {modo === '3d' ? '3D' : '2D'}</span>
        </h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-muted)' }} />
          <input
            type="search"
            value={termo}
            onChange={ev => { setTermo(ev.target.value); setSoSemLugar(false); setItem(null); setSelecao(null); }}
            placeholder="Código SAP, part number, descrição ou posição (104.13)"
            className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none focus:ring-2"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          />
        </div>
        {semLugar.length > 0 && (
          <button
            type="button"
            onClick={() => { setSoSemLugar(v => !v); setItem(null); setSelecao(null); }}
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold"
            style={{
              borderColor: soSemLugar ? '#f59e0b' : 'var(--hairline)',
              color: soSemLugar ? '#b45309' : 'var(--ink-muted)',
              background: soSemLugar ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Sem lugar no mapa ({semLugar.length})
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {carregando && !indice && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando o estoque…
          </div>
        )}
        {erro && (
          <div className="rounded-xl border p-3 text-sm" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>{erro}</div>
        )}

        {item ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => escolherItem(null)}
              className="inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: 'var(--ink-muted)' }}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Resultados
            </button>
            <div className="flex gap-3">
              {foto ? (
                <button type="button" onClick={() => lightbox.abrir([{ url: foto, legenda: item.descricao }])} className="shrink-0">
                  <img src={foto} alt={item.descricao} className="h-20 w-20 rounded-xl border object-cover" style={{ borderColor: 'var(--hairline)' }} />
                </button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
                  <Box className="h-7 w-7" style={{ color: 'var(--ink-muted)' }} />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-block rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold" style={{ background: 'var(--ink-primary)', color: 'var(--ink-inverse)' }}>
                    {item.codigo}
                  </span>
                  <Etiquetas item={item} />
                </div>
                <div className="mt-1 text-sm font-extrabold leading-snug" style={{ color: 'var(--ink-primary)' }}>{item.descricao}</div>
                <div className="mt-0.5 text-xs font-bold tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                  {item.codigo === item.partNumber ? 'Saldo no Projetos' : 'Saldo'}: {formatQtd(item.saldoTotal)} {item.umb}
                </div>
              </div>
            </div>
            {/* Peça só da BOM não tem código SAP: não sai no balcão nem no inventário cíclico. */}
            {acoes.length > 0 && item.codigo !== item.partNumber && (
              <button
                type="button"
                onClick={() => setAcaoDoItem(item.codigo)}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'var(--brand)' }}
              >
                {acoes.length > 1 ? (
                  <><ClipboardList className="h-4 w-4" /> Baixa ou inventário</>
                ) : acoes[0] === 'baixa' ? (
                  <><PackageMinus className="h-4 w-4" /> Requisição no balcão</>
                ) : (
                  <><ClipboardList className="h-4 w-4" /> Inventário cíclico</>
                )}
              </button>
            )}
            <div className="space-y-2">
              {item.locais.length === 0 && (
                <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                  Sem posição na ZL0024 nem no Cadastro de Itens. Material de cliente não é endereçado, só identificado.
                </div>
              )}
              {item.locais.map((l, i) => (
                <LocalChip
                  key={`${l.posicao}-${l.deposito}-${i}`}
                  local={l}
                  ativo={i === localAtivo && Boolean(l.localizacao)}
                  onClick={() => { setLocalAtivo(i); if (l.localizacao) irPara(l.localizacao.vista); }}
                />
              ))}
            </div>
          </div>
        ) : blocoSelecionado ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>
                  {blocoSelecionado.estante.trilha.join(' · ')}
                </div>
                <div className="text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                  {blocoSelecionado.bloco != null ? `Bloco ${doisDigitos(blocoSelecionado.bloco)}` : 'Sem endereço'}
                </div>
              </div>
              <button type="button" onClick={() => setSelecao(null)} title="Fechar" className="rounded-lg p-1" style={{ color: 'var(--ink-muted)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {blocoSelecionado.itens.length === 0 ? (
              <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                {blocoSelecionado.bloco != null ? 'Nenhum item com posição neste bloco.' : 'Nenhum item com saldo neste depósito.'}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {blocoSelecionado.itens.map((x, i) => (
                  <li key={`${x.item.codigo}-${i}`}>
                    <button
                      type="button"
                      onClick={() => escolherItem(x.item)}
                      className="w-full rounded-xl border px-3 py-2 text-left transition-all hover:opacity-90"
                      style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                    >
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="font-bold" style={{ color: '#b45309' }}>{linhaDoBloco(x)}</span>
                        <span className="inline-flex items-center gap-1.5 font-bold tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                          {x.local.saldo != null && x.local.saldo > 0 && `${formatQtd(x.local.saldo)} ${x.item.umb}`}
                          {x.item.partNumber && <Etiqueta tipo="bom" />}
                          {(x.item.zerado || (x.local.saldo != null && x.local.saldo <= 0)) && <Etiqueta tipo="zerado" />}
                        </span>
                      </div>
                      <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--ink-primary)' }}>
                        <span className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>{x.item.codigo}</span> {x.item.descricao}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {indice && !termo.trim() && !soSemLugar && (
              <div className="space-y-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
                <p>Busque um item para ver onde ele está, ou toque num bloco do mapa para ver o que tem nele.</p>
                <p className="text-xs">
                  Endereço: <span className="font-mono font-bold">DEPÓSITO.BLOCO.ANDAR.APARTAMENTO</span>. Exemplo:{' '}
                  <span className="font-mono">104.130218</span> = Anexo 0004, Bloco 13, Andar 02, Apto 18.
                </p>
              </div>
            )}
            {indice && (termo.trim() || soSemLugar) && resultados.length === 0 && (
              <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Nenhum item encontrado.</div>
            )}
            {resultados.map(r => {
              const primeiro = r.locais.find(l => l.localizacao)?.localizacao;
              return (
                <button
                  key={r.codigo}
                  type="button"
                  onClick={() => escolherItem(r)}
                  className="w-full rounded-xl border px-3 py-2 text-left transition-all hover:opacity-90 active:scale-[0.99]"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{r.codigo}</span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                      <Etiquetas item={r} />
                      {!r.zerado && `${formatQtd(r.saldoTotal)} ${r.umb}`}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--ink-primary)' }}>{r.descricao}</div>
                  <div className="mt-0.5 truncate text-[11px] font-bold" style={{ color: primeiro ? '#b45309' : 'var(--ink-muted)' }}>
                    {primeiro ? primeiro.trilha.join(' › ') : textoSemLugar(r.locais[0]?.endereco ?? null)}
                    {r.locais.filter(l => l.localizacao).length > 1 && ` (+${r.locais.filter(l => l.localizacao).length - 1})`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const botaoMapa = 'inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur transition-all hover:opacity-90 active:scale-95';
  const estiloBotaoMapa = { borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--surface-card) 85%, transparent)', color: 'var(--ink-secondary)' };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row" style={{ background: 'var(--surface-page)' }}>
      <aside
        className="order-2 min-h-0 flex-1 border-t lg:order-1 lg:w-[380px] lg:flex-none lg:border-r lg:border-t-0"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        {painel}
      </aside>

      <section className={`relative order-1 h-[52%] shrink-0 lg:order-2 lg:h-auto lg:flex-1 ${modo === '2d' ? 'flex flex-col' : ''}`}>
        {modo === '2d' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Gemba2D
              destaques={destaques}
              principal={principal}
              selecao={selecao}
              onClicarVao={clicarVao}
              rotuloVao={rotuloVao}
              reduzido={reduzido}
            />
          </div>
        ) : (
          <ErrorBoundary>
            <Suspense
              fallback={(
                <div className="flex h-full items-center justify-center gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Montando o galpão…
                </div>
              )}
            >
              <GembaCena
                destaques={destaques}
                principal={principal}
                vista={vista}
                versaoVista={versaoVista}
                selecao={selecao}
                onClicarVao={clicarVao}
                reduzido={reduzido}
                cargas={cargas}
                porZona={porZona}
                rotuloVao={rotuloVao}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        <div className={modo === '2d' ? 'order-first flex flex-wrap justify-end gap-1.5 px-2 pt-2' : 'pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-end gap-1.5 p-2'}>
            {(item || selecao || posicaoAvulsa) && (
              <button type="button" onClick={limpar} className={`pointer-events-auto ${botaoMapa}`} style={estiloBotaoMapa}>
                <X className="h-3.5 w-3.5" /> Limpar
              </button>
            )}
            {webgl && (
              <div
                role="group"
                aria-label="Modo de visualização"
                className="pointer-events-auto inline-flex overflow-hidden rounded-xl border shadow-sm backdrop-blur"
                style={{ borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--surface-card) 85%, transparent)' }}
              >
                {(['3d', '2d'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModoEscolhido(m)}
                    aria-pressed={modo === m}
                    className="px-2.5 py-1.5 text-[11px] font-extrabold transition-colors"
                    style={{
                      background: modo === m ? 'var(--brand)' : 'transparent',
                      color: modo === m ? '#fff' : 'var(--ink-secondary)',
                    }}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {modo === '3d' && (<>
            <button type="button" onClick={() => irPara(vistaGeral())} className={`pointer-events-auto ${botaoMapa}`} style={estiloBotaoMapa}>
              <Home className="h-3.5 w-3.5" /> Visão geral
            </button>
            <button type="button" onClick={() => irPara(vistaPlanta())} className={`pointer-events-auto ${botaoMapa}`} style={estiloBotaoMapa}>
              <MapIcon className="h-3.5 w-3.5" /> Planta
            </button>
            <label className={`pointer-events-auto ${botaoMapa} pr-1`} style={estiloBotaoMapa}>
              <Navigation className="h-3.5 w-3.5" />
              <span className="sr-only">Ir para</span>
              <select
                value=""
                onChange={ev => {
                  const v = VISTAS_RAPIDAS.find(x => x.id === ev.target.value);
                  if (v) irPara(v.vista);
                }}
                className="cursor-pointer bg-transparent text-[11px] font-bold outline-none"
                style={{ color: 'var(--ink-secondary)' }}
              >
                <option value="" disabled>Ir para…</option>
                {VISTAS_RAPIDAS.map(v => <option key={v.id} value={v.id}>{v.rotulo}</option>)}
              </select>
            </label>
            {destaques[principal] && (
              <button type="button" onClick={() => irPara(destaques[principal].vista)} className={`pointer-events-auto ${botaoMapa}`} style={estiloBotaoMapa}>
                <MapPin className="h-3.5 w-3.5" /> Ir ao item
              </button>
            )}
            </>)}
          </div>
        {modo === '3d' && <LegendaCarga />}
        {modo === '3d' && (
          <div
            className="pointer-events-none absolute bottom-2 right-2 hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold lg:flex"
            style={{ borderColor: 'var(--hairline)', background: 'color-mix(in srgb, var(--surface-card) 88%, transparent)', color: 'var(--ink-secondary)' }}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Setas ou WASD movem · com Shift giram · + e − aproximam
          </div>
        )}
      </section>

      {lightbox.elemento}
      {acaoDoItem && (
        <EscolhaAcaoItemQr user={user} codigo={acaoDoItem} onNavigate={onNavigate} onClose={() => setAcaoDoItem(null)} />
      )}
    </div>
  );
}

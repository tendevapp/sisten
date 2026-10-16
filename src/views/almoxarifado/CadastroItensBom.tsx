/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Cadastro de Itens > Itens BOM.
 *
 * As peças da BOM do projeto (uma por part number), para completar foto e
 * localização e imprimir a etiqueta de identificação no desenho da etiqueta de
 * papel: código do item, código equivalente e quantidade por seção
 * (S1..S5). Descrição, código equivalente e quantidades vêm da BOM; foto, localização e a
 * descrição impressa ficam em `alm_bom_itens_cadastro`.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardPaste, ImageIcon, Loader2, MapPin, Printer, RefreshCw, Square, CheckSquare, Trash2, Upload, X,
} from 'lucide-react';
import type { Profile, ProjBomNo } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { useLightbox } from '../../components/ui/Lightbox';
import SearchKeywordsChips from '../../components/ui/SearchKeywordsChips';
import PdfPreviewModal, { type PdfGerado } from '../../components/ui/PdfPreviewModal';
import { listarBom } from '../../lib/projetosApi';
import { PROJETO_PADRAO, normalizarPartNumber } from '../../lib/projetos';
import { casarTokens, normalizarParaBusca } from '../../lib/buscaKeywords';
import {
  agruparItensBom, dadosEtiquetaBom, type DadosEtiquetaBom, type ItemBom,
} from '../../lib/etiquetaBom';
import {
  CORES_ETIQUETA, ORDEM_CORES_ETIQUETA, ehCorEtiqueta, type CorEtiqueta,
} from '../../lib/etiquetaMaterial';
import {
  listarCadastrosBom, marcarEtiquetasBomImpressas, salvarCadastroBom, type CadastroBom,
} from '../../lib/almoxBomCadastroApi';
import { gerarPdfEtiquetasBom } from '../../lib/pdfExport/exportEtiquetasBomPdf';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
  /** Peça a abrir assim que a lista carregar (QR da etiqueta BOM). */
  pecaInicial?: { partNumber: string; n: number } | null;
}

type FiltroFoto = 'todos' | 'com_foto' | 'sem_foto';
type FiltroLocal = 'todos' | 'com_local' | 'sem_local';

const LOTE = 60;
const CHAVE_COR = 'sisten_etiqueta_cor';

const inputCls =
  'w-full rounded-lg border p-2.5 text-xs focus:outline-2 focus:outline-offset-1 border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)] focus:outline-[var(--brand)]';
const selectCls =
  'rounded-lg border px-2.5 py-2 text-xs font-semibold cursor-pointer border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)]';

const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export default function CadastroItensBom({ user, onNavigate, pecaInicial }: Props) {
  const toast = useToast();
  const lightbox = useLightbox();

  const [itens, setItens] = useState<ItemBom[]>([]);
  const [cadastros, setCadastros] = useState<Map<string, CadastroBom>>(new Map());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [buscaChips, setBuscaChips] = useState<string[]>([]);
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [filtroSecao, setFiltroSecao] = useState('');
  const [filtroFoto, setFiltroFoto] = useState<FiltroFoto>('todos');
  const [filtroLocal, setFiltroLocal] = useState<FiltroLocal>('todos');
  const [visiveisQtd, setVisiveisQtd] = useState(LOTE);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const [aberto, setAberto] = useState<ItemBom | null>(null);
  const [preview, setPreview] = useState<{ dados: DadosEtiquetaBom[]; chaves: string[] } | null>(null);
  const [cor, setCor] = useState<CorEtiqueta>(() => {
    try {
      const salva = localStorage.getItem(CHAVE_COR);
      return ehCorEtiqueta(salva) ? salva : 'cinza';
    } catch {
      return 'cinza';
    }
  });
  const escolherCor = (c: CorEtiqueta) => {
    setCor(c);
    try { localStorage.setItem(CHAVE_COR, c); } catch { /* só não lembra */ }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [bom, cad] = await Promise.all([listarBom(PROJETO_PADRAO), listarCadastrosBom(PROJETO_PADRAO)]);
      setItens(agruparItensBom(bom as ProjBomNo[]));
      setCadastros(cad);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível carregar a BOM.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // QR da etiqueta BOM: abre a peça assim que a lista carregar (uma vez por leitura).
  const pecaAplicada = useRef(0);
  useEffect(() => {
    if (!pecaInicial || pecaInicial.n <= pecaAplicada.current || carregando || itens.length === 0) return;
    pecaAplicada.current = pecaInicial.n;
    const alvo = normalizarPartNumber(pecaInicial.partNumber);
    const item = itens.find((i) => i.chave === alvo);
    if (item) {
      setBuscaChips([item.partNumber]);
      setAberto(item);
    } else {
      toast.warning(`Peça ${pecaInicial.partNumber} não está na BOM do projeto.`);
    }
  }, [pecaInicial, carregando, itens, toast]);

  const grupos = useMemo(() => [...new Set(itens.flatMap((i) => i.grupos))].sort(), [itens]);
  const secoes = useMemo(
    () => [...new Set(itens.flatMap((i) => i.secoes.map((s) => s.secao).filter(Boolean) as string[]))].sort(),
    [itens],
  );

  const filtrados = useMemo(() => {
    const tokens = buscaChips.map(normalizarParaBusca).filter(Boolean);
    return itens.filter((i) => {
      const cad = cadastros.get(i.chave);
      if (filtroGrupo && !i.grupos.includes(filtroGrupo)) return false;
      if (filtroSecao && !i.secoes.some((s) => s.secao === filtroSecao)) return false;
      if (filtroFoto === 'com_foto' && !cad?.imagem_path) return false;
      if (filtroFoto === 'sem_foto' && cad?.imagem_path) return false;
      if (filtroLocal === 'com_local' && !cad?.posicao_estoque) return false;
      if (filtroLocal === 'sem_local' && cad?.posicao_estoque) return false;
      if (tokens.length && !casarTokens(
        [i.partNumber, i.chave, i.descricao, i.descricaoEn, i.qingdao, i.codSap, cad?.posicao_estoque, cad?.etiqueta_descricao, ...i.grupos],
        tokens,
      )) return false;
      return true;
    });
  }, [itens, cadastros, buscaChips, filtroGrupo, filtroSecao, filtroFoto, filtroLocal]);

  useEffect(() => { setVisiveisQtd(LOTE); }, [buscaChips, filtroGrupo, filtroSecao, filtroFoto, filtroLocal]);

  const kpis = useMemo(() => {
    let comFoto = 0;
    let comLocal = 0;
    let impressas = 0;
    for (const i of itens) {
      const cad = cadastros.get(i.chave);
      if (cad?.imagem_path) comFoto += 1;
      if (cad?.posicao_estoque) comLocal += 1;
      if (cad?.etiqueta_impressa_em) impressas += 1;
    }
    return { total: itens.length, comFoto, comLocal, impressas };
  }, [itens, cadastros]);

  const alternarSelecao = (chave: string) => setSelecionados((s) => {
    const n = new Set(s);
    if (n.has(chave)) n.delete(chave); else n.add(chave);
    return n;
  });
  const todosVisiveisMarcados = filtrados.length > 0 && filtrados.every((i) => selecionados.has(i.chave));
  const alternarTodosVisiveis = () => setSelecionados((s) => {
    const n = new Set(s);
    if (todosVisiveisMarcados) filtrados.forEach((i) => n.delete(i.chave));
    else filtrados.forEach((i) => n.add(i.chave));
    return n;
  });

  const abrirPreview = (lista: ItemBom[]) => {
    if (lista.length === 0) { toast.warning('Marque ao menos uma peça para imprimir a etiqueta.'); return; }
    const dados = lista.map((i) => {
      const cad = cadastros.get(i.chave);
      return dadosEtiquetaBom(i, cad, cad?.url_imagem ?? null);
    });
    const incompletas = dados.filter((d) => !d.localizacao || !d.url_foto).length;
    if (incompletas > 0) {
      toast.info(`${incompletas} etiqueta(s) sem localização ou foto — o campo sai em branco para preencher à mão.`);
    }
    setPreview({ dados, chaves: lista.map((i) => i.chave) });
  };

  const gerarPdf = useCallback(async (): Promise<PdfGerado> => {
    const dados = preview?.dados ?? [];
    const doc = await gerarPdfEtiquetasBom(dados, cor);
    return {
      bytes: await doc.save(),
      nomeArquivo: `etiquetas_bom_${new Date().toISOString().slice(0, 10)}.pdf`,
      titulo: `Etiquetas BOM — ${dados.length} etiqueta(s), ${Math.ceil(dados.length / 10)} folha(s) A4`,
    };
  }, [preview, cor]);

  const aoBaixar = async (chaves: string[]) => {
    const em = await marcarEtiquetasBomImpressas(chaves);
    if (!em) return;
    const marcadas = new Set(chaves);
    setCadastros((atual) => {
      const n = new Map(atual);
      n.forEach((c, k) => { if (marcadas.has(k)) n.set(k, { ...c, etiqueta_impressa_em: em }); });
      return n;
    });
  };

  const aoSalvar = (salvo: CadastroBom) => {
    setCadastros((atual) => new Map(atual).set(salvo.part_number_norm, salvo));
  };

  const visiveis = filtrados.slice(0, visiveisQtd);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/almoxarifado')}
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline cursor-pointer"
            style={{ color: 'var(--ink-secondary)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar aos formulários do almoxarifado
          </button>
          <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--ink-primary)' }}>
            Itens BOM — Projeto {PROJETO_PADRAO.replace('_', ' ')}
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Peças da BOM com a quantidade por seção. Cadastre foto e localização e gere a etiqueta de identificação
            (código do item, código equivalente e quantidade por seção). Descrição e quantidades vêm da BOM.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Recarregar
          </button>
          <button
            type="button"
            onClick={() => abrirPreview(itens.filter((i) => selecionados.has(i.chave)))}
            disabled={selecionados.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Imprimir etiquetas ({selecionados.size})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Peças na BOM', valor: kpis.total, detalhe: 'part numbers distintos' },
          { rotulo: 'Com foto', valor: kpis.comFoto, detalhe: `${kpis.total ? Math.round((kpis.comFoto / kpis.total) * 100) : 0}% das peças` },
          { rotulo: 'Com localização', valor: kpis.comLocal, detalhe: `${kpis.total ? Math.round((kpis.comLocal / kpis.total) * 100) : 0}% das peças` },
          { rotulo: 'Etiqueta impressa', valor: kpis.impressas, detalhe: 'ao menos uma vez' },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-xl border p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
            <span className="block text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{k.rotulo}</span>
            <span className="mt-0.5 block text-2xl font-black tabular-nums" style={{ color: 'var(--ink-primary)' }}>{k.valor}</span>
            <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{k.detalhe}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2.5 rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <SearchKeywordsChips
          chips={buscaChips}
          onChangeChips={setBuscaChips}
          accent="brand"
          placeholder="Buscar por part number, descrição, código equivalente, código SAP ou localização (Enter adiciona)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className={selectCls} aria-label="Grupo">
            <option value="">Todos os grupos</option>
            {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filtroSecao} onChange={(e) => setFiltroSecao(e.target.value)} className={selectCls} aria-label="Seção">
            <option value="">Todas as seções</option>
            {secoes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtroFoto} onChange={(e) => setFiltroFoto(e.target.value as FiltroFoto)} className={selectCls} aria-label="Foto">
            <option value="todos">Com e sem foto</option>
            <option value="com_foto">Com foto</option>
            <option value="sem_foto">Sem foto</option>
          </select>
          <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value as FiltroLocal)} className={selectCls} aria-label="Localização">
            <option value="todos">Com e sem localização</option>
            <option value="com_local">Com localização</option>
            <option value="sem_local">Sem localização</option>
          </select>
          <button
            type="button"
            onClick={alternarTodosVisiveis}
            disabled={filtrados.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--brand)' }}
          >
            {todosVisiveisMarcados ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {todosVisiveisMarcados ? 'Desmarcar' : 'Marcar'} os {filtrados.length} do filtro
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--status-serious)', color: 'var(--ink-primary)' }}>{erro}</div>
      )}

      {carregando && itens.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" style={{ color: 'var(--brand)' }} /></div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed py-12 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
          Nenhuma peça com esses filtros.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visiveis.map((i) => {
              const cad = cadastros.get(i.chave);
              const marcado = selecionados.has(i.chave);
              return (
                <div
                  key={i.chave}
                  className="flex gap-3 rounded-xl border p-3 transition-colors"
                  style={{
                    borderColor: marcado ? 'var(--brand)' : 'var(--hairline)',
                    background: marcado ? 'color-mix(in srgb, var(--brand) 6%, var(--surface-card))' : 'var(--surface-card)',
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => alternarSelecao(i.chave)}
                      aria-pressed={marcado}
                      aria-label={marcado ? 'Desmarcar para etiqueta' : 'Marcar para etiqueta'}
                      className="cursor-pointer"
                      style={{ color: marcado ? 'var(--brand)' : 'var(--ink-muted)' }}
                    >
                      {marcado ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </button>
                    {cad?.url_imagem ? (
                      <button
                        type="button"
                        onClick={() => lightbox.abrir([{ url: cad.url_imagem!, legenda: `${i.partNumber} — ${i.descricao}` }])}
                        className="h-16 w-16 overflow-hidden rounded-lg border cursor-zoom-in"
                        style={{ borderColor: 'var(--hairline)' }}
                        title="Ampliar"
                      >
                        <img src={cad.url_imagem} alt={i.descricao} className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setAberto(i)} className="min-w-0 flex-1 text-left cursor-pointer">
                    <p className="font-mono text-sm font-black" style={{ color: 'var(--ink-primary)' }}>{i.partNumber}</p>
                    <p className="truncate text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }} title={cad?.etiqueta_descricao || i.descricao}>
                      {cad?.etiqueta_descricao || i.descricao}
                    </p>
                    {i.qingdao && (
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Equivalente <span className="font-mono">{i.qingdao}</span></p>
                    )}
                    <p className="mt-1 text-[11px] tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                      {i.secoes.length
                        ? i.secoes.map((s) => `${s.secao ?? '—'} ${fmtQtd(s.quantidade)}`).join(' · ')
                        : 'Sem quantidade por seção'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                      {i.grupos.slice(0, 3).map((g) => (
                        <span key={g} className="rounded px-1.5 py-0.5" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}>{g}</span>
                      ))}
                      <span
                        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5"
                        style={cad?.posicao_estoque
                          ? { background: 'color-mix(in srgb, var(--status-good) 14%, transparent)', color: 'var(--status-good)' }
                          : { background: 'color-mix(in srgb, var(--status-warning) 14%, transparent)', color: 'var(--status-warning)' }}
                      >
                        <MapPin className="h-3 w-3" /> {cad?.posicao_estoque || 'sem localização'}
                      </span>
                      {cad?.etiqueta_impressa_em && (
                        <span className="inline-flex items-center gap-0.5" style={{ color: 'var(--ink-muted)' }} title="Última impressão da etiqueta">
                          <Printer className="h-3 w-3" /> {dataBR(cad.etiqueta_impressa_em)}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {filtrados.length > visiveis.length && (
            <button
              type="button"
              onClick={() => setVisiveisQtd((q) => q + LOTE)}
              className="w-full rounded-xl border py-2.5 text-xs font-bold cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
            >
              Mostrar mais ({filtrados.length - visiveis.length} restantes)
            </button>
          )}
        </>
      )}

      {aberto && (
        <ModalPecaBom
          user={user}
          item={aberto}
          cadastro={cadastros.get(aberto.chave) ?? null}
          onFechar={() => setAberto(null)}
          onSalvo={aoSalvar}
          onEtiqueta={(dados) => { setPreview({ dados: [dados], chaves: [aberto.chave] }); setAberto(null); }}
          onAmpliar={(url) => lightbox.abrir([{ url, legenda: `${aberto.partNumber} — ${aberto.descricao}` }])}
        />
      )}

      {preview && (
        <PdfPreviewModal
          gerar={gerarPdf}
          tituloPadrao="Etiquetas BOM"
          acoesExtras={(
            <div className="flex items-center gap-1.5 rounded-xl border px-2 py-1" style={{ borderColor: 'var(--hairline)' }} role="radiogroup" aria-label="Cor da etiqueta">
              <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>Cor:</span>
              {ORDEM_CORES_ETIQUETA.map((c) => {
                const tema = CORES_ETIQUETA[c];
                const ativa = cor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={ativa}
                    aria-label={tema.rotulo}
                    title={tema.rotulo}
                    onClick={() => escolherCor(c)}
                    className="h-6 w-6 rounded-full border-2 transition"
                    style={{
                      background: tema.titulo,
                      borderColor: ativa ? 'var(--brand)' : 'rgba(0,0,0,0.15)',
                      boxShadow: ativa ? '0 0 0 2px var(--surface-card), 0 0 0 4px var(--brand)' : undefined,
                    }}
                  />
                );
              })}
            </div>
          )}
          onClose={() => setPreview(null)}
          onBaixar={() => void aoBaixar(preview.chaves)}
        />
      )}

      {lightbox.elemento}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal da peça: foto, localização, descrição da etiqueta
// ---------------------------------------------------------------------------

function ModalPecaBom({
  user, item, cadastro, onFechar, onSalvo, onEtiqueta, onAmpliar,
}: {
  user: Profile;
  item: ItemBom;
  cadastro: CadastroBom | null;
  onFechar: () => void;
  onSalvo: (salvo: CadastroBom) => void;
  onEtiqueta: (dados: DadosEtiquetaBom) => void;
  onAmpliar: (url: string) => void;
}) {
  const toast = useToast();
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(cadastro?.url_imagem ?? null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [local, setLocal] = useState(cadastro?.posicao_estoque ?? '');
  const [descricao, setDescricao] = useState(cadastro?.etiqueta_descricao ?? '');
  const [observacao, setObservacao] = useState(cadastro?.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const trocarFoto = useCallback((arquivo: File) => {
    setPreview((anterior) => {
      if (anterior?.startsWith('blob:')) URL.revokeObjectURL(anterior);
      return URL.createObjectURL(arquivo);
    });
    setFoto(arquivo);
    setRemoverFoto(false);
  }, []);

  // Ctrl+V com imagem cola a foto, sem depender do foco estar no modal.
  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const it = Array.from(e.clipboardData?.items ?? []).find((x) => x.kind === 'file' && x.type.startsWith('image/'));
      const arquivo = it?.getAsFile();
      if (!arquivo) return;
      e.preventDefault();
      trocarFoto(arquivo);
      toast.success('Imagem colada da área de transferência.');
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, [trocarFoto, toast]);

  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvando) onFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar, salvando]);

  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (arquivo) trocarFoto(arquivo);
  };

  const mudou = Boolean(foto) || removerFoto
    || local.trim() !== (cadastro?.posicao_estoque ?? '')
    || descricao.trim() !== (cadastro?.etiqueta_descricao ?? '')
    || observacao.trim() !== (cadastro?.observacao ?? '');

  const salvar = async (): Promise<CadastroBom | null> => {
    setSalvando(true);
    try {
      const salvo = await salvarCadastroBom({
        partNumber: item.partNumber,
        partNumberNorm: item.chave,
        posicao_estoque: local,
        etiqueta_descricao: descricao,
        observacao,
        fotoArquivo: foto,
        removerFoto,
      }, user);
      onSalvo(salvo);
      setFoto(null);
      setRemoverFoto(false);
      setPreview(salvo.url_imagem ?? null);
      return salvo;
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar a peça.');
      return null;
    } finally {
      setSalvando(false);
    }
  };

  const salvarEFechar = async () => {
    const salvo = await salvar();
    if (salvo) { toast.success(`Peça ${item.partNumber} salva.`); onFechar(); }
  };

  /** Etiqueta com o que está na tela: salva antes se algo mudou, para a foto e a localização saírem. */
  const etiqueta = async () => {
    const atual = mudou ? await salvar() : cadastro;
    if (mudou && !atual) return;
    onEtiqueta(dadosEtiquetaBom(item, atual, atual?.url_imagem ?? null));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-label={`Peça ${item.partNumber}`}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--hairline)' }}>
          <div className="min-w-0">
            <h3 className="font-mono text-base font-black" style={{ color: 'var(--ink-primary)' }}>{item.partNumber}</h3>
            <p className="truncate text-xs" style={{ color: 'var(--ink-muted)' }}>{item.descricao}</p>
          </div>
          <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg p-1 cursor-pointer" style={{ color: 'var(--ink-muted)' }} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Dados da BOM (só leitura) */}
          <div className="space-y-1.5 rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-secondary)' }}>
            {item.descricaoEn && item.descricaoEn !== item.descricao && <p><span className="font-bold">Inglês:</span> {item.descricaoEn}</p>}
            <p><span className="font-bold">Código equivalente:</span> {item.qingdao || '—'}</p>
            {item.codSap && <p><span className="font-bold">Código SAP:</span> <span className="font-mono">{item.codSap}</span></p>}
            <p><span className="font-bold">Grupos:</span> {item.grupos.join(', ') || '—'}</p>
            <table className="mt-1 w-full text-left">
              <thead>
                <tr style={{ color: 'var(--ink-muted)' }}>
                  <th className="py-0.5 font-bold">Seção</th><th className="py-0.5 font-bold">Grupo</th><th className="py-0.5 text-right font-bold">Qtd/torre</th>
                </tr>
              </thead>
              <tbody>
                {item.secoes.map((s) => (
                  <tr key={`${s.secao}-${s.grupo}`} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                    <td className="py-0.5 font-bold">{s.secao ?? '—'}</td>
                    <td className="py-0.5">{s.grupo || '—'}</td>
                    <td className="py-0.5 text-right tabular-nums font-bold">{fmtQtd(s.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Foto */}
          <div className="space-y-2">
            <label className="block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Foto da peça</label>
            <div className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed" style={{ borderColor: preview && !removerFoto ? 'var(--brand)' : 'var(--hairline)', background: 'var(--surface-raised)' }}>
              {preview && !removerFoto ? (
                <>
                  <button type="button" onClick={() => onAmpliar(preview)} className="h-full w-full cursor-zoom-in" title="Ampliar">
                    <img src={preview} alt="Foto da peça" className="h-full w-full object-contain p-2" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (foto) { setFoto(null); setPreview(cadastro?.url_imagem ?? null); } else { setRemoverFoto(true); } }}
                    className="absolute right-2 top-2 rounded-lg bg-rose-600 p-1.5 text-white shadow-md hover:bg-rose-700 cursor-pointer"
                    title={foto ? 'Descartar a foto escolhida' : 'Remover a foto do cadastro'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="p-6 text-center">
                  <Camera className="mx-auto mb-2 h-9 w-9 stroke-1" style={{ color: 'var(--ink-muted)' }} />
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>{removerFoto ? 'A foto será removida ao salvar' : 'Nenhuma foto'}</p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolher} />
              <button type="button" onClick={() => cameraRef.current?.click()} disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
                <Camera className="h-4 w-4 text-amber-600" /> Tirar foto
              </button>
              <input ref={galeriaRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="hidden" onChange={escolher} />
              <button type="button" onClick={() => galeriaRef.current?.click()} disabled={salvando} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold cursor-pointer" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}>
                <Upload className="h-4 w-4 text-blue-600" /> Galeria
              </button>
            </div>
            <p className="flex items-center justify-center gap-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              <ClipboardPaste className="h-3.5 w-3.5" /> Ou cole uma imagem com Ctrl+V
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Localização no depósito</label>
            <input value={local} onChange={(e) => setLocal(e.target.value.toUpperCase())} placeholder="Ex: 101.A10" className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Descrição na etiqueta</label>
            <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={item.descricao} className={inputCls} />
            <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-muted)' }}>Em branco, usa a descrição da BOM.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>Observação (opcional)</label>
            <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--hairline)' }}>
          {cadastro?.atualizado_por_nome ? (
            <span className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>Últ. alt.: {cadastro.atualizado_por_nome} · {dataBR(cadastro.updated_at)}</span>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void etiqueta()} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }} title="Gera a etiqueta desta peça com o que está na tela">
              <Printer className="h-3.5 w-3.5" /> Etiqueta
            </button>
            <button type="button" onClick={() => void salvarEFechar()} disabled={salvando || !mudou} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 cursor-pointer disabled:opacity-50">
              {salvando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

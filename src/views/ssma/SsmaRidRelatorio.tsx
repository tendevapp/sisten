/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * RID › Relatório — slide 16:9 do período para tirar print e colar no PPT.
 *
 * A estrutura de slide (escala, tela cheia, peças) é a compartilhada de
 * `components/apresentacao/Slides.tsx`. Contas e definições em
 * `lib/ssmaRidRelatorio.ts`.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';
import type { Profile } from '../../types';
import {
  buscarRidsPeriodo, dataBR, hojeLocalIso, intervaloDoPreset, montarRelatorioRid, ROTULO_PRESET,
  type FiltroEmpresa, type ItemRanking, type PresetPeriodo, type RelatorioRid, type RidRelatorioLinha,
} from '../../lib/ssmaRidRelatorio';
import {
  ApresentacaoSlides, ChipSlide, COR_SLIDE, KpiSlide, PainelSlide, RankingSlide, rotuloDentroDaBarra, Slide, SlideVazio,
} from '../../components/apresentacao/Slides';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

const COR = {
  fechado: COR_SLIDE.verde,
  aberto: COR_SLIDE.vermelho,
  comportamento: COR_SLIDE.ambar,
  condicao: COR_SLIDE.azul,
};

const ROTULO_EMPRESA: Record<FiltroEmpresa, string> = { TODAS: 'TEN + Contratadas', TEN: 'TEN', CONTRATADA: 'Contratadas' };

export default function SsmaRidRelatorio({ onNavigate }: Props) {
  const hoje = hojeLocalIso();
  const [preset, setPreset] = useState<PresetPeriodo>('mes_atual');
  const [periodo, setPeriodo] = useState(() => intervaloDoPreset('mes_atual', hoje));
  const [empresa, setEmpresa] = useState<FiltroEmpresa>('TODAS');
  const [linhas, setLinhas] = useState<RidRelatorioLinha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  const escolherPreset = (p: PresetPeriodo) => {
    setPreset(p);
    if (p !== 'personalizado') setPeriodo(intervaloDoPreset(p, hoje));
  };

  const carregar = useCallback(async () => {
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) return;
    setCarregando(true);
    setErro('');
    try {
      setLinhas(await buscarRidsPeriodo(periodo.inicio, periodo.fim));
      setGeradoEm(new Date());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os RIDs.');
    } finally {
      setCarregando(false);
    }
  }, [periodo.inicio, periodo.fim]);

  useEffect(() => { void carregar(); }, [carregar]);

  const relatorio = useMemo(
    () => montarRelatorioRid(linhas, { inicio: periodo.inicio, fim: periodo.fim, hoje, empresa }),
    [linhas, periodo.inicio, periodo.fim, hoje, empresa],
  );

  const periodoInvalido = !periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-16">
      {/* Controles — fora do slide, não saem no print. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/ssma-rid')}
            className="group mb-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar para o RID
          </button>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">RID — Relatório</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
            {(Object.keys(ROTULO_PRESET) as PresetPeriodo[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => escolherPreset(p)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  preset === p
                    ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {ROTULO_PRESET[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={periodo.inicio}
              max={periodo.fim || undefined}
              onChange={e => { setPreset('personalizado'); setPeriodo(p => ({ ...p, inicio: e.target.value })); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              aria-label="Data inicial"
            />
            <span className="text-slate-400">a</span>
            <input
              type="date"
              value={periodo.fim}
              min={periodo.inicio || undefined}
              onChange={e => { setPreset('personalizado'); setPeriodo(p => ({ ...p, fim: e.target.value })); }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              aria-label="Data final"
            />
          </div>
          <select
            value={empresa}
            onChange={e => setEmpresa(e.target.value as FiltroEmpresa)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            aria-label="Empresa"
          >
            {(Object.keys(ROTULO_EMPRESA) as FiltroEmpresa[]).map(e => <option key={e} value={e}>{ROTULO_EMPRESA[e]}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void carregar()}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {periodoInvalido && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">A data inicial precisa ser anterior ou igual à final.</p>
      )}
      {erro && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{erro}</p>
      )}

      <ApresentacaoSlides
        nomeArquivo={`RID - Relatório ${periodo.inicio.split('-').reverse().join('-')} a ${periodo.fim.split('-').reverse().join('-')}`}
        slides={[{
          id: 'rid',
          titulo: 'Abertos × fechados por setor',
          conteudo: <SlideRid relatorio={relatorio} empresa={empresa} geradoEm={geradoEm} carregando={carregando && linhas.length === 0} />,
        }]}
      />
    </div>
  );
}

/* ─────────────────────────────── Slide 1600 × 900 ─────────────────────────────── */

function SlideRid({ relatorio: r, empresa, geradoEm, carregando }: {
  relatorio: RelatorioRid;
  empresa: FiltroEmpresa;
  geradoEm: Date | null;
  carregando: boolean;
}) {
  const vazio = !carregando && r.total === 0;
  const legendaStatus = <><ChipSlide cor={COR.fechado} texto="Fechados" /><ChipSlide cor={COR.aberto} texto="Em aberto" /></>;
  return (
    <Slide
      rotuloSecao={<><ShieldAlert style={{ width: 16, height: 16 }} /> SSMA · FRM.SSMA-0001</>}
      titulo="Registro de Identificação de Desvio (RID)"
      ladoDireito={`${dataBR(r.inicio)} a ${dataBR(r.fim)}`}
      subtituloDireito={`${ROTULO_EMPRESA[empresa]}${geradoEm ? ` · posição de ${geradoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`}
      rodape="Período pela data do registro · Fechado = status Concluído · Setor de quem registrou · Cancelados e excluídos fora"
    >
      <div className="grid grid-cols-5" style={{ gap: 16, height: 118 }}>
        <KpiSlide rotulo="RIDs registrados" valor={r.total} detalhe={`${r.ten} TEN · ${r.contratada} contratada${r.contratada === 1 ? '' : 's'}`} />
        <KpiSlide rotulo="Fechados" valor={r.fechados} detalhe={`${r.pctFechados}% do período`} cor="#059669" fundo="#ecfdf5" />
        <KpiSlide rotulo="Em aberto" valor={r.abertos} detalhe={r.abertos ? `idade média ${r.idadeMediaAbertos} dia${r.idadeMediaAbertos === 1 ? '' : 's'}` : 'nenhum pendente'} cor="#e11d48" fundo="#fff1f2" />
        <KpiSlide rotulo="Sanados na hora" valor={r.sanadosNaHora} detalhe={`${r.pctSanadosNaHora}% resolvidos no ato`} cor="#0369a1" fundo="#f0f9ff" />
        <KpiSlide rotulo="Abertos há + de 30 dias" valor={r.abertosMais30Dias} detalhe="pedem prioridade" cor={r.abertosMais30Dias ? '#b45309' : COR_SLIDE.tinta2} fundo={r.abertosMais30Dias ? '#fffbeb' : undefined} />
      </div>

      {vazio || carregando ? (
        <SlideVazio texto={carregando ? 'Carregando…' : 'Nenhum RID registrado no período.'} />
      ) : (
        <div className="flex flex-1" style={{ gap: 18, minHeight: 0 }}>
          <PainelSlide titulo="RIDs por setor" legenda={legendaStatus} style={{ width: 896 }}>
            <GraficoSetores r={r} />
          </PainelSlide>
          <div className="flex flex-col" style={{ width: 614, gap: 18 }}>
            <PainelSlide titulo={r.granularidade === 'semana' ? 'Evolução por semana de registro' : 'Evolução por mês de registro'} legenda={legendaStatus} style={{ height: 286 }}>
              <GraficoEvolucao r={r} />
            </PainelSlide>
            <div className="flex flex-1" style={{ gap: 18, minHeight: 0 }}>
              <PainelSlide titulo="Principais desvios" style={{ width: 298 }}>
                <RankingSlide itens={paraRanking(r.topClassificacoes, r.total)} vazio="Sem classificação no período." />
                <div className="flex" style={{ gap: 12, fontSize: 11, color: COR_SLIDE.tinta2, marginTop: 'auto' }}>
                  <ChipSlide cor={COR.comportamento} texto="Comportamento" />
                  <ChipSlide cor={COR.condicao} texto="Condição" />
                </div>
              </PainelSlide>
              <PainelSlide titulo="Onde ocorreram" style={{ width: 298 }}>
                <RankingSlide itens={paraRanking(r.topAreas, r.total)} />
              </PainelSlide>
            </div>
          </div>
        </div>
      )}
    </Slide>
  );
}

function paraRanking(itens: ItemRanking[], total: number) {
  return itens.map(i => ({
    chave: `${i.tipo ?? ''}|${i.nome}`,
    nome: i.nome,
    valor: i.quantidade,
    complemento: `${total ? Math.round((i.quantidade / total) * 100) : 0}%`,
    cor: i.tipo === 'comportamento' ? COR.comportamento : i.tipo === 'condicao' ? COR.condicao : undefined,
  }));
}

function GraficoSetores({ r }: { r: RelatorioRid }) {
  const dados = r.porSetor;
  const alturaGrafico = 500;
  const barra = Math.max(16, Math.min(34, Math.floor((alturaGrafico - 20) / Math.max(dados.length, 1)) - 14));
  return (
    <BarChart layout="vertical" width={856} height={alturaGrafico} data={dados} margin={{ top: 4, right: 48, bottom: 4, left: 4 }} barSize={barra}>
      <CartesianGrid horizontal={false} stroke={COR_SLIDE.linha} />
      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: COR_SLIDE.suave }} axisLine={false} tickLine={false} />
      <YAxis type="category" dataKey="setor" width={230} tick={{ fontSize: 13, fill: COR_SLIDE.tinta, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
      <Bar dataKey="fechados" stackId="s" fill={COR.fechado} isAnimationActive={false}>
        <LabelList dataKey="fechados" content={rotuloDentroDaBarra} />
      </Bar>
      <Bar dataKey="abertos" stackId="s" fill={COR.aberto} radius={[0, 6, 6, 0]} isAnimationActive={false}>
        <LabelList dataKey="abertos" content={rotuloDentroDaBarra} />
        <LabelList dataKey="total" position="right" style={{ fontSize: 15, fontWeight: 800, fill: COR_SLIDE.tinta }} />
      </Bar>
    </BarChart>
  );
}

function GraficoEvolucao({ r }: { r: RelatorioRid }) {
  const muitos = r.porPeriodo.length > 14;
  return (
    <BarChart width={572} height={218} data={r.porPeriodo} margin={{ top: 22, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
      <CartesianGrid vertical={false} stroke={COR_SLIDE.linha} />
      <XAxis dataKey="rotulo" tick={{ fontSize: muitos ? 10 : 12, fill: COR_SLIDE.tinta2, fontWeight: 600 }} axisLine={false} tickLine={false} interval={0} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: COR_SLIDE.suave }} axisLine={false} tickLine={false} />
      <Bar dataKey="fechados" stackId="p" fill={COR.fechado} isAnimationActive={false}>
        <LabelList dataKey="fechados" content={rotuloDentroDaBarra} />
      </Bar>
      <Bar dataKey="abertos" stackId="p" fill={COR.aberto} radius={[5, 5, 0, 0]} isAnimationActive={false}>
        <LabelList dataKey="abertos" content={rotuloDentroDaBarra} />
        <LabelList dataKey="total" position="top" formatter={(v: any) => (Number(v) > 0 ? v : '')} style={{ fontSize: 13, fontWeight: 800, fill: COR_SLIDE.tinta }} />
      </Bar>
    </BarChart>
  );
}

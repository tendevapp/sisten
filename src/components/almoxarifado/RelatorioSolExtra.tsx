/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Botão + diálogo do relatório consolidado das Solicitações Extraordinárias
 * (PDF), usado em Solicitação Extraordinária › Registros e na Requisição no
 * Balcão. Escolhe período, tipo, situação e o modo (analítico ou sintético
 * por item / dia / semana / mês); a pré-visualização deixa trocar o modo sem
 * reler os dados.
 *
 * O gerador do PDF e a leitura dos dados entram sob demanda (import dinâmico)
 * para não pesar o pacote das telas.
 */

import { useCallback, useState } from 'react';
import { FileBarChart2, Loader2 } from 'lucide-react';
import type { Profile } from '../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import PdfPreviewModal from '../ui/PdfPreviewModal';
import { useToast } from '../ui/Toast';
import { hojeISO } from '../../lib/fichaEpi';
import {
  ROTULO_AGRUPAMENTO, ROTULO_MODO_RELATORIO, ROTULO_PRESET_PERIODO, intervaloPreset as intervaloPresetLib,
  type PresetPeriodo,
  type AgrupamentoRelatorio, type FiltroRelatorioSolExtra, type ModoRelatorio,
} from '../../lib/relatorioSolExtra';
import type { DadosRelatorioSolExtra } from '../../lib/pdfExport/exportRelatorioSolExtraPdf';

type Preset = PresetPeriodo;
const ROTULO_PRESET = ROTULO_PRESET_PERIODO;
const intervaloPreset = (p: Preset) => intervaloPresetLib(p, hojeISO());

const campo = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const rotulo = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';

export function Segmentado<T extends string>({ opcoes, valor, onChange, ariaLabel }: { opcoes: [T, string][]; valor: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
            valor === v
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function BotaoRelatorioSolExtra({ user, className }: { user: Profile; className?: string }) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [preset, setPreset] = useState<Preset | null>('mes');
  const [filtro, setFiltro] = useState<FiltroRelatorioSolExtra>(() => ({ ...intervaloPreset('mes'), tipo: 'todos', status: 'todos' }));
  const [modo, setModo] = useState<ModoRelatorio>('analitico');
  const [agrupamento, setAgrupamento] = useState<AgrupamentoRelatorio>('item');
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<DadosRelatorioSolExtra | null>(null);

  const escolherPreset = (p: Preset) => {
    setPreset(p);
    setFiltro(f => ({ ...f, ...intervaloPreset(p) }));
  };

  const gerarDados = async () => {
    if (filtro.de && filtro.ate && filtro.de > filtro.ate) {
      toast.warning('A data inicial é depois da final.');
      return;
    }
    setCarregando(true);
    try {
      const { carregarRelatorioSolExtra } = await import('../../lib/relatorioSolExtraApi');
      const d = await carregarRelatorioSolExtra(filtro, user.name || user.email || '');
      if (!d.saldoLido) toast.warning('A ZL0024 não pôde ser lida: os pendentes saem sem separar o que já está liberado.');
      setDados(d);
      setAberto(false);
    } catch (err) {
      toast.error(`Não foi possível montar o relatório: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCarregando(false);
    }
  };

  const gerarPdf = useCallback(async () => {
    if (!dados) throw new Error('Sem dados.');
    const { gerarRelatorioSolExtraPdf } = await import('../../lib/pdfExport/exportRelatorioSolExtraPdf');
    return gerarRelatorioSolExtraPdf(dados, { modo, agrupamento });
  }, [dados, modo, agrupamento]);

  const opcoesModo: [ModoRelatorio, string][] = [['analitico', ROTULO_MODO_RELATORIO.analitico], ['sintetico', ROTULO_MODO_RELATORIO.sintetico]];
  const opcoesAgrupamento = (Object.keys(ROTULO_AGRUPAMENTO) as AgrupamentoRelatorio[]).map(a => [a, ROTULO_AGRUPAMENTO[a]] as [AgrupamentoRelatorio, string]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="PDF consolidado das solicitações extraordinárias: analítico ou sintético, com o que está pendente de baixa e o PO que aguarda a NF"
        className={className ?? 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:border-blue-400 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300'}
      >
        <FileBarChart2 className="h-3.5 w-3.5" /> Relatório PDF
      </button>

      {aberto && (
        <Modal onClose={() => !carregando && setAberto(false)} maxWidth="max-w-lg" ariaLabel="Relatório de solicitações extraordinárias" disableOutsideClose={carregando}>
          <ModalHeader onClose={() => !carregando && setAberto(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Relatório de Solicitações Extraordinárias</h3>
            <p className="text-xs text-slate-500">Projeto (SEM) e Sem saldo (RSS) — com pendências de baixa e PO aguardando NF.</p>
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div>
              <span className={rotulo}>Período</span>
              <Segmentado
                opcoes={(Object.keys(ROTULO_PRESET) as Preset[]).map(p => [p, ROTULO_PRESET[p]] as [Preset, string])}
                valor={preset ?? ('' as Preset)}
                onChange={escolherPreset}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label>
                  <span className={rotulo}>De</span>
                  <input type="date" value={filtro.de ?? ''} onChange={e => { setPreset(null); setFiltro(f => ({ ...f, de: e.target.value || null })); }} className={campo} />
                </label>
                <label>
                  <span className={rotulo}>Até</span>
                  <input type="date" value={filtro.ate ?? ''} onChange={e => { setPreset(null); setFiltro(f => ({ ...f, ate: e.target.value || null })); }} className={campo} />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={rotulo}>Tipo</span>
                <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value as FiltroRelatorioSolExtra['tipo'] }))} className={campo}>
                  <option value="todos">Projeto e Sem saldo</option>
                  <option value="PROJETO">Só Projeto</option>
                  <option value="SEM_SALDO">Só Sem saldo</option>
                </select>
              </label>
              <label>
                <span className={rotulo}>Situação</span>
                <select value={filtro.status} onChange={e => setFiltro(f => ({ ...f, status: e.target.value as FiltroRelatorioSolExtra['status'] }))} className={campo}>
                  <option value="todos">Todas</option>
                  <option value="PENDENTE">Só pendentes</option>
                  <option value="REGULARIZADA">Só baixadas / regularizadas</option>
                </select>
              </label>
            </div>

            <div>
              <span className={rotulo}>Modo</span>
              <Segmentado<ModoRelatorio> opcoes={opcoesModo} valor={modo} onChange={setModo} />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {modo === 'analitico'
                  ? 'Cada material de cada solicitação, com a situação da baixa e o doc. SAP / RQB ou o PO que aguarda a NF.'
                  : 'Totais agrupados; os pendentes saem listados no fim com o PO.'}
              </p>
            </div>

            {modo === 'sintetico' && (
              <div>
                <span className={rotulo}>Agrupar por</span>
                <Segmentado<AgrupamentoRelatorio> opcoes={opcoesAgrupamento} valor={agrupamento} onChange={setAgrupamento} />
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setAberto(false)}
              disabled={carregando}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void gerarDados()}
              disabled={carregando}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBarChart2 className="h-4 w-4" />}
              {carregando ? 'Lendo saldos e POs…' : 'Gerar PDF'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {dados && (
        <PdfPreviewModal
          gerar={gerarPdf}
          onClose={() => setDados(null)}
          tituloPadrao="Relatório de Solicitações Extraordinárias"
          acoesExtras={
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={modo}
                onChange={e => setModo(e.target.value as ModoRelatorio)}
                aria-label="Modo do relatório"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {opcoesModo.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
              {modo === 'sintetico' && (
                <select
                  value={agrupamento}
                  onChange={e => setAgrupamento(e.target.value as AgrupamentoRelatorio)}
                  aria-label="Agrupar por"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {opcoesAgrupamento.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </select>
              )}
            </div>
          }
        />
      )}
    </>
  );
}

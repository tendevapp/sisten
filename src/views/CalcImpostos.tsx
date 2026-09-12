/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela da Calculadora Fiscal (Calc Impostos) no modulo de Suprimentos.
 * Precificacao, desoneracao e apuracao tributaria para compras
 * destinadas a Uso e Consumo ou Ativo Imobilizado.
 */

import React, { useState, useMemo } from 'react';
import {
  Calculator,
  RotateCcw,
  Copy,
  Check,
  Info,
  TrendingDown,
  Receipt,
  Coins,
  Scale,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type { Profile } from '../types';
import { useToast } from '../components/ui/Toast';
import {
  calcularImpostos,
  validarInputsCalcImpostos,
  gerarTextoMemoriaCalculo,
  PRESETS_CODIGOS_FISCAIS,
  INPUTS_PADRAO,
  type CalcImpostosInputs,
  type CodigoFiscalPreset,
} from '../lib/calcImpostos';

interface CalcImpostosProps {
  user: Profile;
  onNavigate?: (path: string) => void;
}

export default function CalcImpostos({ user, onNavigate }: CalcImpostosProps) {
  const toast = useToast();

  // Estados dos inputs
  const [inputs, setInputs] = useState<CalcImpostosInputs>(INPUTS_PADRAO);
  const [presetAtivo, setPresetAtivo] = useState<string>('C1');
  const [mostrarMemoriaDetalhada, setMostrarMemoriaDetalhada] = useState<boolean>(true);
  const [copiado, setCopiado] = useState<boolean>(false);

  // Execucao do calculo tributario e validacoes
  const errosValidacao = useMemo(() => validarInputsCalcImpostos(inputs), [inputs]);
  const resultado = useMemo(() => calcularImpostos(inputs), [inputs]);

  // Formatadores de moeda e porcentagem
  const formatarMoeda = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarMoeda4Casas = (valor: number) =>
    valor.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

  const formatarPercentual = (valor: number, casas: number = 2) =>
    `${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    })}%`;

  // Manipuladores de alteracao dos campos
  const atualizarCampo = <K extends keyof CalcImpostosInputs>(
    campo: K,
    valor: CalcImpostosInputs[K]
  ) => {
    setInputs(prev => ({ ...prev, [campo]: valor }));
    setPresetAtivo(''); // Marca como personalizado se o usuario editar manualmente
  };

  // Aplicacao de presets fiscais (C1, C2, C3, C4, C5, A3, Isento)
  const aplicarPreset = (preset: CodigoFiscalPreset) => {
    setInputs(prev => ({
      ...prev,
      aliqIcms: preset.aliqIcms,
      aliqPis: preset.aliqPis,
      aliqCofins: preset.aliqCofins,
      aliqIpi: preset.aliqIpi,
      fatorReducao: preset.fatorReducao,
    }));
    setPresetAtivo(preset.codigo);
    toast.info(`Codigo fiscal ${preset.codigo} aplicado com sucesso.`);
  };

  // Reset para configuracao padrao
  const handleReset = () => {
    setInputs(INPUTS_PADRAO);
    setPresetAtivo('C1');
    toast.info('Parametros restaurados para o padrao (Preset C1).');
  };

  // Copiar memoria de calculo para area de transferencia
  const handleCopiarMemoria = async () => {
    try {
      const texto = gerarTextoMemoriaCalculo(inputs, resultado);
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success('Memoria de calculo copiada para a area de transferencia.');
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('Nao foi possivel copiar para a area de transferencia.');
    }
  };

  // Atalhos rapidos para adicionar valor ao preco
  const somarAoPreco = (delta: number) => {
    setInputs(prev => ({
      ...prev,
      precoComImpostos: Math.max(0, (Number(prev.precoComImpostos) || 0) + delta),
    }));
  };

  // Calculo das proporcoes para a barra visual empilhada da NF
  const percentualLiquido = resultado.precoBruto > 0 ? (resultado.precoLiquido / resultado.precoBruto) * 100 : 0;
  const percentualIcms = resultado.precoBruto > 0 ? (resultado.icmsApurado / resultado.precoBruto) * 100 : 0;
  const percentualPis = resultado.precoBruto > 0 ? (resultado.pisApurado / resultado.precoBruto) * 100 : 0;
  const percentualCofins = resultado.precoBruto > 0 ? (resultado.cofinsApurado / resultado.precoBruto) * 100 : 0;
  const percentualIpi = resultado.precoBruto > 0 ? (resultado.ipiApurado / resultado.precoBruto) * 100 : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      {/* Cabecalho da Pagina */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Calculator className="h-3.5 w-3.5" />
              Suprimentos &bull; Engenharia Tributaria
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Uso e Consumo &bull; Ativo Imobilizado
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-50 sm:text-3xl">
            Calculadora Fiscal &bull; Calc Impostos
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Apuracao de impostos (ICMS, PIS, COFINS, IPI), desoneracao de base e calculo do preco liquido para aquisicoes industriais.
          </p>
        </div>

        {/* Botoes de Acao Superior */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Restaurar parametros originais"
          >
            <RotateCcw className="h-4 w-4 text-slate-400" />
            Restaurar Padroes
          </button>

          <button
            type="button"
            onClick={handleCopiarMemoria}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98] dark:bg-amber-500 dark:hover:bg-amber-600"
            title="Copiar resumo da memoria de calculo para colar em RFQ, pedido SAP ou e-mail"
          >
            {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiado ? 'Copiado!' : 'Copiar Memoria'}
          </button>
        </div>
      </header>

      {/* Grid Principal em Duas Colunas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* ============================================================ */}
        {/* COLUNA ESQUERDA: Parametros de Entrada e Selecao de Presets */}
        {/* ============================================================ */}
        <div className="space-y-6 lg:col-span-5">
          {/* Card de Presets Tributarios / Codigos Fiscais de IVA */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Codigos Fiscais Tipicos (Presets)
                </h2>
              </div>
              {presetAtivo ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                  {presetAtivo} Ativo
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Personalizado
                </span>
              )}
            </div>

            <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Alterne rapidamente entre alquotas padronizadas no ERP/SAP conforme a origem, destino e regime da compra:
            </p>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESETS_CODIGOS_FISCAIS.map(preset => {
                const isSelected = presetAtivo === preset.codigo;
                return (
                  <button
                    key={preset.codigo}
                    type="button"
                    onClick={() => aplicarPreset(preset)}
                    className={`flex flex-col items-start rounded-xl p-2.5 text-left border transition ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 text-amber-950 shadow-sm ring-1 ring-amber-500 dark:border-amber-400 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-bold">{preset.titulo}</span>
                    <span className="mt-0.5 text-[11px] leading-tight text-slate-500 dark:text-slate-400 line-clamp-2">
                      {preset.descricao}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Formulario de Entradas (Inputs) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Scale className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Parametros da Operacao
              </h2>
            </div>

            {/* Preco com ICMS, PIS e COFINS (R$) */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="preco-com-impostos"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Preco com ICMS, PIS e COFINS (R$){' '}
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                  Base mercadoria
                </span>
              </div>

              <div className="relative mt-1.5 rounded-lg shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-xs font-bold text-slate-400">R$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  id="preco-com-impostos"
                  value={inputs.precoComImpostos || ''}
                  onChange={e => atualizarCampo('precoComImpostos', parseFloat(e.target.value) || 0)}
                  placeholder="0,00"
                  className={`block w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 ${
                    errosValidacao.precoComImpostos
                      ? 'border-rose-400 text-rose-900 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-slate-300 bg-white text-slate-900 focus:border-amber-500 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                />
              </div>

              {errosValidacao.precoComImpostos && (
                <p className="mt-1 text-xs text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errosValidacao.precoComImpostos}
                </p>
              )}

              {/* Botoes de adicao rapida */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Atalhos:</span>
                {[100, 500, 1000, 5000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => somarAoPreco(val)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    +{val >= 1000 ? `${val / 1000}k` : val}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => atualizarCampo('precoComImpostos', 0)}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                >
                  Zerar
                </button>
              </div>
            </div>

            {/* Grid de Aliquotas: ICMS e IPI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Aliquota ICMS */}
              <div>
                <label
                  htmlFor="aliq-icms"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Aliquota ICMS (%)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    id="aliq-icms"
                    value={inputs.aliqIcms}
                    onChange={e => atualizarCampo('aliqIcms', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                    %
                  </span>
                </div>
                {/* Chips rapidos de ICMS */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[4, 7, 12, 18, 20.5].map(taxa => (
                    <button
                      key={taxa}
                      type="button"
                      onClick={() => atualizarCampo('aliqIcms', taxa)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        inputs.aliqIcms === taxa
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {taxa}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Aliquota IPI */}
              <div>
                <label
                  htmlFor="aliq-ipi"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Aliquota IPI (%)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    id="aliq-ipi"
                    value={inputs.aliqIpi}
                    onChange={e => atualizarCampo('aliqIpi', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                    %
                  </span>
                </div>
                {/* Chips rapidos de IPI */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[0, 5, 8, 10, 15].map(taxa => (
                    <button
                      key={taxa}
                      type="button"
                      onClick={() => atualizarCampo('aliqIpi', taxa)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        inputs.aliqIpi === taxa
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {taxa}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid de Aliquotas: PIS e COFINS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Aliquota PIS */}
              <div>
                <label
                  htmlFor="aliq-pis"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Aliquota PIS (%)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    id="aliq-pis"
                    value={inputs.aliqPis}
                    onChange={e => atualizarCampo('aliqPis', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                    %
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[0, 0.65, 1.65].map(taxa => (
                    <button
                      key={taxa}
                      type="button"
                      onClick={() => atualizarCampo('aliqPis', taxa)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        inputs.aliqPis === taxa
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {taxa}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Aliquota COFINS */}
              <div>
                <label
                  htmlFor="aliq-cofins"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Aliquota COFINS (%)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    id="aliq-cofins"
                    value={inputs.aliqCofins}
                    onChange={e => atualizarCampo('aliqCofins', parseFloat(e.target.value) || 0)}
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                    %
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[0, 3.0, 7.6].map(taxa => (
                    <button
                      key={taxa}
                      type="button"
                      onClick={() => atualizarCampo('aliqCofins', taxa)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        inputs.aliqCofins === taxa
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {taxa}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Fator de Reducao da Base do ICMS */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800/80 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor="fator-reducao"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    Fator de Reducao da Base ICMS
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Decimal de 0 a 1 (1 = 100% integral / sem reducao)
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    {inputs.fatorReducao.toFixed(4)}
                  </span>
                  {resultado.temReducaoBaseIcms && (
                    <span className="block text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      -{resultado.percentualReducaoBase.toFixed(2)}% base
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.0001"
                  id="fator-reducao-slider"
                  value={inputs.fatorReducao}
                  onChange={e => atualizarCampo('fatorReducao', parseFloat(e.target.value) || 0)}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-amber-600 dark:bg-slate-700"
                />
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  id="fator-reducao"
                  value={inputs.fatorReducao}
                  onChange={e => atualizarCampo('fatorReducao', parseFloat(e.target.value) || 0)}
                  className="w-24 rounded-lg border border-slate-300 bg-white py-1 px-2 text-right font-mono text-xs font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Atalhos para Fator de Reducao */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: 'Sem Reducao (1,00)', val: 1 },
                  { label: 'Conv. 52/91 (0,6667)', val: 0.6667 },
                  { label: 'Reducao 50% (0,50)', val: 0.5 },
                  { label: 'Conv. 52/91 (0,4167)', val: 0.4167 },
                ].map(item => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => atualizarCampo('fatorReducao', item.val)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium border transition ${
                      Math.abs(inputs.fatorReducao - item.val) < 0.001
                        ? 'border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantidade e Unidade de Preco (Price Unit) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="quantidade"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Quantidade
                </label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  id="quantidade"
                  value={inputs.quantidade}
                  onChange={e => atualizarCampo('quantidade', parseFloat(e.target.value) || 0)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Volume total do item
                </span>
              </div>

              <div>
                <label
                  htmlFor="unidade-preco"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Unidade de Preco (Price Unit)
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    id="unidade-preco"
                    value={inputs.unidadePreco}
                    onChange={e => atualizarCampo('unidadePreco', parseFloat(e.target.value) || 1)}
                    className="block w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm font-medium transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                    UN
                  </span>
                </div>
                {/* Atalhos para Unidade de Preco */}
                <div className="mt-1.5 flex gap-1">
                  {[1, 100, 1000].map(un => (
                    <button
                      key={un}
                      type="button"
                      onClick={() => atualizarCampo('unidadePreco', un)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                        inputs.unidadePreco === un
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {un === 1 ? '1 un' : un === 100 ? '100 un' : '1.000 un'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ============================================================ */}
        {/* COLUNA DIREITA: Demonstrativo Fiscal e Memoria de Calculo   */}
        {/* ============================================================ */}
        <div className="space-y-6 lg:col-span-7">
          {/* Cartoes Visuais de Destaque KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* 1. Preco Bruto NF */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Preco Bruto (NF)
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Receipt className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold font-mono text-slate-900 dark:text-slate-100 sm:text-2xl">
                {formatarMoeda(resultado.precoBruto)}
              </p>
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                {inputs.aliqIpi > 0 ? (
                  <span className="text-purple-600 dark:text-purple-400 font-medium">
                    Inclui {inputs.aliqIpi}% IPI ({formatarMoeda(resultado.ipiApurado)})
                  </span>
                ) : (
                  <span>Sem acrescimo de IPI</span>
                )}
              </div>
            </div>

            {/* 2. Preco Liquido Total */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Preco Liquido Total
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shadow-emerald-500/25">
                  <Coins className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300 sm:text-2xl">
                {formatarMoeda(resultado.precoLiquido)}
              </p>
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <TrendingDown className="h-3 w-3" />
                Deducao: {formatarPercentual(resultado.cargaTotalPorDentro * 100)} por dentro
              </div>
            </div>

            {/* 3. Preco Liquido Unitario */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/25 transition hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                  Preco Liquido Unitario
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-500/25">
                  <Calculator className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold font-mono text-blue-700 dark:text-blue-300 sm:text-2xl">
                {formatarMoeda4Casas(resultado.precoLiquidoUnitario)}
              </p>
              <div className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                Por {inputs.unidadePreco} UN (Qtd: {inputs.quantidade})
              </div>
            </div>
          </div>

          {/* Barra de Decomposicao Visual do Preco Bruto */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                Composicao Proporcional do Valor da NF
              </h3>
              <span className="text-xs text-slate-500 font-mono">
                Carga Tributaria Efetiva: <strong>{formatarPercentual(resultado.cargaTributariaPercentualSobreBruto)}</strong>
              </span>
            </div>

            {/* Barra empilhada */}
            <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-slate-100 shadow-inner dark:bg-slate-800">
              {percentualLiquido > 0 && (
                <div
                  style={{ width: `${Math.max(1, percentualLiquido)}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Preco Liquido Real: ${formatarMoeda(resultado.precoLiquido)} (${percentualLiquido.toFixed(1)}%)`}
                />
              )}
              {percentualIcms > 0 && (
                <div
                  style={{ width: `${Math.max(1, percentualIcms)}%` }}
                  className="bg-sky-500 transition-all duration-300"
                  title={`ICMS: ${formatarMoeda(resultado.icmsApurado)} (${percentualIcms.toFixed(1)}%)`}
                />
              )}
              {percentualPis > 0 && (
                <div
                  style={{ width: `${Math.max(1, percentualPis)}%` }}
                  className="bg-amber-400 transition-all duration-300"
                  title={`PIS: ${formatarMoeda(resultado.pisApurado)} (${percentualPis.toFixed(1)}%)`}
                />
              )}
              {percentualCofins > 0 && (
                <div
                  style={{ width: `${Math.max(1, percentualCofins)}%` }}
                  className="bg-amber-600 transition-all duration-300"
                  title={`COFINS: ${formatarMoeda(resultado.cofinsApurado)} (${percentualCofins.toFixed(1)}%)`}
                />
              )}
              {percentualIpi > 0 && (
                <div
                  style={{ width: `${Math.max(1, percentualIpi)}%` }}
                  className="bg-purple-600 transition-all duration-300"
                  title={`IPI: ${formatarMoeda(resultado.ipiApurado)} (${percentualIpi.toFixed(1)}%)`}
                />
              )}
            </div>

            {/* Legendas da barra */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Liquido: {formatarMoeda(resultado.precoLiquido)} ({percentualLiquido.toFixed(1)}%)
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                ICMS: {formatarMoeda(resultado.icmsApurado)} ({percentualIcms.toFixed(1)}%)
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                PIS: {formatarMoeda(resultado.pisApurado)} ({percentualPis.toFixed(1)}%)
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
                COFINS: {formatarMoeda(resultado.cofinsApurado)} ({percentualCofins.toFixed(1)}%)
              </span>
              {resultado.ipiApurado > 0 && (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-purple-600" />
                  IPI: {formatarMoeda(resultado.ipiApurado)} ({percentualIpi.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>

          {/* Tabela Discriminada de Impostos */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Demonstrativo Discriminado de Tributos
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Total Tributos: {formatarMoeda(resultado.totalImpostos)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 dark:bg-slate-800/60 dark:border-slate-700 dark:text-slate-300">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Tributo</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold">Incidencia</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Base de Calculo</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Aliq. Nominal</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Aliq. Efetiva</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Valor Apurado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {resultado.linhasImpostos.map(linha => (
                    <tr key={linha.codigo} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {linha.codigo}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {linha.observacao}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-sans">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            linha.tipoIncidencia === 'por_fora'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                          }`}
                        >
                          {linha.tipoIncidencia === 'por_fora' ? 'Por Fora' : 'Por Dentro'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-slate-800 dark:text-slate-200">
                        {formatarMoeda(linha.baseCalculo)}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatarPercentual(linha.aliquotaNominal)}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                        {formatarPercentual(linha.aliquotaEfetiva)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatarMoeda(linha.valorApurado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-700 font-semibold text-xs">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-slate-700 dark:text-slate-300 font-sans">
                      Total de Tributos Recuperaveis / Destacados na Operacao:
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-amber-700 dark:text-amber-400 text-sm">
                      {formatarMoeda(resultado.totalImpostos)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Memoria de Calculo Passo a Passo (Expansivel) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMostrarMemoriaDetalhada(prev => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Memoria de Calculo &bull; Fórmulas Passo a Passo
                </h3>
              </div>
              <span className="text-slate-400 hover:text-slate-600">
                {mostrarMemoriaDetalhada ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>

            {mostrarMemoriaDetalhada && (
              <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] font-sans font-semibold">
                    1. Preco Bruto (Valor da NF):
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    Preco_Bruto = {formatarMoeda(inputs.precoComImpostos)} &times; (1 + {inputs.aliqIpi / 100}) = <span className="font-bold text-slate-950 dark:text-white">{formatarMoeda(resultado.precoBruto)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] font-sans font-semibold">
                    2. IPI Apurado:
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    IPI_Apurado = ({formatarMoeda(resultado.precoBruto)} / (1 + {inputs.aliqIpi / 100})) &times; {inputs.aliqIpi / 100} = <span className="font-bold text-purple-700 dark:text-purple-400">{formatarMoeda(resultado.ipiApurado)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] font-sans font-semibold">
                    3 e 4. Base e Valor do ICMS:
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    Base_ICMS = {formatarMoeda(resultado.precoBruto)} {resultado.temReducaoBaseIcms ? `&times; ${inputs.fatorReducao}` : ''} = <span className="font-semibold">{formatarMoeda(resultado.baseIcms)}</span>
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    ICMS_Apurado = {formatarMoeda(resultado.baseIcms)} &times; {inputs.aliqIcms / 100} = <span className="font-bold text-sky-700 dark:text-sky-400">{formatarMoeda(resultado.icmsApurado)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <div className="text-slate-500 dark:text-slate-400 text-[11px] font-sans font-semibold">
                    5 e 6. PIS e COFINS Apurados:
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    PIS_Apurado = {formatarMoeda(inputs.precoComImpostos)} &times; {inputs.aliqPis / 100} = <span className="font-bold text-amber-700 dark:text-amber-400">{formatarMoeda(resultado.pisApurado)}</span>
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    COFINS_Apurado = {formatarMoeda(inputs.precoComImpostos)} &times; {inputs.aliqCofins / 100} = <span className="font-bold text-amber-800 dark:text-amber-400">{formatarMoeda(resultado.cofinsApurado)}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                  <div className="text-emerald-800 dark:text-emerald-300 text-[11px] font-sans font-semibold">
                    7. Preco Liquido (Deducao dos Tributos):
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    Fator_Efetivo_ICMS = {inputs.fatorReducao} &times; {inputs.aliqIcms / 100} &times; (1 + {inputs.aliqIpi / 100}) = {resultado.fatorEfetivoIcms.toFixed(6)}
                  </div>
                  <div className="mt-0.5 text-slate-800 dark:text-slate-200">
                    Carga_Total_Por_Dentro = {resultado.fatorEfetivoIcms.toFixed(6)} + {inputs.aliqPis / 100} + {inputs.aliqCofins / 100} = <span className="font-bold text-emerald-700 dark:text-emerald-400">{(resultado.cargaTotalPorDentro * 100).toFixed(4)}%</span>
                  </div>
                  <div className="mt-1 font-bold text-emerald-800 dark:text-emerald-300">
                    Preco_Liquido = ({formatarMoeda(resultado.precoBruto)} / (1 + {inputs.aliqIpi / 100})) &times; (1 - {resultado.cargaTotalPorDentro.toFixed(4)}) = {formatarMoeda(resultado.precoLiquido)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60">
                  <div className="text-blue-800 dark:text-blue-300 text-[11px] font-sans font-semibold">
                    8. Preco Liquido Unitario:
                  </div>
                  <div className="mt-1 text-slate-800 dark:text-slate-200">
                    Preco_Liquido_Unitario = ({formatarMoeda(resultado.precoLiquido)} / {inputs.quantidade}) &times; {inputs.unidadePreco} = <span className="font-bold text-blue-800 dark:text-blue-300">{formatarMoeda4Casas(resultado.precoLiquidoUnitario)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Nota Tecnica e Fundamentacao Legal */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Fundamentacao Fiscal &bull; Uso, Consumo e Imobilizado
            </div>
            <p>
              Conforme o <strong>art. 13, &sect; 1&ordm;, inciso II da Lei Complementar n&ordm; 87/1996 (Lei Kandir)</strong>,
              quando a mercadoria e destinada a uso/consumo ou ativo permanente do comprador, o valor do IPI integra a
              base de calculo do ICMS. O motor fiscal calcula a carga efetiva correspondente para deduzir os creditos
              tributarios ou apurar o preco liquido real de aquisicao, permitindo o alinhamento exato com o SAP MM/FI.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

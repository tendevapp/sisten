/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mapa comparativo: a matriz item × fornecedor do processo de cotação.
 *
 * O que a tela tenta resolver, e que uma matriz de preços crua não resolve:
 *
 * - **os itens precisam estar na mesma linha.** Cada fornecedor descreve o
 *   material do seu jeito; sem o agrupamento de `mapaCotacao.ts` a matriz
 *   vira uma diagonal que não compara nada. Quando o agrupamento veio de
 *   similaridade (e não de vínculo com RM), a linha diz isso — e o comprador
 *   pode separar ou juntar linhas na hora.
 * - **preço não é custo.** IPI destacado, créditos de ICMS/PIS/COFINS e
 *   frete mudam quem é o mais barato. A barra de opções troca a base da
 *   matriz inteira para o comprador ver o vencedor mudar.
 * - **o total não é a soma dos menores preços.** Cada fornecedor a mais é
 *   mais um frete e mais um pedido; os cenários no topo mostram isso.
 * - **preço não é a única variável.** Prazo, validade, condição de pagamento
 *   e faturamento mínimo ficam no cabeçalho de cada fornecedor, não
 *   escondidos num card lá embaixo.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, AlertTriangle, Truck, CalendarClock, CreditCard, Sparkles,
  Scissors, Merge, Award, PackageX, RotateCcw, Link2, Ban, X, ShoppingCart, Plus, Check, SearchX, FileSearch,
  LayoutGrid, Table2, Rows3, BarChart3, EyeOff, Eye,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import MapaOpcoesBar from './MapaOpcoesBar';
import MapaCenarios from './MapaCenarios';
import MapaTabelaPreco from './MapaTabelaPreco';
import MapaTabelaFornecedor from './MapaTabelaFornecedor';
import MapaVisaoItem from './MapaVisaoItem';
import ExportarSapModal from './ExportarSapModal';
import VerCotacaoOriginalModal from './VerCotacaoOriginalModal';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { construirLinhasSap } from '../../lib/exportSapCotacao';
import { montarPlanilhaMapa } from '../../lib/exportMapaCotacao';
import type { LinhaSapExport } from '../../lib/exportSapCotacao';
import { useToast } from '../ui/Toast';
import { formatBRL, formatQtd } from '../../lib/format';
import { formatarCnpj, nomeFornecedorCurto, normalizarDescricao } from '../../lib/cotacoes';
import { salvarFreteProposta, salvarSelecaoMapa } from '../../lib/cotacoesApi';
import {
  agruparLinhasMapa, resumirFornecedores, cenarioMenorPreco, cenarioFornecedorUnico,
  cenarioSelecao, opcoesDaBase, ordenarLinhas, LIMIAR_SIMILARIDADE_PADRAO,
} from '../../lib/mapaCotacao';
import type {
  BaseComparacao, CreditosHabilitados, LinhaMapa, CelulaMapa, PropostaMapa, ResumoFornecedor, Cenario, OrdenacaoMapa,
} from '../../lib/mapaCotacao';
import type { CotacaoProcesso, CotacaoProcessoItem, CotacaoPropostaDraft } from '../../types';

/** Agrupamentos manuais sobrevivem ao recarregar a página, mas são preferência de análise, não dado do processo — ficam no navegador, como o rascunho de propostas. */
const chaveOverrides = (processoId: string) => `sisten_cotacao_mapa_overrides_${processoId}`;

/**
 * 'detalhada': matriz de cards, interativa (marcar compra, juntar/separar
 * linhas) — a única que grava decisão.
 * 'preco': planilha clássica, um valor por fornecedor + melhor/vencedor/total.
 * 'fornecedor': descrição cotada ao lado do preço, agrupado por fornecedor.
 * 'item': barra horizontal por fornecedor dentro de cada item.
 * As três últimas são somente leitura.
 */
type VisualizacaoMapa = 'detalhada' | 'preco' | 'fornecedor' | 'item';

const OPCOES_VISUALIZACAO: { id: VisualizacaoMapa; rotulo: string; titulo: string; Icone: React.ComponentType<{ className?: string }> }[] = [
  { id: 'detalhada', rotulo: 'Detalhada', titulo: 'Cards com checkbox — a única que marca o que comprar', Icone: LayoutGrid },
  { id: 'preco', rotulo: 'Mapa de preço', titulo: 'Planilha clássica: um valor por fornecedor + melhor preço e vencedor', Icone: Table2 },
  { id: 'fornecedor', rotulo: 'Por fornecedor', titulo: 'Descrição cotada ao lado do preço, agrupado por fornecedor', Icone: Rows3 },
  { id: 'item', rotulo: 'Visão por item', titulo: 'Barra comparando os preços de cada item — acha o fornecedor fora da curva', Icone: BarChart3 },
];

const CREDITOS_PADRAO: CreditosHabilitados = { icms: false, pisCofins: false, ipi: false };

/** A decisão já gravada em `mapa_selecionado`, das propostas salvas. */
function selecaoDoBanco(propostas: CotacaoPropostaDraft[]): Set<string> {
  const s = new Set<string>();
  for (const p of propostas) {
    if (!p._salvo) continue;
    for (const it of p.itens) if (it.mapa_selecionado) s.add(it._key);
  }
  return s;
}

// =====================================================================
// Peças pequenas
// =====================================================================

/**
 * Digita livre (aceita vírgula) e resolve no blur — mesmo padrão dos campos
 * monetários de PropostaCard.
 *
 * `teorico` marca que o número em tela é a simulação por peso (tabela Bahia
 * Sul), não um frete que o fornecedor cotou — estilo tracejado + selo
 * "estim." para o comprador nunca confundir estimativa com cotação real.
 * Some sozinho assim que ele digitar algo: `onSalvar` grava em `valor_frete`
 * e a próxima leitura já traz o valor como informado.
 */
function CampoFrete({ valor, teorico, onSalvar }: { valor: number | null; teorico?: boolean; onSalvar: (v: number | null) => void }) {
  const [texto, setTexto] = useState(valor != null ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  useEffect(() => {
    setTexto(valor != null ? valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  }, [valor]);

  return (
    <div
      className={`flex items-center gap-1 rounded border px-1.5 focus-within:border-indigo-500 ${
        teorico
          ? 'border-dashed border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20'
          : 'border-slate-200 dark:border-slate-700'
      }`}
      title={teorico ? 'Frete estimado pela tabela Bahia Sul a partir do peso dos itens. Digite o frete que o fornecedor cotou para substituir a estimativa.' : undefined}
    >
      <Truck className={`h-3 w-3 shrink-0 ${teorico ? 'text-indigo-400' : 'text-slate-400'}`} />
      <span className={`text-[10px] ${teorico ? 'text-indigo-400' : 'text-slate-400'}`}>R$</span>
      <input
        inputMode="decimal"
        value={texto}
        placeholder="frete"
        onChange={e => setTexto(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={() => {
          const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
          const n = limpo === '' ? null : Number(limpo);
          onSalvar(n != null && Number.isFinite(n) ? n : null);
        }}
        className={`w-full min-w-0 bg-transparent py-0.5 text-[11px] tabular-nums outline-none ${teorico ? 'italic text-indigo-700 dark:text-indigo-300' : ''}`}
      />
      {teorico && (
        <span className="shrink-0 rounded bg-indigo-100 px-1 text-[8px] font-bold uppercase tracking-wide text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300">
          estim.
        </span>
      )}
    </div>
  );
}

const FRETE_MODALIDADE_LABEL: Record<string, string> = { CIF: 'CIF · frete incluso', FOB: 'FOB · frete à parte', OUTRO: 'frete a combinar' };

function Chip({ tom, children, title }: { tom: 'neutro' | 'ok' | 'aviso' | 'ruim'; children: React.ReactNode; title?: string }) {
  const classes = {
    neutro: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    aviso: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    ruim: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  }[tom];
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${classes}`}>
      {children}
    </span>
  );
}

/**
 * Alíquota e valor de cada imposto destacado, na ordem em que pesam no bolso.
 * O valor é por unidade (mesma régua do preço grande da célula); o total do
 * item fica no title.
 */
function ChipsImpostos({ celula }: { celula: CelulaMapa }) {
  const { item, custo } = celula;
  const qtd = custo.quantidade != null && custo.quantidade > 0 ? custo.quantidade : null;
  const porUn = (total: number) => (qtd ? total / qtd : total);
  const partes: { rotulo: string; total: number }[] = [];
  if (item.aliquota_ipi_pct != null) partes.push({ rotulo: `IPI ${item.aliquota_ipi_pct}%`, total: custo.impostos.ipi });
  if (item.aliquota_icms_pct != null) partes.push({ rotulo: `ICMS ${item.aliquota_icms_pct}%`, total: custo.impostos.icms });
  if (item.aliquota_pis_pct != null || item.aliquota_cofins_pct != null) {
    const soma = (item.aliquota_pis_pct ?? 0) + (item.aliquota_cofins_pct ?? 0);
    partes.push({ rotulo: `PIS/COF ${Number(soma.toFixed(2))}%`, total: custo.impostos.pisCofins });
  }
  if (partes.length === 0) {
    return <span className="text-[10px] text-slate-400">sem impostos destacados</span>;
  }
  const detalhe = [
    ...partes.map(p => `${p.rotulo}: ${formatBRL(p.total)} no item`),
    custo.ipi > 0 ? `IPI somado à comparação: ${formatBRL(custo.ipi)}` : null,
    custo.creditos > 0 ? `Créditos abatidos: ${formatBRL(custo.creditos)}` : null,
  ].filter(Boolean).join('\n');
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400" title={detalhe}>
      {partes.map(p => (
        <span key={p.rotulo} className="tabular-nums">
          {p.rotulo} <span className="font-semibold text-slate-600 dark:text-slate-300">{formatBRL(porUn(p.total))}</span>
          {qtd ? <span className="text-slate-400">/{item.unidade_medida || 'un'}</span> : null}
        </span>
      ))}
    </div>
  );
}

// =====================================================================
// Confirmação de item fora da melhor oferta
// =====================================================================

interface ItemForaDoMelhor {
  itemKey: string;
  titulo: string;
  fornecedor: string;
  unitario: number | null;
  melhorUnitario: number | null;
  deltaPct: number | null;
  unidade: string;
}

/**
 * Aparece ao salvar a decisão quando algum item marcado não é a melhor oferta
 * da linha. A observação é opcional e vai para `mapa_observacao` de cada item
 * listado — fica registrado por que o mais barato não foi o escolhido.
 */
function ConfirmarForaDoMelhorModal({
  itens, salvando, onCancelar, onConfirmar,
}: {
  itens: ItemForaDoMelhor[];
  salvando: boolean;
  onCancelar: () => void;
  onConfirmar: (observacao: string) => void;
}) {
  const [observacao, setObservacao] = useState('');
  const plural = itens.length > 1;

  return (
    <Modal onClose={onCancelar} maxWidth="max-w-lg" zIndexClassName="z-[110]" ariaLabel="Confirmar item fora da melhor oferta">
      <ModalHeader onClose={onCancelar}>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {plural ? `${itens.length} itens não são a melhor oferta` : 'Item não é a melhor oferta'}
          </h3>
        </div>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {plural ? 'Estes itens foram marcados' : 'Este item foi marcado'} em um fornecedor que não tem o menor preço da linha. Confirme a escolha.
        </p>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {itens.map(i => (
            <li key={i.itemKey} className="px-3 py-2">
              <div className="line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-100" title={i.titulo}>{i.titulo}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">{i.fornecedor}</span>
                <span>{formatBRL(i.unitario)}/{i.unidade}</span>
                {i.melhorUnitario != null && <span>melhor: {formatBRL(i.melhorUnitario)}/{i.unidade}</span>}
                {i.deltaPct != null && <span className="font-semibold text-rose-500">+{i.deltaPct.toFixed(1)}%</span>}
              </div>
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Observação <span className="font-normal text-slate-400">(opcional)</span></span>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex.: prazo de entrega menor, marca homologada, fornecedor já tem o restante do pedido…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </label>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={onCancelar}
          disabled={salvando}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Voltar ao mapa
        </button>
        <button
          type="button"
          onClick={() => onConfirmar(observacao)}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {salvando ? 'Salvando…' : 'Confirmar e salvar'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =====================================================================
// Cabeçalho de fornecedor
// =====================================================================

function CabecalhoFornecedor({
  resumo, proposta, posicao, melhorTotal, onFrete, arquivoOriginal, onEditarMarkdown, onAtualizarProposta,
}: {
  resumo: ResumoFornecedor;
  proposta: CotacaoPropostaDraft;
  posicao: number;
  melhorTotal: number | null;
  onFrete: (v: number | null) => void;
  /** Arquivo original (PDF/imagem) desta proposta, se ainda estiver na memória da sessão. */
  arquivoOriginal?: File;
  onEditarMarkdown?: (novoMarkdown: string) => Promise<void>;
  /** Reflete no estado do processo o arquivo original vinculado pelo modal de visualização. */
  onAtualizarProposta: (key: string, patch: Partial<CotacaoPropostaDraft>) => void;
}) {
  const delta = melhorTotal != null && melhorTotal > 0 ? ((resumo.totalCotacao - melhorTotal) / melhorTotal) * 100 : null;
  const vencedor = posicao === 0 && resumo.itensCotados > 0;
  const [previewAberto, setPreviewAberto] = useState(false);

  // Posição relativa ao melhor total, para a barra de comparação — 0 no
  // vencedor, cresce com a distância. Sem melhorTotal (nenhum fornecedor
  // cobre o processo inteiro ainda) a barra não aparece: não há régua confiável.
  const proporcaoAcimaDoMelhor = melhorTotal != null && melhorTotal > 0 && delta != null
    ? Math.min(1, Math.max(0, delta / 40)) // 40% acima já enche a barra — diferenças maiores viram "muito acima" igual
    : null;

  return (
    <div className="w-full min-w-0 space-y-1.5 p-2.5 text-left align-top">
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
            vencedor
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          }`}
          title={vencedor ? 'Melhor colocado (mais linhas cobertas, menor custo entre eles)' : `${posicao + 1}º colocado`}
        >
          {vencedor ? <Award className="h-3 w-3" /> : posicao + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100" title={resumo.nome}>
            {nomeFornecedorCurto(resumo.nome)}
          </div>
          <div className="truncate text-[10px] text-slate-400">
            {resumo.cnpj ? formatarCnpj(resumo.cnpj) : 'CNPJ não identificado'}
            {proposta.fornecedor_uf ? ` · ${proposta.fornecedor_uf}` : ''}
          </div>
        </div>
        {proposta.arquivo_origem && (
          <button
            type="button"
            onClick={() => setPreviewAberto(true)}
            title="Ver a cotação original — documento e/ou o Markdown extraído dele"
            className="shrink-0 rounded-md border border-slate-200 p-1 text-slate-400 transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
          >
            <FileSearch className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {previewAberto && proposta.arquivo_origem && (
        <VerCotacaoOriginalModal
          nome={proposta.arquivo_origem}
          file={arquivoOriginal}
          storagePath={proposta.arquivo_storage_path}
          markdown={proposta.arquivo_markdown}
          markdownEditadoEm={proposta.arquivo_markdown_editado_em}
          markdownEditadoPor={proposta.arquivo_markdown_editado_por}
          propostaId={proposta._salvo ? proposta._key : null}
          onEditarMarkdown={onEditarMarkdown}
          onArquivoVinculado={(path, mimeType, tamanhoBytes) => {
            onAtualizarProposta(proposta._key, {
              arquivo_storage_path: path,
              arquivo_mime_type: mimeType,
              arquivo_tamanho_bytes: tamanhoBytes,
            });
          }}
          onClose={() => setPreviewAberto(false)}
        />
      )}

      <div className="flex flex-wrap gap-1">
        {proposta.frete_modalidade && (
          <Chip tom={proposta.frete_modalidade === 'CIF' ? 'ok' : 'neutro'} title="Modalidade de frete informada na cotação">
            <Truck className="h-3 w-3" />
            {FRETE_MODALIDADE_LABEL[proposta.frete_modalidade] ?? proposta.frete_modalidade}
          </Chip>
        )}
        <Chip tom="neutro" title={proposta.prazo_entrega_texto ?? undefined}>
          <CalendarClock className="h-3 w-3" />
          {resumo.prazoEntregaDias != null ? `${resumo.prazoEntregaDias} dias` : 'prazo n/i'}
        </Chip>
        {resumo.validadeDias != null && (
          <Chip
            tom={resumo.validadeDias < 0 ? 'ruim' : resumo.validadeDias <= 3 ? 'aviso' : 'ok'}
            title={`Validade da proposta: ${proposta.validade_data}`}
          >
            {resumo.validadeDias < 0 ? 'proposta vencida' : `vence em ${resumo.validadeDias}d`}
          </Chip>
        )}
        {resumo.condicaoPagamento && (
          <Chip tom="neutro" title={resumo.condicaoPagamento}>
            <CreditCard className="h-3 w-3" />
            <span className="max-w-[90px] truncate">{resumo.condicaoPagamento}</span>
          </Chip>
        )}
        {resumo.atingeFaturamentoMinimo === false && (
          <Chip tom="aviso" title={`Faturamento mínimo de ${formatBRL(resumo.faturamentoMinimo)}`}>
            abaixo do mínimo
          </Chip>
        )}
        {resumo.valorDesconto != null && resumo.valorDesconto > 0 && (
          <Chip tom="ok" title="Desconto identificado na cotação — já abatido do total abaixo.">
            -{formatBRL(resumo.valorDesconto)} desconto
          </Chip>
        )}
      </div>

      <CampoFrete valor={resumo.frete} teorico={resumo.freteEhTeorico} onSalvar={onFrete} />

      <div className="border-t border-slate-100 pt-1.5 dark:border-slate-800">
        <div
          className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-50"
          title="Valor total da cotação, sem frete — o frete fica no campo acima e entra só nos cenários de compra."
        >
          {formatBRL(resumo.totalCotacao)}
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          <span>{resumo.itensCotados}/{resumo.totalLinhas} itens</span>
          {resumo.melhorEm > 0 && <span className="font-semibold text-emerald-600 dark:text-emerald-400">melhor em {resumo.melhorEm}</span>}
          {delta != null && delta > 0.01 && <span className="text-rose-500">+{delta.toFixed(1)}%</span>}
        </div>
        {(resumo.totalImpostos.ipi > 0 || resumo.totalImpostos.icms > 0 || resumo.totalImpostos.pisCofins > 0) && (
          <div className="flex flex-wrap gap-x-2 text-[10px] tabular-nums text-slate-400" title="Soma dos impostos destacados nos itens cotados. Só entram no total acima nas bases desembolso/custo líquido.">
            {resumo.totalImpostos.ipi > 0 && <span>IPI {formatBRL(resumo.totalImpostos.ipi)}</span>}
            {resumo.totalImpostos.icms > 0 && <span>ICMS {formatBRL(resumo.totalImpostos.icms)}</span>}
            {resumo.totalImpostos.pisCofins > 0 && <span>PIS/COF {formatBRL(resumo.totalImpostos.pisCofins)}</span>}
          </div>
        )}
        {/* Régua visual da distância até o melhor total — só quando há uma
            referência confiável (algum fornecedor cobre o processo inteiro). */}
        {proporcaoAcimaDoMelhor != null && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full ${vencedor ? 'bg-emerald-500' : proporcaoAcimaDoMelhor > 0.5 ? 'bg-rose-400' : 'bg-amber-400'}`}
              style={{ width: `${Math.max(4, (1 - proporcaoAcimaDoMelhor) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Célula
// =====================================================================

function Celula({
  celula, marcado, onMarcar, selecionadoAgrupamento, onToggleAgrupamento,
}: {
  celula: CelulaMapa;
  marcado: boolean;
  onMarcar: (v: boolean) => void;
  /** Selecionado para a ação flutuante de juntar/separar linhas — independente da decisão de compra. */
  selecionadoAgrupamento: boolean;
  onToggleAgrupamento: (v: boolean) => void;
}) {
  const { item, custo } = celula;
  const delta = celula.deltaPct;

  return (
    <div
      onClick={() => onMarcar(!marcado)}
      className={`flex h-full cursor-pointer flex-col gap-1 rounded-xl border p-2 transition-colors ${
        marcado
          ? 'border-indigo-400 bg-indigo-50/70 shadow-sm shadow-indigo-500/10 dark:border-indigo-600 dark:bg-indigo-950/30'
          : celula.melhor
            ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
      } ${selecionadoAgrupamento ? 'ring-2 ring-violet-400 dark:ring-violet-500' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <input
          type="checkbox"
          checked={selecionadoAgrupamento}
          onClick={e => e.stopPropagation()}
          onChange={e => onToggleAgrupamento(e.target.checked)}
          title="Selecionar para juntar ou separar linhas"
          className="mt-1 h-3 w-3 shrink-0 rounded-sm border-violet-300 text-violet-600 focus:ring-violet-500 dark:border-violet-700 dark:bg-slate-800"
        />
        <div className="flex flex-1 items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {formatBRL(custo.unitarioComparavel ?? custo.precoUnitario)}
              <span className="ml-0.5 text-[10px] font-normal text-slate-400">/{item.unidade_medida || 'un'}</span>
            </div>
            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {formatQtd(custo.quantidade)} × = <span className="font-semibold text-slate-700 dark:text-slate-200">{formatBRL(custo.comparavel)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onMarcar(!marcado); }}
            title={marcado ? 'Remover da compra' : 'Comprar este item deste fornecedor'}
            className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
              marcado
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500'
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            <span
              className={`absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full text-white ${
                marcado ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              {marcado ? <Check className="h-2 w-2" strokeWidth={3} /> : <Plus className="h-2 w-2" strokeWidth={3} />}
            </span>
          </button>
        </div>
      </div>

      {/* Descrição do fornecedor, sempre visível — é o que deixa o comprador
          conferir com os próprios olhos se a linha juntou o mesmo material
          antes de confiar no % de similaridade. */}
      <p
        className="line-clamp-2 pl-[18px] text-[10px] leading-snug text-slate-400 dark:text-slate-500"
        title={item.descricao_produto || undefined}
      >
        {item.descricao_produto || 'sem descrição'}
      </p>

      <div className="flex flex-wrap items-center gap-1 pl-[18px]">
        {celula.melhor ? (
          <Chip tom="ok">menor custo</Chip>
        ) : delta != null ? (
          <Chip tom={delta > 10 ? 'ruim' : 'aviso'} title="Acima da melhor oferta desta linha">+{delta.toFixed(1)}%</Chip>
        ) : (
          <Chip tom="aviso">sem preço</Chip>
        )}
        {item.marca_fabricante && (
          <span className="max-w-[110px] truncate text-[10px] font-medium text-slate-600 dark:text-slate-300" title={item.marca_fabricante}>
            {item.marca_fabricante}
          </span>
        )}
      </div>

      <div className="pl-[18px]">
        <ChipsImpostos celula={celula} />
      </div>

      {celula.score < 1 && (
        <span
          className="inline-flex items-center gap-1 pl-[18px] text-[10px] text-violet-600 dark:text-violet-400"
          title={`Agrupado por semelhança de descrição (${Math.round(celula.score * 100)}%)`}
        >
          <Sparkles className="h-3 w-3" />
          {Math.round(celula.score * 100)}% semelhante
        </span>
      )}
    </div>
  );
}

// =====================================================================
// Larguras de coluna ajustáveis
// =====================================================================

const chaveLarguras = (processoId: string) => `sisten_cotacao_mapa_larguras_${processoId}`;
/** Chave da 1ª coluna (item cotado) no mapa de larguras. */
const COL_ITEM = '__item__';
// Defaults pensados para monitor largo (1920px): dão espaço para a
// descrição do item e para o cabeçalho do fornecedor (selo de posição,
// chips, campo de frete) sem truncar de cara. Ainda redimensionável por
// coluna — isto é só o ponto de partida.
const LARGURA_ITEM_PADRAO = 340;
const LARGURA_FORN_PADRAO = 300;
const LARGURA_MIN = 150;
const LARGURA_MAX = 760;

const clampLargura = (px: number) => Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, Math.round(px)));

/**
 * Alça de redimensionamento na borda direita de um cabeçalho de coluna.
 * Arrastar aumenta/diminui a largura; o valor final é persistido pelo pai.
 */
function AlcaColuna({
  largura, onArrastar, onFim,
}: {
  largura: number;
  onArrastar: (nova: number) => void;
  onFim: (nova: number) => void;
}) {
  const dragRef = React.useRef<{ x0: number; w0: number; atual: number } | null>(null);

  const aoMover = React.useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.atual = clampLargura(d.w0 + (e.clientX - d.x0));
    onArrastar(d.atual);
  }, [onArrastar]);

  const aoSoltar = React.useCallback(() => {
    const d = dragRef.current;
    window.removeEventListener('pointermove', aoMover);
    window.removeEventListener('pointerup', aoSoltar);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (d) onFim(d.atual);
    dragRef.current = null;
  }, [aoMover, onFim]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title="Arraste para ajustar a largura • duplo clique para redefinir"
      onPointerDown={e => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { x0: e.clientX, w0: largura, atual: largura };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', aoMover);
        window.addEventListener('pointerup', aoSoltar);
      }}
      onDoubleClick={e => { e.stopPropagation(); onFim(-1); }}
      className="absolute right-0 top-0 z-30 h-full w-2 translate-x-1/2 cursor-col-resize touch-none select-none
                 before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-slate-200
                 hover:before:w-0.5 hover:before:bg-indigo-400 dark:before:bg-slate-700 dark:hover:before:bg-indigo-500"
    />
  );
}

// =====================================================================
// Tela
// =====================================================================

interface MapaComparativoProps {
  processo: CotacaoProcesso;
  escopo: CotacaoProcessoItem[];
  propostas: CotacaoPropostaDraft[];
  usuarioNome: string;
  onVoltar: () => void;
  /** Reflete no estado do processo a mudança feita aqui (hoje, só o frete). */
  onAtualizarProposta: (key: string, patch: Partial<CotacaoPropostaDraft>) => void;
  /** Chamado depois que "Salvar decisão" grava com sucesso — leva o comprador à revisão do pedido, por fornecedor. */
  onDecisaoSalva: (itensSelecionados: Set<string>, observacoes?: Map<string, string>) => void;
  /** Permite sincronizar do Supabase caso haja propostas com chaves temporárias ainda não persistidas. */
  onRecarregarPropostas?: () => Promise<void>;
  /** Arquivo original (PDF/imagem) de cada proposta, por nome — só existe enquanto durar a sessão em que foi enviado. Ver VerCotacaoOriginalModal. */
  arquivosOriginais?: Map<string, File>;
  /** Corrige o Markdown extraído de uma proposta salva — ver VerCotacaoOriginalModal. */
  onEditarMarkdown?: (propostaId: string, novoMarkdown: string) => Promise<void>;
  /** Número do grupo de compras SAP do usuário logado (`Profile.grupo_compras`) — só pré-preenche o campo "Comprador" no export SAP; o comprador confere no modal. */
  compradorPadrao?: string | null;
  /** Rótulo personalizado do botão de voltar (padrão: "Propostas"). */
  rotuloVoltar?: string;
}

export default function MapaComparativo({
  processo, escopo, propostas, usuarioNome, onVoltar, onAtualizarProposta, onDecisaoSalva, onRecarregarPropostas,
  arquivosOriginais, onEditarMarkdown, compradorPadrao, rotuloVoltar = 'Propostas',
}: MapaComparativoProps) {
  const toast = useToast();

  // Preço unitário como está na cotação — é o que o comprador confere contra o
  // PDF. Impostos aparecem em valor na célula; a base 'desembolso'/'liquido'
  // continua a um clique para quem quiser somá-los.
  const [base, setBase] = useState<BaseComparacao>('cotado');
  const [creditos, setCreditos] = useState<CreditosHabilitados>(CREDITOS_PADRAO);
  const [limiar, setLimiar] = useState(LIMIAR_SIMILARIDADE_PADRAO);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoMapa>('alfabetica');
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Como a matriz é exibida — 'detalhada' é a única interativa (marcar
  // compra, juntar/separar linhas); as outras são leitura rápida, cada uma
  // para uma pergunta diferente: preço só (planilha clássica), descrição +
  // preço lado a lado (conferir agrupamento), ou distância visual entre
  // ofertas (achar o fornecedor fora da curva sem fazer conta).
  const [visualizacao, setVisualizacao] = useState<VisualizacaoMapa>('detalhada');
  // Itens da RM que nenhum fornecedor cotou — continuam "precisando de nova
  // cotação", mas atrapalham a leitura do que já tem oferta. Ocultar é só
  // preferência de tela, não some do processo nem precisa reconfirmar toda
  // vez — por isso não persiste: é o mesmo tipo de filtro que a busca.
  const [ocultarSemCotacao, setOcultarSemCotacao] = useState(false);

  // Só proposta salva entra no mapa: a decisão é gravada no item cotado, que
  // só existe no banco depois de "Salvar proposta".
  const salvas = useMemo(() => propostas.filter(p => p._salvo), [propostas]);
  const naoSalvas = propostas.length - salvas.length;

  const propostasMapa: PropostaMapa[] = useMemo(
    () => salvas.map(p => ({ key: p._key, proposta: p })),
    [salvas],
  );

  const propostasPorKey = useMemo(() => new Map(salvas.map(p => [p._key, p])), [salvas]);

  const fretePorProposta = useMemo(() => {
    const r: Record<string, number | null> = {};
    for (const p of salvas) r[p._key] = p.valor_frete ?? null;
    return r;
  }, [salvas]);

  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try {
      const bruto = localStorage.getItem(chaveOverrides(processo.id));
      return bruto ? JSON.parse(bruto) : {};
    } catch (err) {
      console.error('Falha ao ler agrupamentos manuais do mapa:', err);
      return {};
    }
  });
  useEffect(() => {
    try {
      if (Object.keys(overrides).length > 0) localStorage.setItem(chaveOverrides(processo.id), JSON.stringify(overrides));
      else localStorage.removeItem(chaveOverrides(processo.id));
    } catch (err) {
      console.error('Falha ao gravar agrupamentos manuais do mapa:', err);
    }
  }, [overrides, processo.id]);

  // Larguras de coluna ajustadas pelo comprador — preferência de visualização,
  // fica no navegador por processo. Chave `__item__` = coluna do item cotado.
  const [larguras, setLarguras] = useState<Record<string, number>>(() => {
    try {
      const bruto = localStorage.getItem(chaveLarguras(processo.id));
      return bruto ? JSON.parse(bruto) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try {
      if (Object.keys(larguras).length > 0) localStorage.setItem(chaveLarguras(processo.id), JSON.stringify(larguras));
      else localStorage.removeItem(chaveLarguras(processo.id));
    } catch { /* ignora */ }
  }, [larguras, processo.id]);

  // Enquanto arrasta, mostra a largura sem persistir a cada pixel.
  const [larguraPreview, setLarguraPreview] = useState<{ col: string; px: number } | null>(null);
  const larguraDe = (col: string) => {
    if (larguraPreview?.col === col) return larguraPreview.px;
    if (typeof larguras[col] === 'number') return larguras[col];
    return col === COL_ITEM ? LARGURA_ITEM_PADRAO : LARGURA_FORN_PADRAO;
  };
  const fixarLargura = (col: string, px: number) => {
    setLarguraPreview(null);
    setLarguras(prev => {
      const next = { ...prev };
      if (px < 0) delete next[col]; // duplo clique: volta ao padrão
      else next[col] = clampLargura(px);
      return next;
    });
  };
  const resetLarguras = () => { setLarguraPreview(null); setLarguras({}); };
  const larguraCustomizada = Object.keys(larguras).length > 0;

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasHorizontalScroll, setHasHorizontalScroll] = useState(false);

  // A seleção é lida do banco na montagem. Recalculá-la a cada mudança em `propostas`
  // apagaria a decisão em andamento assim que o comprador digitasse um frete,
  // mas se houver chaves temporárias (não-UUID) ou se o banco acabou de carregar a decisão,
  // atualizamos a seleção com os dados do banco.
  const [selecaoPersistida, setSelecaoPersistida] = useState<Set<string>>(() => selecaoDoBanco(propostas));
  const [selecionados, setSelecionados] = useState<Set<string>>(() => selecaoDoBanco(propostas));

  useEffect(() => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const temChaveInvalida = [...selecionados].some(k => !UUID_REGEX.test(k)) || [...selecaoPersistida].some(k => !UUID_REGEX.test(k));
    const doBanco = selecaoDoBanco(propostas);

    if (temChaveInvalida || (selecaoPersistida.size === 0 && doBanco.size > 0)) {
      setSelecaoPersistida(doBanco);
      setSelecionados(prev => {
        const next = new Set<string>();
        for (const k of prev) if (UUID_REGEX.test(k)) next.add(k);
        for (const k of doBanco) next.add(k);
        return next;
      });
    }
  }, [propostas]);

  const handleTopScroll = () => {
    if (!tableContainerRef.current || !topScrollRef.current) return;
    if (Math.abs(tableContainerRef.current.scrollLeft - topScrollRef.current.scrollLeft) > 1) {
      tableContainerRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (!tableContainerRef.current || !topScrollRef.current) return;
    if (Math.abs(topScrollRef.current.scrollLeft - tableContainerRef.current.scrollLeft) > 1) {
      topScrollRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  };

  // Seleção para a ação flutuante de juntar/separar linhas — independente da
  // seleção de compra acima. Não persiste: é só um passo de trabalho.
  const [selecaoAgrupamento, setSelecaoAgrupamento] = useState<Set<string>>(new Set());

  const opcoes = useMemo(() => opcoesDaBase(base, creditos), [base, creditos]);

  const linhas = useMemo(
    () => agruparLinhasMapa({ escopo, propostas: propostasMapa, opcoes, limiar, overrides, fretePorProposta }),
    [escopo, propostasMapa, opcoes, limiar, overrides, fretePorProposta],
  );

  // Ordem que a matriz exibe — escolha do comprador, alfabética por padrão.
  // Só reordena a exibição; o agrupamento em `linhas` não muda.
  const linhasExibidas = useMemo(() => ordenarLinhas(linhas, ordenacao), [linhas, ordenacao]);

  // Busca por descrição — compara contra o título da linha e a descrição de
  // cada fornecedor (às vezes o texto que bate é só o de um deles), além de
  // RI, código de material e código do produto cotado. Normalizada (sem
  // acento, maiúscula) pelo mesmo `normalizarDescricao` do vínculo por
  // similaridade, para "parafuso" achar "PARAFUSO" e "Ø" não atrapalhar.
  const linhasFiltradas = useMemo(() => {
    const termo = normalizarDescricao(busca.trim());
    if (!termo) return linhasExibidas;
    const bate = (v: string | null | undefined) => !!v && normalizarDescricao(v).includes(termo);
    return linhasExibidas.filter(l =>
      bate(l.titulo) || bate(l.ri) || bate(l.materialCode)
      || l.celulas.some(c => bate(c.item.descricao_produto) || bate(c.item.codigo_produto) || bate(c.item.marca_fabricante)),
    );
  }, [linhasExibidas, busca]);

  // Some com o que ninguém cotou — filtro por cima da busca, mesma ideia.
  const linhasVisiveis = useMemo(
    () => (ocultarSemCotacao ? linhasFiltradas.filter(l => l.celulas.length > 0) : linhasFiltradas),
    [linhasFiltradas, ocultarSemCotacao],
  );

  const resumos = useMemo(
    () => resumirFornecedores({ linhas, propostas: propostasMapa, fretePorProposta })
      .sort((a, b) => {
        if (b.itensCotados !== a.itensCotados) return b.itensCotados - a.itensCotados;
        return a.totalCotacao - b.totalCotacao;
      }),
    [linhas, propostasMapa, fretePorProposta],
  );

  // Recalcula a largura/scroll da tabela quando o conteúdo (linhas filtradas,
  // resumos por fornecedor) ou as larguras de coluna mudam — precisa vir
  // depois de `linhasFiltradas` e `resumos` estarem declarados, senão o
  // array de dependências os referencia antes da inicialização (TDZ).
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const atualizarMedidas = () => {
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      setScrollWidth(sw);
      setHasHorizontalScroll(sw > cw + 2);
      if (topScrollRef.current && Math.abs(topScrollRef.current.scrollLeft - el.scrollLeft) > 1) {
        topScrollRef.current.scrollLeft = el.scrollLeft;
      }
    };

    atualizarMedidas();

    const ro = new ResizeObserver(() => {
      atualizarMedidas();
    });
    ro.observe(el);
    if (el.firstElementChild) {
      ro.observe(el.firstElementChild);
    }
    window.addEventListener('resize', atualizarMedidas);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', atualizarMedidas);
    };
  }, [linhasVisiveis, resumos, larguras, larguraPreview, visualizacao]);

  const cenarios = useMemo(() => {
    const lista: Cenario[] = [cenarioMenorPreco(linhas, resumos)];
    const unico = cenarioFornecedorUnico(linhas, resumos);
    if (unico) lista.push(unico);
    lista.push(cenarioSelecao(linhas, resumos, selecionados));
    return lista;
  }, [linhas, resumos, selecionados]);

  const melhorTotalFornecedor = useMemo(() => {
    const completos = resumos.filter(r => r.itensCotados === linhas.length && r.totalCotacao > 0);
    return completos.length > 0 ? Math.min(...completos.map(r => r.totalCotacao)) : null;
  }, [resumos, linhas.length]);

  const alteracoesPendentes = useMemo(() => {
    if (selecaoPersistida.size !== selecionados.size) return true;
    for (const k of selecionados) if (!selecaoPersistida.has(k)) return true;
    return false;
  }, [selecionados, selecaoPersistida]);

  // -------------------------------------------------------------------
  // Ações
  // -------------------------------------------------------------------

  const alternarSelecao = (celula: CelulaMapa, linha: LinhaMapa, marcar: boolean) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      // Um item só pode vir de um fornecedor: marcar uma célula desmarca as
      // outras da mesma linha, senão a soma do cenário conta o item duas vezes.
      for (const c of linha.celulas) next.delete(c.item._key);
      if (marcar) next.add(celula.item._key);
      return next;
    });
  };

  const aplicarCenario = (cenario: Cenario) => {
    const next = new Set<string>();
    if (cenario.id === 'menor_preco') {
      for (const l of linhas) {
        const melhor = l.celulas.find(c => c.melhor);
        if (melhor) next.add(melhor.item._key);
      }
    } else if (cenario.id === 'fornecedor_unico') {
      const alvo = cenario.parcelas[0]?.propostaKey;
      for (const l of linhas) {
        for (const c of l.celulas) if (c.propostaKey === alvo) next.add(c.item._key);
      }
    }
    setSelecionados(next);
  };

  const limparAgrupamentosManuais = () => setOverrides({});

  const alternarAgrupamento = (itemKey: string, marcar: boolean) => {
    setSelecaoAgrupamento(prev => {
      const next = new Set(prev);
      if (marcar) next.add(itemKey); else next.delete(itemKey);
      return next;
    });
  };

  const limparSelecaoAgrupamento = () => setSelecaoAgrupamento(new Set());

  /** Todos os itens selecionados vão para a linha da primeira célula marcada, na ordem em que a matriz é exibida. */
  const juntarSelecionados = () => {
    const chaves = [...selecaoAgrupamento];
    if (chaves.length < 2) return;
    const alvo = linhasExibidas.find(l => l.celulas.some(c => selecaoAgrupamento.has(c.item._key)))?.key;
    if (!alvo) return;

    const overridesAntes = overrides;
    setOverrides(prev => {
      const next = { ...prev };
      for (const key of chaves) next[key] = alvo;
      return next;
    });
    limparSelecaoAgrupamento();
    toast.action(`${chaves.length} itens agrupados na mesma linha.`, 'Desfazer', () => setOverrides(overridesAntes));
  };

  /** Cada item selecionado ganha sua própria linha nova. */
  const separarSelecionados = () => {
    const chaves = [...selecaoAgrupamento];
    if (chaves.length === 0) return;

    const overridesAntes = overrides;
    setOverrides(prev => {
      const next = { ...prev };
      for (const key of chaves) next[key] = `man:${key}`;
      return next;
    });
    limparSelecaoAgrupamento();
    toast.action(
      `${chaves.length} ${chaves.length === 1 ? 'item separado' : 'itens separados'} em linhas próprias.`,
      'Desfazer',
      () => setOverrides(overridesAntes),
    );
  };

  const handleFrete = async (propostaKey: string, valor: number | null) => {
    const anterior = salvas.find(p => p._key === propostaKey)?.valor_frete ?? null;
    if (anterior === valor) return;
    onAtualizarProposta(propostaKey, { valor_frete: valor });
    try {
      await salvarFreteProposta(propostaKey, valor);
    } catch (err) {
      onAtualizarProposta(propostaKey, { valor_frete: anterior });
      toast.error((err as Error).message);
    }
  };

  // Itens recém-marcados que não são a melhor oferta da linha — o comprador
  // confirma e, se quiser, explica antes de gravar. Os já gravados antes não
  // perguntam de novo: a confirmação deles já aconteceu.
  const [confirmacaoForaDoMelhor, setConfirmacaoForaDoMelhor] = useState<ItemForaDoMelhor[] | null>(null);

  const itensForaDoMelhor = (marcar: string[]): ItemForaDoMelhor[] => {
    const lista: ItemForaDoMelhor[] = [];
    for (const key of marcar) {
      for (const l of linhas) {
        const c = l.celulas.find(x => x.item._key === key);
        if (!c) continue;
        if (!c.melhor && l.celulas.length > 1) {
          lista.push({
            itemKey: key,
            titulo: l.titulo,
            fornecedor: nomeFornecedorCurto(propostasPorKey.get(c.propostaKey)?.fornecedor_razao_social) || 'Fornecedor',
            unitario: c.custo.unitarioComparavel,
            melhorUnitario: l.melhorCusto ?? null,
            deltaPct: c.deltaPct,
            unidade: c.item.unidade_medida || 'un',
          });
        }
        break;
      }
    }
    return lista;
  };

  const handleSalvar = async () => {
    const marcar = [...selecionados].filter(k => !selecaoPersistida.has(k));
    const foraDoMelhor = itensForaDoMelhor(marcar);
    if (foraDoMelhor.length > 0) {
      setConfirmacaoForaDoMelhor(foraDoMelhor);
      return;
    }
    await gravarDecisao();
  };

  const gravarDecisao = async (observacoes?: Map<string, string>) => {
    setSalvando(true);
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const marcar = [...selecionados].filter(k => !selecaoPersistida.has(k));
      const desmarcar = [...selecaoPersistida].filter(k => !selecionados.has(k));

      // Se houver chaves temporárias que ainda não foram sincronizadas com o banco
      if ([...marcar, ...desmarcar].some(k => !UUID_REGEX.test(k))) {
        if (onRecarregarPropostas) {
          toast.info('Sincronizando itens com o banco antes de salvar...');
          await onRecarregarPropostas();
          return;
        }
      }

      await salvarSelecaoMapa({ itensSelecionados: marcar, itensDesmarcados: desmarcar, usuarioNome, observacoes });
      setSelecaoPersistida(new Set(selecionados));
      setConfirmacaoForaDoMelhor(null);
      if (selecionados.size > 0) {
        onDecisaoSalva(selecionados, observacoes);
      } else {
        toast.success('Decisão do mapa salva — nenhum item marcado para compra.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const handleExportar = () => {
    const baseRotulo = base === 'cotado' ? 'preço cotado' : base === 'desembolso' ? 'desembolso (IPI + frete)' : 'custo líquido de créditos';
    const wb = montarPlanilhaMapa({
      processo, baseRotulo, linhas: linhasVisiveis, resumos, propostasPorKey, selecionados, cenarios,
    });
    XLSX.writeFile(wb, `mapa_${processo.numero}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const [sapModalLinhas, setSapModalLinhas] = useState<LinhaSapExport[] | null>(null);

  const handleExportarSap = () => {
    const linhasSap = construirLinhasSap({ linhas: linhasVisiveis, selecionados, escopo, propostasPorKey, compradorPadrao });
    if (linhasSap.length === 0) {
      toast.info('Marque ao menos um item na matriz antes de exportar para o SAP.');
      return;
    }
    setSapModalLinhas(linhasSap);
  };

  // -------------------------------------------------------------------

  if (propostasMapa.length === 0) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onVoltar} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar às propostas
        </button>
        <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
          <PackageX className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Nenhuma proposta salva ainda</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            O mapa compara as propostas já salvas no processo. Revise e salve pelo menos uma para começar.
          </p>
        </div>
      </div>
    );
  }

  const semOferta = linhas.filter(l => l.celulas.length === 0).length;
  const agrupadasPorIa = linhas.filter(l => l.origem !== 'escopo' && l.celulas.length > 1).length;

  return (
    <div className="mx-auto max-w-[1880px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {rotuloVoltar}
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-slate-900 dark:text-slate-50">Mapa comparativo</h2>
            <p className="truncate text-[11px] text-slate-400">
              {busca.trim() || ocultarSemCotacao ? `${linhasVisiveis.length} de ${linhas.length}` : linhas.length} {linhas.length === 1 ? 'item' : 'itens'} · {resumos.length} {resumos.length === 1 ? 'fornecedor' : 'fornecedores'}
              {agrupadasPorIa > 0 && ` · ${agrupadasPorIa} ${agrupadasPorIa === 1 ? 'linha agrupada' : 'linhas agrupadas'} por similaridade`}
            </p>
          </div>
        </div>
        {Object.keys(overrides).length > 0 && (
          <button
            type="button"
            onClick={limparAgrupamentosManuais}
            className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <RotateCcw className="h-3 w-3" />
            Desfazer meus agrupamentos
          </button>
        )}
      </div>

      {(naoSalvas > 0 || semOferta > 0) && (
        <div className="space-y-1.5">
          {naoSalvas > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {naoSalvas} {naoSalvas === 1 ? 'proposta ainda não foi salva e ficou' : 'propostas ainda não foram salvas e ficaram'} fora do mapa.
            </div>
          )}
          {semOferta > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              <span className="flex items-start gap-2">
                <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {semOferta} {semOferta === 1 ? 'item da RM não recebeu nenhuma oferta' : 'itens da RM não receberam nenhuma oferta'} — precisam de nova cotação.
              </span>
              <button
                type="button"
                onClick={() => setOcultarSemCotacao(v => !v)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
              >
                {ocultarSemCotacao ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {ocultarSemCotacao ? 'Mostrar na tabela' : 'Retirar da tabela'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cenários antes da barra de filtros — não sticky, de propósito: sobe
          e some da tela ao rolar. A barra logo abaixo é que fica fixa
          (`sticky top-0`) para o comprador continuar filtrando/marcando
          com a matriz longa rolando por baixo dela. Na ordem inversa, o
          card de cenários ficava "por trás" da barra fixa ao rolar,
          cortado na metade — parecia bug de layout. */}
      <MapaCenarios cenarios={cenarios} onAplicar={aplicarCenario} />

      <MapaOpcoesBar
        base={base} onBase={setBase}
        creditos={creditos} onCreditos={setCreditos}
        limiar={limiar} onLimiar={setLimiar}
        ordenacao={ordenacao} onOrdenacao={setOrdenacao}
        busca={busca} onBusca={setBusca}
        itensSelecionados={selecionados.size}
        alteracoesPendentes={alteracoesPendentes}
        salvando={salvando}
        onSalvar={handleSalvar}
        onExportar={handleExportar}
        onExportarSap={handleExportarSap}
      />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-slate-200 bg-slate-50/80 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Comparativo item × fornecedor
            </span>
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-200/60 p-0.5 dark:bg-slate-900/50">
              {OPCOES_VISUALIZACAO.map(op => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setVisualizacao(op.id)}
                  title={op.titulo}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors ${
                    visualizacao === op.id
                      ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <op.Icone className="h-3 w-3" />
                  {op.rotulo}
                </button>
              ))}
            </div>
          </div>
          {visualizacao === 'detalhada' && (
            <button
              type="button"
              onClick={resetLarguras}
              disabled={!larguraCustomizada}
              title="Voltar todas as colunas à largura padrão"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3 w-3" /> Redefinir larguras
            </button>
          )}
        </div>

        {linhasVisiveis.length === 0 ? (
          <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-white py-10 text-center dark:border-slate-800 dark:bg-slate-900">
            <SearchX className="mx-auto mb-1.5 h-5 w-5 text-slate-300 dark:text-slate-700" />
            <p className="text-xs text-slate-400">
              {busca.trim() ? <>Nenhum item bate com &quot;{busca}&quot;.</> : 'Nenhum item para mostrar — todos foram retirados por não ter cotação.'}
            </p>
          </div>
        ) : visualizacao === 'preco' ? (
          <MapaTabelaPreco
            linhas={linhasVisiveis}
            resumos={resumos}
            propostasPorKey={propostasPorKey}
            selecionados={selecionados}
            onMarcar={(celula, linha, marcar) => alternarSelecao(celula, linha, marcar)}
          />
        ) : visualizacao === 'fornecedor' ? (
          <MapaTabelaFornecedor
            linhas={linhasVisiveis}
            resumos={resumos}
            selecionados={selecionados}
            onMarcar={(celula, linha, marcar) => alternarSelecao(celula, linha, marcar)}
          />
        ) : visualizacao === 'item' ? (
          <MapaVisaoItem
            linhas={linhasVisiveis}
            resumos={resumos}
            selecionados={selecionados}
            onMarcar={(celula, linha, marcar) => alternarSelecao(celula, linha, marcar)}
          />
        ) : (
          <>
            {hasHorizontalScroll && (
              <div
                ref={topScrollRef}
                onScroll={handleTopScroll}
                className="overflow-x-auto overflow-y-hidden custom-scrollbar border-x border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-950/70"
                style={{ height: '16px' }}
                title="Barra de rolagem horizontal superior"
              >
                <div style={{ width: scrollWidth, height: '1px' }} />
              </div>
            )}

            <div
              ref={tableContainerRef}
              onScroll={handleBottomScroll}
              className="overflow-x-auto custom-scrollbar rounded-b-2xl border border-t-0 border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-900"
            >
            <table className="border-collapse" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
              <colgroup>
                <col style={{ width: larguraDe(COL_ITEM) }} />
                {resumos.map(r => (
                  <col key={r.propostaKey} style={{ width: larguraDe(r.propostaKey) }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="sticky left-0 z-20 bg-slate-50 p-2 pr-3 text-left align-bottom text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                    Item cotado
                    <AlcaColuna
                      largura={larguraDe(COL_ITEM)}
                      onArrastar={px => setLarguraPreview({ col: COL_ITEM, px })}
                      onFim={px => fixarLargura(COL_ITEM, px)}
                    />
                  </th>
                  {resumos.map((r, i) => {
                    const propostaDoFornecedor = salvas.find(p => p._key === r.propostaKey)!;
                    return (
                    <th key={r.propostaKey} className="relative border-l border-slate-100 bg-slate-50/60 align-top dark:border-slate-800 dark:bg-slate-800/40">
                      <CabecalhoFornecedor
                        resumo={r}
                        proposta={propostaDoFornecedor}
                        posicao={i}
                        melhorTotal={melhorTotalFornecedor}
                        onFrete={v => handleFrete(r.propostaKey, v)}
                        arquivoOriginal={
                          propostaDoFornecedor.arquivo_origem
                            ? arquivosOriginais?.get(propostaDoFornecedor.arquivo_origem)
                            : undefined
                        }
                        onEditarMarkdown={onEditarMarkdown ? (md => onEditarMarkdown(r.propostaKey, md)) : undefined}
                        onAtualizarProposta={onAtualizarProposta}
                      />
                      <AlcaColuna
                        largura={larguraDe(r.propostaKey)}
                        onArrastar={px => setLarguraPreview({ col: r.propostaKey, px })}
                        onFim={px => fixarLargura(r.propostaKey, px)}
                      />
                    </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.map(linha => (
                  <tr key={linha.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800/70">
                    <td className="sticky left-0 z-10 overflow-hidden bg-white p-2 align-top dark:bg-slate-900">
                      <div className="break-words text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100">{linha.titulo}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {linha.ri && <Chip tom="neutro"><Link2 className="h-3 w-3" />{linha.ri}</Chip>}
                        {linha.qtdSolicitada != null && (
                          <Chip tom="neutro">{formatQtd(linha.qtdSolicitada)} {linha.unidade || 'un'}</Chip>
                        )}
                        {linha.origem !== 'escopo' && linha.celulas.length > 1 && (
                          <Chip tom="neutro" title={`Agrupado por similaridade de descrição (mínimo ${Math.round(linha.confiancaMinima * 100)}%)`}>
                            <Sparkles className="h-3 w-3" />
                            {Math.round(linha.confiancaMinima * 100)}%
                          </Chip>
                        )}
                        {linha.quantidadeDivergente && (
                          <Chip tom="aviso" title="Os fornecedores cotaram quantidades diferentes — o total não é comparável direto.">
                            qtd divergente
                          </Chip>
                        )}
                        {linha.unidadeDivergente && (
                          <Chip tom="aviso" title="Unidades de medida diferentes entre fornecedores.">un divergente</Chip>
                        )}
                      </div>
                      {linha.dispersao != null && linha.dispersao > 0 && (
                        <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                          entre a melhor e a pior oferta (por unidade): <span className="font-semibold">{formatBRL(linha.dispersao)}</span>
                        </div>
                      )}
                    </td>

                    {resumos.map(r => {
                      const celula = linha.celulas.find(c => c.propostaKey === r.propostaKey);
                      return (
                        <td key={r.propostaKey} className="overflow-hidden border-l border-slate-100 p-1 align-top dark:border-slate-800">
                          {celula ? (
                            <Celula
                              celula={celula}
                              marcado={selecionados.has(celula.item._key)}
                              onMarcar={v => alternarSelecao(celula, linha, v)}
                              selecionadoAgrupamento={selecaoAgrupamento.has(celula.item._key)}
                              onToggleAgrupamento={v => alternarAgrupamento(celula.item._key, v)}
                            />
                          ) : (
                            <div className="flex h-full min-h-[70px] items-center justify-center text-[10px] text-slate-300 dark:text-slate-700">
                              não cotou
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>

      {selecaoAgrupamento.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-violet-200 bg-white px-4 py-2 shadow-lg shadow-slate-900/10 dark:border-violet-800 dark:bg-slate-900">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {selecaoAgrupamento.size} {selecaoAgrupamento.size === 1 ? 'item selecionado' : 'itens selecionados'}
          </span>
          <button
            type="button"
            onClick={juntarSelecionados}
            disabled={selecaoAgrupamento.size < 2}
            title="Colocar os itens selecionados na mesma linha da matriz"
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Merge className="h-3.5 w-3.5" />
            Juntar
          </button>
          <button
            type="button"
            onClick={separarSelecionados}
            title="Colocar cada item selecionado na sua própria linha"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Scissors className="h-3.5 w-3.5" />
            Separar
          </button>
          <button
            type="button"
            onClick={limparSelecaoAgrupamento}
            title="Cancelar seleção"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {confirmacaoForaDoMelhor && (
        <ConfirmarForaDoMelhorModal
          itens={confirmacaoForaDoMelhor}
          salvando={salvando}
          onCancelar={() => setConfirmacaoForaDoMelhor(null)}
          onConfirmar={texto => {
            const obs = texto.trim();
            gravarDecisao(obs ? new Map(confirmacaoForaDoMelhor.map(i => [i.itemKey, obs])) : undefined);
          }}
        />
      )}

      {sapModalLinhas && (
        <ExportarSapModal
          linhasIniciais={sapModalLinhas}
          numeroProcesso={processo.numero}
          onClose={() => setSapModalLinhas(null)}
        />
      )}
    </div>
  );
}

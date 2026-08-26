/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Card de revisão de uma proposta: os 25 campos de cabeçalho num formulário
 * editável, medidor de completude com o toggle "Mostrar só o que faltou"
 * (o workflow real de conferência — ler 40 campos preenchidos para achar 5
 * brancos é a dor que este toggle resolve), aviso de divergência de totais,
 * casamento por CNPJ, cobertura do escopo e a grade de itens.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, AlertTriangle, EyeOff, Eye, Trash2, Save, Loader2, Clock, FileSearch } from 'lucide-react';
import PropostaItensGrid from './PropostaItensGrid';
import FornecedorMatchBadge from './FornecedorMatchBadge';
import CoberturaEscopoPanel from './CoberturaEscopoPanel';
import VerArquivoOriginalModal from './VerArquivoOriginalModal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { validarProposta, conferirTotais, podeSalvar } from '../../lib/cotacoes';
import { formatDateTimeBR } from '../../lib/format';
import type { CotacaoProcessoItem, CotacaoPropostaDraft, FornecedorMatch } from '../../types';

interface CampoDef {
  key: keyof CotacaoPropostaDraft;
  label: string;
  tipo?: 'text' | 'date' | 'select';
  opcoes?: string[];
}

const CAMPOS: CampoDef[] = [
  { key: 'numero_proposta', label: 'Número da proposta' },
  { key: 'data_emissao', label: 'Data de emissão', tipo: 'date' },
  { key: 'validade_data', label: 'Validade (data)', tipo: 'date' },
  { key: 'validade_texto', label: 'Validade (texto)' },
  { key: 'fornecedor_razao_social', label: 'Fornecedor — razão social' },
  { key: 'fornecedor_inscricao_estadual', label: 'Fornecedor — IE' },
  { key: 'fornecedor_cidade', label: 'Fornecedor — cidade' },
  { key: 'fornecedor_uf', label: 'Fornecedor — UF' },
  { key: 'fornecedor_telefone', label: 'Fornecedor — telefone' },
  { key: 'vendedor_nome', label: 'Vendedor — nome' },
  { key: 'vendedor_email', label: 'Vendedor — e-mail' },
  { key: 'vendedor_telefone', label: 'Vendedor — telefone' },
  { key: 'cliente_razao_social', label: 'Cliente — razão social' },
  { key: 'cliente_cnpj', label: 'Cliente — CNPJ' },
  { key: 'cliente_inscricao_estadual', label: 'Cliente — IE' },
  { key: 'cliente_cidade', label: 'Cliente — cidade' },
  { key: 'cliente_uf', label: 'Cliente — UF' },
  { key: 'condicao_pagamento', label: 'Condição de pagamento' },
  { key: 'forma_pagamento', label: 'Forma de pagamento' },
  { key: 'prazo_entrega_texto', label: 'Prazo de entrega' },
  { key: 'frete_modalidade', label: 'Modalidade de frete', tipo: 'select', opcoes: ['CIF', 'FOB', 'OUTRO'] },
  { key: 'transportadora_indicada', label: 'Transportadora indicada' },
  { key: 'faturamento_minimo', label: 'Faturamento mínimo' },
  { key: 'dados_bancarios_pix', label: 'Dados bancários / PIX' },
  { key: 'valor_total_orcamento', label: 'Valor total do orçamento' },
  { key: 'observacoes_gerais', label: 'Observações gerais' },
];

const brl = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Campo de valor monetário: digita livre (aceita vírgula), formata com separador de milhar ao perder o foco — mesmo padrão de "digita e resolve no blur" já usado em PropostaItensGrid. */
function CampoMoeda({ valor, onChange, faltando }: { valor: number | null; onChange: (v: number | null) => void; faltando?: boolean }) {
  const [texto, setTexto] = useState(valor != null ? brl(valor) : '');
  useEffect(() => { setTexto(valor != null ? brl(valor) : ''); }, [valor]);

  return (
    <div className={`mt-0.5 flex items-center gap-1 rounded border px-1.5 focus-within:border-indigo-500 ${faltando ? 'border-rose-300 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700'}`}>
      <span className="text-xs text-slate-400">R$</span>
      <input
        inputMode="decimal"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={() => {
          const limpo = texto.trim().replace(/\./g, '').replace(',', '.');
          const n = limpo === '' ? null : Number(limpo);
          onChange(n != null && Number.isFinite(n) ? n : null);
        }}
        placeholder="0,00"
        className="w-full bg-transparent py-1 text-sm outline-none"
      />
    </div>
  );
}

interface PropostaCardProps {
  proposta: CotacaoPropostaDraft;
  escopo: CotacaoProcessoItem[];
  onChange: (patch: Partial<CotacaoPropostaDraft>) => void;
  onChangeItem: (key: string, patch: Partial<CotacaoPropostaDraft['itens'][number]>) => void;
  onRemover: () => void;
  onSalvar: () => void;
  salvando: boolean;
  /** Exclui do Supabase — só se aplica a uma proposta já salva (`_salvo: true`). Otimista + com janela de "Desfazer" no chamador; aqui é só disparar. */
  onExcluirSalva: () => void;
  /** Arquivo original (PDF/imagem) por trás desta proposta, se ainda estiver na memória da sessão — ver VerArquivoOriginalModal. */
  arquivoOriginal?: File | null;
}

export default function PropostaCard({
  proposta, escopo, onChange, onChangeItem, onRemover, onSalvar, salvando, onExcluirSalva, arquivoOriginal,
}: PropostaCardProps) {
  const [soFaltando, setSoFaltando] = useState(false);
  const [previewArquivoAberto, setPreviewArquivoAberto] = useState(false);
  const [confirmSalvarAberto, setConfirmSalvarAberto] = useState(false);
  const [confirmExcluirAberto, setConfirmExcluirAberto] = useState(false);
  const [confirmRemoverAberto, setConfirmRemoverAberto] = useState(false);

  const validacao = useMemo(() => validarProposta(proposta), [proposta]);
  const totais = useMemo(() => conferirTotais(proposta), [proposta]);
  const pct = Math.round((validacao.preenchidos / validacao.total) * 100);
  const semPendencias = podeSalvar(validacao);

  const camposFaltantesCabecalho = new Set(validacao.bloqueios.concat(validacao.avisos).map(c => c.campo));
  const camposVisiveis = soFaltando
    ? CAMPOS.filter(c => !proposta[c.key])
    : CAMPOS;

  const itensSemVinculo = proposta.itens.filter(it => !it.processo_item_id && !it.fora_escopo);

  const handleMarcarSemVinculoForaEscopo = () => {
    itensSemVinculo.forEach(it => {
      onChangeItem(it._key, { processo_item_id: null, ri: null, material_code: null, fora_escopo: true, vinculo_origem: 'manual', vinculo_score: null });
    });
  };

  const handleClicarSalvar = () => {
    if (!semPendencias) {
      setConfirmSalvarAberto(true);
      return;
    }
    onSalvar();
  };

  const handleClicarExcluir = () => setConfirmExcluirAberto(true);

  const handleClicarRemover = () => setConfirmRemoverAberto(true);

  const camposFaltantesPorItem = (item: CotacaoPropostaDraft['itens'][number]) => {
    const s = new Set<string>();
    if (!item.descricao_produto) s.add('descricao_produto');
    if (item.quantidade == null) s.add('quantidade');
    if (item.preco_unitario == null) s.add('preco_unitario');
    if (!item.unidade_medida) s.add('unidade_medida');
    if (item.preco_total_item == null) s.add('preco_total_item');
    if (!item.ncm) s.add('ncm');
    if (item.aliquota_icms_pct == null) s.add('aliquota_icms_pct');
    return s;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <FileText className="h-4 w-4 shrink-0 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          {proposta.fornecedor_razao_social || 'Fornecedor não identificado'}
        </span>
        {proposta._salvo && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Salva</span>
        )}
        {proposta._extraido_em && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title="Quando esta proposta foi extraída pela IA">
            <Clock className="h-3 w-3" />
            {formatDateTimeBR(proposta._extraido_em)}
          </span>
        )}
        {arquivoOriginal && (
          <button
            type="button"
            onClick={() => setPreviewArquivoAberto(true)}
            title="Ver o arquivo original (PDF/imagem) desta proposta"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
          >
            <FileSearch className="h-3.5 w-3.5" />
            Ver arquivo original
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSoFaltando(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {soFaltando ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {soFaltando ? 'Mostrar tudo' : 'Mostrar só o que faltou'}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-full rounded-full ${pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{validacao.preenchidos}/{validacao.total}</span>
          </div>
          {!proposta._salvo && (
            <button type="button" onClick={handleClicarRemover} title="Remover esta proposta da revisão" className="text-slate-300 hover:text-rose-500">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {proposta._salvo && (
            <button
              type="button"
              onClick={handleClicarExcluir}
              title="Excluir esta proposta salva"
              className="text-slate-300 hover:text-rose-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <FornecedorMatchBadge
          cnpj={proposta.fornecedor_cnpj}
          fornecedorMatch={proposta.fornecedor_match}
          codVendor={proposta.cod_vendor}
          onResolvido={(r: { cod_vendor: string | null; contato_id: string | null; fornecedor_match: FornecedorMatch }) => onChange(r)}
        />
        <CoberturaEscopoPanel escopo={escopo} itens={proposta.itens} />
      </div>

      {totais && totais.divergenciaPct != null && totais.divergenciaPct > 1 && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            A soma dos itens (R$ {brl(totais.somaItens)}) diverge {totais.divergenciaPct.toFixed(1)}% do Valor_Total_Orcamento (R$ {brl(totais.informado ?? 0)}).
            Confira se alguma linha foi perdida ou duplicada — desconto e frete também explicam a diferença.
          </span>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
        {camposVisiveis.map(c => {
          const faltando = camposFaltantesCabecalho.has(c.key as string) || (soFaltando && !proposta[c.key]);
          const valor = proposta[c.key];
          const ehMoeda = c.key === 'valor_total_orcamento' || c.key === 'faturamento_minimo';
          return (
            <div key={c.key} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{c.label}</dt>
              {c.tipo === 'select' ? (
                <select
                  value={(valor as string) ?? ''}
                  onChange={e => onChange({ [c.key]: e.target.value || null } as Partial<CotacaoPropostaDraft>)}
                  className={`mt-0.5 w-full rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-indigo-500 ${faltando ? 'border-rose-300 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700'}`}
                >
                  <option value="">—</option>
                  {c.opcoes!.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : ehMoeda ? (
                <CampoMoeda
                  valor={valor as number | null}
                  onChange={v => onChange({ [c.key]: v } as Partial<CotacaoPropostaDraft>)}
                  faltando={faltando}
                />
              ) : (
                <input
                  type={c.tipo === 'date' ? 'date' : 'text'}
                  value={(valor as string | number) ?? ''}
                  onChange={e => onChange({ [c.key]: e.target.value || null } as Partial<CotacaoPropostaDraft>)}
                  className={`mt-0.5 w-full rounded border bg-transparent px-1.5 py-1 text-sm outline-none focus:border-indigo-500 ${faltando ? 'border-rose-300 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700'}`}
                />
              )}
            </div>
          );
        })}
      </dl>

      <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        {!proposta._salvo && itensSemVinculo.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-rose-600 dark:text-rose-400">
              {itensSemVinculo.length} {itensSemVinculo.length === 1 ? 'item sem vínculo' : 'itens sem vínculo'}
            </span>
            <button
              type="button"
              onClick={handleMarcarSemVinculoForaEscopo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Marcar sem vínculo como "fora do escopo"
            </button>
          </div>
        )}
        <PropostaItensGrid
          itens={proposta.itens}
          escopo={escopo}
          camposFaltantesPorItem={camposFaltantesPorItem}
          onChangeItem={onChangeItem}
        />
      </div>

      {!proposta._salvo && (
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {!semPendencias && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              {validacao.bloqueios.length} pendência(s) — salvar vai pedir confirmação
            </span>
          )}
          <button
            type="button"
            onClick={handleClicarSalvar}
            disabled={salvando}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:pointer-events-none disabled:opacity-40 ${
              semPendencias ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {salvando ? 'Salvando...' : 'Salvar proposta'}
          </button>
        </div>
      )}

      {previewArquivoAberto && arquivoOriginal && (
        <VerArquivoOriginalModal
          nome={proposta.arquivo_origem ?? arquivoOriginal.name}
          file={arquivoOriginal}
          onClose={() => setPreviewArquivoAberto(false)}
        />
      )}

      {confirmSalvarAberto && (
        <ConfirmDialog
          titulo="Salvar com pendências?"
          mensagem={`Esta proposta tem ${validacao.bloqueios.length} pendência(s) (campos obrigatórios ou itens sem vínculo).`}
          confirmarLabel="Salvar mesmo assim"
          onConfirmar={() => { setConfirmSalvarAberto(false); onSalvar(); }}
          onCancelar={() => setConfirmSalvarAberto(false)}
        />
      )}

      {confirmExcluirAberto && (
        <ConfirmDialog
          titulo="Excluir proposta salva?"
          mensagem={`A proposta de "${proposta.fornecedor_razao_social || 'fornecedor não identificado'}" será removida. Você tem alguns segundos para desfazer logo em seguida.`}
          confirmarLabel="Excluir"
          variante="perigo"
          onConfirmar={() => { setConfirmExcluirAberto(false); onExcluirSalva(); }}
          onCancelar={() => setConfirmExcluirAberto(false)}
        />
      )}

      {confirmRemoverAberto && (
        <ConfirmDialog
          titulo="Remover proposta da revisão?"
          mensagem={`Os campos extraídos e ajustes feitos na proposta de "${proposta.fornecedor_razao_social || 'fornecedor não identificado'}" serão descartados — ela ainda não foi salva.`}
          confirmarLabel="Remover"
          variante="perigo"
          onConfirmar={() => { setConfirmRemoverAberto(false); onRemover(); }}
          onCancelar={() => setConfirmRemoverAberto(false)}
        />
      )}
    </div>
  );
}

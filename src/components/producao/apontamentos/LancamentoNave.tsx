/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário de realizado de uma nave: escolhe o dia e digita a quantidade
 * de cada etapa. Cada envio vira um registro APT-DDMMYY-NN; vários envios no
 * mesmo dia se somam (um por turno, por exemplo). Abaixo, os lançamentos do
 * dia — editar/excluir só o autor ou admin.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { podeEditarFormulario } from '../../../lib/permissoesFormularios';
import { excluirLancamento, listarLancamentos, salvarLancamento } from '../../../lib/producaoApontamentosApi';
import {
  formatarDataBR,
  hojeLocal,
  somarItens,
  type ConfigNave,
  type EtapaApontamento,
  type LancamentoApontamento,
} from '../../../lib/producaoApontamentos';
import type { Profile } from '../../../types';
import { btnPrimario, btnSecundario, cardCls, inputCls, labelCls, msgErro } from './estilos';

interface Props {
  user: Profile;
  nave: ConfigNave;
  etapas: EtapaApontamento[];
  /** Chamado depois de salvar/excluir — a tabela e os relatórios recarregam. */
  onAlterado: () => void;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function LancamentoNave({ user, nave, etapas, onAlterado }: Props) {
  const toast = useToast();
  const [data, setData] = useState(hojeLocal());
  const [valores, setValores] = useState<Record<string, string>>({});
  const [observacao, setObservacao] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [lancamentos, setLancamentos] = useState<LancamentoApontamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const etapasNave = useMemo(
    () => etapas.filter(e => e.nave === nave.id && e.ativa).sort((a, b) => a.ordem - b.ordem),
    [etapas, nave.id],
  );
  const nomeEtapa = useMemo(() => new Map(etapas.map(e => [e.id, e.nome])), [etapas]);
  const somaDia = useMemo(() => somarItens(lancamentos), [lancamentos]);

  const carregar = useCallback(() => {
    setCarregando(true);
    listarLancamentos(nave.id, data)
      .then(setLancamentos)
      .catch(e => toast.error(msgErro(e, 'Não foi possível carregar os lançamentos do dia.')))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nave.id, data]);

  useEffect(carregar, [carregar]);

  const limpar = () => {
    setValores({});
    setObservacao('');
    setEditandoId(null);
  };

  const itens = etapasNave
    .map(e => ({ etapa_id: e.id, quantidade: Math.max(0, Math.round(Number(valores[e.id] || 0))) }))
    .filter(i => i.quantidade > 0);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await salvarLancamento({ id: editandoId ?? undefined, data, nave: nave.id, observacao, itens });
      if (r.enfileirado) toast.warning('Sem rede: o lançamento ficou salvo no aparelho e sobe quando a conexão voltar.');
      else toast.success(editandoId ? `Lançamento ${r.codigo} atualizado.` : `Lançamento ${r.codigo} registrado.`);
      limpar();
      carregar();
      onAlterado();
    } catch (e) {
      toast.error(msgErro(e, 'Não foi possível salvar o lançamento.'));
    } finally {
      setSalvando(false);
    }
  };

  const editar = (l: LancamentoApontamento) => {
    setEditandoId(l.id);
    setValores(Object.fromEntries(l.itens.map(i => [i.etapa_id, String(i.quantidade)])));
    setObservacao(l.observacao ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const excluir = async (l: LancamentoApontamento) => {
    if (!window.confirm(`Excluir o lançamento ${l.codigo}?`)) return;
    try {
      await excluirLancamento(l.id);
      toast.success(`${l.codigo} excluído.`);
      if (editandoId === l.id) limpar();
      carregar();
      onAlterado();
    } catch (e) {
      toast.error(msgErro(e, 'Não foi possível excluir.'));
    }
  };

  const editando = lancamentos.find(l => l.id === editandoId);

  return (
    <div className="space-y-4">
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
              {editando ? `Editando ${editando.codigo}` : `Realizado — ${nave.titulo}`}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quantidade produzida no dia em cada etapa. Deixe em branco o que não teve.</p>
          </div>
          <div>
            <label className={labelCls}>Data de produção</label>
            <input
              type="date"
              value={data}
              max={hojeLocal()}
              onChange={e => e.target.value && setData(e.target.value)}
              disabled={!!editandoId}
              className={`${inputCls} w-auto`}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {etapasNave.map(e => {
            const jaLancado = (somaDia.get(e.id) ?? 0) - (editando?.itens.find(i => i.etapa_id === e.id)?.quantidade ?? 0);
            return (
              <label key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{e.nome}</span>
                  {jaLancado > 0 && <span className="text-[11px] text-slate-500 dark:text-slate-400">já lançado no dia: {jaLancado}</span>}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={valores[e.id] ?? ''}
                  onChange={ev => setValores(v => ({ ...v, [e.id]: ev.target.value }))}
                  placeholder="0"
                  className="w-20 shrink-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-base font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </label>
            );
          })}
        </div>

        <div className="mt-3">
          <label className={labelCls}>Observações (opcional)</label>
          <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: Tecoi parada — manutenção acionada" className={inputCls} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {editandoId && (
            <button type="button" onClick={limpar} className={btnSecundario}>
              <X className="h-4 w-4" /> Cancelar edição
            </button>
          )}
          <button type="button" onClick={salvar} disabled={salvando || itens.length === 0} className={btnPrimario}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editandoId ? 'Salvar alterações' : 'Lançar realizado'}
          </button>
        </div>
      </section>

      <section className={`${cardCls} p-4`}>
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Lançamentos de {formatarDataBR(data)}</h3>
        {carregando ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : lancamentos.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">Nenhum lançamento da {nave.titulo} neste dia.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {lancamentos.map(l => {
              const pode = podeEditarFormulario(user, l);
              return (
                <li key={l.id} className={`flex flex-wrap items-start justify-between gap-2 py-2.5 ${l.id === editandoId ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-slate-900 dark:text-slate-50">
                      {l.codigo}
                      <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                        {l.criado_por_nome ?? '—'} · {hora(l.created_at)}
                        {l.atualizado_por_nome ? ` · editado por ${l.atualizado_por_nome}` : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                      {l.itens.map(i => `${nomeEtapa.get(i.etapa_id) ?? i.etapa_id}: ${i.quantidade}`).join(' · ')}
                    </p>
                    {l.observacao && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{l.observacao}</p>}
                  </div>
                  {pode && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => editar(l)} title="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => excluir(l)} title="Excluir" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

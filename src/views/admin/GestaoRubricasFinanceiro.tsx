/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Manutenção do de-para Rubrica x Fornecedor/Grupo de Mercadoria.
 * Tabela `fin_rubrica_mapeamentos`. Usada para ajustar a classificação que
 * alimenta a tela `/financeiro/realizado-rubricas` — cada pedido/pagamento
 * sem mapeamento cai no balde "Sem rubrica" daquela tela.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import type { Profile, FinRubrica, FinRubricaMapeamento } from '../../types';
import {
  listarRubricas, listarMapeamentos, salvarMapeamento, removerMapeamento,
} from '../../lib/rubricasFinanceiroApi';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TableShell, TableHeadRow, Th, TableBody, Tr, Td, TableSkeleton, TableEmpty } from '../../components/ui/DataTable';

interface Props {
  user: Profile;
}

export default function GestaoRubricasFinanceiro({ user: _user }: Props) {
  const toast = useToast();
  const [rubricas, setRubricas] = useState<FinRubrica[]>([]);
  const [mapeamentos, setMapeamentos] = useState<FinRubricaMapeamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<FinRubricaMapeamento | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const [formRubricaId, setFormRubricaId] = useState('');
  const [formTipo, setFormTipo] = useState<'fornecedor' | 'grupo_mercadoria'>('fornecedor');
  const [formChave, setFormChave] = useState('');
  const [formDescricao, setFormDescricao] = useState('');

  const carregar = async () => {
    setCarregando(true);
    try {
      const [r, m] = await Promise.all([listarRubricas(), listarMapeamentos()]);
      setRubricas(r);
      setMapeamentos(m);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao carregar rubricas.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Opções do select com indentação por nível, na mesma ordem hierárquica da tela de relatório.
  const opcoesRubrica = useMemo(() => {
    const porId = new Map(rubricas.map(r => [r.id, r]));
    const filhosPorPai = new Map<string, FinRubrica[]>();
    for (const r of rubricas) {
      if (!r.rubrica_pai_id) continue;
      if (!filhosPorPai.has(r.rubrica_pai_id)) filhosPorPai.set(r.rubrica_pai_id, []);
      filhosPorPai.get(r.rubrica_pai_id)!.push(r);
    }
    const resultado: { id: string; label: string }[] = [];
    const visitar = (r: FinRubrica, nivel: number) => {
      resultado.push({ id: r.id, label: `${'— '.repeat(nivel)}${r.nome}` });
      (filhosPorPai.get(r.id) || []).sort((a, b) => a.ordem - b.ordem).forEach(f => visitar(f, nivel + 1));
    };
    rubricas.filter(r => !r.rubrica_pai_id).sort((a, b) => a.ordem - b.ordem).forEach(r => visitar(r, 0));
    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubricas]);

  const nomeRubrica = (id: string) => rubricas.find(r => r.id === id)?.nome || id;

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRubricaId || !formChave.trim()) {
      toast.warning('Selecione a rubrica e informe a chave (fornecedor ou grupo de mercadoria).');
      return;
    }
    setSalvando(true);
    try {
      await salvarMapeamento({
        rubrica_id: formRubricaId,
        tipo_chave: formTipo,
        chave_valor: formChave.trim(),
        chave_descricao: formDescricao.trim() || null,
      });
      toast.success('Mapeamento salvo.');
      setFormChave('');
      setFormDescricao('');
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar mapeamento.');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await removerMapeamento(paraExcluir.id);
      toast.success('Mapeamento removido.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao remover mapeamento.');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-6 select-text max-w-[1100px] mx-auto pb-12">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-850 dark:text-slate-50 flex items-center gap-2.5">
          <Landmark className="h-7 w-7 text-emerald-600 dark:text-emerald-500" />
          Rubricas Financeiro — De-para
        </h2>
        <p className="text-sm text-slate-555 dark:text-slate-400 mt-1">
          Liga um fornecedor ou grupo de mercadoria SAP a uma rubrica. Alimenta o relatório de{' '}
          <span className="font-semibold">Realizado por Rubrica</span> (Financeiro). Quando um fornecedor e um grupo
          de mercadoria apontam rubricas diferentes para o mesmo pedido, o fornecedor tem prioridade.
        </p>
      </div>

      <form onSubmit={handleSalvar} className="rounded-xl border p-4 flex flex-wrap items-end gap-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        <div className="flex flex-col gap-1 min-w-[220px]">
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Rubrica</label>
          <select
            value={formRubricaId}
            onChange={e => setFormRubricaId(e.target.value)}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <option value="">Selecione...</option>
            {opcoesRubrica.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Tipo</label>
          <select
            value={formTipo}
            onChange={e => setFormTipo(e.target.value as 'fornecedor' | 'grupo_mercadoria')}
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          >
            <option value="fornecedor">Fornecedor (código SAP)</option>
            <option value="grupo_mercadoria">Grupo de Mercadoria (código SAP)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Código</label>
          <input
            value={formChave}
            onChange={e => setFormChave(e.target.value)}
            placeholder="ex.: 1000010928"
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>Descrição (opcional)</label>
          <input
            value={formDescricao}
            onChange={e => setFormDescricao(e.target.value)}
            placeholder="nome do fornecedor/grupo, para referência"
            className="px-3 py-2 border rounded-lg text-xs h-9"
            style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)', color: 'var(--ink-primary)' }}
          />
        </div>

        <button
          type="submit"
          disabled={salvando}
          className="px-4 h-9 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'var(--brand)' }}
        >
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Adicionar
        </button>
      </form>

      {carregando ? (
        <TableSkeleton columns={5} />
      ) : mapeamentos.length === 0 ? (
        <TableEmpty icon={AlertCircle} title="Nenhum mapeamento cadastrado" hint="Use o formulário acima para vincular fornecedores ou grupos de mercadoria a uma rubrica." />
      ) : (
        <TableShell maxHeight="60vh">
          <table className="w-full text-xs">
            <TableHeadRow>
              <Th label="Rubrica" />
              <Th label="Tipo" />
              <Th label="Código" />
              <Th label="Descrição" />
              <Th label="" width="w-10" />
            </TableHeadRow>
            <TableBody>
              {mapeamentos.map(m => (
                <Tr key={m.id}>
                  <Td strong>{nomeRubrica(m.rubrica_id)}</Td>
                  <Td>{m.tipo_chave === 'fornecedor' ? 'Fornecedor' : 'Grupo de Mercadoria'}</Td>
                  <Td mono>{m.chave_valor}</Td>
                  <Td truncate title={m.chave_descricao || ''}>{m.chave_descricao || '—'}</Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setParaExcluir(m)}
                      className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400"
                      aria-label="Remover mapeamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Td>
                </Tr>
              ))}
            </TableBody>
          </table>
        </TableShell>
      )}

      {paraExcluir && (
        <ConfirmDialog
          titulo="Remover mapeamento"
          mensagem={<>Remover o vínculo de <strong>{paraExcluir.chave_valor}</strong> com a rubrica <strong>{nomeRubrica(paraExcluir.rubrica_id)}</strong>? Os pedidos/pagamentos correspondentes voltam a aparecer como "Sem rubrica".</>}
          variante="perigo"
          confirmarLabel="Remover"
          confirmando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </div>
  );
}

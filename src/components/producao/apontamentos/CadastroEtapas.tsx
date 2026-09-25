/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etapas de cada nave (nome, ordem, ativa). Nada se apaga — desativar tira a
 * etapa do formulário e da tabela e preserva o histórico lançado.
 */

import React, { useState } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { salvarEtapa } from '../../../lib/producaoApontamentosApi';
import { NAVES, type EtapaApontamento, type Nave } from '../../../lib/producaoApontamentos';
import { btnPrimario, btnSecundario, cardCls, inputCls, msgErro } from './estilos';

interface Props {
  etapas: EtapaApontamento[];
  onAlterado: () => void;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export default function CadastroEtapas({ etapas, onAlterado }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {NAVES.map(n => (
        <ColunaNave key={n.id} nave={n.id} titulo={n.titulo} etapas={etapas} onAlterado={onAlterado} />
      ))}
    </div>
  );
}

function ColunaNave({ nave, titulo, etapas, onAlterado }: { nave: Nave; titulo: string; etapas: EtapaApontamento[]; onAlterado: () => void }) {
  const toast = useToast();
  const [novo, setNovo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const daNave = etapas.filter(e => e.nave === nave).sort((a, b) => a.ordem - b.ordem);
  const idNovo = slug(novo);
  const duplicado = etapas.some(e => e.id === idNovo);

  const adicionar = async () => {
    setSalvando(true);
    try {
      await salvarEtapa({ id: idNovo, nave, nome: novo.trim(), ordem: (daNave[daNave.length - 1]?.ordem ?? 0) + 10 });
      setNovo('');
      toast.success('Etapa adicionada.');
      onAlterado();
    } catch (e) {
      toast.error(msgErro(e, 'Não foi possível adicionar a etapa.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className={`${cardCls} p-3`}>
      <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">{titulo}</h3>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {daNave.map(e => (
          <LinhaEtapa key={e.id} etapa={e} onAlterado={onAlterado} />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nova etapa" className={`${inputCls} py-1.5`} />
        <button type="button" onClick={adicionar} disabled={salvando || !idNovo || duplicado} title={duplicado ? 'Já existe uma etapa com esse nome' : undefined} className={btnPrimario}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function LinhaEtapa({ etapa, onAlterado }: { etapa: EtapaApontamento; onAlterado: () => void }) {
  const toast = useToast();
  const [nome, setNome] = useState(etapa.nome);
  const [ordem, setOrdem] = useState(String(etapa.ordem));
  const [ativa, setAtiva] = useState(etapa.ativa);
  const [salvando, setSalvando] = useState(false);
  const alterado = nome !== etapa.nome || Number(ordem) !== etapa.ordem || ativa !== etapa.ativa;

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarEtapa({ ...etapa, nome: nome.trim(), ordem: Number(ordem) || 0, ativa });
      toast.success('Etapa salva.');
      onAlterado();
    } catch (e) {
      toast.error(msgErro(e, 'Não foi possível salvar a etapa.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={`flex items-center gap-1.5 py-1.5 ${ativa ? '' : 'opacity-60'}`}>
      <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)} title="Ordem" className={`${inputCls} w-16 px-1.5 py-1.5 text-center`} />
      <input value={nome} onChange={e => setNome(e.target.value)} className={`${inputCls} min-w-0 flex-1 py-1.5`} />
      <input type="checkbox" checked={ativa} onChange={e => setAtiva(e.target.checked)} title="Ativa" className="h-4 w-4 shrink-0" />
      <button type="button" onClick={salvar} disabled={!alterado || salvando || !nome.trim()} title="Salvar" className={`${btnSecundario} px-2 py-1.5`}>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

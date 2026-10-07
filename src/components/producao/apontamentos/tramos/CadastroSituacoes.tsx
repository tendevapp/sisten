/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Situações por etapa ("Setor + Atividade" da planilha), flag
 * prod_apt_cadastros. Situação em uso não é apagada, só desativada.
 *
 * categoria_entrega continua no banco, preenchida pela etapa, mas não aparece:
 * o Controle de Entrega (Planejamento) tem dados próprios desde 07/10/2026.
 */

import React, { useState } from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { useToast } from '../../../ui/Toast';
import { CONFIG_ETAPA, ETAPAS_TRAMO, type EtapaTramo, type SituacaoTramo } from '../../../../lib/producaoTramos';
import { salvarSituacao } from '../../../../lib/producaoTramosApi';
import { btnPrimario, btnSecundario, cardCls, inputCls } from '../estilos';
import { COR_ETAPA } from './visual';

const CATEGORIA_PADRAO: Record<EtapaTramo, string> = {
  corte: 'pendente', nav01: 'nav01', nav02: 'internos', jato: 'white', patio: 'patio', expedido: 'expedido',
};

type Rascunho = Omit<SituacaoTramo, 'id'> & { id?: string };

function Linha({ s, onSalvo }: { s: Rascunho; onSalvo: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<Rascunho>(s);
  const [salvando, setSalvando] = useState(false);
  const sujo = JSON.stringify(r) !== JSON.stringify(s);

  const salvar = async () => {
    if (!r.setor.trim() || !r.atividade.trim()) {
      toast.error('Informe setor e atividade.');
      return;
    }
    setSalvando(true);
    try {
      await salvarSituacao(r);
      toast.success('Situação salva.');
      onSalvo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <tr className={r.ativo ? '' : 'opacity-50'}>
      <td className="py-1 pr-2">
        <select
          value={r.etapa}
          onChange={e => {
            const etapa = e.target.value as EtapaTramo;
            setR({ ...r, etapa, categoriaEntrega: r.id ? r.categoriaEntrega : CATEGORIA_PADRAO[etapa] });
          }}
          className={`${inputCls} py-1`}
        >
          {ETAPAS_TRAMO.map(e => <option key={e} value={e}>{CONFIG_ETAPA[e].rotulo}</option>)}
        </select>
      </td>
      <td className="py-1 pr-2"><input value={r.setor} onChange={e => setR({ ...r, setor: e.target.value })} className={`${inputCls} py-1`} /></td>
      <td className="py-1 pr-2"><input value={r.atividade} onChange={e => setR({ ...r, atividade: e.target.value })} className={`${inputCls} py-1`} /></td>
      <td className="py-1 pr-2"><input type="number" value={r.ordem} onChange={e => setR({ ...r, ordem: Number(e.target.value) || 0 })} className={`${inputCls} w-20 py-1`} /></td>
      <td className="py-1 pr-2 text-center">
        <input type="checkbox" checked={r.ativo} onChange={e => setR({ ...r, ativo: e.target.checked })} aria-label="Ativa" className="h-4 w-4" />
      </td>
      <td className="py-1 text-right">
        <button type="button" onClick={salvar} disabled={!sujo || salvando} className={`${btnPrimario} px-3 py-1.5`}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </button>
      </td>
    </tr>
  );
}

export default function CadastroSituacoes({ situacoes, onAlterado }: { situacoes: SituacaoTramo[]; onAlterado: () => void }) {
  const [novas, setNovas] = useState<Rascunho[]>([]);
  const ordenadas = [...situacoes].sort((a, b) => ETAPAS_TRAMO.indexOf(a.etapa) - ETAPAS_TRAMO.indexOf(b.etapa) || a.ordem - b.ordem);
  const novaOrdem = Math.max(0, ...situacoes.map(s => s.ordem)) + 10;

  return (
    <section className={`${cardCls} overflow-x-auto p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-50">Situações do tramo</h3>
          <p className="text-xs text-slate-500">O que aparece como opção ao apontar, por etapa, na ordem definida aqui.</p>
        </div>
        <button
          type="button"
          onClick={() => setNovas(n => [...n, { etapa: 'nav02', setor: '', atividade: '', categoriaEntrega: CATEGORIA_PADRAO.nav02, ordem: novaOrdem + n.length * 10, ativo: true }])}
          className={btnSecundario}
        >
          <Plus className="h-4 w-4" /> Nova situação
        </button>
      </div>
      <table className="mt-3 min-w-[40rem] text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 text-left">Etapa</th>
            <th className="py-1.5 text-left">Setor</th>
            <th className="py-1.5 text-left">Atividade</th>
            <th className="py-1.5 text-left">Ordem</th>
            <th className="py-1.5">Ativa</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(s => <Linha key={s.id} s={s} onSalvo={onAlterado} />)}
          {novas.map((s, i) => (
            <Linha
              key={`nova-${i}`}
              s={s}
              onSalvo={() => {
                setNovas(n => n.filter((_, j) => j !== i));
                onAlterado();
              }}
            />
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        {ETAPAS_TRAMO.map(e => (
          <span key={e} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_ETAPA[e].fundo }} />
            {CONFIG_ETAPA[e].rotulo}: {CONFIG_ETAPA[e].detalhe}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cadastro de Itens › "Log dos Jovens": o que cada Jovem Aprendiz fez no
 * catálogo (cadastro, alteração, foto, etiqueta) e as contagens que lançou no
 * Inventário Cíclico. Filtra por jovem, tipo e período; clicar no item abre o
 * detalhe dele no catálogo.
 */

import React, { useId, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Download, History } from 'lucide-react';
import Modal, { ModalBody, ModalHeader } from '../ui/Modal';
import { formatDateTimeBR } from '../../lib/format';
import { dataHojeLocal } from '../../lib/dataLocal';
import {
  jovensDaAtividade, resumoAtividade, resumoPorJovem, rotuloAcao, type AtividadeJovem,
} from '../../lib/almoxCatalogoLog';

interface Props {
  atividades: AtividadeJovem[];
  carregando: boolean;
  erro: string | null;
  onClose: () => void;
  /** Abre o item no catálogo (quando ele está na lista). */
  onAbrirItem: (codigoSap: string) => void;
}

type FiltroOrigem = 'todas' | 'cadastro' | 'contagem';

const campo: React.CSSProperties = {
  borderColor: 'var(--hairline)',
  background: 'var(--surface-raised)',
  color: 'var(--ink-primary)',
};

/** Dia local (AAAA-MM-DD) de um instante ISO, para o filtro de período. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function LogJovensModal({ atividades, carregando, erro, onClose, onAbrirItem }: Props) {
  const idJovem = useId();
  const idOrigem = useId();
  const idDe = useId();
  const idAte = useId();

  const [jovem, setJovem] = useState('todos');
  const [origem, setOrigem] = useState<FiltroOrigem>('todas');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const jovens = useMemo(() => jovensDaAtividade(atividades), [atividades]);

  const filtradas = useMemo(() => atividades.filter(a => {
    if (jovem !== 'todos' && a.usuario_id !== jovem) return false;
    if (origem !== 'todas' && a.origem !== origem) return false;
    const dia = diaLocal(a.ocorrido_em);
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  }), [atividades, jovem, origem, de, ate]);

  const placar = useMemo(() => resumoPorJovem(filtradas), [filtradas]);

  const exportarCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Data/hora', 'Jovem', 'Tipo', 'Ação', 'Código SAP', 'Descrição', 'Detalhe'].map(esc).join(';'),
      ...filtradas.map(a => [
        formatDateTimeBR(a.ocorrido_em), a.usuario_nome, a.origem === 'contagem' ? 'Contagem' : 'Cadastro',
        rotuloAcao(a.acao), a.codigo_sap, a.descricao, resumoAtividade(a),
      ].map(esc).join(';')),
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log_jovens_aprendizes_${dataHojeLocal()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel="Log dos Jovens Aprendizes">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Log dos Jovens Aprendizes</h2>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Cadastros, fotos, etiquetas e contagens de quem tem cargo de Jovem Aprendiz.
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label htmlFor={idJovem} className="mb-1 block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Jovem</label>
              <select id={idJovem} value={jovem} onChange={e => setJovem(e.target.value)} className="w-full rounded-lg border px-2.5 py-1.5 text-xs" style={campo}>
                <option value="todos">Todos ({jovens.length})</option>
                {jovens.map(j => <option key={j.id} value={j.id}>{j.nome}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={idOrigem} className="mb-1 block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Tipo</label>
              <select id={idOrigem} value={origem} onChange={e => setOrigem(e.target.value as FiltroOrigem)} className="w-full rounded-lg border px-2.5 py-1.5 text-xs" style={campo}>
                <option value="todas">Cadastro e contagem</option>
                <option value="cadastro">Só cadastro</option>
                <option value="contagem">Só contagem</option>
              </select>
            </div>
            <div>
              <label htmlFor={idDe} className="mb-1 block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>De</label>
              <input id={idDe} type="date" value={de} onChange={e => setDe(e.target.value)} className="w-full rounded-lg border px-2.5 py-1 text-xs" style={campo} />
            </div>
            <div>
              <label htmlFor={idAte} className="mb-1 block text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>Até</label>
              <input id={idAte} type="date" value={ate} onChange={e => setAte(e.target.value)} className="w-full rounded-lg border px-2.5 py-1 text-xs" style={campo} />
            </div>
          </div>

          {erro && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {erro}
            </p>
          )}

          {carregando && (
            <p className="py-6 text-center text-xs" style={{ color: 'var(--ink-muted)' }}>Carregando o log…</p>
          )}

          {!carregando && !erro && placar.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {placar.map(p => (
                <li key={p.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                  <p className="truncate text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>{p.nome}</p>
                  <p className="text-[11px] tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                    {p.itens} itens · {p.alteracoes} cadastros/alterações · {p.etiquetas} etiquetas · {p.contagens} contagens
                  </p>
                </li>
              ))}
            </ul>
          )}

          {!carregando && !erro && (
            <div className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--ink-secondary)' }}>
              <span><strong className="tabular-nums" style={{ color: 'var(--ink-primary)' }}>{filtradas.length}</strong> registros</span>
              {filtradas.length > 0 && (
                <button
                  type="button"
                  onClick={exportarCsv}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-bold cursor-pointer"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
                >
                  <Download className="h-3.5 w-3.5" /> Exportar CSV
                </button>
              )}
            </div>
          )}

          {!carregando && !erro && filtradas.length === 0 && (
            <p className="py-6 text-center text-xs italic" style={{ color: 'var(--ink-muted)' }}>
              Nenhuma atividade dos Jovens com esses filtros.
            </p>
          )}

          {!carregando && !erro && filtradas.length > 0 && (
            <ol className="divide-y rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
              {filtradas.map((a, i) => (
                <li key={`${a.ocorrido_em}-${a.codigo_sap}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-start sm:gap-3" style={{ borderColor: 'var(--hairline)' }}>
                  <span className="shrink-0 text-[11px] tabular-nums sm:w-32" style={{ color: 'var(--ink-muted)' }}>
                    {formatDateTimeBR(a.ocorrido_em)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs" style={{ color: 'var(--ink-primary)' }}>
                      <strong>{a.usuario_nome || '—'}</strong>{' '}
                      <span className={a.origem === 'contagem' ? 'text-sky-700 dark:text-sky-400' : 'text-violet-700 dark:text-violet-400'}>
                        {a.origem === 'contagem' && <ClipboardList className="mr-0.5 inline h-3 w-3" />}
                        {rotuloAcao(a.acao).toLowerCase()}
                      </span>
                    </p>
                    <button
                      type="button"
                      onClick={() => onAbrirItem(a.codigo_sap)}
                      className="block max-w-full truncate text-left text-xs hover:underline cursor-pointer"
                      style={{ color: 'var(--ink-secondary)' }}
                    >
                      <span className="font-mono font-bold">{a.codigo_sap}</span> — {a.descricao || 'sem descrição'}
                    </button>
                    {resumoAtividade(a) && (
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{resumoAtividade(a)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

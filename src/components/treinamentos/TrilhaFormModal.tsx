/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cadastro/edição de trilha de treinamento (admin ou flag `trein_gerenciar`).
 * O HTML vai para o bucket `treinamentos` e roda isolado num iframe sandbox;
 * para o progresso ser gravado ele precisa falar o protocolo descrito em
 * lib/treinamentos.ts (o mesmo da trilha PO.SUP-0004).
 */

import React from 'react';
import { FileCode2, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { localDb } from '../../db/localDb';
import { rotuloSetor } from './setoresVisual';
import { salvarTrilha, type DadosTrilha } from '../../lib/treinamentosApi';
import type { TrilhaTreinamento } from '../../lib/treinamentos';

interface Props {
  setorId: string;
  trilha?: TrilhaTreinamento;
  onClose: () => void;
  onSalvo: (t: TrilhaTreinamento) => void;
}

const LIMITE_ARQUIVO = 5 * 1024 * 1024;

const campo =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const rotulo = 'mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300';

export default function TrilhaFormModal({ setorId, trilha, onClose, onSalvo }: Props) {
  const toast = useToast();
  const setores = localDb.getSectors();
  const [dados, setDados] = React.useState<DadosTrilha>({
    setor_id: trilha?.setor_id ?? setorId,
    codigo: trilha?.codigo ?? '',
    titulo: trilha?.titulo ?? '',
    descricao: trilha?.descricao ?? '',
    revisao: trilha?.revisao ?? '',
    total_missoes: trilha?.total_missoes ?? 1,
    duracao_min: trilha?.duracao_min ?? null,
    ordem: trilha?.ordem ?? 0,
    ativo: trilha?.ativo ?? true,
  });
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const set = <K extends keyof DadosTrilha>(k: K, v: DadosTrilha[K]) => setDados(d => ({ ...d, [k]: v }));

  const escolherArquivo = (f: File | null) => {
    if (!f) { setArquivo(null); return; }
    if (!/\.html?$/i.test(f.name)) { toast.error('Envie o arquivo .html da trilha.'); return; }
    if (f.size > LIMITE_ARQUIVO) { toast.error('Arquivo acima de 5 MB.'); return; }
    setArquivo(f);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dados.codigo.trim() || !dados.titulo.trim()) { toast.error('Preencha código e título.'); return; }
    if (!Number.isInteger(dados.total_missoes) || dados.total_missoes < 1 || dados.total_missoes > 100) {
      toast.error('Número de missões entre 1 e 100.');
      return;
    }
    if (!trilha && !arquivo) { toast.error('Selecione o arquivo HTML da trilha.'); return; }
    setSalvando(true);
    try {
      const salvo = await salvarTrilha(
        {
          ...dados,
          codigo: dados.codigo.trim().toUpperCase(),
          titulo: dados.titulo.trim(),
          descricao: dados.descricao?.trim() || null,
          revisao: dados.revisao?.trim() || null,
        },
        arquivo,
        trilha,
      );
      toast.success(trilha ? 'Trilha atualizada.' : 'Trilha cadastrada.');
      onSalvo(salvo);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      toast.error(msg.includes('duplicate') ? 'Já existe uma trilha com esse código neste setor.' : `Não foi possível salvar: ${msg}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel={trilha ? 'Editar trilha' : 'Nova trilha'} disableOutsideClose={salvando}>
      <ModalHeader onClose={salvando ? undefined : onClose}>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{trilha ? 'Editar trilha' : 'Nova trilha de treinamento'}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">O progresso de cada colaborador é gravado no usuário dele.</p>
      </ModalHeader>
      <form onSubmit={salvar}>
        <ModalBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="tr-setor">Setor</label>
              <select id="tr-setor" className={campo} value={dados.setor_id} onChange={e => set('setor_id', e.target.value)}>
                {setores.map(s => <option key={s.id} value={s.id}>{rotuloSetor(s)}</option>)}
              </select>
            </div>
            <div>
              <label className={rotulo} htmlFor="tr-codigo">Procedimento-base (código)</label>
              <input id="tr-codigo" className={campo} value={dados.codigo} onChange={e => set('codigo', e.target.value)} placeholder="PO.SUP-0004" required />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
            <div>
              <label className={rotulo} htmlFor="tr-titulo">Título</label>
              <input id="tr-titulo" className={campo} value={dados.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Trilha de Compras" required />
            </div>
            <div>
              <label className={rotulo} htmlFor="tr-rev">Revisão</label>
              <input id="tr-rev" className={campo} value={dados.revisao ?? ''} onChange={e => set('revisao', e.target.value)} placeholder="Rev. 08" />
            </div>
          </div>
          <div>
            <label className={rotulo} htmlFor="tr-desc">Descrição</label>
            <textarea id="tr-desc" rows={3} className={campo} value={dados.descricao ?? ''} onChange={e => set('descricao', e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={rotulo} htmlFor="tr-missoes">Missões</label>
              <input id="tr-missoes" type="number" min={1} max={100} className={campo} value={dados.total_missoes} onChange={e => set('total_missoes', Number(e.target.value))} />
            </div>
            <div>
              <label className={rotulo} htmlFor="tr-dur">Duração (min)</label>
              <input id="tr-dur" type="number" min={1} className={campo} value={dados.duracao_min ?? ''} onChange={e => set('duracao_min', e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div>
              <label className={rotulo} htmlFor="tr-ordem">Ordem</label>
              <input id="tr-ordem" type="number" className={campo} value={dados.ordem} onChange={e => set('ordem', Number(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <span className={rotulo}>Arquivo da trilha (HTML)</span>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm transition hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800/50">
              <FileCode2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">
                {arquivo
                  ? arquivo.name
                  : trilha
                    ? `Atual: ${trilha.arquivo_path.split('/').pop()} — escolha outro para substituir`
                    : 'Selecionar arquivo .html'}
              </span>
              <input type="file" accept=".html,.htm,text/html" className="sr-only" onChange={e => escolherArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              A trilha roda isolada do SISTEN. Para gravar o progresso, ela deve avisar <code>pronta</code> e <code>missao-concluida</code> por postMessage (mesmo protocolo da trilha PO.SUP-0004).
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={dados.ativo} onChange={e => set('ativo', e.target.checked)} className="h-4 w-4 rounded" />
            Trilha ativa (visível para os colaboradores)
          </label>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} disabled={salvando} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {trilha ? 'Salvar' : 'Cadastrar trilha'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

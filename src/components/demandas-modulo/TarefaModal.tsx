/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe e edição de uma tarefa. Campos de texto/seleção salvam pelo botão
 * "Salvar"; checklist, anexos e comentários agem na hora.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Loader2, Check, Trash2, Paperclip, Plus, X, Send, AlertTriangle,
} from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import type { DemBucket, DemChecklistItem, DemQuadro, DemTarefa, DemTarefaAtividade, Profile } from '../../types';
import {
  atualizarTarefa, excluirTarefa, listarAtividades, adicionarComentario,
  uploadAnexo, removerAnexo, assinarAnexosDeTarefas,
} from '../../lib/demandasApi';
import { ACCEPT_ANEXO, MAX_ANEXOS } from '../../lib/imageCompression';
import { STATUS_LABEL, STATUS_ORDER, PRIORIDADE_LABEL, PRIORIDADE_ORDER, progressoChecklist } from '../../lib/demandasQuadro';
import { inputClass, labelClass, Avatar, useUsuarios } from './shared';
import AssigneePicker from './AssigneePicker';

interface Props {
  tarefa: DemTarefa;
  quadro: DemQuadro;
  buckets: DemBucket[];
  podeEditar: boolean;
  user: Profile;
  onClose: () => void;
  onSaved: (t: DemTarefa) => void;
  onDeleted: (id: string) => void;
}

export default function TarefaModal({ tarefa, quadro, buckets, podeEditar, user, onClose, onSaved, onDeleted }: Props) {
  const { porId } = useUsuarios();
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao || '');
  const [responsaveis, setResponsaveis] = useState<string[]>(tarefa.responsaveis);
  const [inicio, setInicio] = useState(tarefa.data_inicio || '');
  const [venc, setVenc] = useState(tarefa.data_vencimento || '');
  const [status, setStatus] = useState(tarefa.status);
  const [prioridade, setPrioridade] = useState(tarefa.prioridade);
  const [bucketId, setBucketId] = useState(tarefa.bucket_id || '');
  const [checklist, setChecklist] = useState<DemChecklistItem[]>(tarefa.checklist);
  const [anexos, setAnexos] = useState(tarefa.anexos);
  const [novoItem, setNovoItem] = useState('');
  const [atividades, setAtividades] = useState<DemTarefaAtividade[]>([]);
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tarefaRef = useRef(tarefa);
  tarefaRef.current = { ...tarefa, checklist, anexos };

  useEffect(() => {
    (async () => {
      try {
        setAtividades(await listarAtividades(tarefa.id));
        const [assinada] = await assinarAnexosDeTarefas([{ ...tarefa, anexos }]);
        if (assinada) setAnexos(assinada.anexos);
      } catch { /* silencioso */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa.id]);

  const prog = progressoChecklist(checklist);

  const salvar = async () => {
    setSalvando(true); setErro('');
    try {
      const atualizada = await atualizarTarefa(tarefaRef.current, {
        titulo, descricao, responsaveis,
        data_inicio: inicio || null, data_vencimento: venc || null,
        status, prioridade, bucket_id: bucketId || null,
      }, user);
      onSaved(atualizada);
      setAtividades(await listarAtividades(tarefa.id));
    } catch (e: any) {
      setErro(e?.message || 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  /** Grava só o checklist (chamado ao marcar/adicionar/remover item). */
  const persistirChecklist = async (proximo: DemChecklistItem[]) => {
    setChecklist(proximo);
    try {
      const atualizada = await atualizarTarefa({ ...tarefaRef.current, checklist }, { checklist: proximo }, user);
      onSaved(atualizada);
    } catch { setErro('Falha ao salvar o checklist.'); }
  };

  const addChecklist = () => {
    const texto = novoItem.trim();
    if (!texto) return;
    setNovoItem('');
    persistirChecklist([...checklist, { id: Math.random().toString(36).slice(2, 9), texto, feito: false }]);
  };

  const anexar = async (files: FileList | null) => {
    if (!files?.length) return;
    if (anexos.length >= MAX_ANEXOS) { setErro(`Máximo de ${MAX_ANEXOS} anexos.`); return; }
    setErro('');
    try {
      const atualizada = await uploadAnexo({ ...tarefaRef.current, anexos }, files[0]);
      setAnexos(atualizada.anexos);
      onSaved(atualizada);
    } catch (e: any) {
      setErro(e?.message || 'Falha no anexo.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const enviarComentario = async () => {
    const texto = comentario.trim();
    if (!texto) return;
    setComentario('');
    try {
      await adicionarComentario(tarefa.id, texto, user);
      setAtividades(await listarAtividades(tarefa.id));
    } catch { setErro('Falha ao comentar.'); }
  };

  const excluir = async () => {
    setSalvando(true);
    try { await excluirTarefa(tarefa.id, user); onDeleted(tarefa.id); }
    catch (e: any) { setErro(e?.message || 'Falha ao excluir.'); setSalvando(false); }
  };

  const ro = !podeEditar;

  return (
    <Modal onClose={onClose} ariaLabel="Tarefa" maxWidth="max-w-2xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          {tarefa.codigo && <span className="font-mono text-[11px] font-black" style={{ color: 'var(--brand-strong)' }}>{tarefa.codigo}</span>}
          <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{quadro.nome}</span>
        </div>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Detalhe da tarefa</h2>
      </ModalHeader>

      <ModalBody className="space-y-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Título</label>
          <input value={titulo} disabled={ro} onChange={e => setTitulo(e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelClass}>Coluna (bucket)</label>
            <select value={bucketId} disabled={ro} onChange={e => setBucketId(e.target.value)} className={`${inputClass} cursor-pointer`}>
              <option value="">Sem coluna</option>
              {buckets.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Status</label>
            <select value={status} disabled={ro} onChange={e => setStatus(e.target.value as any)} className={`${inputClass} cursor-pointer`}>
              {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>Prioridade</label>
            <select value={prioridade} disabled={ro} onChange={e => setPrioridade(e.target.value as any)} className={`${inputClass} cursor-pointer`}>
              {PRIORIDADE_ORDER.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className={labelClass}>Início</label>
              <input type="date" value={inicio} disabled={ro} onChange={e => setInicio(e.target.value)} className={`${inputClass} cursor-pointer`} />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Vencimento</label>
              <input type="date" value={venc} disabled={ro} onChange={e => setVenc(e.target.value)} className={`${inputClass} cursor-pointer`} />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Responsáveis</label>
          <AssigneePicker selected={responsaveis} onChange={setResponsaveis} disabled={ro} />
        </div>

        <div className="space-y-1.5">
          <label className={labelClass}>Descrição</label>
          <textarea rows={3} value={descricao} disabled={ro} onChange={e => setDescricao(e.target.value)} className={`${inputClass} resize-none`} />
        </div>

        {/* Checklist */}
        <div className="space-y-1.5">
          <label className={labelClass}>Checklist {prog.total > 0 && <span style={{ color: 'var(--ink-muted)' }}>· {prog.feitos}/{prog.total}</span>}</label>
          <div className="space-y-1">
            {checklist.map(item => (
              <div key={item.id} className="flex items-center gap-2 group">
                <button
                  type="button" disabled={ro}
                  onClick={() => persistirChecklist(checklist.map(i => i.id === item.id ? { ...i, feito: !i.feito } : i))}
                  className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${item.feito ? 'bg-[var(--status-good)] border-[var(--status-good)]' : 'border-slate-300 dark:border-slate-600'}`}
                >
                  {item.feito && <Check className="h-3 w-3 text-white" />}
                </button>
                <span className={`flex-1 text-sm ${item.feito ? 'line-through opacity-60' : ''}`} style={{ color: 'var(--ink-secondary)' }}>{item.texto}</span>
                {!ro && (
                  <button type="button" onClick={() => persistirChecklist(checklist.filter(i => i.id !== item.id))} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[var(--status-critical)]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!ro && (
            <div className="flex items-center gap-2">
              <input
                value={novoItem} onChange={e => setNovoItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklist(); } }}
                placeholder="Adicionar item" className={`${inputClass} py-1.5 text-xs`}
              />
              <button type="button" onClick={addChecklist} className="shrink-0 rounded-lg p-1.5" style={{ background: 'var(--surface-sunken)', color: 'var(--ink-secondary)' }}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Anexos */}
        <div className="space-y-1.5">
          <label className={labelClass}>Anexos <span style={{ color: 'var(--ink-muted)' }}>· {anexos.length}/{MAX_ANEXOS}</span></label>
          <div className="space-y-1">
            {anexos.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <Paperclip className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--ink-muted)' }} />
                {a.preview_url
                  ? <a href={a.preview_url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline" style={{ color: 'var(--brand-strong)' }}>{a.name}</a>
                  : <span className="flex-1 truncate" style={{ color: 'var(--ink-secondary)' }}>{a.name}</span>}
                {!ro && (
                  <button
                    type="button"
                    onClick={async () => { const at = await removerAnexo({ ...tarefaRef.current, anexos }, a); setAnexos(at.anexos); onSaved(at); }}
                    className="text-slate-400 hover:text-[var(--status-critical)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!ro && anexos.length < MAX_ANEXOS && (
            <>
              <input ref={fileRef} type="file" accept={ACCEPT_ANEXO} className="hidden" onChange={e => anexar(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                <Paperclip className="h-3.5 w-3.5" /> Anexar arquivo
              </button>
            </>
          )}
        </div>

        {/* Atividade */}
        <div className="space-y-2 pt-1">
          <label className={labelClass}>Atividade</label>
          {!ro && (
            <div className="flex items-center gap-2">
              <input
                value={comentario} onChange={e => setComentario(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enviarComentario(); } }}
                placeholder="Escrever um comentário" className={`${inputClass} py-2`}
              />
              <button type="button" onClick={enviarComentario} className="shrink-0 rounded-lg p-2" style={{ background: 'var(--brand)', color: '#fff' }}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="space-y-2">
            {atividades.map(a => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <Avatar nome={a.criado_por_nome || 'Sistema'} size={20} />
                <div className="min-w-0 flex-1">
                  <p style={{ color: 'var(--ink-secondary)' }}>
                    <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{a.criado_por_nome || 'Sistema'}</span>
                    {a.tipo === 'sistema' && <span style={{ color: 'var(--ink-muted)' }}> · {a.texto}</span>}
                  </p>
                  {a.tipo === 'comentario' && <p style={{ color: 'var(--ink-secondary)' }}>{a.texto}</p>}
                  <p style={{ color: 'var(--ink-muted)' }}>{new Date(a.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            ))}
            {atividades.length === 0 && <p className="text-xs italic" style={{ color: 'var(--ink-muted)' }}>Sem atividade ainda.</p>}
          </div>
        </div>

        {erro && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{erro}</span>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {podeEditar && (confirmarExcluir ? (
          <div className="mr-auto flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--status-critical)' }}>Excluir esta tarefa?</span>
            <button type="button" onClick={excluir} className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white">Sim</button>
            <button type="button" onClick={() => setConfirmarExcluir(false)} className="rounded-lg px-2.5 py-1 font-semibold" style={{ background: 'var(--surface-sunken)' }}>Não</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmarExcluir(true)} className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </button>
        ))}
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
          Fechar
        </button>
        {podeEditar && (
          <button type="button" onClick={salvar} disabled={salvando || !titulo.trim()} className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Salvar
          </button>
        )}
      </ModalFooter>
    </Modal>
  );
}

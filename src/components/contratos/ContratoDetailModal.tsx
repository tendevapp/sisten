/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Detalhe/edição de um contrato (ME3N).
 *
 * Só os campos complementares (não vindos do SAP) são editáveis — Gestor,
 * Escopo, PO, Código do Fornecedor, Parcela, Modalidade, Vigência (rótulo) e
 * Status. Os demais (fornecedor, datas, valores) vêm do ME3N e são somente
 * leitura aqui; para mudá-los é preciso reimportar do SAP.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2, Calendar, User, FileText, DollarSign, Check, Loader2, AlertTriangle,
  Paperclip, X, ImageIcon, Package, Camera,
} from 'lucide-react';
import { localDb } from '../../db/localDb';
import { ContratoAnexo, ContratoDetalhes, ContratoStatus } from '../../types';
import { ContratoComDetalhes } from '../../lib/contratos';
import { usePonteiroGrosso } from '../../lib/usePonteiroGrosso';
import { formatBRL, formatDateBR, formatFileSize } from '../../lib/format';
import { useToast } from '../ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import {
  prepareAttachment, AnexoInvalidoError, PreparedAttachment, ACCEPT_ANEXO, MAX_ANEXOS,
} from '../../lib/imageCompression';

const MODALIDADE_OPCOES = ['Anual', 'Mensal', 'Por Demanda'];
const STATUS_OPCOES: ContratoStatus[] = ['Ativo', 'Inativo', 'Em Processamento'];

interface ContratoDetailModalProps {
  contrato: ContratoComDetalhes;
  onClose: () => void;
  onSaved: (detalhes: ContratoDetalhes) => void;
}

function Campo({ label, icon: Icon, value }: { label: string; icon: React.ComponentType<{ className?: string }>; value: React.ReactNode }) {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
        <Icon className="h-3 w-3" /> {label}
      </span>
      <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink-primary)' }}>{value}</p>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-55 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all';
const labelClass = 'text-sm font-semibold text-slate-700 dark:text-slate-300';

export default function ContratoDetailModal({ contrato, onClose, onSaved }: ContratoDetailModalProps) {
  const toast = useToast();
  const d = contrato.detalhes;

  const [gestor, setGestor] = useState(d?.gestor || '');
  const [escopo, setEscopo] = useState(d?.escopo_servico || '');
  const [poPedido, setPoPedido] = useState(d?.po_pedido_compra || '');
  const [codigoFornecedor, setCodigoFornecedor] = useState(d?.codigo_fornecedor || '');
  const [valorParcela, setValorParcela] = useState(d?.valor_parcela != null ? String(d.valor_parcela) : '');
  const [modalidade, setModalidade] = useState(d?.modalidade || '');
  const [vigenciaLabel, setVigenciaLabel] = useState(d?.vigencia_label || '');
  const [status, setStatus] = useState<ContratoStatus>(d?.status || contrato.status_exibido);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const patch: ContratoDetalhes = {
        documento_compras: contrato.documento_compras,
        gestor: gestor.trim() || null,
        escopo_servico: escopo.trim() || null,
        po_pedido_compra: poPedido.trim() || null,
        codigo_fornecedor: codigoFornecedor.trim() || null,
        valor_parcela: valorParcela.trim() ? Number(valorParcela) : null,
        modalidade: modalidade || null,
        vigencia_label: vigenciaLabel.trim() || null,
        status,
      };
      const salvo = await localDb.saveContratoDetalhes(patch);
      toast.success('Contrato atualizado.');
      onSaved(salvo);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar as alterações do contrato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Detalhes do Contrato" maxWidth="max-w-3xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Contrato {contrato.documento_compras}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{contrato.fornecedor}</p>
          </div>
        </div>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-6">
          {/* Dados do SAP — somente leitura */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dados do SAP (ME3N)</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Campo label="Fornecedor" icon={Building2} value={contrato.fornecedor} />
              <Campo label="Centro" icon={Building2} value={contrato.centro} />
              <Campo label="Requisitante" icon={User} value={contrato.requisitante} />
              <Campo label="Início do Contrato" icon={Calendar} value={formatDateBR(contrato.inicio_validade)} />
              <Campo label="Final do Contrato" icon={Calendar} value={formatDateBR(contrato.fim_validade)} />
              <Campo label="Valor Global" icon={DollarSign} value={formatBRL(contrato.valor_efetivo)} />
              <Campo label="Valor Pendente" icon={DollarSign} value={formatBRL(contrato.valor_pendente)} />
              <Campo label="Moeda" icon={DollarSign} value={contrato.moeda} />
              <Campo label="Itens do contrato" icon={Package} value={contrato.itens.length} />
            </div>

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left uppercase tracking-wider" style={{ color: 'var(--ink-muted)', background: 'var(--surface-raised)' }}>
                    <th className="py-1.5 px-2.5 font-bold">Item</th>
                    <th className="py-1.5 px-2.5 font-bold">Material</th>
                    <th className="py-1.5 px-2.5 font-bold">Texto Breve</th>
                    <th className="py-1.5 px-2.5 font-bold text-right">Valor Efetivo</th>
                    <th className="py-1.5 px-2.5 font-bold text-right">Valor Pendente</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                  {contrato.itens.map((it, idx) => (
                    <tr key={`${it.id}-${idx}`}>
                      <td className="py-1.5 px-2.5 font-mono" style={{ color: 'var(--ink-secondary)' }}>{it.item || '—'}</td>
                      <td className="py-1.5 px-2.5 font-mono" style={{ color: 'var(--ink-secondary)' }}>{it.material || '—'}</td>
                      <td className="py-1.5 px-2.5 truncate max-w-[220px]" style={{ color: 'var(--ink-secondary)' }} title={it.texto_breve || ''}>{it.texto_breve || '—'}</td>
                      <td className="py-1.5 px-2.5 text-right tabular" style={{ color: 'var(--ink-secondary)' }}>{formatBRL(it.valor_efetivo)}</td>
                      <td className="py-1.5 px-2.5 text-right tabular font-semibold" style={{ color: 'var(--ink-primary)' }}>{formatBRL(it.valor_pendente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Campos complementares — editáveis */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gestão do Contrato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="ctr_gestor" className={labelClass}>Gestor</label>
                <input id="ctr_gestor" type="text" value={gestor} onChange={e => setGestor(e.target.value)} placeholder="Nome do gestor do contrato" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ctr_status" className={labelClass}>Status</label>
                <select id="ctr_status" value={status} onChange={e => setStatus(e.target.value as ContratoStatus)} className={`${inputClass} appearance-none cursor-pointer`}>
                  {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="ctr_escopo" className={labelClass}>Escopo do Serviço</label>
                <textarea id="ctr_escopo" rows={2} value={escopo} onChange={e => setEscopo(e.target.value)} placeholder="Descreva o escopo do serviço/fornecimento" className={`${inputClass} resize-none`} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ctr_po" className={labelClass}>PO - Pedido de Compra</label>
                <input id="ctr_po" type="text" value={poPedido} onChange={e => setPoPedido(e.target.value)} placeholder="Ex.: 4700377396" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ctr_cod_forn" className={labelClass}>Código do Fornecedor</label>
                <input id="ctr_cod_forn" type="text" value={codigoFornecedor} onChange={e => setCodigoFornecedor(e.target.value)} placeholder="Ex.: 1000067374" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ctr_parcela" className={labelClass}>Parcela (R$)</label>
                <input id="ctr_parcela" type="number" step="0.01" value={valorParcela} onChange={e => setValorParcela(e.target.value)} placeholder="0,00" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ctr_modalidade" className={labelClass}>Modalidade</label>
                <select id="ctr_modalidade" value={modalidade} onChange={e => setModalidade(e.target.value)} className={`${inputClass} appearance-none cursor-pointer`}>
                  <option value="">— Selecione —</option>
                  {MODALIDADE_OPCOES.map(m => <option key={m} value={m}>{m}</option>)}
                  {modalidade && !MODALIDADE_OPCOES.includes(modalidade) && <option value={modalidade}>{modalidade}</option>}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="ctr_vigencia" className={labelClass}>Vigência do Contrato</label>
                <input id="ctr_vigencia" type="text" value={vigenciaLabel} onChange={e => setVigenciaLabel(e.target.value)} placeholder="Ex.: 7° Aditivo, Contrato original..." className={inputClass} />
              </div>
            </div>
          </div>

          {/* Anexos */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Documentos Anexados</h3>
            <AnexosContrato documentoCompras={contrato.documento_compras} />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3.5 py-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Fechar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-sm"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------------- */
/* Anexos — upload imediato por arquivo, sem depender do "Salvar" do form */
/* --------------------------------------------------------------------- */

const ehPdf = (mime?: string) => mime === 'application/pdf';

function AnexosContrato({ documentoCompras }: { documentoCompras: string }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const ehTouch = usePonteiroGrosso();
  const [anexos, setAnexos] = useState<ContratoAnexo[]>(() => localDb.getContratoAnexos(documentoCompras));
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const lista = localDb.getContratoAnexos(documentoCompras);
    setAnexos(lista);
    const resolvidas: Record<string, string> = {};
    for (const a of lista) {
      const url = await localDb.getAttachmentUrl(a.storage_path);
      if (url) resolvidas[a.id] = url;
    }
    setUrls(resolvidas);
  }, [documentoCompras]);

  useEffect(() => {
    localDb.fetchContratoAnexos().then(refresh).catch(() => refresh());
  }, [documentoCompras, refresh]);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, MAX_ANEXOS - anexos.length));
    e.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    const prepared: PreparedAttachment[] = [];
    const erros: string[] = [];
    for (const file of files) {
      try {
        prepared.push(await prepareAttachment(file));
      } catch (err) {
        erros.push(err instanceof AnexoInvalidoError ? `${file.name}: ${err.message}` : `${file.name}: falha ao processar.`);
      }
    }

    if (prepared.length > 0) {
      const { uploaded, failed } = await localDb.uploadContratoAnexos(documentoCompras, prepared);
      if (uploaded > 0) toast.success(`${uploaded} documento(s) anexado(s).`);
      failed.forEach(name => erros.push(`${name}: falha ao enviar.`));
      await refresh();
    }
    if (erros.length > 0) toast.error(erros.join(' '));
    setUploading(false);
  };

  const handleDelete = async (anexo: ContratoAnexo) => {
    if (!window.confirm(`Excluir "${anexo.name}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindo(anexo.id);
    const erro = await localDb.deleteContratoAnexo(anexo.id);
    setExcluindo(null);
    if (erro) { toast.error(erro); return; }
    setAnexos(prev => prev.filter(a => a.id !== anexo.id));
  };

  const cheio = anexos.length >= MAX_ANEXOS;

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept={ACCEPT_ANEXO} multiple className="hidden" onChange={handleSelect} />
      {/* Input separado só para a câmera (capture é fixo no elemento). Só aparece
          em aparelho tocado — ver usePonteiroGrosso. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleSelect} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={cheio || uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? 'Enviando…' : cheio ? `Limite de ${MAX_ANEXOS} anexos` : 'Anexar imagem ou PDF'}
        </button>

        {ehTouch && (
          <button
            type="button"
            disabled={cheio || uploading}
            onClick={() => cameraRef.current?.click()}
            title="Tirar foto agora"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
          >
            <Camera className="h-3.5 w-3.5" />
            Tirar foto
          </button>
        )}
      </div>

      {anexos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {anexos.map(a => {
            const url = urls[a.id];
            const conteudo = ehPdf(a.mime_type) ? (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--hairline)', background: 'var(--brand-wash)', color: 'var(--brand-strong)' }}>
                <FileText className="h-5 w-5" />
              </span>
            ) : url ? (
              <img src={url} alt={a.name} className="h-14 w-14 rounded-lg border object-cover" style={{ borderColor: 'var(--hairline)' }} />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-lg border" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                <ImageIcon className="h-5 w-5 opacity-40" />
              </span>
            );

            return (
              <li key={a.id} className="relative">
                <a href={url || undefined} target="_blank" rel="noopener noreferrer" title={`${a.name} — ${formatFileSize(a.size)}`} className="block cursor-pointer transition-opacity hover:opacity-80">
                  {conteudo}
                </a>
                <button
                  type="button"
                  disabled={excluindo === a.id}
                  aria-label={`Excluir ${a.name}`}
                  title="Excluir anexo"
                  onClick={() => handleDelete(a)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border text-white shadow-sm transition-opacity disabled:opacity-50"
                  style={{ background: '#dc2626', borderColor: '#fff' }}
                >
                  {excluindo === a.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {anexos.length === 0 && (
        <p className="text-[11px] italic" style={{ color: 'var(--ink-secondary)' }}>Nenhum documento anexado.</p>
      )}
    </div>
  );
}

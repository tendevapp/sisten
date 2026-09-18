/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — Formulário de abertura de RNC (Relatório de Não
 * Conformidade), campos no padrão do FRM.QUA-0026 (Qualiex): identificação,
 * origem, descrição e anexos. Anexo aceita qualquer tipo de arquivo (fotos,
 * PDF de boletim/RFI, planilha de medição, ZIP) — só a imagem é comprimida
 * (`uploadAnexoRnc`, regra 1 do CLAUDE.md); os demais tipos sobem como estão.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, Paperclip, Save, Upload, X } from 'lucide-react';
import type { Profile, QuaRncOrigem } from '../../types';
import * as api from '../../lib/qualidadeApi';
import { useToast } from '../ui/Toast';

/** Sem restrição de tipo — o usuário decide o que conta como evidência da NC. */
const MAX_ANEXOS_RNC = 30;

interface QualidadeRncFormProps {
  user: Profile;
  onSuccess: () => void;
}

interface CampoComSugestoes {
  campo: 'area_geradora' | 'fornecedor' | 'tipo_nc' | 'cliente' | 'projeto';
  label: string;
  placeholder: string;
}

const CAMPOS_SUGERIDOS: CampoComSugestoes[] = [
  { campo: 'area_geradora', label: 'Área Geradora da NC', placeholder: 'Ex.: Controle da Qualidade' },
  { campo: 'fornecedor', label: 'Fornecedor', placeholder: 'Ex.: Atlanta Indústria Metalúrgica' },
  { campo: 'tipo_nc', label: 'Tipo de Não Conformidade', placeholder: 'Ex.: Material recebido com desvio' },
  { campo: 'cliente', label: 'Cliente', placeholder: 'Ex.: Goldwind' },
  { campo: 'projeto', label: 'Projeto', placeholder: 'Ex.: GW5S120M-001' },
];

const estadoInicial = (userName: string) => ({
  numero_rnc_externo: '',
  emissor_nome: userName.toUpperCase(),
  data_emissao: new Date().toISOString().slice(0, 10),
  data_ocorrencia: '',
  origem_nc: 'FORNECEDOR' as QuaRncOrigem,
  documento_origem: '',
  area_geradora: '',
  fornecedor: '',
  numero_pedido_compra: '',
  tipo_nc: '',
  cliente: '',
  projeto: '',
  responsavel_nome: '',
  tramo_sequencial: '',
  descricao: '',
});

export default function QualidadeRncForm({ user, onSuccess }: QualidadeRncFormProps) {
  const toast = useToast();
  const [form, setForm] = useState(estadoInicial(user.name));
  const [anexos, setAnexos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all(CAMPOS_SUGERIDOS.map((c) => api.buscarHistoricoCampoRnc(c.campo).then((v) => [c.campo, v] as const)))
      .then((pares) => setSugestoes(Object.fromEntries(pares)))
      .catch(() => {});
  }, []);

  const alterar = (campo: keyof ReturnType<typeof estadoInicial>, valor: string) => {
    const camposLivres = ['descricao'];
    setForm((prev) => ({ ...prev, [campo]: camposLivres.includes(campo) ? valor : valor.toUpperCase() }));
  };

  const adicionarArquivos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const restante = MAX_ANEXOS_RNC - anexos.length;
    if (restante <= 0) {
      toast.warning(`Limite de ${MAX_ANEXOS_RNC} anexos por RNC.`);
      return;
    }
    const novos = Array.from(files).slice(0, restante);
    setAnexos((prev) => [...prev, ...novos]);
    setPreviews((prev) => [...prev, ...novos.map((f) => URL.createObjectURL(f))]);
  };

  const removerArquivo = (idx: number) => {
    URL.revokeObjectURL(previews[idx]);
    setAnexos((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const podeSalvar = useMemo(
    () => form.emissor_nome.trim() && form.descricao.trim().length > 0 && !salvando,
    [form, salvando]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descricao.trim()) {
      toast.error('Descreva a não conformidade identificada.');
      return;
    }

    setSalvando(true);
    try {
      await api.criarRnc(
        {
          numero_rnc_externo: form.numero_rnc_externo || null,
          emissor_id: user.id,
          emissor_nome: form.emissor_nome,
          data_emissao: form.data_emissao,
          data_ocorrencia: form.data_ocorrencia || null,
          origem_nc: form.origem_nc,
          documento_origem: form.documento_origem || null,
          area_geradora: form.area_geradora || null,
          fornecedor: form.fornecedor || null,
          numero_pedido_compra: form.numero_pedido_compra || null,
          tipo_nc: form.tipo_nc || null,
          cliente: form.cliente || null,
          projeto: form.projeto || null,
          responsavel_id: null,
          responsavel_nome: form.responsavel_nome || null,
          tramo_sequencial: form.tramo_sequencial || null,
          descricao: form.descricao,
          criado_por: user.id,
          criado_por_nome: user.name,
        },
        anexos
      );

      toast.success('RNC registrada com sucesso!');
      previews.forEach((p) => URL.revokeObjectURL(p));
      setForm(estadoInicial(user.name));
      setAnexos([]);
      setPreviews([]);
      onSuccess();
    } catch (err: any) {
      toast.error(`Erro ao registrar RNC: ${err.message || ''}`);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Identificação</h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Nº RNC (Qualiex / externo)
            </label>
            <input
              type="text"
              value={form.numero_rnc_externo}
              onChange={(e) => alterar('numero_rnc_externo', e.target.value)}
              placeholder="Ex.: RNC-2447/2026"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">Emissor *</label>
            <input
              type="text"
              required
              value={form.emissor_nome}
              onChange={(e) => alterar('emissor_nome', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">Responsável</label>
            <input
              type="text"
              value={form.responsavel_nome}
              onChange={(e) => alterar('responsavel_nome', e.target.value)}
              placeholder="Responsável pela disposição"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Data de Emissão
            </label>
            <input
              type="date"
              value={form.data_emissao}
              onChange={(e) => setForm((prev) => ({ ...prev, data_emissao: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Data da Ocorrência
            </label>
            <input
              type="date"
              value={form.data_ocorrencia}
              onChange={(e) => setForm((prev) => ({ ...prev, data_ocorrencia: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Origem da NC
            </label>
            <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {(['PROCESSO', 'FORNECEDOR'] as QuaRncOrigem[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, origem_nc: o }))}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                    form.origem_nc === o
                      ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {o === 'PROCESSO' ? 'Processo' : 'Fornecedor'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Documento de Origem
            </label>
            <input
              type="text"
              value={form.documento_origem}
              onChange={(e) => alterar('documento_origem', e.target.value)}
              placeholder="Ex.: PO.QUA-0003"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Nº Pedido de Compra
            </label>
            <input
              type="text"
              value={form.numero_pedido_compra}
              onChange={(e) => alterar('numero_pedido_compra', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Tramo / Sequencial
            </label>
            <input
              type="text"
              value={form.tramo_sequencial}
              onChange={(e) => alterar('tramo_sequencial', e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          {CAMPOS_SUGERIDOS.map((c) => (
            <div key={c.campo}>
              <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {c.label}
              </label>
              <input
                type="text"
                list={`qua-sugestoes-${c.campo}`}
                value={(form as any)[c.campo]}
                onChange={(e) => alterar(c.campo, e.target.value)}
                placeholder={c.placeholder}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <datalist id={`qua-sugestoes-${c.campo}`}>
                {(sugestoes[c.campo] || []).map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Descrição da Não Conformidade *</h3>
        <textarea
          required
          rows={5}
          value={form.descricao}
          onChange={(e) => alterar('descricao', e.target.value)}
          placeholder="Descreva o desvio identificado, dimensões esperadas x encontradas, peças/lote afetados e impacto..."
          className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Anexos / Evidências ({anexos.length}/{MAX_ANEXOS_RNC})
          </h3>
          <div className="flex gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <Camera className="h-3.5 w-3.5 text-rose-600" />
              Câmera
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  adicionarArquivos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <Upload className="h-3.5 w-3.5 text-rose-600" />
              Arquivo (qualquer tipo)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  adicionarArquivos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {anexos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {anexos.map((file, idx) => (
              <div
                key={idx}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950"
              >
                {file.type.startsWith('image/') ? (
                  <img src={previews[idx]} alt={file.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                    <Paperclip className="h-5 w-5 text-slate-400" />
                    <span className="line-clamp-2 text-[9px] text-slate-500">{file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removerArquivo(idx)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!podeSalvar}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Registrar RNC
        </button>
      </div>
    </form>
  );
}

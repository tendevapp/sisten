/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — Seleção de RNCs e campos para o relatório consolidado em
 * PDF ("Apanhado Geral de Não Conformidades"): o usuário decide quais RNCs e
 * quais seções (identificação, descrição, plano de ação, fotos) entram.
 */

import React, { useMemo, useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import type { QuaRnc, QuaRelatorioCampos } from '../../types';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { exportRncConsolidadoPdf, CAMPOS_RELATORIO_PADRAO } from '../../lib/pdfExport/exportQualidadeRncPdf';

interface QualidadeRelatorioSelecaoModalProps {
  rncsDisponiveis: QuaRnc[];
  selecaoInicial: string[];
  onClose: () => void;
}

const OPCOES_CAMPOS: { campo: keyof QuaRelatorioCampos; label: string }[] = [
  { campo: 'identificacao', label: 'Identificação (emissor, fornecedor, pedido, projeto...)' },
  { campo: 'descricao', label: 'Descrição da não conformidade' },
  { campo: 'planoAcao', label: 'Plano de ação (atividades, prazos e status)' },
  { campo: 'fotos', label: 'Evidências fotográficas (uma página por foto)' },
];

export default function QualidadeRelatorioSelecaoModal({
  rncsDisponiveis, selecaoInicial, onClose,
}: QualidadeRelatorioSelecaoModalProps) {
  const toast = useToast();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(selecaoInicial));
  const [campos, setCampos] = useState<QuaRelatorioCampos>(CAMPOS_RELATORIO_PADRAO);
  const [gerando, setGerando] = useState(false);

  const toggleRnc = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const rncsSelecionadas = useMemo(
    () => rncsDisponiveis.filter((r) => selecionados.has(r.id)),
    [rncsDisponiveis, selecionados]
  );

  const handleGerar = async () => {
    if (rncsSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma RNC para gerar o relatório.');
      return;
    }
    setGerando(true);
    try {
      await exportRncConsolidadoPdf(rncsSelecionadas, campos);
      toast.success(`Relatório consolidado de ${rncsSelecionadas.length} RNC(s) gerado!`);
      onClose();
    } catch (err: any) {
      toast.error(`Erro ao gerar relatório consolidado: ${err.message || ''}`);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl" ariaLabel="Gerar Relatório Consolidado de RNCs">
      <ModalHeader onClose={onClose}>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Relatório Consolidado de RNCs</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Escolha as RNCs e os campos que devem compor o PDF consolidado.
        </p>
      </ModalHeader>

      <ModalBody>
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Campos a incluir
            </h3>
            <div className="space-y-2">
              {OPCOES_CAMPOS.map((op) => (
                <label
                  key={op.campo}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={campos[op.campo]}
                    onChange={(e) => setCampos((prev) => ({ ...prev, [op.campo]: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  {op.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
              RNCs selecionadas
              <span className="text-rose-600 dark:text-rose-400">{rncsSelecionadas.length} de {rncsDisponiveis.length}</span>
            </h3>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {rncsDisponiveis.map((rnc) => (
                <label
                  key={rnc.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={selecionados.has(rnc.id)}
                    onChange={() => toggleRnc(rnc.id)}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  />
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{rnc.numero_registro}</span>
                  <span className="truncate text-slate-500 dark:text-slate-400">
                    {rnc.fornecedor || rnc.cliente || '-'} — {rnc.descricao}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleGerar}
          disabled={gerando || rncsSelecionadas.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
        >
          {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          Gerar PDF Consolidado
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Qualidade — Modal de detalhes de uma RNC: identificação, descrição,
 * anexos, plano de ação e exportação do relatório individual em PDF.
 */

import React, { useEffect, useState } from 'react';
import {
  FileDown, Paperclip, Trash2, RotateCcw, Loader2, Info, ListChecks,
} from 'lucide-react';
import type { Profile, QuaRnc, QuaPlanoAcaoAtividade } from '../../types';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';
import { BadgeExcluido } from '../ui/ExcluidosControls';
import { useLightbox } from '../ui/Lightbox';
import { useToast } from '../ui/Toast';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { exportRncPdf } from '../../lib/pdfExport/exportQualidadeRncPdf';
import { renovarUrlsAnexos } from '../../lib/qualidadeApi';
import QualidadePlanoAcaoEditor from './QualidadePlanoAcaoEditor';

interface QualidadeRncDetalhesModalProps {
  rnc: QuaRnc;
  user: Profile;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onAtualizado: (rnc: QuaRnc) => void;
}

const STATUS_LABEL: Record<QuaRnc['status'], string> = {
  ABERTA: 'Aberta',
  EM_TRATAMENTO: 'Em Tratamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const STATUS_COR: Record<QuaRnc['status'], string> = {
  ABERTA: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300',
  EM_TRATAMENTO: 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300',
  CANCELADA: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatDataBR(iso?: string | null): string {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function QualidadeRncDetalhesModal({
  rnc, user, onClose, onDelete, onRestore, onAtualizado,
}: QualidadeRncDetalhesModalProps) {
  const toast = useToast();
  const lightbox = useLightbox();
  const [aba, setAba] = useState<'detalhes' | 'plano_acao'>('detalhes');
  const [exportando, setExportando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [rncAtual, setRncAtual] = useState(rnc);

  const podeEditar = podeEditarFormulario(user, { criado_por: rncAtual.criado_por });
  const fotos = rncAtual.anexos.filter((a) => a.mime_type.startsWith('image/'));
  const documentos = rncAtual.anexos.filter((a) => !a.mime_type.startsWith('image/'));

  // A URL assinada do Storage expira em 24h; renova ao abrir para não mostrar
  // miniatura quebrada em RNC antiga (a própria linha do banco guarda a URL
  // assinada no momento do upload, não uma URL pública permanente).
  useEffect(() => {
    let ativo = true;
    (async () => {
      const [anexosRenovados, planoRenovado] = await Promise.all([
        renovarUrlsAnexos(rnc.anexos),
        Promise.all(
          (rnc.plano_acao || []).map(async (a) => ({
            ...a,
            anexos: await renovarUrlsAnexos(a.anexos),
          }))
        ),
      ]);
      if (ativo) {
        setRncAtual((prev) => ({ ...prev, anexos: anexosRenovados, plano_acao: planoRenovado }));
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rnc.id]);

  const handleExportar = async () => {
    setExportando(true);
    try {
      await exportRncPdf(rncAtual);
      toast.success('PDF gerado com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao gerar PDF: ${err.message || ''}`);
    } finally {
      setExportando(false);
    }
  };

  const handlePlanoAtualizado = (atividades: QuaPlanoAcaoAtividade[], novoStatus: string) => {
    const atualizado = { ...rncAtual, plano_acao: atividades, status: novoStatus as QuaRnc['status'] };
    setRncAtual(atualizado);
    onAtualizado(atualizado);
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel={`RNC ${rncAtual.numero_registro}`}>
      <ModalHeader onClose={onClose}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-rose-700 dark:text-rose-400">
            {rncAtual.numero_registro}
          </span>
          {rncAtual.numero_rnc_externo && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {rncAtual.numero_rnc_externo}
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COR[rncAtual.status]}`}>
            {STATUS_LABEL[rncAtual.status]}
          </span>
          {rncAtual.excluido_em && <BadgeExcluido em={rncAtual.excluido_em} />}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{rncAtual.descricao}</p>
      </ModalHeader>

      <div className="flex border-b border-slate-100 px-4 sm:px-6 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => setAba('detalhes')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors ${
            aba === 'detalhes'
              ? 'border-rose-600 text-rose-700 dark:text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Info className="h-3.5 w-3.5" />
          Detalhes
        </button>
        <button
          type="button"
          onClick={() => setAba('plano_acao')}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors ${
            aba === 'plano_acao'
              ? 'border-rose-600 text-rose-700 dark:text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <ListChecks className="h-3.5 w-3.5" />
          Plano de Ação ({rncAtual.plano_acao.length})
        </button>
      </div>

      <ModalBody>
        {lightbox.elemento}

        {aba === 'detalhes' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {[
                ['Emissor', rncAtual.emissor_nome],
                ['Responsável', rncAtual.responsavel_nome || '-'],
                ['Data de Emissão', formatDataBR(rncAtual.data_emissao)],
                ['Data da Ocorrência', formatDataBR(rncAtual.data_ocorrencia)],
                ['Origem da NC', rncAtual.origem_nc === 'FORNECEDOR' ? 'Fornecedor' : 'Processo'],
                ['Documento de Origem', rncAtual.documento_origem || '-'],
                ['Área Geradora', rncAtual.area_geradora || '-'],
                ['Tipo de NC', rncAtual.tipo_nc || '-'],
                ['Fornecedor', rncAtual.fornecedor || '-'],
                ['Nº Pedido de Compra', rncAtual.numero_pedido_compra || '-'],
                ['Cliente', rncAtual.cliente || '-'],
                ['Projeto', rncAtual.projeto || '-'],
                ['Tramo / Sequencial', rncAtual.tramo_sequencial || '-'],
              ].map(([label, valor]) => (
                <div key={label}>
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{valor}</span>
                </div>
              ))}
            </div>

            <div>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                Descrição
              </span>
              <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                {rncAtual.descricao}
              </p>
            </div>

            {fotos.length > 0 && (
              <div>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Evidências Fotográficas ({fotos.length})
                </span>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {fotos.map((foto, idx) => (
                    <button
                      key={foto.id}
                      type="button"
                      onClick={() =>
                        lightbox.abrir(fotos.map((f) => ({ url: f.preview_url || '', legenda: f.name })), idx)
                      }
                      className="aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                    >
                      <img src={foto.preview_url} alt={foto.name} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {documentos.length > 0 && (
              <div>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Documentos ({documentos.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {documentos.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.preview_url}
                      target="_self"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      {doc.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <QualidadePlanoAcaoEditor
            rncId={rncAtual.id}
            atividades={rncAtual.plano_acao}
            podeEditar={podeEditar}
            responsavelPadrao={rncAtual.responsavel_nome || undefined}
            onAtualizado={handlePlanoAtualizado}
          />
        )}
      </ModalBody>

      <ModalFooter>
        {podeEditar && !rncAtual.excluido_em && (
          <button
            type="button"
            onClick={() => setConfirmarExclusao(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        )}
        {podeEditar && rncAtual.excluido_em && (
          <button
            type="button"
            onClick={() => onRestore(rncAtual.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar
          </button>
        )}

        <button
          type="button"
          onClick={handleExportar}
          disabled={exportando}
          className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-500 disabled:opacity-60"
        >
          {exportando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
          Exportar PDF
        </button>
      </ModalFooter>

      {confirmarExclusao && (
        <ConfirmDialog
          titulo="Excluir RNC"
          mensagem={`Confirma a exclusão da RNC ${rncAtual.numero_registro}? O registro pode ser restaurado por um administrador.`}
          confirmarLabel="Excluir"
          variante="perigo"
          onConfirmar={() => {
            setConfirmarExclusao(false);
            onDelete(rncAtual.id);
          }}
          onCancelar={() => setConfirmarExclusao(false)}
        />
      )}
    </Modal>
  );
}

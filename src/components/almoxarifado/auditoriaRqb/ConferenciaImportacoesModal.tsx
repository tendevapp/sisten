/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conferência com a MB51 das últimas importações da planilha concluída, fora do
 * fluxo de importação: quem fechou a importação, importou a MB51 depois (ou
 * quer olhar de novo) escolhe a importação — ou todas dos últimos 7 dias — e a
 * conferência roda de novo contra a MB51 atual.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';
import ConferenciaImportacao from './ConferenciaImportacao';
import { formatDateTimeBR } from '../../../lib/format';
import { dataHojeLocal, dataLocalMaisDias } from '../../../lib/dataLocal';
import { dataLocalDeTimestamp, documentosDaImportacao } from '../../../lib/requisicaoBalcaoAuditoria';
import { listarImportacoesBalcao, type ImportacaoBalcao } from '../../../lib/requisicaoBalcaoApi';

interface Props {
  visivel: boolean;
  podeImportarMb51: boolean;
  podeAbrirRelatorio: boolean;
  onAbrirRelatorio: () => void;
  onAbrirRequisicao: (requisicaoId: string, codigo: string) => void;
  onClose: () => void;
}

const DIAS_LISTA = 30;
const DIAS_TODAS = 7;
const TODAS = 'todas';

export default function ConferenciaImportacoesModal({
  visivel, podeImportarMb51, podeAbrirRelatorio, onAbrirRelatorio, onAbrirRequisicao, onClose,
}: Props) {
  const idSelect = useId();
  const [importacoes, setImportacoes] = useState<(ImportacaoBalcao & { docsConferir: string[] })[] | null>(null);
  const [erro, setErro] = useState('');
  const [escolha, setEscolha] = useState<string>('');

  useEffect(() => {
    let ativo = true;
    listarImportacoesBalcao(dataLocalMaisDias(-DIAS_LISTA), dataHojeLocal())
      .then((lista) => {
        if (!ativo) return;
        const comDocs = lista
          .map((i) => ({ ...i, docsConferir: documentosDaImportacao(i) }))
          .filter((i) => i.docsConferir.length > 0);
        setImportacoes(comDocs);
        setEscolha((e) => e || comDocs[0]?.id || '');
      })
      .catch((e: any) => { if (ativo) { setErro(e?.message || 'Não foi possível carregar as importações.'); setImportacoes([]); } });
    return () => { ativo = false; };
  }, []);

  const limiteTodas = dataLocalMaisDias(-DIAS_TODAS);
  const recentes = useMemo(
    () => (importacoes ?? []).filter((i) => dataLocalDeTimestamp(i.created_at) >= limiteTodas),
    [importacoes, limiteTodas],
  );
  const docs = useMemo(() => {
    if (!importacoes) return [];
    if (escolha === TODAS) return [...new Set(recentes.flatMap((i) => i.docsConferir))].sort();
    return importacoes.find((i) => i.id === escolha)?.docsConferir ?? [];
  }, [importacoes, escolha, recentes]);
  const docsTodas = useMemo(() => new Set(recentes.flatMap((i) => i.docsConferir)).size, [recentes]);

  if (!visivel) return null;

  return (
    <Modal onClose={onClose} maxWidth="max-w-6xl" ariaLabel="Conferência das importações com a MB51">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Conferência com a MB51</h2>
        <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
          Importações da planilha concluída dos últimos {DIAS_LISTA} dias, conferidas com a MB51 importada agora. Importe a MB51 e confira de novo quando quiser.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        {importacoes === null ? (
          <p className="flex items-center gap-2 py-6 text-xs" style={{ color: 'var(--ink-muted)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando as importações…
          </p>
        ) : erro ? (
          <p className="text-xs" style={{ color: 'var(--status-critical)' }}>{erro}</p>
        ) : importacoes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
            Nenhuma importação com documento SAP nos últimos {DIAS_LISTA} dias.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={idSelect} className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Importação</label>
              <select
                id={idSelect}
                value={escolha}
                onChange={(e) => setEscolha(e.target.value)}
                className="min-h-10 min-w-0 flex-1 basis-72 rounded-lg border px-3 text-xs font-semibold sm:min-h-0 sm:py-2"
                style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)', color: 'var(--ink-primary)' }}
              >
                {recentes.length > 1 && (
                  <option value={TODAS}>Todas dos últimos {DIAS_TODAS} dias ({recentes.length} importações · {docsTodas} doc.)</option>
                )}
                {importacoes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {formatDateTimeBR(i.created_at)} · {i.arquivo || 'planilha'} · {i.docsConferir.length} doc.{i.importado_por_nome ? ` · ${i.importado_por_nome}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <ConferenciaImportacao
              key={escolha}
              docs={docs}
              podeImportarMb51={podeImportarMb51}
              onAbrirRequisicao={onAbrirRequisicao}
            />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <div className="flex w-full flex-wrap justify-end gap-2">
          {podeAbrirRelatorio && (
            <button onClick={onAbrirRelatorio} className="mr-auto rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Abrir Relatório × MB51
            </button>
          )}
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>Fechar</button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

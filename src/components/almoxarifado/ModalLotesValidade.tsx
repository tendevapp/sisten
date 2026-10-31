import React, { useState } from 'react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import CamposLoteValidade from './CamposLotesValidade';
import { normalizarLotesValidade, type LoteValidade } from '../../lib/lotesValidade';

export default function ModalLotesValidade({ descricao, valores, onConfirm, onClose }: {
  descricao: string;
  valores: LoteValidade[];
  onConfirm?: (lotes: LoteValidade[]) => void;
  onClose: () => void;
}) {
  const [lotes, setLotes] = useState(() => valores.map(l => ({ ...l })));
  return <Modal onClose={onClose} maxWidth="max-w-lg" zIndexClassName="z-[120]" ariaLabel="Lotes e validades do item" disableOutsideClose>
    <ModalHeader onClose={onClose}>Lotes e validades</ModalHeader>
    <ModalBody>
      <p className="mb-3 text-xs font-bold break-words" style={{ color: 'var(--ink-primary)' }}>{descricao}</p>
      {onConfirm ? <>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-muted)' }}>Preenchimento opcional. Adicione somente os lotes necessários. Os dados serão gravados ao salvar o recebimento.</p>
        <CamposLoteValidade valores={lotes} onChange={setLotes} />
      </> : <dl className="space-y-2 text-xs">
        {lotes.map((l, i) => <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
          <div><dt className="font-bold">Lote {i + 1}</dt><dd className="break-words">{l.lote || 'Não informado'}</dd></div>
          <div><dt className="font-bold">Validade</dt><dd>{l.validade?.split('-').reverse().join('/') || 'Não informada'}</dd></div>
        </div>)}
      </dl>}
    </ModalBody>
    <ModalFooter>
      <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold" style={{ borderColor: 'var(--hairline)' }}>{onConfirm ? 'Cancelar' : 'Fechar'}</button>
      {onConfirm && <button type="button" onClick={() => { onConfirm(normalizarLotesValidade(lotes)); onClose(); }} className="rounded-lg px-4 py-2 text-xs font-bold text-white" style={{ background: 'var(--brand)' }}>Aplicar ao item</button>}
    </ModalFooter>
  </Modal>;
}

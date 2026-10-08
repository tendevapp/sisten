import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Building2, Gauge } from 'lucide-react';
import Modal, { ModalHeader, ModalBody } from '../ui/Modal';
import { localDb } from '../../db/localDb';
import type { EstoqueItem } from '../../types';
import { formatDeposito } from '../../lib/almoxarifado';
import { formatQtd, formatDateBR } from '../../lib/format';
import { setoresCompraDireta } from '../../lib/estoqueOrigemCompraDireta';
import { buscarSituacoesEstoque, situacaoEstoqueDoMaterial, type SituacaoEstoqueMaterial } from '../../lib/estoqueSituacaoCompras';

interface Props {
  item: EstoqueItem;
  onClose: () => void;
}

function Secao({ icon: Icon, titulo, children }: { icon: React.ElementType; titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-3.5 space-y-2" style={{ borderColor: 'var(--hairline)' }}>
      <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
        <Icon className="h-3.5 w-3.5" /> {titulo}
      </h4>
      {children}
    </section>
  );
}

/**
 * Ficha do item da posição de estoque: onde ele está no depósito (endereço da
 * ZL0024, relevante para o item de estoque mínimo) e, quando foi comprado
 * direto, qual setor pediu.
 */
export default function EstoqueItemModal({ item, onClose }: Props) {
  const [situacao, setSituacao] = useState<SituacaoEstoqueMaterial | null>(null);

  // A faixa mín./máx. vem do Controle de Estoque; se falhar, a ficha abre sem ela.
  useEffect(() => {
    let ativo = true;
    buscarSituacoesEstoque()
      .then(mapa => { if (ativo) setSituacao(situacaoEstoqueDoMaterial(mapa, item.material)); })
      .catch(() => { if (ativo) setSituacao(null); });
    return () => { ativo = false; };
  }, [item.material]);

  const setores = useMemo(
    () => setoresCompraDireta(item.material, localDb.getRequests(), localDb.getAllRequestItems(), localDb.getSectors()),
    [item.material],
  );

  const estoqueMinimo = (situacao?.minimo ?? 0) > 0;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel={`Informações do item ${item.material ?? ''}`}>
      <ModalHeader onClose={onClose}>
        <p className="font-mono text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{item.material || '—'}</p>
        <h3 className="text-base font-extrabold leading-snug" style={{ color: 'var(--ink-primary)' }}>
          {item.txt_breve_material || 'Sem descrição'}
        </h3>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <Secao icon={MapPin} titulo="Endereço no depósito">
          {item.posicao_estoque ? (
            <p className="font-mono text-xl font-black" style={{ color: 'var(--ink-primary)' }}>{item.posicao_estoque}</p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Sem endereço na ZL0024 para esta linha.</p>
          )}
          {item.deposito && (
            <p className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Depósito {formatDeposito(item.deposito)}</p>
          )}
        </Secao>

        <Secao icon={Gauge} titulo="Estoque mínimo">
          {estoqueMinimo && situacao ? (
            <p className="text-sm" style={{ color: 'var(--ink-primary)' }}>
              Item de estoque mínimo: mínimo <strong className="tabular">{formatQtd(situacao.minimo)}</strong>
              {situacao.maximo !== null && <> · máximo <strong className="tabular">{formatQtd(situacao.maximo)}</strong></>}
              {' '}· saldo <strong className="tabular">{formatQtd(situacao.saldo)}</strong> {situacao.umb ?? item.umb ?? ''}
            </p>
          ) : (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Sem estoque mínimo definido para este material.</p>
          )}
        </Secao>

        <Secao icon={Building2} titulo="Setor solicitante (compra direta)">
          {setores.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Nenhuma solicitação de compra direta encontrada para este material.</p>
          ) : (
            <ul className="space-y-1.5">
              {setores.map(s => (
                <li key={s.setorId} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold" style={{ color: 'var(--ink-primary)' }}>{s.setor}</span>
                  <span className="text-[11px] text-right" style={{ color: 'var(--ink-muted)' }}>
                    {s.solicitacoes} solicitaç{s.solicitacoes === 1 ? 'ão' : 'ões'} · última #{s.ultimaNumero}, {formatDateBR(s.ultimaEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </ModalBody>
    </Modal>
  );
}

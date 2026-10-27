/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "O que fazer com a peça lida?" — o par de `EscolhaAcaoItemQr` para a
 * etiqueta BOM (peça de projeto). Usado pelo "Ler QR" do cabeçalho e pelo link
 * do QR aberto na câmera comum do celular.
 *
 * Acima das opções vem a situação da peça (`SituacaoPecaProjetoResumo`): saldo
 * do módulo Projetos, localização, autonomia por tramo e o que ainda vai chegar.
 * A peça não passa pelo balcão nem pelo inventário do SAP, então as opções são:
 *  - Cadastro de Itens › BOM: foto, localização e etiqueta da peça;
 *  - Gemba: acende a prateleira no mapa do galpão;
 *  - Projetos › Posição & Autonomia: a peça no saldo do projeto inteiro.
 *
 * Cada opção só aparece para quem acessa a tela (`lib/acoesQr`).
 */

import { useState } from 'react';
import { Boxes, ClipboardList, Warehouse, type LucideIcon } from 'lucide-react';
import type { Profile } from '../types';
import { ACESSO_ACAO_PECA, acoesDaPecaQr, type AcaoPecaQr } from '../lib/acoesQr';
import { EVENTO_PECA_BOM, guardarPecaBomPendente } from '../lib/etiquetaMaterial';
import { ROTA_CADASTRO_ITENS } from '../lib/etiquetaBom';
import type { SituacaoPecaProjeto } from '../lib/situacaoPecaProjeto';
import Modal, { ModalBody, ModalHeader } from './ui/Modal';
import SituacaoPecaProjetoResumo from './almoxarifado/SituacaoPecaProjetoResumo';

type AcaoPeca = AcaoPecaQr;

interface DestinoPeca {
  titulo: string;
  explicacao: string;
  icone: LucideIcon;
}

const DESTINOS: Record<AcaoPeca, DestinoPeca> = {
  cadastro: {
    titulo: 'Cadastro de Itens (BOM)',
    explicacao: 'Abre a peça: foto, localização e etiqueta.',
    icone: ClipboardList,
  },
  gemba: {
    titulo: 'Ver no Gemba',
    explicacao: 'Acende a prateleira da peça no mapa do almoxarifado.',
    icone: Warehouse,
  },
  projetos: {
    titulo: 'Posição & Autonomia (Projetos)',
    explicacao: 'Saldo e autonomia de todas as peças do projeto.',
    icone: Boxes,
  },
};

// Quem pode o quê fica em `lib/acoesQr` (ACESSO_ACAO_PECA): o cabeçalho decide sem carregar este diálogo.
export { acoesDaPecaQr, ACESSO_ACAO_PECA };

interface Props {
  user: Profile;
  partNumber: string;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

export default function EscolhaAcaoPecaQr({ user, partNumber, onNavigate, onClose }: Props) {
  const acoes = acoesDaPecaQr(user);
  const [peca, setPeca] = useState<SituacaoPecaProjeto | null>(null);

  const executar = (acao: AcaoPeca) => {
    onClose();
    if (acao === 'cadastro') {
      // Pendente + evento: a aba BOM abre a peça, esteja ou não já aberta.
      guardarPecaBomPendente(partNumber);
      onNavigate(`${ROTA_CADASTRO_ITENS}?aba=bom`);
      window.setTimeout(() => window.dispatchEvent(new Event(EVENTO_PECA_BOM)), 0);
    } else if (acao === 'gemba') {
      onNavigate(`/almoxarifado/gemba?item=${encodeURIComponent(peca?.item.part_number ?? partNumber)}`);
    } else {
      onNavigate('/almoxarifado/projetos/posicao');
    }
  };

  const descricao = peca?.cadastro_bom?.etiqueta_descricao?.trim() || peca?.item.descricao || peca?.item.description || null;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="O que fazer com a peça lida">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Peça de projeto lida</h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono font-bold">{peca?.item.part_number ?? partNumber}</span>
          {descricao && <> · {descricao}</>}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-2.5">
        <SituacaoPecaProjetoResumo chave={partNumber} mostrarCabecalho={false} onCarregado={setPeca} />
        {acoes.length > 0 && (
          <p className="border-t pt-3 text-xs font-semibold" style={{ color: 'var(--ink-secondary)', borderColor: 'var(--hairline)' }}>O que você quer fazer?</p>
        )}
        {acoes.map((acao) => {
          const { titulo, explicacao, icone: Icone } = DESTINOS[acao];
          return (
            <button
              key={acao}
              type="button"
              onClick={() => executar(acao)}
              className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
              style={{ borderColor: 'var(--hairline)' }}
            >
              <Icone className="h-6 w-6 shrink-0" style={{ color: 'var(--brand)' }} />
              <span className="min-w-0">
                <span className="block text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{titulo}</span>
                <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>{explicacao}</span>
              </span>
            </button>
          );
        })}
      </ModalBody>
    </Modal>
  );
}

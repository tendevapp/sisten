/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "O que fazer com o item lido?" — usado pelo botão de QR do cabeçalho e pelo
 * link do QR aberto na câmera comum do celular.
 *
 * - Baixa de estoque: abre a Requisição no Balcão com o item já escolhido
 *   (lá, o "Ler QR" do formulário segue valendo para somar outros itens);
 * - Inventário cíclico: abre a contagem daquele item;
 * - Solicitação extraordinária: abre a FRM.ALM-0013 (saída sem saldo) com o
 *   item já na tabela.
 *
 * Cada opção só é oferecida se a pessoa acessa o formulário correspondente.
 * Sem nenhuma, avisa e fecha.
 *
 * Acima das opções vem a situação do item (saldo por depósito, RM aberta,
 * pedido com previsão de entrega e MIGO — `SituacaoMaterialResumo`), a mesma
 * do Ctrl+K. Por isso o diálogo abre mesmo com uma opção só.
 */

import { useEffect, useState } from 'react';
import { ClipboardList, FileWarning, PackageMinus, type LucideIcon } from 'lucide-react';
import type { Profile } from '../types';
import { acoesDoItemQr, type AcaoItemQr } from '../lib/acoesQr';
import {
  EVENTO_ITEM_QR_BALCAO, EVENTO_ITEM_QR_INVENTARIO, EVENTO_ITEM_QR_SOL_EXTRA, ROTA_INVENTARIO_CICLICO,
  ROTA_REQUISICAO_BALCAO, ROTA_SOLICITACAO_EXTRA,
  guardarItemInventarioPendente, guardarItemQrPendente, guardarItemSolExtraPendente,
} from '../lib/etiquetaMaterial';
import { buscarItemAtivoCatalogo } from '../lib/almoxCatalogoApi';
import Modal, { ModalBody, ModalHeader } from './ui/Modal';
import SituacaoMaterialResumo from './almoxarifado/SituacaoMaterialResumo';
import { useToast } from './ui/Toast';

interface Props {
  user: Profile;
  codigo: string;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

type Acao = AcaoItemQr;

interface Destino {
  rota: string;
  guardar: (codigo: string) => void;
  evento: string;
  titulo: string;
  explicacao: string;
  icone: LucideIcon;
}

/** Na ordem em que aparecem no diálogo. */
const DESTINOS: Record<Acao, Destino> = {
  baixa: {
    rota: ROTA_REQUISICAO_BALCAO, guardar: guardarItemQrPendente, evento: EVENTO_ITEM_QR_BALCAO,
    titulo: 'Baixa de estoque',
    explicacao: 'Abre a Requisição no Balcão com o item preenchido. Dá para ler outros QRs e somar itens.',
    icone: PackageMinus,
  },
  inventario: {
    rota: ROTA_INVENTARIO_CICLICO, guardar: guardarItemInventarioPendente, evento: EVENTO_ITEM_QR_INVENTARIO,
    titulo: 'Inventário cíclico',
    explicacao: 'Abre a contagem cega deste item no Inventário Cíclico.',
    icone: ClipboardList,
  },
  extra: {
    rota: ROTA_SOLICITACAO_EXTRA, guardar: guardarItemSolExtraPendente, evento: EVENTO_ITEM_QR_SOL_EXTRA,
    titulo: 'Solicitação extraordinária',
    explicacao: 'Saída sem saldo na ZL0024 (NF não lançada). Abre a FRM.ALM-0013 com o item na tabela.',
    icone: FileWarning,
  },
};

// Quem pode o quê fica em `lib/acoesQr`: o cabeçalho decide sem carregar este diálogo.
export { acoesDoItemQr };

export default function EscolhaAcaoItemQr({ user, codigo, onNavigate, onClose }: Props) {
  const toast = useToast();
  const acoes = acoesDoItemQr(user);
  const [descricao, setDescricao] = useState<string | null>(null);

  // Pendente + navegação cobrem a tela que ainda vai abrir; o evento acorda a
  // que já estava aberta (mesma rota não dispara `hashchange`).
  const executar = (acao: Acao) => {
    const { rota, guardar, evento } = DESTINOS[acao];
    guardar(codigo);
    onClose();
    onNavigate(rota);
    window.setTimeout(() => window.dispatchEvent(new Event(evento)), 0);
  };

  const semEscolha = acoes.length === 0;
  useEffect(() => {
    if (!semEscolha) return;
    toast.info('Seu acesso não inclui baixa de estoque, inventário cíclico nem solicitação extraordinária.');
    onClose();
    // Roda uma vez por item lido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  // A descrição só ajuda a conferir que é a etiqueta certa; sem catálogo, fica o código.
  useEffect(() => {
    let ativo = true;
    buscarItemAtivoCatalogo(codigo)
      .then((item) => {
        const texto = item?.etiqueta_descricao?.trim() || item?.descricao || null;
        if (ativo) setDescricao(texto);
      })
      .catch(() => { /* só o código */ });
    return () => { ativo = false; };
  }, [codigo]);

  if (semEscolha) return null;

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="O que fazer com o item lido">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Item lido</h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono font-bold">{codigo}</span>
          {descricao && <> · {descricao}</>}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-2.5">
        <SituacaoMaterialResumo material={codigo} mostrarCabecalho={false} />
        <p className="border-t pt-3 text-xs font-semibold" style={{ color: 'var(--ink-secondary)', borderColor: 'var(--hairline)' }}>O que você quer fazer?</p>
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

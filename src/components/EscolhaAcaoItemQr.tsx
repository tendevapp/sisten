/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * "O que fazer com o item lido?" — usado pelo botão de QR do cabeçalho e pelo
 * link do QR aberto na câmera comum do celular.
 *
 * - Baixa de estoque: abre a Requisição no Balcão com o item já escolhido
 *   (lá, o "Ler QR" do formulário segue valendo para somar outros itens);
 * - Inventário cíclico: abre a contagem daquele item.
 *
 * Cada opção só é oferecida se a pessoa acessa o formulário correspondente.
 * Com uma só opção permitida não há o que perguntar: segue direto. Sem
 * nenhuma, avisa e fecha.
 */

import { useEffect, useRef, useState } from 'react';
import { ClipboardList, PackageMinus } from 'lucide-react';
import type { Profile } from '../types';
import { canAccessForm } from '../lib/pages';
import {
  EVENTO_ITEM_QR_BALCAO, EVENTO_ITEM_QR_INVENTARIO, ROTA_INVENTARIO_CICLICO, ROTA_REQUISICAO_BALCAO,
  guardarItemInventarioPendente, guardarItemQrPendente,
} from '../lib/etiquetaMaterial';
import { buscarItemAtivoCatalogo } from '../lib/almoxCatalogoApi';
import Modal, { ModalBody, ModalHeader } from './ui/Modal';
import { useToast } from './ui/Toast';

interface Props {
  user: Profile;
  codigo: string;
  onNavigate: (path: string) => void;
  onClose: () => void;
}

type Acao = 'baixa' | 'inventario';

const DESTINO: Record<Acao, { rota: string; guardar: (codigo: string) => void; evento: string }> = {
  baixa: { rota: ROTA_REQUISICAO_BALCAO, guardar: guardarItemQrPendente, evento: EVENTO_ITEM_QR_BALCAO },
  inventario: { rota: ROTA_INVENTARIO_CICLICO, guardar: guardarItemInventarioPendente, evento: EVENTO_ITEM_QR_INVENTARIO },
};

/** Ações que a pessoa pode fazer com um item lido, conforme o acesso aos formulários. */
export function acoesDoItemQr(user: Profile): Acao[] {
  const acoes: Acao[] = [];
  if (canAccessForm(user, 'form_almoxarifado_requisicao_balcao')) acoes.push('baixa');
  if (canAccessForm(user, 'form_almoxarifado_inventario')) acoes.push('inventario');
  return acoes;
}

export default function EscolhaAcaoItemQr({ user, codigo, onNavigate, onClose }: Props) {
  const toast = useToast();
  const acoes = acoesDoItemQr(user);
  const [descricao, setDescricao] = useState<string | null>(null);

  // Pendente + navegação cobrem a tela que ainda vai abrir; o evento acorda a
  // que já estava aberta (mesma rota não dispara `hashchange`).
  const executar = (acao: Acao) => {
    const { rota, guardar, evento } = DESTINO[acao];
    guardar(codigo);
    onClose();
    onNavigate(rota);
    window.setTimeout(() => window.dispatchEvent(new Event(evento)), 0);
  };
  const executarRef = useRef(executar);
  executarRef.current = executar;

  const semEscolha = acoes.length < 2;
  useEffect(() => {
    if (!semEscolha) return;
    if (acoes.length === 1) {
      executarRef.current(acoes[0]);
    } else {
      toast.info('Seu acesso não inclui baixa de estoque nem inventário cíclico.');
      onClose();
    }
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
    <Modal onClose={onClose} maxWidth="max-w-md" ariaLabel="O que fazer com o item lido">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Item lido</h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-muted)' }}>
          <span className="font-mono font-bold">{codigo}</span>
          {descricao && <> · {descricao}</>}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-2.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--ink-secondary)' }}>O que você quer fazer?</p>
        <button
          type="button"
          onClick={() => executar('baixa')}
          className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <PackageMinus className="h-6 w-6 shrink-0" style={{ color: 'var(--brand)' }} />
          <span className="min-w-0">
            <span className="block text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Baixa de estoque</span>
            <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Abre a Requisição no Balcão com o item preenchido. Dá para ler outros QRs e somar itens.
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => executar('inventario')}
          className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-[var(--surface-sunken)]"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <ClipboardList className="h-6 w-6 shrink-0" style={{ color: 'var(--brand)' }} />
          <span className="min-w-0">
            <span className="block text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>Inventário cíclico</span>
            <span className="block text-[11px]" style={{ color: 'var(--ink-muted)' }}>
              Abre a contagem cega deste item no Inventário Cíclico.
            </span>
          </span>
        </button>
      </ModalBody>
    </Modal>
  );
}

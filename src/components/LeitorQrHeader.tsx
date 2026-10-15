/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Botão "Ler QR" do cabeçalho do SISTEN.
 *
 * Lê o QR da etiqueta de prateleira (a mesma do cadastro de itens do Almox) e
 * entrega o item ao diálogo que pergunta o que fazer: baixa de estoque ou
 * inventário cíclico (`EscolhaAcaoItemQr`). Só aparece para quem acessa ao
 * menos um dos dois formulários.
 */

import { useState } from 'react';
import { QrCode } from 'lucide-react';
import type { Profile } from '../types';
import { codigoDoQr } from '../lib/etiquetaMaterial';
import EscolhaAcaoItemQr, { acoesDoItemQr } from './EscolhaAcaoItemQr';
import LeitorQrModal from './ui/LeitorQrModal';
import { useToast } from './ui/Toast';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function LeitorQrHeader({ user, onNavigate }: Props) {
  const toast = useToast();
  const [lendo, setLendo] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  if (acoesDoItemQr(user).length === 0) return null;

  const aoLer = (texto: string) => {
    setLendo(false);
    const lido = codigoDoQr(texto);
    if (!lido) {
      toast.error('Este QR não é de etiqueta de material do SISTEN.');
      return;
    }
    setCodigo(lido);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setLendo(true)}
        aria-label="Ler QR de etiqueta de material"
        title="Ler QR da etiqueta do material (baixa de estoque ou inventário)"
        className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <QrCode className="h-5.5 w-5.5" />
      </button>

      {lendo && <LeitorQrModal onLido={aoLer} onClose={() => setLendo(false)} />}

      {codigo && (
        <EscolhaAcaoItemQr user={user} codigo={codigo} onNavigate={onNavigate} onClose={() => setCodigo(null)} />
      )}
    </>
  );
}

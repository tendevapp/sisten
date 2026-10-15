/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Porteiro do link do QR aberto na câmera comum do celular: o App guarda o
 * item assim que o link abre (`guardarItemQrEscolha`) e este componente, já
 * com a pessoa logada, abre por cima da tela o diálogo "o que fazer com o
 * item?". Também acorda se o link abrir com o SISTEN já aberto.
 */

import { useEffect, useState } from 'react';
import type { Profile } from '../types';
import { consumirItemQrEscolha } from '../lib/etiquetaMaterial';
import EscolhaAcaoItemQr from './EscolhaAcaoItemQr';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

export default function EscolhaItemQrGate({ user, onNavigate }: Props) {
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    const ler = () => {
      const lido = consumirItemQrEscolha();
      if (lido) setCodigo(lido);
    };
    ler();
    window.addEventListener('hashchange', ler);
    return () => window.removeEventListener('hashchange', ler);
  }, []);

  if (!codigo) return null;
  return <EscolhaAcaoItemQr user={user} codigo={codigo} onNavigate={onNavigate} onClose={() => setCodigo(null)} />;
}

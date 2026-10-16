/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Cadastro de Itens (FRM.ALM-0016) — duas abas:
 * - Itens SAP: o catálogo de consumíveis da ZL0024 (tela de sempre);
 * - Itens BOM: as peças da BOM do projeto, com foto, localização e a etiqueta
 *   de identificação por seção.
 *
 * `?aba=bom` abre direto na BOM; `?peca=<part number>` (QR da etiqueta BOM)
 * abre a peça. A aba fica no endereço para o F5 voltar nela.
 */

import { useEffect, useState } from 'react';
import { Boxes, Layers } from 'lucide-react';
import type { Profile } from '../../types';
import CadastroItensAlmox from './CadastroItensAlmox';
import CadastroItensBom from './CadastroItensBom';
import { pecaDaRota } from '../../lib/etiquetaBom';
import { EVENTO_PECA_BOM, consumirPecaBomPendente } from '../../lib/etiquetaMaterial';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Aba = 'sap' | 'bom';

const abaDoEndereco = (hash: string): Aba | null => {
  const consulta = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const aba = new URLSearchParams(consulta).get('aba');
  return aba === 'bom' || aba === 'sap' ? aba : null;
};

/** Grava a aba no endereço (sem a peça, para o F5 não reabrir o modal). */
function gravarAbaNoEndereco(aba: Aba) {
  const hash = window.location.hash || '#/';
  const idx = hash.indexOf('?');
  const base = idx >= 0 ? hash.slice(0, idx) : hash;
  const params = new URLSearchParams(idx >= 0 ? hash.slice(idx + 1) : '');
  params.delete('peca');
  if (aba === 'bom') params.set('aba', 'bom'); else params.delete('aba');
  const resto = params.toString();
  window.history.replaceState(null, '', `${base}${resto ? `?${resto}` : ''}`);
}

export default function CadastroItensPagina({ user, onNavigate }: Props) {
  const [aba, setAba] = useState<Aba>(() => (pecaDaRota(window.location.hash) ? 'bom' : abaDoEndereco(window.location.hash) ?? 'sap'));
  const [peca, setPeca] = useState<{ partNumber: string; n: number } | null>(null);

  // Peça do QR: do endereço (já logado) ou guardada antes do login.
  useEffect(() => {
    const ler = () => {
      const doEndereco = pecaDaRota(window.location.hash);
      const pendente = consumirPecaBomPendente();
      const partNumber = doEndereco ?? pendente;
      if (!partNumber) return;
      setAba('bom');
      gravarAbaNoEndereco('bom');
      setPeca((atual) => ({ partNumber, n: (atual?.n ?? 0) + 1 }));
    };
    ler();
    window.addEventListener('hashchange', ler);
    // Leitor de QR do cabeçalho com esta tela já aberta (mesma rota não dispara hashchange).
    window.addEventListener(EVENTO_PECA_BOM, ler);
    return () => {
      window.removeEventListener('hashchange', ler);
      window.removeEventListener(EVENTO_PECA_BOM, ler);
    };
  }, []);

  const trocar = (nova: Aba) => {
    setAba(nova);
    gravarAbaNoEndereco(nova);
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }} role="tablist" aria-label="Tipo de item">
        {([
          { id: 'sap' as Aba, rotulo: 'Itens SAP', icone: Layers },
          { id: 'bom' as Aba, rotulo: 'Itens BOM', icone: Boxes },
        ]).map(({ id, rotulo, icone: Icone }) => {
          const ativa = aba === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocar(id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer transition-colors"
              style={ativa ? { background: 'var(--brand)', color: 'white' } : { color: 'var(--ink-secondary)' }}
            >
              <Icone className="h-3.5 w-3.5" /> {rotulo}
            </button>
          );
        })}
      </div>

      {aba === 'sap'
        ? <CadastroItensAlmox user={user} onNavigate={onNavigate} />
        : <CadastroItensBom user={user} onNavigate={onNavigate} pecaInicial={peca} />}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Casamento do fornecedor da proposta com o cadastro (public.contatos) por
 * CNPJ. Nunca bloqueia o salvamento: fornecedor novo na primeira cotação é
 * caso legítimo e comum.
 */

import React, { useEffect, useState } from 'react';
import { Building2, AlertTriangle, HelpCircle, Loader2, Search } from 'lucide-react';
import { acharFornecedorPorCnpj, buscarFornecedoresPorNome, type FornecedorEncontrado } from '../../lib/cotacoesApi';
import { formatarCnpj } from '../../lib/cotacoes';
import type { FornecedorMatch } from '../../types';

interface FornecedorMatchBadgeProps {
  cnpj: string | null;
  fornecedorMatch: FornecedorMatch;
  codVendor: string | null;
  onResolvido: (r: { cod_vendor: string | null; contato_id: string | null; fornecedor_match: FornecedorMatch }) => void;
}

export default function FornecedorMatchBadge({ cnpj, fornecedorMatch, codVendor, onResolvido }: FornecedorMatchBadgeProps) {
  const [carregando, setCarregando] = useState(false);
  const [buscaManual, setBuscaManual] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<FornecedorEncontrado[]>([]);

  // Roda a busca automática por CNPJ uma vez, quando o componente monta com
  // um CNPJ e ainda não há resolução — evita repetir a consulta a cada
  // re-render da grade.
  useEffect(() => {
    if (!cnpj || fornecedorMatch !== 'nao_encontrado' || codVendor) return;
    let cancelado = false;
    setCarregando(true);
    acharFornecedorPorCnpj(cnpj)
      .then(r => {
        if (cancelado) return;
        if (r) onResolvido({ cod_vendor: r.cod_vendor, contato_id: r.id, fornecedor_match: 'cnpj' });
      })
      .catch(err => console.error('Falha ao buscar fornecedor por CNPJ:', err))
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj]);

  const handleBuscarManual = async (t: string) => {
    setTermo(t);
    if (t.trim().length < 2) { setResultados([]); return; }
    try {
      setResultados(await buscarFornecedoresPorNome(t));
    } catch (err) {
      console.error('Falha ao buscar fornecedores por nome:', err);
    }
  };

  if (carregando) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Buscando fornecedor...
      </span>
    );
  }

  if (fornecedorMatch === 'cnpj' || fornecedorMatch === 'manual') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <Building2 className="h-3.5 w-3.5" />
        {codVendor ? `Fornecedor ${codVendor}` : 'Fornecedor vinculado'}
        {fornecedorMatch === 'manual' && <span className="text-emerald-500">(manual)</span>}
      </span>
    );
  }

  if (buscaManual) {
    return (
      <div className="relative">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input
            autoFocus
            value={termo}
            onChange={e => handleBuscarManual(e.target.value)}
            onBlur={() => setTimeout(() => setBuscaManual(false), 150)}
            placeholder="Buscar por razão social..."
            className="w-40 bg-transparent text-xs outline-none"
          />
        </div>
        {resultados.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-40 w-64 overflow-auto rounded-lg border border-slate-200 bg-white text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {resultados.map(r => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => onResolvido({ cod_vendor: r.cod_vendor, contato_id: r.id, fornecedor_match: 'manual' })}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className="font-medium text-slate-800 dark:text-slate-100">{r.fornecedor}</div>
                <div className="text-slate-400">{r.cod_vendor || '—'} · {formatarCnpj(r.cnpj)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      {cnpj ? <AlertTriangle className="h-3.5 w-3.5" /> : <HelpCircle className="h-3.5 w-3.5" />}
      {cnpj ? `CNPJ ${formatarCnpj(cnpj)} não está no cadastro` : 'IA não encontrou o CNPJ'}
      <button type="button" onClick={() => setBuscaManual(true)} className="font-semibold underline hover:no-underline">
        vincular
      </button>
    </span>
  );
}

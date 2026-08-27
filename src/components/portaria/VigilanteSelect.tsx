/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Componente reutilizável para seleção de Vigilante nos formulários da Portaria.
 * Carrega dinamicamente os vigilantes ativos cadastrados no banco (`port_vigilantes`).
 */

import React, { useState, useEffect } from 'react';
import type { PortVigilante } from '../../types';
import * as api from '../../lib/portariaApi';
import { Shield, UserPlus } from 'lucide-react';

interface Props {
  value: string;
  onChange: (nome: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  filtroFuncao?: string;
}

export default function VigilanteSelect({
  value,
  onChange,
  required = false,
  label,
  placeholder = 'Selecione o vigilante...',
  className = '',
  filtroFuncao,
}: Props) {
  const [vigilantes, setVigilantes] = useState<PortVigilante[]>([]);
  const [loading, setLoading] = useState(false);
  const [modoManual, setModoManual] = useState(false);

  useEffect(() => {
    let montado = true;
    setLoading(true);
    api.listarVigilantes(true)
      .then((lista) => {
        if (!montado) return;
        setVigilantes(lista);
        // Se houver valor preenchido e não bater com nenhum da lista, mas não for vazio, ativa manual se desejar
        if (value && lista.length > 0 && !lista.some((v) => v.nome.toLowerCase() === value.toLowerCase())) {
          // valor personalizado
        }
      })
      .catch((err) => {
        console.error('Erro ao buscar vigilantes para select:', err);
      })
      .finally(() => {
        if (montado) setLoading(false);
      });

    return () => {
      montado = false;
    };
  }, []);

  const listaFiltrada = filtroFuncao
    ? vigilantes.filter((v) => v.funcao.toLowerCase().includes(filtroFuncao.toLowerCase()))
    : vigilantes;

  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
            {label} {required && '*'}
          </label>
          <button
            type="button"
            onClick={() => setModoManual(!modoManual)}
            className="text-[10px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {modoManual ? 'Selecionar da lista' : 'Digitar outro nome'}
          </button>
        </div>
      )}

      {modoManual || (vigilantes.length === 0 && !loading) ? (
        <div className="relative">
          <input
            type="text"
            required={required}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>
      ) : (
        <div className="relative">
          <select
            required={required}
            value={value}
            onChange={(e) => {
              if (e.target.value === '__OUTRO__') {
                setModoManual(true);
                onChange('');
              } else {
                onChange(e.target.value);
              }
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          >
            <option value="">{placeholder}</option>
            {listaFiltrada.map((v) => (
              <option key={v.id} value={v.nome}>
                {v.nome} {v.matricula ? `(${v.matricula})` : ''} - {v.funcao}
              </option>
            ))}
            {/* Se o valor atual não estiver na lista ativa, adiciona como opção para não quebrar edições antigas */}
            {value && !listaFiltrada.some((v) => v.nome === value) && (
              <option value={value}>{value} (Personalizado)</option>
            )}
            <option value="__OUTRO__">✍️ Outro (digitar nome manualmente)...</option>
          </select>
        </div>
      )}
    </div>
  );
}

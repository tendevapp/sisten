import React, { useState, useEffect } from 'react';
import type { PortVigilante } from '../../types';
import * as api from '../../lib/portariaApi';
import { Shield, UserPlus, ChevronDown, Check } from 'lucide-react';

interface Props {
  value: string;
  onChange: (nome: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  filtroFuncao?: string;
  excludeNames?: (string | null | undefined)[];
}

export default function VigilanteSelect({
  value,
  onChange,
  required = false,
  label,
  placeholder = 'Selecione o vigilante...',
  className = '',
  filtroFuncao,
  excludeNames,
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

  const nomesExcluidos = new Set(
    (excludeNames || [])
      .filter((n): n is string => Boolean(n && n.trim()))
      .map((n) => n.trim().toUpperCase())
  );

  const listaFiltrada = vigilantes.filter((v) => {
    const nomeNorm = v.nome.trim().toUpperCase();
    const valorAtualNorm = (value || '').trim().toUpperCase();

    // Mantém o item caso ele já seja o valor atualmente selecionado neste campo
    if (valorAtualNorm && nomeNorm === valorAtualNorm) {
      return true;
    }

    // Exclui caso já esteja selecionado em outro campo
    if (nomesExcluidos.has(nomeNorm)) {
      return false;
    }

    // Filtro por função se houver
    if (filtroFuncao && !v.funcao.toLowerCase().includes(filtroFuncao.toLowerCase())) {
      return false;
    }

    return true;
  });

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Shield className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>{label} {required && <span className="text-red-500">*</span>}</span>
          </label>
          <button
            type="button"
            onClick={() => setModoManual(!modoManual)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 py-0.5 px-1.5 rounded"
          >
            {modoManual ? 'Selecionar da lista' : '✍️ Digitar outro nome'}
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
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="w-full uppercase rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:py-2 text-base sm:text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 transition-colors"
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
            className="w-full appearance-none truncate rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-10 py-2.5 sm:py-2 text-base sm:text-sm font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 transition-colors cursor-pointer"
          >
            <option value="">{loading ? 'Carregando vigilantes...' : placeholder}</option>
            {listaFiltrada.map((v) => (
              <option key={v.id} value={v.nome}>
                {v.nome} • {v.funcao}
              </option>
            ))}
            {/* Se o valor atual não estiver na lista ativa, adiciona como opção para não quebrar edições antigas */}
            {value && !listaFiltrada.some((v) => v.nome === value) && (
              <option value={value}>{value} (Personalizado)</option>
            )}
            <option value="__OUTRO__">✍️ Outro (digitar nome manualmente)...</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
            <ChevronDown className="h-4 w-4 shrink-0" />
          </div>
        </div>
      )}
    </div>
  );
}

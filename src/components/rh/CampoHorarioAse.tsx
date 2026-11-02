import { useEffect, useId, useRef, useState } from 'react';
import { normalizarHoraAse } from '../../lib/aseHorarios';

interface Props {
  label: string;
  value: string;
  onChange: (hora: string) => void;
  atalhos: string[];
  disabled?: boolean;
}

/** Campo sem popup nativo: cabe no cartão mobile e abre teclado numérico. */
export default function CampoHorarioAse({ label, value, onChange, atalhos, disabled = false }: Props) {
  const id = useId();
  const [texto, setTexto] = useState(value);
  const [erro, setErro] = useState(false);
  const editando = useRef(false);

  useEffect(() => {
    if (!editando.current) {
      setTexto(value);
      setErro(false);
    }
  }, [value]);

  function alterar(textoNovo: string) {
    setTexto(textoNovo);
    setErro(false);
    // Nunca envia texto parcial/inválido ao cálculo ou à gravação.
    onChange(normalizarHoraAse(textoNovo) ?? '');
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        placeholder="HH:MM"
        value={texto}
        disabled={disabled}
        aria-invalid={erro || undefined}
        aria-describedby={disabled ? undefined : `${id}-ajuda`}
        onFocus={() => { editando.current = true; }}
        onChange={e => alterar(e.target.value.replace(/[^\d:]/g, ''))}
        onBlur={() => {
          editando.current = false;
          const hora = normalizarHoraAse(texto);
          if (hora) setTexto(hora);
          setErro(Boolean(texto) && !hora);
        }}
        className={`h-12 w-full min-w-0 rounded-lg border bg-white px-2.5 text-base tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950 dark:text-slate-50 ${erro ? 'border-rose-500' : 'border-slate-300 dark:border-slate-700'}`}
      />
      {!disabled && (
        <>
          <p id={`${id}-ajuda`} className={`mt-1 text-[10px] ${erro ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {erro ? 'Use 00:00 a 23:59.' : 'Digite 1730 ou 17:30'}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={`Atalhos de ${label.toLowerCase()}`}>
            {atalhos.map(hora => (
              <button
                key={hora}
                type="button"
                aria-pressed={value === hora}
                onClick={() => {
                  setTexto(hora);
                  setErro(false);
                  onChange(hora);
                }}
                className={`min-h-11 min-w-0 rounded-lg border px-1 text-xs font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-blue-500 ${value === hora ? 'border-blue-500 bg-blue-100 text-blue-800 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-700 active:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}
              >
                {hora}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Campo de assinatura dentro de um formulário: botão que abre o quadro de
 * assinatura (SignaturePadModal) e, depois de assinado, a imagem com
 * "Refazer" e "Remover".
 *
 * Nasceu para o sorteado do teste de alcoolemia, mas não sabe nada dele:
 * serve a qualquer formulário que precise colher a assinatura de alguém.
 */
import React, { useState } from 'react';
import { PenTool, RotateCcw, Trash2 } from 'lucide-react';
import SignaturePadModal from './SignaturePadModal';

interface Props {
  /** PNG em data URL, ou null enquanto não assinou. */
  valor: string | null;
  onChange: (valor: string | null) => void;
  rotulo: string;
  /** Quem assina — aparece no quadro ("Assinatura de JOÃO SILVA"). */
  nomeAssinante?: string;
  /** Quando foi assinada (ISO), para "Assinada às 14:32". */
  assinadaEm?: string | null;
  disabled?: boolean;
}

function horaCurta(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR')} às ${hora}`;
}

export default function CampoAssinatura({ valor, onChange, rotulo, nomeAssinante, assinadaEm, disabled }: Props) {
  const [aberto, setAberto] = useState(false);
  const nome = nomeAssinante?.trim();
  const primeiroNome = nome ? nome.split(/\s+/)[0] : '';
  const quando = horaCurta(assinadaEm);

  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
        <PenTool className="h-3.5 w-3.5" aria-hidden="true" /> {rotulo}
        <span className="font-normal text-slate-500">(opcional)</span>
      </div>

      {valor ? (
        <div>
          {/* Fundo branco também no escuro: a tinta é escura e sumiria. */}
          <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700">
            <img
              src={valor}
              alt={nome ? `Assinatura de ${nome}` : 'Assinatura coletada'}
              className="mx-auto h-20 w-full object-contain"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-emerald-700 dark:text-emerald-300">
              Assinada{quando ? ` ${quando}` : ''}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAberto(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Refazer
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remover
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAberto(true)}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-50 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/30"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-700 dark:text-blue-300">
            <PenTool className="h-4 w-4" aria-hidden="true" /> Coletar assinatura
          </span>
          <span className="text-xs text-slate-500">
            {primeiroNome ? `Entregue a tela para ${primeiroNome} assinar com o dedo` : 'Entregue a tela para a pessoa assinar com o dedo'}
          </span>
        </button>
      )}

      <SignaturePadModal
        isOpen={aberto}
        onClose={() => setAberto(false)}
        onSave={(img) => onChange(img)}
        title={nome ? `Assinatura de ${nome}` : rotulo}
        subtitle="Assine no quadro com o dedo ou a caneta"
      />
    </div>
  );
}

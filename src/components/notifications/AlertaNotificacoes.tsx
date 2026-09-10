/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cartão flutuante de movimentação de chamado.
 *
 * O número no sino é passivo: só informa quem já foi olhar. Quando alguém
 * responde um chamado, o aviso precisa ir até a pessoa. Este cartão aparece
 * logo abaixo do cabeçalho, diz o que mudou e leva direto ao registro.
 *
 * Regras de ruído (é o que separa "avisar" de "incomodar"):
 *  - no máximo 3 cartões na pilha; o excedente vira a linha "+N";
 *  - `info` e `success` somem sozinhos em 12 s, com barra regressiva visível;
 *  - `alert` e `critical` ficam até a pessoa abrir ou fechar — prazo estourado
 *    não pode evaporar enquanto ela estava olhando para outra tela;
 *  - fechar o cartão não marca como lido: o sino continua com o número.
 */

import React from 'react';
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import type { Notification } from '../../types';

/** Um item da pilha: ou uma notificação real, ou o resumo do que já esperava. */
export interface ItemAviso {
  id: string;
  /** `resumo` é o cartão de abertura ("você tem N avisos não lidos"). */
  tipo: Notification['type'] | 'resumo';
  titulo: string;
  descricao: string;
  rodape?: string;
  /** Fica na tela até a pessoa agir. */
  permanente: boolean;
  rotuloAcao: string;
}

const MS_AUTO_FECHAR = 12000;
const MAX_VISIVEIS = 3;

interface Estilo {
  Icone: LucideIcon;
  barra: string;
  icone: string;
  anel: string;
}

const ESTILO: Record<ItemAviso['tipo'], Estilo> = {
  info: { Icone: Info, barra: 'bg-blue-500', icone: 'text-blue-600 dark:text-blue-400', anel: 'bg-blue-50 dark:bg-blue-950/40' },
  success: { Icone: CheckCircle2, barra: 'bg-emerald-500', icone: 'text-emerald-600 dark:text-emerald-400', anel: 'bg-emerald-50 dark:bg-emerald-950/40' },
  alert: { Icone: AlertTriangle, barra: 'bg-amber-500', icone: 'text-amber-600 dark:text-amber-400', anel: 'bg-amber-50 dark:bg-amber-950/40' },
  critical: { Icone: AlertCircle, barra: 'bg-red-600', icone: 'text-red-600 dark:text-red-400', anel: 'bg-red-50 dark:bg-red-950/40' },
  resumo: { Icone: Bell, barra: 'bg-slate-500', icone: 'text-slate-600 dark:text-slate-300', anel: 'bg-slate-100 dark:bg-slate-800' },
};

interface Props {
  itens: ItemAviso[];
  onAbrir: (item: ItemAviso) => void;
  onDispensar: (id: string) => void;
  /** Dispensa a pilha inteira — usado pelo "+N" e pelo cartão de resumo. */
  onDispensarTodos: () => void;
}

export default function AlertaNotificacoes({ itens, onAbrir, onDispensar, onDispensarTodos }: Props) {
  if (itens.length === 0) return null;

  const visiveis = itens.slice(0, MAX_VISIVEIS);
  const excedente = itens.length - visiveis.length;

  return (
    <div
      // Abaixo do cabeçalho (h-16) e acima de tudo, menos modais.
      className="fixed top-[4.5rem] inset-x-3 z-40 flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-[26rem]"
      role="region"
      aria-label="Movimentações recentes"
      aria-live="polite"
    >
      {visiveis.map(item => (
        <CartaoAviso
          key={item.id}
          item={item}
          onAbrir={() => onAbrir(item)}
          onFechar={() => onDispensar(item.id)}
        />
      ))}

      {excedente > 0 && (
        <button
          type="button"
          onClick={onDispensarTodos}
          className="self-end rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm backdrop-blur hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          +{excedente} {excedente === 1 ? 'aviso' : 'avisos'} · fechar todos
        </button>
      )}
    </div>
  );
}

function CartaoAviso({ item, onAbrir, onFechar }: { item: ItemAviso; onAbrir: () => void; onFechar: () => void }) {
  const { Icone, barra, icone, anel } = ESTILO[item.tipo];

  React.useEffect(() => {
    if (item.permanente) return;
    const t = window.setTimeout(onFechar, MS_AUTO_FECHAR);
    return () => window.clearTimeout(t);
  }, [item.permanente, onFechar]);

  return (
    <div
      role={item.tipo === 'critical' || item.tipo === 'alert' ? 'alert' : 'status'}
      className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/5 animate-aviso-entra"
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${barra}`} />

      <div className="flex gap-3 py-3 pl-4 pr-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${anel}`}>
          <Icone className={`h-4.5 w-4.5 ${icone}`} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2">{item.titulo}</p>
          {item.descricao && (
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{item.descricao}</p>
          )}
          {item.rodape && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{item.rodape}</p>
          )}

          <button
            type="button"
            onClick={onAbrir}
            className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] cursor-pointer"
          >
            {item.rotuloAcao}
          </button>
        </div>

        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar aviso"
          className="h-fit shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Barra regressiva: mostra que o cartão vai sumir sozinho. */}
      {!item.permanente && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-slate-100 dark:bg-slate-800">
          <div className={`h-full ${barra}`} style={{ animation: `toast-countdown ${MS_AUTO_FECHAR}ms linear forwards` }} />
        </div>
      )}
    </div>
  );
}

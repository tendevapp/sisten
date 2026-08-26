import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle, Undo2 } from 'lucide-react';

/**
 * Sistema de toasts (feedback não-bloqueante) do SISTEN.
 *
 * Substitui os `alert()` nativos, que travam a thread e ficam fora do estilo
 * do app — especialmente ruins no mobile. Os toasts são anunciados a leitores
 * de tela via `aria-live` e empilham no canto inferior (acima da safe-area).
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Cotação enviada.');
 *   toast.error('Falha ao salvar. Tente novamente.');
 */

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'undo';

interface ToastActionDef {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  action?: ToastActionDef;
}

interface ToastApi {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  /** Toast com botão de ação (ex.: "Desfazer") e duração customizável — para ações reversíveis (delete otimista + janela de undo). */
  action: (message: string, actionLabel: string, onAction: () => void, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const CONFIG: Record<ToastType, { icon: React.ComponentType<{ className?: string }>; classes: string; iconColor: string }> = {
  success: { icon: CheckCircle2, classes: 'border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900', iconColor: 'text-emerald-500' },
  error: { icon: XCircle, classes: 'border-red-200 dark:border-red-800 bg-white dark:bg-slate-900', iconColor: 'text-red-500' },
  warning: { icon: AlertTriangle, classes: 'border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-900', iconColor: 'text-amber-500' },
  info: { icon: Info, classes: 'border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900', iconColor: 'text-blue-500' },
  undo: { icon: Undo2, classes: 'border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800', iconColor: 'text-slate-300' },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((message: string, type: ToastType, action: ToastActionDef | undefined, durationMs: number) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, type, message, action }]);
    window.setTimeout(() => remove(id), durationMs);
  }, [remove]);

  const show = useCallback((message: string, type: ToastType = 'info') => {
    push(message, type, undefined, 5000);
  }, [push]);

  const action = useCallback((message: string, actionLabel: string, onAction: () => void, durationMs = 6000) => {
    push(message, 'undo', { label: actionLabel, onClick: onAction }, durationMs);
  }, [push]);

  const api = useRef<ToastApi>({
    show,
    success: (m: string) => show(m, 'success'),
    error: (m: string) => show(m, 'error'),
    info: (m: string) => show(m, 'info'),
    warning: (m: string) => show(m, 'warning'),
    action,
  });
  // Mantém as closures atualizadas apontando para as versões mais recentes.
  api.current.show = show;
  api.current.success = (m: string) => show(m, 'success');
  api.current.error = (m: string) => show(m, 'error');
  api.current.info = (m: string) => show(m, 'info');
  api.current.warning = (m: string) => show(m, 'warning');
  api.current.action = action;

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div
        className="fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pointer-events-none sm:items-end sm:right-4 sm:left-auto sm:max-w-sm"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const { icon: Icon, classes, iconColor } = CONFIG[toast.type];
  const ehUndo = toast.type === 'undo';
  return (
    <div
      role="status"
      className={`pointer-events-auto w-full flex items-center gap-3 rounded-xl border shadow-lg px-4 py-3 animate-slide-up ${classes}`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ehUndo ? 'bg-white/10' : ''}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </span>
      <p className={`flex-1 text-sm font-medium break-words ${ehUndo ? 'text-slate-100' : 'text-slate-700 dark:text-slate-200'}`}>
        {toast.message}
      </p>
      {toast.action && (
        <button
          type="button"
          onClick={() => { toast.action!.onClick(); onClose(); }}
          className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/20 transition-colors"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar aviso"
        className={`shrink-0 rounded-lg p-1.5 -m-1 transition-colors ${
          ehUndo
            ? 'text-slate-400 hover:bg-white/10 hover:text-slate-100'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Hook de acesso aos toasts. Fora do provider retorna um fallback que usa
 * `console` (nunca lança), para telas montadas isoladamente em testes.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  const fallback = useRef<ToastApi>({
    show: (m) => console.warn('[toast]', m),
    success: (m) => console.warn('[toast:success]', m),
    error: (m) => console.error('[toast:error]', m),
    info: (m) => console.info('[toast:info]', m),
    warning: (m) => console.warn('[toast:warning]', m),
    action: (m, actionLabel) => console.warn('[toast:action]', m, actionLabel),
  });
  return ctx ?? fallback.current;
}

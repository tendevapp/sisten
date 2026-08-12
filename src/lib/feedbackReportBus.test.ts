import { describe, it, expect, vi } from 'vitest';
import { emitBugPrefill, onBugPrefill } from './feedbackReportBus';

describe('feedbackReportBus', () => {
  it('entrega o prefill para quem assinou', () => {
    const listener = vi.fn();
    onBugPrefill(listener);
    emitBugPrefill({ message: 'boom', stack: 'at x', pagePath: '/rastreio' });
    expect(listener).toHaveBeenCalledWith({ message: 'boom', stack: 'at x', pagePath: '/rastreio' });
  });

  it('para de entregar depois de cancelar a assinatura', () => {
    const listener = vi.fn();
    const unsubscribe = onBugPrefill(listener);
    unsubscribe();
    emitBugPrefill({ message: 'boom', pagePath: '/' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('entrega para múltiplos assinantes', () => {
    const a = vi.fn();
    const b = vi.fn();
    onBugPrefill(a);
    onBugPrefill(b);
    emitBugPrefill({ message: 'x', pagePath: '/' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

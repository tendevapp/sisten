import { describe, it, expect, vi } from 'vitest';

describe('Toast and Undo Protocol', () => {
  it('toast.undo deve configurar tempo de 6 segundos e acao Desfazer por padrao', () => {
    const pushMock = vi.fn();
    const undoHelper = (
      message: string,
      onUndo: () => void | Promise<void>,
      durationMs = 6000,
      actionLabel = 'Desfazer'
    ) => {
      pushMock(message, 'undo', { label: actionLabel, onClick: () => { void onUndo(); } }, durationMs);
    };

    const onUndo = vi.fn();
    undoHelper('Registro excluido com sucesso.', onUndo);

    expect(pushMock).toHaveBeenCalledTimes(1);
    const [msg, type, action, duration] = pushMock.mock.calls[0];
    expect(msg).toBe('Registro excluido com sucesso.');
    expect(type).toBe('undo');
    expect(action.label).toBe('Desfazer');
    expect(duration).toBe(6000);

    // Executa a acao
    action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('toast.undo deve permitir customizacao do tempo e rotulo caso necessario', async () => {
    const pushMock = vi.fn();
    let refeito = false;

    const undoHelper = (
      message: string,
      onUndo: () => void | Promise<void>,
      durationMs = 6000,
      actionLabel = 'Desfazer'
    ) => {
      pushMock(message, 'undo', { label: actionLabel, onClick: async () => { await onUndo(); } }, durationMs);
    };

    undoHelper(
      'Item removido.',
      async () => {
        refeito = true;
      },
      8000,
      'Restaurar'
    );

    const [, , action, duration] = pushMock.mock.calls[0];
    expect(action.label).toBe('Restaurar');
    expect(duration).toBe(8000);

    await action.onClick();
    expect(refeito).toBe(true);
  });
});

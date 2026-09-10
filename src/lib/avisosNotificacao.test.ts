import { describe, expect, it } from 'vitest';
import { filtrarNovas, gravarIdsAlertados, lerIdsAlertados, lerPrefsAviso } from './avisosNotificacao';
import type { Notification } from '../types';

function notif(id: string, over: Partial<Notification> = {}): Notification {
  return {
    id,
    user_id: 'u1',
    title: `Aviso ${id}`,
    description: '',
    type: 'info',
    is_read: false,
    created_at: `2026-09-10T10:0${id}:00`,
    ...over,
  };
}

describe('avisos de notificação', () => {
  it('só alerta o que está não lido e ainda não foi alertado', () => {
    const lista = [notif('1'), notif('2', { is_read: true }), notif('3')];
    const novas = filtrarNovas(lista, new Set(['1']));
    expect(novas.map(n => n.id)).toEqual(['3']);
  });

  it('devolve em ordem cronológica: o cartão mais novo é empilhado por último', () => {
    const lista = [notif('3'), notif('1'), notif('2')];
    expect(filtrarNovas(lista, new Set()).map(n => n.id)).toEqual(['1', '2', '3']);
  });

  it('nada a alertar quando tudo já foi lido', () => {
    const lista = [notif('1', { is_read: true }), notif('2', { is_read: true })];
    expect(filtrarNovas(lista, new Set())).toEqual([]);
  });

  it('sem storage disponível, cai nas preferências padrão em vez de quebrar', () => {
    // Ambiente de teste é `node`: não há localStorage. O aviso visual não pode
    // depender de storage para existir.
    expect(lerPrefsAviso('u1')).toEqual({ desktop: false, som: false });
    expect(() => gravarIdsAlertados('u1', new Set(['a']))).not.toThrow();
    expect(lerIdsAlertados('u1').size).toBe(0);
  });
});

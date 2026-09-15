import { describe, expect, it, beforeEach } from 'vitest';
import {
  obterPreferenciasNotificacao,
  salvarPreferenciasNotificacao,
  PREFERENCIAS_NOTIFICACAO_PADRAO,
  GRUPOS_NOTIFICACAO,
} from './userNotificationPreferences';

describe('Preferências de Notificação do Usuário — SISTEN', () => {
  // Ambiente de teste é 'node' (sem DOM): shim mínimo de localStorage.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
  });

  it('carrega preferências padrão com todas as categorias ativas', () => {
    const prefs = obterPreferenciasNotificacao('user-teste-1');
    expect(prefs).toBeDefined();
    expect(prefs.channel).toBe('in-app');
    expect(prefs.chamados_novos).toBe(true);
    expect(prefs.compras_solicitacoes).toBe(true);
    expect(prefs.ssma_mencoes_rid).toBe(true);
    expect(prefs.demandas_atribuicao).toBe(true);
    expect(prefs.portaria_alertas).toBe(true);
    expect(prefs.alertas_criticos).toBe(true);
  });

  it('salva e recupera preferências personalizadas no localStorage', async () => {
    const customPrefs = {
      ...PREFERENCIAS_NOTIFICACAO_PADRAO,
      channel: 'both' as const,
      chamados_novos: false,
      ssma_mencoes_rid: true,
      portaria_alertas: false,
    };

    const ok = await salvarPreferenciasNotificacao('user-teste-2', customPrefs);
    expect(ok).toBe(true);

    const lidas = obterPreferenciasNotificacao('user-teste-2');
    expect(lidas.channel).toBe('both');
    expect(lidas.chamados_novos).toBe(false);
    expect(lidas.ssma_mencoes_rid).toBe(true);
    expect(lidas.portaria_alertas).toBe(false);
  });

  it('garante que todos os itens de GRUPOS_NOTIFICACAO existem na interface UserNotificationPreferences', () => {
    for (const grupo of GRUPOS_NOTIFICACAO) {
      expect(grupo.id).toBeDefined();
      expect(grupo.titulo).toBeDefined();
      expect(grupo.itens.length).toBeGreaterThan(0);

      for (const item of grupo.itens) {
        expect(item.key in PREFERENCIAS_NOTIFICACAO_PADRAO).toBe(true);
        expect(typeof PREFERENCIAS_NOTIFICACAO_PADRAO[item.key]).toBe('boolean');
      }
    }
  });

  it('converte corretamente formatos legados de preferências', () => {
    // Simula chave legada no storage
    localStorage.setItem('sisten_notif_prefs_user-legado', 'both');
    const prefs = obterPreferenciasNotificacao('user-legado');
    expect(prefs.channel).toBe('both');
    expect(prefs.chamados_novos).toBe(true);
  });
});

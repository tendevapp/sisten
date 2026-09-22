import { describe, expect, it, vi, beforeEach } from 'vitest';
import { canAccessPage } from './pages';
import type { Profile } from '../types';
import {
  criarRhPessoa,
  atualizarRhPessoa,
  criarRhSetor,
  atualizarRhSetor,
  criarRhTurno,
  atualizarRhTurno,
  criarRhHoraExtra,
  atualizarRhHoraExtra,
} from './rhApi';
import { supabase } from '../db/supabaseClient';

function mockUser(overrides: Partial<Profile> = {}): Profile {
  const sectorId = overrides.sector_id || '1';
  return {
    id: 'usr-teste',
    name: 'Usuário Teste',
    email: 'usuario@ten.com.br',
    cargo: 'ANALISTA DE RH',
    roles: ['requisitante'],
    sector_id: sectorId,
    setor_id: sectorId,
    status: 'ativo',
    ativo: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as Profile;
}

describe('Módulo RH — Permissões de Acesso e Cadastros', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Validação de canAccessPage para o Módulo RH', () => {
    it('permite acesso a todas as páginas de cadastro para quem é do setor de RH', () => {
      const user = mockUser({ sector_id: '1' });
      expect(canAccessPage(user, 'rh')).toBe(true);
      expect(canAccessPage(user, 'rh_colaboradores')).toBe(true);
      expect(canAccessPage(user, 'rh_setores_cad')).toBe(true);
      expect(canAccessPage(user, 'rh_turnos_cad')).toBe(true);
      expect(canAccessPage(user, 'rh_percentual_he')).toBe(true);
      expect(canAccessPage(user, 'rh_rotas_cad')).toBe(true);
    });

    it('permite acesso irrestrito para administradores independentemente do setor', () => {
      const admin = mockUser({ roles: ['admin'], sector_id: '99' });
      expect(canAccessPage(admin, 'rh')).toBe(true);
      expect(canAccessPage(admin, 'rh_colaboradores')).toBe(true);
      expect(canAccessPage(admin, 'rh_setores_cad')).toBe(true);
      expect(canAccessPage(admin, 'rh_turnos_cad')).toBe(true);
      expect(canAccessPage(admin, 'rh_percentual_he')).toBe(true);
      expect(canAccessPage(admin, 'rh_rotas_cad')).toBe(true);
    });

    it('bloqueia colaboradores de outros setores sem permissão', () => {
      const comprador = mockUser({ roles: ['comprador'], sector_id: '2' });
      expect(canAccessPage(comprador, 'rh')).toBe(false);
      expect(canAccessPage(comprador, 'rh_colaboradores')).toBe(false);
      expect(canAccessPage(comprador, 'rh_setores_cad')).toBe(false);
    });

    it('respeita bloqueio individual em page_access para usuário do RH', () => {
      const user = mockUser({
        sector_id: '1',
        page_access: { rh_colaboradores: false },
      });
      expect(canAccessPage(user, 'rh')).toBe(true);
      expect(canAccessPage(user, 'rh_colaboradores')).toBe(false);
      expect(canAccessPage(user, 'rh_setores_cad')).toBe(true);
    });
  });

  describe('Tratamento de Erros e RLS em rhApi', () => {
    it('cria colaborador com sucesso quando autorizado', async () => {
      const mockPessoa = {
        id: 'p-1',
        registro: '173020703',
        nome: 'JOANDERSON LEITE DOS SANTOS',
        cargo: 'AUXILIAR DE SERVICOS GERAIS I',
        ativo: true,
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: mockPessoa, error: null }),
          }),
        }),
      } as any);

      const res = await criarRhPessoa({
        registro: '173020703',
        nome: 'JOANDERSON LEITE DOS SANTOS',
        cargo: 'AUXILIAR DE SERVICOS GERAIS I',
        situacao: 'ATIVO',
      });

      expect(res.registro).toBe('173020703');
      expect(res.nome).toBe('JOANDERSON LEITE DOS SANTOS');
    });

    it('cadastra colaborador PJ e valida mensagem de duplicidade de CPF', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "rh_pessoas_registro_key"',
                },
              }),
          }),
        }),
      } as any);

      await expect(
        criarRhPessoa({
          tipo_vinculo: 'PJ',
          registro: '123.456.789-00',
          nome: 'CONSULTORIA PRESTADORA LTDA',
        })
      ).rejects.toThrow(/Já existe um colaborador com o CPF 123.456.789-00/);
    });

    it('rejeita cadastro com identificador vazio dependendo do tipo_vinculo', async () => {
      await expect(
        criarRhPessoa({
          tipo_vinculo: 'PJ',
          registro: '',
          nome: 'EMPRESA PRESTADORA',
        })
      ).rejects.toThrow(/O campo CPF é obrigatório/);

      await expect(
        criarRhPessoa({
          tipo_vinculo: 'CLT',
          registro: '',
          nome: 'FUNCIONARIO CLT',
        })
      ).rejects.toThrow(/O campo matrícula é obrigatório/);
    });

    it('emite mensagem amigável quando o banco retorna violação de RLS (42501) ao criar colaborador', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'new row violates row-level security policy for table "rh_pessoas"',
                },
              }),
          }),
        }),
      } as any);

      await expect(
        criarRhPessoa({
          registro: '173020703',
          nome: 'JOANDERSON LEITE DOS SANTOS',
        })
      ).rejects.toThrow(/Permissão negada: seu usuário não possui autorização/);
    });

    it('emite mensagem amigável quando o banco retorna violação de RLS ao atualizar colaborador', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        update: () => ({
          eq: () =>
            Promise.resolve({
              error: {
                code: '42501',
                message: 'new row violates row-level security policy for table "rh_pessoas"',
              },
            }),
        }),
      } as any);

      await expect(
        atualizarRhPessoa('p-1', { cargo: 'ENCARREGADO' })
      ).rejects.toThrow(/Permissão negada: seu usuário não possui autorização/);
    });

    it('emite mensagem amigável em violação de RLS ao cadastrar setor', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'row-level security policy violated',
                },
              }),
          }),
        }),
      } as any);

      await expect(criarRhSetor('RECURSOS HUMANOS')).rejects.toThrow(
        /Permissão negada: seu usuário não possui autorização/
      );
    });

    it('emite mensagem amigável em violação de RLS ao cadastrar turno', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'row-level security policy violated',
                },
              }),
          }),
        }),
      } as any);

      await expect(criarRhTurno('1º TURNO 07:00-17:00')).rejects.toThrow(
        /Permissão negada: seu usuário não possui autorização/
      );
    });

    it('emite mensagem amigável em violação de RLS ao cadastrar percentual de HE', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: {
                  code: '42501',
                  message: 'row-level security policy violated',
                },
              }),
          }),
        }),
      } as any);

      await expect(criarRhHoraExtra('2026-09-22', 100)).rejects.toThrow(
        /Permissão negada: seu usuário não possui autorização/
      );
    });
  });
});

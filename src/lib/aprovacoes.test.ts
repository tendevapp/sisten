import { describe, expect, it } from 'vitest';
import type { Profile, Request } from '../types';
import { canAccessPage } from './pages';
import { podeAprovar, podeAlterarDecisao } from './solicitacoesCentral';

function mockUser(over: Partial<Profile> = {}): Profile {
  return {
    id: 'usr-1',
    name: 'Gestor Teste',
    email: 'gestor@ten.ind.br',
    cargo: 'Gerente de Manutencao',
    sector_id: 'sec-manutencao',
    roles: ['gestor'],
    status: 'ativo',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function mockCompra(over: Partial<Request> = {}): Request {
  return {
    id: 'req-compra-1',
    number: '3001234',
    type: 'compra',
    status: 'pendente',
    criticality: 4,
    solicitante_id: 'usr-requisitante',
    solicitante_name: 'Joao Silva',
    solicitante_sector_id: 'sec-manutencao',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    data_necessidade: '2026-09-10',
    justificativa: 'Pecas de reposicao para equipamento critico',
    ...over,
  };
}

describe('Aprovações de Compras para Gestores', () => {
  describe('Permissões de Acesso à Página (sol_aprovacoes)', () => {
    it('deve liberar acesso para gestor, admin e coordenador_suprimentos por padrão', () => {
      const gestor = mockUser({ roles: ['gestor'] });
      const admin = mockUser({ roles: ['admin'] });
      const coord = mockUser({ roles: ['coordenador_suprimentos'] });

      expect(canAccessPage(gestor, 'sol_aprovacoes')).toBe(true);
      expect(canAccessPage(admin, 'sol_aprovacoes')).toBe(true);
      expect(canAccessPage(coord, 'sol_aprovacoes')).toBe(true);
    });

    it('não deve liberar acesso para requisitante comum sem setor configurado', () => {
      const requisitante = mockUser({ roles: ['requisitante'], aprovador_setores: [] });
      expect(canAccessPage(requisitante, 'sol_aprovacoes')).toBe(false);
    });

    it('deve liberar acesso se o usuário tiver setores atribuídos em aprovador_setores', () => {
      const usuarioComSetor = mockUser({
        roles: ['requisitante'],
        aprovador_setores: ['sec-manutencao'],
      });
      expect(canAccessPage(usuarioComSetor, 'sol_aprovacoes')).toBe(true);
    });

    it('deve respeitar override explícito falso em page_access mesmo para gestor', () => {
      const gestorBloqueado = mockUser({
        roles: ['gestor'],
        page_access: { sol_aprovacoes: false },
      });
      expect(canAccessPage(gestorBloqueado, 'sol_aprovacoes')).toBe(false);
    });
  });

  describe('Elegibilidade de Aprovação (podeAprovar)', () => {
    it('gestor deve poder aprovar compras do setor que é responsável', () => {
      const gestor = mockUser({
        roles: ['gestor'],
        aprovador_setores: ['sec-manutencao'],
      });
      const compra = mockCompra({ solicitante_sector_id: 'sec-manutencao' });

      expect(podeAprovar(compra, gestor)).toBe(true);
    });

    it('gestor não deve aprovar compras de outros setores que não constam em aprovador_setores', () => {
      const gestor = mockUser({
        roles: ['gestor'],
        aprovador_setores: ['sec-manutencao'],
      });
      const compraAlmox = mockCompra({ solicitante_sector_id: 'sec-almoxarifado' });

      expect(podeAprovar(compraAlmox, gestor)).toBe(false);
    });

    it('admin e coordenador_suprimentos devem poder aprovar qualquer compra', () => {
      const admin = mockUser({ roles: ['admin'] });
      const coord = mockUser({ roles: ['coordenador_suprimentos'] });
      const compra = mockCompra({ solicitante_sector_id: 'qualquer-setor' });

      expect(podeAprovar(compra, admin)).toBe(true);
      expect(podeAprovar(compra, coord)).toBe(true);
    });

    it('não deve permitir aprovação se a solicitação não for do tipo compra', () => {
      const admin = mockUser({ roles: ['admin'] });
      const chamado = mockCompra({ type: 'chamado' });

      expect(podeAprovar(chamado, admin)).toBe(false);
    });
  });

  describe('Alteração de Decisão (podeAlterarDecisao)', () => {
    it('deve permitir alterar decisão enquanto a solicitação não estiver fechada ou resolvida', () => {
      const gestor = mockUser({
        roles: ['gestor'],
        aprovador_setores: ['sec-manutencao'],
      });
      const compraAprovada = mockCompra({ status: 'aprovada' });
      const compraRejeitada = mockCompra({ status: 'rejeitada' });
      const compraFechada = mockCompra({ status: 'fechado' });

      expect(podeAlterarDecisao(compraAprovada, gestor)).toBe(true);
      expect(podeAlterarDecisao(compraRejeitada, gestor)).toBe(true);
      expect(podeAlterarDecisao(compraFechada, gestor)).toBe(false);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  canAccessPage,
  canAccessFormGroup,
  canViewAllAse,
  canEditDesvioRid,
  canDeleteDesvioRid,
  FORMULARIO_SUBPERMISSOES,
  getPageGroups,
} from './pages';
import type { Profile } from '../types';

function mockUser(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'usr-1',
    name: 'Usuario Teste',
    email: 'teste@sisten.com',
    roles: ['requisitante'],
    setor_id: 'sec-1',
    ativo: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('pages.ts - Controle de Acesso', () => {
  describe('canAccessPage', () => {
    it('deve liberar tudo para administradores', () => {
      const admin = mockUser({ roles: ['admin'] });
      expect(canAccessPage(admin, 'inicio')).toBe(true);
      expect(canAccessPage(admin, 'admin_usuarios')).toBe(true);
      expect(canAccessPage(admin, 'formularios')).toBe(true);
    });

    it('deve respeitar páginas de acesso universal (*)', () => {
      const user = mockUser({ roles: ['requisitante'] });
      expect(canAccessPage(user, 'inicio')).toBe(true);
      expect(canAccessPage(user, 'formularios')).toBe(true);
      expect(canAccessPage(user, 'materiais_busca')).toBe(true);
    });

    it('deve respeitar restrições por role', () => {
      const user = mockUser({ roles: ['requisitante'] });
      expect(canAccessPage(user, 'sol_aprovacoes')).toBe(false);

      const gestor = mockUser({ roles: ['gestor'] });
      expect(canAccessPage(gestor, 'sol_aprovacoes')).toBe(true);
    });

    it('deve priorizar overrides em page_access para páginas editáveis', () => {
      const userBloqueado = mockUser({
        roles: ['requisitante'],
        page_access: { formularios: false },
      });
      expect(canAccessPage(userBloqueado, 'formularios')).toBe(false);

      const userLiberado = mockUser({
        roles: ['requisitante'],
        page_access: { sol_aprovacoes: true },
      });
      expect(canAccessPage(userLiberado, 'sol_aprovacoes')).toBe(true);
    });

    it('não deve permitir override para páginas alwaysAdmin', () => {
      const userTentaAdmin = mockUser({
        roles: ['requisitante'],
        page_access: { admin_usuarios: true },
      });
      expect(canAccessPage(userTentaAdmin, 'admin_usuarios')).toBe(false);
    });

    it('módulo de facilities deve ser restrito exclusivamente a Adriano e admins', () => {
      const admin = mockUser({ roles: ['admin'] });
      expect(canAccessPage(admin, 'facilities')).toBe(true);
      expect(canAccessPage(admin, 'facilities_rotas')).toBe(true);
      expect(canAccessPage(admin, 'facilities_materiais')).toBe(true);

      const adriano = mockUser({
        name: 'ADRIANO DA SILVA COSTA OLIVEIRA',
        email: 'adriano.oliveira@ten.ind.br',
        roles: ['visualizador'],
        sector_id: '3',
      });
      expect(canAccessPage(adriano, 'facilities')).toBe(true);
      expect(canAccessPage(adriano, 'facilities_rotas')).toBe(true);
      expect(canAccessPage(adriano, 'facilities_materiais')).toBe(true);

      const gestor = mockUser({ roles: ['gestor'] });
      expect(canAccessPage(gestor, 'facilities')).toBe(false);
      expect(canAccessPage(gestor, 'facilities_rotas')).toBe(false);
      expect(canAccessPage(gestor, 'facilities_materiais')).toBe(false);

      const coord = mockUser({ roles: ['coordenador_suprimentos'] });
      expect(canAccessPage(coord, 'facilities')).toBe(false);
      expect(canAccessPage(coord, 'facilities_rotas')).toBe(false);
      expect(canAccessPage(coord, 'facilities_materiais')).toBe(false);

      const outro = mockUser({ roles: ['requisitante'] });
      expect(canAccessPage(outro, 'facilities')).toBe(false);
    });
  });

  describe('canAccessFormGroup - Subpermissões de Formulários', () => {
    it('deve liberar todos os grupos para admin', () => {
      const admin = mockUser({ roles: ['admin'] });
      expect(canAccessFormGroup(admin, 'portaria')).toBe(true);
      expect(canAccessFormGroup(admin, 'logistica')).toBe(true);
      expect(canAccessFormGroup(admin, 'rh')).toBe(true);
      expect(canAccessFormGroup(admin, 'almoxarifado')).toBe(true);
    });

    it('se o usuário não tem acesso a formulários, deve bloquear todos os grupos', () => {
      const userSemForm = mockUser({
        roles: ['requisitante'],
        page_access: { formularios: false },
      });
      expect(canAccessFormGroup(userSemForm, 'portaria')).toBe(false);
      expect(canAccessFormGroup(userSemForm, 'logistica')).toBe(false);
      expect(canAccessFormGroup(userSemForm, 'rh')).toBe(false);
      expect(canAccessFormGroup(userSemForm, 'almoxarifado')).toBe(false);
    });

    it('se selecionar formulários (padrão), deve mostrar grupos gerais e restringir rh (ASE) a admin e gestor', () => {
      const userComForm = mockUser({ roles: ['requisitante'] });
      expect(canAccessFormGroup(userComForm, 'portaria')).toBe(true);
      expect(canAccessFormGroup(userComForm, 'logistica')).toBe(true);
      expect(canAccessFormGroup(userComForm, 'ssma')).toBe(true);
      expect(canAccessFormGroup(userComForm, 'almoxarifado')).toBe(true);
      // RH/ASE só aparece por padrão para admin e gestor
      expect(canAccessFormGroup(userComForm, 'rh')).toBe(false);

      const gestor = mockUser({ roles: ['gestor'] });
      expect(canAccessFormGroup(gestor, 'rh')).toBe(true);
      const admin = mockUser({ roles: ['admin'] });
      expect(canAccessFormGroup(admin, 'rh')).toBe(true);
    });

    it('deve respeitar subpermissões específicas desmarcadas pelo admin', () => {
      const userPortariaApenas = mockUser({
        roles: ['requisitante'],
        page_access: {
          formularios: true,
          form_portaria: true,
          form_logistica: false,
          form_rh: false,
          form_almoxarifado: false,
        },
      });

      expect(canAccessFormGroup(userPortariaApenas, 'portaria')).toBe(true);
      expect(canAccessFormGroup(userPortariaApenas, 'logistica')).toBe(false);
      expect(canAccessFormGroup(userPortariaApenas, 'rh')).toBe(false);
      expect(canAccessFormGroup(userPortariaApenas, 'almoxarifado')).toBe(false);
    });

    it('deve manter compatibilidade com flag legada rh_ase_hora_extra', () => {
      const userLegado = mockUser({
        roles: ['requisitante'],
        page_access: {
          rh_ase_hora_extra: false,
        },
      });
      expect(canAccessFormGroup(userLegado, 'rh')).toBe(false);
      expect(canAccessFormGroup(userLegado, 'portaria')).toBe(true);
    });
  });

  describe('canViewAllAse - Visibilidade de ASEs', () => {
    it('deve liberar visão total para admin, gestor e coordenador_suprimentos por padrão', () => {
      const admin = mockUser({ roles: ['admin'] });
      const gestor = mockUser({ roles: ['gestor'] });
      const coord = mockUser({ roles: ['coordenador_suprimentos'] });
      expect(canViewAllAse(admin)).toBe(true);
      expect(canViewAllAse(gestor)).toBe(true);
      expect(canViewAllAse(coord)).toBe(true);
    });

    it('usuário comum (requisitante) deve ver apenas as próprias por padrão', () => {
      const requisitante = mockUser({ roles: ['requisitante'] });
      expect(canViewAllAse(requisitante)).toBe(false);
    });

    it('deve respeitar override explícito em page_access', () => {
      const requisitanteLiberado = mockUser({
        roles: ['requisitante'],
        page_access: { rh_ase_ver_todas: true },
      });
      expect(canViewAllAse(requisitanteLiberado)).toBe(true);

      const gestorRestrito = mockUser({
        roles: ['gestor'],
        page_access: { rh_ase_ver_todas: false },
      });
      expect(canViewAllAse(gestorRestrito)).toBe(false);
    });
  });

  describe('canEditDesvioRid & canDeleteDesvioRid - Permissões do RID SSMA', () => {
    const desvioOutro = { criado_por: 'outro-usr', matricula_informante: '99999' };
    const desvioMeu = { criado_por: 'usr-1', matricula_informante: '12345' };
    const desvioLegadoMeu = { criado_por: null, matricula_informante: '12345' };

    it('administrador pode editar e excluir qualquer RID', () => {
      const admin = mockUser({ roles: ['admin'] });
      expect(canEditDesvioRid(admin, desvioOutro)).toBe(true);
      expect(canDeleteDesvioRid(admin, desvioOutro)).toBe(true);
    });

    it('usuario comum pode editar e excluir apenas o proprio RID', () => {
      const user = mockUser({ id: 'usr-1', matricula: '12345' });
      // Proprio
      expect(canEditDesvioRid(user, desvioMeu)).toBe(true);
      expect(canDeleteDesvioRid(user, desvioMeu)).toBe(true);
      // De outro usuario
      expect(canEditDesvioRid(user, desvioOutro)).toBe(false);
      expect(canDeleteDesvioRid(user, desvioOutro)).toBe(false);
    });

    it('usuario comum pode editar registro legado com base na matricula', () => {
      const user = mockUser({ id: 'usr-1', matricula: '12345' });
      expect(canEditDesvioRid(user, desvioLegadoMeu)).toBe(true);
    });

    it('override ssma_rid_editar_todas = true permite edicao e exclusao de todos', () => {
      const userComOverride = mockUser({
        id: 'usr-1',
        page_access: { ssma_rid_editar_todas: true },
      });
      expect(canEditDesvioRid(userComOverride, desvioOutro)).toBe(true);
      expect(canDeleteDesvioRid(userComOverride, desvioOutro)).toBe(true);
    });

    it('override ssma_rid_editar_todas = false restringe apenas ao proprio', () => {
      const gestorRestrito = mockUser({
        id: 'usr-1',
        roles: ['gestor'],
        page_access: { ssma_rid_editar_todas: false },
      });
      expect(canEditDesvioRid(gestorRestrito, desvioOutro)).toBe(false);
      expect(canEditDesvioRid(gestorRestrito, desvioMeu)).toBe(true);
    });
  });

  describe('FORMULARIO_SUBPERMISSOES & getPageGroups', () => {
    it('deve definir os 5 grupos essenciais de formulários incluindo SSMA', () => {
      const grupos = FORMULARIO_SUBPERMISSOES.map(s => s.grupoId);
      expect(grupos).toContain('portaria');
      expect(grupos).toContain('logistica');
      expect(grupos).toContain('rh');
      expect(grupos).toContain('almoxarifado');
      expect(grupos).toContain('ssma');
    });

    it('getPageGroups deve agrupar as páginas e feature flags', () => {
      const groups = getPageGroups();
      expect(groups.length).toBeGreaterThan(0);
      const geral = groups.find(g => g.group === 'GERAL');
      expect(geral).toBeDefined();
      expect(geral?.pages.some(p => p.id === 'formularios')).toBe(true);
      // O grupo RH legado isolado não deve mais existir em getPageGroups
      expect(groups.some(g => g.group === 'RH')).toBe(false);
    });
  });
});

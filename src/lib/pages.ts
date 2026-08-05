/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Registro único de páginas e feature flags do SISTEN — fonte da verdade
// consumida por Sidebar (menu), App (gate de rota) e AdminPanel (painel de
// "Módulos de acesso"). Antes deste arquivo, Sidebar.tsx e App.tsx tinham
// checagens de acesso divergentes para a mesma rota (ex.: Fornecedores).

import type { LucideIcon } from 'lucide-react';
import {
  Home, Search, BarChart3, PlusCircle, List, FileCheck, Database,
  LayoutDashboard, Upload, Users, Shield, Map, Settings, KeyRound, Radio,
  Truck, PackageSearch, Building2, History, Route, Activity, Boxes, Info,
  ClipboardList, FileText, Receipt, Scale, Sparkles,
} from 'lucide-react';
import { Profile, Role } from '../types';

export interface PageDef {
  /** Chave estável, usada como chave no JSON `profiles.page_access`. Nunca renomear. */
  id: string;
  group: string;
  label: string;
  /** Rota do menu/roteador. Ausente para feature flags (não são páginas). */
  path?: string;
  icon?: LucideIcon;
  /** '*' = acesso universal, todo perfil vê por padrão. */
  defaultRoles: Role[] | '*';
  /** Página administrativa: sempre restrita a admin, sem checkbox editável no painel. */
  alwaysAdmin?: boolean;
}

export const PAGES: PageDef[] = [
  { id: 'inicio', group: 'GERAL', label: 'Início', path: '/', icon: Home, defaultRoles: '*' },
  { id: 'materiais_busca', group: 'GERAL', label: 'Catálogo SAP', path: '/materiais/busca', icon: Search, defaultRoles: '*' },
  { id: 'rastreio', group: 'GERAL', label: 'Rastreio Compras', path: '/rastreio', icon: Route, defaultRoles: '*' },
  { id: 'relatorios', group: 'GERAL', label: 'Relatórios', path: '/relatorios', icon: BarChart3, defaultRoles: '*' },
  { id: 'sobre', group: 'GERAL', label: 'Sobre o SISTEN', path: '/sobre', icon: Info, defaultRoles: '*' },

  { id: 'sol_nova', group: 'SOLICITAÇÕES', label: 'Nova Solicitação', path: '/solicitacoes/nova', icon: PlusCircle, defaultRoles: '*' },
  { id: 'sol_minhas', group: 'SOLICITAÇÕES', label: 'Minhas Solicitações', path: '/solicitacoes/minhas', icon: List, defaultRoles: '*' },
  // Fila coletiva: quem opera a fila vê todas as solicitações em aberto,
  // acompanha e responde. Complementa 'minhas' (as próprias) e 'aprovações'
  // (a decisão do gestor).
  { id: 'sol_todas', group: 'SOLICITAÇÕES', label: 'Solicitações', path: '/solicitacoes/todas', icon: ClipboardList, defaultRoles: ['requisitante', 'gestor', 'comprador', 'coordenador_suprimentos', 'admin'] },
  // Correção de incoerência: o App.tsx aceitava coordenador_suprimentos por
  // engano (Sidebar nunca prometeu isso no menu). Padrão alinhado ao menu.
  { id: 'sol_aprovacoes', group: 'SOLICITAÇÕES', label: 'Aprovações', path: '/solicitacoes/aprovacoes', icon: FileCheck, defaultRoles: ['gestor', 'admin'] },

  { id: 'sup_cadastros_sap', group: 'SUPRIMENTOS', label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  { id: 'sup_painel', group: 'SUPRIMENTOS', label: 'Painel SAP', path: '/suprimentos/painel', icon: Database, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  // Correção de incoerência: menu prometia coordenador_suprimentos, App.tsx
  // só liberava admin/comprador. Padrão alinhado ao menu (permissão sap.fornecedores).
  { id: 'sup_fornecedores', group: 'SUPRIMENTOS', label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_central_compras', group: 'SUPRIMENTOS', label: 'Central Compras', path: '/suprimentos/fornecedores-sem-po', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_analise_cotacoes', group: 'SUPRIMENTOS', label: 'Análise Cotações', path: '/suprimentos/analise-cotacoes', icon: Scale, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_historico', group: 'SUPRIMENTOS', label: 'Histórico', path: '/suprimentos/historico', icon: History, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_contratos', group: 'SUPRIMENTOS', label: 'Contratos', path: '/suprimentos/contratos', icon: FileText, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_dashboards', group: 'SUPRIMENTOS', label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'coordenador_suprimentos'] },
  { id: 'sup_estimador_frete', group: 'SUPRIMENTOS', label: 'Estimador de Frete', path: '/suprimentos/frete', icon: Truck, defaultRoles: ['admin', 'comprador'] },
  { id: 'sup_importar', group: 'SUPRIMENTOS', label: 'Importar SAP', path: '/suprimentos/importar', icon: Upload, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },

  { id: 'almox_estoque', group: 'ALMOXARIFADO', label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_dashboards', group: 'ALMOXARIFADO', label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  { id: 'fin_contas_pagar', group: 'FINANCEIRO', label: 'Contas a Pagar', path: '/financeiro/contas-pagar', icon: Receipt, defaultRoles: ['admin'] },
  { id: 'fin_contas_pagar_analise', group: 'FINANCEIRO', label: 'Análise', path: '/financeiro/contas-pagar/analise', icon: BarChart3, defaultRoles: ['admin'] },

  { id: 'helpdesk_atendimento', group: 'HELPDESK', label: 'Atendimento', path: '/helpdesk', icon: Radio, defaultRoles: ['atendente', 'admin'] },
  { id: 'helpdesk_relatorios', group: 'HELPDESK', label: 'Relatórios Helpdesk', path: '/helpdesk/relatorios', icon: BarChart3, defaultRoles: ['atendente', 'admin'] },

  { id: 'admin_uso', group: 'ADMINISTRAÇÃO', label: 'Uso do App', path: '/admin/uso', icon: Activity, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_usuarios', group: 'ADMINISTRAÇÃO', label: 'Usuários', path: '/admin/usuarios', icon: Users, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_setores', group: 'ADMINISTRAÇÃO', label: 'Setores', path: '/admin/setores', icon: Map, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_permissoes', group: 'ADMINISTRAÇÃO', label: 'Permissões', path: '/admin/permissoes', icon: Shield, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_importacao_materiais', group: 'ADMINISTRAÇÃO', label: 'Import. Materiais', path: '/admin/importacao-materiais', icon: Upload, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_importar_sap_log', group: 'ADMINISTRAÇÃO', label: 'Log Importação SAP', path: '/suprimentos/importar/log', icon: List, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_grupos_comprador', group: 'ADMINISTRAÇÃO', label: 'Grupos Comprador', path: '/suprimentos/grupos-comprador', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_helpdesk_config', group: 'ADMINISTRAÇÃO', label: 'Config. Helpdesk', path: '/admin/helpdesk', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_teste', group: 'ADMINISTRAÇÃO', label: 'Teste', path: '/admin/teste', icon: Sparkles, defaultRoles: ['admin'], alwaysAdmin: true },
];

// Feature flags: sub-permissões que não são páginas próprias (sem path/icon),
// controladas pelo mesmo mecanismo de override em profiles.page_access.
export const FEATURE_FLAGS: PageDef[] = [
  {
    id: 'rastreio_valores',
    group: 'DADOS SENSÍVEIS',
    label: 'Ver valores de compra (Rastreio Compras)',
    defaultRoles: ['comprador', 'coordenador_suprimentos', 'gestor', 'admin'],
  },
  // Sem role padrão: quem recebe notificação de chamado jurídico é decidido
  // usuário a usuário pelo admin (aqui mesmo, em Módulos de Acesso), não por
  // papel — o time jurídico não necessariamente tem um setor/role próprio.
  {
    id: 'juridico_notificar',
    group: 'HELPDESK',
    label: 'Chamados Jurídicos (receber notificações)',
    defaultRoles: [],
  },
];

const ALL_ENTRIES: PageDef[] = [...PAGES, ...FEATURE_FLAGS];
const BY_ID: Record<string, PageDef> = Object.fromEntries(ALL_ENTRIES.map(p => [p.id, p]));

export function canAccessPage(user: Profile, pageId: string): boolean {
  if (user.roles.includes('admin')) return true;

  const def = BY_ID[pageId];
  if (!def) return false;

  const override = user.page_access?.[pageId];
  if (override !== undefined && !def.alwaysAdmin) return override;

  if (def.defaultRoles === '*') return true;
  return def.defaultRoles.some(r => user.roles.includes(r));
}

export function pageIdForPath(path: string): string | undefined {
  return PAGES.find(p => p.path === path)?.id;
}

export function getPageGroups(): { group: string; pages: PageDef[] }[] {
  const groups: { group: string; pages: PageDef[] }[] = [];
  for (const entry of ALL_ENTRIES) {
    let g = groups.find(x => x.group === entry.group);
    if (!g) { g = { group: entry.group, pages: [] }; groups.push(g); }
    g.pages.push(entry);
  }
  return groups;
}

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
  ClipboardList, FileText, Receipt, Flag, BookOpen, ArrowLeftRight, CalendarDays,
  FileSpreadsheet, Cpu, ClipboardPlus, ReceiptText, Wrench, UserCog, Clock, Percent,
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
  { id: 'formularios', group: 'GERAL', label: 'Formulários', path: '/formularios', icon: ClipboardPlus, defaultRoles: '*' },
  { id: 'materiais_busca', group: 'GERAL', label: 'Catálogo SAP', path: '/materiais/busca', icon: Search, defaultRoles: '*' },
  { id: 'rastreio', group: 'GERAL', label: 'Rastreio Compras', path: '/rastreio', icon: Route, defaultRoles: '*' },
  { id: 'relatorios', group: 'GERAL', label: 'Relatórios', path: '/relatorios', icon: BarChart3, defaultRoles: '*' },
  { id: 'sobre', group: 'GERAL', label: 'Sobre o SISTEN', path: '/sobre', icon: Info, defaultRoles: '*' },

  // Central de Solicitações: uma página só, com abas de escopo. Antes eram
  // três telas (Minhas, a fila coletiva e Aprovações) sobre a mesma tabela,
  // cada uma com o seu recorte — e ninguém sabia em qual procurar. Os ids
  // `sol_minhas`, `sol_todas` e `sol_aprovacoes` sobrevivem como permissões
  // (ver FEATURE_FLAGS): agora liberam abas, não páginas.
  { id: 'solicitacoes_home', group: 'SOLICITAÇÕES', label: 'Solicitações', path: '/solicitacoes', icon: ClipboardList, defaultRoles: '*' },
  { id: 'sol_aprovacoes', group: 'SOLICITAÇÕES', label: 'Aprovações', path: '/solicitacoes/aprovacoes', icon: FileCheck, defaultRoles: ['gestor', 'admin', 'coordenador_suprimentos'] },
  { id: 'sol_nova', group: 'SOLICITAÇÕES', label: 'Nova Solicitação', path: '/solicitacoes/nova', icon: PlusCircle, defaultRoles: '*' },

  { id: 'suprimentos_home', group: 'SUPRIMENTOS', label: 'Suprimentos', path: '/suprimentos', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_cadastros_sap', group: 'SUPRIMENTOS', label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  // Correção de incoerência: menu prometia coordenador_suprimentos, App.tsx
  // só liberava admin/comprador. Padrão alinhado ao menu (permissão sap.fornecedores).
  { id: 'sup_fornecedores', group: 'SUPRIMENTOS', label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  // `id` é chave de `profiles.page_access` e não muda; só o endereço saiu de
  // `/suprimentos/fornecedores-sem-po` (nome do recorte inicial) para
  // `/suprimentos/compras`. O antigo é redirecionado em App.tsx.
  { id: 'sup_central_compras', group: 'SUPRIMENTOS', label: 'Central Compras', path: '/suprimentos/compras', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_analise_cotacoes', group: 'SUPRIMENTOS', label: 'Análise de Cotações', path: '/suprimentos/cotacoes', icon: FileSpreadsheet, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_historico', group: 'SUPRIMENTOS', label: 'Histórico', path: '/suprimentos/historico', icon: History, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_contratos', group: 'SUPRIMENTOS', label: 'Contratos', path: '/suprimentos/contratos', icon: FileText, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_dashboards', group: 'SUPRIMENTOS', label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'coordenador_suprimentos'] },
  { id: 'sup_estimador_frete', group: 'SUPRIMENTOS', label: 'Estimador de Frete', path: '/suprimentos/frete', icon: Truck, defaultRoles: ['admin', 'comprador'] },
  { id: 'sup_pendencias_processamento', group: 'SUPRIMENTOS', label: 'Pendências de Processamento', path: '/suprimentos/pendencias-processamento', icon: ReceiptText, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  // Diligenciamento não tem página/permissão própria: é o filtro "Sem MIGO"
  // dentro de Central de Compras (sup_central_compras), em
  // components/suprimentos/DiligenciamentoSemMigoTable.tsx.

  { id: 'almoxarifado_home', group: 'ALMOXARIFADO', label: 'Almoxarifado', path: '/almoxarifado', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_estoque', group: 'ALMOXARIFADO', label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_movimentacoes', group: 'ALMOXARIFADO', label: 'Movimentações', path: '/almoxarifado/movimentacoes', icon: ArrowLeftRight, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_consumo_semanal', group: 'ALMOXARIFADO', label: 'Consumo Semanal', path: '/almoxarifado/consumo-semanal', icon: CalendarDays, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_dashboards', group: 'ALMOXARIFADO', label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  // Módulo Facilities — tela inicial (hub) + páginas de cadastro e relatórios
  // alimentados pelos formulários de Portaria e RH/ASE. No Sidebar, o próprio
  // nome do grupo "FACILITIES" vira o botão para a tela inicial (ver GROUP_HOME
  // em Sidebar.tsx); os itens abaixo são as subpáginas expansíveis.
  { id: 'facilities', group: 'FACILITIES', label: 'Facilities', path: '/facilities', icon: Building2, defaultRoles: ['admin'] },
  { id: 'facilities_rotas', group: 'FACILITIES', label: 'Cadastro de Rotas', path: '/facilities/rotas', icon: Route, defaultRoles: ['admin'] },
  { id: 'facilities_materiais', group: 'FACILITIES', label: 'Materiais da Vigilância', path: '/facilities/materiais', icon: Shield, defaultRoles: ['admin'] },
  { id: 'facilities_servicos', group: 'FACILITIES', label: 'Lista de Serviços', path: '/facilities/servicos', icon: Wrench, defaultRoles: ['admin'] },

  // Módulo RH — mesmo desenho do Facilities: o nome do grupo abre o hub e as
  // subpáginas são os cadastros das tabelas de RH. Acesso restrito a
  // administradores e a quem é do setor de RH (ver `canAccessPage`).
  { id: 'rh', group: 'RH', label: 'RH', path: '/rh', icon: UserCog, defaultRoles: ['admin'] },
  { id: 'rh_colaboradores', group: 'RH', label: 'Colaboradores', path: '/rh/colaboradores', icon: Users, defaultRoles: ['admin'] },
  { id: 'rh_setores_cad', group: 'RH', label: 'Setores do RH', path: '/rh/setores', icon: Map, defaultRoles: ['admin'] },
  { id: 'rh_turnos_cad', group: 'RH', label: 'Turnos', path: '/rh/turnos', icon: Clock, defaultRoles: ['admin'] },
  { id: 'rh_rotas_cad', group: 'RH', label: 'Rotas de Transporte', path: '/rh/rotas', icon: Route, defaultRoles: ['admin'] },
  { id: 'rh_percentual_he', group: 'RH', label: 'Percentual de Hora Extra', path: '/rh/percentual-he', icon: Percent, defaultRoles: ['admin'] },

  { id: 'financeiro_home', group: 'FINANCEIRO', label: 'Financeiro', path: '/financeiro', icon: Receipt, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'fin_contas_pagar', group: 'FINANCEIRO', label: 'Contas a Pagar', path: '/financeiro/contas-pagar', icon: Receipt, defaultRoles: ['admin'] },
  { id: 'fin_contas_pagar_analise', group: 'FINANCEIRO', label: 'Análise', path: '/financeiro/contas-pagar/analise', icon: BarChart3, defaultRoles: ['admin'] },
  { id: 'fin_reconciliacao_pedidos', group: 'FINANCEIRO', label: 'Reconciliação PO x Pgto', path: '/financeiro/reconciliacao-pedidos', icon: FileCheck, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  // O hub não pode usar `/helpdesk` (já é a tela de Atendimento), então navega
  // para `/helpdesk/inicio`.
  { id: 'helpdesk_home', group: 'HELPDESK', label: 'Helpdesk', path: '/helpdesk/inicio', icon: Radio, defaultRoles: ['atendente', 'admin'] },
  { id: 'helpdesk_atendimento', group: 'HELPDESK', label: 'Atendimento', path: '/helpdesk', icon: Radio, defaultRoles: ['atendente', 'admin'] },
  { id: 'helpdesk_relatorios', group: 'HELPDESK', label: 'Relatórios Helpdesk', path: '/helpdesk/relatorios', icon: BarChart3, defaultRoles: ['atendente', 'admin'] },

  { id: 'admin_home', group: 'ADMINISTRAÇÃO', label: 'Administração', path: '/admin', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_uso', group: 'ADMINISTRAÇÃO', label: 'Uso do App', path: '/admin/uso', icon: Activity, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_usuarios', group: 'ADMINISTRAÇÃO', label: 'Usuários', path: '/admin/usuarios', icon: Users, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_cadastros', group: 'ADMINISTRAÇÃO', label: 'Cadastros Gerais', path: '/admin/cadastros', icon: Database, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_setores', group: 'ADMINISTRAÇÃO', label: 'Setores', path: '/admin/setores', icon: Map, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_permissoes', group: 'ADMINISTRAÇÃO', label: 'Permissões', path: '/admin/permissoes', icon: Shield, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  // Um só item de menu para a aba "Importação de Planilhas" — Suprimentos
  // (Catálogo + SAP), Almoxarifado, Financeiro e RH vivem todos empilhados
  // nessa mesma página agora (sem sub-abas), então três links de menu
  // apontando pro mesmo lugar (como havia antes) seria redundante.
  { id: 'admin_importacao_materiais', group: 'ADMINISTRAÇÃO', label: 'Importação de Planilhas', path: '/admin/importacao-materiais', icon: Upload, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_importar_sap_log', group: 'ADMINISTRAÇÃO', label: 'Log Importação SAP', path: '/suprimentos/importar/log', icon: List, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_grupos_comprador', group: 'ADMINISTRAÇÃO', label: 'Grupos Comprador', path: '/suprimentos/grupos-comprador', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_helpdesk_config', group: 'ADMINISTRAÇÃO', label: 'Config. Helpdesk', path: '/admin/helpdesk', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_feedback', group: 'ADMINISTRAÇÃO', label: 'Reportes', path: '/admin/feedback', icon: Flag, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_apis', group: 'ADMINISTRAÇÃO', label: 'Gestão de APIs & IA', path: '/admin/apis', icon: Cpu, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_diretrizes', group: 'ADMINISTRAÇÃO', label: 'Diretrizes', path: '/admin/diretrizes', icon: BookOpen, defaultRoles: ['admin'], alwaysAdmin: true },
];

// Feature flags: sub-permissões que não são páginas próprias (sem path/icon),
// controladas pelo mesmo mecanismo de override em profiles.page_access.
export const FEATURE_FLAGS: PageDef[] = [
  // Abas da Central de Solicitações. Continuam com o mesmo `id` de quando eram
  // páginas próprias, para que o `page_access` já gravado nos perfis siga
  // valendo — desmarcar aqui esconde a aba, como antes escondia o item de menu.
  {
    id: 'sol_minhas',
    group: 'SOLICITAÇÕES',
    label: 'Solicitações: aba "Minhas"',
    defaultRoles: '*',
  },
  {
    id: 'sol_todas',
    group: 'SOLICITAÇÕES',
    label: 'Solicitações: aba "Todas" (fila coletiva)',
    defaultRoles: ['requisitante', 'gestor', 'comprador', 'coordenador_suprimentos', 'admin'],
  },
  {
    id: 'rastreio_valores',
    group: 'DADOS SENSÍVEIS',
    label: 'Ver valores de compra (Rastreio Compras)',
    defaultRoles: ['comprador', 'coordenador_suprimentos', 'gestor', 'admin'],
  },
  // Sem role padrão: não existe um papel "almoxarifado" no sistema — o
  // acesso é concedido usuário a usuário pelo admin (Módulos de Acesso),
  // igual ao padrão já usado em `juridico_notificar` abaixo.
  {
    id: 'rastreio_almoxarifado',
    group: 'DADOS SENSÍVEIS',
    label: 'Marcar chegada no almoxarifado (Rastreio Compras)',
    defaultRoles: [],
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
  // Sub-permissões de grupos de formulários
  {
    id: 'form_portaria',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Formulários: Portaria & Segurança',
    defaultRoles: '*',
  },
  {
    id: 'form_logistica',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Formulários: Logística & Expedição',
    defaultRoles: '*',
  },
  {
    id: 'form_rh',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Formulários: RH & Dep. Pessoal (ASE)',
    defaultRoles: ['admin', 'gestor'],
  },
  {
    id: 'form_almoxarifado',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Formulários: Almoxarifado',
    defaultRoles: '*',
  },
  {
    id: 'form_ssma',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Formulários: SSMA (Saúde, Segurança e Meio Ambiente)',
    defaultRoles: '*',
  },
  {
    id: 'rh_ase_ver_todas',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'ASE: Ver todas as solicitações (se desmarcado, vê apenas as próprias)',
    defaultRoles: ['admin', 'gestor', 'coordenador_suprimentos'],
  },
  {
    id: 'ssma_rid_editar_todas',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'RID: Editar todos os desvios (se desmarcado, edita apenas os criados pelo próprio usuário)',
    defaultRoles: ['admin'],
  },
];

export interface FormularioSubpermissaoDef {
  id: string;
  grupoId: string;
  label: string;
  descricao: string;
  defaultRoles: Role[] | '*';
}

export const FORMULARIO_SUBPERMISSOES: FormularioSubpermissaoDef[] = [
  {
    id: 'form_portaria',
    grupoId: 'portaria',
    label: 'Portaria & Segurança Patrimonial',
    descricao: 'Equipamentos, Transportes, Carretas, Relatório de Portaria e Briefing',
    defaultRoles: '*',
  },
  {
    id: 'form_logistica',
    grupoId: 'logistica',
    label: 'Logística & Expedição',
    descricao: 'Carregamento de tramos, horários e fotos de expedição',
    defaultRoles: '*',
  },
  {
    id: 'form_rh',
    grupoId: 'rh',
    label: 'RH & Departamento Pessoal',
    descricao: 'Autorização de Serviços Extraordinários (ASE - Hora Extra)',
    defaultRoles: ['admin', 'gestor'],
  },
  {
    id: 'form_almoxarifado',
    grupoId: 'almoxarifado',
    label: 'Almoxarifado',
    descricao: 'Formulários operacionais do almoxarifado (em breve)',
    defaultRoles: '*',
  },
  {
    id: 'form_ssma',
    grupoId: 'ssma',
    label: 'SSMA - Saúde, Segurança e Meio Ambiente',
    descricao: 'Registro de Identificação de Desvio (RID) e relatórios preventivos',
    defaultRoles: '*',
  },
];

const ALL_ENTRIES: PageDef[] = [...PAGES, ...FEATURE_FLAGS];
const BY_ID: Record<string, PageDef> = Object.fromEntries(ALL_ENTRIES.map(p => [p.id, p]));

/**
 * Identifica se o usuário é o responsável pelo módulo de Facilities (Adriano Oliveira).
 */
export function isUserAdriano(user: Profile): boolean {
  const email = (user.email || '').toLowerCase().trim();
  const name = (user.name || '').toLowerCase().trim();
  return (
    email.startsWith('adriano.oliveira') ||
    email === 'adriano@ten.ind.br' ||
    name.includes('adriano da silva costa') ||
    (name.includes('adriano') && user.sector_id === '3')
  );
}

/** Setor "RH" em `core_setores` — dono do módulo de RH. */
export const SETOR_RH_ID = '1';

/** O usuário pertence ao setor de RH? */
export function isUserSetorRh(user: Profile): boolean {
  return user.sector_id === SETOR_RH_ID;
}

export function canAccessPage(user: Profile, pageId: string): boolean {
  if (user.roles.includes('admin')) return true;

  const def = BY_ID[pageId];
  if (!def) return false;

  // Módulo RH: administradores e o pessoal do setor de RH. O admin pode ainda
  // liberar ou bloquear página a página pelo painel de Módulos de Acesso.
  if (def.group === 'RH') {
    if (!isUserSetorRh(user)) return false;
    const override = user.page_access?.[pageId];
    if (override !== undefined) return override;
    return true;
  }

  // Módulo Facilities: restrito estritamente a Administradores e ao Adriano
  if (def.group === 'FACILITIES' || pageId.startsWith('facilities')) {
    if (!isUserAdriano(user)) return false;
    const override = user.page_access?.[pageId];
    if (override !== undefined) return override;
    return true;
  }

  const override = user.page_access?.[pageId];
  if (override !== undefined && !def.alwaysAdmin) return override;

  // Aprovador de compras: libera tambem se o usuario tiver setores sob aprovacao
  if (pageId === 'sol_aprovacoes' && (user.aprovador_setores?.length ?? 0) > 0) {
    return true;
  }

  if (def.defaultRoles === '*') return true;
  return def.defaultRoles.some(r => user.roles.includes(r));
}

/**
 * Avalia se o usuário pode ver/acessar um grupo específico de formulários.
 * Regra: se o módulo "Formulários" está selecionado/habilitado, todos os grupos
 * são exibidos por padrão, a menos que uma subpermissão tenha sido desmarcada
 * individualmente pelo administrador em Módulos de Acesso.
 */
export function canAccessFormGroup(user: Profile, grupoId: string): boolean {
  if (user.roles.includes('admin')) return true;
  if (!canAccessPage(user, 'formularios')) return false;

  const sub = FORMULARIO_SUBPERMISSOES.find(s => s.grupoId === grupoId);
  if (!sub) return true;

  const override = user.page_access?.[sub.id];
  if (override !== undefined) return override;

  // Compatibilidade com flag legada rh_ase_hora_extra se existir
  if (grupoId === 'rh' && user.page_access?.['rh_ase_hora_extra'] !== undefined) {
    return user.page_access['rh_ase_hora_extra'];
  }

  // Se nao houver override explicito, respeita as roles padrao da subpermissao
  if (sub.defaultRoles === '*') return true;
  return sub.defaultRoles.some(r => user.roles.includes(r));
}

/**
 * Determina se o usuário pode visualizar todas as solicitações de ASE na lista ou apenas as que ele mesmo criou.
 * - Admin, gestor e coordenador_suprimentos veem todas por padrão.
 * - Usuários comuns (requisitante, etc.) veem apenas as próprias por padrão.
 * - Override em `user.page_access['rh_ase_ver_todas']` tem precedência absoluta.
 */
export function canViewAllAse(user: Profile): boolean {
  if (user.roles.includes('admin')) return true;
  const override = user.page_access?.['rh_ase_ver_todas'];
  if (override !== undefined) return override;
  return user.roles.some(r => ['gestor', 'coordenador_suprimentos'].includes(r));
}

/**
 * Determina se o usuário pode editar/alterar um registro de desvio RID.
 * Regra: todos os usuários podem ver todas as RIDs, mas editar apenas as que ele próprio criou.
 * Administradores e usuários com override 'ssma_rid_editar_todas' podem editar qualquer RID.
 */
export function canEditDesvioRid(
  user: Profile,
  desvio: { criado_por?: string | null; matricula_informante?: string | null }
): boolean {
  if (user.roles.includes('admin')) return true;
  const override = user.page_access?.['ssma_rid_editar_todas'];
  if (override !== undefined) {
    if (override) return true;
    return !!(desvio.criado_por && desvio.criado_por === user.id);
  }
  // Padrão: autor do registro
  if (desvio.criado_por && desvio.criado_por === user.id) return true;
  // Compatibilidade com registros legados
  if (
    !desvio.criado_por &&
    desvio.matricula_informante &&
    user.matricula &&
    desvio.matricula_informante === user.matricula
  ) {
    return true;
  }
  return false;
}

/**
 * Determina se o usuário pode excluir ou restaurar um registro de desvio RID.
 */
export function canDeleteDesvioRid(
  user: Profile,
  desvio: { criado_por?: string | null }
): boolean {
  if (user.roles.includes('admin')) return true;
  const override = user.page_access?.['ssma_rid_editar_todas'];
  if (override) return true;
  return !!(desvio.criado_por && desvio.criado_por === user.id);
}

export function pageIdForPath(path: string): string | undefined {
  return PAGES.find(p => p.path === path)?.id;
}

/**
 * Ordem dos módulos no menu lateral.
 *
 * Mora aqui, e não no Sidebar, porque é a mesma fonte da verdade das páginas:
 * quando essa lista vivia dentro do componente, um módulo novo em `PAGES`
 * simplesmente não aparecia no menu, sem erro nenhum. O teste
 * `pages.test.ts` garante que todo grupo de `PAGES` esteja listado.
 */
export const GROUP_ORDER = [
  'GERAL', 'SOLICITAÇÕES', 'SUPRIMENTOS', 'ALMOXARIFADO', 'FACILITIES', 'RH',
  'FINANCEIRO', 'HELPDESK', 'ADMINISTRAÇÃO',
] as const;

export function getPageGroups(): { group: string; pages: PageDef[] }[] {
  const groups: { group: string; pages: PageDef[] }[] = [];
  for (const entry of ALL_ENTRIES) {
    let g = groups.find(x => x.group === entry.group);
    if (!g) { g = { group: entry.group, pages: [] }; groups.push(g); }
    g.pages.push(entry);
  }
  return groups;
}


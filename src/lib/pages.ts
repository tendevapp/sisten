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
  Truck, PackageSearch, Building2, History, Route, Activity, Boxes, Info, Link2,
  ClipboardList, FileText, Receipt, Flag, BookOpen, ArrowLeftRight, CalendarDays,
  FileSpreadsheet, Cpu, ClipboardPlus, ReceiptText, Wrench, UserCog, Clock, Percent,
  ClipboardCheck, KanbanSquare, ListChecks, Factory, Calculator, Flame, Car, FolderTree,
} from 'lucide-react';
import { Profile, Role, Sector } from '../types';
import { INITIAL_SECTORS } from '../data/sectors';

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
  { id: 'sol_nova', group: 'SOLICITAÇÕES', label: 'Nova Solicitação', path: '/solicitacoes/nova', icon: PlusCircle, defaultRoles: '*' },
  { id: 'sol_aprovacoes', group: 'SOLICITAÇÕES', label: 'Aprovações', path: '/solicitacoes/aprovacoes', icon: FileCheck, defaultRoles: ['gestor', 'admin', 'coordenador_suprimentos'] },

  // Módulo Demandas — quadro de tarefas (Planner/Trello) por setor. Grupo de
  // topo, visível para todos; sem hub próprio (o grupo lista os itens direto,
  // como GERAL). A visibilidade de cada quadro é por setor + compartilhamento
  // (ver lib/demandasAcesso.ts); o admin amplia a visão de um gestor pelo
  // campo "Setores de Demandas" no modal de Governança.
  { id: 'demandas', group: 'DEMANDAS', label: 'Demandas', path: '/demandas', icon: KanbanSquare, defaultRoles: '*' },
  { id: 'demandas_minhas', group: 'DEMANDAS', label: 'Minhas tarefas', path: '/demandas/minhas', icon: ListChecks, defaultRoles: '*' },

  { id: 'suprimentos_home', group: 'SUPRIMENTOS', label: 'Suprimentos', path: '/suprimentos', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_cadastros_sap', group: 'SUPRIMENTOS', label: 'Cadastros SAP', path: '/suprimentos/cadastros-sap', icon: KeyRound, defaultRoles: ['admin', 'coordenador_suprimentos', 'comprador'] },
  // `id` é chave de `profiles.page_access` e não muda; só o endereço saiu de
  // `/suprimentos/fornecedores-sem-po` (nome do recorte inicial) para
  // `/suprimentos/compras`. O antigo é redirecionado em App.tsx.
  { id: 'sup_central_compras', group: 'SUPRIMENTOS', label: 'Central Compras', path: '/suprimentos/compras', icon: PackageSearch, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_analise_cotacoes', group: 'SUPRIMENTOS', label: 'Análise de Cotações', path: '/suprimentos/cotacoes', icon: FileSpreadsheet, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_pendencias_processamento', group: 'SUPRIMENTOS', label: 'Pendências de Processamento', path: '/suprimentos/pendencias-processamento', icon: ReceiptText, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  // Correção de incoerência: menu prometia coordenador_suprimentos, App.tsx
  // só liberava admin/comprador. Padrão alinhado ao menu (permissão sap.fornecedores).
  { id: 'sup_fornecedores', group: 'SUPRIMENTOS', label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Building2, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_estimador_frete', group: 'SUPRIMENTOS', label: 'Fretes', path: '/suprimentos/frete', icon: Truck, defaultRoles: ['admin', 'comprador'] },
  { id: 'sup_dashboards', group: 'SUPRIMENTOS', label: 'Dashboards', path: '/suprimentos/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'coordenador_suprimentos'] },
  { id: 'sup_historico_cotacoes', group: 'SUPRIMENTOS', label: 'Histórico de Cotações', path: '/suprimentos/cotacoes/historico', icon: History, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_vinculos_cotacoes', group: 'SUPRIMENTOS', label: 'Vínculos & Auditoria de Cotações', path: '/suprimentos/cotacoes/vinculos', icon: Link2, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_historico', group: 'SUPRIMENTOS', label: 'Histórico', path: '/suprimentos/historico', icon: History, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_contratos', group: 'SUPRIMENTOS', label: 'Contratos', path: '/suprimentos/contratos', icon: FileText, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'sup_calc_impostos', group: 'SUPRIMENTOS', label: 'Calc Impostos', path: '/suprimentos/calc-impostos', icon: Calculator, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  // Diligenciamento não tem página/permissão própria: é o filtro "Sem MIGO"
  // dentro de Central de Compras (sup_central_compras), em
  // components/suprimentos/DiligenciamentoSemMigoTable.tsx.

  { id: 'almoxarifado_home', group: 'ALMOXARIFADO', label: 'Almoxarifado', path: '/almoxarifado', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_abrir_rm', group: 'ALMOXARIFADO', label: 'Abrir RM', path: '/almoxarifado/abrir-rm', icon: ClipboardCheck, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_estoque', group: 'ALMOXARIFADO', label: 'Estoque', path: '/almoxarifado/estoque', icon: Boxes, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_movimentacoes', group: 'ALMOXARIFADO', label: 'Movimentações', path: '/almoxarifado/movimentacoes', icon: ArrowLeftRight, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_consumo_semanal', group: 'ALMOXARIFADO', label: 'Consumo Semanal', path: '/almoxarifado/consumo-semanal', icon: CalendarDays, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'almox_dashboards', group: 'ALMOXARIFADO', label: 'Dashboards', path: '/almoxarifado/dashboards', icon: LayoutDashboard, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  // Projetos entra com UMA linha no menu: o hub. As sub-rotas
  // (/almoxarifado/projetos/bom, /recebimento, /premontagem, /producao,
  // /posicao, /sobressalentes, /paineis) existem no switch do App.tsx e usam
  // este mesmo `id` como gate — mesmo desenho de
  // `/almoxarifado/movimentacoes/giro`. Oito itens de menu para um módulo só
  // afogariam o grupo.
  { id: 'almox_projetos', group: 'ALMOXARIFADO', label: 'Projetos', path: '/almoxarifado/projetos', icon: Factory, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

  // Módulo Produção — liberação de qualidade da fabricação de torres (corte a
  // plasma, chanfro, calandra, solda e as etapas seguintes), migrado do
  // sistema NAV1 (TEN Nordeste). Sem role própria no catálogo hoje — acesso
  // ao hub fica com admin por padrão, e o admin libera usuário a usuário pelo
  // painel de Módulos de Acesso, mesmo desenho do RH/Facilities.
  { id: 'producao_home', group: 'PRODUÇÃO', label: 'Produção', path: '/producao', icon: Flame, defaultRoles: ['admin'] },
  { id: 'prod_lancamentos', group: 'PRODUÇÃO', label: 'Lançamentos', path: '/producao/lancamentos', icon: ClipboardPlus, defaultRoles: ['admin'] },
  { id: 'prod_pendencias', group: 'PRODUÇÃO', label: 'Controle de Liberações', path: '/producao/pendencias', icon: ListChecks, defaultRoles: ['admin'] },
  { id: 'prod_consulta', group: 'PRODUÇÃO', label: 'Consulta', path: '/producao/consulta', icon: Search, defaultRoles: ['admin'] },
  { id: 'prod_entrega', group: 'PRODUÇÃO', label: 'Controle de Entrega', path: '/producao/entrega', icon: KanbanSquare, defaultRoles: ['admin'] },
  { id: 'prod_painel', group: 'PRODUÇÃO', label: 'Painel de Qualidade', path: '/producao/painel', icon: Activity, defaultRoles: ['admin'] },
  { id: 'prod_dashboards', group: 'PRODUÇÃO', label: 'Dashboards', path: '/producao/dashboards', icon: LayoutDashboard, defaultRoles: ['admin'] },
  { id: 'prod_cadastros', group: 'PRODUÇÃO', label: 'Cadastros de Qualidade', path: '/producao/cadastros', icon: Settings, defaultRoles: ['admin'] },

  // Módulo Qualidade — gestão de RNC (Relatório de Não Conformidade): abertura,
  // plano de ação com prazos/anexos e relatórios em PDF (FRM.QUA-0026). Mesmo
  // desenho de hub único do RH (`apenasHub` no Sidebar): o menu mostra um botão
  // só, e a própria tela de Gestão de RNC concentra as abas do módulo.
  { id: 'qualidade_home', group: 'QUALIDADE', label: 'Qualidade', path: '/qualidade', icon: ClipboardCheck, defaultRoles: '*' },
  { id: 'qualidade_rnc', group: 'QUALIDADE', label: 'Gestão de RNC', path: '/qualidade/rnc', icon: ClipboardCheck, defaultRoles: '*' },

  // Módulo Facilities — tela inicial (hub) + páginas de cadastro e relatórios
  // alimentados pelos formulários de Portaria e RH/ASE. No Sidebar, o próprio
  // nome do grupo "FACILITIES" vira o botão para a tela inicial (ver GROUP_HOME
  // em Sidebar.tsx); os itens abaixo são as subpáginas expansíveis.
  { id: 'facilities', group: 'FACILITIES', label: 'Facilities', path: '/facilities', icon: Building2, defaultRoles: ['admin'] },
  { id: 'facilities_rotas', group: 'FACILITIES', label: 'Cadastro de Rotas', path: '/facilities/rotas', icon: Route, defaultRoles: ['admin'] },
  { id: 'facilities_materiais', group: 'FACILITIES', label: 'Materiais da Vigilância', path: '/facilities/materiais', icon: Shield, defaultRoles: ['admin'] },
  { id: 'facilities_vigilantes', group: 'FACILITIES', label: 'Vigilantes da Portaria', path: '/facilities/vigilantes', icon: Shield, defaultRoles: ['admin'] },
  { id: 'facilities_servicos', group: 'FACILITIES', label: 'Lista de Serviços', path: '/facilities/servicos', icon: Wrench, defaultRoles: ['admin'] },
  { id: 'facilities_veiculos_leves', group: 'FACILITIES', label: 'Veículos Leves', path: '/facilities/veiculos-leves', icon: Car, defaultRoles: ['admin'] },

  // Módulo RH — mesmo desenho do Facilities: o nome do grupo abre o hub e as
  // subpáginas são os cadastros das tabelas de RH. Acesso restrito a
  // administradores e a quem é do setor de RH (ver `canAccessPage`).
  { id: 'rh', group: 'RH', label: 'RH', path: '/rh', icon: UserCog, defaultRoles: ['admin'] },
  { id: 'rh_colaboradores', group: 'RH', label: 'Colaboradores', path: '/rh/colaboradores', icon: Users, defaultRoles: ['admin'] },
  { id: 'rh_setores_cad', group: 'RH', label: 'Setores do RH', path: '/rh/setores', icon: Map, defaultRoles: ['admin'] },
  { id: 'rh_turnos_cad', group: 'RH', label: 'Turnos', path: '/rh/turnos', icon: Clock, defaultRoles: ['admin'] },
  { id: 'rh_rotas_cad', group: 'RH', label: 'Rotas de Transporte', path: '/rh/rotas', icon: Route, defaultRoles: ['admin'] },
  { id: 'rh_percentual_he', group: 'RH', label: 'Percentual de Hora Extra', path: '/rh/percentual-he', icon: Percent, defaultRoles: ['admin'] },

  // Hub SSMA dentro de Formulários. O acesso acompanha a subpermissão SSMA,
  // inclusive quando ela foi bloqueada individualmente pelo administrador.
  { id: 'ssma', group: 'SSMA', label: 'SSMA', path: '/ssma', icon: Shield, defaultRoles: '*' },

  { id: 'financeiro_home', group: 'FINANCEIRO', label: 'Financeiro', path: '/financeiro', icon: Receipt, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'fin_contas_pagar', group: 'FINANCEIRO', label: 'Contas a Pagar', path: '/financeiro/contas-pagar', icon: Receipt, defaultRoles: ['admin'] },
  { id: 'fin_contas_pagar_analise', group: 'FINANCEIRO', label: 'Análise', path: '/financeiro/contas-pagar/analise', icon: BarChart3, defaultRoles: ['admin'] },
  { id: 'fin_reconciliacao_pedidos', group: 'FINANCEIRO', label: 'Reconciliação PO x Pgto', path: '/financeiro/reconciliacao-pedidos', icon: FileCheck, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'fin_realizado_rubricas', group: 'FINANCEIRO', label: 'Realizado por Rubrica', path: '/financeiro/realizado-rubricas', icon: BarChart3, defaultRoles: ['admin'] },
  { id: 'fin_faturamento_gwjaco', group: 'FINANCEIRO', label: 'Faturamento GW Jacobina', path: '/financeiro/faturamento-gwjaco', icon: Receipt, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },
  { id: 'fin_pep', group: 'FINANCEIRO', label: 'Estrutura PEP', path: '/financeiro/pep', icon: FolderTree, defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'] },

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
  { id: 'admin_rubricas_financeiro', group: 'ADMINISTRAÇÃO', label: 'Rubricas Financeiro', path: '/financeiro/rubricas', icon: Settings, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_helpdesk_config', group: 'ADMINISTRAÇÃO', label: 'Config. Helpdesk', path: '/admin/helpdesk', icon: Settings, defaultRoles: ['admin', 'coordenador_suprimentos'], alwaysAdmin: true },
  { id: 'admin_feedback', group: 'ADMINISTRAÇÃO', label: 'Reportes', path: '/admin/feedback', icon: Flag, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_apis', group: 'ADMINISTRAÇÃO', label: 'Gestão de APIs & IA', path: '/admin/apis', icon: Cpu, defaultRoles: ['admin'], alwaysAdmin: true },
  { id: 'admin_diretrizes', group: 'ADMINISTRAÇÃO', label: 'Diretrizes', path: '/admin/diretrizes', icon: BookOpen, defaultRoles: ['admin'], alwaysAdmin: true },
];

export interface FormularioDef {
  /** Chave estável usada como chave no JSON `profiles.page_access` (ex: 'form_ssma_rid') */
  id: string;
  grupoId: string;
  label: string;
  codigo?: string;
  descricao: string;
  path: string;
  defaultRoles: Role[] | '*';
  setores?: {
    ids?: string[];
    keywords?: string[];
  };
  /** Se true, liberado universalmente para todos os usuários (inclusive qualquer visualizador) */
  universalParaVisualizador?: boolean;
}

export const FORMULARIOS_DETALHADOS: FormularioDef[] = [
  // SSMA
  {
    id: 'form_ssma_rid',
    grupoId: 'ssma',
    label: 'RID - Identificação de Desvio',
    codigo: 'FRM.SSMA-0001',
    descricao: 'Registro e identificação de desvios comportamentais e condições inseguras',
    path: '/formularios/ssma-rid',
    defaultRoles: '*',
    universalParaVisualizador: true, // Liberado para todos os usuários e visualizadores
  },
  {
    id: 'form_ssma_alcoolemia',
    grupoId: 'ssma',
    label: 'Alcoolemia & Termo Psicoativo',
    codigo: 'FRM.SOC-0042',
    descricao: 'Teste de alcoolemia por etilômetro e emissão de termo',
    path: '/formularios/ssma-alcoolemia',
    defaultRoles: ['admin'],
    setores: {
      ids: ['12', '13'],
      keywords: ['ssma', 'saúde', 'saude', 'segurança', 'seguranca', 'meio ambiente'],
    },
  },
  {
    id: 'form_ssma_ficha_epi',
    grupoId: 'ssma',
    label: 'Ficha de EPI',
    codigo: 'FRM.SEG-0008',
    descricao: 'Termo de responsabilidade de EPI com assinatura do colaborador e análise de consumo',
    path: '/formularios/ssma-ficha-epi',
    defaultRoles: ['admin'],
    setores: {
      ids: ['12', '13'],
      keywords: ['ssma', 'saúde', 'saude', 'segurança', 'seguranca', 'meio ambiente'],
    },
  },

  // ALMOXARIFADO
  {
    id: 'form_almoxarifado_recebimento',
    grupoId: 'almoxarifado',
    label: 'Recebimento Físico, Ficha Cega e NCR',
    codigo: 'FRM.ALM-0001',
    descricao: 'Ficha cega de volumes, recebimento de materiais e não conformidades',
    path: '/formularios/almoxarifado',
    defaultRoles: ['admin', 'comprador', 'coordenador_suprimentos'],
    setores: {
      ids: ['2'],
      keywords: ['almoxarifado', 'almox'],
    },
  },

  // PORTARIA & SEGURANÇA
  {
    id: 'form_portaria_plantao',
    grupoId: 'portaria',
    label: 'Passagem de Plantão & Custódia',
    codigo: 'FRM.SGP-0010',
    descricao: 'Recebimento de posto da vigilância e custódia de materiais',
    path: '/formularios/portaria-passagem-plantao',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_relatorio',
    grupoId: 'portaria',
    label: 'Relatório de Ocorrências',
    codigo: 'FRM.SGP-0010',
    descricao: 'Livro digital de ocorrências de segurança da portaria',
    path: '/formularios/portaria-relatorio',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_transportes',
    grupoId: 'portaria',
    label: 'Chegada de Transportes',
    codigo: 'FRM.SGP-0009',
    descricao: 'Registro de transportes coletivos, vans, carros e ônibus',
    path: '/formularios/portaria-transportes',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_equipamentos',
    grupoId: 'portaria',
    label: 'Equipamentos de Terceiros',
    codigo: 'FRM.SGP-0011',
    descricao: 'Controle de entrada e saída de equipamentos e ferramentas',
    path: '/formularios/portaria-equipamentos',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_carretas',
    grupoId: 'portaria',
    label: 'Carretas de Chapas',
    codigo: 'FRM.SGP-0020',
    descricao: 'Controle de entrada e saída de carretas de aço para a produção',
    path: '/formularios/portaria-carretas',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_briefing',
    grupoId: 'portaria',
    label: 'Briefing de Segurança',
    codigo: 'FRM.SGP-0013',
    descricao: 'Lista de presença do briefing de integração com assinatura digital',
    path: '/formularios/portaria-briefing',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },
  {
    id: 'form_portaria_alcoolemia',
    grupoId: 'portaria',
    label: 'Teste de Alcoolemia (Portaria)',
    codigo: 'FRM.SGP-0015',
    descricao: 'Livro diário de sorteados e testes de etilômetro na portaria',
    path: '/formularios/portaria-alcoolemia',
    defaultRoles: ['admin'],
    setores: {
      ids: ['19', '13'],
      keywords: ['portaria', 'vigilância', 'vigilancia', 'segurança', 'seguranca'],
    },
  },

  // LOGÍSTICA & EXPEDIÇÃO
  {
    id: 'form_logistica_expedicao',
    grupoId: 'logistica',
    label: 'Registro de Expedição de Tramos',
    codigo: 'FRM.LOG-0001',
    descricao: 'Controle de carregamento de tramos e horários',
    path: '/formularios/logistica-expedicao',
    defaultRoles: ['admin'],
    setores: {
      ids: [],
      keywords: ['logística', 'logistica', 'expedição', 'expedicao'],
    },
  },
  {
    id: 'form_logistica_relatorio',
    grupoId: 'logistica',
    label: 'Relatório Lead Time de Expedição',
    codigo: 'FRM.LOG-0002',
    descricao: 'Relatório e gráficos de lead time de carregamento (SLA 24h)',
    path: '/formularios/logistica-expedicao/relatorio',
    defaultRoles: ['admin'],
    setores: {
      ids: [],
      keywords: ['logística', 'logistica', 'expedição', 'expedicao'],
    },
  },

  // RH & DEPARTAMENTO PESSOAL
  {
    id: 'form_rh_ase',
    grupoId: 'rh',
    label: 'ASE - Horas Extras',
    codigo: 'FRM.RHU-0007',
    descricao: 'Autorização de Serviços Extraordinários por setor e turno',
    path: '/formularios/rh-ase-hora-extra',
    defaultRoles: ['admin', 'gestor'],
    setores: {
      ids: ['1'],
      keywords: ['rh', 'recursos humanos', 'departamento pessoal'],
    },
  },
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
  // Sem role padrão: importar planilha SAP é ação de manutenção de base. Quem
  // vê Estoque/Movimentações não importa por padrão — o admin libera usuário a
  // usuário. Habilita os botões "Importar ZL0024" (Estoque) e "Importar MB51"
  // (Movimentações), que rodam o mesmo motor do painel administrativo.
  {
    id: 'almox_importar_planilhas',
    group: 'ALMOXARIFADO',
    label: 'Importar planilhas SAP (Estoque ZL0024 e Movimentações MB51)',
    defaultRoles: [],
  },
  // Projetos separa CONSULTAR de LANÇAR. Quem abre o módulo vê a BOM, a
  // posição e os painéis; movimentar estoque é ato de quem está no balcão, na
  // bancada ou na linha — três pessoas diferentes. Sem role padrão: o admin
  // libera usuário a usuário, como nas planilhas SAP acima.
  {
    id: 'proj_lancar_entrada',
    group: 'ALMOXARIFADO',
    label: 'Projetos: lançar entrada de NF (recebimento)',
    defaultRoles: [],
  },
  {
    id: 'proj_lancar_premontagem',
    group: 'ALMOXARIFADO',
    label: 'Projetos: separar romaneio e apontar pré-montagem',
    defaultRoles: [],
  },
  {
    id: 'proj_lancar_producao',
    group: 'ALMOXARIFADO',
    label: 'Projetos: entregar kit à produção',
    defaultRoles: [],
  },
  {
    id: 'proj_lancar_sobressalente',
    group: 'ALMOXARIFADO',
    label: 'Projetos: solicitar sobressalente / refugo',
    defaultRoles: [],
  },
  // Produção separa CONSULTAR de LANÇAR (mesmo desenho de
  // `proj_lancar_*` acima): quem abre o módulo vê fila e consulta; lançar
  // uma etapa é ato de quem está na máquina. Sem role padrão: o admin libera
  // usuário a usuário. Uma flag por etapa — Bloco 3+ acrescenta EVS/UT/Flange
  // aqui do mesmo jeito, sem mexer no restante do cadastro.
  {
    id: 'prod_lancar_corte',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar Corte a Plasma',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_chanfro',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar Chanfro',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_calandra',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar Calandra',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_solda',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar Solda SAW',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_evs',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar EVS',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_ut',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar UT',
    defaultRoles: [],
  },
  {
    id: 'prod_lancar_flange',
    group: 'PRODUÇÃO',
    label: 'Produção: lançar Flange',
    defaultRoles: [],
  },
  {
    id: 'prod_editar_todos',
    group: 'PRODUÇÃO',
    label: 'Produção: editar lançamentos de outros autores',
    defaultRoles: [],
  },
  {
    id: 'prod_refugar',
    group: 'PRODUÇÃO',
    label: 'Produção: registrar refugo',
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
    label: 'Grupo: Portaria & Segurança',
    defaultRoles: '*',
  },
  {
    id: 'form_logistica',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Grupo: Logística & Expedição',
    defaultRoles: '*',
  },
  {
    id: 'form_rh',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Grupo: RH & Dep. Pessoal (ASE)',
    defaultRoles: ['admin', 'gestor'],
  },
  {
    id: 'form_almoxarifado',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Grupo: Almoxarifado',
    defaultRoles: '*',
  },
  {
    id: 'form_ssma',
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: 'Grupo: SSMA (Saúde, Segurança e Meio Ambiente)',
    defaultRoles: '*',
  },
  // Formulários individuais (selecionáveis e auditáveis pelo admin)
  ...FORMULARIOS_DETALHADOS.map(f => ({
    id: f.id,
    group: 'SUBPERMISSÕES DE FORMULÁRIOS',
    label: `Formulário: ${f.codigo ? f.codigo + ' - ' : ''}${f.label}`,
    defaultRoles: f.defaultRoles,
  })),
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

/**
 * Setores donos do módulo Financeiro em `core_setores`: Financeiro (6),
 * Contabilidade (7) e Controladoria (18).
 */
export const SETORES_FINANCEIRO_IDS = ['6', '7', '18'];

/** O usuário pertence a um dos setores do Financeiro? */
export function isUserSetorFinanceiro(user: Profile): boolean {
  return SETORES_FINANCEIRO_IDS.includes(user.sector_id);
}

export function canAccessPage(user: Profile, pageId: string): boolean {
  if (user.roles.includes('admin')) return true;

  if (pageId === 'ssma') return canAccessFormGroup(user, 'ssma');

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

  // Módulo Financeiro: além dos papéis já configurados por página (comprador,
  // coordenador_suprimentos), libera todo o módulo para quem é dos setores
  // Financeiro/Contabilidade/Controladoria — aditivo, não substitui os
  // `defaultRoles` abaixo para quem estiver em outro setor.
  if (def.group === 'FINANCEIRO' && isUserSetorFinanceiro(user)) {
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
 * Determina se o usuário possui o perfil visualizador (e não é admin).
 */
export function isUserVisualizador(user: Profile): boolean {
  return user.roles.includes('visualizador') && !user.roles.includes('admin');
}

/**
 * Verifica se o colaborador pertence aos setores mapeados para um determinado formulário.
 */
export function userBelongsToSector(
  user: Profile,
  setoresConfig?: { ids?: string[]; keywords?: string[] },
  customSectors?: Sector[]
): boolean {
  const secId = user.sector_id || (user as any).setor_id;
  if (!setoresConfig || !secId) return false;
  if (setoresConfig.ids && setoresConfig.ids.includes(secId)) {
    return true;
  }
  if (setoresConfig.keywords && setoresConfig.keywords.length > 0) {
    const list = customSectors || INITIAL_SECTORS;
    const s = list.find(sec => sec.id === secId);
    if (s && s.name) {
      const lower = s.name.toLowerCase();
      if (setoresConfig.keywords.some(k => lower.includes(k.toLowerCase()))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Avalia se o usuário tem permissão para acessar um formulário específico.
 *
 * Regras:
 * 1. Administrador sempre tem acesso total.
 * 2. O usuário precisa ter acesso à página geral "Formulários".
 * 3. Override individual do admin em `user.page_access[formId]` tem a maior prioridade.
 * 4. Override no grupo pai (`user.page_access['form_' + grupoId]`): se for false, bloqueia o form (a menos que haja override positivo específico).
 * 5. Se o usuário for VISUALIZADOR:
 *    - O RID (`form_ssma_rid`) é o único formulário liberado para todos por padrão.
 *    - Formulários do seu próprio setor (ex: almoxarifado -> formulários do almoxarifado) são liberados.
 *    - Formulários de outros setores permanecem bloqueados (exceto se houver override do admin).
 * 6. Para os demais perfis (solicitante, requisitante, gestor, comprador, etc.):
 *    - RID é liberado para todos.
 *    - Formulários do seu setor são liberados.
 *    - Se o grupo macro estiver liberado e a role estiver permitida, tem acesso.
 */
export function canAccessForm(user: Profile, formId: string, customSectors?: Sector[]): boolean {
  if (user.roles.includes('admin')) return true;
  if (!canAccessPage(user, 'formularios')) return false;

  const formDef = FORMULARIOS_DETALHADOS.find(f => f.id === formId);
  if (!formDef) {
    return canAccessPage(user, formId);
  }

  // 1. Override explícito no próprio formulário
  const overrideForm = user.page_access?.[formDef.id];
  if (overrideForm !== undefined) return overrideForm;

  // 2. Override explícito no grupo macro correspondente (ex: form_ssma, form_portaria, etc.)
  const macroSubId = `form_${formDef.grupoId}`;
  const overrideGrupo = user.page_access?.[macroSubId];
  if (overrideGrupo === false) return false;

  // 3. Regra para perfil VISUALIZADOR:
  if (isUserVisualizador(user)) {
    // RID é liberado universalmente para qualquer usuário
    if (formDef.universalParaVisualizador) return true;

    // Se pertencer ao setor do formulário (ex: visualizador do almoxarifado acessa forms do almoxarifado)
    if (userBelongsToSector(user, formDef.setores, customSectors)) return true;

    // Se o grupo foi expressamente liberado pelo admin por override
    if (overrideGrupo === true) return true;

    // Formulários de outros setores são bloqueados por padrão para visualizadores
    return false;
  }

  // 4. Se o grupo foi liberado expressamente pelo admin
  if (overrideGrupo === true) return true;

  // 5. Demais perfis (não-visualizadores):
  if (formDef.universalParaVisualizador) return true;
  if (userBelongsToSector(user, formDef.setores, customSectors)) return true;
  if (formDef.defaultRoles === '*') return true;
  if (formDef.defaultRoles.some(r => user.roles.includes(r))) return true;

  // Fallback padrão do grupo
  const subGrupo = FORMULARIO_SUBPERMISSOES.find(s => s.grupoId === formDef.grupoId);
  if (subGrupo) {
    if (subGrupo.defaultRoles === '*') return true;
    if (Array.isArray(subGrupo.defaultRoles) && subGrupo.defaultRoles.some(r => user.roles.includes(r))) {
      return true;
    }
  }

  return false;
}

/**
 * Avalia se o usuário pode ver/acessar um grupo específico de formulários no Hub.
 *
 * Regras:
 * - Admin sempre tem acesso.
 * - Deve ter acesso ao módulo geral de Formulários.
 * - Se houver qualquer formulário individual deste grupo liberado para o colaborador, o grupo é visível.
 * - Se o grupo foi bloqueado explicitamente por override em `user.page_access`, só exibe se houver form individual liberado.
 * - Para visualizadores: só vê o grupo se tiver acesso a pelo menos um formulário daquele grupo
 *   (ex: SSMA sempre visível por conta do RID; Almoxarifado visível se for do setor Almoxarifado).
 * - Para outros perfis: respeita as permissões padrão do grupo.
 */
export function canAccessFormGroup(user: Profile, grupoId: string, customSectors?: Sector[]): boolean {
  if (user.roles.includes('admin')) return true;
  if (!canAccessPage(user, 'formularios')) return false;

  const sub = FORMULARIO_SUBPERMISSOES.find(s => s.grupoId === grupoId);
  const macroId = sub ? sub.id : `form_${grupoId}`;
  const formsDoGrupo = FORMULARIOS_DETALHADOS.filter(f => f.grupoId === grupoId);

  // Se houver algum formulário individual deste grupo com liberação explícita
  const temFormComOverrideAtivo = formsDoGrupo.some(f => user.page_access?.[f.id] === true);
  if (temFormComOverrideAtivo) return true;

  const override = user.page_access?.[macroId];
  if (override !== undefined) {
    if (!override) return false;
    return true;
  }

  // Compatibilidade com flag legada rh_ase_hora_extra se existir
  if (grupoId === 'rh' && user.page_access?.['rh_ase_hora_extra'] !== undefined) {
    return user.page_access['rh_ase_hora_extra'];
  }

  // Regra especial para visualizadores: exibe o grupo se pelo menos um formulário do grupo estiver acessível
  if (isUserVisualizador(user)) {
    return formsDoGrupo.some(f => canAccessForm(user, f.id, customSectors));
  }

  // Se não houver override explícito, respeita as roles padrão da subpermissão
  if (!sub) return true;
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
 * Determina quem enxerga o relatório gerencial de ASE (horas extras, transporte
 * e refeição consolidados).
 *
 * O relatório cruza dados de pessoal do efetivo inteiro, então não acompanha o
 * formulário: quem só preenche ASE não o vê. Fica com o administrador e com
 * quem tem o módulo RH liberado — o mesmo público das tabelas mestre de RH.
 */
export function canAccessAseRelatorio(user: Profile): boolean {
  if (user.roles.includes('admin')) return true;
  return canAccessPage(user, 'rh');
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
  'GERAL', 'SOLICITAÇÕES', 'DEMANDAS', 'SUPRIMENTOS', 'ALMOXARIFADO', 'PRODUÇÃO', 'QUALIDADE', 'FACILITIES', 'RH',
  'SSMA', 'FINANCEIRO', 'HELPDESK', 'ADMINISTRAÇÃO',
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


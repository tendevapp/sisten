/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuração das telas iniciais (hubs) de cada módulo do SISTEN.
 *
 * O componente genérico `src/views/ModuleHome.tsx` monta a tela a partir daqui:
 * o cabeçalho vem de `title` / `description` / `icon` / `accent`, e os cards
 * são derivados automaticamente das páginas de `PAGES` (lib/pages.ts) que
 * pertencem ao `group` e que o usuário tem acesso — ou seja, o hub é sempre um
 * espelho do que aparece no Sidebar. Basta cadastrar uma página nova no grupo
 * para ela surgir aqui; `cardDescriptions` só enriquece a legenda de cada card.
 */

import type { LucideIcon } from 'lucide-react';
import { ClipboardList, PackageSearch, Boxes, Receipt, Radio, Settings } from 'lucide-react';

export interface ModuleHomeDef {
  /** Identificador passado em `<ModuleHome moduleId="..." />`. */
  id: string;
  /** Grupo correspondente em `PAGES` (lib/pages.ts). */
  group: string;
  /** Rota do próprio hub — excluída da grade de cards. */
  homePath: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Classes Tailwind literais (JIT precisa das strings completas). */
  accent: {
    /** Chip do ícone no cabeçalho. */
    tile: string;
    /** Borda do card em hover. */
    hoverBorder: string;
    /** Anel de foco do card. */
    ring: string;
    /** Cor da seta do card em hover. */
    arrow: string;
  };
  /** Legenda por `id` de página de `PAGES`. */
  cardDescriptions: Record<string, string>;
}

export const MODULE_HOMES: ModuleHomeDef[] = [
  {
    id: 'solicitacoes',
    group: 'SOLICITAÇÕES',
    homePath: '/solicitacoes',
    title: 'Solicitações',
    description: 'Abertura, acompanhamento e aprovação de solicitações de compra e de serviço.',
    icon: ClipboardList,
    accent: {
      tile: 'bg-blue-600 shadow-blue-500/25',
      hoverBorder: 'hover:border-blue-400/60 dark:hover:border-blue-400/40',
      ring: 'focus-visible:ring-blue-500',
      arrow: 'group-hover:text-blue-500',
    },
    cardDescriptions: {
      sol_nova: 'Abrir uma nova solicitação de compra ou de serviço.',
      sol_minhas: 'Acompanhar o andamento das solicitações que você abriu.',
      sol_todas: 'Fila coletiva de todas as solicitações em aberto.',
      sol_aprovacoes: 'Analisar e decidir as solicitações pendentes do seu setor.',
    },
  },
  {
    id: 'suprimentos',
    group: 'SUPRIMENTOS',
    homePath: '/suprimentos',
    title: 'Suprimentos',
    description: 'Cotações, fornecedores, contratos e o acompanhamento das compras SAP.',
    icon: PackageSearch,
    accent: {
      tile: 'bg-amber-500 shadow-amber-500/25',
      hoverBorder: 'hover:border-amber-400/60 dark:hover:border-amber-400/40',
      ring: 'focus-visible:ring-amber-500',
      arrow: 'group-hover:text-amber-500',
    },
    cardDescriptions: {
      sup_cadastros_sap: 'Solicitações de cadastro de materiais e fornecedores no SAP.',
      sup_fornecedores: 'Base de fornecedores homologados e seus contatos.',
      sup_central_compras: 'Requisições em aberto, cotação de fornecedores e acompanhamento até a entrega.',
      sup_analise_cotacoes: 'Mapa comparativo de propostas e cotações.',
      sup_historico: 'Histórico de pedidos, preços praticados e fornecedores.',
      sup_contratos: 'Contratos vigentes, aditivos e demandas contratuais.',
      sup_dashboards: 'Indicadores de carteira, OTD e análise de compras.',
      sup_estimador_frete: 'Estimativa de custo de frete por rota e modal.',
    },
  },
  {
    id: 'almoxarifado',
    group: 'ALMOXARIFADO',
    homePath: '/almoxarifado',
    title: 'Almoxarifado',
    description: 'Posição de estoque, movimentações e consumo dos materiais.',
    icon: Boxes,
    accent: {
      tile: 'bg-cyan-600 shadow-cyan-500/25',
      hoverBorder: 'hover:border-cyan-400/60 dark:hover:border-cyan-400/40',
      ring: 'focus-visible:ring-cyan-500',
      arrow: 'group-hover:text-cyan-500',
    },
    cardDescriptions: {
      almox_estoque: 'Posição de estoque, curva ABC e cobertura por depósito.',
      almox_movimentacoes: 'Entradas, saídas, giro e idade do estoque.',
      almox_consumo_semanal: 'Consumo de cada material ao longo das semanas.',
      almox_dashboards: 'Painéis consolidados de estoque e movimentação.',
    },
  },
  {
    id: 'financeiro',
    group: 'FINANCEIRO',
    homePath: '/financeiro',
    title: 'Financeiro',
    description: 'Contas a pagar e a análise financeira de títulos e fornecedores.',
    icon: Receipt,
    accent: {
      tile: 'bg-emerald-600 shadow-emerald-500/25',
      hoverBorder: 'hover:border-emerald-400/60 dark:hover:border-emerald-400/40',
      ring: 'focus-visible:ring-emerald-500',
      arrow: 'group-hover:text-emerald-500',
    },
    cardDescriptions: {
      fin_contas_pagar: 'Títulos a pagar, vencimentos e baixas.',
      fin_contas_pagar_analise: 'Análise de contas a pagar por período e fornecedor.',
    },
  },
  {
    id: 'helpdesk',
    group: 'HELPDESK',
    homePath: '/helpdesk/inicio',
    title: 'Helpdesk',
    description: 'Atendimento de chamados e os indicadores de SLA do suporte.',
    icon: Radio,
    accent: {
      tile: 'bg-rose-600 shadow-rose-500/25',
      hoverBorder: 'hover:border-rose-400/60 dark:hover:border-rose-400/40',
      ring: 'focus-visible:ring-rose-500',
      arrow: 'group-hover:text-rose-500',
    },
    cardDescriptions: {
      helpdesk_atendimento: 'Fila de chamados e atendimento ao usuário.',
      helpdesk_relatorios: 'Volume, SLA e taxa de resolução de chamados.',
    },
  },
  {
    id: 'admin',
    group: 'ADMINISTRAÇÃO',
    homePath: '/admin',
    title: 'Administração',
    description: 'Usuários, permissões, cadastros mestres e configurações do sistema.',
    icon: Settings,
    accent: {
      tile: 'bg-indigo-600 shadow-indigo-500/25',
      hoverBorder: 'hover:border-indigo-400/60 dark:hover:border-indigo-400/40',
      ring: 'focus-visible:ring-indigo-500',
      arrow: 'group-hover:text-indigo-500',
    },
    cardDescriptions: {
      admin_uso: 'Telemetria de acessos e uso das telas.',
      admin_usuarios: 'Perfis, papéis e status dos usuários.',
      admin_cadastros: 'Tabelas mestre, listas suspensas e gatilhos de e-mail.',
      admin_setores: 'Setores da fábrica e ajustes de helpdesk por setor.',
      admin_permissoes: 'Papéis e módulos de acesso por usuário.',
      admin_importacao_materiais: 'Importação de catálogo, SAP, almoxarifado, financeiro e RH.',
      admin_importar_sap_log: 'Histórico das importações de dados do SAP.',
      admin_grupos_comprador: 'Grupos de mercadoria e compradores responsáveis.',
      admin_helpdesk_config: 'Parâmetros gerais do módulo de helpdesk.',
      admin_feedback: 'Reportes de erro e sugestões enviados pelos usuários.',
      admin_apis: 'Chaves de API, provedores de IA e limites de uso.',
      admin_diretrizes: 'Diretrizes e políticas internas exibidas no sistema.',
    },
  },
];

export function getModuleHome(id: string): ModuleHomeDef | undefined {
  return MODULE_HOMES.find(m => m.id === id);
}

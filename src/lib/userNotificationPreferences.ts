/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de Gerenciamento de Preferências de Notificação do Usuário — SISTEN
 * Permite ao usuário escolher granularmente quais notificações deseja receber
 * por módulo (Helpdesk, Suprimentos, SSMA RID, Demandas, Portaria e Alertas Críticos).
 */

import { supabase } from '../db/supabaseClient';
import { localDb } from '../db/localDb';
import type { UserNotificationPreferences } from '../types';

export const PREFERENCIAS_NOTIFICACAO_PADRAO: UserNotificationPreferences = {
  channel: 'in-app',
  // Helpdesk & Chamados
  chamados_novos: true,
  chamados_atualizacoes: true,
  chamados_status: true,
  // Suprimentos & Compras
  compras_solicitacoes: true,
  compras_aprovacoes: true,
  compras_rastreio: true,
  compras_cadastros_sap: true,
  compras_abrir_rm: true,
  // SSMA & Segurança
  ssma_mencoes_rid: true,
  ssma_demandas_area: true,
  ssma_conclusao_rid: true,
  // Demandas & Tarefas
  demandas_atribuicao: true,
  demandas_prazos: true,
  // Portaria & Campo
  portaria_alertas: true,
  formularios_campo: true,
  // Alertas Críticos
  alertas_criticos: true,
};

export interface CategoriaNotificacaoItem {
  key: keyof Omit<UserNotificationPreferences, 'channel'>;
  label: string;
  descricao: string;
  badge?: string;
}

export interface GrupoNotificacaoConfig {
  id: string;
  titulo: string;
  icone: 'Headphones' | 'ShoppingCart' | 'ShieldAlert' | 'LayoutList' | 'Building2' | 'AlertTriangle';
  cor: string;
  descricao: string;
  itens: CategoriaNotificacaoItem[];
}

export const GRUPOS_NOTIFICACAO: GrupoNotificacaoConfig[] = [
  {
    id: 'helpdesk',
    titulo: 'Helpdesk & Chamados',
    icone: 'Headphones',
    cor: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800',
    descricao: 'Acompanhamento dos chamados técnicos, solicitações de TI e facilities.',
    itens: [
      {
        key: 'chamados_novos',
        label: 'Novos chamados e atribuições',
        descricao: 'Alertas quando um chamado for atribuído a você ou aberto no seu setor.',
      },
      {
        key: 'chamados_atualizacoes',
        label: 'Comentários e respostas de suporte',
        descricao: 'Avisos de novas mensagens, esclarecimentos e atualizações da equipe técnica.',
      },
      {
        key: 'chamados_status',
        label: 'Resolução e fechamento',
        descricao: 'Notificação imediata quando seu chamado for resolvido ou concluído.',
      },
    ],
  },
  {
    id: 'suprimentos',
    titulo: 'Suprimentos & Compras',
    icone: 'ShoppingCart',
    cor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
    descricao: 'Movimentações de cotações, solicitações de compras e acompanhamento de materiais.',
    itens: [
      {
        key: 'compras_solicitacoes',
        label: 'Solicitações de Compra e cotações',
        descricao: 'Avisos de novas requisições de compra abertas pela sua área.',
      },
      {
        key: 'compras_aprovacoes',
        label: 'Aprovações pendentes de compras',
        descricao: 'Alertas direcionados para gestores quando há compras pendentes de aprovação.',
        badge: 'Gestores',
      },
      {
        key: 'compras_rastreio',
        label: 'Rastreio de Compras (Entregas e mensagens)',
        descricao: 'Mensagens na thread de itens de compra (RI) e avisos de recebimento físico.',
      },
      {
        key: 'compras_cadastros_sap',
        label: 'Cadastros SAP (Materiais e Fornecedores)',
        descricao: 'Criações, ampliação de dados de compras e liberação de códigos SAP.',
      },
      {
        key: 'compras_abrir_rm',
        label: 'Fila do Almoxarifado para Abertura de RM',
        descricao: 'Demandas na fila do almoxarifado aguardando geração de requisição.',
        badge: 'Almoxarifado',
      },
    ],
  },
  {
    id: 'ssma',
    titulo: 'SSMA & Segurança (RID)',
    icone: 'ShieldAlert',
    cor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
    descricao: 'Registros de Identificação de Desvios (RID) e ações corretivas em campo.',
    itens: [
      {
        key: 'ssma_mencoes_rid',
        label: 'Menções com @ no Plano de Ação',
        descricao: 'Avisos prioritários quando seu usuário for marcado diretamente em uma demanda.',
        badge: 'Prioritário',
      },
      {
        key: 'ssma_demandas_area',
        label: 'Demandas direcionadas para sua área',
        descricao: 'Notificação quando um desvio for destinado ao seu setor para execução.',
      },
      {
        key: 'ssma_conclusao_rid',
        label: 'Conclusão e fechamento de desvios',
        descricao: 'Avisos quando o plano de ação for concluído e o RID for finalizado.',
      },
    ],
  },
  {
    id: 'demandas',
    titulo: 'Demandas & Tarefas (Kanban)',
    icone: 'LayoutList',
    cor: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/60 border-violet-200 dark:border-violet-800',
    descricao: 'Gestão de tarefas e fluxos de trabalho nos quadros dos setores.',
    itens: [
      {
        key: 'demandas_atribuicao',
        label: 'Demandas atribuídas a você',
        descricao: 'Notificações ao ser adicionado como responsável por uma tarefa no quadro.',
      },
      {
        key: 'demandas_prazos',
        label: 'Prazos e vencimentos de tarefas',
        descricao: 'Alertas de proximidade do prazo de entrega ou tarefas com data expirada.',
      },
    ],
  },
  {
    id: 'campo',
    titulo: 'Portaria & Formulários de Campo',
    icone: 'Building2',
    cor: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
    descricao: 'Rotinas operacionais da portaria, alcoolemia preventiva e controle de horas.',
    itens: [
      {
        key: 'portaria_alertas',
        label: 'Avisos de Portaria & Alcoolemia',
        descricao: 'Sorteios diários de teste do bafômetro e registros de ocorrências.',
      },
      {
        key: 'formularios_campo',
        label: 'Formulários (ASE Hora Extra, Logística)',
        descricao: 'Autorizações de hora extra assinadas e relatórios de carregamento.',
      },
    ],
  },
  {
    id: 'criticos',
    titulo: 'Alertas Críticos & Segurança',
    icone: 'AlertTriangle',
    cor: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
    descricao: 'Eventos de alta prioridade que exigem atenção imediata da equipe.',
    itens: [
      {
        key: 'alertas_criticos',
        label: 'Eventos de urgência e Criticidades 4 e 5',
        descricao: 'Incidentes de alto risco, paradas de linha e comunicados institucionais urgentes.',
        badge: 'Urgente',
      },
    ],
  },
];

/**
 * Lê as preferências de notificação do usuário a partir do localDb / cache local,
 * realizando parse defensivo e fallback para os padrões.
 */
export function obterPreferenciasNotificacao(userId: string): UserNotificationPreferences {
  try {
    // 1. Tentar ler do perfil do usuário em cache
    const user = localDb.getCurrentUser();
    if (user && user.id === userId && user.notification_preferences) {
      const parsed = tentarParsePreferencias(user.notification_preferences);
      if (parsed) return parsed;
    }

    // 2. Tentar ler da chave dedicada no localStorage
    const rawPrefs = localStorage.getItem(`sisten_notif_prefs_${userId}`);
    if (rawPrefs) {
      const parsed = tentarParsePreferencias(rawPrefs);
      if (parsed) return parsed;
    }

    // 3. Fallback do método legado ('in-app' | 'both')
    const legado = localDb.getNotificationPreferences(userId);
    return {
      ...PREFERENCIAS_NOTIFICACAO_PADRAO,
      channel: legado === 'both' ? 'both' : 'in-app',
    };
  } catch (err) {
    console.warn('Erro ao obter preferências de notificação:', err);
    return { ...PREFERENCIAS_NOTIFICACAO_PADRAO };
  }
}

function tentarParsePreferencias(raw: string): UserNotificationPreferences | null {
  try {
    if (raw === 'in-app' || raw === 'both') {
      return {
        ...PREFERENCIAS_NOTIFICACAO_PADRAO,
        channel: raw,
      };
    }
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null) {
      return {
        ...PREFERENCIAS_NOTIFICACAO_PADRAO,
        ...obj,
        channel: obj.channel === 'both' ? 'both' : 'in-app',
      };
    }
  } catch {
    // String não era JSON válido
  }
  return null;
}

/**
 * Salva as preferências de notificação do usuário tanto localmente quanto no Supabase.
 */
export async function salvarPreferenciasNotificacao(
  userId: string,
  preferencias: UserNotificationPreferences
): Promise<boolean> {
  try {
    const jsonStr = JSON.stringify(preferencias);

    // 1. Gravar no localStorage local
    localStorage.setItem(`sisten_notif_prefs_${userId}`, jsonStr);

    // 2. Atualizar método legado de compatibilidade
    localDb.setNotificationPreferences(userId, preferencias.channel);

    // 3. Atualizar perfil atual em memória/cache
    const user = localDb.getCurrentUser();
    if (user && user.id === userId) {
      user.notification_preferences = jsonStr;
      const perfis = localDb.getProfiles();
      const idx = perfis.findIndex((p) => p.id === userId);
      if (idx !== -1) {
        perfis[idx].notification_preferences = jsonStr;
        (localDb as any).setStorageItem((localDb as any).profilesKey, perfis);
      }
      (localDb as any).setStorageItem((localDb as any).currentUserKey, user);
    }

    // 4. Persistir no Supabase na tabela core_perfis
    if (supabase) {
      const { error } = await supabase
        .from('core_perfis')
        .update({ notification_preferences: jsonStr })
        .eq('id', userId);

      if (error) {
        console.warn('Falha ao persistir notification_preferences no Supabase:', error);
      }
    }

    // 5. Registrar log de auditoria
    localDb.logActivity(
      userId,
      'Meu Perfil',
      'Configurar Notificações',
      `Preferências de notificação atualizadas pelo usuário (canal: ${preferencias.channel}).`
    );

    return true;
  } catch (err) {
    console.error('Erro ao salvar preferências de notificação:', err);
    return false;
  }
}

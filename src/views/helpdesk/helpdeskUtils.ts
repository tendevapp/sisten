/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Sector } from '../../types';

export const SLA_HOURS_MAP: Record<number, number> = {
  1: 120, // 5 dias (Baixa)
  2: 72,  // 3 dias (Média)
  3: 24,  // 1 dia (Alta)
  4: 8,   // 8 horas (Crítica)
  5: 2    // 2 horas (Parada de Setor)
};

export const CRITICALITY_CONFIG: Record<number, { label: string; desc: string; color: string; bg: string; border: string }> = {
  1: { label: '1 - Baixa', desc: 'Melhorias ou dúvidas operacionais (120h)', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  2: { label: '2 - Média', desc: 'Impacto pontual sem parada (72h)', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  3: { label: '3 - Alta', desc: 'Impacto operacional relevante (24h)', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  4: { label: '4 - Crítica', desc: 'Risco de parada iminente (8h)', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  5: { label: '5 - Parada', desc: 'Parada total de linha ou setor (2h)', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' }
};

export const CANNED_RESPONSES = [
  {
    title: 'Solicitar mais informações / fotos',
    text: 'Olá! Para prosseguirmos com o atendimento do seu chamado, solicitamos que nos envie mais detalhes e, se possível, evidências fotográficas do incidente.'
  },
  {
    title: 'Em análise técnica inicial',
    text: 'Seu chamado foi recebido e está em fase de diagnóstico técnico. Em breve retornaremos com a previsão de conclusão.'
  },
  {
    title: 'Peça solicitada ao almoxarifado',
    text: 'Informamos que a peça/material necessário para a manutenção já foi solicitada ao Almoxarifado/Suprimentos e aguardamos a liberação para aplicação.'
  },
  {
    title: 'Visita técnica agendada no local',
    text: 'Uma equipe de suporte técnico presencial foi escalada e irá ao local informado para realizar o atendimento.'
  },
  {
    title: 'Concluído e testado',
    text: 'O atendimento foi concluído com sucesso. Todos os testes de funcionamento foram realizados e validados. Por favor, confirme a solução e avalie nosso atendimento!'
  }
];

export interface SlaInfo {
  allowedHours: number;
  elapsedHours: number;
  remainingHours: number;
  percentElapsed: number;
  isViolated: boolean;
  isWarning: boolean;
  status: 'ok' | 'warning' | 'violated';
  badgeText: string;
}

export function getSlaInfo(ticket: Request): SlaInfo {
  const allowedHours = SLA_HOURS_MAP[ticket.criticality] || 24;
  const start = new Date(ticket.created_at).getTime();
  const isFinished = ticket.status === 'resolvido' || ticket.status === 'fechado';
  const end = isFinished && ticket.resolved_at 
    ? new Date(ticket.resolved_at).getTime() 
    : Date.now();

  const elapsedHours = Math.max(0, (end - start) / (1000 * 60 * 60));
  const remainingHours = allowedHours - elapsedHours;
  const percentElapsed = Math.min(100, Math.max(0, (elapsedHours / allowedHours) * 100));
  const isViolated = elapsedHours > allowedHours;
  const isWarning = !isViolated && remainingHours <= 2 && !isFinished;

  let status: 'ok' | 'warning' | 'violated' = 'ok';
  if (isViolated) {
    status = 'violated';
  } else if (isWarning) {
    status = 'warning';
  }

  let badgeText = '';
  if (isFinished) {
    badgeText = isViolated 
      ? `Resolvido fora do prazo (${elapsedHours.toFixed(1)}h)` 
      : `Resolvido no prazo (${elapsedHours.toFixed(1)}h / meta ${allowedHours}h)`;
  } else {
    if (isViolated) {
      const overHours = elapsedHours - allowedHours;
      badgeText = `SLA Estourado há ${overHours.toFixed(1)}h`;
    } else {
      if (remainingHours < 1) {
        const mins = Math.round(remainingHours * 60);
        badgeText = `${mins}min restantes`;
      } else {
        badgeText = `${remainingHours.toFixed(1)}h restantes`;
      }
    }
  }

  return {
    allowedHours,
    elapsedHours,
    remainingHours,
    percentElapsed,
    isViolated,
    isWarning,
    status,
    badgeText
  };
}

export interface AttendantMetric {
  id: string;
  name: string;
  total: number;
  inProgress: number;
  resolved: number;
  avgMttrHours: number;
  slaRate: number;
  csatAvg: number;
  csatCount: number;
}

export interface HelpdeskKpiSummary {
  total: number;
  open: number;
  inProgress: number;
  waitingUser: number;
  resolved: number;
  resolutionRate: number;
  slaComplianceRate: number;
  slaMetCount: number;
  slaViolatedCount: number;
  avgMttrHours: number;
  csatAvg: number;
  csatCount: number;
  csatPositivePercent: number;
  byCriticality: { level: number; label: string; count: number; percent: number }[];
  byCategory: { name: string; count: number; percent: number }[];
  bySectorTarget: { sectorId: string; name: string; count: number; percent: number }[];
  bySectorSolicitante: { sectorId: string; name: string; count: number; percent: number }[];
  byAttendant: AttendantMetric[];
  timeline: { date: string; label: string; opened: number; resolved: number }[];
  backlogAging: {
    under24h: number;
    days1to3: number;
    days3to7: number;
    over7d: number;
  };
  ratedTickets: Request[];
}

export function calculateHelpdeskKpis(
  allTickets: Request[],
  period: '7d' | '30d' | '90d' | 'year' | 'all' | 'custom',
  sectors: Sector[],
  customStartDate?: string,
  customEndDate?: string,
  selectedSectorId?: string
): HelpdeskKpiSummary {
  const now = new Date();

  // Filtrar chamados operacionais de Helpdesk (exclui Suprimentos e Jurídico, que possuem telas dedicadas)
  let filtered = allTickets.filter(t => {
    if (t.type !== 'chamado') return false;
    const sec = sectors.find(s => s.id === t.target_sector_id);
    const secName = (sec?.name || '').toLowerCase();
    const cat = (t.category_id || '').toLowerCase();
    if (secName.includes('suprimento') || secName.includes('jurídico') || secName.includes('juridico')) return false;
    if (cat.includes('pendência') || cat.includes('processamento')) return false;
    return true;
  });

  if (selectedSectorId && selectedSectorId !== 'todos') {
    filtered = filtered.filter(t => t.target_sector_id === selectedSectorId);
  }

  if (period !== 'all') {
    let cutoff = new Date();
    if (period === '7d') {
      cutoff.setDate(now.getDate() - 7);
      filtered = filtered.filter(t => new Date(t.created_at) >= cutoff);
    } else if (period === '30d') {
      cutoff.setDate(now.getDate() - 30);
      filtered = filtered.filter(t => new Date(t.created_at) >= cutoff);
    } else if (period === '90d') {
      cutoff.setDate(now.getDate() - 90);
      filtered = filtered.filter(t => new Date(t.created_at) >= cutoff);
    } else if (period === 'year') {
      cutoff = new Date(now.getFullYear(), 0, 1);
      filtered = filtered.filter(t => new Date(t.created_at) >= cutoff);
    } else if (period === 'custom' && customStartDate) {
      const start = new Date(customStartDate);
      const end = customEndDate ? new Date(customEndDate + 'T23:59:59') : new Date();
      filtered = filtered.filter(t => {
        const d = new Date(t.created_at);
        return d >= start && d <= end;
      });
    }
  }

  const total = filtered.length;
  const open = filtered.filter(t => t.status === 'aberto').length;
  const inProgress = filtered.filter(t => t.status === 'em_atendimento').length;
  const waitingUser = filtered.filter(t => t.status === 'aguardando_solicitante').length;
  const resolved = filtered.filter(t => t.status === 'resolvido' || t.status === 'fechado').length;
  const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;

  // SLA & MTTR
  let slaMetCount = 0;
  let slaViolatedCount = 0;
  let totalResolutionTimeHours = 0;
  let resolvedWithTimeCount = 0;

  filtered.forEach(t => {
    const isFinished = t.status === 'resolvido' || t.status === 'fechado';
    const sla = getSlaInfo(t);
    if (isFinished) {
      if (!sla.isViolated) {
        slaMetCount++;
      } else {
        slaViolatedCount++;
      }
      totalResolutionTimeHours += sla.elapsedHours;
      resolvedWithTimeCount++;
    } else {
      if (sla.isViolated) {
        slaViolatedCount++;
      }
    }
  });

  const slaComplianceRate = (resolved + (open + inProgress + waitingUser)) > 0
    ? ((slaMetCount / (slaMetCount + slaViolatedCount || 1)) * 100)
    : 100;

  const avgMttrHours = resolvedWithTimeCount > 0 
    ? (totalResolutionTimeHours / resolvedWithTimeCount) 
    : 0;

  // CSAT
  const rated = filtered.filter(t => t.rating && t.rating > 0);
  const csatCount = rated.length;
  const csatAvg = csatCount > 0 
    ? rated.reduce((acc, t) => acc + (t.rating || 0), 0) / csatCount 
    : 0;
  const positiveRatings = rated.filter(t => (t.rating || 0) >= 4).length;
  const csatPositivePercent = csatCount > 0 ? (positiveRatings / csatCount) * 100 : 0;

  // Criticidade
  const critLabels = ['1 - Baixa', '2 - Média', '3 - Alta', '4 - Crítica', '5 - Parada'];
  const byCriticality = [1, 2, 3, 4, 5].map(level => {
    const count = filtered.filter(t => t.criticality === level).length;
    return {
      level,
      label: critLabels[level - 1],
      count,
      percent: total > 0 ? (count / total) * 100 : 0
    };
  });

  // Categorias
  const catSet = Array.from(new Set(filtered.map(t => t.category_id || 'Geral')));
  const byCategory = catSet.map(cat => {
    const count = filtered.filter(t => (t.category_id || 'Geral') === cat).length;
    return {
      name: cat,
      count,
      percent: total > 0 ? (count / total) * 100 : 0
    };
  }).sort((a, b) => b.count - a.count);

  // Setores Destino
  const bySectorTarget = sectors.map(sec => {
    const count = filtered.filter(t => t.target_sector_id === sec.id).length;
    return {
      sectorId: sec.id,
      name: sec.name,
      count,
      percent: total > 0 ? (count / total) * 100 : 0
    };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  // Setores Solicitantes
  const bySectorSolicitante = sectors.map(sec => {
    const count = filtered.filter(t => t.solicitante_sector_id === sec.id).length;
    return {
      sectorId: sec.id,
      name: sec.name,
      count,
      percent: total > 0 ? (count / total) * 100 : 0
    };
  }).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

  // Atendentes
  const attendantsMap: Record<string, { name: string; tickets: Request[] }> = {};
  filtered.forEach(t => {
    if (t.atendente_id) {
      if (!attendantsMap[t.atendente_id]) {
        attendantsMap[t.atendente_id] = {
          name: t.atendente_name || 'Técnico',
          tickets: []
        };
      }
      attendantsMap[t.atendente_id].tickets.push(t);
    }
  });

  const byAttendant: AttendantMetric[] = Object.entries(attendantsMap).map(([id, data]) => {
    const aTotal = data.tickets.length;
    const aResolved = data.tickets.filter(t => t.status === 'resolvido' || t.status === 'fechado').length;
    const aInProgress = data.tickets.filter(t => t.status === 'em_atendimento' || t.status === 'aguardando_solicitante').length;
    
    let aResolvedTime = 0;
    let aResolvedCount = 0;
    let aSlaMet = 0;
    let aSlaViolated = 0;

    data.tickets.forEach(t => {
      const isFin = t.status === 'resolvido' || t.status === 'fechado';
      const s = getSlaInfo(t);
      if (isFin) {
        if (!s.isViolated) aSlaMet++;
        else aSlaViolated++;
        aResolvedTime += s.elapsedHours;
        aResolvedCount++;
      } else {
        if (s.isViolated) aSlaViolated++;
      }
    });

    const aRated = data.tickets.filter(t => t.rating && t.rating > 0);
    const aCsat = aRated.length > 0 
      ? aRated.reduce((sum, t) => sum + (t.rating || 0), 0) / aRated.length 
      : 0;

    return {
      id,
      name: data.name,
      total: aTotal,
      inProgress: aInProgress,
      resolved: aResolved,
      avgMttrHours: aResolvedCount > 0 ? aResolvedTime / aResolvedCount : 0,
      slaRate: (aSlaMet + aSlaViolated) > 0 ? (aSlaMet / (aSlaMet + aSlaViolated)) * 100 : 100,
      csatAvg: aCsat,
      csatCount: aRated.length
    };
  }).sort((a, b) => b.resolved - a.resolved);

  // Timeline (Últimos dias agrupados)
  const timelineMap: Record<string, { opened: number; resolved: number }> = {};
  const daysCount = period === '7d' ? 7 : (period === '30d' ? 15 : 10);
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const key = d.toISOString().split('T')[0];
    timelineMap[key] = { opened: 0, resolved: 0 };
  }

  filtered.forEach(t => {
    const openKey = t.created_at.split('T')[0];
    if (timelineMap[openKey]) {
      timelineMap[openKey].opened++;
    }
    if (t.resolved_at) {
      const resKey = t.resolved_at.split('T')[0];
      if (timelineMap[resKey]) {
        timelineMap[resKey].resolved++;
      }
    }
  });

  const timeline = Object.entries(timelineMap).map(([date, counts]) => {
    const [_, m, d] = date.split('-');
    return {
      date,
      label: `${d}/${m}`,
      opened: counts.opened,
      resolved: counts.resolved
    };
  });

  // Backlog Aging (Abertos e Em Atendimento)
  const activeBacklog = filtered.filter(t => t.status === 'aberto' || t.status === 'em_atendimento' || t.status === 'aguardando_solicitante');
  let under24h = 0;
  let days1to3 = 0;
  let days3to7 = 0;
  let over7d = 0;

  activeBacklog.forEach(t => {
    const ageHours = (now.getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
    if (ageHours <= 24) under24h++;
    else if (ageHours <= 72) days1to3++;
    else if (ageHours <= 168) days3to7++;
    else over7d++;
  });

  return {
    total,
    open,
    inProgress,
    waitingUser,
    resolved,
    resolutionRate,
    slaComplianceRate,
    slaMetCount,
    slaViolatedCount,
    avgMttrHours,
    csatAvg,
    csatCount,
    csatPositivePercent,
    byCriticality,
    byCategory,
    bySectorTarget,
    bySectorSolicitante,
    byAttendant,
    timeline,
    backlogAging: { under24h, days1to3, days3to7, over7d },
    ratedTickets: rated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  };
}

export function exportHelpdeskCsv(tickets: Request[], sectors: Sector[]) {
  const getSectorName = (id?: string) => sectors.find(s => s.id === id)?.name || id || 'Não especificado';

  const headers = [
    'Numero',
    'Criticidade',
    'Status',
    'Setor Destino',
    'Setor Solicitante',
    'Solicitante',
    'Atendente',
    'Categoria',
    'Local',
    'Data Abertura',
    'Data Resolucao',
    'Tempo Decorrido (Horas)',
    'Meta SLA (Horas)',
    'SLA Status',
    'Avaliacao CSAT (1-5)',
    'Comentario CSAT',
    'Descricao Incidente'
  ];

  const rows = tickets.map(t => {
    const sla = getSlaInfo(t);
    const isFin = t.status === 'resolvido' || t.status === 'fechado';
    return [
      `#${t.number}`,
      `${t.criticality} - ${CRITICALITY_CONFIG[t.criticality]?.label || 'Normal'}`,
      t.status,
      `"${getSectorName(t.target_sector_id).replace(/"/g, '""')}"`,
      `"${getSectorName(t.solicitante_sector_id).replace(/"/g, '""')}"`,
      `"${(t.solicitante_name || '').replace(/"/g, '""')}"`,
      `"${(t.atendente_name || 'Nao atribuido').replace(/"/g, '""')}"`,
      `"${(t.category_id || 'Geral').replace(/"/g, '""')}"`,
      `"${(t.local || 'Nao informado').replace(/"/g, '""')}"`,
      new Date(t.created_at).toLocaleString('pt-BR'),
      t.resolved_at ? new Date(t.resolved_at).toLocaleString('pt-BR') : '',
      sla.elapsedHours.toFixed(2),
      sla.allowedHours.toString(),
      isFin ? (sla.isViolated ? 'Violado' : 'No Prazo') : (sla.isViolated ? 'Estourado' : 'Em Andamento'),
      t.rating ? t.rating.toString() : '',
      `"${(t.rating_comment || '').replace(/"/g, '""')}"`,
      `"${(t.justificativa || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `relatorio_helpdesk_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

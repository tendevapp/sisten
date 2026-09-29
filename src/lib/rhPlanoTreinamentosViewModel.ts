/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Viewmodel unificado para o módulo de Treinamentos do RH:
 * Agrega métricas do Plano, Cronograma Financeiro e Matriz de Conformidade.
 */

import type { CronogramaRh, PlanoRh, StatusPlano } from './rhPlanoTreinamentosApi';
import type {
  RhAlertaTreinamento,
  RhPessoaTreinamento,
  RhTreinamentoCatalogo,
  RhTreinamentoFuncao,
  StatusMatrizTreinamento,
} from './rhMatrizTreinamentosApi';
import type { RhPessoa } from '../types';
import { normalizarChaveTreinamento } from './rhMatrizTreinamentosImport';
import { criarRequisitosPorCargo } from './rhMatrizTreinamentosViewModel';

export interface FiltrosPlanoTreinamentos {
  busca: string;
  ano: string;
  status: StatusPlano | 'todos';
  tipo: PlanoRh['tipo_informacao'] | 'todos';
  responsavel: string;
  mes?: string;
  area?: string;
}

export const quantidadeParticipantes = (plano: PlanoRh): number => plano.participantes?.[0]?.count || 0;

export function filtrarPlanos(planos: PlanoRh[], filtros: FiltrosPlanoTreinamentos): PlanoRh[] {
  const busca = filtros.busca.trim().toLocaleLowerCase('pt-BR');
  return planos.filter((plano) => {
    const texto = [plano.codigo, plano.titulo, plano.responsavel, plano.status, plano.tipo_informacao, plano.local, plano.categoria]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    const atendeMes = !filtros.mes || filtros.mes === 'todos' || plano.data_inicio.slice(5, 7) === filtros.mes;
    const atendeArea = !filtros.area || filtros.area === 'todos' || (plano.local && plano.local.toLowerCase().includes(filtros.area.toLowerCase())) || (plano.categoria && plano.categoria.toLowerCase().includes(filtros.area.toLowerCase()));

    return (
      (!busca || texto.includes(busca)) &&
      (filtros.ano === 'todos' || plano.data_inicio.startsWith(filtros.ano)) &&
      (filtros.status === 'todos' || plano.status === filtros.status) &&
      (filtros.tipo === 'todos' || plano.tipo_informacao === filtros.tipo) &&
      (filtros.responsavel === 'todos' || plano.responsavel === filtros.responsavel) &&
      atendeMes &&
      atendeArea
    );
  });
}

export function criarCompetenciasCronograma(itens: Array<Pick<CronogramaRh, 'meses'>>): string[] {
  return [...new Set(itens.flatMap((item) => item.meses.map((mes) => mes.competencia)))].sort();
}

export function competenciasPadrao(anos = [2026, 2027]): string[] {
  return anos.flatMap((ano) => Array.from({ length: 12 }, (_, indice) => `${ano}-${String(indice + 1).padStart(2, '0')}-01`));
}

const rotuloMes = (competencia: string): string =>
  new Date(`${competencia}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' });

export interface CustoTreinamentoItem {
  id: string;
  titulo: string;
  tipo: PlanoRh['tipo_informacao'];
  cotacaoUnitario: number;
  turmasProgramadas: number;
  turmasRealizadas: number;
  participantesTotal: number;
  custoRealizado: number;
  custoPrevisto: number;
  desvio: number;
}

export function resumirIndicadoresTreinamentos(
  planos: PlanoRh[],
  cronogramas: CronogramaRh[],
  filtros: Pick<FiltrosPlanoTreinamentos, 'ano' | 'tipo'> & { mes?: string; area?: string }
) {
  const planosFiltrados = planos.filter(
    (plano) =>
      (filtros.ano === 'todos' || plano.data_inicio.startsWith(filtros.ano)) &&
      (filtros.tipo === 'todos' || plano.tipo_informacao === filtros.tipo) &&
      (!filtros.mes || filtros.mes === 'todos' || plano.data_inicio.slice(5, 7) === filtros.mes) &&
      (!filtros.area || filtros.area === 'todos' || (plano.local && plano.local.toLowerCase().includes(filtros.area.toLowerCase())) || (plano.categoria && plano.categoria.toLowerCase().includes(filtros.area.toLowerCase())))
  );

  const cronogramasFiltrados = cronogramas;
  const competencias =
    filtros.ano === 'todos'
      ? criarCompetenciasCronograma(cronogramasFiltrados).length
        ? criarCompetenciasCronograma(cronogramasFiltrados)
        : [...new Set(planosFiltrados.map((plano) => `${plano.data_inicio.slice(0, 7)}-01`))].sort()
      : competenciasPadrao([Number(filtros.ano)]);

  const porMes = competencias.map((competencia) => {
    const planosMes = planosFiltrados.filter((plano) => plano.data_inicio.slice(0, 7) === competencia.slice(0, 7));
    const quantidadePrevista = cronogramasFiltrados.reduce(
      (total, cronograma) => total + (cronograma.meses.find((mes) => mes.competencia === competencia)?.quantidade || 0),
      0
    );
    const custoPrevisto = Math.round(
      cronogramasFiltrados.reduce(
        (total, cronograma) =>
          total + (cronograma.meses.find((mes) => mes.competencia === competencia)?.quantidade || 0) * Number(cronograma.cotacao || 0),
        0
      )
    );
    const custoRealizado = Math.round(planosMes.reduce((total, p) => total + Number(p.custo_total || 0), 0));
    const horasRealizadas = Math.round(
      planosMes.filter((p) => p.status === 'realizado').reduce((total, p) => total + Number(p.carga_horaria || 0), 0)
    );

    return {
      competencia,
      mes: rotuloMes(competencia),
      programados: planosMes.length,
      realizados: planosMes.filter((plano) => plano.status === 'realizado').length,
      participacoes: planosMes.reduce((total, plano) => total + quantidadeParticipantes(plano), 0),
      quantidadePrevista,
      custoPrevisto,
      custoRealizado,
      horasRealizadas,
    };
  });

  const custoPrevisto = Math.round(porMes.reduce((total, mes) => total + mes.custoPrevisto, 0));
  const custoRealizado = Math.round(planosFiltrados.reduce((total, plano) => total + Number(plano.custo_total || 0), 0));
  const participacoes = planosFiltrados.reduce((total, plano) => total + quantidadeParticipantes(plano), 0);
  const capacidade = planosFiltrados.reduce((total, plano) => total + Number(plano.participantes_planejados || 0), 0);
  const programados = planosFiltrados.length;
  const realizados = planosFiltrados.filter((plano) => plano.status === 'realizado').length;
  const atrasados = planosFiltrados.filter((plano) => plano.status === 'atrasado').length;
  const reagendados = planosFiltrados.filter((plano) => plano.status === 'reagendado').length;
  const cancelados = planosFiltrados.filter((plano) => plano.status === 'cancelado').length;

  const horasTotais = Math.round(
    planosFiltrados.filter((p) => p.status === 'realizado').reduce((total, p) => total + Number(p.carga_horaria || 0), 0)
  );
  const hht = Math.round(
    planosFiltrados
      .filter((p) => p.status === 'realizado')
      .reduce((total, p) => total + quantidadeParticipantes(p) * Number(p.carga_horaria || 0), 0)
  );

  // Custos e estatísticas agrupados por treinamento
  const mapaTreinamentos = new Map<string, CustoTreinamentoItem>();
  planosFiltrados.forEach((plano) => {
    const chave = plano.titulo || 'Treinamento sem título';
    const atual = mapaTreinamentos.get(chave) || {
      id: plano.treinamento_id || plano.id,
      titulo: chave,
      tipo: plano.tipo_informacao,
      cotacaoUnitario: 0,
      turmasProgramadas: 0,
      turmasRealizadas: 0,
      participantesTotal: 0,
      custoRealizado: 0,
      custoPrevisto: 0,
      desvio: 0,
    };

    atual.turmasProgramadas += 1;
    if (plano.status === 'realizado') atual.turmasRealizadas += 1;
    atual.participantesTotal += quantidadeParticipantes(plano);
    atual.custoRealizado = Math.round(atual.custoRealizado + Number(plano.custo_total || 0));

    mapaTreinamentos.set(chave, atual);
  });

  // Vincula cotação prevista do cronograma
  cronogramasFiltrados.forEach((crono) => {
    const chave = crono.descricao;
    const previsto = Math.round(
      crono.meses.reduce((acc, m) => acc + (m.quantidade || 0), 0) * Number(crono.cotacao || 0)
    );
    const existente = mapaTreinamentos.get(chave);
    if (existente) {
      existente.cotacaoUnitario = Math.round(Number(crono.cotacao || 0));
      existente.custoPrevisto = previsto;
      existente.desvio = Math.round(existente.custoRealizado - previsto);
    } else {
      mapaTreinamentos.set(chave, {
        id: crono.treinamento_id || crono.id,
        titulo: chave,
        tipo: 'interno',
        cotacaoUnitario: Math.round(Number(crono.cotacao || 0)),
        turmasProgramadas: 0,
        turmasRealizadas: 0,
        participantesTotal: 0,
        custoRealizado: 0,
        custoPrevisto: previsto,
        desvio: -previsto,
      });
    }
  });

  const custosPorTreinamento = Array.from(mapaTreinamentos.values()).sort((a, b) => b.custoRealizado - a.custoRealizado);

  return {
    planos: planosFiltrados,
    programados,
    realizados,
    atrasados,
    reagendados,
    cancelados,
    participacoes,
    capacidade,
    taxaOcupacao: capacidade > 0 ? Math.round((participacoes / capacidade) * 100) : 0,
    taxaRealizacao: programados > 0 ? Math.round((realizados / programados) * 100) : 0,
    horasTotais,
    hht,
    custoRealizado,
    custoPrevisto,
    desvioOrcamentario: Math.round(custoRealizado - custoPrevisto),
    custoMedioParticipante: participacoes > 0 ? Math.round(custoRealizado / participacoes) : 0,
    custosPorTreinamento,
    porMes,
    porStatus: ([
      'programado',
      'realizado',
      'atrasado',
      'reagendado',
      'cancelado',
    ] as StatusPlano[]).map((status) => ({
      status,
      quantidade: planosFiltrados.filter((plano) => plano.status === status).length,
    })),
  };
}

export interface AreaConformidade {
  area: string;
  totalPessoas: number;
  aptos: number;
  vencidos: number;
  pendentes: number;
  taxaConformidade: number;
}

export interface TreinamentoCritico {
  id: string;
  nome: string;
  totalVencidos: number;
  totalProximos: number;
  totalPendentes: number;
}

export function resumirIndicadoresMatriz(params: {
  pessoas: RhPessoa[];
  catalogo: RhTreinamentoCatalogo[];
  requisitos: RhTreinamentoFuncao[];
  registros: RhPessoaTreinamento[];
  alertas: RhAlertaTreinamento[];
  area?: string;
  busca?: string;
}) {
  const { pessoas, catalogo, requisitos, registros, alertas, area, busca } = params;

  const buscaNorm = (busca || '').trim().toLowerCase();
  const areaNorm = area && area !== 'todos' ? area.trim().toLowerCase() : '';

  const pessoasFiltradas = pessoas.filter((p) => {
    const bateArea = !areaNorm || (p.area || '').toLowerCase().includes(areaNorm);
    const bateBusca = !buscaNorm || `${p.nome} ${p.registro} ${p.cargo || ''} ${p.area || ''}`.toLowerCase().includes(buscaNorm);
    return bateArea && bateBusca;
  });

  const requisitosPorCargo = criarRequisitosPorCargo(requisitos);
  const registrosPorChave = new Map(registros.map((r) => [`${r.pessoa_id}|${r.treinamento_id}`, r]));

  let totalMonitorados = 0;
  let totalAptos = 0;
  let totalVencidos = 0;
  let totalPendentes = 0;

  const mapaAreas = new Map<string, { total: number; aptos: number; vencidos: number; pendentes: number }>();
  const mapaTreinamentosCriticos = new Map<string, { nome: string; vencidos: number; proximos: number; pendentes: number }>();

  catalogo.forEach((cat) => {
    mapaTreinamentosCriticos.set(cat.id, { nome: cat.nome, vencidos: 0, proximos: 0, pendentes: 0 });
  });

  pessoasFiltradas.forEach((pessoa) => {
    const cargoChave = normalizarChaveTreinamento(pessoa.cargo || '');
    const obrigatorios = requisitosPorCargo.get(cargoChave);
    const nomeArea = (pessoa.area || 'Outros / Não informada').trim();

    const dadosArea = mapaAreas.get(nomeArea) || { total: 0, aptos: 0, vencidos: 0, pendentes: 0 };
    dadosArea.total += 1;

    if (!obrigatorios || obrigatorios.size === 0) {
      // Se não tem requisitos obrigatórios cadastrados, conta como apto padrão
      dadosArea.aptos += 1;
      mapaAreas.set(nomeArea, dadosArea);
      totalMonitorados += 1;
      totalAptos += 1;
      return;
    }

    totalMonitorados += 1;
    let pessoaTemVencido = false;
    let pessoaTemPendente = false;

    obrigatorios.forEach((treinamentoId) => {
      const reg = registrosPorChave.get(`${pessoa.id}|${treinamentoId}`);
      const st = reg?.status || 'pendente';
      const crit = mapaTreinamentosCriticos.get(treinamentoId);

      if (st === 'vencido') {
        pessoaTemVencido = true;
        if (crit) crit.vencidos += 1;
      } else if (st === 'pendente') {
        pessoaTemPendente = true;
        if (crit) crit.pendentes += 1;
      }
    });

    if (pessoaTemVencido) {
      totalVencidos += 1;
      dadosArea.vencidos += 1;
    } else if (pessoaTemPendente) {
      totalPendentes += 1;
      dadosArea.pendentes += 1;
    } else {
      totalAptos += 1;
      dadosArea.aptos += 1;
    }

    mapaAreas.set(nomeArea, dadosArea);
  });

  // Alertas de vencimento (vencidos e próximos a vencer)
  const alertasFiltrados = alertas.filter((a) => {
    const pessoa = pessoas.find((p) => p.id === a.pessoa_id);
    const bateArea = !areaNorm || ((pessoa?.area || '').toLowerCase().includes(areaNorm));
    const bateBusca = !buscaNorm || `${a.colaborador} ${a.registro} ${a.treinamento}`.toLowerCase().includes(buscaNorm);
    return bateArea && bateBusca;
  });

  alertasFiltrados.forEach((alerta) => {
    if (alerta.status_calculado === 'proximo_vencimento') {
      const crit = mapaTreinamentosCriticos.get(alerta.treinamento_id);
      if (crit) crit.proximos += 1;
    }
  });

  const proximosVencimentoCount = alertasFiltrados.filter((a) => a.status_calculado === 'proximo_vencimento').length;

  const porArea: AreaConformidade[] = Array.from(mapaAreas.entries())
    .map(([nome, dados]) => ({
      area: nome,
      totalPessoas: dados.total,
      aptos: dados.aptos,
      vencidos: dados.vencidos,
      pendentes: dados.pendentes,
      taxaConformidade: dados.total > 0 ? Math.round((dados.aptos / dados.total) * 100) : 100,
    }))
    .sort((a, b) => a.taxaConformidade - b.taxaConformidade);

  const topTreinamentosCriticos: TreinamentoCritico[] = Array.from(mapaTreinamentosCriticos.entries())
    .map(([id, dados]) => ({
      id,
      nome: dados.nome,
      totalVencidos: dados.vencidos,
      totalProximos: dados.proximos,
      totalPendentes: dados.pendentes,
    }))
    .filter((t) => t.totalVencidos > 0 || t.totalProximos > 0 || t.totalPendentes > 0)
    .sort((a, b) => b.totalVencidos + b.totalPendentes - (a.totalVencidos + a.totalPendentes))
    .slice(0, 8);

  const taxaConformidadeGeral = totalMonitorados > 0 ? Math.round((totalAptos / totalMonitorados) * 100) : 0;

  return {
    totalColaboradores: pessoasFiltradas.length,
    totalMonitorados,
    totalAptos,
    totalVencidos,
    totalPendentes,
    proximosVencimentoCount,
    taxaConformidadeGeral,
    porArea,
    topTreinamentosCriticos,
    alertas: alertasFiltrados,
  };
}

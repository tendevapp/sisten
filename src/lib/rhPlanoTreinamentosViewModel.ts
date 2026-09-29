import type { CronogramaRh, PlanoRh, StatusPlano } from './rhPlanoTreinamentosApi';

export interface FiltrosPlanoTreinamentos {
  busca: string;
  ano: string;
  status: StatusPlano | 'todos';
  tipo: PlanoRh['tipo_informacao'] | 'todos';
  responsavel: string;
}

export const quantidadeParticipantes = (plano: PlanoRh) => plano.participantes?.[0]?.count || 0;

export function filtrarPlanos(planos: PlanoRh[], filtros: FiltrosPlanoTreinamentos) {
  const busca = filtros.busca.trim().toLocaleLowerCase('pt-BR');
  return planos.filter(plano => {
    const texto = [plano.codigo, plano.titulo, plano.responsavel, plano.status, plano.tipo_informacao].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    return (!busca || texto.includes(busca))
      && (filtros.ano === 'todos' || plano.data_inicio.startsWith(filtros.ano))
      && (filtros.status === 'todos' || plano.status === filtros.status)
      && (filtros.tipo === 'todos' || plano.tipo_informacao === filtros.tipo)
      && (filtros.responsavel === 'todos' || plano.responsavel === filtros.responsavel);
  });
}

export function criarCompetenciasCronograma(itens: Array<Pick<CronogramaRh, 'meses'>>): string[] {
  return [...new Set(itens.flatMap(item => item.meses.map(mes => mes.competencia)))].sort();
}

export function competenciasPadrao(anos = [2026, 2027]): string[] {
  return anos.flatMap(ano => Array.from({ length: 12 }, (_, indice) => `${ano}-${String(indice + 1).padStart(2, '0')}-01`));
}

const rotuloMes = (competencia: string) => new Date(`${competencia}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' });

export function resumirIndicadoresTreinamentos(planos: PlanoRh[], cronogramas: CronogramaRh[], filtros: Pick<FiltrosPlanoTreinamentos, 'ano' | 'tipo'>) {
  const planosFiltrados = planos.filter(plano => (filtros.ano === 'todos' || plano.data_inicio.startsWith(filtros.ano)) && (filtros.tipo === 'todos' || plano.tipo_informacao === filtros.tipo));
  // O chamador pode associar o cronograma ao catálogo, enquanto o plano pode não ter
  // evento correspondente no período. Por isso o recorte de tipo do cronograma é feito
  // antes desta função, sem inferi-lo a partir de eventos do plano.
  const cronogramasFiltrados = cronogramas;
  const competencias = filtros.ano === 'todos'
    ? criarCompetenciasCronograma(cronogramasFiltrados).length ? criarCompetenciasCronograma(cronogramasFiltrados) : [...new Set(planosFiltrados.map(plano => `${plano.data_inicio.slice(0, 7)}-01`))].sort()
    : competenciasPadrao([Number(filtros.ano)]);
  const porMes = competencias.map(competencia => {
    const planosMes = planosFiltrados.filter(plano => plano.data_inicio.slice(0, 7) === competencia.slice(0, 7));
    const quantidadePrevista = cronogramasFiltrados.reduce((total, cronograma) => total + (cronograma.meses.find(mes => mes.competencia === competencia)?.quantidade || 0), 0);
    const custoPrevisto = cronogramasFiltrados.reduce((total, cronograma) => total + (cronograma.meses.find(mes => mes.competencia === competencia)?.quantidade || 0) * Number(cronograma.cotacao || 0), 0);
    return {
      competencia,
      mes: rotuloMes(competencia),
      programados: planosMes.length,
      realizados: planosMes.filter(plano => plano.status === 'realizado').length,
      participacoes: planosMes.reduce((total, plano) => total + quantidadeParticipantes(plano), 0),
      quantidadePrevista,
      custoPrevisto,
    };
  });
  const custoPrevisto = porMes.reduce((total, mes) => total + mes.custoPrevisto, 0);
  return {
    planos: planosFiltrados,
    programados: planosFiltrados.length,
    realizados: planosFiltrados.filter(plano => plano.status === 'realizado').length,
    participacoes: planosFiltrados.reduce((total, plano) => total + quantidadeParticipantes(plano), 0),
    capacidade: planosFiltrados.reduce((total, plano) => total + Number(plano.participantes_planejados || 0), 0),
    custoRealizado: planosFiltrados.reduce((total, plano) => total + Number(plano.custo_total || 0), 0),
    custoPrevisto,
    porMes,
    porStatus: (['programado', 'realizado', 'atrasado', 'reagendado', 'cancelado'] as StatusPlano[]).map(status => ({ status, quantidade: planosFiltrados.filter(plano => plano.status === status).length })),
  };
}

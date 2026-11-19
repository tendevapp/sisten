/**
 * Calculo puro de metricas e linha do tempo de uso individual a partir dos
 * eventos brutos de `ops_eventos_uso`.
 */
import { labelForPath } from './usageTracker';

export interface EventoUsoBruto {
  id: string;
  event_type: string;
  path: string | null;
  page_label: string | null;
  session_id: string | null;
  created_at: string;
}

export interface EventoUsoIndividual {
  id: string;
  event_type: 'login' | 'page_view' | string;
  path: string | null;
  page_label: string;
  session_id: string | null;
  created_at: string;
  dwell_seconds: number | null;
}

export interface ResumoPaginaIndividual {
  path: string;
  page_label: string;
  visitas: number;
  tempoTotalSeg: number;
  tempoMedioSeg: number | null;
  ultimaVisita: string;
}

export interface ResumoUsoIndividual {
  totalEventos: number;
  totalLogins: number;
  totalVisualizacoes: number;
  sessoesDistintas: number;
  paginasDistintas: number;
  tempoTotalSeg: number;
  primeiroEvento: string | null;
  ultimoEvento: string | null;
  eventos: EventoUsoIndividual[];
  rankingPaginas: ResumoPaginaIndividual[];
  porHora: { hora: number; eventos: number }[];
}

const MAX_DWELL_SEG = 1800; // 30 min entre eventos consecutivos na mesma sessao

/**
 * Processa eventos ordenados cronologicamente (ou fora de ordem) de um unico
 * usuario e devolve KPIs, ranking de paginas, distribuicao por hora e linha do tempo.
 */
export function consolidarUsoIndividual(brutos: EventoUsoBruto[]): ResumoUsoIndividual {
  const ordenados = [...brutos].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const sessoes = new Set<string>();
  const paginasMap = new Map<string, {
    path: string;
    page_label: string;
    visitas: number;
    tempoTotalSeg: number;
    amostrasTempo: number;
    ultimaVisita: string;
  }>();
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, eventos: 0 }));

  const eventos: EventoUsoIndividual[] = [];
  let totalLogins = 0;
  let totalVisualizacoes = 0;
  let tempoTotalSeg = 0;

  for (let i = 0; i < ordenados.length; i++) {
    const atual = ordenados[i];
    if (atual.session_id) sessoes.add(atual.session_id);

    const dt = new Date(atual.created_at);
    if (!Number.isNaN(dt.getTime())) {
      horas[dt.getHours()].eventos += 1;
    }

    let dwell: number | null = null;
    if (atual.event_type === 'page_view' && atual.path) {
      totalVisualizacoes += 1;
      const proximo = ordenados[i + 1];
      if (proximo) {
        const diffSeg = (new Date(proximo.created_at).getTime() - dt.getTime()) / 1000;
        const mesmaSessao = !atual.session_id || !proximo.session_id || atual.session_id === proximo.session_id;
        if (diffSeg > 0 && diffSeg <= MAX_DWELL_SEG && mesmaSessao) {
          dwell = diffSeg;
          tempoTotalSeg += diffSeg;
        }
      }

      const rotulo = atual.page_label || labelForPath(atual.path);
      const entrada = paginasMap.get(atual.path) ?? {
        path: atual.path,
        page_label: rotulo,
        visitas: 0,
        tempoTotalSeg: 0,
        amostrasTempo: 0,
        ultimaVisita: atual.created_at,
      };
      entrada.visitas += 1;
      if (dwell !== null) {
        entrada.tempoTotalSeg += dwell;
        entrada.amostrasTempo += 1;
      }
      if (atual.created_at > entrada.ultimaVisita) {
        entrada.ultimaVisita = atual.created_at;
        entrada.page_label = rotulo;
      }
      paginasMap.set(atual.path, entrada);
    } else if (atual.event_type === 'login') {
      totalLogins += 1;
    }

    eventos.push({
      id: atual.id || `${atual.created_at}-${i}`,
      event_type: atual.event_type,
      path: atual.path,
      page_label: atual.event_type === 'login'
        ? 'Login no sistema'
        : atual.page_label || (atual.path ? labelForPath(atual.path) : 'Evento'),
      session_id: atual.session_id,
      created_at: atual.created_at,
      dwell_seconds: dwell,
    });
  }

  const rankingPaginas: ResumoPaginaIndividual[] = Array.from(paginasMap.values())
    .map(p => ({
      path: p.path,
      page_label: p.page_label,
      visitas: p.visitas,
      tempoTotalSeg: p.tempoTotalSeg,
      tempoMedioSeg: p.amostrasTempo > 0 ? p.tempoTotalSeg / p.amostrasTempo : null,
      ultimaVisita: p.ultimaVisita,
    }))
    .sort((a, b) => b.visitas - a.visitas || b.tempoTotalSeg - a.tempoTotalSeg);

  return {
    totalEventos: ordenados.length,
    totalLogins,
    totalVisualizacoes,
    sessoesDistintas: sessoes.size || (ordenados.length > 0 ? 1 : 0),
    paginasDistintas: rankingPaginas.length,
    tempoTotalSeg,
    primeiroEvento: ordenados[0]?.created_at ?? null,
    ultimoEvento: ordenados[ordenados.length - 1]?.created_at ?? null,
    eventos,
    rankingPaginas,
    porHora: horas,
  };
}


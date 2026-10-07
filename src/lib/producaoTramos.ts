export const MARCOS_TRAMO = [
  'inicio',
  'liberado_nav02',
  'liberado_jato',
  'liberado_patio',
  'expedido',
] as const;

export type MarcoTramo = (typeof MARCOS_TRAMO)[number];

export interface EstadoTramo {
  inicioEm?: string;
  liberadoNav02Em?: string;
  liberadoJatoEm?: string;
  liberadoPatioEm?: string;
  expedidoEm?: string;
  setorAtual?: string;
  atividadeAtual?: string;
  reparosSolda?: number;
}

export interface EventoTramoReducao {
  tipo: 'marco' | 'situacao';
  marco?: MarcoTramo;
  dataOperacional: string;
  setor?: string;
  atividade?: string;
  reparosSolda?: number;
}

const CAMPO_MARCO: Record<MarcoTramo, keyof EstadoTramo> = {
  inicio: 'inicioEm',
  liberado_nav02: 'liberadoNav02Em',
  liberado_jato: 'liberadoJatoEm',
  liberado_patio: 'liberadoPatioEm',
  expedido: 'expedidoEm',
};

export function validarEventoTramo(
  evento: Pick<EventoTramoReducao, 'marco' | 'dataOperacional'>,
  atual: EstadoTramo,
): string[] {
  if (evento.marco === 'liberado_jato' && atual.liberadoNav02Em && evento.dataOperacional < atual.liberadoNav02Em) {
    return ['Jato não pode anteceder a liberação para NAV02.'];
  }
  return [];
}

export function estadoTramo(eventos: EventoTramoReducao[]): EstadoTramo {
  return [...eventos]
    .sort((a, b) => a.dataOperacional.localeCompare(b.dataOperacional))
    .reduce<EstadoTramo>((atual, evento) => {
      if (evento.tipo === 'marco' && evento.marco) atual[CAMPO_MARCO[evento.marco]] = evento.dataOperacional;
      if (evento.tipo === 'situacao') {
        if (evento.setor) atual.setorAtual = evento.setor;
        if (evento.atividade) atual.atividadeAtual = evento.atividade;
        if (evento.reparosSolda != null) atual.reparosSolda = evento.reparosSolda;
      }
      return atual;
    }, {});
}

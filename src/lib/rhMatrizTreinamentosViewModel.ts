import type { StatusMatrizTreinamento } from './rhMatrizTreinamentosApi';

interface RequisitoMinimo {
  cargo_chave: string;
  treinamento_id: string;
}

export function criarRequisitosPorCargo(requisitos: RequisitoMinimo[]): Map<string, Set<string>> {
  const porCargo = new Map<string, Set<string>>();
  requisitos.forEach(({ cargo_chave, treinamento_id }) => {
    const treinamentos = porCargo.get(cargo_chave) || new Set<string>();
    treinamentos.add(treinamento_id);
    porCargo.set(cargo_chave, treinamentos);
  });
  return porCargo;
}

export function statusNaMatriz(params: {
  statusRegistrado: StatusMatrizTreinamento | null;
  requisitos: Map<string, Set<string>>;
  cargoChave: string;
  treinamentoId: string;
}): StatusMatrizTreinamento | null {
  if (params.statusRegistrado) return params.statusRegistrado;
  return params.requisitos.get(params.cargoChave)?.has(params.treinamentoId) ? 'pendente' : null;
}

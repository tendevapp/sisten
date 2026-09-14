/**
 * Regras puras compartilhadas pelo cadastro de veículos leves e pelo formulário
 * de ocorrências da Portaria.
 */

export interface VeiculoLeveBusca {
  id: string;
  modelo: string;
  placa: string;
  ativo: boolean;
}

export const DIAS_ALERTA_LICENCIAMENTO = 30;

export type StatusLicenciamento = 'regular' | 'proximo' | 'vencido' | 'sem_data';

export interface ResultadoLicenciamento {
  status: StatusLicenciamento;
  diasRestantes: number | null;
}

export function normalizarModeloVeiculoLeve(modelo: string): string {
  return modelo.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizarPlacaVeiculoLeve(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function timestampDataISO(dataISO: string): number {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

export function obterStatusLicenciamento(
  dataLicenciamento: string | null | undefined,
  hojeISO = new Date().toISOString().slice(0, 10),
): ResultadoLicenciamento {
  if (!dataLicenciamento) return { status: 'sem_data', diasRestantes: null };

  const diasRestantes = Math.round(
    (timestampDataISO(dataLicenciamento) - timestampDataISO(hojeISO)) / 86_400_000,
  );

  if (diasRestantes < 0) return { status: 'vencido', diasRestantes };
  if (diasRestantes <= DIAS_ALERTA_LICENCIAMENTO) return { status: 'proximo', diasRestantes };
  return { status: 'regular', diasRestantes };
}

export function filtrarVeiculosLeves<T extends VeiculoLeveBusca>(veiculos: T[], termo: string): T[] {
  const busca = termo.trim().toUpperCase();
  return veiculos.filter((veiculo) => {
    if (!veiculo.ativo) return false;
    if (!busca) return true;
    return (
      normalizarModeloVeiculoLeve(veiculo.modelo).includes(busca) ||
      normalizarPlacaVeiculoLeve(veiculo.placa).includes(normalizarPlacaVeiculoLeve(busca))
    );
  });
}

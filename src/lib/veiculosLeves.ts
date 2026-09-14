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

export function normalizarModeloVeiculoLeve(modelo: string): string {
  return modelo.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizarPlacaVeiculoLeve(placa: string): string {
  return placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
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

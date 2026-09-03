/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lead time de entregas por UF de origem — usado no cadastro em
 * "Cadastros Gerais > Suprimentos" e na resolução de previsão de entrega
 * (`previsão = data de remessa + N dias corridos`, ver
 * `db/sql/tables/sup_prazos_transporte.sql` e `lib/diligenciamento.ts`).
 *
 * Os valores abaixo são apenas a SEMENTE inicial. A tabela
 * `sup_prazos_transporte` (transportadora vazia) é a fonte da verdade e é
 * editável pelo admin na tela de Cadastros Gerais.
 */

export interface UfInfo {
  uf: string;
  nome: string;
  regiao: 'Norte' | 'Nordeste' | 'Centro-Oeste' | 'Sudeste' | 'Sul';
}

export const UFS_BRASIL: UfInfo[] = [
  { uf: 'AC', nome: 'Acre', regiao: 'Norte' },
  { uf: 'AL', nome: 'Alagoas', regiao: 'Nordeste' },
  { uf: 'AP', nome: 'Amapá', regiao: 'Norte' },
  { uf: 'AM', nome: 'Amazonas', regiao: 'Norte' },
  { uf: 'BA', nome: 'Bahia', regiao: 'Nordeste' },
  { uf: 'CE', nome: 'Ceará', regiao: 'Nordeste' },
  { uf: 'DF', nome: 'Distrito Federal', regiao: 'Centro-Oeste' },
  { uf: 'ES', nome: 'Espírito Santo', regiao: 'Sudeste' },
  { uf: 'GO', nome: 'Goiás', regiao: 'Centro-Oeste' },
  { uf: 'MA', nome: 'Maranhão', regiao: 'Nordeste' },
  { uf: 'MT', nome: 'Mato Grosso', regiao: 'Centro-Oeste' },
  { uf: 'MS', nome: 'Mato Grosso do Sul', regiao: 'Centro-Oeste' },
  { uf: 'MG', nome: 'Minas Gerais', regiao: 'Sudeste' },
  { uf: 'PA', nome: 'Pará', regiao: 'Norte' },
  { uf: 'PB', nome: 'Paraíba', regiao: 'Nordeste' },
  { uf: 'PR', nome: 'Paraná', regiao: 'Sul' },
  { uf: 'PE', nome: 'Pernambuco', regiao: 'Nordeste' },
  { uf: 'PI', nome: 'Piauí', regiao: 'Nordeste' },
  { uf: 'RJ', nome: 'Rio de Janeiro', regiao: 'Sudeste' },
  { uf: 'RN', nome: 'Rio Grande do Norte', regiao: 'Nordeste' },
  { uf: 'RS', nome: 'Rio Grande do Sul', regiao: 'Sul' },
  { uf: 'RO', nome: 'Rondônia', regiao: 'Norte' },
  { uf: 'RR', nome: 'Roraima', regiao: 'Norte' },
  { uf: 'SC', nome: 'Santa Catarina', regiao: 'Sul' },
  { uf: 'SP', nome: 'São Paulo', regiao: 'Sudeste' },
  { uf: 'SE', nome: 'Sergipe', regiao: 'Nordeste' },
  { uf: 'TO', nome: 'Tocantins', regiao: 'Norte' },
];

/**
 * Dias corridos somados à data de remessa, por UF de origem. Cadastro
 * inicial informado pelo time de Suprimentos:
 *   SP +8 · MG +6 · PE +4 · BA +2 · Sudeste +8 · Sul +10 · Norte +10 ·
 *   Centro-Oeste +10.
 * Nordeste não teve valor de região informado — além de PE e BA, os demais
 * estados nordestinos foram semeados com +4 (mesmo de PE) e podem ser
 * ajustados na tela.
 */
export const PRAZO_ENTREGA_PADRAO_DIAS: Record<string, number> = {
  // Norte
  AC: 10, AP: 10, AM: 10, PA: 10, RO: 10, RR: 10, TO: 10,
  // Nordeste
  AL: 4, BA: 2, CE: 4, MA: 4, PB: 4, PE: 4, PI: 4, RN: 4, SE: 4,
  // Centro-Oeste
  DF: 10, GO: 10, MT: 10, MS: 10,
  // Sudeste
  ES: 8, MG: 6, RJ: 8, SP: 8,
  // Sul
  PR: 10, RS: 10, SC: 10,
};

/** Prazo aplicado quando a UF de origem não está cadastrada. */
export const PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS = 8;

export function infoDaUf(uf: string): UfInfo | undefined {
  return UFS_BRASIL.find((u) => u.uf === (uf || '').toUpperCase());
}

export function regiaoDaUf(uf: string): string {
  return infoDaUf(uf)?.regiao ?? '';
}

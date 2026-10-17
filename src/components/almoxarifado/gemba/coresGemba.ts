/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cores da cena do Gemba. Montante azul e longarina laranja como as estantes do
 * galpão, piso de concreto e faixas amarelas de tráfego; o item procurado acende
 * em âmbar e o bloco clicado no verde do SISTEN.
 */

export interface CoresGemba {
  fundo: string;
  chaoExterno: string;
  concreto: { base: string; mancha: string; junta: string };
  faixa: string;
  montante: string;
  longarina: string;
  prateleira: string;
  /** Cor de cada zona da planta (pintura do piso e borda do rótulo). */
  zona: Record<string, string>;
  rotulo: { fundo: string; tinta: string };
  placaRua: { fundo: string; tinta: string; borda: string };
  destaque: string;
  selecao: string;
  hover: string;
}

const ZONA: Record<string, string> = {
  portico: '#b45309',
  apoio_producao: '#64748b',
  empilhadeiras: '#ca8a04',
  montagem_kits: '#0d9488',
  segregados: '#ea580c',
  balcao: '#059669',
  entrada: '#16a34a',
  apoio_manutencao: '#57534e',
  recebimento: '#0f766e',
  compra_direta: '#78716c',
  descompressao: '#be123c',
  anexo: '#d97706',
  saida: '#16a34a',
};

const CLARO: CoresGemba = {
  fundo: '#e6ebf0',
  chaoExterno: '#c9d0c6',
  concreto: { base: '#c8cbcc', mancha: 'rgba(70,74,78,0.028)', junta: 'rgba(60,63,66,0.12)' },
  faixa: '#efc317',
  montante: '#1d4f91',
  longarina: '#e0561f',
  prateleira: '#c3c7cb',
  zona: ZONA,
  rotulo: { fundo: 'rgba(255,255,255,0.95)', tinta: '#1f2937' },
  placaRua: { fundo: '#f2c811', tinta: '#111111', borda: '#b8860b' },
  destaque: '#f59e0b',
  selecao: '#059669',
  hover: '#0ea5e9',
};

const ESCURO: CoresGemba = {
  fundo: '#0b1018',
  chaoExterno: '#121821',
  concreto: { base: '#2a2f37', mancha: 'rgba(255,255,255,0.018)', junta: 'rgba(0,0,0,0.3)' },
  faixa: '#d4ad12',
  montante: '#3a6fc2',
  longarina: '#f0682e',
  prateleira: '#4b5563',
  zona: ZONA,
  rotulo: { fundo: 'rgba(17,24,39,0.92)', tinta: '#e5e7eb' },
  placaRua: { fundo: '#e7bd10', tinta: '#111111', borda: '#8a6a07' },
  destaque: '#fbbf24',
  selecao: '#10b981',
  hover: '#38bdf8',
};

export function coresGemba(escuro: boolean): CoresGemba {
  return escuro ? ESCURO : CLARO;
}

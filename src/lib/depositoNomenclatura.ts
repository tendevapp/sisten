/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Nomenclatura oficial dos depósitos e áreas físicas do almoxarifado,
 * conforme o mapa/layout físico do galpão (elaborado por Jamille Batista).
 */

export interface DepositoNomenclatura {
  id: string;
  nome: string;
}

/**
 * Áreas e depósitos mapeados na planta física do almoxarifado,
 * na ordem lógica de apresentação.
 */
export const DEPOSITOS_PLANTA: readonly DepositoNomenclatura[] = [
  { id: '0001', nome: 'DEPÓSITO 0001' },
  { id: '0002', nome: 'DEPÓSITO 0002' },
  { id: '0003', nome: 'DEPÓSITO 0003' },
  { id: '0004', nome: 'DEPÓSITO 0004' },
  { id: '0005', nome: 'DEPÓSITO 0005' },
  { id: '1000', nome: 'RECEBIMENTO DEPÓSITO 1000' },
  { id: '0050', nome: 'COMPRA DIRETA 0050' },
  { id: 'anexo_0004', nome: 'ANEXO 0004' },
  { id: 'apoio_manutencao', nome: 'MATERIAL APOIO MANUTENÇÃO' },
  { id: 'apoio_producao', nome: 'MATERIAL APOIO PRODUÇÃO' },
  { id: 'montagem_kits', nome: 'ÁREA DE MONTAGEM DE KITS' },
  { id: 'segregados', nome: 'ÁREA DE SEGREGADOS E EXPEDIÇÃO' },
  { id: 'balcao', nome: 'BALCÃO DE ATENDIMENTO' },
  { id: 'portico', nome: 'ESTACIONAMENTO PÓRTICO' },
  { id: 'empilhadeiras', nome: 'ESTACIONAMENTO EMPILHADEIRAS' },
  { id: 'descompressao', nome: 'ÁREA DESCOMPRESSÃO' },
] as const;

const MAPA_NOMES = new Map<string, string>(
  DEPOSITOS_PLANTA.map((d) => [d.id, d.nome]),
);

/**
 * Identifica o depósito ou área a partir da posição de estoque (ex.: "101.A10", "104.B02", "102.ANEXO", etc).
 */
export function identificarDeposito(local?: string | null): DepositoNomenclatura | null {
  if (!local) return null;
  const texto = String(local).trim().toUpperCase();
  if (!texto) return null;

  // Áreas específicas com nome na planta
  if (texto.includes('102.ANEXO') || texto.includes('APOIO MANUTEN') || (texto.includes('MANUTEN') && !texto.includes('104'))) {
    return { id: 'apoio_manutencao', nome: 'MATERIAL APOIO MANUTENÇÃO' };
  }
  if (texto.includes('ANEXO')) {
    return { id: 'anexo_0004', nome: 'ANEXO 0004' };
  }
  if (texto.includes('APOIO PRODU') || texto.includes('MATERIAL APOIO PROD')) {
    return { id: 'apoio_producao', nome: 'MATERIAL APOIO PRODUÇÃO' };
  }
  if (texto.includes('KITS') || texto.includes('MONTAGEM')) {
    return { id: 'montagem_kits', nome: 'ÁREA DE MONTAGEM DE KITS' };
  }
  if (texto.includes('SEGREGAD') || texto.includes('EXPEDIC')) {
    return { id: 'segregados', nome: 'ÁREA DE SEGREGADOS E EXPEDIÇÃO' };
  }
  if (texto.includes('BALCAO')) {
    return { id: 'balcao', nome: 'BALCÃO DE ATENDIMENTO' };
  }
  if (texto.includes('PORTICO')) {
    return { id: 'portico', nome: 'ESTACIONAMENTO PÓRTICO' };
  }
  if (texto.includes('EMPILHADEIRA')) {
    return { id: 'empilhadeiras', nome: 'ESTACIONAMENTO EMPILHADEIRAS' };
  }
  if (texto.includes('DESCOMPRESS')) {
    return { id: 'descompressao', nome: 'ÁREA DESCOMPRESSÃO' };
  }

  // Recebimento e Compra Direta por nome ou código
  if (texto.includes('RECEB') || texto.startsWith('1000') || texto.startsWith('1100')) {
    return { id: '1000', nome: 'RECEBIMENTO DEPÓSITO 1000' };
  }
  if (texto.includes('COMPRA DIRETA') || texto.startsWith('0050') || texto.startsWith('050')) {
    return { id: '0050', nome: 'COMPRA DIRETA 0050' };
  }

  // Prefixo antes do primeiro ponto ou separador
  const prefixo = texto.split(/[.\-\s/]/)[0].trim();

  // Padrão SAP ZL0024: prefixo 1DD (101 -> 0001, 102 -> 0002, 103 -> 0003, 104 -> 0004, 105 -> 0005)
  const m1 = /^10([1-5])$/.exec(prefixo);
  if (m1) {
    const cod = `000${m1[1]}`;
    return { id: cod, nome: `DEPÓSITO ${cod}` };
  }

  // Prefixo já em 0001..0005 ou 01..05 ou 1..5
  const m2 = /^0*([1-5])$/.exec(prefixo);
  if (m2) {
    const cod = `000${m2[1]}`;
    return { id: cod, nome: `DEPÓSITO ${cod}` };
  }

  if (prefixo === '1000') {
    return { id: '1000', nome: 'RECEBIMENTO DEPÓSITO 1000' };
  }

  if (prefixo === '0050' || prefixo === '050' || prefixo === '50') {
    return { id: '0050', nome: 'COMPRA DIRETA 0050' };
  }

  if (MAPA_NOMES.has(prefixo)) {
    return { id: prefixo, nome: MAPA_NOMES.get(prefixo)! };
  }

  return { id: prefixo, nome: `DEPÓSITO ${prefixo}` };
}

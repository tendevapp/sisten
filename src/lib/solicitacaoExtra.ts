/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado › Solicitação Extraordinária de Materiais Estruturais
 * (FRM.ALM-0013) — regras puras do formulário.
 *
 * Saída de material sem saldo na ZL0024 porque a NF ainda não foi lançada:
 * o material sai agora e a baixa é regularizada no SAP depois (status
 * PENDENTE → REGULARIZADA com o doc SAP).
 */

export const PREFIXO_SOL_EXTRA = 'SEM';
export const CODIGO_FRM_SOL_EXTRA = 'FRM.ALM-0013';

export type MotivoSolExtra =
  | 'REPARO_PINTURA' | 'PERDA_PREPARACAO' | 'PERDA_ACIDENTAL' | 'PERDA_QUEBRA_EQUIPAMENTO'
  | 'PERDA_RUGOSIDADE' | 'MIST_COAT' | 'QUANTIDADE_INSUFICIENTE' | 'REPINTURA_RETRABALHO'
  | 'LIMPEZA' | 'OUTROS';

export type StatusSolExtra = 'PENDENTE' | 'REGULARIZADA';

export type TurnoSolExtra = '1' | '2' | '3';

/** Os motivos na ordem da folha, com o complemento que cada um pede. */
export const MOTIVOS_SOL_EXTRA: { valor: MotivoSolExtra; rotulo: string; complemento?: string }[] = [
  { valor: 'REPARO_PINTURA', rotulo: 'Reparo de pintura' },
  { valor: 'PERDA_PREPARACAO', rotulo: 'Perda na preparação', complemento: 'mistura A+B, diluição etc.' },
  { valor: 'PERDA_ACIDENTAL', rotulo: 'Perda acidental', complemento: 'derramamento' },
  { valor: 'PERDA_QUEBRA_EQUIPAMENTO', rotulo: 'Perda por quebra de equipamento', complemento: 'bomba de pintura, rompimento de mangueira etc.' },
  { valor: 'PERDA_RUGOSIDADE', rotulo: 'Perda pelo perfil de rugosidade do substrato' },
  { valor: 'MIST_COAT', rotulo: 'Para uso no mist coat' },
  { valor: 'QUANTIDADE_INSUFICIENTE', rotulo: 'Quantidade insuficiente para o processo' },
  { valor: 'REPINTURA_RETRABALHO', rotulo: 'Repintura / retrabalho' },
  { valor: 'LIMPEZA', rotulo: 'Limpeza' },
  { valor: 'OUTROS', rotulo: 'Outros motivos' },
];

export const STATUS_SOL_EXTRA_ROTULO: Record<StatusSolExtra, string> = {
  PENDENTE: 'Aguardando regularização',
  REGULARIZADA: 'Regularizada no SAP',
};

export function rotuloMotivo(motivo: MotivoSolExtra): string {
  return MOTIVOS_SOL_EXTRA.find(m => m.valor === motivo)?.rotulo ?? motivo;
}

export interface ItemSolExtra {
  material: string;
  descricao: string;
  unidade: string;
  quantidade: number;
}

export interface DadosSolExtra {
  data: string;
  hora: string | null;
  turno: TurnoSolExtra | null;
  projeto: string | null;
  tramo: string | null;
  itens: ItemSolExtra[];
  motivo: MotivoSolExtra | null;
  motivo_detalhe: string | null;
  area_reparada_m2: number | null;
  rugosidade_um: number | null;
  observacao: string | null;
}

/** Número digitado com vírgula ou ponto; vazio vira null, inválido vira NaN. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  return Number(t.replace(/\./g, '').replace(',', '.'));
}

/**
 * O que falta para gravar — lista vazia quando está tudo certo. O papel não
 * obriga nada além de item e motivo; o resto acompanha o que a folha pede em
 * cada motivo (motivo e área no reparo, µm na rugosidade, o "especificar" de
 * Outros).
 */
export function validarSolExtra(d: DadosSolExtra): string[] {
  const erros: string[] = [];
  if (!d.data) erros.push('Informe a data.');
  if (d.itens.length === 0) erros.push('Inclua pelo menos um material.');
  d.itens.forEach((it, i) => {
    if (!it.material.trim()) erros.push(`Item ${i + 1}: informe o código SAP.`);
    if (!(it.quantidade > 0)) erros.push(`Item ${i + 1}: quantidade deve ser maior que zero.`);
  });
  const repetidos = d.itens.map(it => it.material.trim()).filter((m, i, l) => m && l.indexOf(m) !== i);
  if (repetidos.length) erros.push(`Material repetido: ${[...new Set(repetidos)].join(', ')} — some as quantidades numa linha só.`);
  if (!d.motivo) erros.push('Marque o motivo.');
  if (d.motivo === 'REPARO_PINTURA' && !d.motivo_detalhe?.trim()) erros.push('Reparo de pintura: descreva o motivo do reparo.');
  if (d.motivo === 'OUTROS' && !d.motivo_detalhe?.trim()) erros.push('Outros motivos: especifique o motivo.');
  if (d.area_reparada_m2 !== null && !(d.area_reparada_m2 > 0)) erros.push('Área reparada inválida.');
  if (d.rugosidade_um !== null && !(d.rugosidade_um > 0)) erros.push('Rugosidade (µm) inválida.');
  return erros;
}

/**
 * Limpa os campos que não valem para o motivo marcado — trocar de "Reparo"
 * para "Limpeza" não deixa a área reparada esquecida no registro.
 */
export function normalizarPorMotivo(d: DadosSolExtra): DadosSolExtra {
  const usaDetalhe = d.motivo === 'REPARO_PINTURA' || d.motivo === 'OUTROS';
  return {
    ...d,
    motivo_detalhe: usaDetalhe ? d.motivo_detalhe?.trim() || null : null,
    area_reparada_m2: d.motivo === 'REPARO_PINTURA' ? d.area_reparada_m2 : null,
    rugosidade_um: d.motivo === 'PERDA_RUGOSIDADE' ? d.rugosidade_um : null,
  };
}

/** Texto do motivo com o complemento preenchido, para lista e PDF. */
export function descreverMotivo(r: Pick<DadosSolExtra, 'motivo' | 'motivo_detalhe' | 'area_reparada_m2' | 'rugosidade_um'>): string {
  if (!r.motivo) return '';
  const partes = [rotuloMotivo(r.motivo)];
  if (r.motivo_detalhe) partes.push(r.motivo_detalhe);
  if (r.area_reparada_m2 != null) partes.push(`${String(r.area_reparada_m2).replace('.', ',')} m²`);
  if (r.rugosidade_um != null) partes.push(`${String(r.rugosidade_um).replace('.', ',')} µm`);
  return partes.join(' — ');
}

/** Turno pela hora (06–14 = 1º, 14–22 = 2º, 22–06 = 3º), para pré-marcar o campo. */
export function turnoDaHora(hora: string): TurnoSolExtra | null {
  const h = Number(hora.slice(0, 2));
  if (!Number.isFinite(h) || !/^\d{2}:\d{2}/.test(hora)) return null;
  if (h >= 6 && h < 14) return '1';
  if (h >= 14 && h < 22) return '2';
  return '3';
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado › Solicitação Extraordinária de Materiais Estruturais
 * (FRM.ALM-0013) — regras puras do formulário.
 *
 * Saída de material sem saldo na ZL0024 porque a NF ainda não foi lançada:
 * o material sai agora e a baixa é regularizada depois (status
 * PENDENTE → REGULARIZADA).
 *
 * Dois tipos:
 *  - PROJETO (SEM-DDMMYY-NN): a folha de sempre — projeto, tramo, motivo;
 *    regulariza com o doc SAP.
 *  - SEM_SALDO (RSS-DDMMYY-NN): retirada por colaborador de qualquer setor —
 *    quem retira, itens, data/hora, setor solicitante. O gestor do setor
 *    aprova em Aprovações; o almoxarifado dá baixa em Pendências gerando a
 *    Requisição no Balcão quando o item ganha saldo.
 */

export const PREFIXO_SOL_EXTRA = 'SEM';
export const PREFIXO_SOL_EXTRA_SEM_SALDO = 'RSS';
export const CODIGO_FRM_SOL_EXTRA = 'FRM.ALM-0013';

export type TipoSolExtra = 'PROJETO' | 'SEM_SALDO';

export const TIPO_SOL_EXTRA_ROTULO: Record<TipoSolExtra, string> = {
  PROJETO: 'Projeto',
  SEM_SALDO: 'Sem saldo',
};

export type AprovacaoSolExtra = 'PENDENTE' | 'APROVADA' | 'REPROVADA';

export const APROVACAO_SOL_EXTRA_ROTULO: Record<AprovacaoSolExtra, string> = {
  PENDENTE: 'Aguardando aprovação',
  APROVADA: 'Aprovada pelo gestor',
  REPROVADA: 'Reprovada pelo gestor',
};

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

/** Situação da baixa no vocabulário de cada tipo (a Sem Saldo baixa no balcão). */
export function rotuloStatusSolExtra(status: StatusSolExtra, tipo: TipoSolExtra = 'PROJETO'): string {
  if (tipo === 'SEM_SALDO') return status === 'PENDENTE' ? 'Aguardando baixa' : 'Baixada no balcão';
  return STATUS_SOL_EXTRA_ROTULO[status];
}

export function rotuloMotivo(motivo: MotivoSolExtra): string {
  return MOTIVOS_SOL_EXTRA.find(m => m.valor === motivo)?.rotulo ?? motivo;
}

/** Foto dos itens no bucket `alm-recebimento` (pasta `solicitacao-extra/<id>/`). */
export interface FotoSolExtra {
  path: string;
  nome: string;
  tipo: string;
}

/** Limite de fotos por solicitação (o banco aceita até 12). */
export const MAX_FOTOS_SOL_EXTRA = 8;

export interface ItemSolExtra {
  material: string;
  descricao: string;
  unidade: string;
  quantidade: number;
}

export interface DadosSolExtra {
  tipo: TipoSolExtra;
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
  /** Sem Saldo: quem retira — do cadastro do RH (`retirante_id`) ou digitado. */
  retirante_id: string | null;
  retirante_nome: string | null;
  retirante_matricula: string | null;
  setor_solicitante_id: string | null;
  setor_solicitante_nome: string | null;
  fotos: FotoSolExtra[];
  /** Sem Saldo: assinatura desenhada por quem retira (data URL PNG). */
  assinatura_retirante: string | null;
  assinatura_retirante_em: string | null;
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
  if (d.tipo === 'SEM_SALDO') {
    if (!d.retirante_nome?.trim()) erros.push('Informe quem está retirando (matrícula ou nome).');
    if (!d.setor_solicitante_id) erros.push('Escolha o setor solicitante.');
    if (!d.hora) erros.push('Informe a hora da retirada.');
  }
  if (d.itens.length === 0) erros.push('Inclua pelo menos um material.');
  d.itens.forEach((it, i) => {
    if (!it.material.trim()) erros.push(`Item ${i + 1}: informe o código SAP.`);
    if (!(it.quantidade > 0)) erros.push(`Item ${i + 1}: quantidade deve ser maior que zero.`);
  });
  const repetidos = d.itens.map(it => it.material.trim()).filter((m, i, l) => m && l.indexOf(m) !== i);
  if (repetidos.length) erros.push(`Material repetido: ${[...new Set(repetidos)].join(', ')} — some as quantidades numa linha só.`);
  if (d.tipo === 'PROJETO' && !d.motivo) erros.push('Marque o motivo.');
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
  if (d.tipo === 'SEM_SALDO') {
    return {
      ...d, turno: null, projeto: null, tramo: null,
      motivo: null, motivo_detalhe: null, area_reparada_m2: null, rugosidade_um: null,
    };
  }
  const usaDetalhe = d.motivo === 'REPARO_PINTURA' || d.motivo === 'OUTROS';
  return {
    ...d,
    motivo_detalhe: usaDetalhe ? d.motivo_detalhe?.trim() || null : null,
    area_reparada_m2: d.motivo === 'REPARO_PINTURA' ? d.area_reparada_m2 : null,
    rugosidade_um: d.motivo === 'PERDA_RUGOSIDADE' ? d.rugosidade_um : null,
    retirante_id: null,
    retirante_nome: null,
    retirante_matricula: null,
    setor_solicitante_id: null,
    setor_solicitante_nome: null,
    assinatura_retirante: null,
    assinatura_retirante_em: null,
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

/**
 * Quem aprova a retirada sem saldo: o admin e os aprovadores do setor
 * solicitante (`aprovador_setores`, a mesma lista das compras do setor). A
 * RPC `alm_sol_extra_aprovar` confere de novo no banco.
 */
export function podeAprovarRetirada(
  r: { tipo: TipoSolExtra; setor_solicitante_id: string | null },
  user: { roles: string[]; aprovador_setores?: string[] },
): boolean {
  if (r.tipo !== 'SEM_SALDO') return false;
  if (user.roles.includes('admin')) return true;
  return !!r.setor_solicitante_id && !!user.aprovador_setores?.includes(r.setor_solicitante_id);
}

export type SituacaoFiscalPedido =
  | 'SEM_DADO_FISCAL'
  | 'FISCAL_SEM_MIRO'
  | 'PENDENTE_FBL1N'
  | 'PAGO_FISCAL_SEM_PAGAMENTO_MIRO'
  | 'DIVERGENCIA_MIRO_X_FISCAL'
  | 'ALINHADO_COM_MIRO';

export interface EntradaConciliacaoFiscal {
  temMiro: boolean;
  valorPagoMiro: number | null | undefined;
  valorPagoFiscal: number | null | undefined;
  qtdNfsFiscais: number | null | undefined;
  statusMiro?: string | null;
}

const EPSILON = 0.01;

export function classificarConciliacaoFiscal(entrada: EntradaConciliacaoFiscal): SituacaoFiscalPedido {
  const qtdNfs = Number(entrada.qtdNfsFiscais || 0);
  const pagoFiscal = Number(entrada.valorPagoFiscal || 0);
  const pagoMiro = Number(entrada.valorPagoMiro || 0);

  if (qtdNfs <= 0) return 'SEM_DADO_FISCAL';
  if (!entrada.temMiro) return 'FISCAL_SEM_MIRO';
  if (pagoFiscal <= EPSILON) return 'PENDENTE_FBL1N';
  if (entrada.statusMiro === 'EM ABERTO' && pagoMiro <= EPSILON) return 'DIVERGENCIA_MIRO_X_FISCAL';
  if (pagoMiro <= EPSILON) return 'PAGO_FISCAL_SEM_PAGAMENTO_MIRO';
  if (pagoFiscal > pagoMiro + EPSILON) return 'DIVERGENCIA_MIRO_X_FISCAL';
  return 'ALINHADO_COM_MIRO';
}

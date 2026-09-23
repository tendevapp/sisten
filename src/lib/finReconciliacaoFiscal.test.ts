import { describe, expect, it } from 'vitest';
import { classificarConciliacaoFiscal } from './finReconciliacaoFiscal';

describe('classificarConciliacaoFiscal', () => {
  it('sinaliza pagamento fiscal quando o MIRO ainda nao tem pagamento', () => {
    expect(classificarConciliacaoFiscal({
      temMiro: true,
      valorPagoMiro: 0,
      valorPagoFiscal: 1_000,
      qtdNfsFiscais: 1,
    })).toBe('PAGO_FISCAL_SEM_PAGAMENTO_MIRO');
  });

  it('mantem a divergencia visivel quando o MIRO esta em aberto e a NF fiscal foi paga', () => {
    expect(classificarConciliacaoFiscal({
      temMiro: true,
      valorPagoMiro: 0,
      valorPagoFiscal: 1_000,
      qtdNfsFiscais: 1,
      statusMiro: 'EM ABERTO',
    })).toBe('DIVERGENCIA_MIRO_X_FISCAL');
  });

  it('identifica PO fiscal que ainda nao chegou no MIRO', () => {
    expect(classificarConciliacaoFiscal({
      temMiro: false,
      valorPagoMiro: 0,
      valorPagoFiscal: 500,
      qtdNfsFiscais: 1,
    })).toBe('FISCAL_SEM_MIRO');
  });
});

import { describe, expect, it } from 'vitest';
import { DEPOSITOS_PLANTA, identificarDeposito } from './depositoNomenclatura';

describe('depositoNomenclatura', () => {
  it('converte prefixo SAP 1DD para nomenclaturas da imagem', () => {
    expect(identificarDeposito('101.A10')?.nome).toBe('DEPÓSITO 0001');
    expect(identificarDeposito('102.040100')?.nome).toBe('DEPÓSITO 0002');
    expect(identificarDeposito('103.B02')?.nome).toBe('DEPÓSITO 0003');
    expect(identificarDeposito('104.250301')?.nome).toBe('DEPÓSITO 0004');
    expect(identificarDeposito('105.C1')?.nome).toBe('DEPÓSITO 0005');
  });

  it('converte prefixos 0001..0005 e 1..5', () => {
    expect(identificarDeposito('0001.A1')?.nome).toBe('DEPÓSITO 0001');
    expect(identificarDeposito('0004')?.nome).toBe('DEPÓSITO 0004');
    expect(identificarDeposito('1.A1')?.nome).toBe('DEPÓSITO 0001');
  });

  it('converte Recebimento e Compra Direta', () => {
    expect(identificarDeposito('1000.01')?.nome).toBe('RECEBIMENTO DEPÓSITO 1000');
    expect(identificarDeposito('AREA RECEB')?.nome).toBe('RECEBIMENTO DEPÓSITO 1000');
    expect(identificarDeposito('0050.A')?.nome).toBe('COMPRA DIRETA 0050');
    expect(identificarDeposito('COMPRA DIRETA')?.nome).toBe('COMPRA DIRETA 0050');
  });

  it('identifica Anexo 0004 e Material Apoio Manutenção', () => {
    expect(identificarDeposito('104.ANEXO')?.nome).toBe('ANEXO 0004');
    expect(identificarDeposito('ANEXO 0004')?.nome).toBe('ANEXO 0004');
    expect(identificarDeposito('102.ANEXO')?.nome).toBe('MATERIAL APOIO MANUTENÇÃO');
    expect(identificarDeposito('APOIO MANUTENCAO')?.nome).toBe('MATERIAL APOIO MANUTENÇÃO');
  });

  it('identifica demais áreas mapeadas na planta', () => {
    expect(identificarDeposito('APOIO PRODUCAO')?.nome).toBe('MATERIAL APOIO PRODUÇÃO');
    expect(identificarDeposito('MONTAGEM DE KITS')?.nome).toBe('ÁREA DE MONTAGEM DE KITS');
    expect(identificarDeposito('SEGREGADOS')?.nome).toBe('ÁREA DE SEGREGADOS E EXPEDIÇÃO');
    expect(identificarDeposito('BALCAO')?.nome).toBe('BALCÃO DE ATENDIMENTO');
    expect(identificarDeposito('PORTICO')?.nome).toBe('ESTACIONAMENTO PÓRTICO');
    expect(identificarDeposito('EMPILHADEIRAS')?.nome).toBe('ESTACIONAMENTO EMPILHADEIRAS');
    expect(identificarDeposito('DESCOMPRESSAO')?.nome).toBe('ÁREA DESCOMPRESSÃO');
  });

  it('retorna null para valores vazios', () => {
    expect(identificarDeposito('')).toBeNull();
    expect(identificarDeposito(null)).toBeNull();
    expect(identificarDeposito(undefined)).toBeNull();
  });

  it('possui a lista de depósitos oficiais da planta', () => {
    expect(DEPOSITOS_PLANTA.length).toBe(16);
    expect(DEPOSITOS_PLANTA.map((d) => d.id)).toContain('0001');
    expect(DEPOSITOS_PLANTA.map((d) => d.id)).toContain('0005');
    expect(DEPOSITOS_PLANTA.map((d) => d.id)).toContain('1000');
    expect(DEPOSITOS_PLANTA.map((d) => d.id)).toContain('0050');
    expect(DEPOSITOS_PLANTA.map((d) => d.id)).toContain('anexo_0004');
  });
});

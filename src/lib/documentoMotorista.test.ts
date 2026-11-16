import { describe, expect, it } from 'vitest';
import { documentoParaTeste, erroDocMotorista, formatarDocMotorista } from './documentoMotorista';

describe('documento do motorista', () => {
  it('máscara: CPF com pontos e traço; CNH só 11 dígitos', () => {
    expect(formatarDocMotorista('CPF', '52998224725')).toBe('529.982.247-25');
    expect(formatarDocMotorista('CNH', '0123.4567-890 99')).toBe('01234567890');
  });

  it('vazio é válido; CPF confere dígito; CNH exige 11 números', () => {
    expect(erroDocMotorista('CPF', '')).toBeNull();
    expect(erroDocMotorista('CPF', '529.982.247-25')).toBeNull();
    expect(erroDocMotorista('CPF', '529.982.247-24')).toMatch(/inválido/);
    expect(erroDocMotorista('CNH', '01234567890')).toBeNull();
    expect(erroDocMotorista('CNH', '1234')).toMatch(/11 números/);
  });

  it('teste de alcoolemia recebe o tipo na frente do número', () => {
    expect(documentoParaTeste('CNH', '01234567890')).toBe('CNH 01234567890');
    expect(documentoParaTeste('CPF', '529.982.247-25')).toBe('CPF 529.982.247-25');
    expect(documentoParaTeste('CPF', '  ')).toBeNull();
    expect(documentoParaTeste(null, null)).toBeNull();
  });
});

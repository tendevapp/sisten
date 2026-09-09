/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('../db/supabaseClient', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import {
  cnpjValido,
  consultarCnpj,
  cpfValido,
  formatarCnpj,
  formatarCpf,
  regimeSugerido,
} from './cnpjLookup';

describe('formatarCnpj', () => {
  it('aplica a máscara progressivamente', () => {
    expect(formatarCnpj('19')).toBe('19');
    expect(formatarCnpj('19131243')).toBe('19.131.243');
    expect(formatarCnpj('19131243000197')).toBe('19.131.243/0001-97');
  });

  it('ignora não-dígitos e limita a 14', () => {
    expect(formatarCnpj('19.131.243/0001-97xxxx')).toBe('19.131.243/0001-97');
  });
});

describe('cnpjValido', () => {
  it('aceita CNPJ com dígitos verificadores corretos', () => {
    expect(cnpjValido('19.131.243/0001-97')).toBe(true);
  });

  it('rejeita dígitos errados, tamanho errado e todos iguais', () => {
    expect(cnpjValido('19.131.243/0001-00')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('cpfValido', () => {
  it('valida dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
});

describe('formatarCpf', () => {
  it('aplica a máscara', () => {
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('regimeSugerido', () => {
  it('MEI tem prioridade sobre Simples', () => {
    expect(regimeSugerido(true, true)).toBe('MEI');
    expect(regimeSugerido(false, true)).toBe('Simples Nacional');
    expect(regimeSugerido(false, false)).toBe('Não informado');
  });
});

describe('consultarCnpj', () => {
  afterEach(() => {
    invoke.mockReset();
  });

  it('rejeita CNPJ inválido antes de chamar a função', async () => {
    await expect(consultarCnpj('123')).rejects.toThrow(/inválido/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('envia só os dígitos e devolve o payload normalizado da função', async () => {
    const info = {
      cnpj: '19.131.243/0001-97',
      razaoSocial: 'OPEN KNOWLEDGE BRASIL',
      regimeSugerido: 'MEI',
      fonte: 'BrasilAPI',
    };
    invoke.mockResolvedValue({ data: info, error: null });

    const resultado = await consultarCnpj('19.131.243/0001-97');
    expect(invoke).toHaveBeenCalledWith('consultar-cnpj', { body: { cnpj: '19131243000197' } });
    expect(resultado).toEqual(info);
  });

  it('propaga a mensagem de erro devolvida no corpo da função', async () => {
    invoke.mockResolvedValue({ data: { erro: { mensagem: 'CNPJ não encontrado na base da Receita Federal.' } }, error: null });
    await expect(consultarCnpj('19.131.243/0001-97')).rejects.toThrow(/não encontrado/i);
  });

  it('lê a mensagem do context quando o invoke retorna erro de transporte', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ erro: { mensagem: 'Serviços de consulta de CNPJ indisponíveis no momento.' } }) } },
    });
    await expect(consultarCnpj('19.131.243/0001-97')).rejects.toThrow(/indisponíveis/i);
  });
});

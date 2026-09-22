import { describe, expect, it } from 'vitest';
import {
  proximoCodigoFuncao,
  proximoCodigoEpiManual,
  mensagemErroEpiPorFuncao,
} from './ssmaEpiPorFuncaoApi';

describe('proximoCodigoFuncao', () => {
  it('gera FUN-001 para lista vazia', () => {
    expect(proximoCodigoFuncao([])).toBe('FUN-001');
  });

  it('calcula o próximo código sequencial incrementando o maior existente', () => {
    const funcoes = [
      { codigo_origem: 'FUN-001' },
      { codigo_origem: 'FUN-054' },
      { codigo_origem: 'FUN-012' },
    ];
    expect(proximoCodigoFuncao(funcoes)).toBe('FUN-055');
  });

  it('ignora códigos fora do padrão ao calcular', () => {
    const funcoes = [
      { codigo_origem: 'FUN-010' },
      { codigo_origem: 'CARGO-ADMIN' },
    ];
    expect(proximoCodigoFuncao(funcoes)).toBe('FUN-011');
  });
});

describe('proximoCodigoEpiManual', () => {
  it('gera EPI-001 para lista vazia', () => {
    expect(proximoCodigoEpiManual([])).toBe('EPI-001');
  });

  it('calcula o próximo código sequencial de EPI', () => {
    const requisitos = [
      { codigo_epi_origem: 'EPI-001' },
      { codigo_epi_origem: 'EPI-031' },
    ];
    expect(proximoCodigoEpiManual(requisitos)).toBe('EPI-032');
  });
});

describe('mensagemErroEpiPorFuncao', () => {
  it('informa sobre migração pendente quando tabela não existe', () => {
    expect(mensagemErroEpiPorFuncao({ status: 404 })).toContain('ainda não está disponível no banco');
    expect(mensagemErroEpiPorFuncao({ code: 'PGRST205' })).toContain('ainda não está disponível no banco');
  });

  it('extrai mensagem de erro comum', () => {
    expect(mensagemErroEpiPorFuncao(new Error('Erro de validação'))).toBe('Erro de validação');
  });
});

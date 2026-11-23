import { describe, it, expect } from 'vitest';
import type { ConfigEnvioEmail, Request } from '../types';
import { chaveGatilhoDaSolicitacao, ehResponsavelDoGatilho, ehResponsavelPelaSolicitacao } from './responsaveisSolicitacoes';

const cfg = (chave: string, destinatarios: string) => ({ chave, destinatarios } as ConfigEnvioEmail);
const configs = [
  cfg('cadastro_sap', 'Lourivan.Ferreira@ten.ind.br'),
  cfg('cadastro_sap_fornecedor', 'ana.leite@ten.ind.br'),
  cfg('compra_servico', 'lourivan.ferreira@ten.ind.br; outro@ten.ind.br'),
];

describe('responsaveisSolicitacoes', () => {
  it('liga cada solicitação ao seu gatilho', () => {
    expect(chaveGatilhoDaSolicitacao({ type: 'compra', tipo_compra: 'Serviço' })).toBe('compra_servico');
    expect(chaveGatilhoDaSolicitacao({ type: 'compra', tipo_compra: 'Estoque' })).toBeNull();
    expect(chaveGatilhoDaSolicitacao({ type: 'cadastro_sap', registration_type: 'Item' })).toBe('cadastro_sap');
    expect(chaveGatilhoDaSolicitacao({ type: 'cadastro_sap', registration_type: 'Fornecedor' })).toBe('cadastro_sap_fornecedor');
    expect(chaveGatilhoDaSolicitacao({ type: 'chamado' })).toBeNull();
  });

  it('compara e-mail sem diferenciar maiúsculas', () => {
    expect(ehResponsavelDoGatilho({ email: 'LOURIVAN.ferreira@ten.ind.br' }, configs[0])).toBe(true);
    expect(ehResponsavelDoGatilho({ email: '' }, configs[0])).toBe(false);
    expect(ehResponsavelDoGatilho({ email: 'x@ten.ind.br' }, null)).toBe(false);
  });

  it('responde pelo tipo da solicitação', () => {
    const lourivan = { email: 'lourivan.ferreira@ten.ind.br' };
    const servico = { type: 'compra', tipo_compra: 'Serviço' } as Request;
    const fornecedor = { type: 'cadastro_sap', registration_type: 'Fornecedor' } as Request;
    expect(ehResponsavelPelaSolicitacao(servico, lourivan, configs)).toBe(true);
    expect(ehResponsavelPelaSolicitacao(fornecedor, lourivan, configs)).toBe(false);
    expect(ehResponsavelPelaSolicitacao(servico, lourivan, [])).toBe(false);
  });
});

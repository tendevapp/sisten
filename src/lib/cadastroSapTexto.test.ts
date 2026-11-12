import { describe, expect, it } from 'vitest';
import { separarJustificativaCadastroSap } from './cadastroSapTexto';

describe('separarJustificativaCadastroSap', () => {
  it('item com especificações em várias linhas', () => {
    const specs = 'Faixa de medição: 0 a 1.500 µm\nResolução: 0,1 µm\n\nMedidor compatível: Série Elcometer 456T';
    const just = 'Medição de espessura\nde revestimento.';
    const r = separarJustificativaCadastroSap(`Nome: SONDA RETA\nT456CF1S. Specs: ${specs}. Justificativa: ${just}`);
    expect(r).toMatchObject({ tipo: 'item', nome: 'SONDA RETA\nT456CF1S', specs, justificativa: just });
  });

  it('item de uma linha', () => {
    const r = separarJustificativaCadastroSap('Nome: PARAFUSO M12. Specs: Aço carbono. Justificativa: Reposição');
    expect(r).toMatchObject({ tipo: 'item', nome: 'PARAFUSO M12', specs: 'Aço carbono', justificativa: 'Reposição' });
  });

  it('fornecedor com CNPJ (com pontos), regime e MEI', () => {
    const r = separarJustificativaCadastroSap(
      'Nome: JOÃO SILVA ME. CNPJ: 12.345.678/0001-90. Regime: MEI. CPF do titular: 123.456.789-00. Pendente: enviar por e-mail o documento do CPF e o comprovante de residência do titular. Justificativa: Serviço\nde pintura',
    );
    expect(r).toMatchObject({
      tipo: 'fornecedor', nome: 'JOÃO SILVA ME', cnpj: '12.345.678/0001-90', regime: 'MEI',
      cpfMei: '123.456.789-00', justificativa: 'Serviço\nde pintura',
    });
  });

  it('fornecedor sem CNPJ/regime (—)', () => {
    const r = separarJustificativaCadastroSap('Nome: ACME. CNPJ: —. Regime: —. Justificativa: Novo');
    expect(r).toMatchObject({ tipo: 'fornecedor', nome: 'ACME', cnpj: '', regime: '', justificativa: 'Novo' });
  });

  it('atualização de fornecedor', () => {
    const r = separarJustificativaCadastroSap(
      'Operação: Atualização de Cadastro. Cód. Fornecedor SAP: 20004567. NOVO Nome: FORNECEDOR TESTE. Justificativa: Mudança\nde razão social',
    );
    expect(r).toMatchObject({ tipo: 'atualizacao', codigoFornecedor: '20004567', nome: 'FORNECEDOR TESTE', justificativa: 'Mudança\nde razão social' });
  });

  it('texto fora do padrão vai inteiro para a justificativa', () => {
    expect(separarJustificativaCadastroSap('qualquer coisa')).toMatchObject({ tipo: 'livre', justificativa: 'qualquer coisa' });
  });
});

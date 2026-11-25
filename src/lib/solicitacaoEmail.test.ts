import { describe, it, expect } from 'vitest';
import type { Request, RequestItem } from '../types';
import { montarEmailConclusao, montarEmailSolicitacao } from './solicitacaoEmail';

const request = {
  id: 'r1', number: '5001028', type: 'compra', status: 'pendente', criticality: 5,
  solicitante_id: 'u', solicitante_name: 'BIANCA LIMA', solicitante_sector_id: '7',
  created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z',
  data_necessidade: '2026-10-16', tipo_compra: 'Serviço', justificativa: 'COLUNA PARADA.',
} as Request;

const item = (over: Partial<RequestItem> = {}): RequestItem => ({
  id: 'i1', request_id: 'r1', description: 'RECUPERAÇÃO DE IHM', has_no_sap_code: true,
  quantity: 2, unit: 'UN', estimated_value: 0, ...over,
});

const base = {
  request,
  itens: [item()],
  nomeSetor: (id?: string) => (id === '7' ? 'Manutenção' : id ?? '—'),
  totalAnexos: 0,
  origem: 'https://sisten.app',
};

describe('montarEmailSolicitacao', () => {
  it('monta assunto e corpo com o conteúdo da solicitação', () => {
    const { assunto, corpo } = montarEmailSolicitacao(base);
    expect(assunto).toBe('Compra #5001028 (Aguardando aprovação)');
    expect(corpo).toContain('Solicitante: BIANCA LIMA');
    expect(corpo).toContain('Setor: Manutenção');
    expect(corpo).toContain('Criticidade: 5 - Impeditiva');
    expect(corpo).toContain('Data de necessidade: 16/10/2026');
    expect(corpo).toContain('COLUNA PARADA.');
    expect(corpo).toContain('1. RECUPERAÇÃO DE IHM');
    expect(corpo).toContain('Anexos: nenhum');
    expect(corpo).toContain('https://sisten.app/#/solicitacoes?id=r1');
  });

  it('omite campos vazios e inclui o setor destinatário do item', () => {
    const { corpo } = montarEmailSolicitacao({
      ...base,
      itens: [item({ setor_destinatario: 'MANUTENÇÃO', sap_code: '1234' })],
    });
    expect(corpo).toContain('Setor destinatário: MANUTENÇÃO');
    expect(corpo).toContain('Código SAP: 1234');
    expect(corpo).not.toContain('Fornecedor sugerido');
    expect(corpo).not.toContain('RM vinculada');
  });

  it('informa a quantidade de anexos sem levá-los', () => {
    const { corpo } = montarEmailSolicitacao({ ...base, totalAnexos: 3 });
    expect(corpo).toContain('Anexos: 3');
  });
});

describe('montarEmailConclusao', () => {
  it('destaca a RM do serviço na primeira linha e no assunto, inclusive no reenvio', () => {
    const parametros = { request, itens: [item()], conclusao: '', atendente: 'Lourivan', origem: base.origem };
    const novo = montarEmailConclusao({ ...parametros, numeroRmServico: '00123456' });
    expect(novo.assunto).toContain('RM 00123456');
    expect(novo.corpo).toMatch(/^RM ABERTA NO SAP: 00123456\n\nOlá, Bianca!/);
    expect(novo.corpo).not.toContain('O que foi feito:');
    expect(montarEmailConclusao({ ...parametros, request: { ...request, linked_rm_number: '00123456' } })).toEqual(novo);
  });

  it('avisa o solicitante que o serviço terminou e repete o conteúdo', () => {
    const { assunto, corpo } = montarEmailConclusao({
      request, itens: [item()], conclusao: 'Prestador contratado, PO 4500012345.',
      atendente: 'LOURIVAN SILVA FERREIRA', origem: 'https://sisten.app',
    });
    expect(assunto).toBe('Solicitação de Serviço #5001028 — finalizada');
    expect(corpo).toMatch(/^Olá, Bianca!/);
    expect(corpo).toContain('foi finalizada');
    expect(corpo).toContain('Prestador contratado, PO 4500012345.');
    expect(corpo).toContain('Serviços da solicitação (1):');
    expect(corpo).toContain('1. RECUPERAÇÃO DE IHM — 2 UN');
    expect(corpo).toContain('COLUNA PARADA.');
    expect(corpo).toContain('https://sisten.app/#/solicitacoes?id=r1');
    expect(corpo.trimEnd().endsWith('LOURIVAN SILVA FERREIRA')).toBe(true);
  });

  it('no Cadastro SAP de fornecedor traz o código gerado', () => {
    const cadastro = { ...request, type: 'cadastro_sap', registration_type: 'Fornecedor', fornecedor_operacao: 'novo', tipo_compra: undefined } as Request;
    const { assunto, corpo } = montarEmailConclusao({
      request: cadastro, itens: [], conclusao: 'Cadastrado.', codigoSap: ' 20004567 ',
      atendente: 'Ana', origem: 'https://sisten.app',
    });
    expect(assunto).toBe('Cadastro SAP — Fornecedor #5001028 — finalizada');
    expect(corpo).toContain('Operação: Novo cadastro');
    expect(corpo).toContain('Código do fornecedor no SAP: 20004567');
    expect(corpo).not.toContain('da solicitação (');
  });
});

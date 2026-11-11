import { describe, expect, it } from 'vitest';
import {
  CATEGORIAS_TI,
  CATEGORIA_TI_CONTA_EMAIL,
  CATEGORIA_TI_PASTA_REDE,
  CATEGORIA_TI_SOFTWARE,
  camposTiPendentes,
  descricaoObrigatoriaTi,
  formatarCpf,
  montarEmailChamadoTi,
  montarJustificativaTi,
  placeholderDescricaoTi,
  separarJustificativaTi,
} from './chamadoTi';

describe('chamadoTi', () => {
  it('lista as categorias novas da TI', () => {
    expect(CATEGORIAS_TI).toEqual(expect.arrayContaining([
      'Lista de Distribuição', 'Impressora', 'Hardware (Teclado, Mouse, Base para Notebook)',
      CATEGORIA_TI_PASTA_REDE, CATEGORIA_TI_CONTA_EMAIL,
    ]));
  });

  it('formata CPF enquanto digita', () => {
    expect(formatarCpf('123')).toBe('123');
    expect(formatarCpf('1234567')).toBe('123.456.7');
    expect(formatarCpf('12345678901')).toBe('123.456.789-01');
    expect(formatarCpf('123.456.789-0199')).toBe('123.456.789-01');
  });

  it('cobra os campos obrigatórios de Conta e E-mail', () => {
    expect(camposTiPendentes(CATEGORIA_TI_CONTA_EMAIL, {})).toEqual([
      'Nome completo', 'CPF', 'Matrícula', 'Função', 'Data de admissão',
    ]);
    expect(camposTiPendentes(CATEGORIA_TI_CONTA_EMAIL, {
      nome_completo: 'Ana', cpf: '123.456.789-0', matricula: '1', funcao: 'X', data_admissao: '2026-11-01',
    })).toEqual(['CPF']);
  });

  it('cobra nome, tipo de acesso e caminho da pasta de rede', () => {
    expect(camposTiPendentes(CATEGORIA_TI_PASTA_REDE, { nome: 'Ana', tipo_acesso: 'Total', caminho: '' }))
      .toEqual(['Tipo de acesso', 'Caminho da pasta de rede']);
    expect(camposTiPendentes(CATEGORIA_TI_PASTA_REDE, { nome: 'Ana', tipo_acesso: 'Read', caminho: 'Grupos\\qualidade' }))
      .toEqual([]);
  });

  it('categoria sem campos fixos não cobra nada e exige descrição', () => {
    expect(camposTiPendentes('Impressora', {})).toEqual([]);
    expect(descricaoObrigatoriaTi('Impressora')).toBe(true);
    expect(descricaoObrigatoriaTi(CATEGORIA_TI_PASTA_REDE)).toBe(false);
  });

  it('Software pede qual software e a finalidade', () => {
    expect(placeholderDescricaoTi(CATEGORIA_TI_SOFTWARE)).toMatch(/qual software.*para que/);
    expect(placeholderDescricaoTi('Rede')).toMatch(/erro/);
  });

  it('monta e separa a justificativa com os dados da conta', () => {
    const dados = {
      nome_completo: 'Ana Souza', cpf: '12345678901', matricula: '4321', funcao: 'Analista', data_admissao: '2026-09-01',
    };
    const texto = montarJustificativaTi(CATEGORIA_TI_CONTA_EMAIL, dados, 'Precisa da lista Qualidade');
    expect(texto).toContain('CPF: 123.456.789-01');
    expect(texto).toContain('Data de admissão: 01/09/2026');
    const volta = separarJustificativaTi(CATEGORIA_TI_CONTA_EMAIL, texto);
    expect(volta.dados).toEqual({ ...dados, cpf: '123.456.789-01' });
    expect(volta.descricao).toBe('Precisa da lista Qualidade');
  });

  it('pasta de rede sem observação grava traço e volta vazia', () => {
    const texto = montarJustificativaTi(CATEGORIA_TI_PASTA_REDE, { nome: 'Ana', tipo_acesso: 'Full', caminho: 'Grupos\\qualidade' }, '  ');
    expect(texto).toContain('Caminho da pasta de rede: Grupos\\qualidade');
    expect(separarJustificativaTi(CATEGORIA_TI_PASTA_REDE, texto)).toEqual({
      dados: { nome: 'Ana', tipo_acesso: 'Full', caminho: 'Grupos\\qualidade' },
      descricao: '',
    });
  });

  it('categoria comum e texto antigo passam direto', () => {
    expect(montarJustificativaTi('Rede', { nome: 'x' }, ' sem rede ')).toBe('sem rede');
    expect(separarJustificativaTi(CATEGORIA_TI_CONTA_EMAIL, 'texto antigo')).toEqual({ dados: {}, descricao: 'texto antigo' });
  });

  it('e-mail leva número, categoria e link', () => {
    const { assunto, corpo } = montarEmailChamadoTi({
      numero: '1234', categoria: 'Impressora', solicitante: 'Moab', cargo: 'TI', setorSolicitante: 'Qualidade',
      criticidade: 3, justificativa: 'Não imprime', totalAnexos: 0, link: 'https://x/#/solicitacoes?id=1',
    });
    expect(assunto).toBe('Chamado TI #1234 — Impressora');
    expect(corpo).toContain('Criticidade: Grau 3');
    expect(corpo).toContain('Não imprime');
    expect(corpo).toContain('https://x/#/solicitacoes?id=1');
  });
});

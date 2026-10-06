import { describe, expect, it } from 'vitest';
import {
  proximoCodigoFuncao,
  proximoCodigoEpiManual,
  mensagemErroEpiPorFuncao,
  identificarDuplicadoEpi,
  prepararRequisitosParaCopia,
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

describe('identificarDuplicadoEpi', () => {
  it('identifica duplicado pelo mesmo epi_book_id', () => {
    const itemOrigem = { epi_book_id: 'book-1', descricao_epi_origem: 'Óculos Claro' };
    const itensDestino = [{ epi_book_id: 'book-1', descricao_epi_origem: 'Outra descrição' }];
    expect(identificarDuplicadoEpi(itemOrigem, itensDestino)).toBe(true);
  });

  it('identifica duplicado pela mesma descrição (ignorando maiúsculas e espaços)', () => {
    const itemOrigem = { epi_book_id: null, descricao_epi_origem: '  Luva de Vaqueta  ' };
    const itensDestino = [{ epi_book_id: null, descricao_epi_origem: 'LUVA DE VAQUETA' }];
    expect(identificarDuplicadoEpi(itemOrigem, itensDestino)).toBe(true);
  });

  it('retorna false quando não há correspondência de book nem descrição', () => {
    const itemOrigem = { epi_book_id: 'book-1', descricao_epi_origem: 'Capacete' };
    const itensDestino = [{ epi_book_id: 'book-2', descricao_epi_origem: 'Bota' }];
    expect(identificarDuplicadoEpi(itemOrigem, itensDestino)).toBe(false);
  });
});

describe('prepararRequisitosParaCopia', () => {
  const itensOrigem = [
    {
      id: 'req-1',
      funcao_id: 'func-origem',
      epi_book_id: 'book-1',
      codigo_vinculo_origem: 'VINC-01',
      codigo_epi_origem: 'EPI-001',
      descricao_epi_origem: 'Óculos de Proteção',
      ca_origem: '12345',
      classificacao: 'BASICO_OBRIGATORIO' as const,
      condicao_uso: 'Uso diário',
      ativo: true,
    },
    {
      id: 'req-2',
      funcao_id: 'func-origem',
      epi_book_id: 'book-2',
      codigo_vinculo_origem: 'VINC-02',
      codigo_epi_origem: 'EPI-002',
      descricao_epi_origem: 'Protetor Auricular',
      ca_origem: '67890',
      classificacao: 'ESPECIFICO_OBRIGATORIO' as const,
      condicao_uso: 'Área ruidosa',
      ativo: true,
    },
  ];

  it('copia itens ignorando duplicados existentes no destino e resolvendo colisões de código', () => {
    const itensDestino = [
      {
        id: 'req-existente',
        funcao_id: 'func-dest',
        epi_book_id: 'book-1', // mesmo do req-1 -> duplicado
        codigo_vinculo_origem: null,
        codigo_epi_origem: 'EPI-002', // código EPI-002 já tomado no destino
        descricao_epi_origem: 'Óculos de Proteção',
        ca_origem: '12345',
        classificacao: 'BASICO_OBRIGATORIO' as const,
        condicao_uso: null,
        ativo: true,
      },
    ];

    const resultado = prepararRequisitosParaCopia(itensOrigem, itensDestino, 'func-dest');

    expect(resultado.ignoradosDuplicados).toBe(1);
    expect(resultado.itensParaInserir).toHaveLength(1);

    const copiado = resultado.itensParaInserir[0];
    expect(copiado.funcao_id).toBe('func-dest');
    expect(copiado.epi_book_id).toBe('book-2');
    expect(copiado.codigo_vinculo_origem).toBeNull();
    // Como EPI-002 já estava em uso no destino, deve receber o próximo código sequencial livre (EPI-003)
    expect(copiado.codigo_epi_origem).toBe('EPI-003');
    expect(copiado.descricao_epi_origem).toBe('PROTETOR AURICULAR');
    expect(copiado.classificacao).toBe('ESPECIFICO_OBRIGATORIO');
    expect(copiado.condicao_uso).toBe('Área ruidosa');
  });

  it('respeita o filtro de requisitoIds específicos quando fornecido', () => {
    const resultado = prepararRequisitosParaCopia(itensOrigem, [], 'func-dest', {
      requisitoIds: ['req-2'],
    });

    expect(resultado.itensParaInserir).toHaveLength(1);
    expect(resultado.itensParaInserir[0].epi_book_id).toBe('book-2');
    expect(resultado.itensParaInserir[0].codigo_epi_origem).toBe('EPI-002');
  });
});

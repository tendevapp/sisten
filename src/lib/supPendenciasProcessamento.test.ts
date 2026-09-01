import { describe, it, expect } from 'vitest';
import {
  isSuprimentosSector,
  isChamadoPendenciaProcessamento,
  isChamadoAjustePedido,
  isChamadoSuprimentosPendencia,
  parsearValorBRL,
  parseColagemPlanilha,
  somarValores,
  gerarProtocoloSup,
  formatarDataDDMMAA,
  assuntoEmailPendencias,
  montarCorpoEmailPendencias,
  montarAssuntoEmailConclusao,
  montarCorpoEmailConclusao,
  assuntoEmailAjustePedido,
  montarCorpoEmailAjustePedido,
  camposExibicao,
  resumoColunas,
  resumoValores,
  rotuloNumero,
  rotuloModelo,
  CATEGORIA_PENDENCIA_PROCESSAMENTO,
  CATEGORIA_AJUSTE_PEDIDO,
} from './supPendenciasProcessamento';

/* Modelo `nfse` — bloco do enunciado: uma célula por linha, com linha em branco
   entre valores, precedido do cabeçalho com os 8 rótulos. */
const NFSE_UMA_CELULA_POR_LINHA = `

Número da NFS-e

NFS-e Cancelada

Data Emissão NFS-e

Fornecedor

Nome Fornecedor

OBSERVAÇÃO

Valor da NFS-e

Mês de Competência

128629

não

07/07/2026

1000770369

L AMORIM LOCACAO DE EQUIPAMENTOS LTDA

AGUARDANDO PEDIDO PARA LANÇAMENTO

19.000,00

07

10904

não

04/08/2026

1000047536

CARLOS ALFREDO DE MACEDO LIMA -ME

AGUARDANDO RETORNO REFERENTE A PENDÊNCIA QUESTIONADA / SOLICITADO RM PEDIDO

2.167,00

08
`;

const NFSE_TSV = [
  'Número da NFS-e\tNFS-e Cancelada\tData Emissão NFS-e\tFornecedor\tNome Fornecedor\tOBSERVAÇÃO\tValor da NFS-e\tMês de Competência',
  '128629\tnão\t07/07/2026\t1000770369\tL AMORIM LOCACAO DE EQUIPAMENTOS LTDA\tAGUARDANDO PEDIDO PARA LANÇAMENTO\t19.000,00\t07',
  '389\tnão\t11/08/2026\t1000065852\tM. SOARES DE SOUZA EIRELI\tENVIADO P/ ASSINATURA\t15.000,00\t08',
].join('\n');

/* Modelo `documento` — enunciado do segundo pedido: uma célula por linha, com
   duas células vazias ao fim de cada registro, precedido do cabeçalho de 11. */
const DOC_UMA_CELULA_POR_LINHA = `STATUS

Número de documento de nove posições

Data da Emissão

Séries

UF emissor

Chegou ?

Nome do Fornecedor

Documento de compras

OBSERVAÇÕES

COMPRADOR

DATA ENVIO

ERRO / AÇÃO NECESSARIA

000014252

27/07/2026

001

BA

SIM

Jacobina Material de Limpeza Eireli

4100455805

SOLICITADO CONVERSÃO PARA O ITEM PASTILHA CHAMADO 27071 / SUPORTE SAP

ITANA

11/08/2026

ERRO / AÇÃO NECESSARIA

000005682

28/07/2026

002

SP

SIM

ATLANTA INDUSTRIA E COM DE ACESSORIOS E EQUIPAMENTOS LT

4100439424

ICMS EM DESACORDO COM O PEDIDO. 2º ITEM DA NF PO LINHA 480 / SALDO INSUFICIENTE LINHA 420

ITANA

03/08/2026
`;

const DOC_TSV = [
  'STATUS\tNúmero de documento de nove posições\tData da Emissão\tSéries\tUF emissor\tChegou ?\tNome do Fornecedor\tDocumento de compras\tOBSERVAÇÕES\tCOMPRADOR\tDATA ENVIO',
  'ERRO / AÇÃO NECESSARIA\t000014252\t27/07/2026\t001\tBA\tSIM\tJacobina Material de Limpeza Eireli\t4100455805\tSOLICITADO CONVERSÃO\tITANA\t11/08/2026',
].join('\n');

describe('isSuprimentosSector', () => {
  it('reconhece o setor Suprimentos com e sem acento/caixa', () => {
    expect(isSuprimentosSector({ name: 'Suprimentos' })).toBe(true);
    expect(isSuprimentosSector({ name: 'SUPRIMENTOS' })).toBe(true);
    expect(isSuprimentosSector({ name: 'Setor de Suprimentos' })).toBe(true);
    expect(isSuprimentosSector({ name: 'TI' })).toBe(false);
    expect(isSuprimentosSector(null)).toBe(false);
  });
});

describe('isChamadoPendenciaProcessamento', () => {
  it('só vale para chamado com a categoria certa', () => {
    expect(isChamadoPendenciaProcessamento({ type: 'chamado', category_id: CATEGORIA_PENDENCIA_PROCESSAMENTO })).toBe(true);
    expect(isChamadoPendenciaProcessamento({ type: 'chamado', category_id: 'Software' })).toBe(false);
    expect(isChamadoPendenciaProcessamento({ type: 'compra', category_id: CATEGORIA_PENDENCIA_PROCESSAMENTO })).toBe(false);
  });
});

describe('parsearValorBRL', () => {
  it('converte valores no padrão pt-BR', () => {
    expect(parsearValorBRL('19.000,00')).toBe(19000);
    expect(parsearValorBRL('1.080,00')).toBe(1080);
    expect(parsearValorBRL('374,00')).toBe(374);
    expect(parsearValorBRL('119.950,00')).toBe(119950);
    expect(parsearValorBRL('11.893,20')).toBe(11893.2);
  });
  it('devolve null para vazio ou lixo', () => {
    expect(parsearValorBRL('')).toBeNull();
    expect(parsearValorBRL('  ')).toBeNull();
    expect(parsearValorBRL('-')).toBeNull();
  });
});

describe('parseColagemPlanilha — modelo nfse', () => {
  it('reconhece o formato uma-célula-por-linha e descarta o cabeçalho', () => {
    const { modelo, linhas, erros } = parseColagemPlanilha(NFSE_UMA_CELULA_POR_LINHA);
    expect(modelo).toBe('nfse');
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      modelo: 'nfse',
      numero_nfse: '128629',
      nfse_cancelada: 'não',
      data_emissao_nfse: '07/07/2026',
      fornecedor: '1000770369',
      nome_fornecedor: 'L AMORIM LOCACAO DE EQUIPAMENTOS LTDA',
      observacao: 'AGUARDANDO PEDIDO PARA LANÇAMENTO',
      valor_nfse: 19000,
      valor_nfse_raw: '19.000,00',
      mes_competencia: '07',
    });
    expect(linhas[1].numero_nfse).toBe('10904');
    expect(linhas[1].valor_nfse).toBe(2167);
  });

  it('reconhece o formato TSV uma-nota-por-linha', () => {
    const { modelo, linhas, erros } = parseColagemPlanilha(NFSE_TSV);
    expect(modelo).toBe('nfse');
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(2);
    expect(linhas[1].numero_nfse).toBe('389');
    expect(linhas[1].valor_nfse).toBe(15000);
  });
});

describe('parseColagemPlanilha — modelo documento', () => {
  it('reconhece o formato uma-célula-por-linha, ignora células vazias ao fim e descarta o cabeçalho', () => {
    const { modelo, linhas, erros } = parseColagemPlanilha(DOC_UMA_CELULA_POR_LINHA);
    expect(modelo).toBe('documento');
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      modelo: 'documento',
      documento_status: 'ERRO / AÇÃO NECESSARIA',
      numero_nfse: '000014252',
      data_emissao_nfse: '27/07/2026',
      serie: '001',
      uf_emissor: 'BA',
      chegou: 'SIM',
      nome_fornecedor: 'Jacobina Material de Limpeza Eireli',
      documento_compras: '4100455805',
      observacao: 'SOLICITADO CONVERSÃO PARA O ITEM PASTILHA CHAMADO 27071 / SUPORTE SAP',
      comprador: 'ITANA',
      data_envio: '11/08/2026',
    });
    expect(linhas[0].valor_nfse).toBeNull();
    expect(linhas[1].numero_nfse).toBe('000005682');
    expect(linhas[1].comprador).toBe('ITANA');
  });

  it('reconhece o formato TSV', () => {
    const { modelo, linhas } = parseColagemPlanilha(DOC_TSV);
    expect(modelo).toBe('documento');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].numero_nfse).toBe('000014252');
    expect(linhas[0].uf_emissor).toBe('BA');
  });

  it('sem cabeçalho, cai no modelo documento pela 1ª célula ser um status', () => {
    const semCab = DOC_TSV.split('\n').slice(1).join('\n');
    const { modelo, linhas } = parseColagemPlanilha(semCab);
    expect(modelo).toBe('documento');
    expect(linhas[0].numero_nfse).toBe('000014252');
  });
});

describe('parseColagemPlanilha — erros', () => {
  it('devolve erro quando não há nada reconhecível', () => {
    const { linhas, erros } = parseColagemPlanilha('qualquer coisa\noutra linha');
    expect(linhas).toHaveLength(0);
    expect(erros.length).toBeGreaterThan(0);
  });
  it('texto vazio não gera linha nem erro', () => {
    expect(parseColagemPlanilha('')).toEqual({ modelo: 'nfse', linhas: [], erros: [] });
  });
});

describe('somarValores', () => {
  it('soma os valores do modelo nfse e é 0 no modelo documento', () => {
    expect(somarValores(parseColagemPlanilha(NFSE_UMA_CELULA_POR_LINHA).linhas)).toBe(21167);
    expect(somarValores(parseColagemPlanilha(DOC_UMA_CELULA_POR_LINHA).linhas)).toBe(0);
  });
});

describe('camposExibicao / resumoColunas', () => {
  it('rotula os campos conforme o modelo', () => {
    const nf = parseColagemPlanilha(NFSE_TSV).linhas[0];
    const doc = parseColagemPlanilha(DOC_TSV).linhas[0];
    expect(camposExibicao(nf).map(c => c.label)).toContain('Valor da NFS-e');
    expect(camposExibicao(doc).map(c => c.label)).toContain('Documento de compras');
    expect(resumoColunas('documento')).toContain('Comprador');
    expect(resumoColunas('nfse')).toContain('Valor');
  });
});

describe('protocolo', () => {
  it('formata a data em DDMMAA', () => {
    expect(formatarDataDDMMAA('2026-09-07')).toBe('070926');
    expect(formatarDataDDMMAA('2026-08-13')).toBe('130826');
  });
  it('gera SUP-DDMMAA-NN com índice de dois dígitos', () => {
    expect(gerarProtocoloSup(1, '2026-09-07')).toBe('SUP-070926-01');
    expect(gerarProtocoloSup(2, '2026-09-07')).toBe('SUP-070926-02');
    expect(gerarProtocoloSup(12, '2026-09-07')).toBe('SUP-070926-12');
  });
});

describe('e-mail', () => {
  it('monta o assunto no padrão pedido', () => {
    expect(assuntoEmailPendencias('SUP-070926-01'))
      .toBe('[SUP-070926-01] - Pendências de Processamento de Notas Fiscais');
  });

  it('corpo do modelo nfse traz notas, total e link', () => {
    const { linhas } = parseColagemPlanilha(NFSE_UMA_CELULA_POR_LINHA);
    const corpo = montarCorpoEmailPendencias({
      protocolo: 'SUP-070926-01',
      solicitante: 'Fulano de Tal',
      numeroChamado: '2045',
      linkChamado: 'https://sisten/#/solicitacoes/minhas?id=r_abc',
      linhas,
    });
    expect(corpo).toContain('SUP-070926-01');
    expect(corpo).toContain('#2045');
    expect(corpo).toContain('Total de registros: 2');
    expect(corpo).toContain('21.167,00');
    expect(corpo).toContain('https://sisten/#/solicitacoes/minhas?id=r_abc');
    // Texto corrido em blocos, não tabela.
    expect(corpo).toContain('1. NFS-e 128629');
    expect(corpo).toContain('2. NFS-e 10904');
    expect(corpo).toMatch(/ {3}Observação\s{2,}AGUARDANDO PEDIDO PARA LANÇAMENTO/);
    expect(corpo).not.toContain(' | ');
  });

  it('corpo do modelo documento não traz valor total e usa o cabeçalho de lançamentos', () => {
    const { linhas } = parseColagemPlanilha(DOC_UMA_CELULA_POR_LINHA);
    const corpo = montarCorpoEmailPendencias({
      protocolo: 'SUP-070926-02',
      solicitante: 'Beltrano',
      numeroChamado: '2046',
      linhas,
    });
    expect(corpo).toContain('LANÇAMENTOS');
    expect(corpo).toContain('1. Documento 000014252');
    expect(corpo).toContain('2. Documento 000005682');
    expect(corpo).toMatch(/ {3}Comprador\s{2,}ITANA/);
    expect(corpo).toContain('Total de registros: 2');
    expect(corpo).not.toContain('Valor total');
    expect(corpo).not.toContain(' | ');
  });

  it('monta assunto e corpo de conclusão individual e em lote com resoluções', () => {
    const item1 = {
      linha: {
        modelo: 'nfse' as const,
        numero_nfse: '128629',
        nome_fornecedor: 'L AMORIM',
        valor_nfse: 19000,
        mes_competencia: '07',
      },
      protocolo: 'SUP-010926-01',
      numeroChamado: '3001',
      solicitanteNome: 'Carlos',
      resolucao: 'Nota lançada e pedido criado no SAP',
    };

    const item2 = {
      linha: {
        modelo: 'documento' as const,
        numero_nfse: '000014252',
        nome_fornecedor: 'FORNECEDOR XYZ',
        documento_compras: '4500012345',
        comprador: 'ITANA',
      },
      protocolo: 'SUP-010926-02',
      numeroChamado: '3002',
      solicitanteNome: 'Mariana',
      resolucao: 'Erro de lançamento corrigido',
    };

    // Assunto individual
    expect(montarAssuntoEmailConclusao([item1])).toBe('[SUP-010926-01] - Conclusão de Processamento: NFS-e 128629');

    // Assunto em lote
    expect(montarAssuntoEmailConclusao([item1, item2])).toBe('[SISTEN] Conclusão de Processamento - 2 notas/documentos (SUP-010926-01, SUP-010926-02)');

    // Corpo consolidado
    const corpoLote = montarCorpoEmailConclusao({
      itens: [item1, item2],
      usuarioAtendente: 'Victor Oliveira',
      origemUrl: 'https://sisten.ten.ind.br/#/suprimentos/pendencias-processamento',
    });

    expect(corpoLote).toContain('AVISO DE CONCLUSÃO DE PENDÊNCIAS DE PROCESSAMENTO');
    expect(corpoLote).toContain('Victor Oliveira');
    expect(corpoLote).toContain('1. [NFS-e 128629] - Protocolo: SUP-010926-01 (Chamado #3001)');
    expect(corpoLote).toContain('Nota lançada e pedido criado no SAP');
    expect(corpoLote).toContain('2. [Documento 000014252] - Protocolo: SUP-010926-02 (Chamado #3002)');
    expect(corpoLote).toContain('Erro de lançamento corrigido');
    expect(corpoLote).toContain('https://sisten.ten.ind.br/#/suprimentos/pendencias-processamento');
  });
});

describe('categoria Ajuste de Pedido', () => {
  it('isChamadoAjustePedido / isChamadoSuprimentosPendencia reconhecem a categoria', () => {
    expect(isChamadoAjustePedido({ type: 'chamado', category_id: CATEGORIA_AJUSTE_PEDIDO })).toBe(true);
    expect(isChamadoAjustePedido({ type: 'chamado', category_id: CATEGORIA_PENDENCIA_PROCESSAMENTO })).toBe(false);
    expect(isChamadoSuprimentosPendencia({ type: 'chamado', category_id: CATEGORIA_AJUSTE_PEDIDO })).toBe(true);
    expect(isChamadoSuprimentosPendencia({ type: 'chamado', category_id: CATEGORIA_PENDENCIA_PROCESSAMENTO })).toBe(true);
    expect(isChamadoSuprimentosPendencia({ type: 'chamado', category_id: 'Software' })).toBe(false);
  });

  it('rotuloNumero / rotuloModelo tratam o modelo ajuste_pedido', () => {
    expect(rotuloNumero('ajuste_pedido')).toBe('NF');
    expect(rotuloModelo('ajuste_pedido')).toBe('Ajuste de Pedido');
  });

  it('camposExibicao / resumoColunas / resumoValores rotulam demanda, NF, pedido, fornecedor e comprador', () => {
    const linha = {
      modelo: 'ajuste_pedido' as const,
      numero_nfse: '000014252',
      documento_compras: '4100455805',
      nome_fornecedor: 'Jacobina Material de Limpeza Eireli',
      comprador: 'ITANA',
      observacao: 'Trocar o item pastilha por similar homologado.',
    };
    const campos = camposExibicao(linha);
    expect(campos.map(c => c.label)).toEqual(['Número da NF', 'Número do Pedido', 'Fornecedor', 'Comprador', 'Demanda']);
    expect(campos.find(c => c.label === 'Comprador')?.value).toBe('ITANA');

    expect(resumoColunas('ajuste_pedido')).toEqual(['NF', 'Pedido', 'Fornecedor', 'Comprador', 'Demanda']);
    expect(resumoValores(linha)).toEqual([
      '000014252',
      '4100455805',
      'Jacobina Material de Limpeza Eireli',
      'ITANA',
      'Trocar o item pastilha por similar homologado.',
    ]);
  });

  it('comprador é opcional: sem valor, o campo fica vazio no e-mail e nos resumos', () => {
    const linha = { modelo: 'ajuste_pedido' as const, numero_nfse: '1', documento_compras: '2', nome_fornecedor: 'Y', observacao: 'z' };
    expect(camposExibicao(linha).find(c => c.label === 'Comprador')?.value).toBe('');
    expect(resumoValores(linha)[3]).toBe('');
    const corpo = montarCorpoEmailAjustePedido({
      protocolo: 'p', solicitante: 's', numeroChamado: '1',
      dados: { demanda: 'z', nf: '1', pedido: '2', fornecedor: 'Y' },
    });
    expect(corpo).toContain('Comprador .......: —');
  });

  it('assuntoEmailAjustePedido põe NF, Pedido e Fornecedor no título', () => {
    const assunto = assuntoEmailAjustePedido('SUP-010926-01', {
      demanda: 'x',
      nf: '000014252',
      pedido: '4100455805',
      fornecedor: 'Jacobina Material de Limpeza Eireli',
    });
    expect(assunto).toBe(
      '[SUP-010926-01] - Ajuste de Pedido - NF 000014252 · Pedido 4100455805 · Jacobina Material de Limpeza Eireli'
    );
  });

  it('montarCorpoEmailAjustePedido traz a demanda organizada e avisa das imagens anexadas', () => {
    const corpo = montarCorpoEmailAjustePedido({
      protocolo: 'SUP-010926-01',
      solicitante: 'Fulano de Tal',
      numeroChamado: '3010',
      dados: {
        demanda: 'Trocar o item pastilha por similar homologado.',
        nf: '000014252',
        pedido: '4100455805',
        fornecedor: 'Jacobina Material de Limpeza Eireli',
      },
      qtdImagens: 3,
      linkChamado: 'https://sisten/#/x',
    });
    expect(corpo).toContain('AJUSTE DE PEDIDO');
    expect(corpo).toContain('Protocolo: SUP-010926-01');
    expect(corpo).toContain('#3010');
    expect(corpo).toContain('Número da NF ....: 000014252');
    expect(corpo).toContain('Número do Pedido : 4100455805');
    expect(corpo).toContain('Fornecedor ......: Jacobina Material de Limpeza Eireli');
    expect(corpo).toContain('Trocar o item pastilha por similar homologado.');
    expect(corpo).toContain('3 imagens foram anexadas ao chamado no SISTEN');
    expect(corpo).toContain('https://sisten/#/x');
  });

  it('montarCorpoEmailAjustePedido: 1 imagem no singular, 0 imagem avisa ausência', () => {
    expect(
      montarCorpoEmailAjustePedido({
        protocolo: 'p', solicitante: 's', numeroChamado: '1',
        dados: { demanda: 'x', nf: '1', pedido: '2', fornecedor: 'Y' },
        qtdImagens: 1,
      })
    ).toContain('Uma imagem foi anexada ao chamado no SISTEN');

    const corpo = montarCorpoEmailAjustePedido({
      protocolo: 'SUP-010926-02',
      solicitante: 'Fulano',
      numeroChamado: '3011',
      dados: { demanda: 'x', nf: '1', pedido: '2', fornecedor: 'Y' },
      qtdImagens: 0,
    });
    expect(corpo).toContain('Sem imagem anexada.');
  });
});


import { describe, it, expect } from 'vitest';
import { montarAssuntoColeta, montarCorpoColeta, LinhaColeta } from './coletaEmail';

const linha = (over: Partial<LinhaColeta> = {}): LinhaColeta => ({
  dataColeta: '2026-09-10',
  fornecedor: 'ACME LTDA',
  rm: '10012345 / 10',
  po: '4500123456',
  codigoItem: '100234',
  material: 'PARAFUSO SEXTAVADO M12',
  quantidade: 10,
  unidade: 'UN',
  valor: 1234.5,
  ...over,
});

describe('montarAssuntoColeta', () => {
  it('inclui transportadora e contagem de itens', () => {
    expect(montarAssuntoColeta({ transportadora: 'RODOTEN', quantidadeItens: 3 }))
      .toBe('Coleta Jacobina — RODOTEN (3 itens)');
  });

  it('usa singular com um item e omite transportadora vazia', () => {
    expect(montarAssuntoColeta({ quantidadeItens: 1 })).toBe('Coleta Jacobina (1 item)');
  });

  it('respeita o assunto configurado no painel de e-mails', () => {
    expect(montarAssuntoColeta({ assuntoBase: 'Coleta Semanal', quantidadeItens: 2 }))
      .toBe('Coleta Semanal (2 itens)');
  });
});

describe('montarCorpoColeta', () => {
  it('monta o corpo com saudação, totais, cabeçalho e itens agrupados por PO', () => {
    const corpo = montarCorpoColeta({ linhas: [linha()], transportadora: 'RODOTEN', solicitante: 'André' });
    expect(corpo).toContain('Bom dia!');
    expect(corpo).toContain('Segue a lista de coleta para busca do material junto aos fornecedores.');
    expect(corpo).toContain('Itens: 1');
    expect(corpo).toMatch(/Valor total: R\$\s?1\.234,50/);
    expect(corpo).toContain('--------------------------------------------------------------------');
    expect(corpo).toContain('FORNECEDOR: ACME LTDA\n\n4500123456');
    expect(corpo).toMatch(/Código: 100234 \| Material: PARAFUSO SEXTAVADO M12 \| Qtd: 10 UN \| Valor: R\$\s?1\.234,50/);
    expect(corpo).toContain('--------------------------------------------------');
    expect(corpo).not.toContain('Data da coleta:');
    expect(corpo).not.toContain('RM:');
    expect(corpo).not.toContain('Transportadora:');
    expect(corpo).not.toContain('Solicitado por:');
  });

  it('agrupa por fornecedor em ordem alfabética', () => {
    const corpo = montarCorpoColeta({
      linhas: [linha({ fornecedor: 'ZETA' }), linha({ fornecedor: 'BETA' })],
    });
    expect(corpo.indexOf('FORNECEDOR: BETA')).toBeLessThan(corpo.indexOf('FORNECEDOR: ZETA'));
    expect(corpo).toContain('--------------------------------------------------');
  });

  it('ordena itens do fornecedor pela data de coleta, com sem-data no fim', () => {
    const corpo = montarCorpoColeta({
      linhas: [
        linha({ dataColeta: null, po: 'SEM-DATA' }),
        linha({ dataColeta: '2026-09-20', po: 'DEPOIS' }),
        linha({ dataColeta: '2026-09-01', po: 'ANTES' }),
      ],
    });
    expect(corpo.indexOf('ANTES')).toBeLessThan(corpo.indexOf('DEPOIS'));
    expect(corpo.indexOf('DEPOIS')).toBeLessThan(corpo.indexOf('SEM-DATA'));
  });

  it('não inventa dado: vazios saem como travessão', () => {
    const corpo = montarCorpoColeta({
      linhas: [linha({ dataColeta: null, rm: '', codigoItem: '', material: '', quantidade: null, valor: null })],
    });
    expect(corpo).toContain('Código: — | Material: — | Qtd: — | Valor: —');
  });

  it('soma o valor total dos itens', () => {
    const corpo = montarCorpoColeta({ linhas: [linha({ valor: 100 }), linha({ valor: 50.5 })] });
    expect(corpo).toMatch(/Valor total: R\$\s?150,50/);
    expect(corpo).toContain('Itens: 2');
  });

  it('agrupa múltiplos POs sob o mesmo fornecedor sem duplicar cabeçalho do fornecedor', () => {
    const linhas = [
      linha({ po: '4100468780', codigoItem: '1437256', material: 'CAMISA TERM UNI', quantidade: 5, valor: 224.5 }),
      linha({ po: '4100468780', codigoItem: '1437258', material: 'CAMISA TERM UNI GG', quantidade: 2, valor: 89.8 }),
      linha({ po: '4100468404', codigoItem: '1412303', material: 'CAPUZ OPER PA', quantidade: 16, valor: 206.4 }),
    ];
    const corpo = montarCorpoColeta({ linhas });
    expect(corpo).toContain('FORNECEDOR: ACME LTDA\n\n4100468780');
    expect(corpo).toContain('4100468404');
    // Verifica que 4100468780 aparece antes de 4100468404
    expect(corpo.indexOf('4100468780')).toBeLessThan(corpo.indexOf('4100468404'));
    // Só deve haver uma ocorrência de FORNECEDOR: ACME LTDA
    expect(corpo.split('FORNECEDOR: ACME LTDA').length - 1).toBe(1);
  });

  it('formata o corpo exatamente conforme o modelo de exemplo', () => {
    const linhasExemplo: LinhaColeta[] = [
      {
        dataColeta: '2026-09-17',
        fornecedor: '67.086.759 CLAUDIA MARGEANE FREITAS - FORTEC EPI',
        rm: '1001',
        po: '4100468780',
        codigoItem: '1437256',
        material: 'CAMISA TERM UNI 90PES/10EL% PT G',
        quantidade: 5,
        unidade: 'UN',
        valor: 224.5,
      },
      {
        dataColeta: '2026-09-17',
        fornecedor: '67.086.759 CLAUDIA MARGEANE FREITAS - FORTEC EPI',
        rm: '1002',
        po: '4100468780',
        codigoItem: '1437258',
        material: 'CAMISA TERM UNI 90PES/10EL% PT GG',
        quantidade: 2,
        unidade: 'UN',
        valor: 89.8,
      },
      {
        dataColeta: '2026-09-17',
        fornecedor: '67.086.759 CLAUDIA MARGEANE FREITAS - FORTEC EPI',
        rm: '1003',
        po: '4100468404',
        codigoItem: '1412303',
        material: 'CAPUZ OPER PA PT ABER FRON U',
        quantidade: 16,
        unidade: 'UN',
        valor: 206.4,
      },
      {
        dataColeta: '2026-09-17',
        fornecedor: 'COMERCIAL DE MATERIAIS DE CONSTRUÇÃO - PÉ QUENTE',
        rm: '1004',
        po: '4100467616',
        codigoItem: '1487880',
        material: 'FITA ACR DUPLA FACE 19MM 33M',
        quantidade: 1,
        unidade: 'UN',
        valor: 147.08,
      },
    ];

    const corpo = montarCorpoColeta({ linhas: linhasExemplo });
    const linhasTexto = corpo.split('\n');

    expect(linhasTexto[0]).toBe('Bom dia!');
    expect(linhasTexto[1]).toBe('');
    expect(linhasTexto[2]).toBe('Segue a lista de coleta para busca do material junto aos fornecedores.');
    expect(linhasTexto[3]).toBe('Itens: 4');
    expect(linhasTexto[4]).toMatch(/Valor total: R\$\s?667,78/);
    expect(linhasTexto[5]).toBe('--------------------------------------------------------------------');
    expect(linhasTexto[6]).toBe('FORNECEDOR: 67.086.759 CLAUDIA MARGEANE FREITAS - FORTEC EPI');
    expect(linhasTexto[7]).toBe('');
    expect(linhasTexto[8]).toBe('4100468780');
    expect(linhasTexto[9]).toMatch(/Código: 1437256 \| Material: CAMISA TERM UNI 90PES\/10EL% PT G \| Qtd: 5 UN \| Valor: R\$\s?224,50/);
    expect(linhasTexto[10]).toMatch(/Código: 1437258 \| Material: CAMISA TERM UNI 90PES\/10EL% PT GG \| Qtd: 2 UN \| Valor: R\$\s?89,80/);
    expect(linhasTexto[11]).toBe('4100468404');
    expect(linhasTexto[12]).toMatch(/Código: 1412303 \| Material: CAPUZ OPER PA PT ABER FRON U \| Qtd: 16 UN \| Valor: R\$\s?206,40/);
    expect(linhasTexto[13]).toBe('--------------------------------------------------');
    expect(linhasTexto[14]).toBe('');
    expect(linhasTexto[15]).toBe('FORNECEDOR: COMERCIAL DE MATERIAIS DE CONSTRUÇÃO - PÉ QUENTE');
    expect(linhasTexto[16]).toBe('');
    expect(linhasTexto[17]).toBe('4100467616');
    expect(linhasTexto[18]).toMatch(/Código: 1487880 \| Material: FITA ACR DUPLA FACE 19MM 33M \| Qtd: 1 UN \| Valor: R\$\s?147,08/);
    expect(linhasTexto[19]).toBe('--------------------------------------------------');
  });
});

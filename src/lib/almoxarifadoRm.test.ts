import { describe, expect, it } from 'vitest';
import {
  campoZRm, classificacaoRm, classificarVinculoRm, depositoRm, escolherAbaRmPreenchida,
  grupoComprasRm, itensSemCodigoSap, itensSemGrupoComprador, lerPlanilhaRmPreenchida,
  montarLinhasRm, nomeArquivoRm, requisitanteRm, textoCabecalhoRm, RM_COLUNAS,
  type ContextoRm,
} from './almoxarifadoRm';
import type { Request, RequestItem, Sector } from '../types';

const setorAlmox: Sector = {
  id: 'set-1', name: 'Almoxarifado', is_support: false, helpdesk_enabled: false, sap_area_code: 'ALMO',
};
const setorSemCodigo: Sector = {
  id: 'set-2', name: 'Rec. Humanos', is_support: false, helpdesk_enabled: false,
};

// Caneta (1456972) é papelaria, do comprador 602; furadeira (9000001) é
// ferramenta, do 314. O 7777777 existe no catálogo mas o grupo dele ainda não
// tem comprador; o 8888888 não está no catálogo.
const ctx: ContextoRm = {
  sectors: [setorAlmox, setorSemCodigo],
  grupoMercadoriaPorMaterial: new Map([
    ['1456972', 'M02001001'],
    ['1456961', 'M02001001'],
    ['1047902', 'M02001001'],
    ['9000001', 'M07001005'],
    ['7777777', 'M99999999'],
  ]),
  grupoComprasPorMercadoria: new Map([
    ['M02001001', '602'],
    ['M07001005', '314'],
  ]),
};

function req(over: Partial<Request> = {}): Request {
  return {
    id: 'r1',
    number: '2001004',
    type: 'compra',
    status: 'aprovada',
    criticality: 2,
    solicitante_id: 'u1',
    solicitante_name: 'Jamille Souza Batista',
    solicitante_sector_id: 'set-1',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    tipo_compra: 'Direta',
    justificativa: 'Compra material escritório projeto beta',
    ...over,
  } as Request;
}

function item(over: Partial<RequestItem> = {}): RequestItem {
  return {
    id: 'i1',
    request_id: 'r1',
    description: 'Caneta esferográfica azul',
    sap_code: '1456972',
    has_no_sap_code: false,
    quantity: 112,
    unit: 'UN',
    ...over,
  } as RequestItem;
}

describe('depósito (LGOBE)', () => {
  it('compra de estoque vai para 0001', () => {
    expect(depositoRm('Estoque')).toBe('0001');
    expect(depositoRm('estoque')).toBe('0001');
  });

  it('direta, serviço e vazio caem no 0050', () => {
    expect(depositoRm('Direta')).toBe('0050');
    expect(depositoRm('Serviço')).toBe('0050');
    expect(depositoRm(null)).toBe('0050');
    expect(depositoRm(undefined)).toBe('0050');
  });
});

describe('classificação', () => {
  it('criticidade 1 a 3 é Normal', () => {
    [1, 2, 3].forEach(c => expect(classificacaoRm(c)).toBe('Normal'));
  });

  it('criticidade 4 e 5 é Urgente', () => {
    [4, 5].forEach(c => expect(classificacaoRm(c)).toBe('Urgente'));
  });

  it('sem criticidade cai para Normal', () => {
    expect(classificacaoRm(null)).toBe('Normal');
    expect(classificacaoRm(undefined)).toBe('Normal');
  });
});

describe('requisitante (AFNAM)', () => {
  it('usa o primeiro nome em caixa alta', () => {
    expect(requisitanteRm('Jamille Souza Batista')).toBe('JAMILLE');
  });

  it('tira acento, que o campo do SAP não guarda', () => {
    expect(requisitanteRm('José da Silva')).toBe('JOSE');
  });

  it('aguenta nome vazio', () => {
    expect(requisitanteRm('')).toBe('');
    expect(requisitanteRm(null)).toBe('');
  });
});

describe('campo Z (ZZKOKRS)', () => {
  it('prefere o código SAP do setor', () => {
    expect(campoZRm(setorAlmox)).toBe('ALMO');
  });

  it('sem código, usa 4 letras do nome, ignorando pontuação', () => {
    expect(campoZRm(setorSemCodigo)).toBe('RECH');
  });

  it('nome curto sai inteiro e setor ausente sai vazio', () => {
    expect(campoZRm({ ...setorSemCodigo, name: 'TI' })).toBe('TI');
    expect(campoZRm(undefined)).toBe('');
  });
});

describe('texto de cabeçalho', () => {
  it('prefixa o número da solicitação', () => {
    expect(textoCabecalhoRm(req(), [item()])).toBe(
      '#2001004 - COMPRA MATERIAL ESCRITORIO PROJETO BETA',
    );
  });

  it('anexa a observação de cada item, com a posição dele', () => {
    const itens = [
      item({ id: 'i1' }),
      item({ id: 'i2', observation: 'Aceita similar' }),
      item({ id: 'i3', observation: 'Entregar no galpão 2' }),
    ];
    expect(textoCabecalhoRm(req(), itens)).toBe(
      '#2001004 - COMPRA MATERIAL ESCRITORIO PROJETO BETA' +
      ' -Item 20 ACEITA SIMILAR; -Item 30 ENTREGAR NO GALPAO 2;',
    );
  });

  it('solicitação sem justificativa sai só com o número', () => {
    expect(textoCabecalhoRm(req({ justificativa: undefined }), [item()])).toBe('#2001004 -');
  });
});

describe('montagem das linhas', () => {
  it('gera uma linha por item, numerada no padrão SAP (* 10: 10, 20...)', () => {
    const linhas = montarLinhasRm(
      [{
        request: req({ criticality: 5, number: '4000005' }),
        itens: [
          item({ id: 'i1', sap_code: '1456961', quantity: 17 }),
          item({ id: 'i2', sap_code: '1047902', quantity: 48 }),
        ],
      }],
      ctx,
    );

    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      'ID Req': '#4000005',
      'Classificação': 'Urgente',
      'Item': 10,
      'Material (MATNR)': '1456961',
      'Quantidade (MENGE)': 17,
      'Depósito (LGOBE)': '0050',
      'Centro (NAME1)': 'TEN2',
      'Grupo Compras (EKGRP)': '602',
      'Requisitante (AFNAM)': 'JAMILLE',
      'Campo Z (ZZKOKRS)': 'ALMO',
      'Cat. Remessa (ELPEI)': 'D',
      'Texto Cabeçalho (Justificativa)': '#4000005 - COMPRA MATERIAL ESCRITORIO PROJETO BETA',
      'Status / Nº da RM': '',
    });
    expect(linhas[1]['Item']).toBe(20);
    expect(linhas[1]['Material (MATNR)']).toBe('1047902');
  });

  it('cobre exatamente as colunas declaradas do cabeçalho', () => {
    const [linha] = montarLinhasRm([{ request: req(), itens: [item()] }], ctx);
    expect(Object.keys(linha).sort()).toEqual([...RM_COLUNAS].sort());
  });

  it('solicitação sem item não vira linha', () => {
    expect(montarLinhasRm([{ request: req(), itens: [] }], ctx)).toEqual([]);
  });

  it('setor não encontrado deixa o campo Z vazio em vez de quebrar', () => {
    const [linha] = montarLinhasRm(
      [{ request: req({ solicitante_sector_id: 'inexistente' }), itens: [item()] }],
      ctx,
    );
    expect(linha['Campo Z (ZZKOKRS)']).toBe('');
  });

  it('cada item leva o comprador do seu próprio grupo de mercadorias', () => {
    const linhas = montarLinhasRm(
      [{
        request: req(),
        itens: [
          item({ id: 'i1', sap_code: '1456972' }),
          item({ id: 'i2', sap_code: '9000001' }),
          item({ id: 'i3', sap_code: '8888888' }),
        ],
      }],
      ctx,
    );
    expect(linhas.map(l => l['Grupo Compras (EKGRP)'])).toEqual(['602', '314', '575']);
  });
});

describe('grupo de compras (EKGRP)', () => {
  it('sai do comprador vinculado ao grupo de mercadorias do material', () => {
    expect(grupoComprasRm(item({ sap_code: '1456972' }), ctx)).toBe('602');
    expect(grupoComprasRm(item({ sap_code: '9000001' }), ctx)).toBe('314');
  });

  it('item sem código SAP não tem como resolver', () => {
    expect(grupoComprasRm(item({ sap_code: undefined }), ctx)).toBeNull();
    expect(grupoComprasRm(item({ sap_code: '  ' }), ctx)).toBeNull();
  });

  it('material fora do catálogo não tem como resolver', () => {
    expect(grupoComprasRm(item({ sap_code: '8888888' }), ctx)).toBeNull();
  });

  it('grupo de mercadorias sem comprador vinculado não tem como resolver', () => {
    expect(grupoComprasRm(item({ sap_code: '7777777' }), ctx)).toBeNull();
  });
});

describe('itens sem comprador responsável', () => {
  it('conta só os que têm código SAP, para não repetir o alerta do MATNR', () => {
    const total = itensSemGrupoComprador(
      [{
        request: req(),
        itens: [
          item({ id: 'i1', sap_code: '1456972' }),  // resolve no 602
          item({ id: 'i2', sap_code: '8888888' }),  // fora do catálogo
          item({ id: 'i3', sap_code: '7777777' }),  // grupo sem comprador
          item({ id: 'i4', sap_code: undefined }),  // já contado por itensSemCodigoSap
        ],
      }],
      ctx,
    );
    expect(total).toBe(2);
  });
});

describe('itens sem código SAP', () => {
  it('conta os itens que não abrem RM', () => {
    const total = itensSemCodigoSap([
      { request: req(), itens: [item(), item({ id: 'i2', sap_code: undefined })] },
      { request: req({ id: 'r2' }), itens: [item({ id: 'i3', sap_code: '' })] },
    ]);
    expect(total).toBe(2);
  });
});

describe('nome do arquivo', () => {
  it('carimba data e hora', () => {
    expect(nomeArquivoRm(new Date(2026, 8, 6, 14, 32))).toBe('abrir_rm_20260906_1432.xlsx');
  });
});

describe('lerPlanilhaRmPreenchida', () => {
  it('lê o número da RM de cada solicitação, tirando o "#" do ID Req', () => {
    const resultado = lerPlanilhaRmPreenchida([
      { 'ID Req': '#4000005', 'Status / Nº da RM': '4500001234' },
      { 'ID Req': '#2001004', 'Status / Nº da RM': '4500009876' },
    ]);
    expect(resultado.porSolicitacao.get('4000005')).toBe('4500001234');
    expect(resultado.porSolicitacao.get('2001004')).toBe('4500009876');
    expect(resultado.totalLinhas).toBe(2);
    expect(resultado.linhasSemNumeroRm).toBe(0);
    expect(resultado.linhasSemIdReq).toBe(0);
  });

  it('solicitação repetida em várias linhas (uma por item): só a primeira com valor conta', () => {
    const resultado = lerPlanilhaRmPreenchida([
      { 'ID Req': '#4000005', 'Status / Nº da RM': '4500001234' },
      { 'ID Req': '#4000005', 'Status / Nº da RM': '4500009999' },
      { 'ID Req': '#4000005', 'Status / Nº da RM': '' },
    ]);
    expect(resultado.porSolicitacao.size).toBe(1);
    expect(resultado.porSolicitacao.get('4000005')).toBe('4500001234');
  });

  it('conta linha com ID Req mas sem número de RM', () => {
    const resultado = lerPlanilhaRmPreenchida([
      { 'ID Req': '#4000005', 'Status / Nº da RM': '' },
      { 'ID Req': '#4000005', 'Status / Nº da RM': '   ' },
    ]);
    expect(resultado.porSolicitacao.size).toBe(0);
    expect(resultado.linhasSemNumeroRm).toBe(2);
  });

  it('conta linha sem ID Req nenhum, sem lançar', () => {
    const resultado = lerPlanilhaRmPreenchida([
      { 'ID Req': '', 'Status / Nº da RM': '4500001234' },
      {},
    ]);
    expect(resultado.porSolicitacao.size).toBe(0);
    expect(resultado.linhasSemIdReq).toBe(2);
  });

  it('planilha vazia devolve tudo zerado', () => {
    const resultado = lerPlanilhaRmPreenchida([]);
    expect(resultado.porSolicitacao.size).toBe(0);
    expect(resultado.totalLinhas).toBe(0);
    expect(resultado.linhasSemNumeroRm).toBe(0);
    expect(resultado.linhasSemIdReq).toBe(0);
  });
});

describe('escolherAbaRmPreenchida', () => {
  it('prefere a aba "BD", em qualquer caixa e com espaço em volta', () => {
    expect(escolherAbaRmPreenchida(['Painel', 'BD', 'Macro'])).toBe('BD');
    expect(escolherAbaRmPreenchida(['Painel', 'bd', 'Macro'])).toBe('bd');
    expect(escolherAbaRmPreenchida(['Painel', ' Bd ', 'Macro'])).toBe(' Bd ');
  });

  it('sem aba "BD", cai para a primeira — caso do arquivo simples exportado por aqui', () => {
    expect(escolherAbaRmPreenchida(['RM'])).toBe('RM');
    expect(escolherAbaRmPreenchida(['Resumo', 'Detalhe'])).toBe('Resumo');
  });

  it('arquivo sem aba nenhuma devolve null', () => {
    expect(escolherAbaRmPreenchida([])).toBeNull();
  });
});

describe('classificarVinculoRm', () => {
  it('sem RM anterior é sempre "novo"', () => {
    expect(classificarVinculoRm(undefined, '4500001234')).toBe('novo');
    expect(classificarVinculoRm(null, '4500001234')).toBe('novo');
    expect(classificarVinculoRm('', '4500001234')).toBe('novo');
  });

  it('mesmo número (ignorando espaço em volta) é "inalterado"', () => {
    expect(classificarVinculoRm('4500001234', '4500001234')).toBe('inalterado');
    expect(classificarVinculoRm('4500001234', ' 4500001234 ')).toBe('inalterado');
  });

  it('número diferente do que já estava é "alterado"', () => {
    expect(classificarVinculoRm('4500001234', '4500009999')).toBe('alterado');
  });
});

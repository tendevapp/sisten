import { describe, expect, it } from 'vitest';
import type { BahiaSulEntrega, DiligenciamentoItem, EnrichedSAPRecord } from '../types';
import { buildRastreioRows, groupRowsByPo, filterRegistros, montarSemMigoDadosMap, isSemPo } from './rastreio';
import type { VinculoSistenRm } from './centralComprasSisten';

function registro(over: Partial<EnrichedSAPRecord> = {}): EnrichedSAPRecord {
  const base = {
    ri: '120009412500010', requisicao_de_compra: '1200094125', item_reqc: '10',
    material_code: '1437514', texto_breve: 'CHAVE DE IMPACTO', qtd_requisicao: 5, unidade_medida: 'UN',
    grupo_comprador: '314', data_solicitacao: '2026-08-20', data_remessa: '',
    requisitante_name: 'Ana', tipo_documento: 'ZR01', codigo_de_eliminacao: false,
    presente_ultima_carga: true, campos_extras: {},
    documento_compra: '4100465946', fornecedor_name: 'COMERCIAL DE MATERIAIS',
    data_pedido: '2026-08-26',
    natureza: 'Normal', status_requisicao: 'Processado', lead_time_compras_meta: 15,
    dias_em_aberto: 0, atraso_comprador: 0, faixa_atraso: '', alerta: '', status_atualizado: '',
    ...over,
  } as EnrichedSAPRecord;
  return { ...base, ri_po: over.ri_po || `${base.ri}-${base.documento_compra || 'SEM-PO'}` };
}

// Uma RM/item pode ter sido comprada em mais de um pedido (quantidade dividida
// entre fornecedores, saldo, reemissão). Antes, o banco entregava um PO só por
// item e os demais sumiam da tela — inclusive o que já tinha MIGO.
describe('buildRastreioRows com mais de um PO no mesmo item de RM', () => {
  const linhas = () => buildRastreioRows([
    registro({ ri_po: 'r-1', documento_compra: '4100465946', qtd_po: 1, fornecedor_name: 'COMERCIAL' }),
    registro({ ri_po: 'r-2', documento_compra: '4100465955', qtd_po: 1, fornecedor_name: 'FERIMPORT' }),
    registro({ ri_po: 'r-3', documento_compra: '4100466020', qtd_po: 3, fornecedor_name: 'ANHANGUERA', data_migo: '2026-09-03' }),
  ]);

  it('rende uma linha por pedido, com identidade própria', () => {
    const rows = linhas();
    expect(rows.map(r => r.po)).toEqual(['4100465946', '4100465955', '4100466020']);
    expect(new Set(rows.map(r => r.riPo)).size).toBe(3);
    // A RM continua a mesma nas três linhas — quem muda é o pedido.
    expect(new Set(rows.map(r => r.rm))).toEqual(new Set(['1200094125']));
  });

  it('usa a quantidade do pedido, não a da RM inteira', () => {
    expect(linhas().map(r => r.qtd)).toEqual([1, 1, 3]);
  });

  it('mantém a entrega no pedido que realmente chegou', () => {
    const rows = linhas();
    expect(rows.map(r => r.status)).toEqual(['Sem status', 'Sem status', 'Entregue']);
    expect(rows.filter(r => r.dataEntrega !== '—').map(r => r.po)).toEqual(['4100466020']);
  });

  it('o cronograma separa os pedidos em blocos distintos', () => {
    const grupos = groupRowsByPo(linhas());
    expect(grupos.map(g => g.po)).toEqual(['4100465946', '4100465955', '4100466020']);
    expect(grupos.map(g => g.rows.length)).toEqual([1, 1, 1]);
  });
});

describe('quantidade fornecida na linha do Rastreio', () => {
  it('traz o fornecido do pedido e o % atendido quando falta saldo', () => {
    const [row] = buildRastreioRows([
      registro({ qtd_requisicao: 115, qtd_po: 115, qtd_fornecida_po: 80, qtd_fornecida_total: 80 }),
    ]);
    expect(row.qtdFornecida).toBe(80);
    expect(row.entrega?.parcial).toBe(true);
    expect(row.entrega?.percentual).toBeCloseTo(69.57, 2);
  });

  it('entrega completa não vira alerta', () => {
    const [row] = buildRastreioRows([
      registro({ qtd_requisicao: 115, qtd_po: 115, qtd_fornecida_po: 115, qtd_fornecida_total: 115 }),
    ]);
    expect(row.entrega?.parcial).toBe(false);
    expect(row.entrega?.excedente).toBe(false);
  });

  it('sem informação de fornecimento, a coluna fica vazia e não há alerta', () => {
    const [row] = buildRastreioRows([registro()]);
    expect(row.qtdFornecida).toBeUndefined();
    expect(row.entrega).toBeNull();
  });
});

describe('buildRastreioRows sem PO', () => {
  it('cai para a quantidade da RM e marca a chave como SEM-PO', () => {
    const [row] = buildRastreioRows([
      registro({ ri_po: undefined, documento_compra: undefined, status_requisicao: 'Sem PO' }),
    ]);
    expect(row.po).toBe('—');
    expect(row.qtd).toBe(5);
    expect(row.riPo).toBe('120009412500010-SEM-PO');
  });
});

describe('itens genéricos no rastreio', () => {
  it('reconhece item genérico via vínculo SISTEN com is_generic', () => {
    const vinculos = new Map<string, VinculoSistenRm>([
      ['1200094199::1477274', {
        requestNumber: '2001004',
        item: {
          id: 'item-1',
          request_id: 'req-1',
          description: 'CHAVE COMBINADA 13MM',
          sap_code: '1477274',
          has_no_sap_code: false,
          is_generic: true,
          observation: 'ITEM GENÉRICO: CHAVE COMBINADA 13MM DE QUALIDADE SUPERIOR',
          quantity: 2,
          unit: 'UN',
          estimated_value: 50,
        },
      }],
    ]);

    const [row] = buildRastreioRows([
      registro({ requisicao_de_compra: '1200094199', material_code: '1477274', texto_breve: 'CHAVE COMBINADA DE 8 MM' }),
    ], vinculos);

    expect(row.isGeneric).toBe(true);
    expect(row.obsGenerica).toBe('CHAVE COMBINADA 13MM DE QUALIDADE SUPERIOR');
    expect(row.vinculoSisten?.requestNumber).toBe('2001004');
  });

  it('reconhece item genérico via tag [GENÉRICO] no texto breve ou flag direta', () => {
    const [row1] = buildRastreioRows([
      registro({ texto_breve: 'CHAVE COMBINADA [GENÉRICO]' }),
    ]);
    expect(row1.isGeneric).toBe(true);

    const [row2] = buildRastreioRows([
      registro({ texto_breve: 'NOTEBOOK [IG]' }),
    ]);
    expect(row2.isGeneric).toBe(true);

    const [row3] = buildRastreioRows([
      registro({ texto_breve: 'PARAFUSO NORMAL' }),
    ]);
    expect(row3.isGeneric).toBe(false);
  });

  it('filtra item genérico na busca textual por "generico" ou termos da observação', () => {
    const [row] = buildRastreioRows([
      registro({ is_generic: true, obs_generica: 'ESPECIFICAÇÃO ESPECIAL X' } as any),
    ]);
    expect(row.isGeneric).toBe(true);
    expect(row.obsGenerica).toBe('ESPECIFICAÇÃO ESPECIAL X');

    const filtrados1 = filterRegistros([row], {
      query: 'generico',
      status: 'Todos',
      setor: 'Todos',
      ano: 'Todos',
      scope: 'todos',
    });
    expect(filtrados1.length).toBe(1);

    const filtrados2 = filterRegistros([row], {
      query: 'ESPECIAL X',
      status: 'Todos',
      setor: 'Todos',
      ano: 'Todos',
      scope: 'todos',
    });
    expect(filtrados2.length).toBe(1);
  });
});

describe('integração dos dados que vêm da tela Sem MIGO no Rastreio', () => {
  it('preenche transportadora e previsão vindas do CTe da Bahia Sul sem necessidade de preencher manualmente', () => {
    const reg = registro({
      ri: '120009113300010',
      requisicao_de_compra: '1200091133',
      documento_compra: '4100451286',
      ri_po: '120009113300010-4100451286',
      data_entrega_confirmada: undefined,
    });

    const entregasBs: BahiaSulEntrega[] = [{
      id: 'bs-1',
      cto_numero: '31115',
      nro_pedido: '4100451286',
      prv_chegada: '2026-06-11',
      situacao: 'EM TRANSITO',
    } as any];

    const semMigoMap = montarSemMigoDadosMap([reg], [], entregasBs);
    const [row] = buildRastreioRows([reg], undefined, semMigoMap);

    expect(row.transportadora).toBe('Bahia Sul');
    expect(row.dataPrevista).toBe('2026-06-11');
    expect(row.ctos).toEqual(['31115']);
  });

  it('preenche transportadora e previsão manual digitadas pelo comprador na Sem MIGO', () => {
    const reg = registro({
      ri: '120009412500010',
      documento_compra: '4100465946',
      ri_po: '120009412500010-4100465946',
      data_entrega_confirmada: undefined,
    });

    const diligItens: DiligenciamentoItem[] = [{
      ri_po: '120009412500010-4100465946',
      ri: '120009412500010',
      transportadora: 'RODOTEN',
      previsao_manual: '2026-07-20',
    } as any];

    const semMigoMap = montarSemMigoDadosMap([reg], diligItens, []);
    const [row] = buildRastreioRows([reg], undefined, semMigoMap);

    expect(row.transportadora).toBe('RODOTEN');
    expect(row.dataPrevista).toBe('2026-07-20');
  });

  it('data_entrega_confirmada prevalece caso já tenha sido confirmada', () => {
    const reg = registro({
      ri: '120009412500010',
      documento_compra: '4100465946',
      ri_po: '120009412500010-4100465946',
      data_entrega_confirmada: '2026-09-01',
    });

    const diligItens: DiligenciamentoItem[] = [{
      ri_po: '120009412500010-4100465946',
      ri: '120009412500010',
      transportadora: 'RODOTEN',
      previsao_manual: '2026-07-20',
    } as any];

    const semMigoMap = montarSemMigoDadosMap([reg], diligItens, []);
    const [row] = buildRastreioRows([reg], undefined, semMigoMap);

    expect(row.transportadora).toBe('RODOTEN');
    expect(row.dataPrevista).toBe('2026-09-01');
  });
});

describe('filtros rápidos de PO e Prazo de entrega', () => {
  const hoje = new Date(2026, 8, 30); // 30/09/2026

  const linhas = buildRastreioRows([
    // Item 1: Sem PO
    registro({ ri_po: 'item-sem-po', documento_compra: undefined, status_requisicao: 'Sem PO' }),
    // Item 2: Com PO, no prazo (previsão 05/10/2026)
    registro({ ri_po: 'item-no-prazo', documento_compra: '4100000001', data_entrega_confirmada: '2026-10-05' }),
    // Item 3: Com PO, atrasado (previsão 20/09/2026)
    registro({ ri_po: 'item-atrasado', documento_compra: '4100000002', data_entrega_confirmada: '2026-09-20' }),
    // Item 4: Com PO, entregue (MIGO 25/09/2026)
    registro({ ri_po: 'item-entregue', documento_compra: '4100000003', data_entrega_confirmada: '2026-09-20', data_migo: '2026-09-25' }),
  ]);

  it('identifica corretamente itens sem PO via isSemPo', () => {
    expect(isSemPo(linhas[0])).toBe(true);
    expect(isSemPo(linhas[1])).toBe(false);
    expect(isSemPo(linhas[2])).toBe(false);
    expect(isSemPo(linhas[3])).toBe(false);
  });

  it('filtra apenas itens sem PO com po: "Sem PO"', () => {
    const res = filterRegistros(linhas, {
      query: '', status: 'Todos', setor: 'Todos', ano: 'Todos', scope: 'todos',
      po: 'Sem PO', hoje,
    });
    expect(res.length).toBe(1);
    expect(res[0].riPo).toBe('item-sem-po');
  });

  it('filtra apenas itens com PO com po: "Com PO"', () => {
    const res = filterRegistros(linhas, {
      query: '', status: 'Todos', setor: 'Todos', ano: 'Todos', scope: 'todos',
      po: 'Com PO', hoje,
    });
    expect(res.length).toBe(3);
    expect(res.map(r => r.riPo)).toEqual(['item-no-prazo', 'item-atrasado', 'item-entregue']);
  });

  it('filtra apenas itens atrasados com prazo: "atrasado"', () => {
    const res = filterRegistros(linhas, {
      query: '', status: 'Todos', setor: 'Todos', ano: 'Todos', scope: 'todos',
      prazo: 'atrasado', hoje,
    });
    expect(res.length).toBe(1);
    expect(res[0].riPo).toBe('item-atrasado');
  });

  it('filtra apenas itens no prazo com prazo: "no_prazo"', () => {
    const res = filterRegistros(linhas, {
      query: '', status: 'Todos', setor: 'Todos', ano: 'Todos', scope: 'todos',
      prazo: 'no_prazo', hoje,
    });
    expect(res.length).toBe(1);
    expect(res[0].riPo).toBe('item-no-prazo');
  });

  it('filtra apenas itens entregues com prazo: "entregue"', () => {
    const res = filterRegistros(linhas, {
      query: '', status: 'Todos', setor: 'Todos', ano: 'Todos', scope: 'todos',
      prazo: 'entregue', hoje,
    });
    expect(res.length).toBe(1);
    expect(res[0].riPo).toBe('item-entregue');
  });
});



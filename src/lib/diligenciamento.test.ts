import { describe, expect, it } from 'vitest';
import type { AlmoxarifadoChegada, CidadeForn, DiligenciamentoItem, EnrichedSAPRecord, PrazoTransporte } from '../types';
import {
  agruparPorPo, filtrarPedidos, indexarCidadesPorCodigo, montarItens,
  normalizarChaveTransportadora, ordenarPedidos, pedidoVencido, resolverPrazoDias,
  somarDiasCorridos, transportadorasConhecidas, ufDoFornecedor,
} from './diligenciamento';

function registro(over: Partial<EnrichedSAPRecord> = {}): EnrichedSAPRecord {
  const base = {
    ri: 'r1', requisicao_de_compra: '3000123', item_reqc: '00010',
    material_code: 'MAT-1', texto_breve: 'Parafuso', qtd_requisicao: 10, unidade_medida: 'UN',
    grupo_comprador: '314', data_solicitacao: '2026-08-01', data_remessa: '',
    requisitante_name: 'Ana', tipo_documento: 'ZR01', codigo_de_eliminacao: false,
    presente_ultima_carga: true, campos_extras: {},
    documento_compra: '4500001', fornecedor_code: 'F1', fornecedor_name: 'Fornecedor SP',
    data_pedido: '2026-08-05', data_entrega_sap: '2026-08-10', data_migo: undefined,
    preco_unitario: 10, valor_total: 100,
    natureza: 'Consumo', status_requisicao: 'Processado', lead_time_compras_meta: 0,
    dias_em_aberto: 0, atraso_comprador: 0, faixa_atraso: '', alerta: '', status_atualizado: '',
    ...over,
  } as EnrichedSAPRecord;
  // A chave da linha é item de RM + pedido; nos testes ela sai do par, como a view faz.
  return { ...base, ri_po: over.ri_po || `${base.ri}-${base.documento_compra || 'SEM-PO'}` };
}

const semDiligenciamento = new Map<string, DiligenciamentoItem>();
const semChegadas = new Map<string, AlmoxarifadoChegada>();
const semCidades = new Map<string, CidadeForn>();
const semRegiao = new Map<string, string>();

describe('normalização de transportadora', () => {
  it('ignora caixa, espaços nas pontas e espaços duplicados', () => {
    expect(normalizarChaveTransportadora('  Braspress   Log ')).toBe('braspress log');
    expect(normalizarChaveTransportadora('BRASPRESS LOG')).toBe(normalizarChaveTransportadora('braspress log'));
  });

  it('dedupa transportadoras já digitadas, mantendo a grafia mais recente', () => {
    const itens: DiligenciamentoItem[] = [
      { ri_po: 'a-1', ri: 'a', transportadora: 'braspress', updated_at: '2026-08-01T00:00:00Z' },
      { ri_po: 'b-1', ri: 'b', transportadora: 'Braspress', updated_at: '2026-08-05T00:00:00Z' },
      { ri_po: 'c-1', ri: 'c', transportadora: 'Jamef', updated_at: '2026-08-02T00:00:00Z' },
    ];
    expect(transportadorasConhecidas(itens)).toEqual(['Braspress', 'Jamef']);
  });
});

describe('UF do fornecedor', () => {
  it('prioriza o cadastro validado sobre a UF bruta do pedido', () => {
    const cidades = indexarCidadesPorCodigo([{ forn_codigo: 'F1', estado_uf: 'SP' } as CidadeForn]);
    expect(ufDoFornecedor('F1', 'BA', cidades)).toBe('SP');
  });

  it('cai para a UF bruta quando o fornecedor não está cadastrado', () => {
    expect(ufDoFornecedor('F9', 'ba', new Map())).toBe('BA');
  });

  it('ignora UF inválida (código numérico de região estrangeira)', () => {
    expect(ufDoFornecedor('F9', '120', new Map())).toBe('');
  });
});

describe('cascata de prazo de trânsito', () => {
  const prazos: PrazoTransporte[] = [
    { id: '1', uf: 'SP', transportadora: 'braspress', dias_corridos: 8 },
    { id: '2', uf: 'SP', transportadora: '', dias_corridos: 6 },
    { id: '3', uf: '', transportadora: '', dias_corridos: 15 },
  ];

  it('usa a linha exata (UF + transportadora) quando existe', () => {
    expect(resolverPrazoDias('SP', 'Braspress', prazos)).toBe(8);
  });

  it('cai para o padrão da UF quando a transportadora não tem linha própria', () => {
    expect(resolverPrazoDias('SP', 'Jamef', prazos)).toBe(6);
  });

  it('cai para o padrão global quando a UF não está cadastrada', () => {
    expect(resolverPrazoDias('BA', 'Jamef', prazos)).toBe(15);
  });

  it('retorna null quando nem o padrão global existe', () => {
    expect(resolverPrazoDias('BA', 'Jamef', [])).toBeNull();
  });
});

describe('soma de dias corridos', () => {
  it('soma dias simples', () => {
    expect(somarDiasCorridos('2026-08-10', 8)).toBe('2026-08-18');
  });

  it('atravessa virada de mês', () => {
    expect(somarDiasCorridos('2026-08-28', 8)).toBe('2026-09-05');
  });

  it('atravessa virada de ano', () => {
    expect(somarDiasCorridos('2026-12-28', 8)).toBe('2027-01-05');
  });
});

describe('montarItens', () => {
  it('exclui item sem PO, item já com MIGO e RM de serviço', () => {
    const registros = [
      registro({ ri: 'sem-po', documento_compra: undefined }),
      registro({ ri: 'com-migo', data_migo: '2026-08-15' }),
      registro({ ri: 'servico', requisicao_de_compra: '1700045' }),
      registro({ ri: 'ok' }),
    ];
    const itens = montarItens(registros, semDiligenciamento, semChegadas, semCidades, semRegiao, []);
    expect(itens.map(i => i.ri)).toEqual(['ok']);
  });

  it('calcula a previsão como remessa + prazo quando há prazo cadastrado', () => {
    const prazos: PrazoTransporte[] = [{ id: '1', uf: 'SP', transportadora: '', dias_corridos: 8 }];
    const cidades = indexarCidadesPorCodigo([{ forn_codigo: 'F1', estado_uf: 'SP' } as CidadeForn]);
    const [item] = montarItens([registro()], semDiligenciamento, semChegadas, cidades, semRegiao, prazos);
    expect(item.previsaoCalculada).toBe('2026-08-18');
    expect(item.previsaoEfetiva).toBe('2026-08-18');
    expect(item.motivoSemPrevisao).toBeUndefined();
  });

  it('sem remessa, não inventa previsão e explica o motivo', () => {
    const [item] = montarItens(
      [registro({ data_entrega_sap: '' })], semDiligenciamento, semChegadas, semCidades, semRegiao, [],
    );
    expect(item.previsaoCalculada).toBeNull();
    expect(item.previsaoEfetiva).toBeNull();
    expect(item.motivoSemPrevisao).toBe('sem_remessa');
  });

  it('com remessa mas sem prazo cadastrado para a UF, explica o motivo', () => {
    const [item] = montarItens([registro()], semDiligenciamento, semChegadas, semCidades, semRegiao, []);
    expect(item.previsaoCalculada).toBeNull();
    expect(item.motivoSemPrevisao).toBe('sem_prazo');
  });

  it('previsão manual sobrepõe a calculada', () => {
    const prazos: PrazoTransporte[] = [{ id: '1', uf: '', transportadora: '', dias_corridos: 8 }];
    const dilig = new Map<string, DiligenciamentoItem>([
      ['r1-4500001', { ri_po: 'r1-4500001', ri: 'r1', previsao_manual: '2026-09-01' }],
    ]);
    const [item] = montarItens([registro()], dilig, semChegadas, semCidades, semRegiao, prazos);
    expect(item.previsaoCalculada).toBe('2026-08-18');
    expect(item.previsaoEfetiva).toBe('2026-09-01');
    expect(item.motivoSemPrevisao).toBeUndefined();
  });

  it('marca chegou quando existe registro em almoxarifado_chegadas para a linha', () => {
    const chegadas = new Map<string, AlmoxarifadoChegada>([
      ['r1-4500001', { ri_po: 'r1-4500001', ri: 'r1', data_chegada: '2026-08-12' } as AlmoxarifadoChegada],
    ]);
    const [item] = montarItens([registro()], semDiligenciamento, chegadas, semCidades, semRegiao, []);
    expect(item.chegou).toBe(true);
    expect(item.dataChegada).toBe('2026-08-12');
  });

  it('mesmo item de RM comprado em dois POs rende uma linha por pedido', () => {
    const registros = [
      registro({ ri_po: 'r1-4500001', documento_compra: '4500001', qtd_po: 1, valor_total: 100 }),
      registro({ ri_po: 'r1-4500002', documento_compra: '4500002', qtd_po: 4, valor_total: 400 }),
    ];
    const itens = montarItens(registros, semDiligenciamento, semChegadas, semCidades, semRegiao, []);
    expect(itens.map(i => i.docCompra)).toEqual(['4500001', '4500002']);
    // Quantidade é a do pedido, não a da RM inteira.
    expect(itens.map(i => i.quantidade)).toEqual([1, 4]);
    expect(agruparPorPo(itens).map(p => p.docCompra)).toEqual(['4500001', '4500002']);
  });

  it('chegada de um PO não marca o outro PO do mesmo item de RM', () => {
    const registros = [
      registro({ ri_po: 'r1-4500001', documento_compra: '4500001' }),
      registro({ ri_po: 'r1-4500002', documento_compra: '4500002' }),
    ];
    const chegadas = new Map<string, AlmoxarifadoChegada>([
      ['r1-4500001', { ri_po: 'r1-4500001', ri: 'r1', data_chegada: '2026-08-12' } as AlmoxarifadoChegada],
    ]);
    const itens = montarItens(registros, semDiligenciamento, chegadas, semCidades, semRegiao, []);
    expect(itens.map(i => i.chegou)).toEqual([true, false]);
  });
});

describe('agruparPorPo', () => {
  it('soma o valor dos itens e usa a remessa/previsão mais próxima do pedido', () => {
    const prazos: PrazoTransporte[] = [{ id: '1', uf: '', transportadora: '', dias_corridos: 8 }];
    const registros = [
      registro({ ri: 'i1', valor_total: 100, data_entrega_sap: '2026-08-20' }),
      registro({ ri: 'i2', valor_total: 50, data_entrega_sap: '2026-08-10' }),
    ];
    const itens = montarItens(registros, semDiligenciamento, semChegadas, semCidades, semRegiao, prazos);
    const [po] = agruparPorPo(itens);

    expect(po.docCompra).toBe('4500001');
    expect(po.valorTotal).toBe(150);
    expect(po.dataRemessa).toBe('2026-08-10');
    expect(po.previsaoMaisProxima).toBe('2026-08-18');
  });

  it('estado do pedido é pendente/parcial/chegou conforme os itens', () => {
    const chegadas = new Map<string, AlmoxarifadoChegada>([
      ['i1-4500001', { ri_po: 'i1-4500001', ri: 'i1', data_chegada: '2026-08-12' } as AlmoxarifadoChegada],
    ]);
    const registros = [registro({ ri: 'i1' }), registro({ ri: 'i2' })];
    const itens = montarItens(registros, semDiligenciamento, chegadas, semCidades, semRegiao, []);
    const [po] = agruparPorPo(itens);
    expect(po.estadoChegada).toBe('parcial');

    const [poTudoChegou] = agruparPorPo(
      montarItens(registros, semDiligenciamento,
        new Map([
          ['i1-4500001', chegadas.get('i1-4500001')!],
          ['i2-4500001', { ri_po: 'i2-4500001', ri: 'i2', data_chegada: '2026-08-13' } as AlmoxarifadoChegada],
        ]),
        semCidades, semRegiao, []),
    );
    expect(poTudoChegou.estadoChegada).toBe('chegou');
  });
});

describe('filtros e ordenação', () => {
  const prazos: PrazoTransporte[] = [{ id: '1', uf: '', transportadora: '', dias_corridos: 8 }];

  const pedidos = () => agruparPorPo(montarItens(
    [
      registro({ ri: 'a', documento_compra: '1', fornecedor_name: 'Alfa', data_entrega_sap: '2026-08-20' }),
      registro({ ri: 'b', documento_compra: '2', fornecedor_name: 'Beta', data_entrega_sap: '2026-08-10' }),
    ],
    semDiligenciamento, semChegadas, semCidades, semRegiao, prazos,
  ));

  it('busca por fornecedor ou número do PO', () => {
    const r = filtrarPedidos(pedidos(), { busca: 'beta', status: 'todos', transportadora: '', uf: '' });
    expect(r.map(p => p.docCompra)).toEqual(['2']);
  });

  it('ordena pela previsão mais próxima primeiro', () => {
    const r = ordenarPedidos(pedidos());
    expect(r.map(p => p.docCompra)).toEqual(['2', '1']);
  });

  it('pedido sem previsão vai para o fim da ordenação', () => {
    const semPrazo = agruparPorPo(montarItens(
      [registro({ ri: 'x', documento_compra: '9' })], semDiligenciamento, semChegadas, semCidades, semRegiao, [],
    ));
    const r = ordenarPedidos([...pedidos(), ...semPrazo]);
    expect(r[r.length - 1].docCompra).toBe('9');
  });
});

describe('pedidoVencido', () => {
  it('é vencido quando a previsão já passou e ainda não chegou', () => {
    const [po] = agruparPorPo(montarItens(
      [registro({ data_entrega_sap: '2026-08-01' })], semDiligenciamento, semChegadas, semCidades, semRegiao,
      [{ id: '1', uf: '', transportadora: '', dias_corridos: 1 }],
    ));
    expect(pedidoVencido(po, '2026-08-10')).toBe(true);
  });

  it('não é vencido depois de confirmada a chegada', () => {
    const chegadas = new Map<string, AlmoxarifadoChegada>([
      ['r1-4500001', { ri_po: 'r1-4500001', ri: 'r1', data_chegada: '2026-08-05' } as AlmoxarifadoChegada],
    ]);
    const [po] = agruparPorPo(montarItens(
      [registro({ data_entrega_sap: '2026-08-01' })], semDiligenciamento, chegadas, semCidades, semRegiao,
      [{ id: '1', uf: '', transportadora: '', dias_corridos: 1 }],
    ));
    expect(pedidoVencido(po, '2026-08-10')).toBe(false);
  });
});

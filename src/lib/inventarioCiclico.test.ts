import { describe, expect, it } from 'vitest';
import {
  MAX_CONTAGENS, coberturaInventario, diasEntre, historicoPorItem, linhasResultado, montarCandidatos, proximaContagem,
  resumirInventario, rotuloDias, type ItemInventario,
} from './inventarioCiclico';
import { montarLinhasPlanilhaInventario } from './inventarioCiclicoPlanilha';
import type { EstoqueGiro, EstoqueItem } from '../types';

const estoque: EstoqueItem[] = [
  { id: 1, deposito: '0001', material: '01371231', txt_breve_material: 'ARAME SOLDA EM12K 4MM', umb: 'KG', valor_total: 100 },
  { id: 2, deposito: '1', material: '1425762', txt_breve_material: 'FLUXO SOLDA PO FER', umb: 'KG', valor_total: 900 },
  { id: 3, deposito: '0002', material: '1291134', txt_breve_material: 'DISCO FLAP', umb: 'UN', valor_total: 50 },
  { id: 4, deposito: '0002', material: '1291134', txt_breve_material: 'DISCO FLAP', umb: 'UN', valor_total: 30 },
  { id: 5, deposito: '0004', material: '9999999', txt_breve_material: 'MANUTENCAO', umb: 'UN', valor_total: 5000 },
];

const giro = [
  { material: '1371231', valor_consumido: 800 },
  { material: '1425762', valor_consumido: 150 },
  { material: '1291134', valor_consumido: 50 },
] as EstoqueGiro[];

describe('montarCandidatos', () => {
  it('filtra pelos depósitos, normalizando o código', () => {
    const c = montarCandidatos(estoque, giro, 'consumo', ['0001', '2']);
    expect(c.map((x) => x.deposito).sort()).toEqual(['0001', '0001', '0002']);
    expect(c.some((x) => x.material === '9999999')).toBe(false);
  });

  it('mantém o código de material como está na ZL0024 (a RPC compara texto exato)', () => {
    const c = montarCandidatos(estoque, giro, 'consumo', ['0001']);
    expect(c.find((x) => x.descricao.startsWith('ARAME'))?.material).toBe('01371231');
  });

  it('classifica pela curva de consumo: A enquanto o acumulado anterior < 80%', () => {
    const c = montarCandidatos(estoque, giro, 'consumo', ['0001', '0002']);
    expect(c.map((x) => [x.material, x.classe])).toEqual([
      ['01371231', 'A'], // 0% antes
      ['1425762', 'B'], // 80% antes
      ['1291134', 'C'], // 95% antes
    ]);
    expect(c[0].posicao).toBe(1);
  });

  it('na curva por valor soma as linhas do mesmo material × depósito', () => {
    const c = montarCandidatos(estoque, giro, 'valor', ['0001', '0002']);
    expect(c[0].material).toBe('1425762');
    expect(c.length).toBe(3);
    expect(c[2].material).toBe('1291134');
  });

  it('sem depósito marcado usa todos', () => {
    expect(montarCandidatos(estoque, giro, 'valor', []).length).toBe(4);
  });

  it('item sem consumo é C', () => {
    const c = montarCandidatos(estoque, [], 'consumo', []);
    expect(c.every((x) => x.classe === 'C')).toBe(true);
  });
});

function item(p: Partial<ItemInventario>): ItemInventario {
  return {
    id: 'i', ordem: 1, material: '1', descricao: 'X', unidade: 'UN', deposito: '0001', classe: 'A',
    status: 'pendente', saldo_sistema: null, qtd_final: null, diferenca: null, alerta: null, encerrado_em: null,
    contagens: [], ...p,
  };
}
const contagem = (numero: number, quantidade: number, divergente: boolean) => ({
  id: `c${numero}`, numero, quantidade, divergente, endereco_encontrado: numero === 1 ? '101.ARAMES' : null,
  validade: null, observacao: null, contado_por_nome: 'T', created_at: '2026-09-24T10:00:00Z',
});

describe('proximaContagem', () => {
  it('pendente → 1ª; aguardando → próxima; encerrado → nenhuma', () => {
    expect(proximaContagem(item({}))).toBe(1);
    expect(proximaContagem(item({ status: 'aguardando_decisao', contagens: [contagem(1, 5, true)] }))).toBe(2);
    expect(proximaContagem(item({ status: 'divergente', contagens: [contagem(1, 5, true)] }))).toBeNull();
  });

  it(`não passa de ${MAX_CONTAGENS}`, () => {
    const cs = Array.from({ length: MAX_CONTAGENS }, (_, i) => contagem(i + 1, 5, true));
    expect(proximaContagem(item({ status: 'aguardando_decisao', contagens: cs }))).toBeNull();
  });
});

describe('resultado', () => {
  const itens: ItemInventario[] = [
    item({ id: 'a', ordem: 1, status: 'conferido', saldo_sistema: 10, qtd_final: 10, diferenca: 0, contagens: [contagem(1, 10, false)] }),
    item({
      id: 'b', ordem: 2, status: 'divergente', saldo_sistema: 1193, qtd_final: 1100, diferenca: -93, alerta: 'Divergente',
      contagens: [contagem(1, 1000, true), contagem(2, 1100, true)],
    }),
    item({ id: 'c', ordem: 3, status: 'aguardando_decisao', saldo_sistema: null, contagens: [contagem(1, 3, true)] }),
    item({ id: 'd', ordem: 4 }),
  ];

  it('resume status e acuracidade dos encerrados', () => {
    const r = resumirInventario(itens);
    expect(r).toMatchObject({ total: 4, pendentes: 1, aguardando: 1, conferidos: 1, divergentes: 1, contados: 3 });
    expect(r.acuracidade).toBe(50);
  });

  it('põe as contagens lado a lado e só mostra saldo de item encerrado', () => {
    const l = linhasResultado(itens);
    expect(l[1].contagens).toEqual([1000, 1100, null]);
    expect(l[1].saldo).toBe(1193);
    expect(l[1].diferenca).toBe(-93);
    expect(l[1].endereco).toBe('101.ARAMES');
    expect(l[2].saldo).toBeNull();
    expect(l[3].contagens).toEqual([null, null, null]);
  });

  it('planilha deixa saldo vazio no item em aberto', () => {
    const linhas = montarLinhasPlanilhaInventario({
      codigo: 'INV-240926-01', data: '2026-09-24', conferente_nome: null, criado_por_nome: 'T', criterio: null, itens,
    });
    expect(linhas[1]['Saldo ZL0024']).toBe(1193);
    expect(linhas[1]['2ª contagem']).toBe(1100);
    expect(linhas[2]['Saldo ZL0024']).toBe('');
    expect(linhas[0]['Descrição depósito']).toBe('Consumíveis Solda');
  });
});

describe('histórico e cobertura', () => {
  const inventarios = [
    { data: '2026-09-01', itens: [
      item({ material: '01371231', deposito: '0001', status: 'divergente', contagens: [contagem(1, 5, true)] }),
      item({ material: '1425762', deposito: '0001', status: 'pendente', contagens: [] }),
    ] },
    { data: '2026-09-20', itens: [
      item({ material: '1371231', deposito: '1', status: 'conferido', contagens: [contagem(1, 10, false)] }),
    ] },
  ];

  it('guarda a data mais recente, as vezes e se já divergiu; ignora item sem contagem', () => {
    const h = historicoPorItem(inventarios);
    expect(h.get('1371231|0001')).toEqual({ ultimaData: '2026-09-20', vezes: 2, jaDivergiu: true });
    expect(h.has('1425762|0001')).toBe(false);
  });

  it('conta dias sem passar por fuso', () => {
    expect(diasEntre('2026-08-31', '2026-09-24')).toBe(24);
    expect(rotuloDias(0)).toBe('hoje');
    expect(rotuloDias(1)).toBe('ontem');
    expect(rotuloDias(24)).toBe('há 24 dias');
  });

  it('cobertura = material × depósito da ZL0024 já contado, com filtro de depósito', () => {
    const h = historicoPorItem(inventarios);
    const todos = coberturaInventario(estoque, h);
    expect(todos).toMatchObject({ total: 4, inventariados: 1 });
    expect(todos.pct).toBe(25);
    expect(coberturaInventario(estoque, h, ['0001'])).toMatchObject({ total: 2, inventariados: 1, pct: 50 });
    expect(coberturaInventario([], h).pct).toBe(0);
  });
});

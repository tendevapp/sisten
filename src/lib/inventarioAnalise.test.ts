import { describe, expect, it } from 'vitest';
import type { EstoqueItem } from '../types';
import type { ItemInventario } from './inventarioCiclico';
import {
  FILTRO_VAZIO, SEM_CLASSE, aplicarFiltro, coberturaAnalise, conferidosComDiferenca, faixaDeIdade, linhasAnalise,
  maioresDivergencias, porClasse, porDeposito, porDia, precosPorMaterial, reincidentes, resumirAnalise,
  type InventarioAnalise,
} from './inventarioAnalise';

const contagem = (numero = 1) => ({
  id: `c${numero}`, numero, quantidade: 1, divergente: false, endereco_encontrado: null,
  validade: null, observacao: null, contado_por_nome: 'X', created_at: '2026-10-01T12:00:00Z',
});

let seq = 0;
const item = (extra: Partial<ItemInventario>): ItemInventario => ({
  id: `i${++seq}`, ordem: seq, material: '1000', descricao: 'PARAFUSO', unidade: 'UN', deposito: '0002',
  classe: null, status: 'conferido', saldo_sistema: 10, qtd_final: 10, diferenca: 0, alerta: null,
  encerrado_em: '2026-10-01', contagens: [contagem()], ...extra,
});

const inv = (codigo: string, data: string, itens: ItemInventario[]): InventarioAnalise => ({
  id: codigo, codigo, data, criterio: null, itens,
});

const estoque = (material: string, deposito: string, quantidade: number, valor: number): EstoqueItem => ({
  id: seq++, material, deposito, quantidade, valor_total: valor,
});

describe('linhasAnalise', () => {
  it('usa o Valor Divergente da planilha (sempre positivo) e o nº de contagens dela', () => {
    const historico = item({
      status: 'divergente', diferenca: -150, saldo_sistema: 150, qtd_final: 150,
      dados_origem: { 'Valor Divergente': '19959', 'Nº Contagem': 4 },
    });
    const [l] = linhasAnalise([inv('INV-1', '2026-09-01', [historico])]);
    expect(l).toMatchObject({ origem: 'historico', valor: 19959, valorEstimado: false, contagens: 4, acertouNaPrimeira: false });
  });

  it('estima o valor do item SISTEN pelo preço médio e marca como estimado', () => {
    const sisten = item({ status: 'divergente', diferenca: -3 });
    const [l] = linhasAnalise([inv('INV-2', '2026-10-01', [sisten])], new Map([['1000', 12.5]]));
    expect(l).toMatchObject({ origem: 'sisten', valor: 37.5, valorEstimado: true });
  });

  it('deixa o valor vazio quando não há preço e não há diferença a valorar', () => {
    const [semPreco] = linhasAnalise([inv('INV-3', '2026-10-01', [item({ status: 'divergente', diferenca: 5 })])]);
    expect(semPreco.valor).toBeNull();
    const [bateu] = linhasAnalise([inv('INV-3', '2026-10-01', [item({ diferenca: 0 })])]);
    expect(bateu.valor).toBe(0);
  });

  it('só conta como acerto na 1ª contagem o item conferido com uma contagem', () => {
    const lista = linhasAnalise([inv('INV-4', '2026-10-01', [
      item({}),
      item({ contagens: [contagem(1), contagem(2)] }),
      item({ status: 'divergente', diferenca: 2 }),
    ])]);
    expect(lista.map((l) => l.acertouNaPrimeira)).toEqual([true, false, false]);
  });
});

describe('resumirAnalise', () => {
  const linhas = linhasAnalise([
    inv('INV-A', '2026-10-01', [
      item({ material: '1', diferenca: 0 }),
      item({ material: '2', diferenca: 0 }),
      item({ material: '3', status: 'divergente', diferenca: -4 }),
      item({ material: '4', status: 'divergente', diferenca: 2 }),
      item({ material: '5', status: 'pendente', diferenca: null, saldo_sistema: null, qtd_final: null }),
    ]),
  ], new Map([['3', 10], ['4', 100]]));
  const r = resumirAnalise(linhas);

  it('calcula acuracidade só sobre os itens encerrados', () => {
    expect(r).toMatchObject({ encerrados: 4, conferidos: 2, divergentes: 2, emAberto: 1, acuracidade: 50, acertoPrimeira: 50 });
  });

  it('separa falta e sobra com o valor de cada uma', () => {
    expect(r).toMatchObject({ faltas: 1, sobras: 1, valorFalta: 40, valorSobra: 200, valorTotal: 240, valorEstimado: 240 });
  });

  it('mantém o conferido com diferença fora do valor do erro, contado à parte', () => {
    const [tolerado] = linhasAnalise([inv('INV-B', '2026-10-02', [
      item({ status: 'conferido', diferenca: 320, dados_origem: { 'Valor Divergente': 187957.28, 'Nº Contagem': 3 } }),
    ])]);
    expect(resumirAnalise([tolerado])).toMatchObject({
      conferidos: 1, acuracidade: 100, faltas: 0, sobras: 0, valorTotal: 0,
      conferidosComDiferenca: 1, valorConferidosComDiferenca: 187957.28,
    });
    expect(conferidosComDiferenca([tolerado])).toHaveLength(1);
    expect(maioresDivergencias([tolerado])).toHaveLength(0);
    expect(porDia([tolerado])[0].valor).toBe(0);
  });

  it('devolve acuracidade nula sem itens encerrados', () => {
    expect(resumirAnalise([]).acuracidade).toBeNull();
  });
});

describe('filtros e agrupamentos', () => {
  const lista = linhasAnalise([
    inv('INV-1', '2026-09-10', [
      item({ material: '1', deposito: '0001', classe: 'A' }),
      item({ material: '2', deposito: '0002', status: 'divergente', diferenca: -1 }),
    ]),
    inv('INV-2', '2026-10-05', [
      item({ material: '1', deposito: '0001', classe: 'A', status: 'divergente', diferenca: 3 }),
      item({ material: '3', deposito: '0004', dados_origem: { 'Valor Divergente': 0, 'Nº Contagem': 1 } }),
    ]),
  ]);

  it('filtra por período, depósito, classe e origem', () => {
    expect(aplicarFiltro(lista, FILTRO_VAZIO)).toHaveLength(4);
    expect(aplicarFiltro(lista, { ...FILTRO_VAZIO, de: '2026-10-01' })).toHaveLength(2);
    expect(aplicarFiltro(lista, { ...FILTRO_VAZIO, ate: '2026-09-30' })).toHaveLength(2);
    expect(aplicarFiltro(lista, { ...FILTRO_VAZIO, depositos: ['1'] }).map((l) => l.material)).toEqual(['1', '1']);
    expect(aplicarFiltro(lista, { ...FILTRO_VAZIO, classe: SEM_CLASSE })).toHaveLength(2);
    expect(aplicarFiltro(lista, { ...FILTRO_VAZIO, origem: 'historico' }).map((l) => l.material)).toEqual(['3']);
  });

  it('agrupa por dia em ordem cronológica, por depósito e por classe', () => {
    expect(porDia(lista).map((g) => [g.chave, g.encerrados, g.acuracidade])).toEqual([
      ['2026-09-10', 2, 50], ['2026-10-05', 2, 50],
    ]);
    expect(porDeposito(lista).map((g) => g.chave)).toEqual(['0001', '0002', '0004']);
    expect(porClasse(lista).map((g) => g.chave)).toEqual(['A', SEM_CLASSE]);
  });

  it('lista os reincidentes: divergiu mais de uma vez no mesmo material × depósito', () => {
    expect(reincidentes(lista)).toEqual([]);
    const repetido = linhasAnalise([
      inv('A', '2026-09-01', [item({ material: '9', status: 'divergente', diferenca: 2 })]),
      inv('B', '2026-09-08', [item({ material: '9', status: 'divergente', diferenca: -2 })]),
      inv('C', '2026-09-15', [item({ material: '9' })]),
    ], new Map([['9', 5]]));
    const [r] = reincidentes(repetido);
    expect(r).toMatchObject({ material: '9', vezesContado: 3, vezesDivergiu: 2, valor: 20, ultimaData: '2026-09-15' });
  });

  it('ordena as maiores divergências pelo valor, depois pela quantidade', () => {
    const l = linhasAnalise([inv('X', '2026-10-01', [
      item({ material: 'a', status: 'divergente', diferenca: 100, dados_origem: { 'Valor Divergente': 10 } }),
      item({ material: 'b', status: 'divergente', diferenca: 1, dados_origem: { 'Valor Divergente': 500 } }),
      item({ material: 'c', status: 'divergente', diferenca: 7 }),
    ])]);
    expect(maioresDivergencias(l, 2).map((x) => x.material)).toEqual(['b', 'a']);
    expect(maioresDivergencias(l)).toHaveLength(3);
  });
});

describe('cobertura', () => {
  it('classifica a idade da última contagem em faixas', () => {
    expect([0, 7, 8, 30, 31, 60, 61].map(faixaDeIdade)).toEqual(['ate7', 'ate7', 'ate30', 'ate30', 'ate60', 'ate60', 'mais60']);
    expect(faixaDeIdade(null)).toBe('nunca');
  });

  it('mede quanto da ZL0024 já foi contado, em itens e em valor, por depósito e por idade', () => {
    const zl = [
      estoque('1', '0001', 10, 1000),
      estoque('2', '0001', 5, 500),
      estoque('3', '0002', 2, 50),
    ];
    const invs = [inv('INV', '2026-10-10', [item({ material: '1', deposito: '0001' })])];
    const c = coberturaAnalise(zl, invs, '2026-10-15');
    expect(c).toMatchObject({ total: 3, contados: 1, valorEstoque: 1550, valorContado: 1000 });
    expect(c.pct).toBeCloseTo(33.33, 1);
    expect(c.porDeposito.map((d) => [d.deposito, d.itens, d.contados])).toEqual([['0001', 2, 1], ['0002', 1, 0]]);
    expect(c.idade.map((f) => [f.faixa, f.itens])).toEqual([['ate7', 1], ['ate30', 0], ['ate60', 0], ['mais60', 0], ['nunca', 2]]);
    expect(coberturaAnalise(zl, invs, '2026-10-15', ['0002']).contados).toBe(0);
  });

  it('calcula o preço médio por material só com linhas de saldo positivo', () => {
    const precos = precosPorMaterial([
      estoque('0001000', '0001', 10, 100),
      estoque('1000', '0002', 10, 300),
      estoque('2000', '0001', 0, 0),
    ]);
    expect(precos.get('1000')).toBe(20);
    expect(precos.has('2000')).toBe(false);
  });
});

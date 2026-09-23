import { describe, expect, it } from 'vitest';
import {
  adicionarLinha, buscarMateriais, buscarMateriaisEmDepositos, erroDaLinha, indexarEstoquePorDeposito, reaplicarSaldos,
  ultimaAplicacaoPorColaborador, validarRequisicao, type LinhaBalcao,
} from './requisicaoBalcao';
import type { EstoqueItem } from '../types';

const estoque: EstoqueItem[] = [
  { id: 1, deposito: '0002', material: '1291134', txt_breve_material: 'DISCO FLAP ZIRC 60 115X22,23MM', quantidade: 3000, umb: 'UN' },
  { id: 2, deposito: '2', material: '1291134', txt_breve_material: 'DISCO FLAP ZIRC 60 115X22,23MM', quantidade: 30, umb: 'UN' },
  { id: 3, deposito: '0002', material: '1357300', txt_breve_material: 'MÁSCARA SOLDA ESCUDO', quantidade: 17, umb: 'UN' },
  { id: 4, deposito: '0105', material: '1291134', txt_breve_material: 'DISCO FLAP ZIRC 60 115X22,23MM', quantidade: 60, umb: 'UN' },
  { id: 5, deposito: '0004', material: '9999999', txt_breve_material: 'SEM SALDO', quantidade: 0, umb: 'UN' },
];

describe('indexarEstoquePorDeposito', () => {
  const idx = indexarEstoquePorDeposito(estoque);

  it('soma linhas do mesmo material e normaliza o código do depósito', () => {
    expect(idx.get('0002')?.get('1291134')?.saldo).toBe(3030);
    expect(idx.get('0105')?.get('1291134')?.saldo).toBe(60);
  });

  it('descarta material sem saldo e depósito que ficou vazio', () => {
    expect(idx.has('0004')).toBe(false);
  });
});

describe('buscarMateriais', () => {
  const disp = [...indexarEstoquePorDeposito(estoque).get('0002')!.values()];

  it('acha por termos de descrição em qualquer ordem e sem acento', () => {
    expect(buscarMateriais(disp, 'flap disco').map((m) => m.material)).toEqual(['1291134']);
    expect(buscarMateriais(disp, 'mascara').map((m) => m.material)).toEqual(['1357300']);
  });

  it('acha pelo código e ignora termo vazio', () => {
    expect(buscarMateriais(disp, '13573').map((m) => m.material)).toEqual(['1357300']);
    expect(buscarMateriais(disp, '  ')).toEqual([]);
  });
});

describe('buscarMateriaisEmDepositos', () => {
  const idx = indexarEstoquePorDeposito(estoque);

  it('sem depósito fixo, traz o material em cada depósito onde tem saldo', () => {
    const r = buscarMateriaisEmDepositos(idx, '1291134');
    expect(r.map((m) => [m.deposito, m.saldo])).toEqual([['0002', 3030], ['0105', 60]]);
  });

  it('com depósito fixo, só aquele depósito', () => {
    expect(buscarMateriaisEmDepositos(idx, 'disco', '0105').map((m) => m.deposito)).toEqual(['0105']);
  });

  it('depósito inativo vai para o fim', () => {
    const r = buscarMateriaisEmDepositos(idx, '1291134', null, (d) => d === '0002');
    expect(r.map((m) => m.deposito)).toEqual(['0105', '0002']);
  });
});

describe('linhas', () => {
  const item = { material: '1357300', descricao: 'MÁSCARA', unidade: 'UN', saldo: 17 };

  it('somar o mesmo material em vez de duplicar a linha', () => {
    const l = adicionarLinha(adicionarLinha([], item, 2), item, 3);
    expect(l).toHaveLength(1);
    expect(l[0].quantidade).toBe(5);
  });

  it('acusa quantidade zero e acima do saldo', () => {
    expect(erroDaLinha({ quantidade: 0, saldo: 5 })).not.toBeNull();
    expect(erroDaLinha({ quantidade: 6, saldo: 5 })).toMatch(/saldo/);
    expect(erroDaLinha({ quantidade: 5, saldo: 5 })).toBeNull();
  });

  it('trocar o depósito zera o saldo de material que não existe lá', () => {
    const idx = indexarEstoquePorDeposito(estoque);
    const linhas: LinhaBalcao[] = [{ ...item, quantidade: 1 }];
    expect(reaplicarSaldos(linhas, idx.get('0105'))[0].saldo).toBe(0);
  });
});

describe('validarRequisicao', () => {
  const cab = { tipoMovimento: 'saida' as const, depositoOrigem: '0002', depositoDestino: '', colaboradorNome: 'JOSE', aplicacao: 'PRODUÇÃO' };
  const linha: LinhaBalcao = { material: '1', descricao: 'X', unidade: 'UN', saldo: 10, quantidade: 2 };

  it('requisição completa passa', () => {
    expect(validarRequisicao(cab, [linha])).toEqual([]);
  });

  it('exige colaborador, aplicação e itens', () => {
    expect(validarRequisicao({ ...cab, colaboradorNome: '', aplicacao: '' }, [])).toHaveLength(3);
  });

  it('transferência não pode ter destino igual à origem', () => {
    const erros = validarRequisicao({ ...cab, tipoMovimento: 'transferencia', depositoDestino: '2' }, [linha]);
    expect(erros).toEqual(['O depósito de destino precisa ser diferente do de saída.']);
  });
});

describe('ultimaAplicacaoPorColaborador', () => {
  it('guarda a mais recente de cada pessoa', () => {
    const m = ultimaAplicacaoPorColaborador([
      { colaborador_id: 'a', aplicacao: 'CUSTO LAVAGEM DE TRAMO', aplicacao_pep: 'TEN001101127004' },
      { colaborador_id: 'a', aplicacao: 'OUTRO', aplicacao_pep: 'TEN001101127005' },
      { colaborador_id: 'b', aplicacao: 'SEM PEP', aplicacao_pep: null },
      { colaborador_id: null, aplicacao: 'X', aplicacao_pep: 'TEN1' },
    ]);
    expect(m.get('a')).toEqual({ wbs: 'TEN001101127004', nome: 'CUSTO LAVAGEM DE TRAMO' });
    expect(m.size).toBe(1);
  });
});

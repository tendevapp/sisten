import { describe, expect, it } from 'vitest';
import {
  achatarGruposPep, adicionarGrupoPep, adicionarItemAoGrupo, adicionarLinha, agruparLinhasPorDeposito, agruparLinhasPorDestino, agruparLinhasPorPep,
  alertaDaLinha, atualizarQtdItemDoGrupo, buscarMateriais, buscarMateriaisEmDepositos, criarGrupoPep,
  definirDepositoDoGrupo, definirPepDoGrupo, erroDaLinha, indexarEstoquePorDeposito, reaplicarSaldos, removerGrupoPep,
  removerItemDoGrupo, ultimaAplicacaoPorColaborador, validarRequisicao, type LinhaBalcao,
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
  it('soma linhas do mesmo material e normaliza o código do depósito', () => {
    const idx = indexarEstoquePorDeposito(estoque, false);
    expect(idx.get('0002')?.get('1291134')?.saldo).toBe(3030);
    expect(idx.get('0105')?.get('1291134')?.saldo).toBe(60);
  });

  it('descarta material sem saldo quando incluirSemSaldo = false', () => {
    const idx = indexarEstoquePorDeposito(estoque, false);
    expect(idx.has('0004')).toBe(false);
  });

  it('mantém material sem saldo quando incluirSemSaldo = true (padrão)', () => {
    const idx = indexarEstoquePorDeposito(estoque, true);
    expect(idx.has('0004')).toBe(true);
    expect(idx.get('0004')?.get('9999999')?.saldo).toBe(0);
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

  it('mesmo material de outro depósito vira outra linha, com o próprio saldo', () => {
    const d2 = { ...item, deposito: '0002', saldo: 17 };
    const d4 = { ...item, deposito: '4', saldo: 86 };
    const l = adicionarLinha(adicionarLinha(adicionarLinha([], d2, 2), d4, 3), { ...d2, deposito: '2' }, 1);
    expect(l).toHaveLength(2);
    expect(l.map((x) => [x.deposito, x.quantidade, x.saldo])).toEqual([['0002', 3, 17], ['4', 3, 86]]);
  });

  it('erroDaLinha só bloqueia quantidade zero ou negativa, não bloqueia saldo insuficiente', () => {
    expect(erroDaLinha({ quantidade: 0 })).not.toBeNull();
    expect(erroDaLinha({ quantidade: -1 })).not.toBeNull();
    expect(erroDaLinha({ quantidade: 6 })).toBeNull();
    expect(erroDaLinha({ quantidade: 5 })).toBeNull();
  });

  it('alertaDaLinha sinaliza item sem saldo ou quantidade superior ao saldo', () => {
    expect(alertaDaLinha({ quantidade: 6, saldo: 5 })).toMatch(/saldo/);
    expect(alertaDaLinha({ quantidade: 1, saldo: 0 })).toMatch(/saldo/);
    expect(alertaDaLinha({ quantidade: 5, saldo: 5 })).toBeNull();
  });

  it('trocar o depósito zera o saldo de material que não existe lá', () => {
    const idx = indexarEstoquePorDeposito(estoque);
    const linhas: LinhaBalcao[] = [{ ...item, quantidade: 1 }];
    expect(reaplicarSaldos(linhas, idx.get('0105'))[0].saldo).toBe(0);
  });
});

describe('grupos de PEP', () => {
  const pepA = { wbs: 'TEN001201016503', nome: 'SUPRIMENTOS' };
  const pepB = { wbs: 'TEN001101127004', nome: 'LAVAGEM' };
  const mat1 = { material: '1001', descricao: 'ITEM 1', unidade: 'UN', saldo: 10 };
  const mat2 = { material: '1002', descricao: 'ITEM 2', unidade: 'UN', saldo: 5 };

  it('cria e adiciona grupos de PEP', () => {
    const g1 = criarGrupoPep(pepA);
    expect(g1.pep).toEqual(pepA);
    expect(g1.itens).toEqual([]);

    const grupos = adicionarGrupoPep([g1], pepB);
    expect(grupos).toHaveLength(2);
    expect(grupos[1].pep).toEqual(pepB);
  });

  it('adiciona e atualiza itens dentro do grupo correto', () => {
    let grupos = [criarGrupoPep(pepA), criarGrupoPep(pepB)];
    const idGrupoA = grupos[0].id;
    const idGrupoB = grupos[1].id;

    grupos = adicionarItemAoGrupo(grupos, idGrupoA, mat1, 3);
    grupos = adicionarItemAoGrupo(grupos, idGrupoB, mat2, 2);

    expect(grupos[0].itens).toHaveLength(1);
    expect(grupos[0].itens[0].material).toBe('1001');
    expect(grupos[0].itens[0].quantidade).toBe(3);

    expect(grupos[1].itens).toHaveLength(1);
    expect(grupos[1].itens[0].material).toBe('1002');
    expect(grupos[1].itens[0].quantidade).toBe(2);

    grupos = atualizarQtdItemDoGrupo(grupos, idGrupoA, 0, 7);
    expect(grupos[0].itens[0].quantidade).toBe(7);

    grupos = removerItemDoGrupo(grupos, idGrupoB, 0);
    expect(grupos[1].itens).toHaveLength(0);
  });

  it('achatarGruposPep injeta aplicacao_pep e aplicacao em cada item', () => {
    let grupos = [criarGrupoPep(pepA), criarGrupoPep(pepB)];
    grupos = adicionarItemAoGrupo(grupos, grupos[0].id, mat1, 2);
    grupos = adicionarItemAoGrupo(grupos, grupos[1].id, mat2, 4);

    const linhas = achatarGruposPep(grupos);
    expect(linhas).toHaveLength(2);
    expect(linhas[0].aplicacao_pep).toBe(pepA.wbs);
    expect(linhas[0].aplicacao).toBe(pepA.nome);
    expect(linhas[1].aplicacao_pep).toBe(pepB.wbs);
    expect(linhas[1].aplicacao).toBe(pepB.nome);
  });

  it('agruparLinhasPorPep remonta a estrutura a partir de linhas salvas', () => {
    const linhas: LinhaBalcao[] = [
      { material: '1001', descricao: 'ITEM 1', unidade: 'UN', saldo: 10, quantidade: 2, aplicacao_pep: pepA.wbs, aplicacao: pepA.nome },
      { material: '1002', descricao: 'ITEM 2', unidade: 'UN', saldo: 5, quantidade: 4, aplicacao_pep: pepB.wbs, aplicacao: pepB.nome },
      { material: '1003', descricao: 'ITEM 3', unidade: 'UN', saldo: 2, quantidade: 1, aplicacao_pep: pepA.wbs, aplicacao: pepA.nome },
    ];
    const grupos = agruparLinhasPorPep(linhas, [pepA, pepB], pepA);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].pep?.wbs).toBe(pepA.wbs);
    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[1].pep?.wbs).toBe(pepB.wbs);
    expect(grupos[1].itens).toHaveLength(1);
  });

  it('removerGrupoPep não remove o último grupo restante', () => {
    const g1 = criarGrupoPep(pepA);
    const grupos = removerGrupoPep([g1], g1.id);
    expect(grupos).toHaveLength(1);
  });

  it('definirPepDoGrupo altera o PEP e reflete nos itens', () => {
    let grupos = [criarGrupoPep(pepA)];
    grupos = adicionarItemAoGrupo(grupos, grupos[0].id, mat1, 1);
    grupos = definirPepDoGrupo(grupos, grupos[0].id, pepB);
    expect(grupos[0].pep).toEqual(pepB);
    expect(grupos[0].itens[0].aplicacao_pep).toBe(pepB.wbs);
  });

  it('definirDepositoDoGrupo altera o deposito e reflete nos itens', () => {
    let grupos = [criarGrupoPep('g1', null, '0002')];
    grupos = adicionarItemAoGrupo(grupos, grupos[0].id, mat1, 1, 'transferencia');
    grupos = definirDepositoDoGrupo(grupos, grupos[0].id, '0004');
    expect(grupos[0].deposito).toBe('0004');
    expect(grupos[0].itens[0].deposito).toBe('0004');
  });

  it('agruparLinhasPorDeposito agrupa por deposito de saida para transferencias', () => {
    const linhas: LinhaBalcao[] = [
      { material: '1001', descricao: 'ITEM 1', unidade: 'UN', saldo: 10, quantidade: 2, deposito: '0002' },
      { material: '1002', descricao: 'ITEM 2', unidade: 'UN', saldo: 5, quantidade: 4, deposito: '0004' },
      { material: '1003', descricao: 'ITEM 3', unidade: 'UN', saldo: 2, quantidade: 1, deposito: '0002' },
    ];
    const grupos = agruparLinhasPorDeposito(linhas, '0002');
    expect(grupos).toHaveLength(2);
    expect(grupos[0].deposito).toBe('0002');
    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[1].deposito).toBe('0004');
    expect(grupos[1].itens).toHaveLength(1);
    expect(grupos[0].pep).toBeNull();
  });

  it('agruparLinhasPorDestino agrupa por deposito de destino para transferencias', () => {
    const linhas: LinhaBalcao[] = [
      { material: '1001', descricao: 'ITEM 1', unidade: 'UN', saldo: 10, quantidade: 2, deposito: '0002', deposito_destino: '0005' },
      { material: '1002', descricao: 'ITEM 2', unidade: 'UN', saldo: 5, quantidade: 4, deposito: '0002', deposito_destino: '0006' },
      { material: '1003', descricao: 'ITEM 3', unidade: 'UN', saldo: 2, quantidade: 1, deposito: '0004', deposito_destino: '0005' },
    ];
    const grupos = agruparLinhasPorDestino(linhas, '0005');
    expect(grupos).toHaveLength(2);
    expect(grupos[0].deposito_destino).toBe('0005');
    expect(grupos[0].itens).toHaveLength(2);
    expect(grupos[1].deposito_destino).toBe('0006');
    expect(grupos[1].itens).toHaveLength(1);
    expect(grupos[0].pep).toBeNull();
  });
});

describe('validarRequisicao', () => {
  const cab = { tipoMovimento: 'saida' as const, depositoOrigem: '0002', depositoDestino: '', colaboradorNome: 'JOSE', aplicacao: 'PRODUÇÃO' };
  const linha: LinhaBalcao = { material: '1', descricao: 'X', unidade: 'UN', saldo: 10, quantidade: 2 };

  it('requisição completa passa', () => {
    expect(validarRequisicao(cab, [linha])).toEqual([]);
  });

  it('exige colaborador, aplicação e itens na saída', () => {
    expect(validarRequisicao({ ...cab, colaboradorNome: '', aplicacao: '' }, [])).toHaveLength(3);
  });

  it('transferência não exige PEP/aplicação', () => {
    const erros = validarRequisicao(
      { tipoMovimento: 'transferencia', depositoOrigem: '0002', depositoDestino: '0004', colaboradorNome: 'JOSE', aplicacao: '' },
      [linha],
    );
    expect(erros).toEqual([]);
  });

  it('transferência não pode ter destino igual à origem', () => {
    const erros = validarRequisicao({ ...cab, tipoMovimento: 'transferencia', depositoDestino: '2' }, [linha]);
    expect(erros).toEqual(['O depósito de destino precisa ser diferente do de saída.']);
  });

  it('transferência com itens de múltiplos depósitos valida que destino não conflita com nenhum', () => {
    const linhaDep2 = { ...linha, deposito: '0002' };
    const linhaDep4 = { ...linha, material: '2', deposito: '0004' };
    const erros = validarRequisicao(
      { tipoMovimento: 'transferencia', depositoOrigem: '0002', depositoDestino: '0004', colaboradorNome: 'JOSE', aplicacao: '' },
      [linhaDep2, linhaDep4],
    );
    expect(erros).toContain('O depósito de destino precisa ser diferente do de saída.');
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

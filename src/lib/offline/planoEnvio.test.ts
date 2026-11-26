import { describe, expect, it } from 'vitest';
import {
  LIMITE_TENTATIVAS_TRANSITORIAS, erroTransitorio, idsDaOperacao, pendenciasPorUsuario, precisaEsperar, servidorForaDoAr, virouRecusa,
  type OperacaoPlano,
} from './planoEnvio';

let seq = 0;
function op(over: Partial<OperacaoPlano>): OperacaoPlano {
  seq++;
  return {
    id: `op-${seq}`, usuarioId: 'u1', tipo: 'insert', caminho: '/rest/v1/tabela', corpo: null, estado: 'pendente', ...over,
  };
}
const texto = (dados: unknown) => ({ tipo: 'texto' as const, texto: JSON.stringify(dados) });

describe('erro do servidor que vale tentar de novo', () => {
  it('servidor fora, sobrecarregado ou sem resposta: tenta de novo sozinho', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504, 520, 522, 524]) expect(erroTransitorio(status)).toBe(true);
  });
  it('recusa de validação, permissão ou conflito: espera o usuário', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422]) expect(erroTransitorio(status)).toBe(false);
  });
});

describe('erro passageiro que não passa', () => {
  it('depois de muitas tentativas vira recusa, para alguém ver', () => {
    expect(virouRecusa(500, 3)).toBe(false);
    expect(virouRecusa(500, LIMITE_TENTATIVAS_TRANSITORIAS)).toBe(true);
    expect(virouRecusa(503, LIMITE_TENTATIVAS_TRANSITORIAS + 5)).toBe(true);
  });
  it('recusa comum já é recusa na primeira', () => {
    expect(virouRecusa(400, 1)).toBe(true);
  });
});

describe('gravação na hora com o servidor fora do ar', () => {
  it('gateway sem resposta do servidor: a gravação vai para a fila', () => {
    for (const status of [502, 503, 504, 520, 521, 522, 523, 524]) expect(servidorForaDoAr(status)).toBe(true);
  });
  it('erro que o servidor de fato respondeu volta para a tela', () => {
    for (const status of [400, 409, 500, 401]) expect(servidorForaDoAr(status)).toBe(false);
  });
});

describe('ids que uma operação cria ou altera', () => {
  it('inserção: ids das linhas', () => {
    const o = op({ tipo: 'insert', corpo: texto([{ id: 'a1', nome: 'x' }, { id: 'a2' }]) });
    expect(idsDaOperacao(o)).toEqual(['a1', 'a2']);
  });
  it('alteração e exclusão: o id do filtro', () => {
    expect(idsDaOperacao(op({ tipo: 'update', caminho: '/rest/v1/tabela?id=eq.b7&select=*' }))).toEqual(['b7']);
    expect(idsDaOperacao(op({ tipo: 'delete', caminho: '/rest/v1/tabela?id=eq.c3' }))).toEqual(['c3']);
  });
  it('RPC que cria registro: o id provisório', () => {
    expect(idsDaOperacao(op({ tipo: 'rpc', idProvisorio: 'prov-9' }))).toEqual(['prov-9']);
  });
  it('foto: o caminho do arquivo no bucket', () => {
    const o = op({ tipo: 'upload', caminho: '/storage/v1/object/request-attachments/almox-catalogo/material-123-1.jpg' });
    expect(idsDaOperacao(o)).toEqual(['almox-catalogo/material-123-1.jpg']);
  });
});

describe('depois de uma recusa, o que espera', () => {
  it('operação que aponta para o registro recusado espera', () => {
    const filho = op({ tipo: 'insert', corpo: texto({ id: 'f1', relatorio_id: 'r1' }) });
    expect(precisaEsperar(filho, new Set(['r1']))).toBe(true);
  });
  it('a saída de um registro recusado espera (filtro pelo id)', () => {
    const saida = op({ tipo: 'update', caminho: '/rest/v1/port_registro_transportes?id=eq.r1' });
    expect(precisaEsperar(saida, new Set(['r1']))).toBe(true);
  });
  it('registro que grava a foto recusada espera', () => {
    const linha = op({ tipo: 'update', caminho: '/rest/v1/alm_catalogo_itens?id=eq.i1', corpo: texto({ imagem_path: 'almox-catalogo/m-1.jpg' }) });
    expect(precisaEsperar(linha, new Set(['almox-catalogo/m-1.jpg']))).toBe(true);
  });
  it('gravação sem relação com a recusa segue', () => {
    const outra = op({ tipo: 'insert', corpo: texto({ id: 'z9', placa: 'ABC1D23' }) });
    expect(precisaEsperar(outra, new Set(['r1']))).toBe(false);
  });
  it('nada apaga depois de uma recusa: exclusão e remoção de arquivo esperam', () => {
    const recusas = new Set(['qualquer']);
    expect(precisaEsperar(op({ tipo: 'remover-arquivo', caminho: '/storage/v1/object/request-attachments/almox-catalogo/antiga.jpg' }), recusas)).toBe(true);
    expect(precisaEsperar(op({ tipo: 'delete', caminho: '/rest/v1/alm_catalogo_item_fotos?id=eq.x' }), recusas)).toBe(true);
  });
  it('sem recusa nada espera', () => {
    expect(precisaEsperar(op({ tipo: 'delete', caminho: '/rest/v1/t?id=eq.x' }), new Set())).toBe(false);
  });
});

describe('pendências do aparelho por usuário', () => {
  it('conta por usuário, com o nome guardado na operação', () => {
    const ops = [
      op({ usuarioId: 'u1', usuarioNome: 'ANA' }),
      op({ usuarioId: 'u1', usuarioNome: 'ANA', estado: 'erro' }),
      op({ usuarioId: 'u2' }),
    ];
    expect(pendenciasPorUsuario(ops)).toEqual([
      { usuarioId: 'u1', nome: 'ANA', total: 2, comErro: 1 },
      { usuarioId: 'u2', nome: null, total: 1, comErro: 0 },
    ]);
  });
});

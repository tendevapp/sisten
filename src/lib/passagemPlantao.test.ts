import { describe, it, expect } from 'vitest';
import { entregadoresDoAnterior, itensIniciaisDoPlantao, podeEncerrarPlantao } from './passagemPlantao';
import type { PortMaterialSeguranca, PortPassagemPlantao } from '../types';

const materiais = [
  { id: 'm1', nome: 'RÁDIO HT', quantidade_padrao: 3, unidade: 'UN', categoria: 'COMUNICACAO' },
  { id: 'm2', nome: 'LANTERNA', quantidade_padrao: 2, unidade: null, categoria: 'ILUMINACAO' },
  { id: 'm3', nome: 'CHAVE PORTÃO', quantidade_padrao: 1, unidade: 'UN', categoria: 'ACESSO' },
] as unknown as PortMaterialSeguranca[];

const anterior = {
  vigilante_portaria: 'SIMONE PEDREIRA DA SILVA',
  vigilante_ronda01: 'EDUARDO INACIO FERREIRA',
  vigilante_ronda02: 'RICARDO ANDRE DOS SANTOS SOUZA',
  itens_conferidos: [
    { material_id: 'm1', nome: 'RÁDIO HT', quantidade_esperada: 3, conferido: false, quantidade_conferida: 2, observacao: 'UM RÁDIO EM MANUTENÇÃO' },
    { material_id: 'm2', nome: 'LANTERNA', quantidade_esperada: 2, conferido: true, quantidade_conferida: 2, observacao: 'OK' },
  ],
} as unknown as PortPassagemPlantao;

describe('entregadoresDoAnterior', () => {
  it('quem entrega é a Portaria e a Ronda 01 do plantão anterior', () => {
    expect(entregadoresDoAnterior(anterior)).toEqual(['SIMONE PEDREIRA DA SILVA', 'EDUARDO INACIO FERREIRA']);
  });

  it('sem Ronda 01, usa a Ronda 02', () => {
    expect(entregadoresDoAnterior({ ...anterior, vigilante_ronda01: null })).toEqual(['SIMONE PEDREIRA DA SILVA', 'RICARDO ANDRE DOS SANTOS SOUZA']);
  });

  it('sem anterior, fica em branco', () => {
    expect(entregadoresDoAnterior(null)).toEqual(['', '']);
  });
});

describe('itensIniciaisDoPlantao', () => {
  it('sem anterior: quantidade padrão, sem observação, tudo desmarcado', () => {
    const itens = itensIniciaisDoPlantao(materiais);
    expect(itens.map((i) => [i.material_id, i.quantidade_conferida, i.observacao, i.conferido])).toEqual([
      ['m1', 3, '', false], ['m2', 2, '', false], ['m3', 1, '', false],
    ]);
    expect(itens[1].unidade).toBe('UN');
  });

  it('com anterior: herda quantidade e mantém só a pendência do que não foi conferido', () => {
    const itens = itensIniciaisDoPlantao(materiais, anterior);
    expect(itens[0]).toMatchObject({ quantidade_conferida: 2, observacao: 'UM RÁDIO EM MANUTENÇÃO', conferido: false });
    // Conferido no anterior: a observação ("OK") não vira pendência.
    expect(itens[1]).toMatchObject({ quantidade_conferida: 2, observacao: '', conferido: false });
    // Material novo, que o anterior não tinha: padrão.
    expect(itens[2]).toMatchObject({ quantidade_conferida: 1, observacao: '', conferido: false });
  });
});

describe('podeEncerrarPlantao', () => {
  it('libera plantão em aberto, mesmo sem autor gravado', () => {
    expect(podeEncerrarPlantao({ status: 'EM_ANDAMENTO', excluido_em: null } as PortPassagemPlantao)).toBe(true);
  });
  it('não oferece para concluído, excluído ou ausente', () => {
    expect(podeEncerrarPlantao({ status: 'CONCLUIDO', excluido_em: null } as PortPassagemPlantao)).toBe(false);
    expect(podeEncerrarPlantao({ status: 'EM_ANDAMENTO', excluido_em: '2026-11-10T10:00:00Z' } as PortPassagemPlantao)).toBe(false);
    expect(podeEncerrarPlantao(null)).toBe(false);
  });
});

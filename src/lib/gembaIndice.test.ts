import { describe, expect, it } from 'vitest';
import type { EstoqueItem } from '../types';
import { buscarItensGemba, itemTemLugar, montarIndiceGemba } from './gembaIndice';

const linha = (material: string, deposito: string, quantidade: number, posicao_estoque: string, txt = ''): EstoqueItem => ({
  id: Math.random(), material, deposito, quantidade, posicao_estoque, txt_breve_material: txt, umb: 'UN',
});

const estoque: EstoqueItem[] = [
  linha('1174180', '0004', 5, '104.130218', 'ESTANHO SOLDA 60/40 FIO 500G'),
  linha('2000001', '0004', 3, '104.020100', 'LUVA VAQUETA'),
  linha('2000001', '0002', 7, '102.010200', 'LUVA VAQUETA'),
  linha('3000001', '0003', 12, '', 'CHAPA CLIENTE'),
  linha('4000001', '0004', 2, '104.020100', 'PARAFUSO M10'),
];

describe('gembaIndice - montarIndiceGemba', () => {
  it('um local por posição, com depósito e saldo', () => {
    const indice = montarIndiceGemba(estoque, new Map(), []);
    const luva = indice.porCodigo.get('2000001')!;
    expect(luva.saldoTotal).toBe(10);
    expect(luva.locais.map(l => [l.posicao, l.deposito, l.saldo])).toEqual([
      ['102.010200', '0002', 7],
      ['104.020100', '0004', 3],
    ]);
    expect(luva.locais.every(l => l.localizacao && !l.localizacao.aproximado)).toBe(true);
  });

  it('a posição digitada no cadastro vale mais que a da ZL0024', () => {
    const indice = montarIndiceGemba(estoque, new Map(), [
      { codigo_sap: '1174180', descricao: 'ESTANHO', umb: 'UN', posicao_estoque: '104.250301', imagem_path: 'x.jpg' },
    ]);
    const item = indice.porCodigo.get('1174180')!;
    expect(item.locais.map(l => [l.posicao, l.origem, l.saldo])).toEqual([['104.250301', 'cadastro', null]]);
    expect(item.imagemPath).toBe('x.jpg');
  });

  it('o material que zerou mantém a última posição guardada', () => {
    const indice = montarIndiceGemba(estoque, new Map([['9000001', ['104.330100']]]), []);
    const item = indice.porCodigo.get('9000001')!;
    expect(item.saldoTotal).toBe(0);
    expect(item.locais[0]).toMatchObject({ posicao: '104.330100', origem: 'ultima', deposito: '0004' });
  });

  it('saldo sem posição acende o depósito', () => {
    const item = montarIndiceGemba(estoque, new Map(), []).porCodigo.get('3000001')!;
    expect(item.locais).toHaveLength(1);
    expect(item.locais[0]).toMatchObject({ origem: 'deposito', deposito: '0003', saldo: 12 });
    expect(item.locais[0].localizacao?.estruturas).toEqual(['rua_03']);
    expect(itemTemLugar(item)).toBe(true);
  });

  it('o material que zerou vem marcado como zerado', () => {
    const indice = montarIndiceGemba(estoque, new Map([['9000001', ['104.330100']]]), []);
    expect(indice.porCodigo.get('9000001')!.zerado).toBe(true);
    expect(indice.porCodigo.get('1174180')!.zerado).toBe(false);
  });

  it('peça da BOM fora da ZL0024 entra pelo part number, com o saldo do Projetos', () => {
    const indice = montarIndiceGemba(estoque, new Map(), [], [
      { partNumber: '60.10.92715', codSap: null, descricao: 'Placa de conexão', umb: 'each', posicao: '103.010200', saldo: 46, imagemPath: 'almox-bom/p.jpg' },
      { partNumber: '60.10.98148', codSap: null, descricao: 'Suporte', umb: 'each', posicao: '105100200', saldo: 0, imagemPath: null },
    ]);
    const placa = indice.porCodigo.get('60.10.92715')!;
    expect(placa).toMatchObject({ partNumber: '60.10.92715', saldoTotal: 46, zerado: false, imagemPath: 'almox-bom/p.jpg', depositos: ['0003'] });
    expect(placa.locais.map(l => [l.posicao, l.origem, l.saldo])).toEqual([['103.010200', 'bom', 46]]);
    expect(placa.locais[0].localizacao?.trilha).toEqual(['Rua 03', 'Bloco 01', 'Andar 02']);
    expect(indice.porBloco.get('0003.01')!.map(x => x.item.codigo)).toEqual(['60.10.92715']);
    const suporte = indice.porCodigo.get('60.10.98148')!;
    expect(suporte.zerado).toBe(true);
    expect(suporte.locais[0].localizacao?.trilha).toEqual(['Rua 05', 'Bloco 10', 'Andar 02']);
  });

  it('peça da BOM com código SAP da ZL0024 junta com o material e a posição dela vale', () => {
    const indice = montarIndiceGemba(estoque, new Map(), [], [
      { partNumber: '10482373', codSap: '0003000001', descricao: 'Base', umb: 'each', posicao: '103.020200', saldo: 23, imagemPath: null },
    ]);
    const item = indice.porCodigo.get('3000001')!;
    expect(indice.porCodigo.has('10482373')).toBe(false);
    expect(item).toMatchObject({ partNumber: '10482373', saldoTotal: 12 });
    // Saldo da ZL0024 manda; a posição é a do cadastro BOM, e o depósito sem endereço não aparece mais.
    expect(item.locais.map(l => [l.posicao, l.origem])).toEqual([['103.020200', 'bom']]);
  });

  it('busca pelo part number, com ou sem pontos', () => {
    const indice = montarIndiceGemba([], new Map(), [], [
      { partNumber: '60.10.92715', codSap: null, descricao: 'Placa de conexão', umb: 'each', posicao: '103.010200', saldo: 46, imagemPath: null },
    ]);
    expect(buscarItensGemba(indice, '60.10.927').map(i => i.codigo)).toEqual(['60.10.92715']);
    expect(buscarItensGemba(indice, '601092715').map(i => i.codigo)).toEqual(['60.10.92715']);
  });

  it('porBloco lista o que tem em cada bloco', () => {
    const indice = montarIndiceGemba(estoque, new Map(), []);
    expect(indice.porBloco.get('0004.02')!.map(x => x.item.codigo).sort()).toEqual(['2000001', '4000001']);
    expect(indice.porBloco.get('0004.13')!.map(x => x.item.codigo)).toEqual(['1174180']);
  });

  it('item só com posição fora do galpão não tem lugar', () => {
    const indice = montarIndiceGemba([linha('5000001', '0090', 1, 'DEPVIRTUAL', 'VIRTUAL')], new Map(), []);
    expect(itemTemLugar(indice.porCodigo.get('5000001')!)).toBe(false);
  });
});

describe('gembaIndice - buscarItensGemba', () => {
  const indice = montarIndiceGemba(estoque, new Map(), []);

  it('por código exato e por começo', () => {
    expect(buscarItensGemba(indice, '1174180').map(i => i.codigo)).toEqual(['1174180']);
    expect(buscarItensGemba(indice, '20000').map(i => i.codigo)).toEqual(['2000001']);
  });

  it('por palavras da descrição, sem acento nem caixa', () => {
    expect(buscarItensGemba(indice, 'solda estanho').map(i => i.codigo)).toEqual(['1174180']);
    expect(buscarItensGemba(indice, 'luva').map(i => i.codigo)).toEqual(['2000001']);
  });

  it('por começo de posição', () => {
    expect(buscarItensGemba(indice, '104.02').map(i => i.codigo).sort()).toEqual(['2000001', '4000001']);
    expect(buscarItensGemba(indice, '104.130218').map(i => i.codigo)).toEqual(['1174180']);
  });

  it('termo vazio não lista nada', () => {
    expect(buscarItensGemba(indice, '  ')).toEqual([]);
  });
});

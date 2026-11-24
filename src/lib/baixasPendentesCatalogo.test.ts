import { describe, expect, it } from 'vitest';
import {
  baixasPendentesPorMaterial, codigosDistintos, detalheBaixaPendente, resumoBaixaPendente, rotuloMovimento,
  type MovimentoSemBaixa,
} from './baixasPendentesCatalogo';

const mov = (p: Partial<MovimentoSemBaixa>): MovimentoSemBaixa => ({
  material: '601045478', origem: 'balcao', codigo: 'RQB-241126-01', data: '2026-11-24', tipo_movimento: 'saida',
  deposito: '0002', deposito_destino: null, quantidade: 1, unidade: 'UN', aguardando_confirmacao: false, ...p,
});

describe('baixasPendentesPorMaterial', () => {
  it('agrupa pelo código normalizado e soma as quantidades', () => {
    const mapa = baixasPendentesPorMaterial([
      mov({ material: '000601045478', quantidade: 2, codigo: 'RQB-241126-02' }),
      mov({ material: '601045478', quantidade: 1.5, codigo: 'RQB-231126-01', data: '2026-11-23' }),
      mov({ material: '402000192', quantidade: 62, origem: 'extraordinaria', codigo: 'SEM-291026-03' }),
    ]);
    expect(mapa.size).toBe(2);
    const b = mapa.get('601045478')!;
    expect(b.quantidade).toBe(3.5);
    expect(b.movimentos.map((m) => m.codigo)).toEqual(['RQB-231126-01', 'RQB-241126-02']);
  });

  it('ignora linha sem material', () => {
    expect(baixasPendentesPorMaterial([mov({ material: '' })]).size).toBe(0);
  });
});

describe('textos da tag', () => {
  it('conta documentos distintos, não linhas (mesmo material em dois depósitos)', () => {
    const b = baixasPendentesPorMaterial([
      mov({ deposito: '0002', quantidade: 1 }),
      mov({ deposito: '0004', quantidade: 2 }),
    ]).get('601045478')!;
    expect(codigosDistintos(b)).toEqual(['RQB-241126-01']);
    expect(resumoBaixaPendente(b)).toBe('1 requisição · 3 UN');
  });

  it('descreve transferência, extraordinária e confirmação pendente', () => {
    expect(rotuloMovimento(mov({ tipo_movimento: 'transferencia', deposito_destino: '0105' }))).toBe('Transferência 0002→0105');
    expect(rotuloMovimento(mov({ origem: 'extraordinaria', deposito: null }))).toBe('Extraordinária (sem RQB)');
    const b = baixasPendentesPorMaterial([mov({ aguardando_confirmacao: true })]).get('601045478')!;
    expect(detalheBaixaPendente(b)).toContain('RQB-241126-01 (24/11/26) · Saída do 0002 · 1 UN · aguardando confirmação');
  });
});

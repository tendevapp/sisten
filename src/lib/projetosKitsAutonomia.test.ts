import { describe, expect, it } from 'vitest';
import {
  classificarItemSubkit,
  obterComposicaoSubkit,
  calcularMatrizAutonomia,
  SUBKITS_POR_TRAMO,
} from './projetosKitsAutonomia';
import { normalizarPartNumber } from './projetos';
import { montarArvore, type BomLinha } from './projetosBom';

describe('classificarItemSubkit', () => {
  it('classifica Escada de acesso para escada_acesso', () => {
    expect(classificarItemSubkit({ grupoNorm: 'ESCADA DE ACESSO', fornecedor: 'Qindao' })).toBe('escada_acesso');
    expect(classificarItemSubkit({ grupo: 'Escada de acesso', fornecedor: 'Qindao' })).toBe('escada_acesso');
  });

  it('classifica Forte Fixadores para fixadores', () => {
    expect(classificarItemSubkit({ grupoNorm: 'PLATAFORMA SUPERIOR', fornecedor: 'Forte Fixadores' })).toBe('fixadores');
    expect(classificarItemSubkit({ grupoNorm: 'ESCADA', fornecedor: 'Forte Fixadores' })).toBe('fixadores');
    expect(classificarItemSubkit({ grupoNorm: 'ELETRICO', fornecedor: 'Forte Fixadores' })).toBe('fixadores');
  });

  it('classifica Avanti e escadas sem ser fixador para escada_avanti', () => {
    expect(classificarItemSubkit({ grupoNorm: 'ESCADA', fornecedor: 'Avanti' })).toBe('escada_avanti');
    expect(classificarItemSubkit({ grupoNorm: 'ESCADA', fornecedor: 'Atlanta' })).toBe('escada_avanti');
  });

  it('classifica grupos PLATAFORMA para plataforma', () => {
    expect(classificarItemSubkit({ grupoNorm: 'PLATAFORMA SUPERIOR', fornecedor: 'Atlanta' })).toBe('plataforma');
    expect(classificarItemSubkit({ grupoNorm: 'PLATAFORMA MEDIA', fornecedor: 'Atlanta' })).toBe('plataforma');
    expect(classificarItemSubkit({ grupoNorm: 'PLATAFORMA INFERIOR', fornecedor: 'Qindao' })).toBe('plataforma');
  });

  it('retorna null para itens estruturais ou não pertencentes aos kits internos', () => {
    expect(classificarItemSubkit({ grupoNorm: 'ESTRUTURAL', fornecedor: 'Gerdau' })).toBeNull();
    expect(classificarItemSubkit({ grupoNorm: 'LONA', fornecedor: 'Qindao' })).toBeNull();
  });
});

describe('obterComposicaoSubkit', () => {
  const linhasBom: BomLinha[] = [
    {
      id: 1,
      level: 1,
      section: 'S5',
      group: 'PLATAFORMA SUPERIOR',
      part_number: 'PARAFUSO-M16',
      description: 'Bolt ISO 4017-M16X50-8.8',
      quantity: 10,
      source: 'Forte Fixadores',
    },
    {
      id: 2,
      level: 1,
      section: 'S5',
      group: 'PLATAFORMA SUPERIOR',
      part_number: 'CHAPA-PISO-01',
      description: 'Platform sheet-01',
      quantity: 2,
      source: 'Atlanta',
    },
    {
      id: 3,
      level: 1,
      section: 'S5',
      group: 'ESCADA',
      part_number: 'ESCADA-AVANTI-L29',
      description: 'Ladder L=29740',
      quantity: 1,
      source: 'Avanti',
    },
  ];

  const arvore = montarArvore(linhasBom);

  it('extrai a composição e calcula kits cobertos e gargalo', () => {
    const saldos = new Map<string, number>([
      [normalizarPartNumber('CHAPA-PISO-01'), 8], // 8 / 2 = 4 kits
      [normalizarPartNumber('PARAFUSO-M16'), 50], // 50 / 10 = 5 kits
      [normalizarPartNumber('ESCADA-AVANTI-L29'), 10], // 10 / 1 = 10 kits
    ]);

    const compPlataforma = obterComposicaoSubkit(arvore, 'T5', 'plataforma', saldos);
    expect(compPlataforma.totalItens).toBe(1);
    expect(compPlataforma.autonomiaMaxima).toBe(4);
    expect(compPlataforma.gargalo?.partNumber).toBe('CHAPA-PISO-01');

    const compFixadores = obterComposicaoSubkit(arvore, 'T5', 'fixadores', saldos);
    expect(compFixadores.totalItens).toBe(1);
    expect(compFixadores.autonomiaMaxima).toBe(5);

    const compEscada = obterComposicaoSubkit(arvore, 'T5', 'escada_avanti', saldos);
    expect(compEscada.totalItens).toBe(1);
    expect(compEscada.autonomiaMaxima).toBe(10);
  });
});

describe('calcularMatrizAutonomia', () => {
  const linhasBom: BomLinha[] = [
    {
      id: 1,
      level: 1,
      section: 'S1',
      group: 'Escada de acesso',
      part_number: 'DEGRAU-01',
      quantity: 5,
      source: 'Qindao',
    },
  ];
  const arvore = montarArvore(linhasBom);

  it('distribui estoque sequencialmente e respeita registros gravados', () => {
    const saldos = new Map<string, number>([
      [normalizarPartNumber('DEGRAU-01'), 10], // 10 / 5 = 2 kits
    ]);

    const resultado = calcularMatrizAutonomia({
      arvore,
      saldos,
      torresTotais: 4,
      registrosBanco: [
        {
          torre_numero: 1,
          tramo: 'T1',
          subkit: 'escada_acesso',
          status: 4, // Expedido
          serie: '3143',
        },
      ],
      planejamentosBanco: [
        { torre_numero: 1, semana: 'W36' },
      ],
    });

    expect(resultado.semanasPorTorre.get(1)).toBe('W36');

    // Torre 1: Gravado 4 (Expedido)
    const c1 = resultado.celulas.get('1::T1::escada_acesso');
    expect(c1?.status).toBe(4);
    expect(c1?.serie).toBe('3143');

    // Torre 2: Automático via estoque (saldo cobre 2 torres)
    const c2 = resultado.celulas.get('2::T1::escada_acesso');
    expect(c2?.status).toBe(1); // Estoque

    // Torre 3: Automático via estoque (saldo cobre 2 torres)
    const c3 = resultado.celulas.get('3::T1::escada_acesso');
    expect(c3?.status).toBe(1); // Estoque

    // Torre 4: Estoque acabou -> Não atende
    const c4 = resultado.celulas.get('4::T1::escada_acesso');
    expect(c4?.status).toBe(0); // Não atende
  });
});

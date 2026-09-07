import { describe, expect, it } from 'vitest';
import {
  classificarMudanca, descreverAlteracoesCompra, dividirMudancas, resumoAlteracoes,
  type ItemParaDiff,
} from './solicitacoesDiff';
import type { Request } from '../types';

function req(over: Partial<Request> = {}): Request {
  return {
    id: 'r1',
    number: '2001004',
    type: 'compra',
    status: 'aprovada',
    criticality: 2,
    solicitante_id: 'u1',
    solicitante_name: 'Jamille Souza',
    solicitante_sector_id: 'set-1',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    tipo_compra: 'Direta',
    justificativa: 'Compra material escritório',
    ...over,
  } as Request;
}

function item(over: Partial<ItemParaDiff> = {}): ItemParaDiff {
  return {
    id: 'i1',
    description: 'Caneta esferográfica azul',
    sap_code: '1456972',
    quantity: 112,
    unit: 'UN',
    ...over,
  };
}

describe('descreverAlteracoesCompra', () => {
  it('sem mudança nenhuma, não acusa nada', () => {
    expect(descreverAlteracoesCompra(req(), [item()], req(), [item()])).toEqual([]);
  });

  it('detecta aumento e redução de quantidade', () => {
    const [msgAumento] = descreverAlteracoesCompra(
      req(), [item({ quantity: 100 })], req(), [item({ quantity: 150 })],
    );
    expect(msgAumento).toBe('Quantidade de "Caneta esferográfica azul" aumentada de 100 para 150 UN');

    const [msgReducao] = descreverAlteracoesCompra(
      req(), [item({ quantity: 100 })], req(), [item({ quantity: 40 })],
    );
    expect(msgReducao).toBe('Quantidade de "Caneta esferográfica azul" reduzida de 100 para 40 UN');
  });

  it('detecta item incluído (sem id, ou id novo)', () => {
    const mudancas = descreverAlteracoesCompra(
      req(), [item()], req(), [item(), item({ id: 'i2', description: 'Grampeador', quantity: 5, unit: 'UN' })],
    );
    expect(mudancas).toEqual(['Item incluído: Grampeador (5 UN)']);
  });

  it('detecta item removido', () => {
    const mudancas = descreverAlteracoesCompra(
      req(),
      [item(), item({ id: 'i2', description: 'Grampeador', quantity: 5, unit: 'UN' })],
      req(),
      [item()],
    );
    expect(mudancas).toEqual(['Item removido: Grampeador (5 UN)']);
  });

  it('detecta descrição, código SAP, observação e marca alterados', () => {
    const antigo = item({ observation: undefined, brand: undefined });
    const novo = item({
      description: 'Caneta esferográfica preta',
      sap_code: '9999999',
      observation: 'Urgente',
      brand: 'Bic',
    });
    const mudancas = descreverAlteracoesCompra(req(), [antigo], req(), [novo]);
    expect(mudancas).toContain('Descrição alterada de "Caneta esferográfica azul" para "Caneta esferográfica preta"');
    expect(mudancas).toContain('Código SAP de "Caneta esferográfica preta" definido para 9999999');
    expect(mudancas).toContain('Observação de "Caneta esferográfica preta" alterada');
    expect(mudancas).toContain('Marca de "Caneta esferográfica preta" alterada');
  });

  it('código SAP removido sai com frase própria', () => {
    const mudancas = descreverAlteracoesCompra(
      req(), [item({ sap_code: '1456972' })], req(), [item({ sap_code: undefined })],
    );
    expect(mudancas).toEqual(['Código SAP de "Caneta esferográfica azul" removido']);
  });

  it('detecta criticidade, tipo de compra, data de necessidade e justificativa', () => {
    const mudancas = descreverAlteracoesCompra(
      req({ criticality: 2, tipo_compra: 'Direta', data_necessidade: undefined, justificativa: 'Antiga' }),
      [item()],
      req({ criticality: 5, tipo_compra: 'Estoque', data_necessidade: '2026-09-20', justificativa: 'Nova' }),
      [item()],
    );
    expect(mudancas).toContain('Criticidade alterada de 2 - Moderada para 5 - Impeditiva');
    expect(mudancas).toContain('Tipo de compra alterado de Direta para Estoque');
    expect(mudancas).toContain('Data de necessidade definida para 20/09/2026');
    expect(mudancas).toContain('Justificativa alterada');
  });

  it('data de necessidade removida sai com frase própria', () => {
    const mudancas = descreverAlteracoesCompra(
      req({ data_necessidade: '2026-09-20' }), [item()], req({ data_necessidade: undefined }), [item()],
    );
    expect(mudancas).toEqual(['Data de necessidade removida']);
  });
});

describe('resumoAlteracoes', () => {
  it('junta as frases com ponto e vírgula', () => {
    expect(resumoAlteracoes(['A', 'B'])).toBe('A; B');
  });

  it('lista vazia vira frase neutra, nunca string vazia', () => {
    expect(resumoAlteracoes([])).toBe('sem alterações identificadas nos campos monitorados');
  });
});

describe('classificarMudanca', () => {
  it('reconhece cada tipo pelo prefixo fixo da frase', () => {
    expect(classificarMudanca('Item incluído: Grampeador (5 UN)')).toBe('item_incluido');
    expect(classificarMudanca('Item removido: Grampeador (5 UN)')).toBe('item_removido');
    expect(classificarMudanca('Quantidade de "X" aumentada de 1 para 2 UN')).toBe('quantidade_aumentada');
    expect(classificarMudanca('Quantidade de "X" reduzida de 2 para 1 UN')).toBe('quantidade_reduzida');
    expect(classificarMudanca('Código SAP de "X" removido')).toBe('codigo_sap');
    expect(classificarMudanca('Descrição alterada de "X" para "Y"')).toBe('descricao');
    expect(classificarMudanca('Observação de "X" alterada')).toBe('observacao');
    expect(classificarMudanca('Marca de "X" alterada')).toBe('marca');
    expect(classificarMudanca('Criticidade alterada de 2 - Moderada para 5 - Impeditiva')).toBe('criticidade');
    expect(classificarMudanca('Tipo de compra alterado de Direta para Estoque')).toBe('tipo_compra');
    expect(classificarMudanca('Data de necessidade definida para 20/09/2026')).toBe('data_necessidade');
    expect(classificarMudanca('Justificativa alterada')).toBe('justificativa');
  });

  it('frase desconhecida vira "outro", nunca lança', () => {
    expect(classificarMudanca('Algo que este módulo não sabe descrever')).toBe('outro');
  });
});

describe('dividirMudancas', () => {
  it('quebra o motivo em uma frase por mudança', () => {
    expect(dividirMudancas('Item incluído: Grampeador (5 UN); Justificativa alterada')).toEqual([
      'Item incluído: Grampeador (5 UN)',
      'Justificativa alterada',
    ]);
  });

  it('tira o prefixo do formato antigo, com nome e dois pontos', () => {
    expect(dividirMudancas('Alterada por ANDRÉ MURITIBA ARAÚJO: Justificativa alterada')).toEqual([
      'Justificativa alterada',
    ]);
  });

  it('motivo vazio ou ausente vira lista vazia', () => {
    expect(dividirMudancas(undefined)).toEqual([]);
    expect(dividirMudancas(null)).toEqual([]);
    expect(dividirMudancas('')).toEqual([]);
  });
});

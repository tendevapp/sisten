import { describe, expect, it } from 'vitest';
import {
  ocorrenciasPorRiMl, recompraPendenteMl, rotuloOcorrenciaMl, validarOcorrenciaMl, valorOcorrenciaMl,
  type OcorrenciaMl,
} from './ocorrenciasMl';

const oc = (over: Partial<OcorrenciaMl> = {}): OcorrenciaMl => ({
  id: '1', ri: '110034071100100', numero_compra: '2000015901343333', tipo: 'reembolso',
  percentual: null, valor: null, motivo: null, recomprar: false,
  recompra_feita_em: null, recompra_feita_por_nome: null, recompra_numero_compra: null,
  criado_por_id: 'u', criado_por_nome: 'Comprador', created_at: '2026-11-09T10:00:00Z',
  excluido_em: null, excluido_por_nome: null,
  ...over,
});

describe('rotuloOcorrenciaMl', () => {
  it('reembolso em % ou em R$', () => {
    expect(rotuloOcorrenciaMl(oc({ percentual: 30 }))).toBe('Reembolso 30%');
    expect(rotuloOcorrenciaMl(oc({ valor: 12 }))).toMatch(/^Reembolso R\$\s12,00$/);
  });
  it('devolução que pede recompra, antes e depois de recomprar', () => {
    expect(rotuloOcorrenciaMl(oc({ tipo: 'devolucao', recomprar: true }))).toBe('Devolução · recomprar');
    expect(rotuloOcorrenciaMl(oc({ tipo: 'devolucao', recomprar: true, recompra_feita_em: '2026-11-10' }))).toBe('Devolução · recomprado');
  });
});

describe('valorOcorrenciaMl', () => {
  it('valor informado vale; % usa o valor do item; sem base, nulo', () => {
    expect(valorOcorrenciaMl(oc({ valor: 50 }), 1000)).toBe(50);
    expect(valorOcorrenciaMl(oc({ percentual: 30 }), 418.95)).toBe(125.69);
    expect(valorOcorrenciaMl(oc({ percentual: 30 }), null)).toBeNull();
  });
});

describe('recompraPendenteMl', () => {
  it('só devolução com recompra ainda não feita e não excluída', () => {
    expect(recompraPendenteMl(oc({ tipo: 'devolucao', recomprar: true }))).toBe(true);
    expect(recompraPendenteMl(oc({ tipo: 'devolucao', recomprar: true, recompra_feita_em: '2026-11-10' }))).toBe(false);
    expect(recompraPendenteMl(oc({ tipo: 'devolucao', recomprar: true, excluido_em: '2026-11-10' }))).toBe(false);
    expect(recompraPendenteMl(oc({ tipo: 'devolucao', recomprar: false }))).toBe(false);
  });
});

describe('ocorrenciasPorRiMl', () => {
  it('agrupa por item, sem os excluídos, do mais antigo ao mais novo', () => {
    const mapa = ocorrenciasPorRiMl([
      oc({ id: 'b', created_at: '2026-11-09T12:00:00Z' }),
      oc({ id: 'a', created_at: '2026-11-09T08:00:00Z' }),
      oc({ id: 'x', excluido_em: '2026-11-09T13:00:00Z' }),
      oc({ id: 'c', ri: 'outro' }),
    ]);
    expect(mapa.get('110034071100100')?.map(o => o.id)).toEqual(['a', 'b']);
    expect(mapa.get('outro')).toHaveLength(1);
  });
});

describe('validarOcorrenciaMl', () => {
  const base = { tipo: 'reembolso' as const, modo: 'percentual' as const, quantia: '30', motivo: ' estante amassada ', recomprar: false };
  it('reembolso em %', () => {
    expect(validarOcorrenciaMl(base)).toEqual({ ocorrencia: { tipo: 'reembolso', percentual: 30, valor: null, motivo: 'estante amassada', recomprar: false } });
  });
  it('reembolso em R$ com vírgula e milhar', () => {
    expect(validarOcorrenciaMl({ ...base, modo: 'valor', quantia: 'R$ 1.234,5' })).toMatchObject({ ocorrencia: { valor: 1234.5, percentual: null } });
  });
  it('reembolso sem quantia, % acima de 100 ou número inválido são recusados', () => {
    expect(validarOcorrenciaMl({ ...base, quantia: '' })).toEqual({ erro: 'Informe o percentual reembolsado.' });
    expect(validarOcorrenciaMl({ ...base, quantia: '130' })).toEqual({ erro: 'O percentual vai até 100%.' });
    expect(validarOcorrenciaMl({ ...base, quantia: 'abc' })).toEqual({ erro: 'Informe um número maior que zero.' });
  });
  it('devolução sem valor, com recompra', () => {
    expect(validarOcorrenciaMl({ ...base, tipo: 'devolucao', quantia: '', recomprar: true }))
      .toEqual({ ocorrencia: { tipo: 'devolucao', percentual: null, valor: null, motivo: 'estante amassada', recomprar: true } });
  });
  it('recompra só vale para devolução', () => {
    expect(validarOcorrenciaMl({ ...base, recomprar: true })).toMatchObject({ ocorrencia: { recomprar: false } });
  });
});

import { describe, expect, it } from 'vitest';
import { resumoUltimaContagem, ultimasPorMaterial, type LinhaItemContado } from './inventarioUltimaContagem';

const linha = (p: Partial<LinhaItemContado>): LinhaItemContado => ({
  material: '1434332',
  deposito: '0001',
  status: 'conferido',
  inventario: { codigo: 'INV-011026-01', excluido: false },
  contagens: [],
  ...p,
});

describe('ultimasPorMaterial', () => {
  it('fica com a contagem mais recente entre depósitos e inventários', () => {
    const mapa = ultimasPorMaterial([
      linha({ contagens: [{ numero: 1, created_at: '2026-10-01T12:00:00+00:00', contado_por_nome: 'ANA' }] }),
      linha({
        deposito: '0002', status: 'divergente', inventario: { codigo: 'INV-201026-02', excluido: false },
        contagens: [
          { numero: 1, created_at: '2026-10-20T10:00:00+00:00', contado_por_nome: 'BRUNO' },
          { numero: 2, created_at: '2026-10-20T11:00:00+00:00', contado_por_nome: 'CAIO' },
        ],
      }),
    ]);
    expect(mapa.get('1434332')).toMatchObject({ deposito: '0002', numero: 2, contadoPor: 'CAIO', inventario: 'INV-201026-02', status: 'divergente' });
  });

  it('ignora inventário excluído e casa o material sem zeros à esquerda', () => {
    const mapa = ultimasPorMaterial([
      linha({ material: '0001434332', contagens: [{ numero: 1, created_at: '2026-10-01T12:00:00+00:00', contado_por_nome: 'ANA' }] }),
      linha({ inventario: { codigo: 'INV-X', excluido: true }, contagens: [{ numero: 1, created_at: '2026-10-30T12:00:00+00:00', contado_por_nome: 'ZÉ' }] }),
    ]);
    expect(mapa.get('1434332')?.contadoPor).toBe('ANA');
  });

  it('item só listado, sem contagem, não entra', () => {
    expect(ultimasPorMaterial([linha({ contagens: null })]).size).toBe(0);
  });
});

describe('resumoUltimaContagem', () => {
  it('diz o resultado e há quanto tempo', () => {
    const u = { material: '1', deposito: '0001', status: 'conferido' as const, inventario: 'INV', numero: 1, contadoEm: '2026-10-19T15:00:00', contadoPor: 'ANA' };
    expect(resumoUltimaContagem(u, '2026-10-31')).toBe('Conferido há 12 dias');
    expect(resumoUltimaContagem({ ...u, status: 'aguardando_decisao' }, '2026-10-19')).toBe('Divergiu hoje');
  });
});

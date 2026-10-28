import { beforeEach, describe, expect, it, vi } from 'vitest';

const { consultar } = vi.hoisted(() => ({ consultar: vi.fn() }));

vi.mock('../db/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ is: consultar }) }),
  },
}));

import { obterSequenciaTramoParaEmail } from './expedicaoApi';
import { montarAssuntoExpedicao } from './expedicaoEmail';

const carregamento = (id: string, empresa: string, tramo: string, data: string) => ({
  id, empresa, created_at: `${data}T12:00:00Z`,
  tramos: [{ tramo, ordem: 0, data, excluido_em: null }],
});

describe('sequência atualizada do e-mail de expedição', () => {
  beforeEach(() => vi.resetAllMocks());

  it('recalcula após preencher transportadora e mudar T1 para T2, sem reutilizar o 1º inicial', async () => {
    const anteriores = Array.from({ length: 11 }, (_, i) =>
      carregamento(`anterior-${i}`, 'TRANSPES', 'T2', `2026-10-${String(i + 1).padStart(2, '0')}`));
    consultar.mockResolvedValueOnce({
      data: [...anteriores, carregamento('atual', '', 'T1', '2026-10-28')], error: null,
    });
    expect(await obterSequenciaTramoParaEmail('atual')).toBe(1);

    consultar.mockResolvedValueOnce({
      data: [...anteriores, carregamento('atual', 'TRANSPES', 'T2', '2026-10-28')], error: null,
    });
    const sequencia = await obterSequenciaTramoParaEmail('atual');
    expect(montarAssuntoExpedicao({
      prefixo: 'Chegada Expedição', sequencia, tramo: 'T2', carretaPlaca: 'UED9J76',
    })).toBe('Chegada Expedição 12º T2 - UED9J76');
    expect(consultar).toHaveBeenCalledTimes(2);
  });

  it('considera alteração de data ao ordenar o histórico', async () => {
    consultar.mockResolvedValue({ data: [
      carregamento('anterior', 'TRANSPES', 'T2', '2026-10-10'),
      carregamento('atual', 'TRANSPES', 'T2', '2026-10-09'),
    ], error: null });
    expect(await obterSequenciaTramoParaEmail('atual')).toBe(1);
  });

  it('interrompe a preparação se não conseguir consultar a sequência', async () => {
    consultar.mockResolvedValue({ data: null, error: { message: 'Falha de rede' } });
    await expect(obterSequenciaTramoParaEmail('atual')).rejects.toThrow('Falha de rede');
  });

  it('interrompe a preparação se o carregamento não estiver na consulta', async () => {
    consultar.mockResolvedValue({ data: [], error: null });
    await expect(obterSequenciaTramoParaEmail('atual')).rejects.toThrow('sequência');
  });
});

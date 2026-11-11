import { describe, expect, it } from 'vitest';
import {
  aceitaEntregaMaterial, contarFotosOcorrencia, fotosDaOcorrencia, validarEntregaMaterial,
} from './portariaFotosOcorrencia';
import { formatarTextoOcorrencia } from './portariaApi';

const foto = (path: string, preview_url = `https://x/${path}?token=1`) => ({
  id: path, path, name: path, size: 1, mime_type: 'image/jpeg', created_at: '2026-11-10T10:00:00Z', preview_url,
});

describe('fotos do lançamento', () => {
  it('junta legado, registro e notas com legenda', () => {
    const l = fotosDaOcorrencia({
      foto_url: 'data:image/jpeg;base64,AAA',
      fotos: [foto('a.jpg')],
      fotos_nf: [foto('nf1.jpg'), foto('nf2.jpg')],
    });
    expect(l.map((f) => f.tipo)).toEqual(['registro', 'registro', 'nf', 'nf']);
    expect(l.map((f) => f.legenda)).toEqual(['Foto 1 de 2', 'Foto 2 de 2', 'Nota fiscal 1 de 2', 'Nota fiscal 2 de 2']);
    expect(l[0].url).toMatch(/^data:/);
  });

  it('conta a foto legada mesmo sem o base64 carregado', () => {
    expect(contarFotosOcorrencia({ tem_foto_legado: true, fotos: [], fotos_nf: [foto('n.jpg')] }))
      .toEqual({ registro: 1, nf: 1, total: 2 });
    expect(fotosDaOcorrencia({ tem_foto_legado: true })).toEqual([]);
    expect(contarFotosOcorrencia({})).toEqual({ registro: 0, nf: 0, total: 0 });
  });
});

describe('entrega de material', () => {
  it('nas entradas e no Outro registro', () => {
    expect(aceitaEntregaMaterial('OUTRO_REGISTRO')).toBe(true);
    expect(aceitaEntregaMaterial('ENTRADA_VEICULO')).toBe(true);
    expect(aceitaEntregaMaterial('ENTRADA_VISITANTE')).toBe(true);
    expect(aceitaEntregaMaterial('VEICULO_LEVE')).toBe(true);
    expect(aceitaEntregaMaterial('ENTRADA_COLABORADOR')).toBe(true);
    expect(aceitaEntregaMaterial('SAIDA_COLABORADOR')).toBe(false);
    expect(aceitaEntregaMaterial('RONDA_PATRIMONIAL')).toBe(false);
  });

  it('exige NF verificada e foto da nota', () => {
    const base = { tipo: 'ENTRADA_VEICULO' as const, entrega_material: true, nf_verificada: false, fotosNf: 0 };
    expect(validarEntregaMaterial(base).ok).toBe(false);
    expect(validarEntregaMaterial({ ...base, nf_verificada: true }).erro).toMatch(/foto/);
    expect(validarEntregaMaterial({ ...base, nf_verificada: true, fotosNf: 2 }).ok).toBe(true);
    expect(validarEntregaMaterial({ ...base, entrega_material: false }).ok).toBe(true);
    // Tipo que não é entrada ignora a marcação que sobrou ao trocar o tipo.
    expect(validarEntregaMaterial({ ...base, tipo: 'RONDA_PATRIMONIAL' }).ok).toBe(true);
  });

  it('texto do livro leva a marcação de entrega', () => {
    const t = formatarTextoOcorrencia({
      tipo_registro: 'ENTRADA_VEICULO', horario: '10:00', empresa: 'ATLANTA', placa_veiculo: 'ABC1D23',
      pessoas: [{ nome: 'JOSE' }], entrega_material: true, nf_verificada: true,
    });
    expect(t).toContain('[ENTREGA DE MATERIAL - NF VERIFICADA]');
    const r = formatarTextoOcorrencia({ tipo_registro: 'RONDA_PATRIMONIAL', motivo_observacao: 'OK', entrega_material: true });
    expect(r).not.toContain('ENTREGA');
    const o = formatarTextoOcorrencia({ tipo_registro: 'OUTRO_REGISTRO', motivo_observacao: 'PALETES DO ALMOX', entrega_material: true, nf_verificada: true });
    expect(o).toContain('PALETES DO ALMOX [ENTREGA DE MATERIAL - NF VERIFICADA]');
  });
});

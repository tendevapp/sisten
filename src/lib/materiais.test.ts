import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buscarMateriais,
  limparCacheBusca,
  normalizarTermo,
  resumoSinais,
  calcularProximoCodigoMaterial,
  type MaterialResultado,
} from './materiais';

const rpc = vi.fn();
vi.mock('../db/supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

describe('normalizarTermo', () => {
  it('quebra em tokens, em qualquer ordem, para casar descrição do SAP', () => {
    // O catálogo grava "PARAFUSO M12 SEXTAVADO"; a pessoa digita na ordem dela.
    expect(normalizarTermo('parafuso sextavado m12')).toEqual({
      tipo: 'texto',
      normalizado: 'PARAFUSO SEXTAVADO M12',
      tokens: ['PARAFUSO', 'SEXTAVADO', 'M12'],
    });
  });

  it('remove acento — o catálogo grava VALVULA, a pessoa digita válvula', () => {
    expect(normalizarTermo('válvula esfera').normalizado).toBe('VALVULA ESFERA');
  });

  it('colapsa espaço repetido e ignora borda', () => {
    expect(normalizarTermo('  luva   npt  ').tokens).toEqual(['LUVA', 'NPT']);
  });

  it('reconhece termo só de dígitos como código de material', () => {
    expect(normalizarTermo('10318').tipo).toBe('codigo');
  });

  it('preserva a fração, que é atributo real de tubulação', () => {
    expect(normalizarTermo('luva 1/2 npt').tokens).toEqual(['LUVA', '1/2', 'NPT']);
  });

  it('marca como curto o que não vale consultar', () => {
    // Um caractere casaria com meio catálogo; a UI não deve nem consultar.
    expect(normalizarTermo('l').tipo).toBe('curto');
    expect(normalizarTermo('   ').tipo).toBe('curto');
    expect(normalizarTermo('l').tokens).toEqual([]);
  });

  it('exige 3 caracteres de texto — piso do índice trigram (pg_trgm não usa índice abaixo disso)', () => {
    expect(normalizarTermo('lu').tipo).toBe('curto');
    expect(normalizarTermo('luv').tipo).toBe('texto');
  });

  it('exige 4 dígitos para tratar como código', () => {
    // Abaixo disso o prefixo devolveria milhares de linhas sem utilidade.
    expect(normalizarTermo('103').tipo).toBe('curto');
    expect(normalizarTermo('1031').tipo).toBe('codigo');
  });
});

const base: MaterialResultado = {
  materialCode: '1031825',
  description: 'LUVA FM FM197 1/2" NPT 300#',
  technicalText: 'GALVANIZADO FOGO',
  unit: 'UN',
  qtdEstoque: null,
  depositos: null,
  rms12m: null,
  ultimaRm: null,
  rmsSemPedido: null,
  rmAberta: null,
  qtdRmAberta: null,
  pedidoAberto: null,
  qtdPedidoAberto: null,
  chegaEm: null,
  pedidoPelaArea: false,
};

describe('resumoSinais', () => {
  it('não inventa sinal quando não há dado', () => {
    expect(resumoSinais(base)).toEqual([]);
  });

  it('mostra só a quantidade em estoque, sem o depósito', () => {
    // Depósito não importa para quem decide se compra — só a quantidade.
    const chips = resumoSinais({ ...base, qtdEstoque: 45, depositos: ['CD01'] });
    expect(chips).toEqual([{ texto: '45 UN em estoque', tom: 'estoque' }]);
  });

  it('mostra a quantidade da RM aberta, não o número — alguém já pediu e não virou compra', () => {
    const chips = resumoSinais({ ...base, rmsSemPedido: 1, rmAberta: '0012345', qtdRmAberta: 200 });
    expect(chips).toContainEqual({ texto: 'RM aberta: 200 UN', tom: 'demanda' });
  });

  it('mostra a quantidade do pedido a caminho, não o número, com a data de remessa', () => {
    const chips = resumoSinais({ ...base, pedidoAberto: '4500123', qtdPedidoAberto: 500, chegaEm: '2026-08-12' });
    expect(chips).toContainEqual({ texto: '500 UN a caminho · chega 12/08/2026', tom: 'pedido' });
  });

  it('não mostra a contagem total de RMs — só o recorte por área importa', () => {
    const chips = resumoSinais({ ...base, rms12m: 12 });
    expect(chips).toEqual([]);
  });

  it('nunca mostra "0x" — ausência de dado não é informação', () => {
    const chips = resumoSinais({ ...base, rms12m: 0, qtdEstoque: 0, pedidoPelaArea: false });
    expect(chips).toEqual([]);
  });

  it('mostra o recorte da área independente da contagem total de RMs', () => {
    const chips = resumoSinais({ ...base, pedidoPelaArea: true });
    expect(chips).toEqual([{ texto: 'sua área já pediu', tom: 'uso' }]);
  });
});

describe('buscarMateriais', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [{ material_code: '1031825', description: 'LUVA', unit: 'UN' }], error: null });
    limparCacheBusca();
  });

  it('não consulta o servidor quando o termo é curto demais', async () => {
    expect(await buscarMateriais('lu')).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('casa só na descrição por padrão — o texto técnico é opt-in', async () => {
    await buscarMateriais('luva npt');
    expect(rpc.mock.calls[0][1]).toMatchObject({ incluir_tecnico: false, deslocamento: 0 });
  });

  it('repassa deslocamento e escopo técnico quando o modal pede', async () => {
    await buscarMateriais('luva npt', { limite: 25, deslocamento: 25, incluirTecnico: true });
    expect(rpc.mock.calls[0][1]).toMatchObject({ limite: 25, deslocamento: 25, incluir_tecnico: true });
  });

  it('serve a repetição do cache, sem novo round-trip', async () => {
    const a = await buscarMateriais('luva npt');
    const b = await buscarMateriais('luva npt');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('trata o termo como a mesma pergunta depois de normalizado', async () => {
    // "LUVA  NPT" e "luva npt" viram a mesma consulta no banco; guardar as
    // duas custaria um request para nada.
    await buscarMateriais('luva npt');
    await buscarMateriais('  LUVA   npt ');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('não confunde páginas nem escopos diferentes do mesmo termo', async () => {
    await buscarMateriais('luva npt');
    await buscarMateriais('luva npt', { deslocamento: 25 });
    await buscarMateriais('luva npt', { incluirTecnico: true });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it('descarta o cache quando o catálogo é reimportado', async () => {
    await buscarMateriais('luva npt');
    limparCacheBusca();
    await buscarMateriais('luva npt');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('não guarda resposta de erro — a próxima tentativa deve ir ao servidor', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('rede') });
    await expect(buscarMateriais('luva npt')).rejects.toThrow();
    await buscarMateriais('luva npt');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe('calcularProximoCodigoMaterial', () => {
  it('calcula o próximo código para padrão de 7 dígitos', () => {
    expect(calcularProximoCodigoMaterial('1487950')).toBe('1487951');
    expect(calcularProximoCodigoMaterial('1000000')).toBe('1000001');
  });

  it('calcula o próximo código para código longo de 18 dígitos com precisão BigInt', () => {
    expect(calcularProximoCodigoMaterial('100000000000047981')).toBe('100000000000047982');
    expect(calcularProximoCodigoMaterial('100000000000000110')).toBe('100000000000000111');
  });

  it('retorna traço para nulo, indefinido ou vazio', () => {
    expect(calcularProximoCodigoMaterial(null)).toBe('—');
    expect(calcularProximoCodigoMaterial(undefined)).toBe('—');
    expect(calcularProximoCodigoMaterial('')).toBe('—');
    expect(calcularProximoCodigoMaterial('   ')).toBe('—');
  });

  it('retorna traço para códigos não puramente numéricos', () => {
    expect(calcularProximoCodigoMaterial('DIESEL')).toBe('—');
    expect(calcularProximoCodigoMaterial('ABC-123')).toBe('—');
  });
});


import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const upsert = vi.fn();
const selectIn = vi.fn();
vi.mock('../db/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => ({
      select: () => ({ in: (...a: unknown[]) => selectIn(...a) }),
      upsert: (...a: unknown[]) => upsert(...a),
    }),
  },
}));

import {
  descreverRegime,
  ehSimplesParaImposto,
  regimeDeConsulta,
  regimeVencido,
  resolverRegimes,
  situacaoIrregular,
  soDigitos,
  type RegimeFornecedor,
} from './regimeFornecedor';

const CNPJ_A = '19131243000197';
const CNPJ_B = '55213576000129';

function info(over: Record<string, unknown> = {}) {
  return {
    cnpj: '55.213.576/0001-29', razaoSocial: 'FORN LTDA', nomeFantasia: '', situacaoCadastral: 'ATIVA',
    regimeSugerido: 'Simples Nacional', mei: false, simples: true, porte: '', naturezaJuridica: '',
    cnaePrincipal: '', endereco: '', municipio: '', uf: 'SP', cep: '', email: '', telefone: '', fonte: 'BrasilAPI',
    ...over,
  };
}

function regime(over: Partial<RegimeFornecedor> = {}): RegimeFornecedor {
  return {
    cnpj: CNPJ_B, simples: true, mei: false, situacaoCadastral: 'ATIVA', razaoSocial: 'X',
    fonte: 'BrasilAPI', consultadoEm: new Date().toISOString(), ...over,
  };
}

beforeEach(() => {
  invoke.mockReset();
  upsert.mockReset().mockResolvedValue({ error: null });
  selectIn.mockReset().mockResolvedValue({ data: [], error: null });
});

describe('helpers', () => {
  it('MEI conta como Simples para o imposto', () => {
    expect(ehSimplesParaImposto({ simples: false, mei: true })).toBe(true);
    expect(ehSimplesParaImposto({ simples: false, mei: false })).toBe(false);
  });

  it('vence depois de 30 dias', () => {
    const agora = new Date('2026-10-05T12:00:00Z');
    expect(regimeVencido({ consultadoEm: '2026-09-20T12:00:00Z' }, agora)).toBe(false);
    expect(regimeVencido({ consultadoEm: '2026-08-20T12:00:00Z' }, agora)).toBe(true);
    expect(regimeVencido({ consultadoEm: 'lixo' }, agora)).toBe(true);
  });

  it('só avisa situação irregular quando não é ATIVA', () => {
    expect(situacaoIrregular({ situacaoCadastral: 'ATIVA' })).toBe(false);
    expect(situacaoIrregular({ situacaoCadastral: 'INAPTA' })).toBe(true);
    expect(situacaoIrregular({ situacaoCadastral: null })).toBe(false);
  });

  it('descreve o efeito do Simples na decisão', () => {
    expect(descreverRegime(regime())).toMatch(/Simples Nacional.*não há crédito de ICMS/s);
    expect(descreverRegime(regime({ simples: false }))).toMatch(/Não é optante/);
  });

  it('converte a resposta da consulta guardando só dígitos no CNPJ', () => {
    expect(regimeDeConsulta(info() as never).cnpj).toBe(CNPJ_B);
    expect(soDigitos('55.213.576/0001-29')).toBe(CNPJ_B);
  });
});

describe('resolverRegimes', () => {
  it('usa o gravado recente sem consultar a Receita', async () => {
    selectIn.mockResolvedValue({
      data: [{ cnpj: CNPJ_B, simples: true, mei: false, situacao_cadastral: 'ATIVA', razao_social: 'X', fonte: 'BrasilAPI', consultado_em: new Date().toISOString() }],
      error: null,
    });
    const r = await resolverRegimes([CNPJ_B]);
    expect(invoke).not.toHaveBeenCalled();
    expect(r.regimes.get(CNPJ_B)?.simples).toBe(true);
  });

  it('consulta e grava quando não há nada gravado', async () => {
    const CNPJ_NOVO = '10320707000139';
    invoke.mockResolvedValue({ data: info({ cnpj: '10.320.707/0001-39' }), error: null });
    const aoResolver = vi.fn();
    const r = await resolverRegimes([CNPJ_NOVO], { usuario: 'Ana', aoResolver });
    expect(invoke).toHaveBeenCalledWith('consultar-cnpj', { body: { cnpj: CNPJ_NOVO } });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ cnpj: CNPJ_NOVO, simples: true, consultado_por: 'Ana' }));
    expect(aoResolver).toHaveBeenCalledTimes(1);
    expect(r.regimes.get(CNPJ_NOVO)?.simples).toBe(true);
  });

  it('sem a tabela de cache a consulta ainda vale na sessão', async () => {
    const CNPJ_SEM_TABELA = '05666574000117';
    selectIn.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    upsert.mockResolvedValue({ error: { message: 'relation does not exist' } });
    invoke.mockResolvedValue({ data: info({ cnpj: '05.666.574/0001-17' }), error: null });
    const r = await resolverRegimes([CNPJ_SEM_TABELA]);
    expect(r.regimes.get(CNPJ_SEM_TABELA)?.simples).toBe(true);
    expect(r.falhas.size).toBe(0);
  });

  it('registra a falha com o motivo quando a Receita não responde e não há dado antigo', async () => {
    const CNPJ_FALHA = '16944219000189';
    invoke.mockResolvedValue({ data: null, error: { message: 'down', context: { json: async () => ({ erro: { mensagem: 'Serviços de consulta de CNPJ indisponíveis' } }) } } });
    const r = await resolverRegimes([CNPJ_FALHA]);
    expect(r.regimes.has(CNPJ_FALHA)).toBe(false);
    expect(r.falhas.get(CNPJ_FALHA)).toMatch(/indisponíveis/);
  });

  it('CNPJ incompleto vira falha explicada, sem chamar a Receita', async () => {
    const r = await resolverRegimes(['1234']);
    expect(invoke).not.toHaveBeenCalled();
    expect(r.falhas.get('1234')).toMatch(/incompleto/);
  });

  it('reconsultar (forcar) ignora o gravado', async () => {
    selectIn.mockResolvedValue({
      data: [{ cnpj: CNPJ_A, simples: false, mei: false, situacao_cadastral: 'ATIVA', razao_social: 'X', fonte: 'BrasilAPI', consultado_em: new Date().toISOString() }],
      error: null,
    });
    invoke.mockResolvedValue({ data: info({ cnpj: '19.131.243/0001-97', simples: true }), error: null });
    const r = await resolverRegimes([CNPJ_A], { forcar: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(r.regimes.get(CNPJ_A)?.simples).toBe(true);
  });
});

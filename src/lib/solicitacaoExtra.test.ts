import { describe, expect, it } from 'vitest';
import {
  descreverMotivo, lerNumero, normalizarPorMotivo, podeAprovarRetirada, rotuloStatusSolExtra, turnoDaHora, validarSolExtra,
  type DadosSolExtra,
} from './solicitacaoExtra';
import { SOL_EXTRA_COLUNAS, montarLinhasSolExtra } from './solicitacaoExtraPlanilha';
import type { SolExtra } from './solicitacaoExtraApi';

const base: DadosSolExtra = {
  tipo: 'PROJETO',
  data: '2026-10-20',
  hora: '08:30',
  turno: '1',
  projeto: 'GW JACOBINA',
  tramo: 'T3-045',
  itens: [{ material: '1437274', descricao: 'TINTA EPOXI', unidade: 'L', quantidade: 18 }],
  motivo: 'LIMPEZA',
  motivo_detalhe: null,
  area_reparada_m2: null,
  rugosidade_um: null,
  observacao: null,
  retirante_id: null,
  retirante_nome: null,
  retirante_matricula: null,
  setor_solicitante_id: null,
  setor_solicitante_nome: null,
  fotos: [],
  assinatura_retirante: null,
  assinatura_retirante_em: null,
};

const semSaldo: DadosSolExtra = {
  ...base,
  tipo: 'SEM_SALDO',
  turno: null,
  projeto: null,
  tramo: null,
  motivo: null,
  retirante_id: 'p1',
  retirante_nome: 'JOSÉ DA SILVA',
  retirante_matricula: '12345',
  setor_solicitante_id: '9',
  setor_solicitante_nome: 'Manutenção',
};

describe('validarSolExtra', () => {
  it('aceita o formulário completo', () => {
    expect(validarSolExtra(base)).toEqual([]);
  });

  it('pede item, motivo e quantidade positiva', () => {
    expect(validarSolExtra({ ...base, itens: [], motivo: null })).toEqual(['Inclua pelo menos um material.', 'Marque o motivo.']);
    expect(validarSolExtra({ ...base, itens: [{ ...base.itens[0], quantidade: 0 }] })[0]).toMatch(/Item 1: quantidade/);
  });

  it('recusa o mesmo material em duas linhas', () => {
    const erros = validarSolExtra({ ...base, itens: [base.itens[0], { ...base.itens[0], quantidade: 2 }] });
    expect(erros.join(' ')).toMatch(/repetido: 1437274/);
  });

  it('reparo de pintura e outros motivos pedem o texto do motivo', () => {
    expect(validarSolExtra({ ...base, motivo: 'REPARO_PINTURA' })).toEqual(['Reparo de pintura: descreva o motivo do reparo.']);
    expect(validarSolExtra({ ...base, motivo: 'OUTROS' })).toEqual(['Outros motivos: especifique o motivo.']);
    expect(validarSolExtra({ ...base, motivo: 'OUTROS', motivo_detalhe: 'teste de bomba' })).toEqual([]);
  });
});

describe('normalizarPorMotivo', () => {
  it('descarta os complementos que não valem para o motivo marcado', () => {
    const d = normalizarPorMotivo({ ...base, motivo: 'LIMPEZA', motivo_detalhe: 'x', area_reparada_m2: 3, rugosidade_um: 80 });
    expect([d.motivo_detalhe, d.area_reparada_m2, d.rugosidade_um]).toEqual([null, null, null]);
  });

  it('mantém área no reparo e µm na rugosidade', () => {
    expect(normalizarPorMotivo({ ...base, motivo: 'REPARO_PINTURA', motivo_detalhe: ' risco ', area_reparada_m2: 2.5 }))
      .toMatchObject({ motivo_detalhe: 'risco', area_reparada_m2: 2.5 });
    expect(normalizarPorMotivo({ ...base, motivo: 'PERDA_RUGOSIDADE', rugosidade_um: 95 }).rugosidade_um).toBe(95);
  });
});

describe('descreverMotivo', () => {
  it('junta o rótulo com o complemento', () => {
    expect(descreverMotivo({ motivo: 'REPARO_PINTURA', motivo_detalhe: 'Batida no transporte', area_reparada_m2: 1.5, rugosidade_um: null }))
      .toBe('Reparo de pintura — Batida no transporte — 1,5 m²');
    expect(descreverMotivo({ motivo: 'PERDA_RUGOSIDADE', motivo_detalhe: null, area_reparada_m2: null, rugosidade_um: 90 }))
      .toBe('Perda pelo perfil de rugosidade do substrato — 90 µm');
  });
});

describe('lerNumero e turnoDaHora', () => {
  it('lê número com vírgula e devolve null no vazio', () => {
    expect(lerNumero('1.234,5')).toBe(1234.5);
    expect(lerNumero('  ')).toBeNull();
    expect(Number.isNaN(lerNumero('abc'))).toBe(true);
  });

  it('turno pela hora, como a Portaria', () => {
    expect(turnoDaHora('06:00')).toBe('1');
    expect(turnoDaHora('14:00')).toBe('2');
    expect(turnoDaHora('23:10')).toBe('3');
    expect(turnoDaHora('05:59')).toBe('3');
    expect(turnoDaHora('')).toBeNull();
  });
});

describe('montarLinhasSolExtra (exportação Excel)', () => {
  const registro = {
    ...base,
    id: 'x',
    codigo: 'SEM-201026-01',
    hora: '08:30:00',
    motivo: 'REPARO_PINTURA',
    motivo_detalhe: 'Batida no transporte',
    area_reparada_m2: 1.5,
    itens: [base.itens[0], { material: '1291134', descricao: 'DISCO FLAP', unidade: 'UN', quantidade: 3 }],
    status: 'REGULARIZADA',
    doc_sap: '4900012345',
    regularizacao_obs: null,
    regularizado_por: 'u2',
    regularizado_por_nome: 'MARIA',
    regularizado_em: null,
    criado_por: 'u1',
    criado_por_nome: 'JOÃO',
    created_at: '2026-10-20T11:30:00Z',
    updated_at: '2026-10-20T11:30:00Z',
    excluido_em: null,
  } as SolExtra;

  it('uma linha por material, repetindo a solicitação, com as colunas na ordem', () => {
    const linhas = montarLinhasSolExtra([registro]);
    expect(linhas).toHaveLength(2);
    expect(Object.keys(linhas[0])).toEqual([...SOL_EXTRA_COLUNAS]);
    expect(linhas[1]).toMatchObject({
      'Código': 'SEM-201026-01', 'Data': '20/10/2026', 'Hora': '08:30', 'Turno': '1º', 'Item': 2,
      'Código SAP': '1291134', 'Quantidade': 3, 'Motivo': 'Reparo de pintura', 'Área reparada (m²)': 1.5,
      'Situação': 'Regularizada no SAP', 'Doc. SAP': '4900012345', 'Registrado por': 'JOÃO',
    });
  });

  it('pendente sai sem doc. SAP e campos opcionais vazios', () => {
    const [l] = montarLinhasSolExtra([{ ...registro, status: 'PENDENTE', doc_sap: null, area_reparada_m2: null, turno: null, itens: [base.itens[0]] }]);
    expect([l['Situação'], l['Doc. SAP'], l['Área reparada (m²)'], l['Turno']]).toEqual(['Aguardando regularização', '', '', '']);
  });
});

describe('retirada sem saldo', () => {
  it('pede quem retira, setor e hora — motivo não', () => {
    expect(validarSolExtra(semSaldo)).toEqual([]);
    expect(validarSolExtra({ ...semSaldo, retirante_nome: ' ', setor_solicitante_id: null, hora: null })).toEqual([
      'Informe quem está retirando (matrícula ou nome).',
      'Escolha o setor solicitante.',
      'Informe a hora da retirada.',
    ]);
  });

  it('normalizar limpa os campos da folha de Projeto e mantém o retirante', () => {
    const d = normalizarPorMotivo({ ...semSaldo, projeto: 'GW', tramo: 'T1', turno: '2', motivo: 'LIMPEZA' });
    expect([d.projeto, d.tramo, d.turno, d.motivo]).toEqual([null, null, null, null]);
    expect(d.retirante_nome).toBe('JOSÉ DA SILVA');
  });

  it('projeto não leva retirante, setor nem assinatura; fotos valem para os dois tipos', () => {
    const foto = { path: 'solicitacao-extra/x/a.jpg', nome: 'a.jpg', tipo: 'image/jpeg' };
    const d = normalizarPorMotivo({ ...base, retirante_nome: 'X', setor_solicitante_id: '9', assinatura_retirante: 'data:image/png;base64,AA', fotos: [foto] });
    expect([d.retirante_nome, d.setor_solicitante_id, d.assinatura_retirante]).toEqual([null, null, null]);
    expect(d.fotos).toEqual([foto]);
    expect(normalizarPorMotivo({ ...semSaldo, assinatura_retirante: 'data:image/png;base64,AA' }).assinatura_retirante).toBe('data:image/png;base64,AA');
  });

  it('aprova o admin ou o aprovador do setor solicitante', () => {
    const r = { tipo: 'SEM_SALDO' as const, setor_solicitante_id: '9' };
    expect(podeAprovarRetirada(r, { roles: ['admin'] })).toBe(true);
    expect(podeAprovarRetirada(r, { roles: ['gestor'], aprovador_setores: ['9'] })).toBe(true);
    expect(podeAprovarRetirada(r, { roles: ['gestor'], aprovador_setores: ['2'] })).toBe(false);
    expect(podeAprovarRetirada({ ...r, tipo: 'PROJETO' }, { roles: ['admin'] })).toBe(false);
  });

  it('situação no vocabulário de cada tipo', () => {
    expect(rotuloStatusSolExtra('PENDENTE', 'SEM_SALDO')).toBe('Aguardando baixa');
    expect(rotuloStatusSolExtra('REGULARIZADA', 'SEM_SALDO')).toBe('Baixada no balcão');
    expect(rotuloStatusSolExtra('REGULARIZADA')).toBe('Regularizada no SAP');
  });
});

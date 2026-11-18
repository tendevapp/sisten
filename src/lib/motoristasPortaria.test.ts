import { describe, expect, it } from 'vitest';
import {
  consolidarMotoristasPortaria,
  encontrarMotoristaPorNome,
  enriquecerDocsTransportesAnteriores,
  filtrarMotoristasPortaria,
  interpretarDocumentoAlcoolemia,
} from './motoristasPortaria';
import type { PortRegistroTransporte } from '../types';

const criarTransporte = (
  overrides: Partial<PortRegistroTransporte> = {},
): PortRegistroTransporte => ({
  id: 'trp-1',
  codigo_formulario: 'FRM.SGP-0009',
  numero_protocolo: 'TRP-181126-01',
  data: '2026-11-18',
  turno: 'MANHA',
  vigilante: 'ANDRE',
  veiculo: 'Van',
  placa: 'ABC1D23',
  empresa: 'TRANSPORTES TEN',
  hora_chegada: '07:00',
  hora_saida: null,
  motorista: 'JOSE CARLOS',
  motorista_doc_tipo: null,
  motorista_documento: null,
  rota: 'R1',
  ocupacao: null,
  observacoes: null,
  status: 'NO_PATIO',
  criado_por: null,
  created_at: '2026-11-18T07:00:00Z',
  updated_at: '2026-11-18T07:00:00Z',
  ...overrides,
});

describe('interpretarDocumentoAlcoolemia', () => {
  it('extrai tipo e numero para CNH e CPF prefixados', () => {
    expect(interpretarDocumentoAlcoolemia('CNH 01234567890')).toEqual({
      docTipo: 'CNH',
      docNumero: '01234567890',
      docCompleto: 'CNH 01234567890',
    });
    expect(interpretarDocumentoAlcoolemia('CPF 529.982.247-25')).toEqual({
      docTipo: 'CPF',
      docNumero: '529.982.247-25',
      docCompleto: 'CPF 529.982.247-25',
    });
  });

  it('infere CPF quando formatado sem prefixo e preserva RG apenas em docCompleto', () => {
    expect(interpretarDocumentoAlcoolemia('529.982.247-25')).toEqual({
      docTipo: 'CPF',
      docNumero: '529.982.247-25',
      docCompleto: '529.982.247-25',
    });
    expect(interpretarDocumentoAlcoolemia('RG 1234567')).toEqual({
      docTipo: null,
      docNumero: '',
      docCompleto: 'RG 1234567',
    });
  });
});

describe('consolidarMotoristasPortaria', () => {
  it('deduplica por nome e aproveita documento salvo em lancamento anterior', () => {
    const lista = consolidarMotoristasPortaria(
      [
        criarTransporte({
          motorista: 'João da Silva',
          empresa: 'VIACAO SUL',
          motorista_doc_tipo: null,
          motorista_documento: null,
          data: '2026-11-18',
          created_at: '2026-11-18T08:00:00Z',
        }),
        criarTransporte({
          motorista: 'JOAO DA SILVA',
          empresa: 'VIACAO SUL',
          motorista_doc_tipo: 'CNH',
          motorista_documento: '01234567890',
          data: '2026-11-10',
          created_at: '2026-11-10T08:00:00Z',
        }),
      ],
      [
        {
          nome: 'CARLOS PEREIRA',
          documento: 'CPF 529.982.247-25',
          empresa: 'LOGTEN',
          cargo_funcao: 'MOTORISTA',
          setor_area: 'PORTARIA',
          data: '2026-11-15',
          created_at: '2026-11-15T09:00:00Z',
        },
      ],
    );

    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({
      nome: 'JOÃO DA SILVA',
      docTipo: 'CNH',
      docNumero: '01234567890',
      docCompleto: 'CNH 01234567890',
      empresa: 'VIACAO SUL',
    });
    expect(lista[1]).toMatchObject({
      nome: 'CARLOS PEREIRA',
      docTipo: 'CPF',
      docNumero: '529.982.247-25',
      docCompleto: 'CPF 529.982.247-25',
      cargo: 'MOTORISTA',
    });
  });
});

describe('filtrarMotoristasPortaria e encontrarMotoristaPorNome', () => {
  const base = consolidarMotoristasPortaria(
    [
      criarTransporte({
        motorista: 'JOÃO ALMEIDA',
        motorista_doc_tipo: 'CPF',
        motorista_documento: '529.982.247-25',
        empresa: 'EXPRESSO',
      }),
      criarTransporte({
        motorista: 'MARIA SOUZA',
        motorista_doc_tipo: 'CNH',
        motorista_documento: '01234567890',
        empresa: 'TEN',
        created_at: '2026-11-17T07:00:00Z',
      }),
    ],
    [],
  );

  it('filtra sem diferenciar acentos e tambem por digitos do documento', () => {
    expect(filtrarMotoristasPortaria(base, 'joao')).toHaveLength(1);
    expect(filtrarMotoristasPortaria(base, '529982')).toHaveLength(1);
    expect(filtrarMotoristasPortaria(base, '')).toHaveLength(2);
    expect(encontrarMotoristaPorNome(base, 'joao almeida')?.docNumero).toBe('529.982.247-25');
  });
});

describe('enriquecerDocsTransportesAnteriores', () => {
  it('preenche documento ausente na viagem usando outro registro do mesmo motorista', () => {
    const recenteSemDoc = criarTransporte({
      id: '1',
      motorista: 'PEDRO LIMA',
      motorista_doc_tipo: null,
      motorista_documento: null,
      created_at: '2026-11-18T08:00:00Z',
    });
    const antigoComDoc = criarTransporte({
      id: '2',
      motorista: 'PEDRO LIMA',
      motorista_doc_tipo: 'CNH',
      motorista_documento: '98765432100',
      created_at: '2026-11-12T08:00:00Z',
    });

    const resultado = enriquecerDocsTransportesAnteriores(
      [recenteSemDoc, antigoComDoc],
      [recenteSemDoc],
    );

    expect(resultado[0].motorista_doc_tipo).toBe('CNH');
    expect(resultado[0].motorista_documento).toBe('98765432100');
  });
});


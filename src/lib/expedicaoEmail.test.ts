import { describe, it, expect } from 'vitest';
import {
  listarTramos, montarCorpoEmail, montarCorpoEmailChegada, montarAssuntoExpedicao,
  montarMailto, cabeNoMailto, LIMITE_MAILTO, normalizarDataISO, calcularLeadTimesTramo,
} from './expedicaoEmail';
import type { ExpedicaoTramo } from '../types';
import type { FotoComUrl } from './expedicaoEmail';

function tramo(over: Partial<ExpedicaoTramo> & { id: string }): ExpedicaoTramo {
  return {
    carregamento_id: 'c1',
    ordem: 0,
    tramo: 'T1',
    numero_tramo: null,
    numero_nf: null,
    motorista: '',
    cavalo_placa: '',
    cavalo_uf: null,
    carreta_placa: '',
    carreta_uf: null,
    dolly_placa: '',
    dolly_uf: null,
    data: null,
    hora_chegada_portaria: null,
    hora_entrada_patio: null,
    hora_expedicao: null,
    obs_chegada_portaria: null,
    obs_entrada_patio: null,
    obs_expedicao: null,
    created_at: '2026-08-26T10:00:00Z',
    updated_at: '2026-08-26T10:00:00Z',
    ...over,
  } as ExpedicaoTramo;
}

function foto(over: Partial<FotoComUrl> & { id: string; tramo_id: string }): FotoComUrl {
  return {
    carregamento_id: 'c1',
    etapa: 'chegada_portaria',
    storage_path: 'p',
    nome_arquivo: null,
    criado_por: null,
    created_at: '2026-08-26T10:00:00Z',
    url: null,
    ...over,
  } as FotoComUrl;
}

describe('normalizarDataISO', () => {
  it('corrige anos digitados com dois dígitos ou prefixo 00 (ex: 0026 -> 2026)', () => {
    expect(normalizarDataISO('0026-08-27')).toBe('2026-08-27');
    expect(normalizarDataISO('26-08-27')).toBe('2026-08-27');
    expect(normalizarDataISO('2026-08-27')).toBe('2026-08-27');
    expect(normalizarDataISO(null)).toBe(null);
  });
});

describe('calcularLeadTimesTramo', () => {
  it('calcula horas e dias entre as etapas corretamente', () => {
    const t = tramo({
      id: 't1',
      data: '2026-08-27',
      hora_chegada_portaria: '08:00',
      hora_entrada_patio: '11:30',
      hora_expedicao: '16:00',
    });

    const res = calcularLeadTimesTramo(t);
    expect(res.portariaAtePatio).toBe('3h 30min');
    expect(res.patioAteExpedicao).toBe('4h 30min');
    expect(res.leadTimeTotal).toBe('8h 0min');
  });

  it('calcula etapas em dias diferentes com indicação de dias e horas', () => {
    const t = tramo({
      id: 't1',
      data_chegada_portaria: '2026-08-27',
      hora_chegada_portaria: '10:00',
      data_entrada_patio: '2026-08-28',
      hora_entrada_patio: '14:30',
      data_expedicao: '2026-08-28',
      hora_expedicao: '18:00',
    });

    const res = calcularLeadTimesTramo(t);
    expect(res.portariaAtePatio).toBe('1 dia, 4h 30min (28h 30min)');
    expect(res.patioAteExpedicao).toBe('3h 30min');
    expect(res.leadTimeTotal).toBe('1 dia, 8h 0min (32h 0min)');
  });
});

describe('listarTramos', () => {
  it('escreve a lista como se fala, com "e" antes do último', () => {
    expect(listarTramos([])).toBe('');
    expect(listarTramos(['T1'])).toBe('T1');
    expect(listarTramos(['T1', 'T4'])).toBe('T1 e T4');
    expect(listarTramos(['T1', 'T2', 'T4'])).toBe('T1, T2 e T4');
  });
});

describe('montarCorpoEmail', () => {
  const tramos = [
    tramo({
      id: 't1', tramo: 'T1', numero_tramo: '1234', numero_nf: '98765', motorista: 'GERALDO PEREIRA DA SILVA JUNIOR',
      cavalo_placa: 'RTX-3B83', cavalo_uf: 'MG', carreta_placa: 'OIL-8H76', carreta_uf: 'BA',
      data: '2023-09-04', hora_chegada_portaria: '09:05', hora_entrada_patio: '12:00', hora_expedicao: '14:00',
    }),
    tramo({
      id: 't4', tramo: 'T4', ordem: 1, motorista: 'JOAO ANTONIO SANTANA',
      cavalo_placa: 'RNM-1F01', cavalo_uf: 'MG', carreta_placa: 'RMS-1I48', carreta_uf: 'MG',
      data: '2023-09-04', hora_chegada_portaria: '09:05',
    }),
  ];

  it('reproduz o formato usado pela equipe, com abertura, empresa, número do tramo, NF e lead times', () => {
    const corpo = montarCorpoEmail({
      empresa: 'TRANSMAQUINAS',
      observacoes: 'Motoristas com escolta – SERIDÓ',
      tramos,
      fotos: [],
    });

    expect(corpo).toContain('Segue dados para carregamento do T1 e T4 TRANSMAQUINAS.');
    expect(corpo).toContain('Empresa: TRANSMAQUINAS');
    expect(corpo).toContain('Tramo: T1 - 1234');
    expect(corpo).toContain('Nota Fiscal: 98765');
    expect(corpo).toContain('Motorista: GERALDO PEREIRA DA SILVA JUNIOR');
    expect(corpo).toContain('Cavalo:      RTX-3B83 /MG');
    expect(corpo).toContain('Carreta:     OIL-8H76 /BA');
    expect(corpo).toContain('Data:         04/09/2023');
    expect(corpo).toContain('Horário de chegada portaria: 09:05');
    expect(corpo).toContain('Horário de entrada pátio: 12:00');
    expect(corpo).toContain('Horário de expedição: 14:00');
    expect(corpo).toContain('Cálculo de Tempos (Lead Time):');
    expect(corpo).toContain('• Lead Time Total (Portaria ➔ Expedição): 4h 55min');
    expect(corpo).toContain('Tramo: T4');
    expect(corpo.trimEnd().endsWith('Obs.: Motoristas com escolta – SERIDÓ')).toBe(true);
  });

  it('marca com travessão a etapa que ainda não aconteceu, em vez de omitir a linha', () => {
    const corpo = montarCorpoEmail({ empresa: 'X', observacoes: null, tramos: [tramos[1]], fotos: [] });
    expect(corpo).toContain('Horário de entrada pátio: —');
    expect(corpo).toContain('Horário de expedição: —');
  });

  it('anexa a seção de fotos na etapa correspondente, e numera quando há mais de uma', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X',
      observacoes: null,
      tramos: [tramos[0]],
      fotos: [
        foto({ id: 'f1', tramo_id: 't1', etapa: 'chegada_portaria', url: 'https://s/a.jpg' }),
        foto({ id: 'f2', tramo_id: 't1', etapa: 'expedicao', url: 'https://s/b.jpg' }),
        foto({ id: 'f3', tramo_id: 't1', etapa: 'expedicao', url: 'https://s/c.jpg' }),
      ],
    });

    expect(corpo).toContain('Fotos anexadas:');
    expect(corpo).toContain('• Horário de chegada portaria: https://s/a.jpg');
    expect(corpo).toContain('• Horário de expedição (foto 1): https://s/b.jpg');
    expect(corpo).toContain('• Horário de expedição (foto 2): https://s/c.jpg');
  });
});

describe('montarCorpoEmailChegada', () => {
  const t = tramo({
    id: 't1', tramo: 'T1', numero_tramo: '4321', numero_nf: '112233', motorista: 'GERALDO', cavalo_placa: 'RTX-3B83', cavalo_uf: 'MG',
    carreta_placa: 'OIL-8H76', carreta_uf: 'BA', data: '2023-09-04',
    hora_chegada_portaria: '09:05', hora_entrada_patio: '12:00', hora_expedicao: '14:00',
  });

  it('leva a identificação do comboio com número do tramo e NF', () => {
    const corpo = montarCorpoEmailChegada({ empresa: 'TRANSMAQUINAS', tramo: t, fotos: [] });

    expect(corpo).toContain('Segue a chegada na portaria do T1 - 4321 TRANSMAQUINAS.');
    expect(corpo).toContain('Tramo: T1 - 4321');
    expect(corpo).toContain('Nota Fiscal: 112233');
    expect(corpo).toContain('Motorista: GERALDO');
    expect(corpo).toContain('Cavalo:      RTX-3B83 /MG');
    expect(corpo).toContain('Horário de chegada portaria: 09:05');
    expect(corpo).not.toContain('Horário de entrada pátio');
    expect(corpo).not.toContain('Horário de expedição');
  });
});

describe('montarAssuntoExpedicao', () => {
  it('identifica o caminhão com sequência, tramo, número do tramo, NF e placa', () => {
    expect(montarAssuntoExpedicao({
      prefixo: 'Expedição Final', sequencia: 1, tramo: 'T1', numeroTramo: '1234', numeroNf: '98765', carretaPlaca: 'xyz9k88',
    })).toBe('Expedição Final 1º T1 - 1234 - NF 98765 - XYZ9K88');
  });

  it('omite a sequência enquanto ela não é conhecida', () => {
    expect(montarAssuntoExpedicao({
      prefixo: 'Chegada Expedição', sequencia: null, tramo: 'T4', numeroTramo: '5566', carretaPlaca: 'ABC1D23',
    })).toBe('Chegada Expedição T4 - 5566 - ABC1D23');
  });

  it('não deixa hífen solto quando a carreta ainda não tem placa', () => {
    expect(montarAssuntoExpedicao({
      prefixo: 'Chegada Expedição', sequencia: 3, tramo: 'T2', carretaPlaca: '  ',
    })).toBe('Chegada Expedição 3º T2');
  });
});

describe('montarMailto', () => {
  it('endereça o destinatário e o assunto padrão e usa CRLF no corpo', () => {
    const url = montarMailto({ corpo: 'linha 1\nlinha 2' });
    expect(url.startsWith('mailto:andre.araujo%40ten.ind.br')).toBe(true);
    expect(url).toContain('subject=Expedi%C3%A7%C3%A3o%20Final');
    expect(url).toContain('linha%201%0D%0Alinha%202');
  });

  it('reconhece o corpo que estouraria o limite do handler do Windows', () => {
    expect(cabeNoMailto(montarMailto({ corpo: 'curto' }))).toBe(true);
    expect(cabeNoMailto(montarMailto({ corpo: 'x'.repeat(LIMITE_MAILTO) }))).toBe(false);
  });
});

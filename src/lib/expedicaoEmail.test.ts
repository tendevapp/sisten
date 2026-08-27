import { describe, it, expect } from 'vitest';
import {
  listarTramos, montarCorpoEmail, montarCorpoEmailChegada, assuntoChegada,
  montarMailto, cabeNoMailto, LIMITE_MAILTO,
} from './expedicaoEmail';
import type { ExpedicaoTramo } from '../types';
import type { FotoComUrl } from './expedicaoEmail';

function tramo(over: Partial<ExpedicaoTramo> & { id: string }): ExpedicaoTramo {
  return {
    carregamento_id: 'c1',
    ordem: 0,
    tramo: 'T1',
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
      id: 't1', tramo: 'T1', motorista: 'GERALDO PEREIRA DA SILVA JUNIOR',
      cavalo_placa: 'RTX-3B83', cavalo_uf: 'MG', carreta_placa: 'OIL-8H76', carreta_uf: 'BA',
      data: '2023-09-04', hora_chegada_portaria: '09:05', hora_entrada_patio: '12:00', hora_expedicao: '14:00',
    }),
    tramo({
      id: 't4', tramo: 'T4', ordem: 1, motorista: 'JOAO ANTONIO SANTANA',
      cavalo_placa: 'RNM-1F01', cavalo_uf: 'MG', carreta_placa: 'RMS-1I48', carreta_uf: 'MG',
      data: '2023-09-04', hora_chegada_portaria: '09:05',
    }),
  ];

  it('reproduz o formato usado pela equipe, com abertura, empresa e um bloco por tramo', () => {
    const corpo = montarCorpoEmail({
      empresa: 'TRANSMAQUINAS',
      observacoes: 'Motoristas com escolta – SERIDÓ',
      tramos,
      fotos: [],
    });

    expect(corpo).toContain('Segue dados para carregamento do T1 e T4 TRANSMAQUINAS.');
    expect(corpo).toContain('Empresa: TRANSMAQUINAS');
    expect(corpo).toContain('Tramo: T1');
    expect(corpo).toContain('Motorista: GERALDO PEREIRA DA SILVA JUNIOR');
    expect(corpo).toContain('Cavalo:      RTX-3B83 /MG');
    expect(corpo).toContain('Carreta:     OIL-8H76 /BA');
    expect(corpo).toContain('Data:         04/09/2023');
    expect(corpo).toContain('Horário de chegada portaria: 09:05');
    expect(corpo).toContain('Horário de entrada pátio: 12:00');
    expect(corpo).toContain('Horário de expedição: 14:00');
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

  it('não vaza a foto de um tramo no bloco de outro', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, tramos,
      fotos: [foto({ id: 'f1', tramo_id: 't4', etapa: 'chegada_portaria', url: 'https://s/so-do-t4.jpg' })],
    });
    const blocoT1 = corpo.slice(corpo.indexOf('Tramo: T1'), corpo.indexOf('Tramo: T4'));
    expect(blocoT1).not.toContain('so-do-t4');
  });

  it('ignora foto cuja URL não pôde ser assinada, sem quebrar a linha do horário', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, tramos: [tramos[0]],
      fotos: [foto({ id: 'f1', tramo_id: 't1', etapa: 'chegada_portaria', url: null })],
    });
    expect(corpo).toContain('Horário de chegada portaria: 09:05');
    expect(corpo).not.toContain('Fotos anexadas:');
  });

  it('exibe data e hora combinadas quando a etapa possui data específica', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X',
      observacoes: null,
      tramos: [tramo({
        id: 't1',
        data_chegada_portaria: '2026-08-27',
        hora_chegada_portaria: '08:30',
        data_expedicao: '2026-08-28',
        hora_expedicao: '16:00',
      })],
      fotos: [],
    });
    expect(corpo).toContain('Horário de chegada portaria: 27/08/2026 às 08:30');
    expect(corpo).toContain('Horário de expedição: 28/08/2026 às 16:00');
  });
});

describe('Dolly e observações por etapa', () => {
  it('inclui a linha do Dolly quando o comboio tem um', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, fotos: [],
      tramos: [tramo({ id: 't1', dolly_placa: 'ABC-1D23', dolly_uf: 'BA' })],
    });
    expect(corpo).toContain('Dolly:       ABC-1D23 /BA');
  });

  it('omite a linha do Dolly quando não há — linha vazia viraria dúvida de quem lê', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, fotos: [], tramos: [tramo({ id: 't1' })],
    });
    expect(corpo).not.toContain('Dolly');
  });

  it('desce a observação da etapa indentada, logo abaixo do horário dela', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, fotos: [],
      tramos: [tramo({
        id: 't1', hora_chegada_portaria: '09:05',
        obs_chegada_portaria: 'Portão 2, aguardando liberação',
        obs_expedicao: 'Saiu com escolta',
      })],
    });
    expect(corpo).toContain('Horário de chegada portaria: 09:05\n   Obs.: Portão 2, aguardando liberação');
    expect(corpo).toContain('   Obs.: Saiu com escolta');
  });

  it('não cria linha de observação para etapa sem texto', () => {
    const corpo = montarCorpoEmail({
      empresa: 'X', observacoes: null, fotos: [],
      tramos: [tramo({ id: 't1', obs_entrada_patio: '   ' })],
    });
    expect(corpo).not.toContain('Obs.:');
  });
});

describe('montarCorpoEmailChegada', () => {
  const t = tramo({
    id: 't1', tramo: 'T1', motorista: 'GERALDO', cavalo_placa: 'RTX-3B83', cavalo_uf: 'MG',
    carreta_placa: 'OIL-8H76', carreta_uf: 'BA', data: '2023-09-04',
    hora_chegada_portaria: '09:05', hora_entrada_patio: '12:00', hora_expedicao: '14:00',
  });

  it('leva a identificação do comboio e só a chegada — as outras etapas não entram', () => {
    const corpo = montarCorpoEmailChegada({ empresa: 'TRANSMAQUINAS', tramo: t, fotos: [] });

    expect(corpo).toContain('Segue a chegada na portaria do T1 TRANSMAQUINAS.');
    expect(corpo).toContain('Motorista: GERALDO');
    expect(corpo).toContain('Cavalo:      RTX-3B83 /MG');
    expect(corpo).toContain('Horário de chegada portaria: 09:05');
    expect(corpo).not.toContain('Horário de entrada pátio');
    expect(corpo).not.toContain('Horário de expedição');
  });

  it('leva a foto e a observação da portaria, e ignora as das outras etapas', () => {
    const corpo = montarCorpoEmailChegada({
      empresa: 'X',
      tramo: { ...t, obs_chegada_portaria: 'Portão 2' },
      fotos: [
        foto({ id: 'f1', tramo_id: 't1', etapa: 'chegada_portaria', url: 'https://s/chegada.jpg' }),
        foto({ id: 'f2', tramo_id: 't1', etapa: 'expedicao', url: 'https://s/saida.jpg' }),
      ],
    });
    expect(corpo).toContain('• Horário de chegada portaria: https://s/chegada.jpg');
    expect(corpo).not.toContain('saida.jpg');
    expect(corpo).toContain('   Obs.: Portão 2');
  });

  it('usa assunto próprio, para o parcial não se confundir com o e-mail final', () => {
    expect(assuntoChegada('TRANSMAQUINAS', 'T1')).toBe('Chegada na portaria - T1 TRANSMAQUINAS');
    expect(assuntoChegada('', 'T4')).toBe('Chegada na portaria - T4');
  });
});

describe('montarMailto', () => {
  it('endereça o destinatário e o assunto padrão e usa CRLF no corpo', () => {
    const url = montarMailto({ corpo: 'linha 1\nlinha 2' });
    expect(url.startsWith('mailto:andre.araujo%40ten.ind.br')).toBe(true);
    expect(url).toContain('subject=Carregamento%20Tramos');
    expect(url).toContain('linha%201%0D%0Alinha%202');
  });

  it('reconhece o corpo que estouraria o limite do handler do Windows', () => {
    expect(cabeNoMailto(montarMailto({ corpo: 'curto' }))).toBe(true);
    expect(cabeNoMailto(montarMailto({ corpo: 'x'.repeat(LIMITE_MAILTO) }))).toBe(false);
  });
});

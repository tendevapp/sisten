import { describe, expect, it } from 'vitest';
import {
  buscarDuplicidadesColaborador,
  construirIndiceDuplicidadeAse,
  formatarResumoOcorrenciaAse,
  normalizarNomeAse,
  normalizarRegistroAse,
  type AseMesmoDiaResumo,
} from './aseDuplicidade';

function criarAse(overrides: Partial<AseMesmoDiaResumo> = {}): AseMesmoDiaResumo {
  return {
    id: 'ase-1',
    numero_protocolo: 'ASE-251126-PROD-01',
    status: 'RASCUNHO',
    data_execucao: '2026-11-25',
    excluido_em: null,
    setor_nome: 'PRODUÇÃO',
    turno_nome: '1º TURNO',
    solicitante_nome: 'Carlos Gestor',
    itens: [],
    ...overrides,
  };
}

describe('normalizacao de chaves de duplicidade ASE', () => {
  it('normaliza registro removendo espacos e tracos vazios', () => {
    expect(normalizarRegistroAse('  ab-123 ')).toBe('AB-123');
    expect(normalizarRegistroAse('-')).toBe('');
    expect(normalizarRegistroAse('—')).toBe('');
    expect(normalizarRegistroAse(null)).toBe('');
  });

  it('normaliza nome removendo acentos e espacos extras', () => {
    expect(normalizarNomeAse('  José   Antônio  da Silva ')).toBe('JOSE ANTONIO DA SILVA');
  });
});

describe('deteccao de colaborador duplicado em outra ASE da mesma data', () => {
  it('alerta colaborador presente em outra ASE em RASCUNHO ou ENVIADO', () => {
    const solicitacoes: AseMesmoDiaResumo[] = [
      criarAse({
        id: 'ase-rascunho',
        numero_protocolo: 'ASE-251126-PROD-01',
        status: 'RASCUNHO',
        solicitante_nome: 'Gestor A',
        itens: [{
          id: 'it-1',
          pessoa_id: 'p-1',
          registro: '1001',
          nome: 'MARIA OLIVEIRA',
          hora_entrada: '17:00',
          hora_saida: '19:00',
        }],
      }),
      criarAse({
        id: 'ase-enviada',
        numero_protocolo: 'ASE-251126-MANUT-01',
        status: 'ENVIADO',
        setor_nome: 'MANUTENÇÃO',
        solicitante_nome: 'Gestor B',
        itens: [{
          id: 'it-2',
          pessoa_id: 'p-1',
          registro: '1001',
          nome: 'MARIA OLIVEIRA',
          hora_entrada: '19:00',
          hora_saida: '21:00',
        }],
      }),
    ];

    const indice = construirIndiceDuplicidadeAse(solicitacoes, 'ase-atual');
    const resultado = buscarDuplicidadesColaborador(indice, {
      pessoa_id: 'p-1',
      registro: '1001',
      nome: 'MARIA OLIVEIRA',
    });

    expect(resultado).toHaveLength(2);
    expect(resultado.map(r => r.protocolo)).toEqual(['ASE-251126-PROD-01', 'ASE-251126-MANUT-01']);
  });

  it('ignora a propria ASE, ASEs canceladas, ASEs excluidas e itens excluidos', () => {
    const solicitacoes: AseMesmoDiaResumo[] = [
      criarAse({
        id: 'ase-atual',
        itens: [{ id: 'it-1', pessoa_id: 'p-1', registro: '1001', nome: 'JOAO', hora_entrada: '', hora_saida: '' }],
      }),
      criarAse({
        id: 'ase-cancelada',
        status: 'CANCELADO',
        itens: [{ id: 'it-2', pessoa_id: 'p-1', registro: '1001', nome: 'JOAO', hora_entrada: '', hora_saida: '' }],
      }),
      criarAse({
        id: 'ase-excluida',
        excluido_em: '2026-11-25T10:00:00Z',
        itens: [{ id: 'it-3', pessoa_id: 'p-1', registro: '1001', nome: 'JOAO', hora_entrada: '', hora_saida: '' }],
      }),
      criarAse({
        id: 'ase-item-excluido',
        itens: [{
          id: 'it-4',
          pessoa_id: 'p-1',
          registro: '1001',
          nome: 'JOAO',
          hora_entrada: '',
          hora_saida: '',
          excluido_em: '2026-11-25T10:05:00Z',
        }],
      }),
    ];

    const indice = construirIndiceDuplicidadeAse(solicitacoes, 'ase-atual');
    expect(buscarDuplicidadesColaborador(indice, { pessoa_id: 'p-1', registro: '1001', nome: 'JOAO' })).toEqual([]);
  });

  it('detecta duplicidade quando um gestor lanca manualmente (Outro) e outro usa o cadastro do RH', () => {
    const solicitacoes: AseMesmoDiaResumo[] = [
      criarAse({
        id: 'ase-outro-gestor',
        numero_protocolo: 'ASE-251126-LOG-01',
        setor_nome: 'EXPEDIÇÃO',
        solicitante_nome: 'Gestor Log',
        itens: [{
          id: 'it-1',
          pessoa_id: 'p-99',
          registro: '2045',
          nome: 'JOSÉ PEREIRA',
          hora_entrada: '07:00',
          hora_saida: '11:00',
        }],
      }),
    ];

    const indice = construirIndiceDuplicidadeAse(solicitacoes, 'ase-atual');

    // Manual apenas com nome (sem acento)
    const porNome = buscarDuplicidadesColaborador(indice, {
      pessoa_id: null,
      registro: '',
      nome: 'jose pereira',
    });
    expect(porNome).toHaveLength(1);
    expect(porNome[0].protocolo).toBe('ASE-251126-LOG-01');

    // Manual apenas com registro
    const porRegistro = buscarDuplicidadesColaborador(indice, {
      pessoa_id: null,
      registro: '2045',
      nome: 'JOSE P.',
    });
    expect(porRegistro).toHaveLength(1);
  });

  it('nao gera falso positivo para homonimos cadastrados com pessoa_id e registro distintos', () => {
    const solicitacoes: AseMesmoDiaResumo[] = [
      criarAse({
        id: 'ase-outro',
        itens: [{
          id: 'it-1',
          pessoa_id: 'p-10',
          registro: '1010',
          nome: 'CARLOS SILVA',
          hora_entrada: '17:00',
          hora_saida: '19:00',
        }],
      }),
    ];

    const indice = construirIndiceDuplicidadeAse(solicitacoes, 'ase-atual');
    const resultado = buscarDuplicidadesColaborador(indice, {
      pessoa_id: 'p-20',
      registro: '2020',
      nome: 'CARLOS SILVA',
    });

    expect(resultado).toEqual([]);
  });

  it('formata resumo legivel com protocolo, status, setor, solicitante e horario', () => {
    expect(formatarResumoOcorrenciaAse({
      solicitacaoId: 'ase-1',
      protocolo: 'ASE-251126-PROD-01',
      status: 'RASCUNHO',
      setorNome: 'PRODUÇÃO',
      turnoNome: '2º TURNO',
      solicitanteNome: 'Ana Lima',
      horaEntrada: '17:00',
      horaSaida: '00:45',
      pessoaId: 'p-1',
    })).toBe('ASE-251126-PROD-01 (Rascunho) · PRODUÇÃO · Solicitante: Ana Lima · 17:00 - 00:45 (+1 dia)');

    expect(formatarResumoOcorrenciaAse({
      solicitacaoId: 'ase-2',
      protocolo: 'ASE-251126-GERAL-01',
      status: 'ENVIADO',
      setorNome: null,
      turnoNome: null,
      solicitanteNome: null,
      horaEntrada: '',
      horaSaida: '',
      pessoaId: null,
    })).toBe('ASE-251126-GERAL-01 (Enviado)');
  });
});

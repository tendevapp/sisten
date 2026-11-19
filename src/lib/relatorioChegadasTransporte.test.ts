import { describe, expect, it } from 'vitest';
import type { PortRegistroTransporte } from '../types';
import {
  atrasosPorDiaDaSemana, ausenciasDeRotasRegulares, avaliarChegadas, diaOperacional, janelaDaHora, minutosDaHora,
  problemasDasJanelas, rankingDeAtrasos, resumirChegadas, resumoPorJanela, type JanelaChegada,
} from './relatorioChegadasTransporte';

const janela = (o: Partial<JanelaChegada>): JanelaChegada => ({
  id: 'm', nome: 'Manhã', inicio: '05:00', fim: '09:00', limite: null, tolerancia_min: 10, ordem: 1, ativo: true, ...o,
});
const MANHA = janela({});
const MADRUGADA = janela({ id: 'n', nome: 'Madrugada', inicio: '21:00', fim: '05:00', ordem: 2 });
const JANELAS = [MANHA, MADRUGADA];

let n = 0;
const reg = (o: Partial<PortRegistroTransporte>): PortRegistroTransporte => ({
  id: `r${++n}`, codigo_formulario: 'FRM.SGP-0009', numero_protocolo: '', data: '2026-11-16', turno: 'MANHA',
  vigilante: '', veiculo: 'Van', placa: 'AAA1A11', empresa: 'EMP', hora_chegada: '06:40', hora_saida: null,
  motorista: 'JOAO', rota: 'R1', ocupacao: 'SIM', observacoes: null, status: 'FINALIZADO', criado_por: null,
  created_at: '', updated_at: '', ...o,
});

describe('janelas', () => {
  it('acha a janela, inclusive a que atravessa a meia-noite, e o dia da leva', () => {
    expect(janelaDaHora(minutosDaHora('06:40'), JANELAS)?.id).toBe('m');
    expect(janelaDaHora(minutosDaHora('00:30'), JANELAS)?.id).toBe('n');
    expect(janelaDaHora(minutosDaHora('11:20'), JANELAS)).toBeNull();
    expect(diaOperacional('2026-11-17', minutosDaHora('00:30')!, MADRUGADA)).toBe('2026-11-16');
    expect(diaOperacional('2026-11-16', minutosDaHora('23:10')!, MADRUGADA)).toBe('2026-11-16');
  });

  it('aponta sobreposição e limite fora da janela', () => {
    expect(problemasDasJanelas(JANELAS)).toEqual([]);
    expect(problemasDasJanelas([MANHA, janela({ nome: 'Outra', inicio: '08:00', fim: '10:00' })])).toEqual(['Manhã e Outra se sobrepõem.']);
    expect(problemasDasJanelas([janela({ limite: '10:00' })])).toEqual(['Manhã: o horário limite fica fora da janela.']);
  });
});

describe('avaliação das chegadas', () => {
  it('sem limite usa o habitual da rota (mediana + tolerância); com limite, o limite', () => {
    const hist = ['06:30', '06:32', '06:34', '06:36'].map((h, i) => reg({ hora_chegada: h, data: `2026-11-0${i + 1}` }));
    const atrasada = reg({ hora_chegada: '06:50', data: '2026-11-10' });
    const av = avaliarChegadas([atrasada], JANELAS, [...hist, atrasada]);
    expect(av[0]).toMatchObject({ situacao: 'atraso', referencia: '06:34', origemReferencia: 'habitual', atrasoMin: 16 });

    const comLimite = avaliarChegadas([reg({ hora_chegada: '06:58' })], [janela({ limite: '06:45' }), MADRUGADA]);
    expect(comLimite[0]).toMatchObject({ situacao: 'atraso', referencia: '06:45', origemReferencia: 'limite', atrasoMin: 13 });
    const dentro = avaliarChegadas([reg({ hora_chegada: '06:52' })], [janela({ limite: '06:45' }), MADRUGADA]);
    expect(dentro[0].situacao).toBe('no_horario');
  });

  it('rota com pouca história fica sem referência; fora das janelas é avulsa', () => {
    const av = avaliarChegadas([reg({ rota: 'NOVA' }), reg({ hora_chegada: '11:22' })], JANELAS);
    expect(av.map(c => c.situacao).sort()).toEqual(['fora_janela', 'sem_referencia']);
  });

  it('madrugada: 23:50 e 00:20 na mesma escala', () => {
    const hist = ['23:40', '23:50', '00:00'].map((h, i) => reg({ rota: 'BATATA', hora_chegada: h, data: `2026-11-0${i + 1}` }));
    const tarde = reg({ rota: 'BATATA', hora_chegada: '00:20', data: '2026-11-11' });
    const [c] = avaliarChegadas([tarde], JANELAS, [...hist, tarde]);
    // Mediana de 23:40, 23:50, 00:00 e 00:20 = 23:55.
    expect(c).toMatchObject({ dia: '2026-11-10', referencia: '23:55', atrasoMin: 25, situacao: 'atraso' });
  });
});

describe('resumos e recorrência', () => {
  const dias = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
  const regs = [
    ...dias.map(d => reg({ data: d, rota: 'R1', hora_chegada: '06:40' })),
    // R2 atrasa em 3 dias e falta num.
    ...dias.slice(0, 4).map((d, i) => reg({ data: d, rota: 'R2', placa: 'BBB2B22', hora_chegada: i < 3 ? '07:10' : '06:40' })),
  ];
  const av = avaliarChegadas(regs, [janela({ limite: '06:45' }), MADRUGADA]);

  it('resumo, janela e ranking', () => {
    const r = resumirChegadas(av);
    expect(r).toMatchObject({ total: 9, avaliadas: 9, atrasos: 3, dias: 5, atrasoMedio: 25 });
    expect(resumoPorJanela(av, [janela({ limite: '06:45' })])[0]).toMatchObject({ chegadas: 9, atrasos: 3, mediana: '06:40' });
    const [primeira] = rankingDeAtrasos(av, c => c.rota);
    expect(primeira).toMatchObject({ chave: 'R2', atrasos: 3, recorrente: true });
  });

  it('ranking junta grafias da mesma empresa', () => {
    const av2 = avaliarChegadas(
      [reg({ empresa: 'GUIMARÃES' }), reg({ empresa: 'GUIMARAES' }), reg({ empresa: 'Guimarães ' })],
      [janela({ limite: '06:45' })],
    );
    const r = rankingDeAtrasos(av2, c => c.registro.empresa);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ chave: 'GUIMARAES', rotulo: 'GUIMARÃES', chegadas: 3 });
  });

  it('rota regular que faltou num dia da leva', () => {
    const aus = ausenciasDeRotasRegulares(av, [janela({ limite: '06:45' })]);
    expect(aus).toHaveLength(1);
    expect(aus[0]).toMatchObject({ rota: 'R2', dias: ['2026-11-13'] });
  });

  it('atrasos por dia da semana começam na segunda', () => {
    const s = atrasosPorDiaDaSemana(av);
    expect(s[0]).toMatchObject({ rotulo: 'Seg', atrasos: 1 });
    expect(s.reduce((t, d) => t + d.atrasos, 0)).toBe(3);
  });
});

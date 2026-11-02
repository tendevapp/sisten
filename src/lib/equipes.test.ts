import { describe, expect, it } from 'vitest';
import {
  INDICADORES, acoesPorJanela, diasDoIntervalo, eventosDaEquipe, formatarDuracao, historicoIndicadores, intervaloRecorte,
  janelasHistorico, membrosDaEquipe, porColaborador, porHora, ritmoMediano, serieDiaria, tendenciaDe,
  type DadosEquipes, type EventoEquipe, type PessoaEquipe,
} from './equipes';

const pessoa = (id: string, setor = '2', status = 'ativo'): PessoaEquipe => ({ id, nome: id.toUpperCase(), setor, status, cargo: null });
// Horário local fixo (sem "Z"): 31/10/2026 às 08:00 + minutos.
const as = (min: number, dia = '2026-10-31') => {
  const [a, m, d] = dia.split('-').map(Number);
  return new Date(a, m - 1, d, 8, min, 0).toISOString();
};
const ev = (p: Partial<EventoEquipe>): EventoEquipe => ({ t: 'cadastro_item', u: 'ana', em: as(0), q: 1, d: null, f: null, n: null, ...p });

describe('período', () => {
  const agora = new Date(2026, 10, 2, 10); // segunda, 02/11/2026
  it('semana começa na segunda e mês passado fecha no último dia', () => {
    expect(intervaloRecorte('semana', { de: '', ate: '' }, agora)).toEqual({ de: '2026-11-02', ate: '2026-11-02' });
    expect(intervaloRecorte('semana_passada', { de: '', ate: '' }, agora)).toEqual({ de: '2026-10-26', ate: '2026-11-01' });
    expect(intervaloRecorte('mes_passado', { de: '', ate: '' }, agora)).toEqual({ de: '2026-10-01', ate: '2026-10-31' });
    expect(intervaloRecorte('periodo', { de: '2026-10-10', ate: '2026-10-05' }, agora)).toEqual({ de: '2026-10-05', ate: '2026-10-10' });
  });
  it('lista os dias sem cair no dia anterior por fuso', () => {
    expect(diasDoIntervalo('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('ritmo', () => {
  it('mediana dos intervalos da mesma pessoa no dia, sem lote (< 5 s) nem pausa (> 30 min)', () => {
    const eventos = [
      ev({ em: as(0) }), ev({ em: as(2) }), ev({ em: as(6) }), // 2 e 4 min
      ev({ em: as(80) }), // pausa de 74 min: fora
      ev({ em: new Date(new Date(as(80)).getTime() + 2000).toISOString() }), // lote de 2 s: fora
      ev({ u: 'bia', em: as(1) }), // outra pessoa: não mistura
    ];
    expect(ritmoMediano(eventos, ['cadastro_item'])).toBe(180);
  });
});

describe('equipe', () => {
  const dados: DadosEquipes = {
    de: '2026-10-31', ate: '2026-10-31',
    pessoas: [pessoa('ana'), pessoa('bia'), pessoa('caio'), pessoa('dani', '5'), pessoa('ex', '2', 'inativo')],
    eventos: [
      ...Array.from({ length: 10 }, (_, i) => ev({ u: 'ana', em: as(i * 3) })),
      ...Array.from({ length: 4 }, (_, i) => ev({ u: 'bia', em: as(i * 3) })),
      ev({ u: 'dani', t: 'balcao_baixa_sap', em: as(5) }),
      ev({ u: 'ana', t: 'uso_dia', q: 30, n: 2, d: 3600 }),
    ],
  };

  it('membros: do setor (ativos), e quem é de fora só com a opção ligada', () => {
    expect(membrosDaEquipe(dados, { setor: '2', incluirDeFora: false }).map(p => p.id)).toEqual(['ana', 'bia', 'caio']);
    expect(membrosDaEquipe(dados, { setor: '2', incluirDeFora: true }).map(p => p.id)).toContain('dani');
  });

  it('série diária e distribuição por hora contam só ações (não o uso do sistema)', () => {
    const eventos = eventosDaEquipe(dados, { setor: '2', incluirDeFora: false });
    expect(serieDiaria(eventos, '2026-10-31', '2026-10-31')).toEqual([{ dia: '2026-10-31', acoes: 14 }]);
    expect(porHora(eventos)[8]).toBe(14);
  });
});

describe('Suprimentos', () => {
  const dados: DadosEquipes = {
    de: '2026-10-31', ate: '2026-10-31',
    pessoas: [pessoa('ita', '5'), pessoa('isa', '5')],
    eventos: [
      ev({ u: 'ita', t: 'sup_pedido', d: 5 * 86400, v: 1000 }),
      ev({ u: 'ita', t: 'sup_pedido', em: as(10), d: 3 * 86400, v: 500 }),
      ev({ u: 'ita', t: 'sup_carteira', d: 40 * 86400, f: true }),
      ev({ u: 'ita', t: 'sup_entrega', f: true }),
      ev({ u: 'isa', t: 'sup_pedido', d: 9 * 86400, v: 200 }),
    ],
  };
  const filtro = { setor: '5', incluirDeFora: false };
  const eventos = eventosDaEquipe(dados, filtro);
  const ita = porColaborador(eventos, membrosDaEquipe(dados, filtro), INDICADORES).find(l => l.pessoa.id === 'ita')!;

  it('valor, lead time e carteira de hoje pelas regras dos dashboards', () => {
    expect(ita.valores.sup_itens).toBe(2);
    expect(ita.valores.sup_valor).toBe(1500);
    expect(ita.valores.sup_lead).toBe(4 * 86400);
    expect(ita.valores.sup_carteira_criticos).toBe(1);
    expect(ita.valores.sup_otd).toBe(100);
  });

  it('carteira e entrega do fornecedor não contam como ação da pessoa', () => {
    expect(ita.acoes).toBe(2);
  });
});

describe('histórico', () => {
  it('semana em curso contra as mesmas datas das semanas anteriores', () => {
    const j = janelasHistorico('semana', { de: '2026-11-02', ate: '2026-11-04' }, 3);
    expect(j.map(x => [x.de, x.ate])).toEqual([['2026-10-19', '2026-10-21'], ['2026-10-26', '2026-10-28'], ['2026-11-02', '2026-11-04']]);
  });

  it('mês em curso contra os mesmos dias; mês fechado contra meses inteiros', () => {
    expect(janelasHistorico('mes', { de: '2026-11-01', ate: '2026-11-02' }, 2).map(x => [x.de, x.ate, x.rotulo]))
      .toEqual([['2026-10-01', '2026-10-02', 'out/26'], ['2026-11-01', '2026-11-02', 'nov/26']]);
    expect(janelasHistorico('mes_passado', { de: '2026-10-01', ate: '2026-10-31' }, 2).map(x => [x.de, x.ate]))
      .toEqual([['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-10-31']]);
  });

  it('tendência pela direção do indicador (tempo: menor é melhor) com faixa de 10%', () => {
    const itens = INDICADORES.find(i => i.id === 'sup_itens')!;
    const lead = INDICADORES.find(i => i.id === 'sup_lead')!;
    const valor = INDICADORES.find(i => i.id === 'sup_valor')!;
    expect(tendenciaDe(itens, 12, 10)).toBe('melhorou');
    expect(tendenciaDe(itens, 10.5, 10)).toBe('estavel');
    expect(tendenciaDe(lead, 4, 5)).toBe('melhorou');
    expect(tendenciaDe(lead, 6, 5)).toBe('piorou');
    expect(tendenciaDe(valor, 900, 100)).toBe('neutro');
    expect(tendenciaDe(itens, 3, 0)).toBe('melhorou');
  });

  it('valores por janela, anterior, média e variação', () => {
    const j = janelasHistorico('semana', { de: '2026-10-26', ate: '2026-11-01' }, 3);
    const pedido = (dia: string) => ev({ t: 'sup_pedido', em: as(0, dia) });
    const eventos = [pedido('2026-10-13'), pedido('2026-10-20'), pedido('2026-10-21'), pedido('2026-10-27'), pedido('2026-10-28'), pedido('2026-10-29')];
    const h = historicoIndicadores(eventos, j, INDICADORES).find(x => x.indicador.id === 'sup_itens')!;
    expect(h.valores).toEqual([1, 2, 3]);
    expect(h.anterior).toBe(2);
    expect(h.mediaAnteriores).toBe(1.5);
    expect(h.variacao).toBeCloseTo(0.5, 6);
    expect(h.tendencia).toBe('melhorou');
    expect(acoesPorJanela(eventos, j)).toEqual([1, 2, 3]);
  });
});

describe('formatarDuracao', () => {
  it('escala de segundos a dias', () => {
    expect(formatarDuracao(45)).toBe('45 s');
    expect(formatarDuracao(720)).toBe('12 min');
    expect(formatarDuracao(12000)).toBe('3 h 20 min');
    expect(formatarDuracao(187200)).toBe('2 d 4 h');
  });
});

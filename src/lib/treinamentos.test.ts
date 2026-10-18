import { describe, it, expect } from 'vitest';
import {
  aplicarMissaoLocal,
  argsRegistrarMissao,
  caminhoArquivoTrilha,
  lerEventoTrilha,
  mensagemCarregarProgresso,
  progressoParaTrilha,
  resumirProgresso,
  type ProgressoMissao,
} from './treinamentos';

const T = 'trilha-1';

function linha(missao: number, extra: Partial<ProgressoMissao> = {}): ProgressoMissao {
  return {
    trilha_id: T,
    missao,
    titulo_missao: null,
    insignia: null,
    xp: 100,
    estrelas: 2,
    acertos: 3,
    perguntas: 4,
    erros_jogo: 1,
    tentativas: 1,
    concluida_em: `2026-10-0${missao}T10:00:00Z`,
    atualizado_em: `2026-10-0${missao}T10:00:00Z`,
    ...extra,
  };
}

describe('resumirProgresso', () => {
  it('trilha sem progresso: não iniciada', () => {
    const r = resumirProgresso({ id: T, total_missoes: 11 }, []);
    expect(r).toMatchObject({ missoesConcluidas: 0, total: 11, percentual: 0, xp: 0, status: 'nao_iniciada', concluidaEm: null });
  });

  it('soma XP e estrelas e calcula percentual', () => {
    const r = resumirProgresso({ id: T, total_missoes: 4 }, [linha(1), linha(2, { xp: 50, estrelas: 3 })]);
    expect(r).toMatchObject({ missoesConcluidas: 2, percentual: 50, xp: 150, estrelas: 5, status: 'em_andamento' });
    expect(r.ultimaAtividade).toBe('2026-10-02T10:00:00Z');
  });

  it('concluída quando todas as missões estão feitas; data = última conclusão', () => {
    const r = resumirProgresso({ id: T, total_missoes: 2 }, [linha(2), linha(1)]);
    expect(r.status).toBe('concluida');
    expect(r.concluidaEm).toBe('2026-10-02T10:00:00Z');
  });

  it('ignora outra trilha e missão fora da faixa', () => {
    const r = resumirProgresso({ id: T, total_missoes: 2 }, [linha(1), linha(5), { ...linha(2), trilha_id: 'outra' }]);
    expect(r.missoesConcluidas).toBe(1);
  });
});

describe('progressoParaTrilha / mensagemCarregarProgresso', () => {
  it('monta best/stars/done por número da missão', () => {
    const p = progressoParaTrilha(T, [linha(1, { xp: 320, estrelas: 3 }), linha(4, { xp: 90, estrelas: 1 })]);
    expect(p).toEqual({ best: { '1': 320, '4': 90 }, stars: { '1': 3, '4': 1 }, done: { '1': true, '4': true } });
  });

  it('mensagem segue o protocolo da trilha', () => {
    const m = mensagemCarregarProgresso(T, [linha(1)], 'Fulano', 'dark');
    expect(m).toMatchObject({ destino: 'trilha', evento: 'carregar-progresso', nome: 'Fulano', tema: 'dark' });
    expect(m.progresso.done['1']).toBe(true);
  });
});

describe('lerEventoTrilha', () => {
  it('recusa o que não é do protocolo', () => {
    expect(lerEventoTrilha(null)).toBeNull();
    expect(lerEventoTrilha('pronta')).toBeNull();
    expect(lerEventoTrilha({ evento: 'pronta' })).toBeNull();
    expect(lerEventoTrilha({ origem: 'outro', evento: 'pronta' })).toBeNull();
    expect(lerEventoTrilha({ origem: 'trilha-x', evento: 'hack' })).toBeNull();
    expect(lerEventoTrilha({ origem: 'trilha-x', evento: 'missao-concluida', missao: 0 })).toBeNull();
  });

  it('lê pronta e trilha-concluida', () => {
    expect(lerEventoTrilha({ origem: 'trilha-sup0004', evento: 'pronta' })).toEqual({ evento: 'pronta' });
    expect(lerEventoTrilha({ origem: 'trilha-sup0004', evento: 'trilha-concluida', xpTotal: 4300 })).toEqual({ evento: 'trilha-concluida', xpTotal: 4300 });
  });

  it('lê missão concluída (payload real da trilha PO.SUP-0004) e limita estrelas', () => {
    const ev = lerEventoTrilha({
      origem: 'trilha-sup0004', evento: 'missao-concluida', usuario: null,
      missao: 4, titulo: 'Fluxo da compra normal', insignia: 'Guardião do SLA',
      xpMissao: 512, estrelas: 7, acertos: 4, perguntas: 4, errosJogo: null, xpTotal: 1500, missoesConcluidas: 4,
    });
    expect(ev).toEqual({
      evento: 'missao-concluida', missao: 4, titulo: 'Fluxo da compra normal', insignia: 'Guardião do SLA',
      xpMissao: 512, estrelas: 3, acertos: 4, perguntas: 4, errosJogo: null,
    });
    expect(argsRegistrarMissao(T, ev as any)).toMatchObject({ p_trilha_id: T, p_missao: 4, p_xp: 512, p_estrelas: 3, p_erros_jogo: null });
  });
});

describe('aplicarMissaoLocal', () => {
  const ev = { evento: 'missao-concluida' as const, missao: 1, titulo: null, insignia: null, xpMissao: 80, estrelas: 3, acertos: 4, perguntas: 4, errosJogo: 0 };

  it('acrescenta missão nova', () => {
    const r = aplicarMissaoLocal([], T, ev, '2026-10-18T12:00:00Z');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ missao: 1, xp: 80, estrelas: 3, tentativas: 1 });
  });

  it('refazer nunca piora XP/estrelas', () => {
    const r = aplicarMissaoLocal([linha(1, { xp: 100, estrelas: 2 })], T, ev, '2026-10-18T12:00:00Z');
    expect(r[0]).toMatchObject({ xp: 100, estrelas: 3, tentativas: 2, atualizado_em: '2026-10-18T12:00:00Z' });
  });
});

describe('caminhoArquivoTrilha', () => {
  it('gera caminho seguro por setor', () => {
    expect(caminhoArquivoTrilha('5', 'PO.SUP-0004 Rev. 08', new Date(1000))).toBe('setor-5/po-sup-0004-rev-08-1000.html');
    expect(caminhoArquivoTrilha('2', '***', new Date(5))).toBe('setor-2/trilha-5.html');
  });
});

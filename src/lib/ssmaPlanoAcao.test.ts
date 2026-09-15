import { describe, expect, it } from 'vitest';
import type { SsmaRidDesvio, SsmaRidPlanoAcao } from '../types';
import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';

describe('SSMA RID — Plano de Ação de Fechamento', () => {
  it('gera código no formato padronizado RID-DDMMYY-INDICE', () => {
    const cod = gerarCodigoFormulario('RID', '2026-09-15', 1);
    expect(cod).toBe('RID-150926-01');

    const cod2 = gerarCodigoFormulario('RID', '2026-09-15', 12);
    expect(cod2).toBe('RID-150926-12');
  });

  it('calcula próximo índice a partir de códigos existentes', () => {
    const codigosExistentes = ['RID-150926-01', 'RID-150926-02', 'RID-150926-05'];
    const prox = proximoIndiceCodigo('RID', codigosExistentes);
    expect(prox).toBe(6);
  });

  it('estrutura corretamente o objeto do plano de ação de fechamento', () => {
    const plano: SsmaRidPlanoAcao = {
      area_destino: 'MANUTENÇÃO',
      descricao_demanda: '@MARCELO SILVA providenciar substituição da válvula defeituosa',
      responsaveis_mencionados: ['MARCELO SILVA'],
      prazo: '2026-09-20',
      status: 'PENDENTE',
      conclusao: null,
      concluido_em: null,
      concluido_por_nome: null,
      atualizado_em: '2026-09-15T18:00:00Z',
      atualizado_por: 'user-123',
    };

    expect(plano.area_destino).toBe('MANUTENÇÃO');
    expect(plano.responsaveis_mencionados).toContain('MARCELO SILVA');
    expect(plano.status).toBe('PENDENTE');
    expect(plano.conclusao).toBeNull();
  });

  it('atualiza status para CONCLUIDO com dados de fechamento', () => {
    const plano: SsmaRidPlanoAcao = {
      area_destino: 'MANUTENÇÃO',
      descricao_demanda: '@MARCELO SILVA providenciar substituição da válvula',
      responsaveis_mencionados: ['MARCELO SILVA'],
      prazo: '2026-09-20',
      status: 'CONCLUIDO',
      conclusao: 'Válvula nova instalada e testada sob pressão nominal.',
      concluido_em: '2026-09-18T14:30:00Z',
      concluido_por_nome: 'MARCELO SILVA',
      atualizado_em: '2026-09-18T14:30:00Z',
      atualizado_por: 'user-123',
    };

    expect(plano.status).toBe('CONCLUIDO');
    expect(plano.conclusao).toBe('Válvula nova instalada e testada sob pressão nominal.');
    expect(plano.concluido_por_nome).toBe('MARCELO SILVA');
  });

  it('filtra desvios com demandas direcionadas por área e status', () => {
    const desviosMock: Partial<SsmaRidDesvio>[] = [
      {
        id: '1',
        numero_registro: 'RID-150926-01',
        plano_acao: {
          area_destino: 'MANUTENÇÃO',
          descricao_demanda: 'Trocar cabo de aço',
          responsaveis_mencionados: ['JOAO SILVA'],
          status: 'PENDENTE',
        },
      },
      {
        id: '2',
        numero_registro: 'RID-150926-02',
        plano_acao: {
          area_destino: 'PRODUÇÃO',
          descricao_demanda: 'Reorganizar bancadas de montagem',
          responsaveis_mencionados: ['MARIA SOUZA'],
          status: 'CONCLUIDO',
          conclusao: 'Bancadas realinhadas',
        },
      },
      {
        id: '3',
        numero_registro: 'RID-150926-03',
        plano_acao: null,
      },
    ];

    const comPlano = desviosMock.filter((d) => d.plano_acao !== null);
    expect(comPlano).toHaveLength(2);

    const daManutencao = desviosMock.filter((d) => d.plano_acao?.area_destino === 'MANUTENÇÃO');
    expect(daManutencao).toHaveLength(1);
    expect(daManutencao[0].numero_registro).toBe('RID-150926-01');

    const concluidos = desviosMock.filter((d) => d.plano_acao?.status === 'CONCLUIDO');
    expect(concluidos).toHaveLength(1);
    expect(concluidos[0].numero_registro).toBe('RID-150926-02');
  });

  it('busca usuários para menção retornando lista de usuários do SISTEN', async () => {
    const { buscarUsuariosParaMencao } = await import('./ssmaApi');
    const usuarios = await buscarUsuariosParaMencao();
    expect(Array.isArray(usuarios)).toBe(true);
    // Todos os itens retornados devem ter origem 'sisten' e nomes preenchidos
    for (const u of usuarios) {
      expect(u.nome).toBeDefined();
      expect(u.origem).toBe('sisten');
    }
  });

  it('calcula contagem de dias em aberto corretamente', async () => {
    const { calcularDiasEmAberto } = await import('./ssmaApi');

    // Conclusão com data fixa
    const resConcluido = calcularDiasEmAberto('2026-09-01', '2026-09-05');
    expect(resConcluido.concluido).toBe(true);
    expect(resConcluido.dias).toBe(4);
    expect(resConcluido.texto).toBe('Concluído em 4 dias');

    // Conclusão no mesmo dia
    const resMesmoDia = calcularDiasEmAberto('2026-09-01', '2026-09-01');
    expect(resMesmoDia.dias).toBe(0);
    expect(resMesmoDia.texto).toBe('Concluído em 0 dias');

    // Entrada nula
    const resNulo = calcularDiasEmAberto(null);
    expect(resNulo.dias).toBe(0);
    expect(resNulo.texto).toBe('0 dias');
  });
});

import { describe, expect, it } from 'vitest';
import {
  ETAPAS_CHECKLIST_LIBERACAO,
  agruparTramosPorTorre,
  avaliarCriticidadeEspera,
  calcularIndicadoresDecisao,
  calcularProgressoChecklist,
  type ApontamentoChecklistLiberacao,
  type TramoEntrega,
} from './producaoEntrega';

describe('producaoEntrega - Controle de Entrega e Tomada de Decisão', () => {
  const criarTramo = (
    torre: number,
    tramo: 'T1' | 'T2' | 'T3' | 'T4' | 'T5',
    serie: number,
    categoria: any,
    etapa: string,
    diasEspera = 1,
  ): TramoEntrega => ({
    id: `${tramo}-${serie}`,
    projeto: 'GW_JACOBINA',
    torre_numero: torre,
    tramo,
    serie,
    subprojeto_id: 'SP01',
    etapa_categoria: categoria,
    etapa_nome: etapa,
    status_aguardando: 'Aguardando teste',
    data_entrada_etapa: new Date().toISOString(),
    dias_espera: diasEspera,
    observacao: null,
    updated_at: new Date().toISOString(),
  });

  it('classifica corretamente torre 100% expedida', () => {
    const tramos: TramoEntrega[] = [
      criarTramo(1, 'T1', 3143, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T2', 3144, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T3', 3145, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T4', 3146, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T5', 3147, 'expedido', 'EXPEDIDO', 0),
    ];

    const [torre1] = agruparTramosPorTorre(tramos);
    expect(torre1.status_conjunto).toBe('completa_expedida');
    expect(torre1.tramos_prontos).toBe(5);
    expect(torre1.tramos_expedidos).toBe(5);
    expect(torre1.percentual_prontidao).toBe(100);
  });

  it('identifica torre "quase pronta" (4 de 5 tramos prontos - foco prioritário de desbloqueio)', () => {
    const tramos: TramoEntrega[] = [
      criarTramo(2, 'T5', 3182, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T4', 3156, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T3', 3160, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T2', 3169, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T1', 3148, 'patio', 'MONTAGEM', 5), // em montagem / pátio pendente
    ];

    const [torre2] = agruparTramosPorTorre(tramos);
    expect(torre2.tramos_prontos).toBe(5); // 4 expedidos + 1 patio = 5
    expect(torre2.status_conjunto).toBe('completa_patio');

    // Se T1 estiver em fabricação (ex: white), é 'quase_pronta'
    const tramosComWip: TramoEntrega[] = [
      criarTramo(2, 'T5', 3182, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T4', 3156, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T3', 3160, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T2', 3169, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T1', 3148, 'white', 'MONTAGEM', 5), // em montagem white
    ];

    const [torre2Wip] = agruparTramosPorTorre(tramosComWip);
    expect(torre2Wip.status_conjunto).toBe('quase_pronta');
    expect(torre2Wip.tramos_prontos).toBe(4);
    expect(torre2Wip.percentual_prontidao).toBe(80);
    expect(torre2Wip.tramo_gargalo?.tramo).toBe('T1');
    expect(torre2Wip.maior_tempo_espera).toBe(5);
  });

  it('avalia faixas de criticidade de tempo de espera', () => {
    expect(avaliarCriticidadeEspera(1).nivel).toBe('normal');
    expect(avaliarCriticidadeEspera(2).nivel).toBe('normal');
    expect(avaliarCriticidadeEspera(3).nivel).toBe('atencao');
    expect(avaliarCriticidadeEspera(4).nivel).toBe('atencao');
    expect(avaliarCriticidadeEspera(5).nivel).toBe('critico');
    expect(avaliarCriticidadeEspera(8).nivel).toBe('critico');
  });

  it('calcula indicadores consolidados de tomada de decisão', () => {
    const tramos: TramoEntrega[] = [
      criarTramo(1, 'T1', 3143, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T2', 3144, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T3', 3145, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T4', 3146, 'expedido', 'EXPEDIDO', 0),
      criarTramo(1, 'T5', 3147, 'expedido', 'EXPEDIDO', 0),

      criarTramo(2, 'T5', 3182, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T4', 3156, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T3', 3160, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T2', 3169, 'expedido', 'EXPEDIDO', 0),
      criarTramo(2, 'T1', 3148, 'white', 'MONTAGEM', 6), // Crítico > 4 dias

      criarTramo(3, 'T5', 3192, 'white', 'MONTAGEM', 2),
      criarTramo(3, 'T4', 3151, 'patio', 'EXPEDIDO', 1),
      criarTramo(3, 'T3', 3150, 'patio', 'PÁTIO', 2),
      criarTramo(3, 'T2', 3149, 'patio', 'EXPEDIDO', 1),
      criarTramo(3, 'T1', 3153, 'patio', 'PINTURA', 4), // Crítico >= 4 dias
    ];

    const torres = agruparTramosPorTorre(tramos);
    const kpis = calcularIndicadoresDecisao(tramos, torres);

    expect(kpis.totalTorres).toBe(3);
    expect(kpis.torresExpedidas).toBe(1);
    expect(kpis.torresQuaseProntas).toBe(2); // Torre 2 e Torre 3 têm 4/5 prontos!
    expect(kpis.tramosCriticos.length).toBe(2);
    expect(kpis.tramosCriticos[0].dias_espera).toBe(6);
    expect(kpis.contagemCategorias.expedido).toBe(9);
    expect(kpis.contagemCategorias.white).toBe(2);
    expect(kpis.contagemCategorias.patio).toBe(4);
  });
});

describe('producaoEntrega - Checklist de Liberação (White → Expedido)', () => {
  const criarApontamento = (
    etapa: ApontamentoChecklistLiberacao['etapa_codigo'],
    excluidoEm: string | null = null,
  ): ApontamentoChecklistLiberacao => ({
    id: `evt-${etapa}`,
    tramo_entrega_id: 'T1-3143',
    etapa_codigo: etapa,
    concluida_em: new Date().toISOString(),
    concluida_por: 'Fulano',
    observacao: null,
    excluido_em: excluidoEm,
    created_at: new Date().toISOString(),
  });

  it('começa em 0/total quando não há apontamentos', () => {
    const progresso = calcularProgressoChecklist([]);
    expect(progresso.concluidas).toBe(0);
    expect(progresso.total).toBe(ETAPAS_CHECKLIST_LIBERACAO.length);
    expect(progresso.percentual).toBe(0);
  });

  it('conta apenas apontamentos ativos (ignora os desmarcados)', () => {
    const apontamentos = [
      criarApontamento('estrutura_multiviga'),
      criarApontamento('tampas_flange'),
      criarApontamento('limpeza', new Date().toISOString()), // desmarcada
    ];

    const progresso = calcularProgressoChecklist(apontamentos);
    expect(progresso.concluidas).toBe(2);
    expect(progresso.total).toBe(ETAPAS_CHECKLIST_LIBERACAO.length);
  });

  it('chega a 100% quando todas as etapas estão apontadas', () => {
    const apontamentos = ETAPAS_CHECKLIST_LIBERACAO.map(e => criarApontamento(e.codigo));
    const progresso = calcularProgressoChecklist(apontamentos);
    expect(progresso.concluidas).toBe(ETAPAS_CHECKLIST_LIBERACAO.length);
    expect(progresso.percentual).toBe(100);
  });
});

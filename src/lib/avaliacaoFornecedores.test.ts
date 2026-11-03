import { describe, expect, it } from 'vitest';
import {
  FRM_SUP_0005,
  QUESTOES_FRM,
  TIPOS_OCORRENCIA,
  calcularNotaFrm,
  faixaDaNota,
  frmVencida,
  novoItemOcorrencia,
  ocorrenciasDasPendencias,
  otd,
  subtrairMeses,
  sugerirRespostasFrm,
  taxaPedidosComOcorrencia,
  tipoSugeridoDaPendencia,
  validarLancamento,
  type RefPendencia,
} from './avaliacaoFornecedores';

describe('FRM.SUP-0005 — pesos', () => {
  it('critérios somam 100% e as questões de cada critério também', () => {
    const total = FRM_SUP_0005.reduce((s, c) => s + c.peso, 0);
    expect(total).toBeCloseTo(1, 10);
    for (const c of FRM_SUP_0005) {
      expect(c.questoes.reduce((s, q) => s + q.peso, 0)).toBeCloseTo(1, 10);
    }
    expect(QUESTOES_FRM).toHaveLength(12);
  });

  it('toda pergunta citada no catálogo de ocorrências existe no FRM', () => {
    const ids = new Set(QUESTOES_FRM.map(q => q.id));
    for (const t of TIPOS_OCORRENCIA) {
      if (t.questaoFrm) expect(ids.has(t.questaoFrm)).toBe(true);
    }
  });
});

describe('calcularNotaFrm', () => {
  // Respostas da planilha anexada (TECNOTEXTIL, 30/11/2021): nota final 95%
  const planilha = {
    '1.1': 1, '1.2': 2, '2.1': 2, '2.2': 2, '3.1': 1,
    '4.1': 3, '4.2': 1, '4.3': 1, '5.1': 3, '6.1': 3, '7.1': 1, '8.1': 1,
  };

  it('reproduz a planilha: 95%, com Custo valendo 5%', () => {
    const r = calcularNotaFrm(planilha);
    expect(r.notaFinal).toBeCloseTo(0.95, 4);
    expect(r.porCriterio.CUSTO).toBeCloseTo(0.05, 4);
    expect(r.porCriterio.PRAZO).toBeCloseTo(0.2, 4);
    expect(r.porCriterio.QUALIDADE).toBeCloseTo(0.2, 4);
    expect(r.completo).toBe(true);
  });

  it('4.1 "Médio — até 5%" vale metade da questão (3 p.p. de 6)', () => {
    const r = calcularNotaFrm({ ...planilha, '4.1': 2 });
    expect(r.porCriterio.QUALIDADE).toBeCloseTo(0.17, 4);
    expect(r.notaFinal).toBeCloseTo(0.92, 4);
  });

  it('"Não aplicável" conta como atendido', () => {
    expect(calcularNotaFrm({ ...planilha, '4.3': 3 }).porCriterio.QUALIDADE).toBeCloseTo(0.2, 4);
  });

  it('marca incompleto quando falta resposta', () => {
    const r = calcularNotaFrm({ '1.1': 2 });
    expect(r.completo).toBe(false);
    expect(r.respondidas).toBe(1);
  });
});

describe('faixaDaNota', () => {
  it('classifica pelas faixas', () => {
    expect(faixaDaNota(0.95).classificacao).toBe('POSITIVA');
    expect(faixaDaNota(0.8).decisao).toBe('MANTER');
    expect(faixaDaNota(0.7).classificacao).toBe('REGULAR');
    expect(faixaDaNota(0.3).decisao).toBe('DESQUALIFICAR');
  });
});

describe('pendências → ocorrências', () => {
  const rec = (motivo: string, extra: Partial<RefPendencia> = {}): RefPendencia => ({
    ref: `REC:${motivo}-${Math.random()}`, origem: 'PEND_RECEBIMENTO', motivo, ...extra,
  });

  it('mapeia motivo do recebimento e causa da NF', () => {
    expect(tipoSugeridoDaPendencia(rec('parcial'))).toBe('PARCIAL_NAO_ALINHADA');
    expect(tipoSugeridoDaPendencia(rec('avaria'))).toBe('AVARIA');
    expect(tipoSugeridoDaPendencia({ ref: 'NF:1', origem: 'PEND_NF', causa: 'Divergência de valor, ICMS ou base de cálculo' })).toBe('NF_IMPOSTO');
    expect(tipoSugeridoDaPendencia({ ref: 'NF:2', origem: 'PEND_NF', causa: 'Outro' })).toBe('NF_DESACORDO');
  });

  it('parcial + pendência na NF viram 2 ocorrências no mesmo lançamento', () => {
    const itens = ocorrenciasDasPendencias([
      rec('parcial', { material_code: '1324813', descricao: 'FITA', qtd_pedido: 28, qtd_recebida: 10, unidade: 'UN' }),
      { ref: 'NF:9', origem: 'PEND_NF', causa: 'Nota fiscal em desacordo com o pedido', nota_fiscal: '123' },
    ]);
    expect(itens.map(i => i.tipo)).toEqual(['PARCIAL_NAO_ALINHADA', 'NF_DESACORDO']);
    expect(itens[0].descricao).toContain('pedido 28, recebido 10 UN');
    expect(itens[1].deteccao).toBe('CONFERENCIA_FISCAL');
  });

  it('várias avarias no mesmo PO viram uma ocorrência moderada', () => {
    const itens = ocorrenciasDasPendencias([rec('avaria'), rec('avaria')]);
    expect(itens).toHaveLength(1);
    expect(itens[0].gravidade).toBe(2);
    expect(itens[0].ref?.split(',')).toHaveLength(2);
  });
});

describe('validarLancamento', () => {
  it('exige fornecedor, tipo e estrelas', () => {
    expect(validarLancamento({ fornecedor_nome: '', estrelas: 3, ocorrencias: [novoItemOcorrencia('AVARIA')] })).toMatch(/fornecedor/);
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: 3, ocorrencias: [novoItemOcorrencia('')] })).toMatch(/tipo/);
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: null, ocorrencias: [novoItemOcorrencia('AVARIA')] })).toMatch(/estrelas/);
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: 3, ocorrencias: [novoItemOcorrencia('OUTRA')] })).toMatch(/Descreva/);
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: 4, ocorrencias: [novoItemOcorrencia('AVARIA')] })).toBeNull();
  });

  it('"Outros" da nota fiscal exige o texto digitado', () => {
    const sem = novoItemOcorrencia('NF_OUTROS');
    expect(sem.categoria).toBe('NOTA_FISCAL');
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: 3, ocorrencias: [sem] })).toMatch(/Outros/);
    expect(validarLancamento({ fornecedor_nome: 'X', estrelas: 3, ocorrencias: [{ ...sem, descricao: 'CST errado' }] })).toBeNull();
  });
});

describe('sugerirRespostasFrm', () => {
  it('sem ocorrência sugere o cenário limpo (MA/SMS não aplicável)', () => {
    const s = sugerirRespostasFrm({ ocorrencias: [], pedidos: 10 });
    expect(s['1.1'].valor).toBe(2);
    expect(s['3.1'].valor).toBe(1);
    expect(s['4.1'].valor).toBe(3);
    expect(s['5.1'].valor).toBe(3);
    const respostas = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.valor]));
    expect(calcularNotaFrm(respostas).notaFinal).toBeCloseTo(1, 4);
  });

  it('atraso, NF com problema e falta de retorno pesam nas perguntas certas', () => {
    const s = sugerirRespostasFrm({
      pedidos: 40,
      ocorrencias: [
        { tipo: 'PARCIAL_NAO_ALINHADA', codigo: 'OCF-1', nro_pedido: 'A' },
        { tipo: 'NF_DESACORDO', codigo: 'OCF-1', nro_pedido: 'A' },
        { tipo: 'SEM_RETORNO', codigo: 'OCF-2', nro_pedido: 'B' },
        { tipo: 'OUTRA', codigo: 'OCF-3', nro_pedido: 'C', impactos: ['PARADA'] },
      ],
    });
    expect(s['2.1'].valor).toBe(1);
    expect(s['2.2'].valor).toBe(1);
    expect(s['3.1'].valor).toBe(2);
    // 1 de 40 pedidos = 2,5% → Médio
    expect(s['4.1'].valor).toBe(2);
    expect(s['4.1'].motivo).toContain('1 de 40');
  });

  it('ocorrências de entrega pesam em Atendimento (3.1) e Qualidade (4.1)', () => {
    const s = sugerirRespostasFrm({
      pedidos: 100,
      ocorrencias: [
        { tipo: 'ENTREGA_SEM_AGENDAMENTO', nro_pedido: 'A' },
        { tipo: 'ENTREGA_DANO_TRANSPORTE', nro_pedido: 'B' },
      ],
    });
    expect(s['3.1'].valor).toBe(2);
    expect(s['4.1'].valor).toBe(2);
    expect(s['2.1'].valor).toBe(2);
  });

  it('valor diferente da cotação pesa no 1.1; NCM e alíquota no 4.1', () => {
    const s = sugerirRespostasFrm({
      pedidos: 100,
      ocorrencias: [
        { tipo: 'NF_VALOR_COTACAO', nro_pedido: 'A' },
        { tipo: 'NF_NCM', nro_pedido: 'B' },
        { tipo: 'NF_ALIQUOTA', nro_pedido: 'B' },
      ],
    });
    expect(s['1.1'].valor).toBe(1);
    expect(s['4.1'].valor).toBe(2);
    expect(s['4.1'].motivo).toContain('1 de 100');
  });

  it('4.1 acima de 5% dos pedidos vira "Alto"', () => {
    const s = sugerirRespostasFrm({
      pedidos: 10,
      ocorrencias: [{ tipo: 'AVARIA', nro_pedido: 'A' }, { tipo: 'NF_IMPOSTO', nro_pedido: 'B' }],
    });
    expect(s['4.1'].valor).toBe(1);
  });
});

describe('indicadores do painel', () => {
  it('OTD e taxa de pedidos com ocorrência', () => {
    expect(otd({ itens_entregues: 0, itens_no_prazo: 0 })).toBeNull();
    expect(otd({ itens_entregues: 4, itens_no_prazo: 3 })).toBe(0.75);
    expect(taxaPedidosComOcorrencia({ pedidos: 0, pedidos_com_ocorrencia: 1 })).toBeNull();
    expect(taxaPedidosComOcorrencia({ pedidos: 20, pedidos_com_ocorrencia: 2 })).toBe(0.1);
  });

  it('FRM vence em 12 meses', () => {
    expect(frmVencida(null, '2026-11-03')).toBe(true);
    expect(frmVencida('2025-11-04', '2026-11-03')).toBe(false);
    expect(frmVencida('2025-11-02', '2026-11-03')).toBe(true);
  });

  it('subtrairMeses respeita fim de mês', () => {
    expect(subtrairMeses('2026-11-03', 12)).toBe('2025-11-03');
    expect(subtrairMeses('2026-03-31', 1)).toBe('2026-02-28');
  });
});

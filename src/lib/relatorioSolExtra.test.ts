import { describe, expect, it } from 'vitest';
import {
  agruparPorItem, agruparPorPeriodo, filtrarParaRelatorio, inicioSemanaISO, linhasRelatorio, materiaisAguardandoNf,
  numeroSemanaISO, pendenciaNfDoMaterial, periodoDaData, resumirRelatorio, textoPendenciaNf,
} from './relatorioSolExtra';
import { coberturaItensPendentes, prontidaoRegularizacao } from './retiradaSemSaldoBaixa';
import type { SolExtra } from './solicitacaoExtraApi';
import type { MaterialDisponivel } from './requisicaoBalcao';

function reg(p: Partial<SolExtra> & Pick<SolExtra, 'id' | 'data'>): SolExtra {
  return {
    tipo: 'PROJETO', codigo: `SEM-${p.id}`, hora: null, turno: null, projeto: 'GW', tramo: 'T1', itens: [],
    motivo: 'LIMPEZA', motivo_detalhe: null, area_reparada_m2: null, rugosidade_um: null, observacao: null,
    status: 'PENDENTE', doc_sap: null, regularizacao_obs: null, regularizado_por: null, regularizado_por_nome: null,
    regularizado_em: null, retirante_id: null, retirante_nome: null, retirante_matricula: null,
    setor_solicitante_id: null, setor_solicitante_nome: null, aprovacao_status: null, aprovado_por: null,
    aprovado_por_nome: null, aprovado_em: null, aprovacao_obs: null, requisicao_balcao_codigo: null, fotos: [],
    assinatura_retirante: null, assinatura_retirante_em: null, criado_por: null, criado_por_nome: null,
    created_at: `${p.data}T10:00:00Z`, updated_at: `${p.data}T10:00:00Z`, excluido_em: null,
    ...p,
  };
}

const item = (material: string, quantidade: number, unidade = 'L') => ({ material, descricao: `Desc ${material}`, unidade, quantidade });

function estoque(linhas: [string, string, number][]): Map<string, Map<string, MaterialDisponivel>> {
  const m = new Map<string, Map<string, MaterialDisponivel>>();
  for (const [dep, mat, saldo] of linhas) {
    const porMat = m.get(dep) ?? new Map();
    porMat.set(mat, { material: mat, descricao: '', unidade: 'L', saldo });
    m.set(dep, porMat);
  }
  return m;
}

describe('semana ISO', () => {
  it('segunda-feira da semana, sem cair um dia por fuso', () => {
    expect(inicioSemanaISO('2026-11-06')).toBe('2026-11-02'); // sexta
    expect(inicioSemanaISO('2026-11-02')).toBe('2026-11-02'); // segunda
    expect(inicioSemanaISO('2026-11-08')).toBe('2026-11-02'); // domingo
    expect(inicioSemanaISO('2026-09-01')).toBe('2026-08-31');
  });

  it('número da semana segue a quinta-feira (virada de ano)', () => {
    expect(numeroSemanaISO('2026-11-06')).toEqual({ semana: 45, ano: 2026 });
    expect(numeroSemanaISO('2027-01-01')).toEqual({ semana: 53, ano: 2026 });
    expect(numeroSemanaISO('2026-01-01')).toEqual({ semana: 1, ano: 2026 });
  });

  it('rótulos de período', () => {
    expect(periodoDaData('2026-11-06', 'dia')).toEqual({ chave: '2026-11-06', rotulo: '06/11/2026' });
    expect(periodoDaData('2026-11-06', 'mes')).toEqual({ chave: '2026-11', rotulo: 'novembro/2026' });
    expect(periodoDaData('2026-11-06', 'semana')).toEqual({ chave: '2026-11-02', rotulo: 'S45 · 02/11 a 08/11/2026' });
  });
});

describe('cobertura por item', () => {
  it('reparte o saldo da mais antiga para a mais nova e casa com a prontidão', () => {
    const regs = [
      reg({ id: 'b', data: '2026-11-03', itens: [item('100', 5), item('200', 1)] }),
      reg({ id: 'a', data: '2026-11-01', itens: [item('100', 8)] }),
    ];
    const est = estoque([['0004', '100', 10], ['0004', '200', 3]]);
    const cob = coberturaItensPendentes(regs, est, () => false);
    expect(cob.get('a')).toEqual([true]);
    expect(cob.get('b')).toEqual([false, true]); // sobraram 2 do 100
    expect(prontidaoRegularizacao(regs, est, () => false).get('b')).toEqual({ prontidao: 'parcial', itensComSaldo: 1, totalItens: 2 });
  });
});

describe('linhas do relatório', () => {
  const regs = [
    reg({ id: '1', data: '2026-11-02', itens: [item('100', 5), item('200', 2)] }),
    reg({ id: '2', data: '2026-11-04', status: 'REGULARIZADA', doc_sap: '4900001', itens: [item('100', 3)] }),
    reg({
      id: '3', data: '2026-11-09', tipo: 'SEM_SALDO', codigo: 'RSS-3', retirante_nome: 'Ana', retirante_matricula: '77',
      setor_solicitante_nome: 'Produção', itens: [item('300', 1, 'UN')],
    }),
  ];
  const cobertura = new Map([['1', [true, false]], ['3', [false]]]);

  it('situação por item', () => {
    const l = linhasRelatorio(regs, cobertura);
    expect(l.map(x => [x.codigo, x.material, x.situacao])).toEqual([
      ['SEM-1', '100', 'liberado'],
      ['SEM-1', '200', 'aguardando_nf'],
      ['SEM-2', '100', 'baixado'],
      ['RSS-3', '300', 'aguardando_nf'],
    ]);
    expect(l[2].baixa).toBe('4900001');
    expect(l[3].referencia).toBe('Ana · mat. 77');
    expect(l[3].detalhe).toBe('Produção');
    expect(l[0].referencia).toBe('GW · tramo T1');
  });

  it('sem ZL0024 lida, pendente fica só "pendente"', () => {
    expect(linhasRelatorio(regs, null).map(x => x.situacao)).toEqual(['pendente', 'pendente', 'baixado', 'pendente']);
  });

  it('filtro por período, tipo e situação, em ordem cronológica', () => {
    const embaralhado = [regs[2], regs[0], regs[1], reg({ id: 'x', data: '2026-11-03', excluido_em: '2026-11-03T00:00:00Z' })];
    expect(filtrarParaRelatorio(embaralhado, { de: null, ate: null, tipo: 'todos', status: 'todos' }).map(r => r.id)).toEqual(['1', '2', '3']);
    expect(filtrarParaRelatorio(embaralhado, { de: '2026-11-03', ate: '2026-11-08', tipo: 'todos', status: 'todos' }).map(r => r.id)).toEqual(['2']);
    expect(filtrarParaRelatorio(embaralhado, { de: null, ate: null, tipo: 'SEM_SALDO', status: 'todos' }).map(r => r.id)).toEqual(['3']);
    expect(filtrarParaRelatorio(embaralhado, { de: null, ate: null, tipo: 'todos', status: 'PENDENTE' }).map(r => r.id)).toEqual(['1', '3']);
  });

  it('sintético por item soma quantidade por situação, pendentes primeiro', () => {
    const grupos = agruparPorItem(linhasRelatorio(regs, cobertura));
    const g100 = grupos.find(g => g.material === '100')!;
    expect(g100).toMatchObject({ lancamentos: 2, quantidade: 8 });
    expect(g100.qtd).toEqual({ baixado: 3, liberado: 5, aguardando_nf: 0, pendente: 0 });
    expect(grupos.map(g => g.material)).toEqual(['100', '200', '300']);
  });

  it('sintético por semana conta lançamentos e itens por situação', () => {
    const grupos = agruparPorPeriodo(linhasRelatorio(regs, cobertura), 'semana');
    expect(grupos.map(g => g.chave)).toEqual(['2026-11-02', '2026-11-09']);
    expect(grupos[0]).toMatchObject({ lancamentos: 2, totalItens: 3, itens: { baixado: 1, liberado: 1, aguardando_nf: 1, pendente: 0 } });
    expect(grupos[0].materiais.map(m => [m.material, m.quantidade])).toEqual([['100', 8], ['200', 2]]);
  });

  it('resumo e materiais aguardando NF', () => {
    const l = linhasRelatorio(regs, cobertura);
    expect(resumirRelatorio(l)).toEqual({
      lancamentos: 3, projeto: 2, semSaldo: 1, totalItens: 4, itens: { baixado: 1, liberado: 1, aguardando_nf: 2, pendente: 0 },
    });
    expect(materiaisAguardandoNf(l)).toEqual(['200', '300']);
  });
});

describe('PO aguardando a NF', () => {
  const pedido = (p: Record<string, unknown>) => ({
    pedido: '4500000001', item: '00010', ri: null, requisicao: null, data: null, remessa_prevista: null, data_migo: null,
    fornecedor: 'Tintas SA', deposito: null, quantidade_pedida: 10, quantidade_fornecida: 0, quantidade_pendente: 10,
    recebido_mb51: null, ultima_entrada: null, chegada_almox: null, ...p,
  });

  it('só pedidos com quantidade pendente; chegada sem MIGO primeiro', () => {
    const p = pendenciaNfDoMaterial({
      pedidos: [
        pedido({ pedido: '4500000001', remessa_prevista: '2026-11-20' }),
        pedido({ pedido: '4500000002', quantidade_pendente: 0 }),
        pedido({ pedido: '4500000003', item: '20', remessa_prevista: '2026-11-30' }),
      ] as never,
      rms: [],
      chegadas: [{ pedido: '4500000003', migo_em: null } as never],
    });
    expect(p.pedidos.map(x => [x.pedido, x.chegouSemMigo])).toEqual([['4500000003/20', true], ['4500000001/10', false]]);
    expect(textoPendenciaNf(p)).toBe('4500000003/20 · prev. 30/11 · chegou s/ MIGO; 4500000001/10 · prev. 20/11');
  });

  it('sem PO: mostra a RM sem pedido, senão "Sem PO aberto"', () => {
    const rm = { situacao: 'sem_pedido', requisicao: '1000123', item: '10' };
    expect(textoPendenciaNf(pendenciaNfDoMaterial({ pedidos: [], rms: [rm] as never, chegadas: [] }))).toBe('Sem PO — RM 1000123/10');
    expect(textoPendenciaNf(pendenciaNfDoMaterial({ pedidos: [], rms: [], chegadas: [] }))).toBe('Sem PO aberto');
    expect(textoPendenciaNf(undefined)).toBe('PO não consultado');
  });
});

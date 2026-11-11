import { describe, expect, it } from 'vitest';
import type { AlmoxRmExportacaoSolicitacao } from '../types';
import {
  buscarExcluidaPorRm, indexarExcluidasPorRm, itensDaPlanilhaRm, pendentesEliminarNoSap, situacaoSolicitacaoRm,
} from './rmSolicitacaoAlterada';

const marca = (p: Partial<AlmoxRmExportacaoSolicitacao>): AlmoxRmExportacaoSolicitacao => ({
  id: 'm1', exportacao_id: 'e1', request_id: 'r1', request_number: '4000028', total_itens: 1,
  created_at: '2026-10-05T10:00:00Z', ...p,
});

describe('pendências de eliminar no SAP', () => {
  it('só a última marca de cada solicitação, sem baixa', () => {
    const lista = pendentesEliminarNoSap([
      marca({ id: 'a', created_at: '2026-10-01T10:00:00Z', solicitacao_situacao: 'cancelada' }),
      marca({ id: 'b', created_at: '2026-10-02T10:00:00Z' }), // reexportada depois: a última não tem carimbo
      marca({ id: 'c', request_id: 'r2', solicitacao_situacao: 'excluida', solicitacao_situacao_em: '2026-11-10T10:00:00Z' }),
      marca({ id: 'd', request_id: 'r3', solicitacao_situacao: 'cancelada', sap_baixa_em: '2026-11-10T11:00:00Z' }),
      marca({ id: 'e', request_id: 'r4', solicitacao_situacao: 'cancelada', solicitacao_situacao_em: '2026-11-11T10:00:00Z' }),
    ]);
    expect(lista.map(m => m.id)).toEqual(['e', 'c']);
  });

  it('itens da planilha pelo ID Req', () => {
    const lote = { linhas: [
      { 'ID Req': '#4000028', Item: 10, 'Material (MATNR)': '123', 'Quantidade (MENGE)': 2 },
      { 'ID Req': '#4000029', Item: 10, 'Material (MATNR)': '999', 'Quantidade (MENGE)': 1 },
    ] };
    expect(itensDaPlanilhaRm(lote, '4000028')).toEqual([{ item: '10', material: '123', quantidade: '2' }]);
    expect(itensDaPlanilhaRm(undefined, '4000028')).toEqual([]);
  });

  it('excluída casa pela RM com ou sem zero à esquerda', () => {
    const mapa = indexarExcluidasPorRm([
      marca({ solicitacao_situacao: 'excluida', rm_numero: '1200095172' }),
      marca({ id: 'x', request_id: 'r9', solicitacao_situacao: 'cancelada', rm_numero: '555' }),
    ]);
    expect(buscarExcluidaPorRm(mapa, '001200095172')?.request_number).toBe('4000028');
    expect(buscarExcluidaPorRm(mapa, '555')).toBeNull();
  });
});

describe('situação na tag da RM', () => {
  it('cancelada pendente e eliminada', () => {
    const s = situacaoSolicitacaoRm({ status: 'cancelada' }, [marca({ solicitacao_situacao: 'cancelada', solicitacao_situacao_por_nome: 'JOAO' })]);
    expect(s?.tipo).toBe('cancelada');
    expect(s?.pendenteSap).toBe(true);
    expect(s?.detalhe).toContain('JOAO');
    const feita = situacaoSolicitacaoRm({ status: 'cancelada' }, [marca({ solicitacao_situacao: 'cancelada', sap_baixa_em: '2026-11-11T10:00:00Z', sap_baixa_por_nome: 'ANA' })]);
    expect(feita?.pendenteSap).toBe(false);
    expect(feita?.detalhe).toContain('eliminada no SAP por ANA');
  });

  it('editada: pendente até concluir; reexportada continua avisando que mudou', () => {
    const editada = marca({ reaberto_em: '2026-10-06T10:00:00Z', reaberto_motivo: 'quantidade 2 → 3', reaberto_por_nome: 'JOAO' });
    expect(situacaoSolicitacaoRm({ status: 'aprovada' }, [editada])).toMatchObject({ tipo: 'editada', pendenteSap: true });
    expect(situacaoSolicitacaoRm({ status: 'aprovada' }, [{ ...editada, concluido_em: '2026-10-07T10:00:00Z' }])?.pendenteSap).toBe(false);
    const nova = marca({ id: 'm2', created_at: '2026-10-08T10:00:00Z' });
    const s = situacaoSolicitacaoRm({ status: 'aprovada' }, [nova, editada]);
    expect(s).toMatchObject({ tipo: 'editada', pendenteSap: false });
    expect(s?.detalhe).toContain('Reexportada');
  });

  it('reabertura manual (sem motivo) não é edição', () => {
    expect(situacaoSolicitacaoRm({ status: 'aprovada' }, [marca({ reaberto_em: '2026-10-06T10:00:00Z' })])).toBeNull();
    expect(situacaoSolicitacaoRm({ status: 'aprovada' }, undefined)).toBeNull();
  });
});

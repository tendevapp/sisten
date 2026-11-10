import { describe, expect, it } from 'vitest';
import {
  VERIFICACOES, agruparContingencias, contarSeveridades, filtrarContingencias, infoVerificacao, piorSeveridade,
  requisicaoParaAbrir, textoValorLog, type Contingencia,
} from './contingenciasAlmox';

const c = (p: Partial<Contingencia>): Contingencia => ({
  verificacao: 'rqb_nao_exportada', severidade: 'media', entidade: 'req_balcao', referencia: 'RQB-011126-01',
  ref_id: null, data: '2026-11-01', dias: 9, titulo: 't', detalhe: 'd', acao: null, acao_ref: null, tratativa: null, ...p,
});

describe('contingências do almoxarifado', () => {
  it('pior severidade e contagem', () => {
    const l = [c({ severidade: 'media' }), c({ severidade: 'critica' }), c({ severidade: 'alta' })];
    expect(piorSeveridade(l)).toBe('critica');
    expect(piorSeveridade([])).toBe('media');
    expect(contarSeveridades(l)).toEqual({ critica: 1, alta: 1, media: 1, total: 3 });
  });

  it('agrupa por verificação, grupo mais grave primeiro, item mais antigo primeiro', () => {
    const grupos = agruparContingencias([
      c({ verificacao: 'rqb_nao_exportada', referencia: 'RQB-A', severidade: 'media', dias: 3 }),
      c({ verificacao: 'rqb_exportada_sem_doc', referencia: 'RQB-B', severidade: 'alta', dias: 4 }),
      c({ verificacao: 'rqb_exportada_sem_doc', referencia: 'RQB-C', severidade: 'critica', dias: 40 }),
      c({ verificacao: 'rqb_exportada_sem_doc', referencia: 'RQB-D', severidade: 'critica', dias: 12 }),
      c({ verificacao: 'rss_sem_requisicao', referencia: 'RSS-X', severidade: 'critica', dias: 6, entidade: 'sol_extra' }),
    ]);
    expect(grupos.map(g => g.verificacao)).toEqual(['rqb_exportada_sem_doc', 'rss_sem_requisicao', 'rqb_nao_exportada']);
    expect(grupos[0].severidade).toBe('critica');
    expect(grupos[0].itens.map(i => i.referencia)).toEqual(['RQB-C', 'RQB-D', 'RQB-B']);
  });

  it('filtra por texto (inclusive arquivo exportado) e severidade', () => {
    const l = [
      c({ referencia: 'RQB-011026-01', acao_ref: 'requisicao_balcao_20261001_1411.xlsx', severidade: 'critica' }),
      c({ referencia: 'RSS-041126-28', severidade: 'alta', detalhe: 'retirada sem requisição' }),
    ];
    expect(filtrarContingencias(l, '20261001').map(x => x.referencia)).toEqual(['RQB-011026-01']);
    expect(filtrarContingencias(l, 'rss').map(x => x.referencia)).toEqual(['RSS-041126-28']);
    expect(filtrarContingencias(l, '', 'alta').map(x => x.referencia)).toEqual(['RSS-041126-28']);
    expect(filtrarContingencias(l, '  ')).toHaveLength(2);
  });

  it('requisição a abrir: a própria RQB ou a confirmada da retirada', () => {
    expect(requisicaoParaAbrir(c({ entidade: 'req_balcao', referencia: 'RQB-1' }))).toBe('RQB-1');
    expect(requisicaoParaAbrir(c({ entidade: 'sol_extra', verificacao: 'rss_nao_regularizada', referencia: 'RSS-1', acao_ref: 'RQB-2' }))).toBe('RQB-2');
    expect(requisicaoParaAbrir(c({ entidade: 'ficha_epi', verificacao: 'epi_sem_requisicao', referencia: 'EPI-1', acao_ref: 'RQB-3' }))).toBeNull();
  });

  it('toda verificação do banco tem rótulo e orientação', () => {
    for (const info of Object.values(VERIFICACOES)) {
      expect(info.rotulo.length).toBeGreaterThan(5);
      expect(info.comoTratar.length).toBeGreaterThan(20);
    }
    expect(infoVerificacao('nova_do_banco').rotulo).toBe('nova_do_banco');
  });

  it('valor do log legível', () => {
    expect(textoValorLog(null)).toBe('—');
    expect(textoValorLog(true)).toBe('sim');
    expect(textoValorLog([{ material: '1357020', quantidade: 3 }, { material: '12', quantidade: 1.5 }])).toBe('1357020 × 3; 12 × 1.5');
    expect(textoValorLog('PENDENTE')).toBe('PENDENTE');
    expect(textoValorLog(2)).toBe('2');
  });
});

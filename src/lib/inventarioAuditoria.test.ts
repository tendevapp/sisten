import { describe, expect, it } from 'vitest';
import { sugerirEscopoRapido, rotuloCausa } from './inventarioAuditoria';
import { chaveItem, type CandidatoInventario, type HistoricoItem } from './inventarioCiclico';
import { montarLinhasPlanilhaInventario } from './inventarioCiclicoPlanilha';
import { linhasAnalise } from './inventarioAnalise';
import type { EstoqueItem } from '../types';

const candidato = (material: string, classe: 'A'|'B'|'C' = 'A', deposito = '0001'): CandidatoInventario => ({ chave: chaveItem(material, deposito), material, classe, deposito, descricao: material, unidade: 'UN', posicao: Number(material) });
const estoque: EstoqueItem[] = Array.from({ length: 20 }, (_, i) => ({ id: i, material: String(i+1), deposito: '0001', umb: 'UN', posicao_estoque: '101.100100' }));
describe('escopo rápido por risco e tempo', () => {
  it('inclui preparação, reserva e deslocamento sem ultrapassar o orçamento', () => {
    const r = sugerirEscopoRapido(estoque.map(e => candidato(e.material!)), estoque, new Map(), [], '2026-10-31', 30, 2);
    expect(r.itens.length).toBe(9);
    expect(r.minutos).toBe(29);
    expect(r.minutos).toBeLessThanOrEqual(30);
  });
  it('prioriza risco e não transforma velocidade em critério exclusivo', () => {
    const historico = new Map<string, HistoricoItem>([[chaveItem('2','0001'), { ultimaData:'2026-10-30',vezes:1,jaDivergiu:true }]]);
    const r = sugerirEscopoRapido([candidato('1','C'),candidato('2','A')], estoque, historico, [], '2026-10-31', 10, 2);
    expect(r.itens.map(i => i.material)).toEqual(['2']);
  });
  it('exclui pendência extraordinária mesmo sem depósito ou com código preenchido com zeros', () => {
    const r = sugerirEscopoRapido([candidato('1'),candidato('2')], estoque, new Map(), [{ material:'0001',codigo:'RSS-1',tipo:'extraordinaria',motivo:'Pendente' }], '2026-10-31');
    expect(r.itens.map(i => i.material)).toEqual(['2']);
    expect(r.excluidosPendencia).toBe(1);
  });
  it('considera pesagem, múltiplos endereços e falta de localização', () => {
    const base = sugerirEscopoRapido([candidato('1')], estoque, new Map(), [], '2026-10-31', 10);
    const complexo = sugerirEscopoRapido([{...candidato('1'),unidade:'KG'}], [...estoque,{id:99,material:'1',deposito:'0001',posicao_estoque:'102.OUTRO'}], new Map(), [], '2026-10-31', 10);
    expect(base.itens).toHaveLength(1); expect(complexo.itens).toHaveLength(0);
    expect(sugerirEscopoRapido([candidato('1')], [], new Map(), [], '2026-10-31', 10).itens).toHaveLength(0);
  });
  it('orçamento insuficiente/inválido nunca promete uma contagem', () => {
    for (const min of [0,-1,NaN,5]) expect(sugerirEscopoRapido([candidato('1')], estoque, new Map(), [], '2026-10-31', min).itens).toHaveLength(0);
  });
  it('aceita um orçamento de dia útil e mantém a entrada sem mutação', () => {
    const candidatos = [candidato('2'),candidato('1')];
    const r = sugerirEscopoRapido(candidatos, estoque, new Map(), [], '2026-10-31', 8*60);
    expect(r.itens).toHaveLength(2); expect(candidatos[0].material).toBe('2');
    expect(r.itens[0]).not.toHaveProperty('quantidade');
  });
});

it('relatórios preservam causa declarada, resultado resolvido e cada rodada de recontagem', () => {
  const item: any = { id:'i',ordem:1,material:'1',descricao:'Item',deposito:'0001',status:'conferido',saldo_sistema:5,qtd_final:5,diferenca:0,contagens:[
    {id:'c1',numero:1,quantidade:4,divergente:true,created_at:'2026-10-31T12:00:00Z'},
    {id:'c2',numero:2,quantidade:5,divergente:false,causa:'erro_contagem',causa_detalhe:'Caixa localizada',preparacao_id:'rodada-2',iniciada_em:'2026-10-31T12:02:00Z',created_at:'2026-10-31T12:03:00Z'},
  ] };
  const inv: any = {id:'inv',codigo:'INV-311026-01',data:'2026-10-31',itens:[item]};
  const [l] = linhasAnalise([inv]);
  expect(l).toMatchObject({ causa:'erro_contagem',causaDetalhe:'Caixa localizada',status:'conferido',diferenca:0 });
  const [e] = montarLinhasPlanilhaInventario(inv);
  expect(e['Causa provável 2ª']).toBe(rotuloCausa('erro_contagem'));
  expect(e['Referência da rodada 2ª']).toBe('rodada-2');
  expect(e['Detalhe 2ª']).toBe('Caixa localizada');
  item.causa_encerramento='em_apuracao'; item.causa_encerramento_detalhe='Aguardando gestão';
  expect(linhasAnalise([inv])[0].causa).toBe('em_apuracao');
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  cargaDivergente,
  classificarDivergencia,
  entregaParcialAnterior,
  listarFornecedoresDoCache,
  pendentePedido,
  posAbertosDoFornecedor,
  resumoConferencia,
  tipoItemDaLista,
  tipoNcSugerido,
  type LinhaCacheSAP,
  type LinhaConferencia,
} from './recebimentoAlmox';

const linha = (over: Partial<LinhaConferencia> = {}): LinhaConferencia => ({
  linhaRef: '4500000001-4600000001',
  nroPedido: '4600000001',
  materialCode: '20000123',
  descricao: 'Parafuso M12',
  unidade: 'PC',
  qtdPedido: 100,
  qtdJaFornecida: 0,
  qtdRecebida: 100,
  conferido: true,
  itemManual: false,
  avaria: false,
  parcial: false,
  observacao: '',
  evidencias: [],
  ...over,
});

describe('classificarDivergencia', () => {
  it('sem divergência quando a contagem bate com o saldo pendente', () => {
    expect(classificarDivergencia(linha())).toBeNull();
  });

  it('desconta o que já foi fornecido antes de comparar', () => {
    expect(classificarDivergencia(linha({ qtdJaFornecida: 40, qtdRecebida: 60 }))).toBeNull();
  });

  it('acusa falta e excedente', () => {
    expect(classificarDivergencia(linha({ qtdRecebida: 90 }))).toBe('falta');
    expect(classificarDivergencia(linha({ qtdRecebida: 130 }))).toBe('excedente');
  });

  it('tolera ruído de ponto flutuante', () => {
    expect(classificarDivergencia(linha({ qtdPedido: 12.3, qtdRecebida: 12.3000004 }))).toBeNull();
  });

  it('avaria e material trocado vêm antes da aritmética', () => {
    expect(classificarDivergencia(linha({ avaria: true, qtdRecebida: 90 }))).toBe('avaria');
  });

  it('parcial: receber menos que o pendente não é falta', () => {
    expect(classificarDivergencia(linha({ qtdRecebida: 40, parcial: true }))).toBeNull();
  });

  it('parcial não anula excedente nem avaria', () => {
    expect(classificarDivergencia(linha({ qtdRecebida: 130, parcial: true }))).toBe('excedente');
    expect(classificarDivergencia(linha({ qtdRecebida: 40, parcial: true, avaria: true }))).toBe('avaria');
  });

  it('item fora do pedido é sem_pedido', () => {
    expect(classificarDivergencia(linha({ itemManual: true, qtdPedido: null }))).toBe('sem_pedido');
  });
});

describe('pendentePedido', () => {
  it('nunca retorna negativo e trata item sem pedido como zero', () => {
    expect(pendentePedido(100, 30)).toBe(70);
    expect(pendentePedido(100, 130)).toBe(0);
    expect(pendentePedido(null, null)).toBe(0);
  });
});

describe('tipoItemDaLista', () => {
  it('classifica por prefixo 100000 do material', () => {
    expect(tipoItemDaLista(['20000123', '30000456'])).toBe('consumo');
    expect(tipoItemDaLista(['100000123', '100000999'])).toBe('projeto');
    expect(tipoItemDaLista(['100000123', '20000123'])).toBe('misto');
  });
});

describe('resumoConferencia', () => {
  it('conta ok, divergentes e sinaliza NC', () => {
    const r = resumoConferencia([
      linha(),
      linha({ materialCode: '100000123', qtdRecebida: 5, qtdPedido: 10 }),
      linha({ conferido: false, qtdRecebida: 0, materialCode: '20000999' }),
    ]);
    expect(r.total).toBe(3);
    expect(r.ok).toBe(1);
    expect(r.divergentes).toBe(2); // a linha não conferida conta como falta (0 de 100)
    expect(r.temNc).toBe(true);
    expect(r.tipoItem).toBe('misto');
  });

  it('sem divergência não abre NC', () => {
    const r = resumoConferencia([linha(), linha({ materialCode: '30000456' })]);
    expect(r.temNc).toBe(false);
    expect(r.divergentes).toBe(0);
    expect(r.ok).toBe(2);
  });

  it('linha parcial conta como ok e entra em parciais, sem NC', () => {
    const r = resumoConferencia([
      linha(),
      linha({ materialCode: '30000456', qtdRecebida: 30, parcial: true }),
    ]);
    expect(r.divergentes).toBe(0);
    expect(r.temNc).toBe(false);
    expect(r.ok).toBe(2);
    expect(r.parciais).toBe(1);
  });
});

describe('entregaParcialAnterior', () => {
  it('null quando não há PO ou nada foi entregue', () => {
    expect(entregaParcialAnterior(null, 10)).toBeNull();
    expect(entregaParcialAnterior(100, 0)).toBeNull();
  });
  it('devolve já recebido e pendente descontado', () => {
    expect(entregaParcialAnterior(100, 30)).toEqual({ jaRecebido: 30, pendente: 70, completo: false });
    expect(entregaParcialAnterior(100, 100)).toEqual({ jaRecebido: 100, pendente: 0, completo: true });
  });
});

describe('tipoNcSugerido', () => {
  it('prioriza avaria e material trocado', () => {
    expect(tipoNcSugerido(['falta', 'avaria'])).toBe('avaria');
    expect(tipoNcSugerido(['excedente', 'falta'])).toBe('falta');
    expect(tipoNcSugerido([])).toBe('outros');
  });
});

const cache = (over: Partial<LinhaCacheSAP> = {}): LinhaCacheSAP => ({
  documento_compra: '4600000001',
  fornecedor_name: 'PARAFUSOS SÃO PAULO LTDA',
  material_code: '20000123',
  texto_breve: 'Parafuso M12',
  unidade_medida: 'PC',
  ri_po: '4500000001-4600000001',
  requisicao_de_compra: '4500000001',
  qtd_po: 100,
  qtd_fornecida_po: 0,
  ...over,
});

describe('listarFornecedoresDoCache', () => {
  it('dedup por nome, ignora linha sem PO, ordena', () => {
    const recs = [
      cache({ fornecedor_name: 'BETA' }),
      cache({ fornecedor_name: 'BETA', documento_compra: '4600000009' }),
      cache({ fornecedor_name: 'ALFA' }),
      cache({ fornecedor_name: 'SEM PO', documento_compra: '' }),
    ];
    expect(listarFornecedoresDoCache(recs)).toEqual(['ALFA', 'BETA']);
  });
});

describe('posAbertosDoFornecedor', () => {
  it('casa por trecho sem acento/caixa e agrupa por PO', () => {
    const recs = [
      cache({ documento_compra: '4600000001', ri_po: 'a', qtd_po: 100, qtd_fornecida_po: 40 }),
      cache({ documento_compra: '4600000001', ri_po: 'b', material_code: '9', qtd_po: 10, qtd_fornecida_po: 0 }),
      cache({ documento_compra: '4600000002', ri_po: 'c', qtd_po: 5, qtd_fornecida_po: 0 }),
    ];
    const pos = posAbertosDoFornecedor(recs, 'sao paulo');
    expect(pos.map((p) => p.numero)).toEqual(['4600000001', '4600000002']);
    expect(pos[0].itensPendentes).toBe(2);
    expect(pos[0].pendenteTotal).toBe(70);
    expect(pos[0].itens[0].pendente).toBe(60);
  });

  it('some o PO cujo saldo pendente já zerou', () => {
    const recs = [
      cache({ documento_compra: '4600000001', qtd_po: 100, qtd_fornecida_po: 100 }),
      cache({ documento_compra: '4600000002', ri_po: 'z', qtd_po: 8, qtd_fornecida_po: 3 }),
    ];
    expect(posAbertosDoFornecedor(recs, 'PARAFUSOS').map((p) => p.numero)).toEqual(['4600000002']);
  });

  it('termo vazio devolve nada', () => {
    expect(posAbertosDoFornecedor([cache()], '  ')).toEqual([]);
  });
});

describe('cargaDivergente', () => {
  it('diverge com avaria ou contagem diferente da declarada', () => {
    expect(cargaDivergente({ qtdVolumesDeclarada: 10, qtdVolumesContada: 10, avariaAparente: false })).toBe(false);
    expect(cargaDivergente({ qtdVolumesDeclarada: 10, qtdVolumesContada: 8, avariaAparente: false })).toBe(true);
    expect(cargaDivergente({ qtdVolumesDeclarada: null, qtdVolumesContada: 8, avariaAparente: true })).toBe(true);
    expect(cargaDivergente({ qtdVolumesDeclarada: null, qtdVolumesContada: 8, avariaAparente: false })).toBe(false);
  });
});

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DECISOES_POR_MOTIVO,
  DECISOES_QUE_ABREM_RNC,
  abreRnc,
  contarAguardandoComprador,
  contarRncEmAberto,
  ehDoComprador,
  filtrarRnc,
  type PendenciaRnc,
  agruparPorPedido,
  atrasada,
  decisoesComuns,
  diferencaQtd,
  filtrarPendencias,
  parametrosDaRota,
  resumirPendencias,
  rotuloDecisao,
  validarDecisao,
  type FiltrosPendencia,
  type MotivoPendencia,
  type PendenciaRecebimento,
} from './pendenciasRecebimento';

function pend(p: Partial<PendenciaRecebimento>): PendenciaRecebimento {
  return {
    id: 'p1', codigo: 'PRE-021026-01', origem: 'conferencia', conferencia_id: 'c1', conferencia_codigo: 'RCM-021026-01',
    nc_id: null, nc_codigo: null, carga_id: null, nro_pedido: '4100465796', linha_ref: null, material_code: '1437769',
    descricao: 'PARAFUSO M12', unidade: 'UN', fornecedor: 'FORNECEDOR X', motivo: 'parcial',
    qtd_pedido: 6, qtd_ja_fornecida: 0, qtd_recebida: 5, observacao_almox: null, evidencias: [],
    grupo_compras: '358', comprador_id: 'u-isa', comprador_nome: 'Isadora', status: 'aguardando_comprador',
    cancelamento: null, decisao: null, decisao_obs: null, pedido_vinculado: null, decidido_por_id: null,
    decidido_por_nome: null, decidido_em: null, execucao_obs: null, executado_por_id: null, executado_por_nome: null,
    executado_em: null, aberto_por_id: 'u-almox', aberto_por_nome: 'Almox', historico: [],
    created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z',
    ...p,
  };
}

const FILTRO_BASE: FiltrosPendencia = {
  status: 'abertas', somenteMinhas: false, usuarioId: 'u-isa', motivos: new Set(), compradores: new Set(), busca: '',
};

describe('catálogo de decisões', () => {
  it('é o mesmo de sup_receb_decisoes_validas na migration', () => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261005120000_sup_pend_recebimento_abrir_rnc.sql'), 'utf8');
    const corpo = sql.slice(sql.indexOf('sup_receb_decisoes_validas(p_motivo text)'), sql.indexOf('sup_receb_decisao_abre_rnc(p_decisao text)'));
    const doSql = (rotulo: string) => {
      const m = corpo.match(new RegExp(`${rotulo}\\s+(?:then\\s+)?array\\[([^\\]]+)\\]`));
      return m ? m[1].split(',').map((s) => s.trim().replace(/'/g, '')) : null;
    };
    (Object.keys(DECISOES_POR_MOTIVO) as MotivoPendencia[])
      .filter((m) => m !== 'outros')
      .forEach((m) => expect(doSql(`when '${m}'`), m).toEqual(DECISOES_POR_MOTIVO[m]));
    expect(doSql('else')).toEqual(DECISOES_POR_MOTIVO.outros);
  });

  it('em lote só oferece o que vale para todos os motivos', () => {
    expect(decisoesComuns(['parcial', 'falta'])).toEqual(DECISOES_POR_MOTIVO.parcial);
    expect(decisoesComuns(['parcial', 'avaria'])).toEqual(['devolver', 'abrir_rnc', 'outro']);
    expect(decisoesComuns([])).toEqual([]);
  });

  it('rótulo de devolver muda para excedente', () => {
    expect(rotuloDecisao('devolver', 'excedente')).toBe('Devolver o excedente ao fornecedor');
    expect(rotuloDecisao('devolver', 'avaria')).toBe('Recusar e devolver ao fornecedor');
  });
});

describe('abertura automática da RNC', () => {
  it('é o mesmo de sup_receb_decisao_abre_rnc na migration', () => {
    const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261005120000_sup_pend_recebimento_abrir_rnc.sql'), 'utf8');
    const m = sql.match(/sup_receb_decisao_abre_rnc\(p_decisao text\)[\s\S]*?in \(([^)]+)\)/);
    expect(m![1].split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual(DECISOES_QUE_ABREM_RNC);
  });

  it('abrir RNC e as devoluções abrem; receber não', () => {
    expect(abreRnc('abrir_rnc')).toBe(true);
    expect(abreRnc('devolver')).toBe(true);
    expect(abreRnc('devolver_repor')).toBe(true);
    expect(abreRnc('assumir_nc')).toBe(false);
    expect(abreRnc(null)).toBe(false);
  });

  it('abrir RNC vale para todo motivo', () => {
    Object.values(DECISOES_POR_MOTIVO).forEach((d) => expect(d).toContain('abrir_rnc'));
  });
});

describe('validarDecisao', () => {
  it('exige decisão, texto em "outro" e PO em "vincular"', () => {
    expect(validarDecisao({ decisao: null, obs: '', pedido: '' })).toMatch(/Escolha/);
    expect(validarDecisao({ decisao: 'outro', obs: '  ', pedido: '' })).toMatch(/Descreva/);
    expect(validarDecisao({ decisao: 'vincular_po', obs: '', pedido: 'abc' })).toMatch(/PO/);
    expect(validarDecisao({ decisao: 'vincular_po', obs: '', pedido: '4100-470414' })).toBeNull();
    expect(validarDecisao({ decisao: 'assumir_nc', obs: '', pedido: '' })).toBeNull();
  });
});

describe('diferencaQtd', () => {
  it('desconta o que já foi fornecido antes', () => {
    expect(diferencaQtd({ qtd_pedido: 10, qtd_ja_fornecida: 4, qtd_recebida: 5 })).toBe(-1);
    expect(diferencaQtd({ qtd_pedido: 10, qtd_ja_fornecida: null, qtd_recebida: 12 })).toBe(2);
  });
  it('zero ou sem PO devolve null', () => {
    expect(diferencaQtd({ qtd_pedido: 5, qtd_ja_fornecida: 0, qtd_recebida: 5 })).toBeNull();
    expect(diferencaQtd({ qtd_pedido: null, qtd_ja_fornecida: null, qtd_recebida: 3 })).toBeNull();
  });
});

describe('atrasada', () => {
  const agora = new Date('2026-10-04T12:00:00Z');
  it('só conta quem ainda espera o comprador além de 48 h', () => {
    expect(atrasada(pend({ created_at: '2026-10-01T12:00:00Z' }), agora)).toBe(true);
    expect(atrasada(pend({ created_at: '2026-10-03T12:00:00Z' }), agora)).toBe(false);
    expect(atrasada(pend({ created_at: '2026-10-01T12:00:00Z', status: 'aguardando_almox' }), agora)).toBe(false);
  });
});

describe('filtrarPendencias', () => {
  const lista = [
    pend({ id: 'a' }),
    pend({ id: 'b', comprador_id: 'u-outro', comprador_nome: 'Itana', motivo: 'avaria' }),
    pend({ id: 'c', comprador_id: null, comprador_nome: null }),
    pend({ id: 'd', status: 'concluida' }),
  ];
  const ids = (f: Partial<FiltrosPendencia>) => filtrarPendencias(lista, { ...FILTRO_BASE, ...f }).map((p) => p.id);

  it('abertas exclui concluídas', () => expect(ids({})).toEqual(['a', 'b', 'c']));
  it('"minhas" mantém as sem comprador, que alguém precisa assumir', () => expect(ids({ somenteMinhas: true })).toEqual(['a', 'c']));
  it('filtra por motivo e por comprador', () => {
    expect(ids({ motivos: new Set(['avaria']) })).toEqual(['b']);
    expect(ids({ compradores: new Set(['Sem comprador']) })).toEqual(['c']);
  });
  it('busca sem acento por várias palavras', () => {
    expect(ids({ busca: 'parafuso 4100465796', status: 'todas' })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ busca: 'itana' })).toEqual(['b']);
  });
});

describe('agruparPorPedido', () => {
  it('junta os itens do mesmo PO e põe o mais antigo primeiro', () => {
    const grupos = agruparPorPedido([
      pend({ id: 'a', nro_pedido: '2', codigo: 'PRE-02', created_at: '2026-10-02T00:00:00Z' }),
      pend({ id: 'b', nro_pedido: '1', codigo: 'PRE-01', created_at: '2026-10-01T00:00:00Z' }),
      pend({ id: 'c', nro_pedido: '2', codigo: 'PRE-01', created_at: '2026-10-02T00:00:00Z' }),
      pend({ id: 'd', nro_pedido: null }),
    ]);
    expect(grupos.map((g) => g.chave)).toEqual(['1', 'sem-po:d', '2']);
    expect(grupos.find((g) => g.chave === '2')!.itens.map((i) => i.id)).toEqual(['c', 'a']);
  });
});

describe('resumirPendencias', () => {
  it('conta por status, atraso e sem comprador', () => {
    const r = resumirPendencias([
      pend({ created_at: '2026-09-01T00:00:00Z' }),
      pend({ status: 'aguardando_almox', comprador_id: null }),
      pend({ status: 'concluida' }),
    ], new Date('2026-10-04T00:00:00Z'));
    expect(r).toEqual({ aguardandoComprador: 1, aguardandoAlmox: 1, atrasadas: 1, concluidas: 1, semComprador: 1 });
  });
});

describe('parametrosDaRota', () => {
  it('lê o deep-link das notificações', () => {
    expect(parametrosDaRota('#/suprimentos/pendencias-recebimento?id=abc')).toMatchObject({ id: 'abc', conf: null });
    expect(parametrosDaRota('#/formularios/almoxarifado?vista=devolutivas&id=x')).toMatchObject({ vista: 'devolutivas', id: 'x' });
    expect(parametrosDaRota('#/suprimentos/pendencias-recebimento')).toMatchObject({ id: null, status: null });
  });
});

describe('balões e lista de RNC', () => {
  const rnc = (p: Partial<PendenciaRnc>): PendenciaRnc => ({
    ...pend({ decisao: 'abrir_rnc', status: 'aguardando_almox', nc_id: 'n1', nc_codigo: 'NCR-051026-01', decidido_por_id: 'u-isa' }),
    ncr_status: 'em_tratativa', ncr_resolucao: null, ncr_acoes: [],
    ...p,
  });

  it('dono é o comprador, quem decidiu ou ninguém', () => {
    expect(ehDoComprador({ comprador_id: 'u-isa', decidido_por_id: null }, 'u-isa')).toBe(true);
    expect(ehDoComprador({ comprador_id: 'u-outro', decidido_por_id: 'u-isa' }, 'u-isa')).toBe(true);
    expect(ehDoComprador({ comprador_id: null, decidido_por_id: null }, 'u-isa')).toBe(true);
    expect(ehDoComprador({ comprador_id: 'u-outro', decidido_por_id: null }, 'u-isa')).toBe(false);
  });

  it('balão do Recebimento conta só o que espera a devolutiva do usuário', () => {
    const lista = [
      pend({ id: 'a' }),
      pend({ id: 'b', comprador_id: 'u-outro' }),
      pend({ id: 'c', comprador_id: null }),
      pend({ id: 'd', status: 'aguardando_almox' }),
    ];
    expect(contarAguardandoComprador(lista, 'u-isa')).toBe(2);
  });

  it('balão da RNC conta as ainda não resolvidas do usuário', () => {
    const lista = [
      rnc({ id: 'a' }),
      rnc({ id: 'b', ncr_status: 'resolvida' }),
      rnc({ id: 'c', comprador_id: 'u-outro', decidido_por_id: 'u-outro' }),
    ];
    expect(contarRncEmAberto(lista, 'u-isa')).toBe(1);
  });

  it('filtra por situação da RNC, dono e busca', () => {
    const lista = [rnc({ id: 'a' }), rnc({ id: 'b', ncr_status: 'resolvida' }), rnc({ id: 'c', comprador_id: 'u-outro', decidido_por_id: 'u-outro' })];
    const base = { status: 'abertas' as const, somenteMinhas: false, usuarioId: 'u-isa', busca: '' };
    expect(filtrarRnc(lista, base).map((p) => p.id)).toEqual(['a', 'c']);
    expect(filtrarRnc(lista, { ...base, status: 'resolvidas' }).map((p) => p.id)).toEqual(['b']);
    expect(filtrarRnc(lista, { ...base, somenteMinhas: true }).map((p) => p.id)).toEqual(['a']);
    expect(filtrarRnc(lista, { ...base, status: 'todas', busca: 'ncr-051026' })).toHaveLength(3);
  });
});

import { describe, expect, it } from 'vitest';
import type { Profile, Request, SupPendenciaProcessamentoNF } from '../types';
import {
  camposParaGravar, descreverAlteracoesLinha, descreverAlteracoesMeta, ehChamadoDoGrupoFiscal,
  ehSetorGrupoFiscal, justificativaAjustePedido, podeEditarChamadoSuprimentos,
  podeReabrirChamadoSuprimentos, valoresDaLinha,
} from './chamadosSuprimentosGrupo';

const SETORES = [
  { id: '1', name: 'RH' }, { id: '5', name: 'Suprimentos' }, { id: '6', name: 'Financeiro' },
  { id: '7', name: 'Contabilidade' }, { id: '18', name: 'Controladoria' }, { id: '20', name: 'Fiscal' },
];

const perfil = (over: Partial<Profile> = {}): Profile => ({
  id: 'u-ctrl', name: 'Controladoria', email: 'c@ten.com', cargo: 'Analista',
  sector_id: '18', roles: ['visualizador'], status: 'ativo', created_at: '2026-01-01T00:00:00Z',
  ...over,
} as Profile);

const chamado = (over: Partial<Request> = {}): Request => ({
  id: 'r1', number: '2001', type: 'chamado', status: 'aberto', criticality: 2,
  category_id: 'Pendência de Processamento', target_sector_id: '5',
  solicitante_id: 'u-cont', solicitante_name: 'Contabilidade', solicitante_sector_id: '7',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
  ...over,
} as Request);

describe('grupo fiscal', () => {
  it('Financeiro, Contabilidade, Controladoria e qualquer setor "Fiscal"', () => {
    for (const id of ['6', '7', '18', '20']) expect(ehSetorGrupoFiscal(id, SETORES)).toBe(true);
    expect(ehSetorGrupoFiscal('1', SETORES)).toBe(false);
    expect(ehSetorGrupoFiscal('5', SETORES)).toBe(false);
    expect(ehSetorGrupoFiscal(undefined, SETORES)).toBe(false);
  });

  it('colega da área edita o chamado aberto e reabre o resolvido', () => {
    const u = perfil();
    expect(podeEditarChamadoSuprimentos(chamado(), u, SETORES)).toBe(true);
    expect(podeEditarChamadoSuprimentos(chamado({ status: 'em_atendimento' }), u, SETORES)).toBe(true);
    expect(podeEditarChamadoSuprimentos(chamado({ status: 'resolvido' }), u, SETORES)).toBe(false);
    expect(podeReabrirChamadoSuprimentos(chamado({ status: 'resolvido' }), u, SETORES)).toBe(true);
    expect(podeReabrirChamadoSuprimentos(chamado({ status: 'fechado' }), u, SETORES)).toBe(true);
    expect(podeReabrirChamadoSuprimentos(chamado(), u, SETORES)).toBe(false);
    expect(podeReabrirChamadoSuprimentos(chamado({ status: 'cancelada' }), u, SETORES)).toBe(false);
  });

  it('vale também para Ajuste de Pedido', () => {
    expect(podeEditarChamadoSuprimentos(chamado({ category_id: 'Ajuste de Pedido' }), perfil(), SETORES)).toBe(true);
  });

  it('fora da área não mexe; chamado aberto por outra área também não', () => {
    expect(podeEditarChamadoSuprimentos(chamado(), perfil({ sector_id: '1' }), SETORES)).toBe(false);
    expect(podeEditarChamadoSuprimentos(chamado({ solicitante_sector_id: '1' }), perfil(), SETORES)).toBe(false);
    expect(ehChamadoDoGrupoFiscal(chamado({ solicitante_sector_id: '1' }), perfil(), SETORES)).toBe(false);
  });

  it('só os chamados de pendência do Suprimentos', () => {
    expect(podeEditarChamadoSuprimentos(chamado({ category_id: 'Impressora' }), perfil(), SETORES)).toBe(false);
    expect(podeEditarChamadoSuprimentos(chamado({ type: 'compra' }), perfil(), SETORES)).toBe(false);
  });

  it('o próprio solicitante e o admin, de qualquer setor', () => {
    const rh = chamado({ solicitante_id: 'u-rh', solicitante_sector_id: '1', status: 'resolvido' });
    expect(podeReabrirChamadoSuprimentos(rh, perfil({ id: 'u-rh', sector_id: '1' }), SETORES)).toBe(true);
    expect(podeReabrirChamadoSuprimentos(rh, perfil({ id: 'adm', sector_id: '9', roles: ['admin'] }), SETORES)).toBe(true);
  });
});

const linhaNf = (over: Partial<SupPendenciaProcessamentoNF> = {}): SupPendenciaProcessamentoNF => ({
  id: 'l1', request_id: 'r1', protocolo: 'SUP-281026-01', modelo: 'nfse', numero_nfse: '123',
  nome_fornecedor: 'ACME', valor_nfse: 1080, valor_nfse_raw: '1.080,00', status: 'pendente', ordem: 0,
  created_at: '2026-10-28T00:00:00Z',
  ...over,
});

describe('edição das linhas', () => {
  it('descreve só o que mudou, com antes → depois', () => {
    const antes = valoresDaLinha(linhaNf());
    const depois = { ...antes, nome_fornecedor: 'ACME LTDA', observacao: 'falta pedido' };
    expect(descreverAlteracoesLinha('nfse', antes, depois)).toEqual([
      'Nome Fornecedor: ACME → ACME LTDA',
      'Observação: (vazio) → falta pedido',
    ]);
    expect(descreverAlteracoesLinha('nfse', antes, { ...antes, numero_nfse: ' 123 ' })).toEqual([]);
  });

  it('grava o valor como texto e número; vazio vira null', () => {
    const c = camposParaGravar('nfse', { numero_nfse: '123', valor_nfse_raw: '19.000,50', observacao: '  ' });
    expect(c.valor_nfse_raw).toBe('19.000,50');
    expect(c.valor_nfse).toBe(19000.5);
    expect(c.observacao).toBeNull();
    expect(c.numero_nfse).toBe('123');
  });

  it('valor sem texto original usa o número gravado', () => {
    expect(valoresDaLinha(linhaNf({ valor_nfse_raw: null, valor_nfse: 374.5 })).valor_nfse_raw).toBe('374,5');
  });

  it('ajuste de pedido edita NF, pedido, fornecedor, comprador e demanda', () => {
    const v = valoresDaLinha(linhaNf({ modelo: 'ajuste_pedido', documento_compras: '4100', observacao: 'trocar preço' }));
    expect(Object.keys(v)).toEqual(['numero_nfse', 'documento_compras', 'nome_fornecedor', 'comprador', 'observacao']);
    expect(justificativaAjustePedido('SUP-281026-01', '123', '4100', 'ACME'))
      .toBe('Ajuste de pedido (protocolo SUP-281026-01) — NF 123 / Pedido 4100 / ACME. Ver detalhes e imagem no chamado.');
  });

  it('classificação: só os campos alterados', () => {
    expect(descreverAlteracoesMeta(
      { classif_causa: 'Falta de aprovação', observacao: '' },
      { classif_causa: 'Falta de aprovação', observacao: 'urgente' },
    )).toEqual(['Observação do chamado: (vazio) → urgente']);
  });
});

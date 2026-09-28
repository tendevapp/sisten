import { describe, expect, it } from 'vitest';
import type { QuaChecklistAssinatura } from '../types';
import {
  CHECKLIST_CAMPOS_CABECALHO,
  CHECKLIST_ITENS,
  CHECKLIST_OBSERVACOES,
  CHECKLIST_PAPEIS,
  faltasParaFechar,
  filaAssinaturas,
  papeisPendentes,
  podeColetarAssinaturas,
} from './qualidadeChecklistExpedicao';
import { separarBilingue } from './textoBilingue';

const setores = [{ id: '11', name: 'Qualidade' }, { id: '14', name: 'Produção' }];
const assinatura = (papel: QuaChecklistAssinatura['papel']) => ({ papel } as QuaChecklistAssinatura);

describe('FRM.QUA-0030 - Checklist de Expedição', () => {
  it('mapeia os dez itens fotográficos do Excel', () => {
    expect(CHECKLIST_ITENS.map(item => item.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 19, 20]);
    expect(CHECKLIST_ITENS.every(item => item.descricao.length > 20)).toBe(true);
  });

  it('mapeia as quatro observações e as quatro validações', () => {
    expect(CHECKLIST_OBSERVACOES).toHaveLength(4);
    expect(CHECKLIST_PAPEIS.map(item => item.papel)).toEqual(['QUALIDADE', 'PRODUCAO', 'CLIENTE', 'TRANSPORTADOR']);
  });

  it('todo texto de item, observação e papel tem português e inglês', () => {
    for (const { descricao } of [...CHECKLIST_ITENS, ...CHECKLIST_OBSERVACOES]) {
      const { pt, en } = separarBilingue(descricao);
      expect(pt.length).toBeGreaterThan(10);
      expect(en.length).toBeGreaterThan(10);
    }
    for (const { label } of CHECKLIST_PAPEIS) expect(separarBilingue(label).en).not.toBe('');
  });

  it('mantém os cabeçalhos selecionáveis, sem transformar a data em catálogo', () => {
    expect(CHECKLIST_CAMPOS_CABECALHO).toEqual([
      'cliente', 'projeto', 'tramo_sequencial', 'numero_serie', 'site', 'inspetor_qualidade', 'etiqueta_secao',
    ]);
  });

  it('aponta itens e observações sem resposta antes de fechar', () => {
    const respostas = Object.fromEntries(CHECKLIST_ITENS.map(item => [item.chave, item.numero === 19 ? null : 'OK' as const]));
    const observacoes = { obs_01: { resposta: 'OK' as const, texto: '' }, obs_02: { resposta: null, texto: 'x' } };
    expect(faltasParaFechar(respostas, observacoes)).toEqual({ itens: [19], observacoes: [2, 3, 4] });
  });

  it('lista os papéis que ainda faltam assinar', () => {
    expect(papeisPendentes({ assinaturas: [assinatura('QUALIDADE'), assinatura('CLIENTE')] })).toEqual(['PRODUCAO', 'TRANSPORTADOR']);
  });

  it('monta a fila de assinaturas pelos fechados mais antigos', () => {
    const lista = [
      { id: 'a', status: 'AGUARDANDO_ASSINATURAS' as const, fechado_em: '2026-09-28T12:00:00Z', created_at: '2026-09-28T08:00:00Z' },
      { id: 'b', status: 'RASCUNHO' as const, fechado_em: null, created_at: '2026-09-20T08:00:00Z' },
      { id: 'c', status: 'AGUARDANDO_ASSINATURAS' as const, fechado_em: '2026-09-27T09:00:00Z', created_at: '2026-09-27T07:00:00Z' },
      { id: 'd', status: 'FINALIZADO' as const, fechado_em: '2026-09-26T09:00:00Z', created_at: '2026-09-26T07:00:00Z' },
    ];
    expect(filaAssinaturas(lista).map(item => item.id)).toEqual(['c', 'a']);
  });

  it('coleta assinaturas: no rascunho só o autor; fechado, autor, setor Qualidade ou admin', () => {
    const fechado = { status: 'AGUARDANDO_ASSINATURAS' as const, criado_por: 'autor' };
    expect(podeColetarAssinaturas({ id: 'autor', roles: [], sector_id: '14' }, fechado, setores)).toBe(true);
    expect(podeColetarAssinaturas({ id: 'outro', roles: [], sector_id: '11' }, fechado, setores)).toBe(true);
    expect(podeColetarAssinaturas({ id: 'outro', roles: [], sector_id: '14' }, fechado, setores)).toBe(false);
    expect(podeColetarAssinaturas({ id: 'autor', roles: [], sector_id: '14' }, { ...fechado, status: 'RASCUNHO' }, setores)).toBe(true);
    expect(podeColetarAssinaturas({ id: 'outro', roles: [], sector_id: '11' }, { ...fechado, status: 'RASCUNHO' }, setores)).toBe(false);
    expect(podeColetarAssinaturas({ id: 'autor', roles: [], sector_id: '14' }, { ...fechado, status: 'FINALIZADO' }, setores)).toBe(false);
    expect(podeColetarAssinaturas({ id: 'x', roles: ['admin'], sector_id: '14' }, { ...fechado, status: 'RASCUNHO' }, setores)).toBe(true);
  });
});

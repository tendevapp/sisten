import { describe, expect, it } from 'vitest';
import type { QuaChecklistAssinatura, QuaChecklistExpedicao } from '../types';
import {
  CHECKLIST_CAMPOS_CABECALHO,
  CHECKLIST_ITENS,
  CHECKLIST_OBSERVACOES,
  CHECKLIST_PAPEIS,
  aplicarPendenciaExpedicao,
  type AcaoExpedicaoOffline,
  type ChecklistInput,
  faltasParaFechar,
  filaAssinaturas,
  papeisPendentes,
  podeColetarAssinaturas,
} from './qualidadeChecklistExpedicao';
import { separarBilingue } from './textoBilingue';
import { novaPendencia } from './qualidadeOffline';

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
      'cliente', 'projeto', 'tramo_sequencial', 'numero_serie', 'site', 'inspetor_qualidade',
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

  describe('offline — cópia do aparelho sobre o servidor', () => {
    const usuario = { id: 'autor', name: 'Inspetor' };
    const url = (arquivo: { id: string }) => `blob:${arquivo.id}`;
    const input = {
      cliente: 'Cliente', projeto: 'P1', tramo_sequencial: 'T1-01', numero_serie: 'S1', data_expedicao: '2026-09-29', site: 'Site',
      inspetor_qualidade: 'Inspetor', etiqueta_secao: 'E1', respostas: { item_01: 'OK' as const }, observacoes: {},
      validacao_nomes: { QUALIDADE: '', PRODUCAO: '', CLIENTE: '', TRANSPORTADOR: '' },
    };
    const assinaturaLocal = { id: 'a-local', papel: 'CLIENTE', nomePessoa: 'Fulano', tipo: 'DESENHO' as const, blob: new Blob(['x']), nome: 'CLIENTE.jpg', mimeType: 'image/png', assinadoEm: '2026-09-29T10:00:00Z' };

    it('checklist nascido offline e fechado aparece aguardando assinaturas, sem código', () => {
      const p = novaPendencia<ChecklistInput, AcaoExpedicaoOffline, QuaChecklistExpedicao>('qua_expedicao', 'novo-1', usuario, {
        novo: true, input, acao: 'fechar',
        fotosNovas: [{ id: 'f1', itemChave: 'item_01', blob: new Blob(['abc']), nome: 'f1.jpg', mimeType: 'image/jpeg' }],
        assinaturasNovas: [assinaturaLocal],
      });
      const tela = aplicarPendenciaExpedicao(null, p, url);
      expect(tela).toMatchObject({ id: 'novo-1', codigo_registro: '', status: 'AGUARDANDO_ASSINATURAS', criado_por: 'autor', fechado_por_nome: 'Inspetor', tramo_sequencial: 'T1-01' });
      expect(tela.fotos).toMatchObject([{ id: 'f1', item_chave: 'item_01', preview_url: 'blob:f1', path: '' }]);
      expect(tela.fotos[0].local?.id).toBe('f1');
      expect(tela.assinaturas).toMatchObject([{ papel: 'CLIENTE', nome: 'Fulano', assinado_em: '2026-09-29T10:00:00Z', preview_url: 'blob:a-local' }]);
      expect(tela.validacao_nomes.CLIENTE).toBe('Fulano');
      expect(tela.offline).toMatchObject({ estado: 'pendente', novo: true });
    });

    it('sobre o servidor: some a foto removida e a assinatura nova substitui a do mesmo papel', () => {
      const base = {
        ...input, id: 's1', codigo_registro: 'EXP-290926-01', status: 'AGUARDANDO_ASSINATURAS', criado_por: 'autor', criado_por_nome: 'Inspetor',
        created_at: '2026-09-29T08:00:00Z', updated_at: '2026-09-29T08:00:00Z', fechado_em: '2026-09-29T09:00:00Z',
        fotos: [{ id: 'fs1', checklist_id: 's1', item_chave: 'item_01', path: 's1/item_01/a.jpg', file_name: 'a.jpg', mime_type: 'image/jpeg', size_bytes: 1, created_at: '' },
          { id: 'fs2', checklist_id: 's1', item_chave: 'item_02', path: 's1/item_02/b.jpg', file_name: 'b.jpg', mime_type: 'image/jpeg', size_bytes: 1, created_at: '' }],
        assinaturas: [{ id: 'as1', checklist_id: 's1', papel: 'CLIENTE', nome: 'Antigo', tipo: 'DESENHO', path: 'x', mime_type: 'image/png', created_at: '' },
          { id: 'as2', checklist_id: 's1', papel: 'QUALIDADE', nome: 'Qualidade', tipo: 'DESENHO', path: 'y', mime_type: 'image/png', created_at: '' }],
      } as QuaChecklistExpedicao;
      const p = novaPendencia<ChecklistInput, AcaoExpedicaoOffline, QuaChecklistExpedicao>('qua_expedicao', 's1', usuario, { fotosRemovidas: [{ id: 'fs1', path: 's1/item_01/a.jpg' }], assinaturasNovas: [assinaturaLocal], acao: 'fechar' });
      const tela = aplicarPendenciaExpedicao(base, p, url);
      expect(tela.codigo_registro).toBe('EXP-290926-01');
      expect(tela.status).toBe('AGUARDANDO_ASSINATURAS');
      expect(tela.fechado_em).toBe('2026-09-29T09:00:00Z');
      expect(tela.fotos.map(item => item.id)).toEqual(['fs2']);
      expect(tela.assinaturas.map(item => `${item.papel}:${item.nome}`)).toEqual(['QUALIDADE:Qualidade', 'CLIENTE:Fulano']);
    });
  });
});

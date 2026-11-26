import { describe, expect, it } from 'vitest';
import {
  IDADE_MINIMA_BACKUP_MS, chaveBackup, deveFazerBackup, hashTexto, itemDeOperacao, itemDeOutbox, itemDePendencia, separarArquivos,
} from './backupFila';

const blob = (texto: string, type = 'image/jpeg') => new Blob([texto], { type });

describe('arquivos dentro do item vão à parte', () => {
  it('troca cada Blob por uma marca e devolve os arquivos na ordem', () => {
    const foto = blob('abc');
    const assinatura = blob('xy', 'image/png');
    const { valor, arquivos } = separarArquivos({ nome: 'A', fotos: [{ blob: foto, legenda: 'frente' }], assinatura });
    expect(arquivos).toEqual([foto, assinatura]);
    expect(valor).toEqual({
      nome: 'A',
      fotos: [{ blob: { __arquivo: 0, tipo: 'image/jpeg', tamanho: 3 }, legenda: 'frente' }],
      assinatura: { __arquivo: 1, tipo: 'image/png', tamanho: 2 },
    });
  });
  it('datas viram texto e o resto passa igual', () => {
    const { valor } = separarArquivos({ quando: new Date('2026-11-26T10:00:00Z'), n: 3, nada: null });
    expect(valor).toEqual({ quando: '2026-11-26T10:00:00.000Z', n: 3, nada: null });
  });
});

describe('hash para só reenviar o que mudou', () => {
  it('mesmo texto, mesmo hash; texto diferente, hash diferente', () => {
    expect(hashTexto('abc')).toBe(hashTexto('abc'));
    expect(hashTexto('abc')).not.toBe(hashTexto('abd'));
  });
});

describe('o que entra no backup', () => {
  const agora = Date.parse('2026-11-26T12:00:00Z');
  const ha = (ms: number) => new Date(agora - ms).toISOString();
  it('registro novo do próprio usuário espera um pouco (deve subir sozinho em segundos)', () => {
    expect(deveFazerBackup({ criadoEm: ha(30_000), estado: 'pendente', donoId: 'u1' }, 'u1', agora)).toBe(false);
  });
  it('registro parado há mais que o mínimo entra', () => {
    expect(deveFazerBackup({ criadoEm: ha(IDADE_MINIMA_BACKUP_MS + 1), estado: 'pendente', donoId: 'u1' }, 'u1', agora)).toBe(true);
  });
  it('recusado pelo servidor entra na hora', () => {
    expect(deveFazerBackup({ criadoEm: ha(1_000), estado: 'erro', donoId: 'u1' }, 'u1', agora)).toBe(true);
  });
  it('registro de outro usuário do aparelho entra na hora (só sobe quando ele entrar)', () => {
    expect(deveFazerBackup({ criadoEm: ha(1_000), estado: 'pendente', donoId: 'u2' }, 'u1', agora)).toBe(true);
  });
});

describe('itens de cada fila no mesmo formato', () => {
  it('formulário: mostra o corpo como dado legível, sem cabeçalho de autenticação', () => {
    const item = itemDeOperacao({
      id: 'op1', usuarioId: 'u1', usuarioNome: 'ANA', criadoEm: '2026-11-26T10:00:00Z', metodo: 'POST',
      caminho: '/rest/v1/alm_catalogo_itens?select=*', cabecalhos: { prefer: 'return=representation' },
      corpo: { tipo: 'texto', texto: '{"id":"i1","codigo_sap":"100"}' }, tipo: 'insert', tabela: 'alm_catalogo_itens',
      rotulo: 'Cadastro de Itens', resumo: '100', estado: 'erro', tentativas: 2, erro: 'duplicate key',
    });
    expect(item).toMatchObject({
      fila: 'formularios', itemId: 'op1', donoId: 'u1', donoNome: 'ANA', rotulo: 'Cadastro de Itens', resumo: '100',
      estado: 'erro', erro: 'duplicate key', criadoEm: '2026-11-26T10:00:00Z',
    });
    expect(item.conteudo).toMatchObject({ tipo: 'insert', tabela: 'alm_catalogo_itens', corpo: { id: 'i1', codigo_sap: '100' } });
    expect(JSON.stringify(item.conteudo)).not.toMatch(/authorization/i);
  });
  it('formulário com foto: o arquivo sai do corpo', () => {
    const foto = blob('jpg');
    const item = itemDeOperacao({
      id: 'op2', usuarioId: 'u1', criadoEm: '2026-11-26T10:00:00Z', metodo: 'POST', caminho: '/storage/v1/object/b/p.jpg',
      cabecalhos: {}, corpo: { tipo: 'blob', blob: foto }, tipo: 'upload', rotulo: 'Foto', resumo: '', estado: 'pendente', tentativas: 0, erro: null,
    });
    expect(item.arquivos).toEqual([foto]);
  });
  it('checklist da Qualidade e apontamento da Produção', () => {
    const p = itemDePendencia({ id: 'c1', modulo: 'qua_expedicao', usuarioId: 'u2', usuarioNome: 'BIA', criadoEm: 't', estado: 'erro', ultimoErro: 'x', input: { a: 1 } } as never, 'Checklist de Expedição');
    expect(p).toMatchObject({ fila: 'qualidade', itemId: 'qua_expedicao:c1', donoId: 'u2', donoNome: 'BIA', estado: 'erro', erro: 'x' });
    const o = itemDeOutbox({ id: 'o1', tipo: 'prod_lancamento', payload: { q: 2 }, criadoEm: 't', tentativas: 1, ultimoErro: null }, 'u1', 'ANA');
    expect(o).toMatchObject({ fila: 'producao', itemId: 'o1', donoId: 'u1', rotulo: 'prod_lancamento', estado: 'pendente' });
  });
  it('chave única por aparelho e item', () => {
    expect(chaveBackup('dev-1', 'formularios', 'op1')).toBe('dev-1:formularios:op1');
  });
});

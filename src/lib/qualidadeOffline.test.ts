import { describe, expect, it } from 'vitest';
import {
  descreverPendencia, erroDeArquivoJaExistente, inserirComCodigoUnico, mesclarComPendencias, novaPendencia, pendenciaVazia,
  type PendenciaOffline,
} from './qualidadeOffline';
import { pareceFalhaDeRede } from './rede';

const usuario = { id: 'u1', name: 'Inspetor' };
const foto = (id: string) => ({ id, itemChave: 'item_01', blob: new Blob(['x']), nome: `${id}.jpg`, mimeType: 'image/jpeg' });

describe('Qualidade offline — pendências', () => {
  it('nasce vazia, pendente e no nome do usuário', () => {
    const p = novaPendencia('qua_expedicao', 'c1', usuario);
    expect(p).toMatchObject({ id: 'c1', usuarioId: 'u1', usuarioNome: 'Inspetor', estado: 'pendente', novo: false, input: null, acao: null });
    expect(pendenciaVazia(p)).toBe(true);
  });

  it('não está vazia enquanto houver algo para subir', () => {
    expect(pendenciaVazia(novaPendencia('qua_expedicao', 'c1', usuario, { novo: true }))).toBe(false);
    expect(pendenciaVazia(novaPendencia('qua_expedicao', 'c1', usuario, { fotosNovas: [foto('f1')] }))).toBe(false);
    expect(pendenciaVazia(novaPendencia('qua_expedicao', 'c1', usuario, { acao: 'fechar' }))).toBe(false);
  });

  it('descreve o que falta enviar', () => {
    const p = novaPendencia('qua_expedicao', 'c1', usuario, {
      novo: true, input: {}, acao: 'fechar', fotosNovas: [foto('f1'), foto('f2')],
      fotosRemovidas: [{ id: 'x', path: 'a/b.jpg' }],
    });
    expect(descreverPendencia(p, { fechar: 'fechar checklist' })).toBe('checklist novo · 2 fotos · 1 remoção · fechar checklist');
    expect(descreverPendencia(novaPendencia('qua_expedicao', 'c1', usuario, { input: {} }))).toBe('respostas');
  });

  it('aplica pendências sobre a lista do servidor e põe no topo as que só existem no aparelho', () => {
    type Linha = { id: string; valor: string };
    const servidor: Linha[] = [{ id: 's1', valor: 'servidor' }, { id: 's2', valor: 'servidor' }];
    const pendencias: PendenciaOffline[] = [
      novaPendencia('qua_expedicao', 's2', usuario, { criadoEm: '2026-09-29T08:00:00Z' }),
      novaPendencia('qua_expedicao', 'n1', usuario, { novo: true, criadoEm: '2026-09-29T09:00:00Z' }),
      novaPendencia('qua_expedicao', 'n2', usuario, { novo: true, criadoEm: '2026-09-29T10:00:00Z' }),
    ];
    const aplicar = (base: Linha | null, p: PendenciaOffline): Linha => ({ id: p.id, valor: base ? `${base.valor}+aparelho` : 'só aparelho' });
    expect(mesclarComPendencias(servidor, pendencias, aplicar)).toEqual([
      { id: 'n2', valor: 'só aparelho' },
      { id: 'n1', valor: 'só aparelho' },
      { id: 's1', valor: 'servidor' },
      { id: 's2', valor: 'servidor+aparelho' },
    ]);
  });

  it('gera outro código quando a unique de codigo_registro recusa', async () => {
    const codigos = ['EXP-290926-01', 'EXP-290926-02'];
    const tentados: string[] = [];
    await inserirComCodigoUnico(async () => codigos.shift()!, async codigo => {
      tentados.push(codigo);
      return tentados.length === 1
        ? { error: { code: '23505', message: 'duplicate key value violates unique constraint "qua_checklist_expedicoes_codigo_registro_key"' } }
        : { error: null };
    });
    expect(tentados).toEqual(['EXP-290926-01', 'EXP-290926-02']);
  });

  it('não repete a inserção por outro erro, e desiste depois de 3 códigos repetidos', async () => {
    await expect(inserirComCodigoUnico(async () => 'X', async () => ({ error: { code: '42501', message: 'row-level security' } }))).rejects.toThrow('row-level security');
    let tentativas = 0;
    await expect(inserirComCodigoUnico(async () => 'X', async () => {
      tentativas++;
      return { error: { code: '23505', message: 'codigo_registro_key' } };
    })).rejects.toThrow();
    expect(tentativas).toBe(3);
  });

  it('trata upload repetido como já enviado', () => {
    expect(erroDeArquivoJaExistente({ statusCode: '409', message: 'x' })).toBe(true);
    expect(erroDeArquivoJaExistente({ message: 'The resource already exists' })).toBe(true);
    expect(erroDeArquivoJaExistente({ statusCode: '403', message: 'new row violates row-level security policy' })).toBe(false);
    expect(erroDeArquivoJaExistente(null)).toBe(false);
  });

  it('distingue falta de rede de recusa do servidor', () => {
    expect(pareceFalhaDeRede(new TypeError('Failed to fetch'))).toBe(true);
    expect(pareceFalhaDeRede({ message: 'TypeError: NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(pareceFalhaDeRede(new Error('Load failed'))).toBe(true);
    expect(pareceFalhaDeRede(new Error('new row violates row-level security policy'))).toBe(false);
  });
});

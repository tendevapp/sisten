import { describe, it, expect } from 'vitest';
import {
  codigosDaAtividade, ehJovemAprendiz, jovensDaAtividade, resumoAtividade, resumoPorJovem, rotuloAcao,
  type AtividadeJovem,
} from './almoxCatalogoLog';

const ativ = (over: Partial<AtividadeJovem>): AtividadeJovem => ({
  ocorrido_em: '2026-11-23T10:00:00Z',
  usuario_id: 'k',
  usuario_nome: 'KEMILLY',
  origem: 'cadastro',
  acao: 'alteracao',
  codigo_sap: '10000259',
  descricao: 'LUVA',
  campos: [],
  referencia: null,
  detalhe: null,
  ...over,
});

describe('almoxCatalogoLog', () => {
  it('reconhece o cargo de Jovem Aprendiz', () => {
    expect(ehJovemAprendiz({ cargo: 'JOVEM APRENDIZ' })).toBe(true);
    expect(ehJovemAprendiz({ cargo: 'Aprendiz Administrativo' })).toBe(true);
    expect(ehJovemAprendiz({ cargo: 'ALMOXARIFE' })).toBe(false);
    expect(ehJovemAprendiz(null)).toBe(false);
  });

  it('junta os itens tocados, por jovem, sem contar exclusão', () => {
    const lista = [
      ativ({ codigo_sap: '000010000259' }),
      ativ({ codigo_sap: '10000300', usuario_id: 'j', usuario_nome: 'JOEL', origem: 'contagem', acao: 'contagem' }),
      ativ({ codigo_sap: '10000400', acao: 'exclusao' }),
    ];
    expect([...codigosDaAtividade(lista)].sort()).toEqual(['10000259', '10000300']);
    expect([...codigosDaAtividade(lista, 'j')]).toEqual(['10000300']);
    expect(jovensDaAtividade(lista).map(j => j.nome)).toEqual(['JOEL', 'KEMILLY']);
  });

  it('resume o que foi feito em cada linha', () => {
    expect(rotuloAcao('etiqueta_impressa')).toBe('Imprimiu etiqueta');
    expect(resumoAtividade(ativ({ campos: ['imagem_path', 'posicao_estoque'] }))).toBe('foto principal, localização');
    expect(resumoAtividade(ativ({
      origem: 'contagem', acao: 'contagem', referencia: 'INV-231126-01',
      detalhe: { numero: 2, deposito: '0004', endereco: '104.B02' },
    }))).toBe('INV-231126-01 · 2ª contagem · dep. 0004 · end. 104.B02');
  });

  it('monta o placar por jovem', () => {
    const placar = resumoPorJovem([
      ativ({}), ativ({ acao: 'etiqueta_impressa' }),
      ativ({ origem: 'contagem', acao: 'contagem', codigo_sap: '10000300' }),
    ]);
    expect(placar).toEqual([{ id: 'k', nome: 'KEMILLY', itens: 2, alteracoes: 1, etiquetas: 1, contagens: 1 }]);
  });
});

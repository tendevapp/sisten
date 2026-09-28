import { describe, expect, it } from 'vitest';
import {
  caminhoIlustracaoPdfInternos, ehUsuarioQualidade, etapaDoChecklist, pendentesQualidade, resumoRespostas,
  respostasVazias, separarBilingue, validacoesVazias, type InternosModelo,
} from './qualidadeInternosMecanicos';

const modelo: InternosModelo = {
  id: 'teste',
  nome: 'Modelo de teste',
  sheet: 'TESTE',
  formulario: 'FRM.ENG-0240',
  projeto_padrao: '',
  tramo_padrao: 'T1',
  items: [
    { chave: 'item_01', numero: 1, grupo: 'Grupo', numero_peca: 'PN-1', descricao: 'Teste', ilustracoes: [], indicadores: [] },
    { chave: 'item_02', numero: 2, grupo: 'Grupo', numero_peca: 'PN-2', descricao: 'Teste', ilustracoes: [], indicadores: [] },
  ],
};

const setores = [{ id: '11', name: 'Qualidade' }, { id: '14', name: 'Produção' }];

describe('qualidadeInternosMecanicos', () => {
  it('inicializa todos os itens do modelo para resposta', () => {
    expect(respostasVazias(modelo)).toEqual({
      item_01: { resposta: null, responsavel: '', quantidade_nao_conforme: '', observacao: '' },
      item_02: { resposta: null, responsavel: '', quantidade_nao_conforme: '', observacao: '' },
    });
  });

  it('inicializa as duas validações do formulário fonte', () => {
    expect(validacoesVazias()).toEqual({
      nao_conformidade: { resposta: null, identificacao: '' },
      sdr_aberto: { resposta: null, identificacao: '' },
    });
  });

  it('monta o caminho do recorte do item no PDF', () => {
    expect(caminhoIlustracaoPdfInternos('checklist-t3', 'item_30')).toBe('/qualidade-internos-mecanicos/recortes-pdf/checklist-t3/item_30.png');
  });

  it('separa português e inglês na primeira barra', () => {
    expect(separarBilingue('Verificar torque (40Nm). / Check torque (40Nm).')).toEqual({ pt: 'Verificar torque (40Nm).', en: 'Check torque (40Nm).' });
    expect(separarBilingue('Sem tradução')).toEqual({ pt: 'Sem tradução', en: '' });
    expect(separarBilingue('MOBILE STEPS / MOBILE STEPS')).toEqual({ pt: 'MOBILE STEPS', en: '' });
    expect(separarBilingue('')).toEqual({ pt: '', en: '' });
  });

  it('reconhece a Qualidade pelo setor ou admin', () => {
    expect(ehUsuarioQualidade({ roles: ['requisitante'], sector_id: '11' }, setores)).toBe(true);
    expect(ehUsuarioQualidade({ roles: ['requisitante'], sector_id: '14' }, setores)).toBe(false);
    expect(ehUsuarioQualidade({ roles: ['admin'], sector_id: '14' }, setores)).toBe(true);
  });

  it('deriva a etapa do status', () => {
    expect(etapaDoChecklist(undefined)).toBe('PRODUCAO');
    expect(etapaDoChecklist('RASCUNHO')).toBe('PRODUCAO');
    expect(etapaDoChecklist('AGUARDANDO_QUALIDADE')).toBe('QUALIDADE');
    expect(etapaDoChecklist('FINALIZADO')).toBe('LEITURA');
  });

  it('lista pendências da Qualidade da mais antiga para a mais nova', () => {
    const lista = [
      { id: 'a', status: 'AGUARDANDO_QUALIDADE' as const, producao_concluida_em: '2026-09-28T12:00:00Z', created_at: '2026-09-28T08:00:00Z' },
      { id: 'b', status: 'FINALIZADO' as const, producao_concluida_em: '2026-09-27T12:00:00Z', created_at: '2026-09-27T08:00:00Z' },
      { id: 'c', status: 'AGUARDANDO_QUALIDADE' as const, producao_concluida_em: '2026-09-28T09:00:00Z', created_at: '2026-09-28T07:00:00Z' },
      { id: 'd', status: 'RASCUNHO' as const, producao_concluida_em: null, created_at: '2026-09-26T07:00:00Z' },
    ];
    expect(pendentesQualidade(lista).map(item => item.id)).toEqual(['c', 'a']);
  });

  it('conta NC da produção e da qualidade', () => {
    expect(resumoRespostas({
      item_01: { resposta: 'NAO_CONFORME', responsavel: 'A', quantidade_nao_conforme: '', observacao: '', qualidade_resposta: 'CONFORME' },
      item_02: { resposta: 'CONFORME', responsavel: 'A', quantidade_nao_conforme: '2', observacao: '', qualidade_resposta: 'NAO_CONFORME' },
      item_03: { resposta: 'CONFORME', responsavel: 'A', quantidade_nao_conforme: '', observacao: '' },
    })).toEqual({ producaoNc: 1, qualidadeNc: 1, qualidadeRespondidos: 2 });
  });
});

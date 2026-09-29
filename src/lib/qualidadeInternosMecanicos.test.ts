import { describe, expect, it } from 'vitest';
import {
  aplicarPendenciaInternos, caminhoIlustracaoPdfInternos, dataLocalDe, ehUsuarioQualidade, etapaDoChecklist, pendentesQualidade, resumoRespostas,
  respostasVazias, separarBilingue, validacoesVazias, type AcaoInternosOffline, type InternosChecklist, type InternosChecklistInput, type InternosModelo,
} from './qualidadeInternosMecanicos';
import { novaPendencia } from './qualidadeOffline';

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

  describe('offline — cópia do aparelho sobre o servidor', () => {
    const usuario = { id: 'prod', name: 'Produção' };
    const url = (arquivo: { id: string }) => `blob:${arquivo.id}`;
    const input = {
      modelo_id: 'teste', modelo_nome: 'Modelo de teste', versao_formulario: 'FRM.ENG-0240 Rev.02', projeto: 'P1', tramo: 'T1', sequencial: '01',
      responsavel_producao: 'Produção', responsavel_qualidade: '', instrumentos_utilizados: '', respostas: {}, validacoes: validacoesVazias(),
      observacao_final: '', aprovacao_final_qualidade: false,
    };

    it('concluído no aparelho já aparece aguardando a Qualidade, com a assinatura datada do dia da captura', () => {
      const assinadoEm = new Date(2026, 8, 29, 23, 30).toISOString();
      const p = novaPendencia<InternosChecklistInput, AcaoInternosOffline, InternosChecklist>('qua_internos', 'n1', usuario, {
        novo: true, input, acao: 'concluir',
        assinaturasNovas: [{ id: 'a1', papel: 'PRODUCAO', nomePessoa: 'Produção', tipo: 'DESENHO', blob: new Blob(['x']), nome: 'p.jpg', mimeType: 'image/png', assinadoEm, setor: 'Produção' }],
      });
      const tela = aplicarPendenciaInternos(null, p, url);
      expect(tela).toMatchObject({ id: 'n1', codigo_registro: '', status: 'AGUARDANDO_QUALIDADE', producao_concluida_por: 'prod', tramo: 'T1', modelo_id: 'teste' });
      expect(tela.assinaturas).toMatchObject([{ papel: 'PRODUCAO', setor: 'Produção', data_assinatura: '2026-09-29', preview_url: 'blob:a1' }]);
      expect(tela.offline?.novo).toBe(true);
    });

    it('finalizado no aparelho pela Qualidade vai para o histórico', () => {
      const base = { ...input, id: 's1', codigo_registro: 'IMC-290926-01', status: 'AGUARDANDO_QUALIDADE', fotos: [], assinaturas: [], finalizado_em: null, qualidade_por: null } as unknown as InternosChecklist;
      const tela = aplicarPendenciaInternos(base, novaPendencia<InternosChecklistInput, AcaoInternosOffline, InternosChecklist>('qua_internos', 's1', { id: 'qua', name: 'Qualidade' }, { acao: 'finalizar' }), url);
      expect(tela).toMatchObject({ status: 'FINALIZADO', qualidade_por: 'qua', qualidade_por_nome: 'Qualidade', codigo_registro: 'IMC-290926-01' });
    });

    it('usa o dia local do instante', () => {
      expect(dataLocalDe(new Date(2026, 0, 5, 0, 10).toISOString())).toBe('2026-01-05');
    });
  });
});

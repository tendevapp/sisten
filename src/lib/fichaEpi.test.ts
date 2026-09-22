import { describe, expect, it } from 'vitest';
import {
  analisarConsumo,
  colaboradoresSemFicha,
  diasEntre,
  intervalosDeReposicao,
  linhasParaPayload,
  mediana,
  montarLinhasFicha,
  pendentesDevolucaoPorGrupo,
  linhasSemRespostaDevolucao,
  motivoPadrao,
  sugerirFuncaoPorCargo,
  textoHaQuantosDias,
  type LinhaConsumo,
  type MotivoMed,
} from './fichaEpi';
import type { SsmaBookEpi } from './ssmaBookEpisApi';
import type { SsmaEpiFuncao, SsmaEpiPorFuncao } from './ssmaEpiPorFuncaoApi';

const funcao = (id: string, nome: string): SsmaEpiFuncao => ({ id, codigo_origem: id, nome, ativo: true });

const FUNCOES = [
  funcao('f-sold', 'SOLDADOR I, II E III'),
  funcao('f-jat', 'JATISTA II'),
  funcao('f-lix', 'LIXADOR'),
  funcao('f-coord', 'COORDENADOR DE MANUTENCAO'),
  funcao('f-tec', 'TÉCNICO DE SEGURANÇA DO TRABALHO I e II'),
  funcao('f-op1', 'OPERADOR DE MAQUINAS I'),
  funcao('f-op2', 'OPERADOR DE MAQUINAS II'),
];

describe('sugerirFuncaoPorCargo', () => {
  it('casa nome idêntico', () => {
    expect(sugerirFuncaoPorCargo('LIXADOR', FUNCOES)).toMatchObject({ funcao: { id: 'f-lix' }, confianca: 'exata' });
  });

  it('ignora acentos e caixa', () => {
    expect(sugerirFuncaoPorCargo('Coordenador de Manutenção', FUNCOES)?.funcao.id).toBe('f-coord');
  });

  it('encontra o nível dentro de uma função que agrupa níveis', () => {
    expect(sugerirFuncaoPorCargo('SOLDADOR II', FUNCOES)).toMatchObject({ funcao: { id: 'f-sold' }, confianca: 'nivel' });
    expect(sugerirFuncaoPorCargo('TECNICO DE SEGURANCA DO TRABALHO II', FUNCOES)?.funcao.id).toBe('f-tec');
  });

  it('prefere a função do mesmo nível quando há uma por nível', () => {
    expect(sugerirFuncaoPorCargo('OPERADOR DE MAQUINAS II', FUNCOES)?.funcao.id).toBe('f-op2');
  });

  it('marca como aproximada quando só a base coincide', () => {
    expect(sugerirFuncaoPorCargo('JATISTA I', FUNCOES)).toMatchObject({ funcao: { id: 'f-jat' }, confianca: 'aproximada' });
  });

  it('não sugere sem cargo ou sem correspondência', () => {
    expect(sugerirFuncaoPorCargo(null, FUNCOES)).toBeNull();
    expect(sugerirFuncaoPorCargo('MECANICO MONTADOR', FUNCOES)).toBeNull();
  });
});

describe('datas e motivo', () => {
  it('conta dias pela data ISO, sem fuso', () => {
    expect(diasEntre('2026-08-31', '2026-09-01')).toBe(1);
    expect(diasEntre('2026-01-01', '2026-03-01')).toBe(59);
  });

  it('descreve o intervalo do histórico', () => {
    expect(textoHaQuantosDias(0)).toBe('hoje');
    expect(textoHaQuantosDias(1)).toBe('ontem');
    expect(textoHaQuantosDias(42)).toBe('há 42 dias');
  });

  it('sugere o motivo da ficha pelo histórico', () => {
    expect(motivoPadrao(null, 'f-lix')).toBe(1);
    expect(motivoPadrao('f-sold', 'f-lix')).toBe(4);
    expect(motivoPadrao('f-lix', 'f-lix')).toBe(2);
  });
});

const epi = (id: string, grupo: string, tamanho: string | null, extra: Partial<SsmaBookEpi> = {}): SsmaBookEpi => ({
  id, categoria: 'CALCADOS', grupo_epi: grupo, descricao_epi: grupo, indicacao: null, ca: `CA-${id}`, validade: null,
  fabricante: null, tamanho, codigo_sap: `SAP-${id}`, descricao_sap: null, imagem_path: null, imagem_nome: null,
  imagem_mime: null, imagem_tamanho: null, ativo: true, criado_por: 'x', atualizado_por: null,
  created_at: '', updated_at: '', ...extra,
});

const BOOK = [
  epi('b40', 'BOTINA', '40'),
  epi('b41', 'BOTINA', '41'),
  epi('b42', 'BOTINA', '42'),
  epi('luva', 'LUVA VAQUETA', null, { categoria: 'MAOS' }),
  epi('avental', 'AVENTAL RASPA', null, { categoria: 'TRONCO' }),
];

const requisito = (id: string, epiId: string | null, classificacao: SsmaEpiPorFuncao['classificacao']): SsmaEpiPorFuncao => ({
  id, funcao_id: 'f-sold', epi_book_id: epiId, codigo_vinculo_origem: null, codigo_epi_origem: id,
  descricao_epi_origem: `ORIGEM ${id}`, ca_origem: '123', classificacao, condicao_uso: null, ativo: true,
});

describe('montarLinhasFicha', () => {
  const requisitos = [
    requisito('r1', 'b40', 'BASICO_OBRIGATORIO'),
    requisito('r2', 'luva', 'ESPECIFICO_OBRIGATORIO'),
    requisito('r3', 'avental', 'CONDICIONAL_POR_EXPOSICAO'),
    requisito('r4', 'b41', 'BASICO_OBRIGATORIO'), // mesmo EPI do r1
    requisito('r5', null, 'BASICO_OBRIGATORIO'), // sem vínculo no Book
  ];

  it('oferece os tamanhos do mesmo EPI e une requisitos repetidos', () => {
    const linhas = montarLinhasFicha({ requisitos, book: BOOK, historico: [], motivo: 1 });
    expect(linhas).toHaveLength(4);
    expect(linhas[0].variantes.map(v => v.tamanho)).toEqual(['40', '41', '42']);
    expect(linhas[0].epiBookId).toBe('b40');
  });

  it('deixa os condicionais desmarcados', () => {
    const linhas = montarLinhasFicha({ requisitos, book: BOOK, historico: [], motivo: 1 });
    expect(linhas.find(l => l.requisitoId === 'r3')?.incluir).toBe(false);
    expect(linhas.find(l => l.requisitoId === 'r2')?.incluir).toBe(true);
  });

  it('repete o tamanho da última entrega', () => {
    const linhas = montarLinhasFicha({
      requisitos, book: BOOK, motivo: 2,
      historico: [{
        item_id: 'h1', grupo_epi: 'BOTINA', categoria: 'CALCADOS', epi_book_id: 'b42', descricao: 'BOTINA', tamanho: '42',
        quantidade: 1, data_entrega: '2026-08-01', codigo_ficha: 'EPI-010826-01', data_devolucao: null,
      }],
    });
    expect(linhas[0].epiBookId).toBe('b42');
  });

  it('grava o snapshot só das linhas marcadas', () => {
    const linhas = montarLinhasFicha({ requisitos, book: BOOK, historico: [], motivo: 1 });
    const payload = linhasParaPayload(linhas);
    expect(payload.map(p => p.requisito_id)).toEqual(['r1', 'r2', 'r5']);
    expect(payload[0]).toMatchObject({ descricao: 'BOTINA - TAM. 40', ca: 'CA-b40', codigo_sap: 'SAP-b40', tamanho: '40' });
    expect(payload[2]).toMatchObject({ epi_book_id: null, descricao: 'ORIGEM r5', ca: '123' });
  });

  describe('devolução na troca', () => {
    const historico = [
      { item_id: 'antiga', grupo_epi: 'BOTINA', categoria: 'CALCADOS', epi_book_id: 'b40', descricao: 'BOTINA', tamanho: '40',
        quantidade: 1, data_entrega: '2026-05-01', codigo_ficha: 'EPI-010526-01', data_devolucao: '2026-06-01' },
      { item_id: 'pendente', grupo_epi: 'BOTINA', categoria: 'CALCADOS', epi_book_id: 'b40', descricao: 'BOTINA', tamanho: '40',
        quantidade: 1, data_entrega: '2026-06-01', codigo_ficha: 'EPI-010626-01', data_devolucao: null },
    ];

    it('lista só as entregas ainda não devolvidas', () => {
      expect(pendentesDevolucaoPorGrupo(historico).get('CALCADOS|BOTINA')?.map(p => p.item_id)).toEqual(['pendente']);
    });

    it('exige a resposta Sim/Não antes de assinar', () => {
      const linhas = montarLinhasFicha({ requisitos: [requisito('r1', 'b40', 'BASICO_OBRIGATORIO')], book: BOOK, historico, motivo: 2 });
      expect(linhas[0].devolverAnteriores).toBeNull();
      expect(linhasSemRespostaDevolucao(linhas)).toHaveLength(1);
      expect(linhasSemRespostaDevolucao([{ ...linhas[0], devolverAnteriores: false }])).toHaveLength(0);
      expect(linhasSemRespostaDevolucao([{ ...linhas[0], incluir: false }])).toHaveLength(0);
    });

    it('devolve o anterior só quando a resposta é Sim', () => {
      const linhas = montarLinhasFicha({ requisitos: [requisito('r1', 'b40', 'BASICO_OBRIGATORIO')], book: BOOK, historico, motivo: 2 });
      expect(linhasParaPayload([{ ...linhas[0], devolverAnteriores: true }])[0].devolver_item_ids).toEqual(['pendente']);
      expect(linhasParaPayload([{ ...linhas[0], devolverAnteriores: false }])[0].devolver_item_ids).toEqual([]);
    });

    it('não pergunta nem devolve em admissão ou mudança de função', () => {
      const linhas = montarLinhasFicha({ requisitos: [requisito('r1', 'b40', 'BASICO_OBRIGATORIO')], book: BOOK, historico, motivo: 4 });
      expect(linhasSemRespostaDevolucao(linhas)).toHaveLength(0);
      expect(linhasParaPayload([{ ...linhas[0], devolverAnteriores: true }])[0].devolver_item_ids).toEqual([]);
    });
  });
});

let seq = 0;
const consumo = (pessoa: string, grupo: string, data: string, motivo: MotivoMed, extra: Partial<LinhaConsumo> = {}): LinhaConsumo => ({
  item_id: `i${++seq}`, ficha_id: `${pessoa}-${data}`, pessoa_id: pessoa, registro: pessoa, nome: pessoa.toUpperCase(),
  setor: 'PRODUCAO', funcao_id: 'f-sold', funcao_nome: 'SOLDADOR', data_entrega: data, grupo_epi: grupo,
  categoria: 'CAT', quantidade: 1, motivo, fora_da_matriz: false, data_devolucao: null, ...extra,
});

describe('análise de consumo', () => {
  it('mede duração só entre reposições', () => {
    const linhas = [
      consumo('ana', 'LUVA', '2026-01-01', 1),
      consumo('ana', 'LUVA', '2026-01-31', 2),
      consumo('ana', 'LUVA', '2026-03-02', 3),
      consumo('ana', 'LUVA', '2026-03-12', 4), // mudança de função: não mede desgaste
    ];
    expect(intervalosDeReposicao(linhas).map(i => i.dias)).toEqual([30, 30]);
  });

  it('calcula mediana', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([30, 10, 20])).toBe(20);
    expect(mediana([10, 20, 30, 40])).toBe(25);
  });

  it('consolida ranking, perdas e trocas precoces', () => {
    const linhas = [
      consumo('ana', 'LUVA', '2026-01-01', 1),
      consumo('ana', 'LUVA', '2026-01-31', 2),
      consumo('ana', 'LUVA', '2026-03-02', 2),
      consumo('ana', 'LUVA', '2026-04-01', 2),
      consumo('bia', 'LUVA', '2026-01-01', 1),
      consumo('bia', 'LUVA', '2026-01-08', 3, { quantidade: 2 }),
      consumo('bia', 'BOTINA', '2026-01-01', 1),
    ];
    const analise = analisarConsumo(linhas);

    expect(analise.resumo).toMatchObject({ colaboradores: 2, unidades: 8, tiposEpi: 2, unidadesPerda: 2 });
    expect(analise.porEpi[0]).toMatchObject({ grupoEpi: 'LUVA', unidades: 7, colaboradores: 2, perdas: 2 });

    const luva = analise.duracaoPorFuncao.find(d => d.grupoEpi === 'LUVA');
    expect(luva).toMatchObject({ amostras: 4, minimoDias: 7, maximoDias: 30, medianaDias: 30 });

    const bia = analise.porColaborador.find(c => c.pessoaId === 'bia');
    expect(bia).toMatchObject({ unidades: 4, tiposEpi: 2, perdas: 2, trocasPrecoces: 1 });
    expect(analise.porMotivo.find(m => m.motivo === 3)?.unidades).toBe(2);
    expect(analise.porMes.map(m => m.mes)).toEqual(['2026-01', '2026-03', '2026-04']);
  });

  it('usa a entrega anterior ao período para medir a reposição do período', () => {
    const anterior = consumo('ana', 'LUVA', '2025-12-01', 1);
    const noPeriodo = consumo('ana', 'LUVA', '2026-01-10', 2);
    const analise = analisarConsumo([noPeriodo], [anterior, noPeriodo]);
    expect(analise.resumo.unidades).toBe(1);
    expect(analise.resumo.duracaoMedianaGeral).toBe(40);
  });

  it('lista ativos sem ficha', () => {
    expect(colaboradoresSemFicha([{ id: 'a' }, { id: 'b' }], ['a']).map(p => p.id)).toEqual(['b']);
  });
});

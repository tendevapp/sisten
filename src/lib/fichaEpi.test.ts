import { describe, expect, it } from 'vitest';
import {
  analisarConsumo,
  colaboradoresSemFicha,
  detalharColaborador,
  diasEntre,
  epiDoBookPorCodigoSap,
  filtrarConsumo,
  filtrosConsumoAtivos,
  filtrosConsumoVazios,
  SEM_SETOR,
  intervalosDeReposicao,
  linhasParaPayload,
  linhaSapForaDoBook,
  materiaisSapPorGrupo,
  mediana,
  montarLinhasFicha,
  pendentesDevolucaoPorGrupo,
  resumirFichasColaborador,
  linhasSemRespostaDevolucao,
  motivoPadrao,
  sugerirFuncaoPorCargo,
  textoHaQuantosDias,
  type LinhaConsumo,
  type MotivoMed,
} from './fichaEpi';
import { extrairPalavrasChave } from './buscaKeywords';
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

  it('traz tudo desmarcado quando o colaborador já tem ficha ativa', () => {
    const linhas = montarLinhasFicha({ requisitos, book: BOOK, historico: [], motivo: 1, todosDesmarcados: true });
    expect(linhas).toHaveLength(4);
    expect(linhas.every(l => !l.incluir)).toBe(true);
    expect(linhasParaPayload(linhas)).toEqual([]);
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
  categoria: 'CAT', codigo_sap: null, descricao_sap: null, quantidade: 1, motivo, fora_da_matriz: false, data_devolucao: null, ...extra,
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

describe('filtros cruzados do consumo', () => {
  const base = [
    consumo('ana', 'LUVA', '2026-01-01', 1, { funcao_id: 'f-sold', setor: 'PRODUCAO' }),
    consumo('ana', 'BOTINA', '2026-01-01', 1, { funcao_id: 'f-sold', setor: 'PRODUCAO' }),
    consumo('bia', 'LUVA', '2026-02-01', 2, { funcao_id: 'f-lix', funcao_nome: 'LIXADOR', setor: null }),
    consumo('caio', 'CAPACETE', '2026-03-01', 3, { funcao_id: 'f-lix', funcao_nome: 'LIXADOR', setor: 'PRODUCAO' }),
  ];

  it('combina filtros com E entre eles e OU dentro de cada um', () => {
    const f = { ...filtrosConsumoVazios(), funcoes: new Set(['f-lix']), epis: new Set(['CAT|LUVA', 'CAT|CAPACETE']) };
    expect(filtrarConsumo(base, f).map(l => l.pessoa_id)).toEqual(['bia', 'caio']);
    expect(filtrarConsumo(base, { ...f, motivos: new Set(['3']) }).map(l => l.pessoa_id)).toEqual(['caio']);
  });

  it('trata setor vazio como "Sem setor" e respeita o período', () => {
    expect(filtrarConsumo(base, { ...filtrosConsumoVazios(), setores: new Set([SEM_SETOR]) }).map(l => l.pessoa_id)).toEqual(['bia']);
    expect(filtrarConsumo(base, filtrosConsumoVazios('2026-02-15')).map(l => l.pessoa_id)).toEqual(['caio']);
  });

  it('busca por todas as palavras, sem acento e em vários campos', () => {
    expect(filtrarConsumo(base, { ...filtrosConsumoVazios(), palavras: extrairPalavrasChave('lixador luva') }).map(l => l.pessoa_id)).toEqual(['bia']);
    expect(filtrarConsumo(base, { ...filtrosConsumoVazios(), palavras: extrairPalavrasChave('ANA') }).length).toBe(2);
  });

  it('ignorar uma dimensão devolve as opções que os outros filtros permitem', () => {
    const f = { ...filtrosConsumoVazios(), funcoes: new Set(['f-lix']), epis: new Set(['CAT|LUVA']) };
    // Para listar os EPIs, o filtro de EPI sai e a função continua valendo.
    expect(new Set(filtrarConsumo(base, f, 'epis').map(l => l.grupo_epi))).toEqual(new Set(['LUVA', 'CAPACETE']));
  });

  it('busca pelo código e pela descrição SAP e agrupa os materiais de cada EPI', () => {
    const linhas = [
      consumo('ana', 'LUVA', '2026-01-01', 1, { codigo_sap: '1001', descricao_sap: 'LUVA VAQUETA P' }),
      consumo('bia', 'LUVA', '2026-01-02', 1, { codigo_sap: '1002', descricao_sap: 'LUVA VAQUETA G', quantidade: 3 }),
      consumo('caio', 'BOTINA', '2026-01-03', 1, { codigo_sap: '2001', descricao_sap: 'BOTINA COURO' }),
    ];
    expect(filtrarConsumo(linhas, { ...filtrosConsumoVazios(), palavras: extrairPalavrasChave('1002') }).map(l => l.pessoa_id)).toEqual(['bia']);
    expect(filtrarConsumo(linhas, { ...filtrosConsumoVazios(), palavras: extrairPalavrasChave('vaqueta') }).length).toBe(2);
    expect(materiaisSapPorGrupo(linhas).get('CAT|LUVA')).toEqual([
      { codigo: '1002', descricao: 'LUVA VAQUETA G', unidades: 3 },
      { codigo: '1001', descricao: 'LUVA VAQUETA P', unidades: 1 },
    ]);
    expect(analisarConsumo(linhas).porEpi[0].materiaisSap.map(m => m.codigo)).toEqual(['1002', '1001']);
    expect(detalharColaborador('bia', linhas)!.porEpi[0].materiaisSap[0].codigo).toBe('1002');
  });

  it('conta filtros ativos', () => {
    expect(filtrosConsumoAtivos(filtrosConsumoVazios('2026-01-01'), '2026-01-01')).toBe(0);
    expect(filtrosConsumoAtivos({ ...filtrosConsumoVazios(), epis: new Set(['a', 'b']), palavras: ['x'] }, null)).toBe(3);
  });
});

describe('detalhe de consumo do colaborador', () => {
  const historico = [
    consumo('ana', 'LUVA', '2026-01-01', 1),
    consumo('ana', 'LUVA', '2026-01-31', 2),
    consumo('ana', 'LUVA', '2026-03-02', 2),
    consumo('ana', 'LUVA', '2026-04-01', 2),
    consumo('bia', 'LUVA', '2026-01-01', 1),
    consumo('bia', 'LUVA', '2026-01-08', 3, { quantidade: 2 }),
    consumo('bia', 'BOTINA', '2026-01-01', 1),
  ];

  it('devolve null quando o colaborador não tem entregas', () => {
    expect(detalharColaborador('zé', historico)).toBeNull();
  });

  it('mostra duração do colaborador × mediana da função e marca a troca precoce', () => {
    const bia = detalharColaborador('bia', historico)!;
    expect(bia.resumo).toMatchObject({ unidades: 4, tiposEpi: 2, perdas: 2, trocasPrecoces: 1, primeiraEntrega: '2026-01-01', ultimaEntrega: '2026-01-08', duracaoMedianaDias: 7 });

    const luva = bia.porEpi.find(e => e.grupoEpi === 'LUVA')!;
    expect(luva).toMatchObject({ unidades: 3, entregas: 2, perdas: 2, duracaoMedianaDias: 7, referenciaFuncaoDias: 30, precoces: 1, reposicaoPrevista: '2026-02-07' });
    // Sem reposição medida (só uma entrega) → sem duração nem previsão pela própria história.
    expect(bia.porEpi.find(e => e.grupoEpi === 'BOTINA')).toMatchObject({ duracaoMedianaDias: null, referenciaFuncaoDias: null, reposicaoPrevista: null });

    // Da mais recente para a mais antiga, com os dias desde a entrega anterior do mesmo EPI.
    expect(bia.entregas.map(e => [e.data, e.grupoEpi, e.diasDesdeAnterior, e.precoce])).toEqual([
      ['2026-01-08', 'LUVA', 7, true],
      ['2026-01-01', 'BOTINA', null, false],
      ['2026-01-01', 'LUVA', null, false],
    ]);
  });

  it('sem amostras suficientes na função não há referência nem troca precoce', () => {
    const ana = detalharColaborador('ana', [consumo('ana', 'LUVA', '2026-01-01', 1), consumo('ana', 'LUVA', '2026-01-05', 2)])!;
    expect(ana.porEpi[0]).toMatchObject({ duracaoMedianaDias: 4, referenciaFuncaoDias: null, precoces: 0, reposicaoPrevista: '2026-01-09' });
  });
});

describe('resumo da ficha completa do colaborador', () => {
  const item = (id: string, grupo: string, qtd: number, motivo: MotivoMed, devolucao: string | null = null) => ({
    id, ordem: 1, ca: null, quantidade: qtd, descricao: grupo, motivo, data_devolucao: devolucao,
    devolucao_registrada_por_nome: null, grupo_epi: grupo, categoria: 'CAT',
  });
  const ficha = (id: string, data: string, itens: ReturnType<typeof item>[], extra: Record<string, unknown> = {}) => ({
    id, data_entrega: data, status: 'ATIVA', created_at: `${data}T10:00:00Z`, assinatura_pendente: false,
    data_admissao: null, data_demissao: null, itens, ...extra,
  });

  it('soma só as fichas ativas e separa em uso, devolvido, perda e pendência', () => {
    const resumo = resumirFichasColaborador([
      ficha('a', '2026-01-10', [item('1', 'LUVA', 2, 1), item('2', 'BOTINA', 1, 1, '2026-03-01')], { data_admissao: '2025-12-01' }),
      ficha('b', '2026-03-05', [item('3', 'LUVA', 1, 3)], { assinatura_pendente: true }),
      ficha('c', '2026-04-01', [item('4', 'CAPACETE', 5, 1)], { status: 'CANCELADA' }),
    ]);
    expect(resumo).toMatchObject({
      fichasAtivas: 2, fichasCanceladas: 1, assinaturasPendentes: 1, epis: 2, unidades: 4,
      emUso: 3, devolvidos: 1, perdas: 1, primeiraEntrega: '2026-01-10', ultimaEntrega: '2026-03-05', dataAdmissao: '2025-12-01',
    });
  });
});

describe('EPI fora do Book (catálogo SAP)', () => {
  it('acha o EPI do Book pelo código SAP, ignorando zeros à esquerda', () => {
    const book = [epi('b1', 'BOTINA', '40', { codigo_sap: '1352000' })];
    expect(epiDoBookPorCodigoSap(book, '0001352000')?.id).toBe('b1');
    expect(epiDoBookPorCodigoSap(book, '999')).toBeNull();
    expect(epiDoBookPorCodigoSap(book, '')).toBeNull();
  });

  it('linha do SAP vai marcada como fora do Book, com código e descrição do SAP no payload', () => {
    const linha = linhaSapForaDoBook({ codigo: '1400123', descricao: 'PROTETOR SOLAR FPS 50' }, [], 1);
    expect(linha).toMatchObject({ foraDoBook: true, foraDaMatriz: true, incluir: true, epiBookId: null, codigoSapSemBook: '1400123' });
    const [item] = linhasParaPayload([{ ...linha, caSemBook: '12345', quantidade: 2 }]);
    expect(item).toMatchObject({
      epi_book_id: null, requisito_id: null, grupo_epi: 'PROTETOR SOLAR FPS 50', descricao: 'PROTETOR SOLAR FPS 50',
      codigo_sap: '1400123', ca: '12345', quantidade: 2, fora_da_matriz: true,
    });
  });

  it('linha da matriz sem vínculo no Book também é sinalizada', () => {
    const linhas = montarLinhasFicha({
      requisitos: [requisito('r5', null, 'BASICO_OBRIGATORIO')], book: BOOK, historico: [], motivo: 1,
    });
    expect(linhas[0].foraDoBook).toBe(true);
    expect(montarLinhasFicha({ requisitos: [requisito('r1', 'b40', 'BASICO_OBRIGATORIO')], book: BOOK, historico: [], motivo: 1 })[0].foraDoBook).toBe(false);
  });
});

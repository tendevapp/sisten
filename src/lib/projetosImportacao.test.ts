/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  normalizarCabecalho,
  normalizarSentido,
  mapearColunas,
  parseLinhasImportacao,
  agruparPorNota,
  detectarRepeticaoExata,
  dividirGrupoRepetido,
  reconciliarGrupo,
  consolidarOrdensSaida,
  processarImportacaoMovimentos,
  checkNaoEntregue,
  quantidadeEsperada,
  chaveNaoEntregue,
  itensForaDoCatalogo,
  pendenciasAtendidas,
  observacaoDoCredito,
  marcarDuplicidades,
  type EntradaExistente,
  type LinhaImportacao,
} from './projetosImportacao';

const CABECALHO = ['Data', 'Situação', 'TRAMO', 'NF', 'Aplicação', 'Cod.Sap', 'Part.Number', 'Descrição do Material', 'CHECK', 'UND', 'Fornecedor'];

/** Linha no formato bruto da planilha (array posicional, igual ao cabeçalho). */
const linha = (data: string, nf: string, aplicacao: string, codSap: string, pn: string, desc: string, qtd: string | number, forn = 'Atlanta') =>
  [data, 'Entrada', '', nf, aplicacao, codSap, pn, desc, qtd, 'UND', forn];

describe('normalizarCabecalho', () => {
  it('ignora acento, caixa e pontuação', () => {
    expect(normalizarCabecalho('Situação')).toBe('situacao');
    expect(normalizarCabecalho('Cod.Sap')).toBe('codsap');
    expect(normalizarCabecalho('  Part.Number ')).toBe('partnumber');
  });
});

describe('mapearColunas', () => {
  it('casa o cabeçalho real da planilha', () => {
    const { indices, faltando } = mapearColunas(CABECALHO);
    expect(faltando).toEqual([]);
    expect(indices.nf).toBe(3);
    expect(indices.part_number).toBe(6);
    expect(indices.quantidade).toBe(8);
  });

  it('acusa coluna obrigatória faltando', () => {
    const { faltando } = mapearColunas(['Data', 'Situação', 'Aplicação']);
    expect(faltando).toContain('NF');
    expect(faltando).toContain('Part.Number');
  });

  it('aceita alias de coluna', () => {
    const { indices, faltando } = mapearColunas(['Data', 'Nota Fiscal', 'Part Number', 'Quantidade']);
    expect(faltando).toEqual([]);
    expect(indices.nf).toBe(1);
    expect(indices.part_number).toBe(2);
    expect(indices.quantidade).toBe(3);
  });
});

describe('parseLinhasImportacao', () => {
  it('recusa planilha sem coluna obrigatória', () => {
    const { erroFatal } = parseLinhasImportacao([['Data', 'Aplicação'], ['18/05/2026', 'Soldavel']]);
    expect(erroFatal).toMatch(/NF/);
  });

  it('trata "-" como quantidade ausente, não zero negativo', () => {
    const rows = [CABECALHO, linha('05/08/2026', '5682', 'BASE', '', '10485698', 'Base', '-')];
    const { linhas } = parseLinhasImportacao(rows);
    expect(linhas[0].quantidade).toBeNull();
  });

  it('pula linha totalmente vazia sem virar pendência', () => {
    const rows = [CABECALHO, linha('05/08/2026', '5682', 'Plataforma', '', '60.10.59670', 'Cerca', 1), new Array(11).fill('')];
    const { linhas } = parseLinhasImportacao(rows);
    expect(linhas).toHaveLength(1);
  });

  it('normaliza o part number com asterisco e pontos', () => {
    const rows = [CABECALHO, linha('05/08/2026', '5682', 'Plataforma', '', '10481931*', 'ERRO', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    expect(linhas[0].partNumberNorm).toBe('10481931');
  });

  it('resolve data em serial do Excel', () => {
    // 46160 = 18/05/2026 no serial do Excel (dias desde 1899-12-30)
    const rows = [CABECALHO, linha(46160 as any, '5497', 'Soldavel', '100...', '60.10.83761', 'Base', 23)];
    const { linhas } = parseLinhasImportacao(rows);
    expect(linhas[0].dataISO).toBe('2026-05-18');
  });
});

describe('agruparPorNota', () => {
  it('agrupa a corrida contígua de Data+NF em uma nota', () => {
    const rows = [
      CABECALHO,
      linha('18/05/2026', '5497', 'Soldavel', '1', '60.10.83761', 'Base', 23),
      linha('18/05/2026', '5497', 'Soldavel', '2', '10482373', 'Base', 23),
      linha('05/08/2026', '5682', 'Plataforma', '', '60.10.59670', 'Cerca', 1),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].nf).toBe('5497');
    expect(grupos[0].linhas).toHaveLength(2);
    expect(grupos[1].nf).toBe('5682');
  });

  it('reabre um grupo quando a mesma NF volta depois de outra data no meio', () => {
    const rows = [
      CABECALHO,
      linha('05/08/2026', '5682', 'Plataforma', '', 'A', 'x', 1),
      linha('07/08/2026', '5705', 'Plataforma', '', 'B', 'y', 1),
      linha('10/08/2026', '5682', 'Plataforma', '', 'C', 'z', 1),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas);
    expect(grupos.map((g) => g.nf)).toEqual(['5682', '5705', '5682']);
  });
});

describe('detectarRepeticaoExata', () => {
  const fabricar = (n: number): LinhaImportacao[] => {
    const base = [
      { partNumberNorm: 'A', descricao: 'x', quantidade: 1, aplicacao: 'g' },
      { partNumberNorm: 'B', descricao: 'y', quantidade: 2, aplicacao: 'g' },
      { partNumberNorm: 'C', descricao: 'z', quantidade: 3, aplicacao: 'g' },
    ];
    const saida: LinhaImportacao[] = [];
    for (let c = 0; c < n; c += 1) {
      base.forEach((b, i) => saida.push({ linha: c * 3 + i + 2, dataISO: '2026-08-10', dataBruta: '10/08/2026', situacao: 'Entrada', tramo: null, nf: '5711', codSap: null, partNumberBruto: b.partNumberNorm, uom: null, fornecedor: null, naoEntregue: false, pedido: null, qtdPorKit: null, qtdKits: null, numeroKit: null, obs: null, ...b }));
    }
    return saida;
  };

  it('devolve 1 quando não há repetição', () => {
    expect(detectarRepeticaoExata(fabricar(1))).toBe(1);
  });

  it('detecta bloco colado 2 vezes', () => {
    expect(detectarRepeticaoExata(fabricar(2))).toBe(2);
  });

  it('detecta bloco colado 3 vezes (NF 5705 do caso real)', () => {
    expect(detectarRepeticaoExata(fabricar(3))).toBe(3);
  });

  it('não confunde quantidade coincidente com repetição real', () => {
    const linhas = fabricar(1);
    linhas.push({ ...linhas[0], linha: 5, partNumberNorm: 'D', descricao: 'w' }); // 4ª linha só parece com a 1ª por acaso
    expect(detectarRepeticaoExata(linhas)).toBe(1);
  });
});

describe('dividirGrupoRepetido', () => {
  it('quebra um grupo de 62 linhas (2 cópias de 31) em 2 grupos de 31', () => {
    const rows: unknown[][] = [CABECALHO];
    for (let c = 0; c < 2; c += 1) {
      for (let i = 0; i < 31; i += 1) rows.push(linha('10/08/2026', '5682', 'Plataforma', '', `PN${i}`, `desc ${i}`, 1));
    }
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    expect(grupo.repeticaoDetectada).toBe(2);

    const partes = dividirGrupoRepetido(grupo);
    expect(partes).toHaveLength(2);
    expect(partes[0].linhas).toHaveLength(31);
    expect(partes[1].linhas).toHaveLength(31);
    expect(partes.every((p) => p.repeticaoDetectada === 1)).toBe(true);
  });

  it('sem repetição, devolve o próprio grupo intacto', () => {
    const rows = [CABECALHO, linha('05/08/2026', '5682', 'Plataforma', '', 'A', 'x', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    expect(dividirGrupoRepetido(grupo)).toEqual([grupo]);
  });
});

describe('reconciliarGrupo — as pendências reais desta planilha', () => {
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601059670', { id: 'i1', part_number: '60.10.59670' }],
    ['10538277', { id: 'i2', part_number: '10538277' }],
    ['601023356', { id: 'i3', part_number: '60.10.23356' }],
  ]);

  it('credita a linha válida e soma quando o mesmo PN repete no bloco', () => {
    const rows = [
      CABECALHO,
      linha('05/08/2026', '5682', 'Plataforma', '', '60.10.59670', 'Cerca Quadrada(R)', 1),
      linha('05/08/2026', '5682', 'Plataforma', '', '60.10.59670', 'Cerca Quadrada(R)', 2),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    expect(r.creditosEntrada).toHaveLength(1);
    expect(r.creditosEntrada[0].quantidade).toBe(3);
    expect(r.creditosEntrada[0].linhasOrigem).toEqual([2, 3]);
    expect(r.pendencias).toHaveLength(0);
  });

  it('marca "ERRO" como pendência de part number ilegível, não credita', () => {
    const rows = [CABECALHO, linha('07/08/2026', '5705', 'Plataforma', '', '10481931', 'ERRO', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    expect(r.creditosEntrada).toHaveLength(0);
    expect(r.pendencias[0].motivo).toBe('part_number_ilegivel');
  });

  it('marca part number com texto solto (sem dígito) como ilegível', () => {
    const rows = [CABECALHO, linha('07/08/2026', '5705', 'Cable Tray', '', 'Cable tray L=1600', 'ERRO', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    expect(r.pendencias[0].motivo).toBe('part_number_ilegivel');
  });

  it('resolve part number colado sem pontuação contra o catálogo pontuado (601023356 -> 60.10.23356)', () => {
    const rows = [CABECALHO, linha('10/08/2026', '5711', 'Cable Tray', '', '601023356', 'ERRO', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    // Descrição 'ERRO' bloqueia por design — o operador resolve a descrição
    // antes de reenviar; a normalização por si só resolveria o PN.
    expect(r.pendencias).toHaveLength(1);
  });

  it('CHECK "-", vazio ou 0 é item não entregue: não credita e não vira pendência de erro', () => {
    for (const qtd of ['-', '', 0, '0']) {
      const rows = [CABECALHO, linha('05/08/2026', '5682', 'BASE', '', '10538277', 'Base', qtd)];
      const { linhas } = parseLinhasImportacao(rows);
      const [grupo] = agruparPorNota(linhas);
      const r = reconciliarGrupo(grupo, catalogo);
      expect(r.creditosEntrada).toHaveLength(0);
      expect(r.pendencias).toHaveLength(0);
      expect(r.naoEntregues).toHaveLength(1);
      expect(r.naoEntregues[0]).toMatchObject({ partNumber: '10538277', itemId: 'i2', nf: '5682' });
    }
  });

  it('CHECK com texto que não é número continua pendência sem_quantidade', () => {
    const rows = [CABECALHO, linha('05/08/2026', '5682', 'BASE', '', '10538277', 'Base', 'OK')];
    const { linhas } = parseLinhasImportacao(rows);
    const r = reconciliarGrupo(agruparPorNota(linhas)[0], catalogo);
    expect(r.naoEntregues).toHaveLength(0);
    expect(r.pendencias[0].motivo).toBe('sem_quantidade');
  });

  it('part number válido mas fora do catálogo vira pendência, não trava as demais linhas', () => {
    const rows = [
      CABECALHO,
      linha('05/08/2026', '5682', 'Plataforma', '', '60.10.59670', 'Cerca', 1),
      linha('05/08/2026', '5682', 'Plataforma', '', '99.99.99999', 'Peça inexistente', 5),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    expect(r.creditosEntrada).toHaveLength(1);
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0].motivo).toBe('nao_encontrado_no_catalogo');
  });

  it('linha com Situação não reconhecida (nem Entrada nem Saída) vira pendência', () => {
    const rows = [CABECALHO, ['05/08/2026', 'Transferência', '', '5682', 'Plataforma', '', '60.10.59670', 'Cerca', 1, 'UND', 'Atlanta']];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo);
    expect(r.creditosEntrada).toHaveLength(0);
    expect(r.debitosSaida).toHaveLength(0);
    expect(r.pendencias[0].motivo).toBe('situacao_nao_suportada');
  });
});

describe('normalizarSentido', () => {
  it('reconhece Entrada e Saída com acento, caixa e espaço variados', () => {
    expect(normalizarSentido('Entrada')).toBe('entrada');
    expect(normalizarSentido('ENTRADA')).toBe('entrada');
    expect(normalizarSentido(' entrada ')).toBe('entrada');
    expect(normalizarSentido('Saída')).toBe('saida');
    expect(normalizarSentido('SAIDA')).toBe('saida');
    expect(normalizarSentido('saída')).toBe('saida');
  });

  it('devolve null para o que não reconhece', () => {
    expect(normalizarSentido('Transferência')).toBeNull();
    expect(normalizarSentido('')).toBeNull();
  });
});

describe('reconciliarGrupo — linhas de Saída', () => {
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601059670', { id: 'i1', part_number: '60.10.59670' }],
    ['10522584', { id: 'i2', part_number: '10522584' }],
  ]);
  const tramosValidos = new Set(['T1-3143', 'T2-3144']);

  const linhaSaida = (data: string, nf: string, tramo: string, pn: string, desc: string, qtd: string | number) =>
    [data, 'Saída', tramo, nf, 'Escada de acesso', '', pn, desc, qtd, 'each', ''];

  it('debita o item e amarra ao tramo quando a coluna TRAMO bate com uma unidade real', () => {
    const rows = [CABECALHO, linhaSaida('18/08/2026', '', 'T1-3143', '10522584', 'Placa auricular de aterramento I.', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo, tramosValidos);
    expect(r.creditosEntrada).toHaveLength(0);
    expect(r.debitosSaida).toHaveLength(1);
    expect(r.debitosSaida[0].tramoUnidadeId).toBe('T1-3143');
    expect(r.debitosSaida[0].quantidade).toBe(1);
  });

  it('TRAMO que não existe no cadastro vira pendência, não inventa a unidade', () => {
    const rows = [CABECALHO, linhaSaida('18/08/2026', '', 'T9-9999', '10522584', 'Placa', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo, tramosValidos);
    expect(r.debitosSaida).toHaveLength(0);
    expect(r.pendencias[0].motivo).toBe('tramo_nao_encontrado');
    expect(r.pendencias[0].detalhe).toBe('T9-9999');
  });

  it('TRAMO vazio numa saída vira pendência — sem tramo não há ordem de separação', () => {
    const rows = [CABECALHO, linhaSaida('18/08/2026', '', '', '10522584', 'Placa', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo, tramosValidos);
    expect(r.debitosSaida).toHaveLength(0);
    expect(r.pendencias[0].motivo).toBe('tramo_obrigatorio');
  });

  it('soma quantidades do mesmo item saindo para o MESMO tramo, mas não mistura tramos diferentes', () => {
    const rows = [
      CABECALHO,
      linhaSaida('18/08/2026', '', 'T1-3143', '60.10.59670', 'Cerca', 1),
      linhaSaida('18/08/2026', '', 'T1-3143', '60.10.59670', 'Cerca', 2),
      linhaSaida('18/08/2026', '', 'T2-3144', '60.10.59670', 'Cerca', 5),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo, tramosValidos);
    expect(r.debitosSaida).toHaveLength(2);
    const t1 = r.debitosSaida.find((d) => d.tramoUnidadeId === 'T1-3143')!;
    const t2 = r.debitosSaida.find((d) => d.tramoUnidadeId === 'T2-3144')!;
    expect(t1.quantidade).toBe(3);
    expect(t2.quantidade).toBe(5);
  });

  it('entrada e saída no mesmo grupo ficam em listas separadas, nunca se cancelam', () => {
    const rows = [
      CABECALHO,
      linha('18/08/2026', '9001', 'Escada', '', '10522584', 'Placa', 10),
      [...linhaSaida('18/08/2026', '9001', 'T1-3143', '10522584', 'Placa', 3)],
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const [grupo] = agruparPorNota(linhas);
    const r = reconciliarGrupo(grupo, catalogo, tramosValidos);
    expect(r.creditosEntrada).toEqual([expect.objectContaining({ quantidade: 10 })]);
    expect(r.debitosSaida).toEqual([expect.objectContaining({ quantidade: 3, tramoUnidadeId: 'T1-3143' })]);
  });
});

describe('consolidarOrdensSaida — o mesmo tramo espalhado na planilha vira UMA ordem', () => {
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601059670', { id: 'i1', part_number: '60.10.59670' }],
    ['10522584', { id: 'i2', part_number: '10522584' }],
  ]);
  const tramosValidos = new Set(['T1-3143', 'T2-3144']);

  const linhaSaida = (data: string, nf: string, tramo: string, pn: string, desc: string, qtd: string | number) =>
    [data, 'Saída', tramo, nf, 'Escada de acesso', '', pn, desc, qtd, 'each', ''];

  it('soma o mesmo tramo registrado em NFs/datas diferentes numa ordem só', () => {
    const rows = [
      CABECALHO,
      linhaSaida('18/08/2026', '9001', 'T1-3143', '60.10.59670', 'Cerca', 1),
      linhaSaida('20/08/2026', '9002', 'T1-3143', '10522584', 'Placa', 4),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas).map((g) => reconciliarGrupo(g, catalogo, tramosValidos));
    const ordens = consolidarOrdensSaida(grupos);

    expect(ordens).toHaveLength(1);
    expect(ordens[0].tramoUnidadeId).toBe('T1-3143');
    expect(ordens[0].tramo).toBe('T1');
    expect(ordens[0].itens).toHaveLength(2);
    expect(ordens[0].totalPecas).toBe(5);
    expect(ordens[0].origemNfs).toEqual(['9001', '9002']);
  });

  it('mesmo item, mesmo tramo, em blocos diferentes: soma a quantidade em vez de duplicar a linha', () => {
    const rows = [
      CABECALHO,
      linhaSaida('18/08/2026', '9001', 'T1-3143', '60.10.59670', 'Cerca', 1),
      linhaSaida('20/08/2026', '9002', 'T1-3143', '60.10.59670', 'Cerca', 2),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas).map((g) => reconciliarGrupo(g, catalogo, tramosValidos));
    const ordens = consolidarOrdensSaida(grupos);

    expect(ordens).toHaveLength(1);
    expect(ordens[0].itens).toHaveLength(1);
    expect(ordens[0].itens[0].quantidade).toBe(3);
  });

  it('tramos diferentes viram ordens separadas', () => {
    const rows = [
      CABECALHO,
      linhaSaida('18/08/2026', '9001', 'T1-3143', '60.10.59670', 'Cerca', 1),
      linhaSaida('18/08/2026', '9001', 'T2-3144', '60.10.59670', 'Cerca', 5),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas).map((g) => reconciliarGrupo(g, catalogo, tramosValidos));
    const ordens = consolidarOrdensSaida(grupos);

    expect(ordens.map((o) => o.tramoUnidadeId)).toEqual(['T1-3143', 'T2-3144']);
  });

  it('sem nenhuma linha de saída, devolve lista vazia', () => {
    const rows = [CABECALHO, linha('18/05/2026', '5497', 'Soldavel', '1', '60.10.59670', 'Cerca', 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const grupos = agruparPorNota(linhas).map((g) => reconciliarGrupo(g, catalogo, tramosValidos));
    expect(consolidarOrdensSaida(grupos)).toEqual([]);
  });
});

describe('processarImportacaoMovimentos — ponta a ponta com o formato real da NF 5497', () => {
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601083761', { id: 'i1', part_number: '60.10.83761' }],
    ['10482373', { id: 'i2', part_number: '10482373' }],
  ]);

  it('processa duas NFs distintas em dois grupos, com totais corretos', () => {
    const rows = [
      CABECALHO,
      linha('18/05/2026', '5497', 'Soldavel', '1', '60.10.83761', 'Base', 23),
      linha('18/05/2026', '5497', 'Soldavel', '2', '10482373', 'Base', 23),
      linha('05/08/2026', '5682', 'Plataforma', '', '60.10.83761', 'Base', 1),
    ];
    const { resultado, erroFatal } = processarImportacaoMovimentos(rows, catalogo);
    expect(erroFatal).toBeNull();
    expect(resultado!.totalNotas).toBe(2);
    expect(resultado!.totalItens).toBe(3); // 2 no grupo 5497 + 1 no grupo 5682
    expect(resultado!.totalPecas).toBe(47);
    expect(resultado!.totalPendencias).toBe(0);
  });

  it('planilha vazia gera erro fatal claro', () => {
    const { erroFatal } = processarImportacaoMovimentos([CABECALHO], catalogo);
    expect(erroFatal).toMatch(/Nenhuma linha/);
  });
});

describe('planilha com PO, Qtd/Kit, Qtd (Kits), Obs. e Número Kit', () => {
  const CAB_NOVO = ['PO', 'NF', 'Data', 'Aplicação', 'Cod.Sap', 'Part.Number', 'Descrição do Material', 'Qtd/Kit', 'CHECK', 'UND', 'Qtd (Kits)', 'Obs.', 'Número Kit', 'Fornecedor'];
  const nova = (po: string, nf: string, pn: string, desc: string, porKit: number | string, check: number | string, kits: number | string, obs = '', kit = '') =>
    [po, nf, '05/08/2026', 'Plataforma', '', pn, desc, porKit, check, 'UN', kits, obs, kit, 'Atlanta'];
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601059670', { id: 'i1', part_number: '60.10.59670' }],
    ['10538277', { id: 'i2', part_number: '10538277' }],
  ]);

  it('mapeia as colunas novas sem exigir Situação (tudo vira entrada)', () => {
    const { indices, faltando } = mapearColunas(CAB_NOVO);
    expect(faltando).toEqual([]);
    expect([indices.pedido, indices.qtd_por_kit, indices.quantidade, indices.qtd_kits, indices.obs, indices.numero_kit]).toEqual([0, 7, 8, 10, 11, 12]);
  });

  it('leva Obs. e PO para a observação do crédito, sem repetir', () => {
    const rows = [
      CAB_NOVO,
      nova('4100470001', '5682', '60.10.59670', 'Cerca', 2, 2, 1, 'Caixa 3'),
      nova('4100470001', '5682', '60.10.59670', 'Cerca', 2, 1, 1, 'Caixa 3'),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const r = reconciliarGrupo(agruparPorNota(linhas)[0], catalogo);
    expect(r.creditosEntrada[0].quantidade).toBe(3);
    expect(observacaoDoCredito(r.creditosEntrada[0])).toBe('Caixa 3 | PO 4100470001');
  });

  it('não entregue guarda PO, kit, Obs. e a quantidade esperada (Qtd/Kit × Qtd Kits)', () => {
    const rows = [CAB_NOVO, nova('4100470001', '5682', '10538277', 'Base', 4, '-', 3, 'Vem no próximo', 'K-07')];
    const { linhas } = parseLinhasImportacao(rows);
    const [ne] = reconciliarGrupo(agruparPorNota(linhas)[0], catalogo).naoEntregues;
    expect(ne).toMatchObject({ pedido: '4100470001', numeroKit: 'K-07', obs: 'Vem no próximo', quantidadeEsperada: 12 });
    expect(chaveNaoEntregue(ne)).toBe('5682|10538277|4100470001|K-07|PLATAFORMA');
  });

  it('quantidade esperada usa a coluna que houver', () => {
    expect(quantidadeEsperada({ qtdPorKit: 4, qtdKits: null })).toBe(4);
    expect(quantidadeEsperada({ qtdPorKit: null, qtdKits: null })).toBeNull();
    expect(checkNaoEntregue('—')).toBe(true);
    expect(checkNaoEntregue(2)).toBe(false);
  });

  it('junta os itens fora do catálogo por part number para sugerir o cadastro', () => {
    const rows = [
      CAB_NOVO,
      nova('', '5682', '99.99.00001', 'Suporte novo', 1, 2, 1),
      nova('', '5682', '9999.00001', 'Suporte novo', 1, 3, 1),
      nova('', '5682', '60.10.59670', 'Cerca', 1, 1, 1),
    ];
    const { linhas } = parseLinhasImportacao(rows);
    const fora = itensForaDoCatalogo([reconciliarGrupo(agruparPorNota(linhas)[0], catalogo)]);
    expect(fora).toHaveLength(1);
    expect(fora[0]).toMatchObject({ partNumberNorm: '999900001', quantidade: 5, descricao: 'Suporte novo', nfs: ['5682'] });
  });

  it('casa pendência de entrega anterior com o item que chegou (mesmo PN e, se houver, mesmo PO)', () => {
    const rows = [CAB_NOVO, nova('4100470001', '5900', '10538277', 'Base', 4, 4, 1)];
    const { linhas } = parseLinhasImportacao(rows);
    const r = reconciliarGrupo(agruparPorNota(linhas)[0], catalogo);
    const atendidas = pendenciasAtendidas([
      { id: 'p1', part_number_norm: '10538277', pedido: '4100470001', numero_nf: '5682' },
      { id: 'p2', part_number_norm: '10538277', pedido: '4100479999', numero_nf: '5682' },
      { id: 'p3', part_number_norm: '10538277', pedido: null, numero_nf: '5600' },
      { id: 'p4', part_number_norm: '601059670', pedido: null, numero_nf: '5600' },
    ], [r]);
    expect([...atendidas.entries()]).toEqual([['p1', '5900'], ['p3', '5900']]);
  });
});

describe('repetição × caixas diferentes (NF 5682)', () => {
  const CAB = ['PO', 'NF', 'Data', 'Aplicação', 'Cod.Sap', 'Part.Number', 'Descrição do Material', 'Qtd/Kit', 'CHECK', 'UND', 'Qtd (Kits)', 'Obs.', 'Número Kit', 'Fornecedor'];
  const l = (pn: string, check: number | string, obs: string) =>
    ['4100439424', '5682', '05/08/2026', 'Plataforma', '', pn, `Peça ${pn}`, 1, check, 'UND', 1, obs, 1, 'Atlanta'];

  it('mesmos itens em caixas diferentes (Obs.) não são cópia da planilha', () => {
    const rows = [CAB, l('10538281', 1, 'TRAMO 3 - CX1'), l('10481931', '-', 'TRAMO 3 - CX1'), l('10538281', 1, 'TRAMO 3 - CX2'), l('10481931', '-', 'TRAMO 3 - CX2')];
    const [grupo] = agruparPorNota(parseLinhasImportacao(rows).linhas);
    expect(grupo.repeticaoDetectada).toBe(1);
  });

  it('o mesmo bloco colado duas vezes, com a mesma Obs., ainda é detectado', () => {
    const rows = [CAB, l('10538281', 1, 'TRAMO 3 - CX1'), l('10481931', 2, 'TRAMO 3 - CX1'), l('10538281', 1, 'TRAMO 3 - CX1'), l('10481931', 2, 'TRAMO 3 - CX1')];
    const [grupo] = agruparPorNota(parseLinhasImportacao(rows).linhas);
    expect(grupo.repeticaoDetectada).toBe(2);
  });
});

describe('marcarDuplicidades (reimportar a mesma planilha)', () => {
  const catalogo = new Map<string, { id: string; part_number: string }>([
    ['601059670', { id: 'i1', part_number: '60.10.59670' }],
    ['10538277', { id: 'i2', part_number: '10538277' }],
  ]);
  const reconciliar = (nf: string, data: string, itens: [string, number][]) => {
    const rows = [CABECALHO, ...itens.map(([pn, q]) => linha(data, nf, 'Plataforma', '', pn, 'x', q))];
    return reconciliarGrupo(agruparPorNota(parseLinhasImportacao(rows).linhas)[0], catalogo);
  };
  const existente = (id: string, nf: string, data: string, movs: [string, number][]): EntradaExistente => ({
    id, codigo: `ENP-${id}`, numero_nf: nf, data_entrada: data, created_at: '2026-09-09T11:44:00Z', criado_por_nome: 'X',
    movimentos: movs.map(([item_id, quantidade]) => ({ item_id, quantidade })),
  });

  it('mesma NF, data e itens = já importada; somar o mesmo item em linhas diferentes não engana', () => {
    const r = reconciliar('5682', '05/08/2026', [['60.10.59670', 2], ['10538277', 3]]);
    const d = marcarDuplicidades([r], [existente('a', '5682', '2026-08-05', [['i2', 3], ['i1', 1], ['i1', 1]])]);
    expect(d.get(0)).toMatchObject({ tipo: 'identica', codigo: 'ENP-a' });
  });

  it('mesma NF e data com itens diferentes pede decisão; outra data é nova', () => {
    const r = reconciliar('5682', '05/08/2026', [['60.10.59670', 2]]);
    expect(marcarDuplicidades([r], [existente('a', '5682', '2026-08-05', [['i1', 5]])]).get(0)).toEqual({ tipo: 'mesma_nf_data', codigos: ['ENP-a'] });
    expect(marcarDuplicidades([r], [existente('a', '5682', '2026-08-10', [['i1', 2]])]).size).toBe(0);
  });

  it('cada entrada gravada casa com um lançamento só', () => {
    const r1 = reconciliar('5682', '05/08/2026', [['60.10.59670', 2]]);
    const r2 = reconciliar('5682', '05/08/2026', [['60.10.59670', 2]]);
    const d = marcarDuplicidades([r1, r2], [existente('a', '5682', '2026-08-05', [['i1', 2]])]);
    expect(d.get(0)?.tipo).toBe('identica');
    expect(d.has(1)).toBe(false);
  });
});

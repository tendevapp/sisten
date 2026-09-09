/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  montarArvore,
  folhasDe,
  consumoPorTramo,
  consumoPorTramoFiltrado,
  folhasDoTramoFiltradas,
  comAncestrais,
  explodirRecebimento,
  subconjuntosDoTramo,
  auditarBom,
  ExplosaoIndisponivelError,
  type BomLinha,
} from './projetosBom';

/**
 * Recorte real da BOM (`proj_bom_gwjaco`, ids 478–484): "Ladder horizontal
 * support" com quantidade 6 e seis filhos. É o caso que prova que `quantity`
 * já vem multiplicada pelo pai — 12 = 2x6, 36 = 6x6.
 */
const RECORTE_478: BomLinha[] = [
  { id: 476, level: 4, section: 'S1', group: 'ELETRICO', part_number: '60.09.02099', description: 'Cable lug', quantity: 1 },
  { id: 478, level: 3, section: 'S1', group: 'ESCADA', part_number: '60.10.69307', description: 'Ladder horizontal support', quantity: 6, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 479, level: 4, section: 'S1', group: 'ESCADA', part_number: '60.10.51388', description: 'Connection lug', quantity: 12, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 480, level: 4, section: 'S1', group: 'ESCADA', part_number: '60.10.69308', description: 'Ladder support', quantity: 12, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 481, level: 4, section: 'S1', group: 'ESCADA', part_number: '60.10.16252', description: 'Ladder fixation studs', quantity: 6, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 482, level: 4, section: 'S1', group: 'ESCADA', part_number: '402.000.192', description: 'Washer ISO 7089-16-200HV', quantity: 36, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 483, level: 4, section: 'S1', group: 'ESCADA', part_number: '403.000.075', description: 'Nut ISO 7040-M16-8', quantity: 24, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 484, level: 4, section: 'S1', group: 'ESCADA', part_number: '401.000.182', description: 'Bolt ISO 4017-M16X60-8.8', quantity: 12, kit_atlanta: '60.10.69307 - Ladder horizontal support' },
  { id: 485, level: 3, section: 'S1', group: 'ELETRICO', part_number: '60.10.92492', description: 'Cable tray L=3800', quantity: 1 },
];

describe('montarArvore', () => {
  it('resolve o pai pela indentação, não pela linha anterior', () => {
    const arvore = montarArvore(RECORTE_478);

    // 479..484 são nível 4 logo abaixo do nível 3 da linha 478.
    for (const id of [479, 480, 481, 482, 483, 484]) {
      expect(arvore.porId.get(id)!.parentId).toBe(478);
    }
    // 485 volta ao nível 3: irmã de 478, não filha.
    expect(arvore.porId.get(485)!.parentId).not.toBe(478);
  });

  it('marca folha quem não tem nada abaixo na indentação', () => {
    const arvore = montarArvore(RECORTE_478);
    expect(arvore.porId.get(478)!.folha).toBe(false);
    expect(arvore.porId.get(484)!.folha).toBe(true);
    expect(arvore.porId.get(485)!.folha).toBe(true);
    expect(arvore.nos.filter((n) => n.folha)).toHaveLength(8);
  });

  it('não adota como pai um nó de outro ramo já encerrado', () => {
    // Um nível 4 depois de um nível 3 novo pertence ao 3 novo.
    const linhas: BomLinha[] = [
      { id: 1, level: 1, part_number: 'RAIZ', quantity: 1 },
      { id: 2, level: 2, part_number: 'A', quantity: 1 },
      { id: 3, level: 3, part_number: 'A1', quantity: 1 },
      { id: 4, level: 2, part_number: 'B', quantity: 1 },
      { id: 5, level: 3, part_number: 'B1', quantity: 1 },
    ];
    const arvore = montarArvore(linhas);
    expect(arvore.porId.get(5)!.parentId).toBe(4);
    expect(arvore.porId.get(3)!.parentId).toBe(2);
  });

  it('monta o caminho da raiz até a folha', () => {
    const arvore = montarArvore(RECORTE_478);
    expect(arvore.porId.get(479)!.caminho).toEqual(['60.10.69307', '60.10.51388']);
  });

  it('aceita as linhas fora de ordem — a ordem do id é a indentação', () => {
    const embaralhado = [...RECORTE_478].reverse();
    const arvore = montarArvore(embaralhado);
    expect(arvore.porId.get(479)!.parentId).toBe(478);
  });
});

describe('folhasDe', () => {
  it('devolve as seis folhas do conjunto 478', () => {
    const arvore = montarArvore(RECORTE_478);
    expect(folhasDe(arvore, 478).map((f) => f.id)).toEqual([479, 480, 481, 482, 483, 484]);
  });

  it('devolve o próprio nó quando ele já é folha', () => {
    const arvore = montarArvore(RECORTE_478);
    expect(folhasDe(arvore, 485).map((f) => f.id)).toEqual([485]);
  });
});

describe('consumoPorTramo', () => {
  it('soma só as folhas — o pai já está contado dentro dos filhos', () => {
    const consumo = consumoPorTramo(montarArvore(RECORTE_478));
    const t1 = consumo.get('T1')!;

    // 6 do conjunto 478 NÃO entram: ele é pai.
    expect(t1.has('601069307')).toBe(false);
    expect(t1.get('402000192')!.qtdPorTorre).toBe(36);
    expect(Array.from(t1.values()).reduce((s, i) => s + i.qtdPorTorre, 0)).toBe(
      12 + 12 + 6 + 36 + 24 + 12 + 1 + 1,
    );
  });

  it('soma o mesmo part number que aparece em várias linhas do tramo', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S2', part_number: 'PAI', quantity: 1 },
      { id: 2, level: 2, section: 'S2', part_number: '403.000.075', quantity: 10 },
      { id: 3, level: 2, section: 'S2', part_number: '4.0300.0075', quantity: 4 },
    ];
    const t2 = consumoPorTramo(montarArvore(linhas)).get('T2')!;
    // Grafias diferentes, mesmo item normalizado: 14 por torre.
    expect(t2.size).toBe(1);
    expect(t2.get('403000075')!.qtdPorTorre).toBe(14);
    expect(t2.get('403000075')!.linhasBom).toBe(2);
  });

  it('registra os níveis distintos que compõem a quantidade de cada item', () => {
    const t1 = consumoPorTramo(montarArvore(RECORTE_478)).get('T1')!;
    // 479..484 são todas nível 4 no recorte — um único nível.
    expect(t1.get('601051388')!.niveis).toEqual([4]);
  });

  it('acumula vários níveis quando o mesmo item aparece em profundidades diferentes', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', group: 'A', part_number: 'PAI1', quantity: 1 },
      { id: 2, level: 2, section: 'S1', group: 'A', part_number: 'PARAFUSO', quantity: 5 },
      { id: 3, level: 1, section: 'S1', group: 'B', part_number: 'PAI2', quantity: 1 },
      { id: 4, level: 2, section: 'S1', group: 'B', part_number: 'X', quantity: 1 },
      { id: 5, level: 3, section: 'S1', group: 'B', part_number: 'PARAFUSO', quantity: 3 },
    ];
    const t1 = consumoPorTramo(montarArvore(linhas)).get('T1')!;
    expect(t1.get('PARAFUSO')!.qtdPorTorre).toBe(8);
    expect(t1.get('PARAFUSO')!.niveis).toEqual([2, 3]);
  });
});

describe('consumoPorTramoFiltrado — a base do romaneio por zona', () => {
  const linhas: BomLinha[] = [
    { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'PAI-ESC', quantity: 1 },
    { id: 2, level: 2, section: 'S1', group: 'ESCADA', part_number: 'DEGRAU', quantity: 10 },
    { id: 3, level: 2, section: 'S1', group: 'ESCADA', part_number: 'PARAFUSO', quantity: 4 },
    { id: 4, level: 1, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PAI-SUP', quantity: 1 },
    { id: 5, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'CHAPA', quantity: 2 },
    { id: 6, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PARAFUSO', quantity: 6 },
    { id: 7, level: 1, section: 'S1', group: 'ELETRICO', part_number: 'PAI-ELE', quantity: 1 },
    { id: 8, level: 2, section: 'S1', group: 'ELETRICO', part_number: 'CABO', quantity: 1 },
  ];

  it('incluirGrupos: soma só as linhas do(s) grupo(s) pedido(s) — a mesma peça em outro grupo não entra', () => {
    const t1 = consumoPorTramoFiltrado(montarArvore(linhas), { incluirGrupos: ['ESCADA'] }).get('T1')!;
    expect(Array.from(t1.keys()).sort()).toEqual(['DEGRAU', 'PARAFUSO']);
    // PARAFUSO tem 4 na escada e 6 na plataforma — só os 4 da escada entram aqui.
    expect(t1.get('PARAFUSO')!.qtdPorTorre).toBe(4);
  });

  it('o mesmo item em dois grupos incluídos soma as duas fatias, não conta 2x por acaso', () => {
    const t1 = consumoPorTramoFiltrado(montarArvore(linhas), { incluirGrupos: ['ESCADA', 'PLATAFORMA SUPERIOR'] }).get('T1')!;
    expect(t1.get('PARAFUSO')!.qtdPorTorre).toBe(10); // 4 + 6
  });

  it('excluirGrupos: cobre o residual — tudo que não está nos grupos nomeados', () => {
    const t1 = consumoPorTramoFiltrado(montarArvore(linhas), { excluirGrupos: ['ESCADA', 'PLATAFORMA SUPERIOR'] }).get('T1')!;
    expect(Array.from(t1.keys()).sort()).toEqual(['CABO']);
  });

  it('sem opções, é idêntico a consumoPorTramo (romaneio inteiro)', () => {
    const arvore = montarArvore(linhas);
    const semFiltro = consumoPorTramoFiltrado(arvore);
    const original = consumoPorTramo(arvore);
    expect(semFiltro.get('T1')!.size).toBe(original.get('T1')!.size);
    expect(semFiltro.get('T1')!.get('PARAFUSO')!.qtdPorTorre).toBe(original.get('T1')!.get('PARAFUSO')!.qtdPorTorre);
  });

  it('incluirGrupos + excluirGrupos juntos combinam por E — uso normal é só um dos dois', () => {
    const t1 = consumoPorTramoFiltrado(montarArvore(linhas), {
      incluirGrupos: ['ESCADA', 'PLATAFORMA SUPERIOR'],
      excluirGrupos: ['ESCADA'],
    }).get('T1')!;
    expect(Array.from(t1.keys()).sort()).toEqual(['CHAPA', 'PARAFUSO']);
    expect(t1.get('PARAFUSO')!.qtdPorTorre).toBe(6); // só a fatia da plataforma — a da escada foi excluída
  });
});

describe('explodirRecebimento', () => {
  it('6 unidades de um pai que consome 6 por torre = 1 torre', () => {
    const arvore = montarArvore(RECORTE_478);
    const r = explodirRecebimento(arvore, 478, 6);

    expect(r.torresEquivalentes).toBe(1);
    expect(r.linhas.map((l) => l.qtdCreditada)).toEqual([12, 12, 6, 36, 24, 12]);
  });

  it('escala com a quantidade recebida', () => {
    const arvore = montarArvore(RECORTE_478);
    const r = explodirRecebimento(arvore, 478, 138); // 23 torres

    expect(r.torresEquivalentes).toBe(23);
    expect(r.linhas.find((l) => l.partNumber === '402.000.192')!.qtdCreditada).toBe(36 * 23);
  });

  it('aceita recebimento parcial sem virar dízima', () => {
    const arvore = montarArvore(RECORTE_478);
    const r = explodirRecebimento(arvore, 478, 4); // 2/3 de torre
    const lug = r.linhas.find((l) => l.partNumber === '60.10.51388')!;
    expect(lug.qtdCreditada).toBe(8);
  });

  it('recusa explodir pai sem quantidade em vez de creditar zero', () => {
    const linhas: BomLinha[] = [
      { id: 21, level: 3, section: 'S1', part_number: '60.10.102437', description: 'Baffle plate', quantity: null },
      { id: 22, level: 4, section: 'S1', part_number: '60.10.102438', quantity: 1 },
    ];
    const arvore = montarArvore(linhas);
    expect(() => explodirRecebimento(arvore, 21, 5)).toThrow(ExplosaoIndisponivelError);
  });

  it('recusa linha inexistente', () => {
    const arvore = montarArvore(RECORTE_478);
    expect(() => explodirRecebimento(arvore, 99999, 1)).toThrow(ExplosaoIndisponivelError);
  });
});

describe('subconjuntosDoTramo', () => {
  it('agrupa o romaneio pelo kit da Atlanta e separa os avulsos', () => {
    const consumo = consumoPorTramo(montarArvore(RECORTE_478));
    const grupos = subconjuntosDoTramo(consumo, 'T1');

    const kit = grupos.find((g) => g.nome.startsWith('60.10.69307'))!;
    expect(kit.itens).toHaveLength(6);
    expect(kit.totalPecas).toBe(102);

    const avulsos = grupos.find((g) => g.nome === 'Avulsos do tramo')!;
    expect(avulsos.itens).toHaveLength(2);
    // Avulsos vão para o fim da lista.
    expect(grupos[grupos.length - 1].nome).toBe('Avulsos do tramo');
  });

  it('não repete a peça compartilhada entre dois subconjuntos', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', part_number: 'PAI', quantity: 1 },
      { id: 2, level: 2, section: 'S1', part_number: 'X', quantity: 2, kit_atlanta: 'KIT A' },
      { id: 3, level: 2, section: 'S1', part_number: 'X', quantity: 3, kit_atlanta: 'KIT B' },
    ];
    const grupos = subconjuntosDoTramo(consumoPorTramo(montarArvore(linhas)), 'T1');
    const total = grupos.reduce((s, g) => s + g.itens.length, 0);
    expect(total).toBe(1);
  });
});

describe('auditarBom', () => {
  it('acha folha sem quantidade, sem seção e sem SAP', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', part_number: 'PAI', quantity: 1, cod_sap: '100' },
      { id: 2, level: 2, section: 'S1', part_number: 'A', quantity: null, cod_sap: '101' },
      { id: 3, level: 2, section: null, part_number: 'B', quantity: 1, cod_sap: '102' },
      { id: 4, level: 2, section: 'S1', part_number: 'C', quantity: 1, cod_sap: null },
    ];
    const tipos = auditarBom(montarArvore(linhas)).map((p) => p.tipo);
    expect(tipos).toContain('sem_quantidade');
    expect(tipos).toContain('sem_secao');
    expect(tipos).toContain('sem_cod_sap');
  });

  it('reporta as grafias divergentes do mesmo part number', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', part_number: '403.000.458', quantity: 1, cod_sap: '1' },
      { id: 2, level: 1, section: 'S1', part_number: '4.0300.0458', quantity: 1, cod_sap: '1' },
    ];
    const colisao = auditarBom(montarArvore(linhas)).find((p) => p.tipo === 'colisao_part_number');
    expect(colisao).toBeDefined();
    expect(colisao!.detalhe).toContain('403.000.458');
  });

  it('reporta grupo escrito com caixas diferentes', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'A', quantity: 1, cod_sap: '1' },
      { id: 2, level: 1, section: 'S1', group: 'Escada', part_number: 'B', quantity: 1, cod_sap: '2' },
    ];
    expect(auditarBom(montarArvore(linhas)).map((p) => p.tipo)).toContain('grupo_divergente');
  });

  it('não inventa pendência em BOM limpa', () => {
    const linhas: BomLinha[] = [
      { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'A', quantity: 1, cod_sap: '1' },
      { id: 2, level: 2, section: 'S1', group: 'ESCADA', part_number: 'B', quantity: 2, cod_sap: '2' },
    ];
    expect(auditarBom(montarArvore(linhas))).toHaveLength(0);
  });
});

describe('folhasDoTramoFiltradas + comAncestrais — a árvore do relatório de romaneio', () => {
  const linhas: BomLinha[] = [
    { id: 1, level: 1, section: 'S1', group: 'ESCADA', part_number: 'PAI-ESC', quantity: 1 },
    { id: 2, level: 2, section: 'S1', group: 'ESCADA', part_number: 'SUB-ESC', quantity: 1 },
    { id: 3, level: 3, section: 'S1', group: 'ESCADA', part_number: 'DEGRAU', quantity: 10 },
    { id: 4, level: 1, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PAI-SUP', quantity: 1 },
    { id: 5, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'CHAPA', quantity: 2 },
    { id: 6, level: 2, section: 'S1', group: 'PLATAFORMA SUPERIOR', part_number: 'PARAFUSO', quantity: 6 },
  ];
  const arvore = montarArvore(linhas);

  it('folhasDoTramoFiltradas devolve só as folhas do grupo pedido', () => {
    const folhas = folhasDoTramoFiltradas(arvore, 'T1', { incluirGrupos: ['ESCADA'] });
    expect(folhas.map((f) => f.partNumber)).toEqual(['DEGRAU']);
  });

  it('comAncestrais inclui o pai e o avô de cada folha, sem duplicar', () => {
    const folhas = folhasDoTramoFiltradas(arvore, 'T1', { incluirGrupos: ['ESCADA'] });
    const comPais = comAncestrais(arvore, folhas);
    expect(comPais.map((n) => n.partNumber)).toEqual(['PAI-ESC', 'SUB-ESC', 'DEGRAU']);
  });

  it('duas folhas do mesmo ramo não duplicam o pai comum', () => {
    const folhas = folhasDoTramoFiltradas(arvore, 'T1', { incluirGrupos: ['PLATAFORMA SUPERIOR'] });
    const comPais = comAncestrais(arvore, folhas);
    expect(comPais.map((n) => n.partNumber)).toEqual(['PAI-SUP', 'CHAPA', 'PARAFUSO']);
    expect(comPais.filter((n) => n.partNumber === 'PAI-SUP')).toHaveLength(1);
  });

  it('mantém a ordem do id (a ordem de indentação da BOM)', () => {
    const folhas = folhasDoTramoFiltradas(arvore, 'T1', {});
    const comPais = comAncestrais(arvore, folhas);
    const ids = comPais.map((n) => n.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

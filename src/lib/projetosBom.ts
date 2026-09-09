/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — leitura da BOM indentada.
 *
 * `proj_bom_gwjaco` não tem `parent_id`: o pai de uma linha é a linha anterior
 * mais próxima com `level - 1`, na ordem do `id`. O banco já resolve isso em
 * `vw_proj_bom_arvore`; este arquivo é o espelho no cliente, para a tela montar
 * a árvore, o romaneio e a auditoria sem uma ida ao servidor por nó.
 *
 * REGRA CONFIRMADA NOS DADOS: `quantity` já é a quantidade POR TORRE, não por
 * unidade do pai. Na linha 478 ("Ladder horizontal support", qty 6) os filhos
 * vêm 12, 12, 6, 36, 24 e 12 — 2x6, 2x6, 1x6, 6x6, 4x6 e 2x6, já multiplicados.
 * Logo o consumo de uma torre é a SOMA das folhas; somar os pais junto contaria
 * a mesma peça duas vezes.
 */

import { normalizarGrupo, normalizarPartNumber, Tramo, tramoDaSecao } from './projetos';

export interface BomLinha {
  id: number;
  level: number | null;
  secao?: string | null;
  section?: string | null;
  /** `grupo` na view, `group` na tabela crua. */
  grupo?: string | null;
  group?: string | null;
  part_number?: string | null;
  cod_sap?: string | null;
  description?: string | null;
  descricao?: string | null;
  /** `quantity` na tabela crua, `qtd_por_torre` na view. */
  qtd_por_torre?: number | null;
  quantity?: number | null;
  uom?: string | null;
  fornecedor?: string | null;
  source?: string | null;
  delivery_at?: string | null;
  subconjunto?: string | null;
  kit_atlanta?: string | null;
  each_weight_kg?: number | null;
}

export interface NoBom {
  id: number;
  level: number;
  parentId: number | null;
  filhos: number[];
  folha: boolean;
  profundidade: number;
  caminho: string[];
  secao: string | null;
  tramo: Tramo | null;
  grupo: string;
  grupoNorm: string;
  partNumber: string;
  partNumberNorm: string;
  codSap: string | null;
  descricao: string;
  description: string;
  qtdPorTorre: number | null;
  uom: string;
  fornecedor: string;
  entregaEm: string;
  subconjunto: string | null;
  pesoUnitarioKg: number | null;
}

export interface ArvoreBom {
  nos: NoBom[];
  porId: Map<number, NoBom>;
  raizes: number[];
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const texto = (v: unknown): string => String(v ?? '').trim();

/**
 * Resolve a hierarquia percorrendo as linhas na ordem do `id` e mantendo o
 * último id visto em cada nível. É o mesmo algoritmo da view; a alternativa
 * (procurar o pai de trás para frente a cada linha) seria O(n²) e é
 * exatamente o "PROCV por deslocamento de linha" que quebrou a planilha.
 *
 * As linhas precisam vir ordenadas por `id` — a ordem É a indentação.
 */
export function montarArvore(linhas: BomLinha[]): ArvoreBom {
  const ordenadas = [...linhas].sort((a, b) => a.id - b.id);
  const ultimoPorNivel = new Map<number, number>();
  const nos: NoBom[] = [];
  const porId = new Map<number, NoBom>();
  const raizes: number[] = [];

  ordenadas.forEach((linha, i) => {
    const level = linha.level ?? 1;
    const parentId = level > 1 ? ultimoPorNivel.get(level - 1) ?? null : null;
    const proximo = ordenadas[i + 1];
    // Folha = nada abaixo dela na indentação.
    const folha = !proximo || (proximo.level ?? 1) <= level;
    const secao = texto(linha.secao ?? linha.section) || null;

    const no: NoBom = {
      id: linha.id,
      level,
      parentId,
      filhos: [],
      folha,
      profundidade: level,
      caminho: [],
      secao,
      tramo: tramoDaSecao(secao),
      grupo: texto(linha.grupo ?? linha.group),
      grupoNorm: normalizarGrupo(linha.grupo ?? linha.group),
      partNumber: texto(linha.part_number),
      partNumberNorm: normalizarPartNumber(linha.part_number),
      codSap: texto(linha.cod_sap) || null,
      descricao: texto(linha.descricao) || texto(linha.description),
      description: texto(linha.description),
      qtdPorTorre: num(linha.qtd_por_torre ?? linha.quantity),
      uom: texto(linha.uom) || 'each',
      fornecedor: texto(linha.fornecedor ?? linha.source),
      entregaEm: texto(linha.delivery_at),
      subconjunto: texto(linha.subconjunto ?? linha.kit_atlanta) || null,
      pesoUnitarioKg: num(linha.each_weight_kg),
    };

    nos.push(no);
    porId.set(no.id, no);
    ultimoPorNivel.set(level, no.id);
    // Um filho novo invalida os níveis mais fundos: o próximo nível 4 não pode
    // adotar como pai um nível 3 que já ficou para trás noutro ramo.
    for (const nivel of Array.from(ultimoPorNivel.keys())) {
      if (nivel > level) ultimoPorNivel.delete(nivel);
    }

    if (parentId === null) raizes.push(no.id);
    else porId.get(parentId)?.filhos.push(no.id);
  });

  // Caminho e profundidade reais, descendo a partir das raízes.
  const descer = (id: number, caminho: string[]) => {
    const no = porId.get(id);
    if (!no) return;
    no.caminho = [...caminho, no.partNumber || String(no.id)];
    no.profundidade = no.caminho.length;
    no.filhos.forEach((f) => descer(f, no.caminho));
  };
  raizes.forEach((r) => descer(r, []));

  return { nos, porId, raizes };
}

/** Folhas descendentes de um nó (o próprio nó, se ele já for folha). */
export function folhasDe(arvore: ArvoreBom, id: number): NoBom[] {
  const raiz = arvore.porId.get(id);
  if (!raiz) return [];
  const saida: NoBom[] = [];
  const pilha = [raiz];
  while (pilha.length) {
    const no = pilha.pop()!;
    if (no.folha) saida.push(no);
    else no.filhos.forEach((f) => { const n = arvore.porId.get(f); if (n) pilha.push(n); });
  }
  return saida.sort((a, b) => a.id - b.id);
}

export interface ConsumoItem {
  partNumberNorm: string;
  partNumber: string;
  codSap: string | null;
  descricao: string;
  qtdPorTorre: number;
  subconjuntos: string[];
  linhasBom: number;
}

/**
 * Consumo de UMA torre, por tramo. Só folhas — os pais são cabeçalhos de
 * conjunto e já estão contabilizados dentro dos filhos.
 *
 * Um mesmo part number entra num tramo por mais de uma linha (e por mais de um
 * subconjunto Atlanta): as linhas são somadas e os subconjuntos acumulados,
 * porque o romaneio precisa dizer em que montagem cada peça é usada.
 */
export function consumoPorTramo(arvore: ArvoreBom): Map<Tramo, Map<string, ConsumoItem>> {
  const saida = new Map<Tramo, Map<string, ConsumoItem>>();

  for (const no of arvore.nos) {
    if (!no.folha || !no.tramo || !no.partNumberNorm || no.qtdPorTorre === null) continue;

    let doTramo = saida.get(no.tramo);
    if (!doTramo) { doTramo = new Map(); saida.set(no.tramo, doTramo); }

    const atual = doTramo.get(no.partNumberNorm);
    if (atual) {
      atual.qtdPorTorre += no.qtdPorTorre;
      atual.linhasBom += 1;
      if (no.subconjunto && !atual.subconjuntos.includes(no.subconjunto)) {
        atual.subconjuntos.push(no.subconjunto);
      }
    } else {
      doTramo.set(no.partNumberNorm, {
        partNumberNorm: no.partNumberNorm,
        partNumber: no.partNumber,
        codSap: no.codSap,
        descricao: no.descricao,
        qtdPorTorre: no.qtdPorTorre,
        subconjuntos: no.subconjunto ? [no.subconjunto] : [],
        linhasBom: 1,
      });
    }
  }

  return saida;
}

export interface LinhaExplosao {
  bomLinhaId: number;
  partNumber: string;
  partNumberNorm: string;
  codSap: string | null;
  descricao: string;
  secao: string | null;
  tramo: Tramo | null;
  subconjunto: string | null;
  qtdPorTorre: number;
  qtdCreditada: number;
}

export interface ResultadoExplosao {
  torresEquivalentes: number;
  qtdPorTorreDoPai: number;
  linhas: LinhaExplosao[];
}

export class ExplosaoIndisponivelError extends Error {}

/**
 * A NF chega pelo item pai; o almoxarifado credita as folhas.
 *
 * Como `qtdPorTorre` é absoluta, receber N unidades do pai equivale a
 * `N / qtdPorTorre(pai)` torres, e cada folha recebe a sua quantidade por
 * torre vezes isso. Receber 6 "Ladder horizontal support" (6 por torre) é
 * uma torre: credita 12 "Connection lug", não 72.
 */
export function explodirRecebimento(
  arvore: ArvoreBom,
  bomLinhaId: number,
  qtdRecebida: number,
): ResultadoExplosao {
  const pai = arvore.porId.get(bomLinhaId);
  if (!pai) throw new ExplosaoIndisponivelError(`Linha ${bomLinhaId} não existe na BOM.`);

  // Duas linhas da BOM vieram sem quantidade. Sem ela não dá para saber
  // quantas torres a NF representa; a tela cai para lançamento manual.
  if (pai.qtdPorTorre === null || pai.qtdPorTorre === 0) {
    throw new ExplosaoIndisponivelError(
      `O item ${pai.partNumber || bomLinhaId} não tem quantidade por torre na BOM; lance os filhos manualmente.`,
    );
  }

  const torres = qtdRecebida / pai.qtdPorTorre;

  return {
    torresEquivalentes: torres,
    qtdPorTorreDoPai: pai.qtdPorTorre,
    linhas: folhasDe(arvore, bomLinhaId)
      .filter((f) => f.qtdPorTorre !== null && f.partNumberNorm)
      .map((f) => ({
        bomLinhaId: f.id,
        partNumber: f.partNumber,
        partNumberNorm: f.partNumberNorm,
        codSap: f.codSap,
        descricao: f.descricao,
        secao: f.secao,
        tramo: f.tramo,
        subconjunto: f.subconjunto,
        qtdPorTorre: f.qtdPorTorre!,
        // 3 casas: recebimento parcial de um pai com quantidade quebrada
        // (7 "Anchor mounting studs" de 7) não pode virar dízima no razão.
        qtdCreditada: Math.round(f.qtdPorTorre! * torres * 1000) / 1000,
      })),
  };
}

export interface Subconjunto {
  nome: string;
  itens: ConsumoItem[];
  totalPecas: number;
}

/**
 * O romaneio de um kit T1 tem ~289 part numbers. Agrupado por subconjunto
 * Atlanta ("10481931 - Platform D5081"), vira uma lista que se separa e
 * confere na bancada; solto, é uma parede de parafusos.
 */
export function subconjuntosDoTramo(
  consumo: Map<Tramo, Map<string, ConsumoItem>>,
  tramo: Tramo,
): Subconjunto[] {
  const itens = Array.from(consumo.get(tramo)?.values() ?? []);
  const grupos = new Map<string, ConsumoItem[]>();

  for (const item of itens) {
    // Sem subconjunto, a peça é avulsa do tramo — mantida num grupo próprio
    // em vez de escondida no primeiro subconjunto qualquer.
    const chaves = item.subconjuntos.length ? item.subconjuntos : ['Avulsos do tramo'];
    // Peça compartilhada entre subconjuntos aparece uma vez só, no primeiro:
    // repetir a linha faria o separador pegar a quantidade duas vezes.
    const chave = chaves[0];
    const lista = grupos.get(chave);
    if (lista) lista.push(item);
    else grupos.set(chave, [item]);
  }

  return Array.from(grupos.entries())
    .map(([nome, lista]) => ({
      nome,
      itens: lista.sort((a, b) => a.partNumber.localeCompare(b.partNumber)),
      totalPecas: lista.reduce((s, i) => s + i.qtdPorTorre, 0),
    }))
    .sort((a, b) => {
      if (a.nome === 'Avulsos do tramo') return 1;
      if (b.nome === 'Avulsos do tramo') return -1;
      return b.totalPecas - a.totalPecas;
    });
}

export type TipoPendencia =
  | 'sem_quantidade'
  | 'sem_secao'
  | 'sem_cod_sap'
  | 'colisao_part_number'
  | 'grupo_divergente';

export interface Pendencia {
  tipo: TipoPendencia;
  titulo: string;
  detalhe: string;
  linhas: number[];
}

/**
 * A BOM é somente leitura no app: as correções acontecem na engenharia. Esta
 * auditoria não conserta nada — ela nomeia o que vai atrapalhar, para que a
 * discussão seja sobre a linha 21 da BOM e não sobre "o sistema errou".
 */
export function auditarBom(arvore: ArvoreBom): Pendencia[] {
  const pendencias: Pendencia[] = [];

  const semQtd = arvore.nos.filter((n) => n.folha && n.qtdPorTorre === null);
  if (semQtd.length) {
    pendencias.push({
      tipo: 'sem_quantidade',
      titulo: `${semQtd.length} folha(s) sem quantidade por torre`,
      detalhe:
        'Sem quantidade a peça fica fora do consumo do tramo e não pode ser explodida no recebimento. ' +
        semQtd.slice(0, 5).map((n) => n.partNumber || `linha ${n.id}`).join(', '),
      linhas: semQtd.map((n) => n.id),
    });
  }

  const semSecao = arvore.nos.filter((n) => n.folha && !n.tramo);
  if (semSecao.length) {
    pendencias.push({
      tipo: 'sem_secao',
      titulo: `${semSecao.length} folha(s) sem seção`,
      detalhe:
        'Sem seção não dá para saber a que tramo a peça pertence; ela some do romaneio de todos os kits. ' +
        semSecao.slice(0, 5).map((n) => n.partNumber || `linha ${n.id}`).join(', '),
      linhas: semSecao.map((n) => n.id),
    });
  }

  const semSap = arvore.nos.filter((n) => n.folha && !n.codSap);
  if (semSap.length) {
    pendencias.push({
      tipo: 'sem_cod_sap',
      titulo: `${semSap.length} folha(s) sem código SAP`,
      detalhe:
        'O estoque funciona pelo part number, então não trava nada — mas a NF do fornecedor chega pelo SAP, ' +
        'e sem ele a busca no recebimento depende de acertar o part number.',
      linhas: semSap.map((n) => n.id),
    });
  }

  // Grafias diferentes do mesmo part number: normalizadas viram um item só.
  const porNorm = new Map<string, Set<string>>();
  const linhasPorNorm = new Map<string, number[]>();
  for (const no of arvore.nos) {
    if (!no.partNumberNorm) continue;
    const set = porNorm.get(no.partNumberNorm) ?? new Set<string>();
    set.add(no.partNumber);
    porNorm.set(no.partNumberNorm, set);
    linhasPorNorm.set(no.partNumberNorm, [...(linhasPorNorm.get(no.partNumberNorm) ?? []), no.id]);
  }
  const colisoes = Array.from(porNorm.entries()).filter(([, grafias]) => grafias.size > 1);
  if (colisoes.length) {
    pendencias.push({
      tipo: 'colisao_part_number',
      titulo: `${colisoes.length} part number(s) com mais de uma grafia`,
      detalhe:
        'Tratados como o mesmo item no estoque (é o que se quer), mas confirme que são mesmo iguais: ' +
        colisoes.slice(0, 4).map(([, g]) => Array.from(g).join(' = ')).join('; '),
      linhas: colisoes.flatMap(([norm]) => linhasPorNorm.get(norm) ?? []),
    });
  }

  // `ESCADA` e `Escada de acesso` são o mesmo grupo com caixas diferentes.
  const porGrupoNorm = new Map<string, Set<string>>();
  for (const no of arvore.nos) {
    if (!no.grupoNorm) continue;
    const set = porGrupoNorm.get(no.grupoNorm) ?? new Set<string>();
    set.add(no.grupo);
    porGrupoNorm.set(no.grupoNorm, set);
  }
  const gruposDivergentes = Array.from(porGrupoNorm.values()).filter((g) => g.size > 1);
  if (gruposDivergentes.length) {
    pendencias.push({
      tipo: 'grupo_divergente',
      titulo: `${gruposDivergentes.length} grupo(s) escritos de mais de um jeito`,
      detalhe:
        'Agrupados por comparação em maiúsculas nos filtros: ' +
        gruposDivergentes.slice(0, 4).map((g) => Array.from(g).join(' / ')).join('; '),
      linhas: [],
    });
  }

  return pendencias;
}

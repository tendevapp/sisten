/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Recebimento — importação em lote de entradas de NF.
 *
 * A planilha de origem (romaneio do fornecedor lançado à mão) tem uma linha
 * por item, com o cabeçalho `Data | Situação | TRAMO | NF | Aplicação |
 * Cod.Sap | Part.Number | Descrição do Material | CHECK | UND | Fornecedor`
 * — ou a versão com `PO`, `Qtd/Kit`, `Qtd (Kits)`, `Obs.` e `Número Kit`
 * (sem Situação: tudo é entrada). `CHECK` é a quantidade que entra no saldo;
 * `Obs.` vai para a observação do movimento de cada item.
 * Cada bloco de linhas consecutivas com a mesma (Data, NF) vira UM lançamento
 * — mesmo desenho dos formulários manuais, só que em lote e sem explosão de
 * BOM: aqui os itens já chegam soltos, um por linha, prontos para creditar
 * ou debitar. A coluna `Situação` decide o sentido de cada linha dentro do
 * bloco:
 *
 *  - `Entrada`: credita o item no almoxarifado (mesmo caminho do F1 manual,
 *    sem explosão — vira `proj_registrar_entrada_nf`).
 *  - `Saída`: é uma ORDEM DE SEPARAÇÃO PARA PRÉ-MONTAGEM de verdade (F2),
 *    não um débito solto. Toda linha de saída exige o TRAMO de destino
 *    (`T1-3143`); as linhas são consolidadas GLOBALMENTE por tramo — não por
 *    Data+NF, porque o mesmo tramo pode ter sido registrado em datas/NFs
 *    diferentes na planilha, mas fisicamente é UM kit separado uma única
 *    vez. Cada tramo distinto vira uma chamada a
 *    `proj_registrar_saida_premontagem` (quantidade_kits=1): debita o
 *    almoxarifado, cria o kit em `em_premontagem` e avança o status do
 *    tramo — exatamente o que o formulário manual faz.
 *  - qualquer outro valor (transferência, ajuste manual...): pendência —
 *    este importador não inventa o que fazer com o que não reconhece.
 *
 * Quatro armadilhas reais desta planilha, tratadas explicitamente:
 *
 *  1. Linha quebrada — a origem é um PROCV que às vezes perde a referência:
 *     `Descrição = 'ERRO'`, ou o texto da descrição vazou para a célula de
 *     Part.Number. Essas linhas viram pendência, nunca um crédito de estoque
 *     adivinhado.
 *  2. Bloco repetido — colar a planilha duas vezes seguidas (mesma Data+NF,
 *     mesmas linhas, na mesma ordem) é erro humano comum e indistinguível de
 *     duas remessas reais idênticas só pelos dados. `detectarRepeticaoExata`
 *     aponta o padrão; a decisão de tratar como 1 lançamento (soma) ou N
 *     (um por cópia) fica com quem confere, nunca automática. Vale para
 *     entrada; para saída, dividir um bloco repetido DUPLICARIA o romaneio
 *     do mesmo tramo — o padrão (não dividir) é quase sempre o certo aqui.
 *  3. TRAMO de uma saída que não bate com nenhuma unidade cadastrada
 *     (`T1-3143`, etc.) — normalmente erro de digitação. Vira pendência
 *     `tramo_nao_encontrado`; a peça não é debitada sem o operador corrigir.
 *  4. TRAMO em branco numa linha de saída — sem tramo não há para onde abrir
 *     a ordem de separação. Vira pendência `tramo_obrigatorio`, nunca uma
 *     saída "sem destino".
 *
 * E duas situações que não são erro:
 *
 *  - `CHECK` vazio, 0 ou "-" numa entrada = o item NÃO veio neste
 *    carregamento. Sai em `naoEntregues` (não é crédito nem pendência) para
 *    ser gravado em `proj_entregas_pendentes` e acompanhado até chegar.
 *  - part number legível que não está no catálogo do projeto (fora da BOM):
 *    segue como pendência `nao_encontrado_no_catalogo`, e `itensForaDoCatalogo`
 *    junta os dados para a tela oferecer o cadastro antes de importar.
 */

import { excelSerialToISO, parseMb51Number } from './mb51';
import { normalizarPartNumber, type Tramo } from './projetos';

// ---------------------------------------------------------------------------
// Colunas
// ---------------------------------------------------------------------------

export interface ColunaImportacaoEntrada {
  header: string;
  field: string;
  aliases?: string[];
  obrigatoria?: boolean;
}

export const COLUNAS_IMPORTACAO_ENTRADA: ColunaImportacaoEntrada[] = [
  { header: 'Data', field: 'data', obrigatoria: true },
  { header: 'Situação', field: 'situacao', aliases: ['situacao', 'status'] },
  { header: 'TRAMO', field: 'tramo', aliases: ['tramo unidade', 'tramo/torre', 'unidade'] },
  { header: 'NF', field: 'nf', aliases: ['numero nf', 'número nf', 'nota fiscal', 'nº nf', 'n° nf', 'no nf'], obrigatoria: true },
  { header: 'Aplicação', field: 'aplicacao', aliases: ['aplicacao', 'subconjunto', 'grupo'] },
  { header: 'Cod.Sap', field: 'cod_sap', aliases: ['cod sap', 'codigo sap', 'código sap', 'cod. sap'] },
  { header: 'Part.Number', field: 'part_number', aliases: ['part number', 'partnumber', 'pn', 'part.numer'], obrigatoria: true },
  { header: 'Descrição do Material', field: 'descricao', aliases: ['descricao', 'descricao do material', 'descrição material', 'descrição'] },
  { header: 'CHECK', field: 'quantidade', aliases: ['quantidade', 'qtd', 'qtd.', 'check'], obrigatoria: true },
  { header: 'UND', field: 'uom', aliases: ['unidade', 'un', 'und', 'un.'] },
  { header: 'Fornecedor', field: 'fornecedor', aliases: ['forn.', 'fornecedor(a)'] },
  { header: 'PO', field: 'pedido', aliases: ['pedido', 'pedido de compra', 'nº po', 'n° po', 'no po', 'ordem de compra', 'oc'] },
  { header: 'Qtd/Kit', field: 'qtd_por_kit', aliases: ['qtd por kit', 'quantidade por kit', 'qtd kit'] },
  { header: 'Qtd (Kits)', field: 'qtd_kits', aliases: ['qtd kits', 'quantidade de kits', 'kits'] },
  { header: 'Obs.', field: 'obs', aliases: ['obs', 'observacao', 'observação', 'observacoes', 'observações'] },
  { header: 'Número Kit', field: 'numero_kit', aliases: ['numero kit', 'nº kit', 'n° kit', 'no kit', 'kit'] },
];

/** Minúsculo, sem acento, sem pontuação — para casar cabeçalho digitado de qualquer jeito. */
export function normalizarCabecalho(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export interface MapeamentoColunas {
  /** field -> índice da coluna na planilha, ou null se não encontrada. */
  indices: Record<string, number | null>;
  faltando: string[];
}

/** Casa o cabeçalho da planilha com `COLUNAS_IMPORTACAO_ENTRADA`, tolerando ordem e grafia. */
export function mapearColunas(linhaCabecalho: unknown[]): MapeamentoColunas {
  const normalizados = linhaCabecalho.map(normalizarCabecalho);
  const indices: Record<string, number | null> = {};
  const faltando: string[] = [];

  for (const col of COLUNAS_IMPORTACAO_ENTRADA) {
    const candidatos = [col.header, ...(col.aliases ?? [])].map(normalizarCabecalho);
    const idx = normalizados.findIndex((h) => h && candidatos.includes(h));
    indices[col.field] = idx >= 0 ? idx : null;
    if (idx < 0 && col.obrigatoria) faltando.push(col.header);
  }

  return { indices, faltando };
}

// ---------------------------------------------------------------------------
// Parsing de linha
// ---------------------------------------------------------------------------

export type MotivoPendencia =
  | 'situacao_nao_suportada'
  | 'sem_quantidade'
  | 'part_number_ilegivel'
  | 'nao_encontrado_no_catalogo'
  | 'tramo_nao_encontrado'
  | 'tramo_obrigatorio';

export type SentidoMovimento = 'entrada' | 'saida';

/**
 * `Entrada`/`ENTRADA` → 'entrada'; `Saída`/`Saida`/`SAIDA` → 'saida'; qualquer
 * outra coisa (transferência, ajuste manual, célula em branco fora do padrão)
 * fica sem sentido reconhecido e a linha vira pendência mais adiante.
 */
export function normalizarSentido(situacao: string): SentidoMovimento | null {
  const s = situacao
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  if (s === 'entrada') return 'entrada';
  if (s === 'saida') return 'saida';
  return null;
}

export interface LinhaImportacao {
  /** Linha 1-based na planilha (cabeçalho = linha 1), para o operador localizar o erro. */
  linha: number;
  dataISO: string | null;
  dataBruta: string;
  situacao: string;
  tramo: string | null;
  nf: string;
  aplicacao: string | null;
  codSap: string | null;
  partNumberBruto: string;
  partNumberNorm: string;
  descricao: string;
  quantidade: number | null;
  /** CHECK vazio, 0 ou "-": o item não veio neste carregamento. */
  naoEntregue: boolean;
  uom: string | null;
  fornecedor: string | null;
  pedido: string | null;
  qtdPorKit: number | null;
  qtdKits: number | null;
  numeroKit: string | null;
  obs: string | null;
}

const texto = (v: unknown): string => String(v ?? '').trim();

/** Um part number "ilegível" não tem nenhum dígito, ou a descrição perdeu o vínculo (`ERRO`). */
function partNumberIlegivel(partNumberBruto: string, descricao: string): boolean {
  if (descricao.trim().toUpperCase() === 'ERRO') return true;
  return !/[0-9]/.test(partNumberBruto);
}

/** CHECK que diz "não veio": célula vazia, traço ou zero. Texto qualquer ("OK", "?") não conta — vira `sem_quantidade`. */
export function checkNaoEntregue(bruto: unknown): boolean {
  const t = texto(bruto);
  if (t === '' || /^[-–—]+$/.test(t)) return true;
  return parseMb51Number(bruto) === 0;
}

/** Quantidade que deveria ter vindo: Qtd/Kit × Qtd (Kits) quando há as duas, senão a que houver. */
export function quantidadeEsperada(l: Pick<LinhaImportacao, 'qtdPorKit' | 'qtdKits'>): number | null {
  const porKit = l.qtdPorKit != null && l.qtdPorKit > 0 ? l.qtdPorKit : null;
  const kits = l.qtdKits != null && l.qtdKits > 0 ? l.qtdKits : null;
  if (porKit != null && kits != null) return porKit * kits;
  return porKit ?? kits;
}

/**
 * Linha totalmente vazia (célula em branco na planilha, ou linha de separação
 * visual entre blocos). Descartada silenciosamente, sem virar pendência.
 */
function linhaVazia(row: unknown[]): boolean {
  return row.every((c) => texto(c) === '');
}

export function parseLinhasImportacao(rawRows: unknown[][]): {
  linhas: LinhaImportacao[];
  erroFatal: string | null;
} {
  if (!rawRows.length) return { linhas: [], erroFatal: 'Planilha vazia.' };

  const { indices, faltando } = mapearColunas(rawRows[0]);
  if (faltando.length) {
    return {
      linhas: [],
      erroFatal: `Coluna(s) obrigatória(s) não encontrada(s) no cabeçalho: ${faltando.join(', ')}.`,
    };
  }

  const linhas: LinhaImportacao[] = [];
  const at = (row: unknown[], field: string): unknown => {
    const idx = indices[field];
    return idx === null ? undefined : row[idx];
  };

  for (let i = 1; i < rawRows.length; i += 1) {
    const row = rawRows[i];
    if (!row || linhaVazia(row)) continue;

    const nf = texto(at(row, 'nf'));
    const partNumberBruto = texto(at(row, 'part_number'));
    if (!nf && !partNumberBruto) continue; // linha de rodapé/observação, sem dado de negócio

    const dataBruta = texto(at(row, 'data'));
    const descricao = texto(at(row, 'descricao'));

    linhas.push({
      linha: i + 1,
      dataISO: excelSerialToISO(at(row, 'data')),
      dataBruta,
      situacao: texto(at(row, 'situacao')) || 'Entrada',
      tramo: texto(at(row, 'tramo')) || null,
      nf,
      aplicacao: texto(at(row, 'aplicacao')) || null,
      codSap: texto(at(row, 'cod_sap')) || null,
      partNumberBruto,
      partNumberNorm: normalizarPartNumber(partNumberBruto),
      descricao,
      quantidade: parseMb51Number(at(row, 'quantidade')),
      naoEntregue: checkNaoEntregue(at(row, 'quantidade')),
      uom: texto(at(row, 'uom')) || null,
      fornecedor: texto(at(row, 'fornecedor')) || null,
      pedido: texto(at(row, 'pedido')) || null,
      qtdPorKit: parseMb51Number(at(row, 'qtd_por_kit')),
      qtdKits: parseMb51Number(at(row, 'qtd_kits')),
      numeroKit: texto(at(row, 'numero_kit')) || null,
      obs: texto(at(row, 'obs')) || null,
    });
  }

  return { linhas, erroFatal: null };
}

// ---------------------------------------------------------------------------
// Agrupamento por nota (Data + NF contíguos)
// ---------------------------------------------------------------------------

export interface GrupoNotaImportada {
  /** `${dataISO}__${nf}` da primeira ocorrência — só identifica o grupo, não é único entre grupos repetidos. */
  chave: string;
  dataISO: string | null;
  dataBruta: string;
  nf: string;
  fornecedor: string | null;
  linhas: LinhaImportacao[];
  /**
   * > 1 quando as linhas do grupo são N cópias exatas de um mesmo bloco menor
   * (mesma sequência de part number + quantidade, na mesma ordem). Sinal de
   * colagem duplicada — nunca president assumido, sempre exposto para decisão.
   */
  repeticaoDetectada: number;
}

/**
 * Agrupa por corrida contígua de (Data, NF): a cada linha cuja (Data, NF)
 * difere da linha anterior, fecha o grupo corrente e abre outro. É o mesmo
 * corte que uma pessoa lendo a planilha de cima para baixo faria.
 */
export function agruparPorNota(linhas: LinhaImportacao[]): GrupoNotaImportada[] {
  const grupos: GrupoNotaImportada[] = [];
  let atual: LinhaImportacao[] = [];

  const fechar = () => {
    if (!atual.length) return;
    const primeira = atual[0];
    grupos.push({
      chave: `${primeira.dataISO ?? primeira.dataBruta}__${primeira.nf}`,
      dataISO: primeira.dataISO,
      dataBruta: primeira.dataBruta,
      nf: primeira.nf,
      fornecedor: atual.find((l) => l.fornecedor)?.fornecedor ?? null,
      linhas: atual,
      repeticaoDetectada: detectarRepeticaoExata(atual),
    });
    atual = [];
  };

  for (const linha of linhas) {
    const anterior = atual[atual.length - 1];
    if (anterior && (anterior.dataISO !== linha.dataISO || anterior.nf !== linha.nf)) {
      fechar();
    }
    atual.push(linha);
  }
  fechar();

  return grupos;
}

/**
 * Assinatura de uma linha para comparar repetição — ignora `linha`/`dataBruta`,
 * que mudam sem mudar o conteúdo. Obs., Número Kit e PO entram: blocos com os
 * mesmos itens em caixas diferentes ("TRAMO 3 - CX1" / "CX2") são remessas
 * distintas, não a planilha colada duas vezes.
 */
const assinaturaLinha = (l: LinhaImportacao): string =>
  [l.partNumberNorm, l.descricao, l.quantidade ?? '', l.naoEntregue ? 'NE' : '', l.aplicacao ?? '', l.obs ?? '', l.numeroKit ?? '', l.pedido ?? ''].join('|');

/**
 * Maior N >= 2 tal que as linhas do grupo são exatamente N cópias consecutivas
 * de um mesmo bloco de tamanho `total/N`. Devolve 1 quando não há repetição.
 *
 * Varre da maior divisão para a menor: um bloco de 62 linhas que é 2 cópias de
 * 31 também "parece" 31 cópias de 2 quando o acaso alinha alguns pares — a
 * maior divisão é sempre a leitura mais provável (o bloco inteiro se repete,
 * não uma peça isolada dele).
 */
export function detectarRepeticaoExata(linhas: LinhaImportacao[]): number {
  const total = linhas.length;
  if (total < 2) return 1;

  const assinaturas = linhas.map(assinaturaLinha);

  for (let n = Math.floor(total / 2); n >= 2; n -= 1) {
    if (total % n !== 0) continue;
    const tamanhoBloco = total / n;
    let bate = true;
    for (let copia = 1; copia < n && bate; copia += 1) {
      for (let i = 0; i < tamanhoBloco; i += 1) {
        if (assinaturas[i] !== assinaturas[copia * tamanhoBloco + i]) { bate = false; break; }
      }
    }
    if (bate) return n;
  }

  return 1;
}

/** Quebra um grupo com repetição detectada em N grupos independentes, um por cópia. */
export function dividirGrupoRepetido(grupo: GrupoNotaImportada): GrupoNotaImportada[] {
  if (grupo.repeticaoDetectada <= 1) return [grupo];
  const tamanhoBloco = grupo.linhas.length / grupo.repeticaoDetectada;
  const partes: GrupoNotaImportada[] = [];
  for (let c = 0; c < grupo.repeticaoDetectada; c += 1) {
    const linhas = grupo.linhas.slice(c * tamanhoBloco, (c + 1) * tamanhoBloco);
    partes.push({ ...grupo, linhas, repeticaoDetectada: 1 });
  }
  return partes;
}

// ---------------------------------------------------------------------------
// Reconciliação: consolida quantidades por item e separa pendências
// ---------------------------------------------------------------------------

export interface CreditoConsolidado {
  partNumberNorm: string;
  partNumber: string;
  descricao: string;
  itemId: string;
  quantidade: number;
  linhasOrigem: number[];
  /** Obs. das linhas somadas (sem repetir) — vira a observação do movimento. */
  observacoes: string[];
  /** POs das linhas somadas (sem repetir). */
  pedidos: string[];
}

/** Item com CHECK vazio/0/"-": esperado na NF, não veio neste carregamento. */
export interface ItemNaoEntregue {
  linha: number;
  nf: string;
  dataISO: string | null;
  pedido: string | null;
  partNumber: string;
  partNumberNorm: string;
  codSap: string | null;
  descricao: string;
  quantidadeEsperada: number | null;
  uom: string | null;
  aplicacao: string | null;
  numeroKit: string | null;
  obs: string | null;
  fornecedor: string | null;
  /** Item do catálogo, quando o part number está lá (pode chegar fora da BOM). */
  itemId: string | null;
}

/** Chave de deduplicação em `proj_entregas_pendentes`: reimportar a mesma planilha não duplica a pendência. */
export function chaveNaoEntregue(i: Pick<ItemNaoEntregue, 'nf' | 'partNumberNorm' | 'pedido' | 'numeroKit' | 'aplicacao'>): string {
  return [i.nf, i.partNumberNorm, i.pedido ?? '', i.numeroKit ?? '', i.aplicacao ?? ''].map((x) => x.trim().toUpperCase()).join('|');
}

/**
 * Igual ao crédito, mas sempre amarrado a um tramo — toda saída é ordem de
 * separação para pré-montagem, e ordem sem alvo não existe.
 */
export interface DebitoConsolidado extends CreditoConsolidado {
  tramoUnidadeId: string;
}

export interface Pendencia {
  linha: number;
  motivo: MotivoPendencia;
  detalhe: string;
  nf: string;
  partNumberBruto: string;
  descricao: string;
  /** Só em `nao_encontrado_no_catalogo`: o que é preciso para cadastrar o item. */
  codSap?: string | null;
  uom?: string | null;
  fornecedor?: string | null;
  quantidade?: number | null;
}

export interface ReconciliacaoGrupo {
  grupo: GrupoNotaImportada;
  creditosEntrada: CreditoConsolidado[];
  debitosSaida: DebitoConsolidado[];
  pendencias: Pendencia[];
  naoEntregues: ItemNaoEntregue[];
  totalItens: number;
  totalPecas: number;
}

const ROTULO_PENDENCIA: Record<MotivoPendencia, string> = {
  situacao_nao_suportada: 'Situação diferente de "Entrada"/"Saída" — este importador não sabe o que fazer com ela',
  sem_quantidade: 'Sem quantidade legível (célula vazia, "-" ou texto)',
  part_number_ilegivel: 'Descrição "ERRO" ou part number sem nenhum dígito — planilha de origem perdeu o vínculo',
  nao_encontrado_no_catalogo: 'Part number não encontrado no catálogo do projeto',
  tramo_nao_encontrado: 'TRAMO preenchido não bate com nenhuma unidade cadastrada (ex.: T1-3143)',
  tramo_obrigatorio: 'Saída sem TRAMO — toda saída vira ordem de separação e precisa de um tramo de destino',
};

export function rotuloPendencia(m: MotivoPendencia): string {
  return ROTULO_PENDENCIA[m];
}

/**
 * Consolida um grupo já definido (uma corrida de linhas de mesma Data+NF, já
 * dividida se havia repetição) em créditos de entrada e débitos de saída por
 * item — somando quantidades repetidas do mesmo part number dentro do bloco,
 * cada sentido na sua própria lista — e separa toda linha que não pode virar
 * movimento de estoque, com o motivo explícito.
 *
 * `tramosValidos` são os ids de `proj_tramos_gwjaco` (`T1-3143`, ...), em
 * maiúsculas — usado só para resolver o TRAMO de linhas de saída.
 */
export function reconciliarGrupo(
  grupo: GrupoNotaImportada,
  itemIdPorPn: Map<string, { id: string; part_number: string; descricao?: string | null }>,
  tramosValidos: Set<string> = new Set(),
): ReconciliacaoGrupo {
  const creditosPorPn = new Map<string, CreditoConsolidado>();
  const debitosPorChave = new Map<string, DebitoConsolidado>();
  const pendencias: Pendencia[] = [];
  const naoEntregues: ItemNaoEntregue[] = [];

  for (const l of grupo.linhas) {
    const sentido = normalizarSentido(l.situacao);
    if (sentido === null) {
      pendencias.push({ linha: l.linha, motivo: 'situacao_nao_suportada', detalhe: l.situacao, nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao });
      continue;
    }
    if (partNumberIlegivel(l.partNumberBruto, l.descricao)) {
      pendencias.push({ linha: l.linha, motivo: 'part_number_ilegivel', detalhe: l.partNumberBruto || l.descricao, nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao });
      continue;
    }
    // Entrada com CHECK vazio/0/"-": não veio neste carregamento — acompanha, não credita.
    if (sentido === 'entrada' && l.naoEntregue) {
      naoEntregues.push({
        linha: l.linha, nf: l.nf, dataISO: l.dataISO, pedido: l.pedido,
        partNumber: itemIdPorPn.get(l.partNumberNorm)?.part_number ?? l.partNumberBruto, partNumberNorm: l.partNumberNorm,
        // Descrição vazia na planilha (PROCV sem vínculo): a do catálogo, quando o item existe.
        codSap: l.codSap, descricao: l.descricao || itemIdPorPn.get(l.partNumberNorm)?.descricao || '', quantidadeEsperada: quantidadeEsperada(l), uom: l.uom,
        aplicacao: l.aplicacao, numeroKit: l.numeroKit, obs: l.obs, fornecedor: l.fornecedor,
        itemId: itemIdPorPn.get(l.partNumberNorm)?.id ?? null,
      });
      continue;
    }
    if (l.quantidade === null || l.quantidade <= 0) {
      pendencias.push({ linha: l.linha, motivo: 'sem_quantidade', detalhe: '', nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao });
      continue;
    }
    const item = itemIdPorPn.get(l.partNumberNorm);
    if (!item) {
      pendencias.push({
        linha: l.linha, motivo: 'nao_encontrado_no_catalogo', detalhe: l.partNumberBruto, nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao,
        codSap: l.codSap, uom: l.uom, fornecedor: l.fornecedor, quantidade: l.quantidade,
      });
      continue;
    }

    if (sentido === 'entrada') {
      const atual = creditosPorPn.get(l.partNumberNorm);
      if (atual) {
        atual.quantidade += l.quantidade;
        atual.linhasOrigem.push(l.linha);
        if (l.obs && !atual.observacoes.includes(l.obs)) atual.observacoes.push(l.obs);
        if (l.pedido && !atual.pedidos.includes(l.pedido)) atual.pedidos.push(l.pedido);
      } else {
        creditosPorPn.set(l.partNumberNorm, {
          partNumberNorm: l.partNumberNorm, partNumber: item.part_number, descricao: l.descricao,
          itemId: item.id, quantidade: l.quantidade, linhasOrigem: [l.linha],
          observacoes: l.obs ? [l.obs] : [], pedidos: l.pedido ? [l.pedido] : [],
        });
      }
      continue;
    }

    // sentido === 'saida': toda saída é ordem de separação — exige tramo.
    const tramoBruto = l.tramo?.trim().toUpperCase() ?? '';
    if (!tramoBruto) {
      pendencias.push({ linha: l.linha, motivo: 'tramo_obrigatorio', detalhe: '', nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao });
      continue;
    }
    if (!tramosValidos.has(tramoBruto)) {
      pendencias.push({ linha: l.linha, motivo: 'tramo_nao_encontrado', detalhe: tramoBruto, nf: l.nf, partNumberBruto: l.partNumberBruto, descricao: l.descricao });
      continue;
    }
    const tramoUnidadeId = tramoBruto;

    // Mesma peça saindo para tramos diferentes não pode ser somada num só
    // débito — cada tramo é um destino de estoque distinto.
    const chave = `${l.partNumberNorm}::${tramoUnidadeId}`;
    const atual = debitosPorChave.get(chave);
    if (atual) {
      atual.quantidade += l.quantidade;
      atual.linhasOrigem.push(l.linha);
    } else {
      debitosPorChave.set(chave, {
        partNumberNorm: l.partNumberNorm, partNumber: item.part_number, descricao: l.descricao,
        itemId: item.id, quantidade: l.quantidade, linhasOrigem: [l.linha], tramoUnidadeId,
        observacoes: l.obs ? [l.obs] : [], pedidos: l.pedido ? [l.pedido] : [],
      });
    }
  }

  const creditosEntrada = Array.from(creditosPorPn.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
  const debitosSaida = Array.from(debitosPorChave.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber));

  return {
    grupo,
    creditosEntrada,
    debitosSaida,
    pendencias,
    naoEntregues,
    totalItens: creditosEntrada.length + debitosSaida.length,
    totalPecas: creditosEntrada.reduce((s, c) => s + c.quantidade, 0) + debitosSaida.reduce((s, c) => s + c.quantidade, 0),
  };
}

/** Observação do movimento de um crédito: as Obs. da planilha, mais o PO quando há. */
export function observacaoDoCredito(c: Pick<CreditoConsolidado, 'observacoes' | 'pedidos'>): string | null {
  const partes = [...c.observacoes];
  if (c.pedidos.length) partes.push(`PO ${c.pedidos.join(', ')}`);
  return partes.length ? partes.join(' | ') : null;
}

// ---------------------------------------------------------------------------
// Fora do catálogo (fora da BOM): sugestão de cadastro
// ---------------------------------------------------------------------------

export interface ItemForaDoCatalogo {
  partNumber: string;
  partNumberNorm: string;
  codSap: string | null;
  descricao: string;
  uom: string | null;
  fornecedor: string | null;
  quantidade: number;
  nfs: string[];
}

/** Part numbers legíveis, com quantidade, que não estão no catálogo — um por PN, somando as linhas. */
export function itensForaDoCatalogo(reconciliacoes: ReconciliacaoGrupo[]): ItemForaDoCatalogo[] {
  const porPn = new Map<string, ItemForaDoCatalogo>();
  for (const r of reconciliacoes) {
    for (const p of r.pendencias) {
      if (p.motivo !== 'nao_encontrado_no_catalogo') continue;
      const norm = normalizarPartNumber(p.partNumberBruto);
      if (!norm) continue;
      const atual = porPn.get(norm);
      if (atual) {
        atual.quantidade += p.quantidade ?? 0;
        if (p.nf && !atual.nfs.includes(p.nf)) atual.nfs.push(p.nf);
        atual.codSap = atual.codSap ?? p.codSap ?? null;
        if (!atual.descricao && p.descricao) atual.descricao = p.descricao;
      } else {
        porPn.set(norm, {
          partNumber: p.partNumberBruto, partNumberNorm: norm, codSap: p.codSap ?? null, descricao: p.descricao,
          uom: p.uom ?? null, fornecedor: p.fornecedor ?? null, quantidade: p.quantidade ?? 0, nfs: p.nf ? [p.nf] : [],
        });
      }
    }
  }
  return Array.from(porPn.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}

// ---------------------------------------------------------------------------
// Pendências de entrega anteriores que chegaram nesta planilha
// ---------------------------------------------------------------------------

export interface EntregaPendenteAberta {
  id: string;
  part_number_norm: string;
  pedido: string | null;
  numero_nf: string;
}

/**
 * Pendência aberta cujo item veio creditado nesta importação: mesmo part
 * number e, quando os dois lados têm PO, o mesmo PO. Devolve id da pendência
 * → NF da entrada que a atende (a primeira encontrada).
 */
export function pendenciasAtendidas(abertas: EntregaPendenteAberta[], reconciliacoes: ReconciliacaoGrupo[]): Map<string, string> {
  const atendidas = new Map<string, string>();
  for (const a of abertas) {
    for (const r of reconciliacoes) {
      const credito = r.creditosEntrada.find(
        (c) => c.partNumberNorm === a.part_number_norm && (!a.pedido || !c.pedidos.length || c.pedidos.includes(a.pedido)),
      );
      if (credito) { atendidas.set(a.id, r.grupo.nf); break; }
    }
  }
  return atendidas;
}

// ---------------------------------------------------------------------------
// Duplicidade com o que já está gravado (reimportar a mesma planilha)
// ---------------------------------------------------------------------------

/** Entrada de NF já gravada, com o que ela creditou (item → quantidade). */
export interface EntradaExistente {
  id: string;
  codigo: string;
  numero_nf: string;
  data_entrada: string;
  created_at: string;
  criado_por_nome: string | null;
  movimentos: { item_id: string; quantidade: number }[];
}

export type Duplicidade =
  | { tipo: 'identica'; codigo: string; criadoEm: string; criadoPor: string | null }
  | { tipo: 'mesma_nf_data'; codigos: string[] };

/** NF como o lançamento grava: vazia vira 'S/N'. */
const nfGravada = (nf: string) => (nf.trim() || 'S/N').toUpperCase();

/** item → quantidade somada, em texto estável para comparar conteúdo. */
function conteudo(pares: { item: string; qtd: number }[]): string {
  const soma = new Map<string, number>();
  pares.forEach((p) => soma.set(p.item, (soma.get(p.item) ?? 0) + p.qtd));
  return Array.from(soma.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([i, q]) => `${i}:${Number(q.toFixed(6))}`).join(',');
}

/**
 * Para cada lançamento de entrada da planilha (na ordem de `reconciliacoes`),
 * diz se ele já existe no banco:
 *  - `identica`: mesma NF, mesma data e os mesmos itens/quantidades de uma
 *    entrada vigente — não deve ser lançada de novo;
 *  - `mesma_nf_data`: há entrada da mesma NF na mesma data, mas com itens
 *    diferentes — pode ser uma 2ª entrega real, quem confere decide.
 * Cada entrada gravada casa com um lançamento só: se a planilha tem duas
 * remessas idênticas reais e o banco só uma, a segunda segue como nova.
 * Índices sem entrada no mapa são novos.
 */
export function marcarDuplicidades(reconciliacoes: ReconciliacaoGrupo[], existentes: EntradaExistente[]): Map<number, Duplicidade> {
  const resultado = new Map<number, Duplicidade>();
  const usadas = new Set<string>();
  const conteudoExistente = new Map(existentes.map((e) => [e.id, conteudo(e.movimentos.map((m) => ({ item: m.item_id, qtd: Number(m.quantidade) })))]));

  reconciliacoes.forEach((r, i) => {
    if (!r.creditosEntrada.length || !r.grupo.dataISO) return;
    const mesmas = existentes.filter((e) => nfGravada(e.numero_nf) === nfGravada(r.grupo.nf) && e.data_entrada.slice(0, 10) === r.grupo.dataISO);
    if (!mesmas.length) return;
    const meu = conteudo(r.creditosEntrada.map((c) => ({ item: c.itemId, qtd: c.quantidade })));
    const igual = mesmas.find((e) => !usadas.has(e.id) && conteudoExistente.get(e.id) === meu);
    if (igual) {
      usadas.add(igual.id);
      resultado.set(i, { tipo: 'identica', codigo: igual.codigo, criadoEm: igual.created_at, criadoPor: igual.criado_por_nome });
      return;
    }
    // Todas as idênticas já foram casadas com outro lançamento: este é novo.
    if (mesmas.every((e) => usadas.has(e.id) && conteudoExistente.get(e.id) === meu)) return;
    resultado.set(i, { tipo: 'mesma_nf_data', codigos: mesmas.map((e) => e.codigo) });
  });
  return resultado;
}

// ---------------------------------------------------------------------------
// Consolidação de saída: por tramo, GLOBALMENTE (não por Data+NF)
// ---------------------------------------------------------------------------

/** `T1-3143` → `T1`. O tramo já está codificado no id da unidade. */
function tramoDoTramoUnidadeId(id: string): Tramo | null {
  const t = id.split('-')[0];
  return (['T1', 'T2', 'T3', 'T4', 'T5'] as const).includes(t as Tramo) ? (t as Tramo) : null;
}

export interface OrdemPremontagemImportada {
  tramoUnidadeId: string;
  tramo: Tramo;
  itens: DebitoConsolidado[];
  totalPecas: number;
  /** NFs de origem das linhas que compõem esta ordem — só para a tela mostrar rastreio. */
  origemNfs: string[];
}

/**
 * Junta os débitos de saída de TODOS os grupos por tramo — o mesmo tramo
 * pode ter linhas espalhadas em NFs/datas diferentes na planilha, mas
 * fisicamente é um kit separado uma vez só. Cada tramo distinto aqui vira
 * UMA chamada a `proj_registrar_saida_premontagem`.
 */
export function consolidarOrdensSaida(grupos: ReconciliacaoGrupo[]): OrdemPremontagemImportada[] {
  const porTramo = new Map<string, { itens: Map<string, DebitoConsolidado>; nfs: Set<string> }>();

  for (const g of grupos) {
    for (const d of g.debitosSaida) {
      let bucket = porTramo.get(d.tramoUnidadeId);
      if (!bucket) { bucket = { itens: new Map(), nfs: new Set() }; porTramo.set(d.tramoUnidadeId, bucket); }
      if (g.grupo.nf) bucket.nfs.add(g.grupo.nf);

      const atual = bucket.itens.get(d.partNumberNorm);
      if (atual) {
        atual.quantidade += d.quantidade;
        atual.linhasOrigem.push(...d.linhasOrigem);
      } else {
        bucket.itens.set(d.partNumberNorm, { ...d, linhasOrigem: [...d.linhasOrigem] });
      }
    }
  }

  return Array.from(porTramo.entries())
    .map(([tramoUnidadeId, bucket]) => {
      const itens = Array.from(bucket.itens.values()).sort((a, b) => a.partNumber.localeCompare(b.partNumber));
      return {
        tramoUnidadeId,
        tramo: tramoDoTramoUnidadeId(tramoUnidadeId) ?? 'T1',
        itens,
        totalPecas: itens.reduce((s, i) => s + i.quantidade, 0),
        origemNfs: Array.from(bucket.nfs).sort(),
      };
    })
    .sort((a, b) => a.tramoUnidadeId.localeCompare(b.tramoUnidadeId));
}

export interface ResultadoImportacao {
  grupos: ReconciliacaoGrupo[];
  ordensSaida: OrdemPremontagemImportada[];
  totalNotas: number;
  totalItens: number;
  totalPecas: number;
  totalPendencias: number;
  totalNaoEntregues: number;
}

/** Roda o pipeline inteiro: parse -> agrupa -> reconcilia -> consolida saída. Não faz nenhuma chamada de rede. */
export function processarImportacaoMovimentos(
  rawRows: unknown[][],
  itemIdPorPn: Map<string, { id: string; part_number: string }>,
  tramosValidos: Set<string> = new Set(),
): { resultado: ResultadoImportacao | null; erroFatal: string | null } {
  const { linhas, erroFatal } = parseLinhasImportacao(rawRows);
  if (erroFatal) return { resultado: null, erroFatal };
  if (!linhas.length) return { resultado: null, erroFatal: 'Nenhuma linha de dado encontrada na planilha.' };

  const grupos = agruparPorNota(linhas).map((g) => reconciliarGrupo(g, itemIdPorPn, tramosValidos));
  const ordensSaida = consolidarOrdensSaida(grupos);

  return {
    resultado: {
      grupos,
      ordensSaida,
      totalNotas: grupos.length,
      totalItens: grupos.reduce((s, g) => s + g.creditosEntrada.length, 0) + ordensSaida.reduce((s, o) => s + o.itens.length, 0),
      totalPecas: grupos.reduce((s, g) => s + g.creditosEntrada.reduce((x, c) => x + c.quantidade, 0), 0) + ordensSaida.reduce((s, o) => s + o.totalPecas, 0),
      totalPendencias: grupos.reduce((s, g) => s + g.pendencias.length, 0),
      totalNaoEntregues: grupos.reduce((s, g) => s + g.naoEntregues.length, 0),
    },
    erroFatal: null,
  };
}

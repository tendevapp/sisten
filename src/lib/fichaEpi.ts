/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha de EPI (FRM.SEG-0008) — regras puras do lançamento e da análise de
 * consumo. Sem Supabase aqui: a API (`ssmaFichaEpiApi.ts`) busca, este
 * arquivo decide, e os testes cobrem as decisões.
 */

import type { SsmaBookEpi } from './ssmaBookEpisApi';
import type { SsmaEpiFuncao, SsmaEpiPorFuncao } from './ssmaEpiPorFuncaoApi';
import type { ClassificacaoEpiFuncao } from './epiPorFuncaoImportacao';

// ---------------------------------------------------------------------------
// Formulário em papel — texto único para a tela e o PDF
// ---------------------------------------------------------------------------

export const FICHA_EPI_FORMULARIO = {
  codigo: 'FRM.SEG-0008',
  revisao: '02',
  data: '13-02-2023',
  titulo: 'TERMO DE RESPONSABILIDADE',
  subtitulo: 'EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL – EPI',
};

/** Trecho de texto com ou sem negrito, na ordem em que aparece. */
export type TrechoTermo = { texto: string; negrito?: boolean };

export const TERMO_FICHA_EPI: { paragrafos: TrechoTermo[][]; espacoAntes: number[] } = {
  paragrafos: [
    [
      { texto: 'Declaro que recebi da ' },
      { texto: 'TORRES EÓLICAS DO NORDESTE', negrito: true },
      { texto: ', gratuitamente para uso temporário os materiais abaixo relacionados, conforme determina a Lei ' },
      { texto: '6.514', negrito: true },
      {
        texto:
          ' regulamentada pela Portaria 3.214/78 do Ministério do Trabalho. Fui devidamente instruído da forma e obrigatoriedade de utilizá-los e conservá-los, trocando-os quando perderem a condição de uso, devolvendo-os ao final de sua vida útil ou ao sair da empresa. Estou ciente de que no caso de extravio ou avarias por mau uso, a empresa poderá debitá-los de meus vencimentos.',
      },
    ],
    [{ texto: '6.6 Responsabilidades do trabalhador', negrito: true }],
    [{ texto: '6.6.1 Cabe ao trabalhador, quanto ao EPI:' }],
    [{ texto: 'a) usar o fornecido pela organização, observado o disposto no item 6.5.2;' }],
    [{ texto: 'b) utilizar apenas para a finalidade a que se destina;' }],
    [{ texto: 'c) responsabilizar-se pela limpeza, guarda e conservação;' }],
    [{ texto: 'd) comunicar à organização quando extraviado, danificado ou qualquer alteração que o torne impróprio para uso; e' }],
    [{ texto: 'e) cumprir as determinações da organização sobre o uso adequado.' }],
    [
      { texto: '1.5.5.1.2', negrito: true },
      {
        texto:
          ' Quando comprovada pela organização a inviabilidade técnica da adoção de medidas de proteção coletiva, ou quando estas não forem suficientes ou encontrarem-se em fase de estudo, planejamento ou implantação ou, ainda, em caráter complementar ou emergencial, deverão ser adotadas outras medidas, obedecendo-se a seguinte hierarquia:',
      },
    ],
    [{ texto: 'a) medidas de caráter administrativo ou de organização do trabalho; e' }],
    [{ texto: 'b) utilização de equipamento de proteção individual - EPI.' }],
  ],
  // Linhas em branco antes de cada parágrafo, como no formulário.
  espacoAntes: [0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0],
};

// ---------------------------------------------------------------------------
// Legenda M.E.D. do formulário
// ---------------------------------------------------------------------------

export type MotivoMed = 1 | 2 | 3 | 4;

export const MOTIVOS_MED: Record<MotivoMed, string> = {
  1: 'Admissão',
  2: 'Substituição por dano justificado',
  3: 'Substituição por dano injustificado/perda',
  4: 'Mudança de função/Necessidade primária',
};

/**
 * Motivo sugerido para a ficha inteira: primeira ficha do colaborador é
 * admissão; troca de função em relação à última ficha é mudança de função;
 * o resto é reposição (dano justificado). Cada linha pode ser trocada.
 */
export function motivoPadrao(funcaoAnteriorId: string | null | undefined, funcaoAtualId: string): MotivoMed {
  if (!funcaoAnteriorId) return 1;
  if (funcaoAnteriorId !== funcaoAtualId) return 4;
  return 2;
}

// ---------------------------------------------------------------------------
// Datas — sempre pela string ISO, nunca `new Date('YYYY-MM-DD')` (UTC-3)
// ---------------------------------------------------------------------------

function diaUTC(dataISO: string): number {
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

/** Dias corridos de `deISO` até `ateISO` (positivo quando `ate` é depois). */
export function diasEntre(deISO: string, ateISO: string): number {
  return Math.round((diaUTC(ateISO) - diaUTC(deISO)) / 86_400_000);
}

export function hojeISO(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

export function formatarDataBR(dataISO?: string | null): string {
  if (!dataISO) return '';
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : dataISO;
}

/** "hoje", "ontem", "há 12 dias" — texto do histórico na montagem da ficha. */
export function textoHaQuantosDias(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  return `há ${dias} dias`;
}

// ---------------------------------------------------------------------------
// Cargo do RH → função da matriz EPI por função
// ---------------------------------------------------------------------------

export function normalizarTexto(texto: string | null | undefined): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NIVEL = '(?:IV|V|I{1,3})';
// "SOLDADOR I, II E III" → base "SOLDADOR", níveis I/II/III.
const REGEX_NIVEIS = new RegExp(`^(.*?)\\s+(${NIVEL}(?:\\s*(?:,|\\bE\\b)\\s*${NIVEL})*)$`);

function separarNiveis(nome: string): { base: string; niveis: string[] } {
  const normal = normalizarTexto(nome);
  const achado = normal.match(REGEX_NIVEIS);
  if (!achado) return { base: normal, niveis: [] };
  return { base: achado[1].trim(), niveis: achado[2].split(/\s*(?:,|\bE\b)\s*/).filter(Boolean) };
}

export type ConfiancaFuncao = 'exata' | 'nivel' | 'aproximada';

export interface SugestaoFuncao {
  funcao: SsmaEpiFuncao;
  /**
   * exata: mesmo nome; nivel: a função agrupa o nível do cargo
   * ("SOLDADOR II" em "SOLDADOR I, II E III"); aproximada: mesma base com
   * outro nível ("JATISTA I" → "JATISTA II") — pede conferência.
   */
  confianca: ConfiancaFuncao;
}

/**
 * O RH e a matriz de EPI escrevem o cargo de formas diferentes (acentos,
 * níveis agrupados). A sugestão é só o ponto de partida: a tela sempre pede
 * a confirmação da função.
 */
export function sugerirFuncaoPorCargo(cargo: string | null | undefined, funcoes: SsmaEpiFuncao[]): SugestaoFuncao | null {
  const alvo = normalizarTexto(cargo);
  if (!alvo) return null;

  const exata = funcoes.find(f => normalizarTexto(f.nome) === alvo);
  if (exata) return { funcao: exata, confianca: 'exata' };

  const cargoPartes = separarNiveis(alvo);
  const mesmaBase = funcoes
    .map(funcao => ({ funcao, ...separarNiveis(funcao.nome) }))
    .filter(f => f.base === cargoPartes.base);

  const porNivel = cargoPartes.niveis.length
    ? mesmaBase.find(f => cargoPartes.niveis.every(n => f.niveis.includes(n)))
    : undefined;
  if (porNivel) return { funcao: porNivel.funcao, confianca: 'nivel' };

  if (mesmaBase.length) return { funcao: mesmaBase[0].funcao, confianca: 'aproximada' };
  return null;
}

// ---------------------------------------------------------------------------
// Histórico do colaborador
// ---------------------------------------------------------------------------

export interface ItemHistorico {
  item_id: string;
  grupo_epi: string;
  categoria: string | null;
  epi_book_id: string | null;
  descricao: string;
  tamanho: string | null;
  quantidade: number;
  data_entrega: string;
  codigo_ficha: string;
  data_devolucao: string | null;
}

export function chaveGrupo(categoria: string | null | undefined, grupoEpi: string): string {
  return `${normalizarTexto(categoria)}|${normalizarTexto(grupoEpi)}`;
}

/** Última entrega de cada EPI (por grupo — o tamanho não importa aqui). */
export function ultimaEntregaPorGrupo(historico: ItemHistorico[]): Map<string, ItemHistorico> {
  const ultimas = new Map<string, ItemHistorico>();
  for (const item of historico) {
    const chave = chaveGrupo(item.categoria, item.grupo_epi);
    const atual = ultimas.get(chave);
    if (!atual || item.data_entrega > atual.data_entrega) ultimas.set(chave, item);
  }
  return ultimas;
}

/** Itens entregues antes e ainda não devolvidos, por EPI, mais antigos primeiro. */
export function pendentesDevolucaoPorGrupo(historico: ItemHistorico[]): Map<string, ItemHistorico[]> {
  const pendentes = new Map<string, ItemHistorico[]>();
  for (const item of historico) {
    if (item.data_devolucao) continue;
    const chave = chaveGrupo(item.categoria, item.grupo_epi);
    pendentes.set(chave, [...(pendentes.get(chave) ?? []), item]);
  }
  for (const lista of pendentes.values()) lista.sort((a, b) => a.data_entrega.localeCompare(b.data_entrega));
  return pendentes;
}

// ---------------------------------------------------------------------------
// Linhas da ficha em montagem
// ---------------------------------------------------------------------------

export interface LinhaFicha {
  chave: string;
  requisitoId: string | null;
  classificacao: ClassificacaoEpiFuncao | null;
  condicaoUso: string | null;
  categoria: string | null;
  grupoEpi: string;
  /** Tamanhos/variantes do Book do mesmo EPI; vazio quando não há vínculo. */
  variantes: SsmaBookEpi[];
  epiBookId: string | null;
  descricaoSemBook: string | null;
  caSemBook: string | null;
  incluir: boolean;
  quantidade: number;
  motivo: MotivoMed;
  foraDaMatriz: boolean;
  /** Entregas anteriores deste EPI ainda com o colaborador. */
  pendentesDevolucao: ItemHistorico[];
  /**
   * Na reposição, devolve as entregas pendentes junto com a nova ficha.
   * `null` = ainda não respondido; a resposta é obrigatória para assinar.
   */
  devolverAnteriores: boolean | null;
}

/** A troca só devolve o anterior quando a linha é reposição (motivos 2 e 3). */
export function ehReposicao(motivo: MotivoMed): boolean {
  return motivo === 2 || motivo === 3;
}

/** A linha pede a resposta "devolveu o anterior?" (Sim/Não). */
export function exigeRespostaDevolucao(linha: Pick<LinhaFicha, 'incluir' | 'motivo' | 'pendentesDevolucao'>): boolean {
  return linha.incluir && ehReposicao(linha.motivo) && linha.pendentesDevolucao.length > 0;
}

/** Linhas de reposição sem resposta de devolução — bloqueiam a assinatura. */
export function linhasSemRespostaDevolucao<T extends Pick<LinhaFicha, 'incluir' | 'motivo' | 'pendentesDevolucao' | 'devolverAnteriores'>>(linhas: T[]): T[] {
  return linhas.filter(l => exigeRespostaDevolucao(l) && l.devolverAnteriores === null);
}

function variantesDoGrupo(book: SsmaBookEpi[], categoria: string, grupoEpi: string): SsmaBookEpi[] {
  const chave = chaveGrupo(categoria, grupoEpi);
  return book
    .filter(item => item.ativo && chaveGrupo(item.categoria, item.grupo_epi) === chave)
    .sort((a, b) => (a.tamanho || '').localeCompare(b.tamanho || '', 'pt-BR', { numeric: true }));
}

/** Prefere o tamanho que o colaborador já usou; senão, a variante da matriz. */
function varianteInicial(variantes: SsmaBookEpi[], preferidaId: string | null, ultima?: ItemHistorico): string | null {
  if (ultima?.epi_book_id && variantes.some(v => v.id === ultima.epi_book_id)) return ultima.epi_book_id;
  if (preferidaId && variantes.some(v => v.id === preferidaId)) return preferidaId;
  return variantes[0]?.id ?? preferidaId;
}

/**
 * Lista inicial da ficha a partir da matriz da função. Básicos e específicos
 * entram marcados; os condicionais por exposição aparecem desmarcados, para o
 * técnico decidir. Requisitos que caem no mesmo EPI viram uma linha só.
 */
export function montarLinhasFicha(params: {
  requisitos: SsmaEpiPorFuncao[];
  book: SsmaBookEpi[];
  historico: ItemHistorico[];
  motivo: MotivoMed;
}): LinhaFicha[] {
  const ultimas = ultimaEntregaPorGrupo(params.historico);
  const pendentes = pendentesDevolucaoPorGrupo(params.historico);
  const linhas: LinhaFicha[] = [];
  const vistos = new Set<string>();

  for (const requisito of params.requisitos) {
    if (!requisito.ativo) continue;
    const epi = requisito.epi_book ?? params.book.find(b => b.id === requisito.epi_book_id) ?? null;
    const categoria = epi?.categoria ?? null;
    const grupoEpi = epi?.grupo_epi ?? requisito.descricao_epi_origem;
    const chave = chaveGrupo(categoria, grupoEpi);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const variantes = epi ? variantesDoGrupo(params.book, epi.categoria, epi.grupo_epi) : [];
    linhas.push({
      chave,
      requisitoId: requisito.id,
      classificacao: requisito.classificacao,
      condicaoUso: requisito.condicao_uso,
      categoria,
      grupoEpi,
      variantes,
      epiBookId: varianteInicial(variantes, requisito.epi_book_id, ultimas.get(chave)),
      descricaoSemBook: epi ? null : requisito.descricao_epi_origem,
      caSemBook: epi ? null : requisito.ca_origem,
      incluir: requisito.classificacao !== 'CONDICIONAL_POR_EXPOSICAO',
      quantidade: 1,
      motivo: params.motivo,
      foraDaMatriz: false,
      pendentesDevolucao: pendentes.get(chave) ?? [],
      devolverAnteriores: null,
    });
  }
  return linhas;
}

/** Linha avulsa, escolhida no Book, fora da matriz da função. */
export function linhaAvulsa(epi: SsmaBookEpi, book: SsmaBookEpi[], historico: ItemHistorico[], motivo: MotivoMed): LinhaFicha {
  const chave = chaveGrupo(epi.categoria, epi.grupo_epi);
  const variantes = variantesDoGrupo(book, epi.categoria, epi.grupo_epi);
  const ultima = ultimaEntregaPorGrupo(historico).get(chave);
  return {
    chave,
    requisitoId: null,
    classificacao: null,
    condicaoUso: null,
    categoria: epi.categoria,
    grupoEpi: epi.grupo_epi,
    variantes: variantes.length ? variantes : [epi],
    epiBookId: ultima?.epi_book_id && variantes.some(v => v.id === ultima.epi_book_id) ? ultima.epi_book_id : epi.id,
    descricaoSemBook: null,
    caSemBook: null,
    incluir: true,
    quantidade: 1,
    motivo,
    foraDaMatriz: true,
    pendentesDevolucao: pendentesDevolucaoPorGrupo(historico).get(chave) ?? [],
    devolverAnteriores: null,
  };
}

export interface ItemFichaPayload {
  epi_book_id: string | null;
  requisito_id: string | null;
  grupo_epi: string;
  categoria: string | null;
  descricao: string;
  ca: string | null;
  codigo_sap: string | null;
  tamanho: string | null;
  quantidade: number;
  motivo: MotivoMed;
  fora_da_matriz: boolean;
  /** Itens de fichas anteriores devolvidos na troca, com a data desta entrega. */
  devolver_item_ids: string[];
}

/** Converte as linhas marcadas no snapshot gravado na ficha. */
export function linhasParaPayload(linhas: LinhaFicha[]): ItemFichaPayload[] {
  return linhas
    .filter(linha => linha.incluir && linha.quantidade > 0)
    .map(linha => {
      const epi = linha.variantes.find(v => v.id === linha.epiBookId) ?? null;
      return {
        epi_book_id: epi?.id ?? null,
        requisito_id: linha.requisitoId,
        grupo_epi: linha.grupoEpi,
        categoria: linha.categoria,
        descricao: epi ? descricaoItemEpi(epi) : linha.descricaoSemBook || linha.grupoEpi,
        ca: epi?.ca || linha.caSemBook || null,
        codigo_sap: epi?.codigo_sap ?? null,
        tamanho: epi?.tamanho ?? null,
        quantidade: linha.quantidade,
        motivo: linha.motivo,
        fora_da_matriz: linha.foraDaMatriz,
        devolver_item_ids: linha.devolverAnteriores === true && ehReposicao(linha.motivo)
          ? linha.pendentesDevolucao.map(p => p.item_id)
          : [],
      };
    });
}

/** Descrição impressa na coluna DESCRIÇÃO: EPI + tamanho, quando houver. */
export function descricaoItemEpi(epi: Pick<SsmaBookEpi, 'descricao_epi' | 'tamanho'>): string {
  const tamanho = epi.tamanho?.trim();
  return tamanho ? `${epi.descricao_epi} - TAM. ${tamanho}` : epi.descricao_epi;
}

// ---------------------------------------------------------------------------
// Grade do formulário (tela e PDF)
// ---------------------------------------------------------------------------

interface FichaParaGrade {
  id: string;
  data_entrega: string;
  status: string;
  created_at: string;
  itens: Array<{
    id: string;
    ordem: number;
    ca: string | null;
    quantidade: number;
    descricao: string;
    motivo: MotivoMed;
    data_devolucao: string | null;
    devolucao_registrada_por_nome: string | null;
  }>;
}

export interface LinhaGradeFichaEpi {
  itemId: string;
  fichaId: string;
  ca: string;
  quantidade: string;
  descricao: string;
  dataEntrega: string;
  motivo: MotivoMed;
  dataDevolucao: string | null;
  devolucaoPor: string | null;
}

export function formatarQuantidade(qtd: number): string {
  return Number(qtd).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Linhas da tabela RETIRADA/DEVOLUÇÃO, da entrega mais antiga para a mais
 * recente, como a ficha em papel é preenchida. Fichas canceladas ficam fora.
 */
export function linhasGradeFichaEpi(fichas: FichaParaGrade[]): LinhaGradeFichaEpi[] {
  return fichas
    .filter(f => f.status !== 'CANCELADA')
    .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega) || a.created_at.localeCompare(b.created_at))
    .flatMap(f => [...f.itens].sort((a, b) => a.ordem - b.ordem).map(item => ({
      itemId: item.id,
      fichaId: f.id,
      ca: item.ca || '',
      quantidade: formatarQuantidade(item.quantidade),
      descricao: item.descricao,
      dataEntrega: f.data_entrega,
      motivo: item.motivo,
      dataDevolucao: item.data_devolucao,
      devolucaoPor: item.devolucao_registrada_por_nome,
    })));
}

// ---------------------------------------------------------------------------
// Análise de consumo
// ---------------------------------------------------------------------------

/** Uma linha da view `ssma_fichas_epi_consumo`. */
export interface LinhaConsumo {
  item_id: string;
  ficha_id: string;
  pessoa_id: string;
  registro: string;
  nome: string;
  setor: string | null;
  funcao_id: string;
  funcao_nome: string;
  data_entrega: string;
  grupo_epi: string;
  categoria: string | null;
  quantidade: number;
  motivo: MotivoMed;
  fora_da_matriz: boolean;
  data_devolucao: string | null;
}

export interface ConsumoPorEpi {
  chave: string;
  grupoEpi: string;
  categoria: string | null;
  unidades: number;
  entregas: number;
  colaboradores: number;
  perdas: number;
  /** Mediana de dias entre reposições do mesmo colaborador. */
  duracaoMedianaDias: number | null;
  amostrasDuracao: number;
}

export interface DuracaoFuncaoEpi {
  funcaoId: string;
  funcaoNome: string;
  chave: string;
  grupoEpi: string;
  medianaDias: number;
  minimoDias: number;
  maximoDias: number;
  amostras: number;
}

export interface ConsumoPorColaborador {
  pessoaId: string;
  nome: string;
  registro: string;
  funcaoNome: string;
  setor: string | null;
  unidades: number;
  entregas: number;
  tiposEpi: number;
  perdas: number;
  /** Reposições feitas em menos da metade da duração mediana da função. */
  trocasPrecoces: number;
  ultimaEntrega: string;
}

export interface AnaliseConsumo {
  resumo: {
    fichas: number;
    colaboradores: number;
    unidades: number;
    tiposEpi: number;
    unidadesPerda: number;
    percentualPerda: number;
    unidadesForaDaMatriz: number;
    duracaoMedianaGeral: number | null;
  };
  porEpi: ConsumoPorEpi[];
  duracaoPorFuncao: DuracaoFuncaoEpi[];
  porColaborador: ConsumoPorColaborador[];
  porMes: { mes: string; unidades: number; perdas: number }[];
  porFuncao: { funcaoId: string; funcaoNome: string; unidades: number; colaboradores: number; unidadesPorColaborador: number }[];
  porSetor: { setor: string; unidades: number; colaboradores: number }[];
  porMotivo: { motivo: MotivoMed; rotulo: string; unidades: number }[];
}

/** Mínimo de reposições para uma mediana de duração servir de referência. */
export const AMOSTRAS_MINIMAS_DURACAO = 3;

export function mediana(valores: number[]): number | null {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : Math.round((ordenados[meio - 1] + ordenados[meio]) / 2);
}

interface Intervalo {
  /** Item da entrega de reposição (a segunda do par). */
  itemId: string;
  pessoaId: string;
  funcaoId: string;
  funcaoNome: string;
  chave: string;
  grupoEpi: string;
  dias: number;
}

/**
 * Duração de um EPI = dias entre duas entregas consecutivas do mesmo EPI ao
 * mesmo colaborador, quando a segunda é reposição (motivo 2 ou 3). Admissão e
 * mudança de função não medem desgaste e ficam de fora.
 */
export function intervalosDeReposicao(linhas: LinhaConsumo[]): Intervalo[] {
  const porPessoaGrupo = new Map<string, LinhaConsumo[]>();
  for (const linha of linhas) {
    const chave = `${linha.pessoa_id}#${chaveGrupo(linha.categoria, linha.grupo_epi)}`;
    const lista = porPessoaGrupo.get(chave) ?? [];
    lista.push(linha);
    porPessoaGrupo.set(chave, lista);
  }

  const intervalos: Intervalo[] = [];
  for (const lista of porPessoaGrupo.values()) {
    // Duas linhas no mesmo dia (tamanhos diferentes, fichas duplicadas) são
    // uma entrega só para medir duração.
    const datas = [...new Map(lista.map(l => [l.data_entrega, l])).values()]
      .sort((a, b) => a.data_entrega.localeCompare(b.data_entrega));
    for (let i = 1; i < datas.length; i++) {
      const atual = datas[i];
      if (atual.motivo !== 2 && atual.motivo !== 3) continue;
      const dias = diasEntre(datas[i - 1].data_entrega, atual.data_entrega);
      if (dias <= 0) continue;
      intervalos.push({
        itemId: atual.item_id,
        pessoaId: atual.pessoa_id,
        funcaoId: atual.funcao_id,
        funcaoNome: atual.funcao_nome,
        chave: chaveGrupo(atual.categoria, atual.grupo_epi),
        grupoEpi: atual.grupo_epi,
        dias,
      });
    }
  }
  return intervalos;
}

function somar<T>(mapa: Map<string, T>, chave: string, criar: () => T, aplicar: (item: T) => void) {
  const item = mapa.get(chave) ?? criar();
  aplicar(item);
  mapa.set(chave, item);
}

/**
 * Consolida a análise do período. As durações usam `historicoCompleto`
 * (quando informado) para não perder a entrega anterior que caiu antes do
 * início do filtro; os totais usam só as linhas do período.
 */
export function analisarConsumo(linhas: LinhaConsumo[], historicoCompleto: LinhaConsumo[] = linhas): AnaliseConsumo {
  // Conta só as reposições que caíram no período, mas procura a entrega
  // anterior no histórico todo.
  const idsPeriodo = new Set(linhas.map(l => l.item_id));
  const intervalosPeriodo = intervalosDeReposicao(historicoCompleto).filter(i => idsPeriodo.has(i.itemId));

  // Duração por função × EPI
  const duracoes = new Map<string, Intervalo[]>();
  for (const intervalo of intervalosPeriodo) {
    somar(duracoes, `${intervalo.funcaoId}#${intervalo.chave}`, () => [] as Intervalo[], lista => lista.push(intervalo));
  }
  const duracaoPorFuncao: DuracaoFuncaoEpi[] = [...duracoes.values()].map(lista => {
    const dias = lista.map(i => i.dias);
    return {
      funcaoId: lista[0].funcaoId,
      funcaoNome: lista[0].funcaoNome,
      chave: lista[0].chave,
      grupoEpi: lista[0].grupoEpi,
      medianaDias: mediana(dias) ?? 0,
      minimoDias: Math.min(...dias),
      maximoDias: Math.max(...dias),
      amostras: dias.length,
    };
  }).sort((a, b) => a.funcaoNome.localeCompare(b.funcaoNome, 'pt-BR') || a.medianaDias - b.medianaDias);

  const referenciaDuracao = new Map(
    duracaoPorFuncao
      .filter(d => d.amostras >= AMOSTRAS_MINIMAS_DURACAO)
      .map(d => [`${d.funcaoId}#${d.chave}`, d.medianaDias]),
  );
  const precocesPorPessoa = new Map<string, number>();
  for (const intervalo of intervalosPeriodo) {
    const referencia = referenciaDuracao.get(`${intervalo.funcaoId}#${intervalo.chave}`);
    if (referencia && intervalo.dias < referencia / 2) {
      precocesPorPessoa.set(intervalo.pessoaId, (precocesPorPessoa.get(intervalo.pessoaId) ?? 0) + 1);
    }
  }

  // Por EPI
  const porEpiMapa = new Map<string, ConsumoPorEpi & { _pessoas: Set<string>; _fichas: Set<string> }>();
  for (const linha of linhas) {
    const chave = chaveGrupo(linha.categoria, linha.grupo_epi);
    somar(porEpiMapa, chave, () => ({
      chave, grupoEpi: linha.grupo_epi, categoria: linha.categoria, unidades: 0, entregas: 0, colaboradores: 0,
      perdas: 0, duracaoMedianaDias: null, amostrasDuracao: 0, _pessoas: new Set<string>(), _fichas: new Set<string>(),
    }), item => {
      item.unidades += Number(linha.quantidade);
      item._fichas.add(linha.ficha_id);
      item._pessoas.add(linha.pessoa_id);
      if (linha.motivo === 3) item.perdas += Number(linha.quantidade);
    });
  }
  const porEpi: ConsumoPorEpi[] = [...porEpiMapa.values()].map(({ _pessoas, _fichas, ...item }) => {
    const dias = intervalosPeriodo.filter(i => i.chave === item.chave).map(i => i.dias);
    return { ...item, entregas: _fichas.size, colaboradores: _pessoas.size, duracaoMedianaDias: mediana(dias), amostrasDuracao: dias.length };
  }).sort((a, b) => b.unidades - a.unidades);

  // Por colaborador
  const porPessoaMapa = new Map<string, ConsumoPorColaborador & { _fichas: Set<string>; _tipos: Set<string> }>();
  for (const linha of linhas) {
    somar(porPessoaMapa, linha.pessoa_id, () => ({
      pessoaId: linha.pessoa_id, nome: linha.nome, registro: linha.registro, funcaoNome: linha.funcao_nome, setor: linha.setor,
      unidades: 0, entregas: 0, tiposEpi: 0, perdas: 0, trocasPrecoces: 0, ultimaEntrega: linha.data_entrega,
      _fichas: new Set<string>(), _tipos: new Set<string>(),
    }), item => {
      item.unidades += Number(linha.quantidade);
      item._fichas.add(linha.ficha_id);
      item._tipos.add(chaveGrupo(linha.categoria, linha.grupo_epi));
      if (linha.motivo === 3) item.perdas += Number(linha.quantidade);
      if (linha.data_entrega >= item.ultimaEntrega) {
        item.ultimaEntrega = linha.data_entrega;
        item.funcaoNome = linha.funcao_nome;
        item.setor = linha.setor;
      }
    });
  }
  const porColaborador: ConsumoPorColaborador[] = [...porPessoaMapa.values()].map(({ _fichas, _tipos, ...item }) => ({
    ...item, entregas: _fichas.size, tiposEpi: _tipos.size, trocasPrecoces: precocesPorPessoa.get(item.pessoaId) ?? 0,
  })).sort((a, b) => b.unidades - a.unidades || b.tiposEpi - a.tiposEpi);

  // Séries e recortes
  const porMesMapa = new Map<string, { mes: string; unidades: number; perdas: number }>();
  const porFuncaoMapa = new Map<string, { funcaoId: string; funcaoNome: string; unidades: number; _pessoas: Set<string> }>();
  const porSetorMapa = new Map<string, { setor: string; unidades: number; _pessoas: Set<string> }>();
  const porMotivoMapa = new Map<MotivoMed, number>();
  for (const linha of linhas) {
    const qtd = Number(linha.quantidade);
    somar(porMesMapa, linha.data_entrega.slice(0, 7), () => ({ mes: linha.data_entrega.slice(0, 7), unidades: 0, perdas: 0 }), item => {
      item.unidades += qtd;
      if (linha.motivo === 3) item.perdas += qtd;
    });
    somar(porFuncaoMapa, linha.funcao_id, () => ({ funcaoId: linha.funcao_id, funcaoNome: linha.funcao_nome, unidades: 0, _pessoas: new Set<string>() }), item => {
      item.unidades += qtd;
      item._pessoas.add(linha.pessoa_id);
    });
    const setor = linha.setor?.trim() || 'Sem setor';
    somar(porSetorMapa, setor, () => ({ setor, unidades: 0, _pessoas: new Set<string>() }), item => {
      item.unidades += qtd;
      item._pessoas.add(linha.pessoa_id);
    });
    porMotivoMapa.set(linha.motivo, (porMotivoMapa.get(linha.motivo) ?? 0) + qtd);
  }

  const unidades = linhas.reduce((soma, l) => soma + Number(l.quantidade), 0);
  const unidadesPerda = linhas.filter(l => l.motivo === 3).reduce((soma, l) => soma + Number(l.quantidade), 0);

  return {
    resumo: {
      fichas: new Set(linhas.map(l => l.ficha_id)).size,
      colaboradores: porColaborador.length,
      unidades,
      tiposEpi: porEpi.length,
      unidadesPerda,
      percentualPerda: unidades ? unidadesPerda / unidades : 0,
      unidadesForaDaMatriz: linhas.filter(l => l.fora_da_matriz).reduce((soma, l) => soma + Number(l.quantidade), 0),
      duracaoMedianaGeral: mediana(intervalosPeriodo.map(i => i.dias)),
    },
    porEpi,
    duracaoPorFuncao,
    porColaborador,
    porMes: [...porMesMapa.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    porFuncao: [...porFuncaoMapa.values()].map(({ _pessoas, ...item }) => ({
      ...item, colaboradores: _pessoas.size, unidadesPorColaborador: _pessoas.size ? item.unidades / _pessoas.size : 0,
    })).sort((a, b) => b.unidades - a.unidades),
    porSetor: [...porSetorMapa.values()].map(({ _pessoas, ...item }) => ({ ...item, colaboradores: _pessoas.size }))
      .sort((a, b) => b.unidades - a.unidades),
    porMotivo: ([1, 2, 3, 4] as MotivoMed[]).map(motivo => ({ motivo, rotulo: MOTIVOS_MED[motivo], unidades: porMotivoMapa.get(motivo) ?? 0 })),
  };
}

/** Colaboradores ativos do RH que nunca receberam ficha de EPI. */
export function colaboradoresSemFicha<T extends { id: string }>(pessoasAtivas: T[], pessoasComFicha: Iterable<string>): T[] {
  const comFicha = new Set(pessoasComFicha);
  return pessoasAtivas.filter(p => !comFicha.has(p.id));
}

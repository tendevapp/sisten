/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — vocabulário do módulo.
 *
 * Fabricação de 69 torres de 5 tramos cada (GW Jacobina). O que a fábrica
 * rastreia é a série física do tramo — `T1-3143` —, que corre sequencial pelo
 * projeto inteiro; cada torre consome 5 séries consecutivas. Tudo que depende
 * dessa aritmética mora aqui, não espalhado pelas telas.
 */

import { gerarCodigoFormulario, proximoIndiceCodigo } from './codigosFormulario';

export const PROJETO_PADRAO = 'GW_JACOBINA';

export type Tramo = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

/**
 * A ordem importa: é a fila de prioridade do rateio em cascata. Um parafuso
 * que serve T1 e T5 é alocado primeiro ao T1, porque montar 9 kits de T1 e
 * nenhum de T5 não produz torre nenhuma.
 */
export const TRAMOS: Tramo[] = ['T1', 'T2', 'T3', 'T4', 'T5'];

/** Primeira série do projeto. Torre 1 = séries 3143..3147. */
export const SERIE_INICIAL = 3143;
export const TRAMOS_POR_TORRE = 5;

export type StatusTramo = 'pendente' | 'em_premontagem' | 'kit_pronto' | 'entregue';
export type StatusKit = 'em_premontagem' | 'pronto' | 'entregue';
export type StatusOrdem = 'em_processamento' | 'concluida' | 'cancelada';

export type MotivoSobressalente =
  | 'quebra_montagem'
  | 'deformacao_solda'
  | 'nc_fornecedor'
  | 'perda_extravio'
  | 'divergencia_bom'
  | 'divergencia_pagamento'
  | 'outros';

export const MOTIVOS_SOBRESSALENTE: { id: MotivoSobressalente; rotulo: string }[] = [
  { id: 'quebra_montagem', rotulo: 'Quebra na montagem' },
  { id: 'deformacao_solda', rotulo: 'Deformação / solda' },
  { id: 'nc_fornecedor', rotulo: 'Não-conformidade do fornecedor' },
  { id: 'perda_extravio', rotulo: 'Perda / extravio' },
  { id: 'divergencia_bom', rotulo: 'Divergência BOM' },
  { id: 'divergencia_pagamento', rotulo: 'Divergência de pagamento' },
  { id: 'outros', rotulo: 'Outros' },
];

export const ROTULO_MOTIVO: Record<MotivoSobressalente, string> = MOTIVOS_SOBRESSALENTE.reduce(
  (acc, m) => ({ ...acc, [m.id]: m.rotulo }),
  {} as Record<MotivoSobressalente, string>,
);

/**
 * Estados de uma célula da matriz de progresso. `disponivel_separar` não é
 * gravado no banco: é derivado (o tramo está pendente E há saldo para o
 * romaneio inteiro). Guardá-lo seria guardar uma conta que muda a cada
 * entrada de NF.
 */
export type EstadoCelula = StatusTramo | 'disponivel_separar';

export const ROTULO_ESTADO: Record<EstadoCelula, string> = {
  pendente: 'Pendente peças',
  disponivel_separar: 'Disponível para separar',
  em_premontagem: 'Em pré-montagem',
  kit_pronto: 'Kit pronto no buffer',
  entregue: 'Entregue à produção',
};

/** Tokens de cor por estado, na paleta do app (ver src/styles). */
export const COR_ESTADO: Record<EstadoCelula, string> = {
  pendente: 'var(--abc-c)',
  disponivel_separar: 'var(--series-3)',
  em_premontagem: 'var(--abc-b)',
  kit_pronto: 'var(--series-1)',
  entregue: 'var(--abc-a)',
};

/** `T1` → `S1`. A BOM fala em seção, o chão de fábrica fala em tramo. */
export const secaoDoTramo = (tramo: string): string => `S${String(tramo).replace(/\D/g, '')}`;

/** `S3` → `T3`. */
export const tramoDaSecao = (secao?: string | null): Tramo | null => {
  const n = String(secao ?? '').replace(/\D/g, '');
  return n && TRAMOS.includes(`T${n}` as Tramo) ? (`T${n}` as Tramo) : null;
};

/**
 * Chave de estoque do item.
 *
 * A planilha de origem escreve o mesmo part number de formas diferentes —
 * `403.000.458` e `4.0300.0458`, `10.474.065` e `10474065`. Sem normalizar,
 * o saldo do mesmo parafuso ficaria dividido em duas linhas.
 *
 * Espelha `proj_normalizar_pn` no banco; as duas precisam concordar.
 */
export const normalizarPartNumber = (pn?: string | null): string =>
  String(pn ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/** `ESCADA` e `Escada de acesso` convivem na BOM; a comparação usa esta forma. */
export const normalizarGrupo = (grupo?: string | null): string =>
  String(grupo ?? '').trim().toUpperCase();

/** `Qindao`, `QINDAO` e `atlanta` convivem na coluna `source`. */
export const normalizarFornecedor = (f?: string | null): string => {
  const limpo = String(f ?? '').trim();
  if (!limpo) return '';
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
};

/** `T1-3143` → `KIT-T1-3143`. É a identidade física do kit, impressa na etiqueta. */
export const rastreioKit = (tramoUnidadeId: string): string => `KIT-${tramoUnidadeId}`;

/** Série 3143 → torre 1; 3148 → torre 2. */
export const torreDaSerie = (serie: number): number =>
  Math.floor((serie - SERIE_INICIAL) / TRAMOS_POR_TORRE) + 1;

/** Série 3147 → `T5`. */
export const tramoDaSerie = (serie: number): Tramo =>
  `T${((serie - SERIE_INICIAL) % TRAMOS_POR_TORRE) + 1}` as Tramo;

/** Monta o id da unidade de tramo a partir da série. */
export const idTramoDaSerie = (serie: number): string => `${tramoDaSerie(serie)}-${serie}`;

// ---------------------------------------------------------------------------
// Códigos de formulário — regra 2 do CLAUDE.md: `MODULO-DDMMYY-INDICE`.
// ---------------------------------------------------------------------------

/**
 * Prefixos dos cinco formulários. O índice reinicia POR DIA: movimento de
 * almoxarifado é diário, e um sequencial mensal chegaria a três dígitos sem
 * dizer nada ao conferente que procura "a segunda nota de hoje".
 */
export const PREFIXO = {
  entrada: 'ENP',
  ordem: 'OPM',
  kit: 'KIT',
  entrega: 'EPR',
  sobressalente: 'SOB',
} as const;

export type PrefixoFormulario = (typeof PREFIXO)[keyof typeof PREFIXO];

/**
 * Próximo código do dia a partir dos que já estão gravados.
 * Passe apenas os códigos DAQUELE dia — o recorte é do módulo, não da função.
 */
export function proximoCodigoDoDia(
  prefixo: PrefixoFormulario,
  codigosDoDia: (string | null | undefined)[],
  dataISO?: string | null,
): string {
  return gerarCodigoFormulario(prefixo, dataISO, proximoIndiceCodigo(prefixo, codigosDoDia));
}

/** Data de hoje em `YYYY-MM-DD` no fuso local (não em UTC, que vira o dia anterior). */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

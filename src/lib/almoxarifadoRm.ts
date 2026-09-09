/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Abrir RM — tradução de uma solicitação de compra aprovada
 * para a planilha padrão de abertura de RM no SAP.
 *
 * A planilha é uma linha por item, repetindo as colunas de cabeçalho. Tudo
 * que é regra de conversão (depósito, classificação, requisitante, texto de
 * cabeçalho) mora aqui, sem React e sem Supabase, porque é isto que precisa
 * de teste: o resto da tela é seleção e download.
 */

import * as XLSX from 'xlsx';
import type { Request, RequestItem, Sector } from '../types';

/* Constantes da planilha ---------------------------------------------------
 *
 * Valores fixos enquanto não houver cadastro para eles. O centro é o único da
 * operação; o grupo de compras 575 é o combinado provisório; a categoria de
 * remessa D vale para toda RM aberta por aqui.
 */

/** Centro (NAME1). A operação tem um só. */
export const RM_CENTRO = 'TEN2';

/**
 * Grupo de compras (EKGRP) de recurso, para quando o cadastro não responde.
 *
 * O valor certo vem do comprador responsável pelo grupo de mercadorias do
 * material (`sup_grupo_comprador_mercadorias`, ver `grupoComprasRm`). Só cai
 * aqui quando falta o elo: item sem código SAP, material fora do catálogo, ou
 * grupo de mercadorias ainda sem comprador vinculado. A tela conta esses
 * casos e avisa antes de exportar — a linha sai preenchida em vez de vazia
 * porque uma RM sem EKGRP não entra no SAP de jeito nenhum.
 */
export const RM_GRUPO_COMPRAS_PADRAO = '575';

/** Categoria de remessa (ELPEI). Sempre D nas RMs abertas por esta tela. */
export const RM_CAT_REMESSA = 'D';

/** Depósito (LGOBE) de compra para estoque. */
export const RM_DEPOSITO_ESTOQUE = '0001';

/** Depósito (LGOBE) de compra direta — inclui serviço, que não estoca. */
export const RM_DEPOSITO_DIRETA = '0050';

/**
 * Cabeçalho da planilha, na ordem em que o time do almoxarifado usa hoje.
 * A ordem importa: quem recebe a planilha lê por posição, não por nome.
 */
export const RM_COLUNAS = [
  'ID Req',
  'Classificação',
  'Item',
  'Material (MATNR)',
  'Quantidade (MENGE)',
  'Depósito (LGOBE)',
  'Centro (NAME1)',
  'Grupo Compras (EKGRP)',
  'Requisitante (AFNAM)',
  'Campo Z (ZZKOKRS)',
  'Cat. Remessa (ELPEI)',
  'Texto Cabeçalho (Justificativa)',
  'Status / Nº da RM',
] as const;

export type ColunaRm = (typeof RM_COLUNAS)[number];
export type LinhaRm = Record<ColunaRm, string | number>;

/* Regras de conversão ------------------------------------------------------ */

/**
 * Tira acento e deixa em caixa alta.
 *
 * Os campos de texto curto do SAP (AFNAM, ZZKOKRS) são caixa alta e mal
 * resolvem acento; melhor mandar JOSE do que ver JOS? do outro lado.
 */
export function normalizarSap(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase();
}

/** Depósito (LGOBE): compra de estoque vai para 0001, o resto para 0050. */
export function depositoRm(tipoCompra?: string | null): string {
  return (tipoCompra || '').trim().toLowerCase() === 'estoque'
    ? RM_DEPOSITO_ESTOQUE
    : RM_DEPOSITO_DIRETA;
}

/** Classificação: criticidade 1–3 é Normal, 4–5 é Urgente. */
export function classificacaoRm(criticidade?: number | null): 'Normal' | 'Urgente' {
  return (criticidade ?? 0) >= 4 ? 'Urgente' : 'Normal';
}

/** Requisitante (AFNAM): primeiro nome de quem abriu a solicitação, em caixa alta. */
export function requisitanteRm(nome?: string | null): string {
  const primeiro = (nome || '').trim().split(/\s+/)[0] || '';
  return normalizarSap(primeiro);
}

/**
 * Campo Z (ZZKOKRS): a área do setor solicitante em até 4 letras.
 *
 * Usa o código SAP do setor quando ele está cadastrado (`sap_area_code`, que
 * é justamente esse código de quatro letras); sem ele, cai para as quatro
 * primeiras letras do nome do setor. O corte ignora espaço e pontuação, para
 * "Rec. Humanos" virar RECH e não "REC.".
 */
export function campoZRm(setor?: Sector | null): string {
  const codigo = setor?.sap_area_code?.trim();
  if (codigo) return normalizarSap(codigo).slice(0, 4);
  const letras = normalizarSap(setor?.name || '').replace(/[^A-Z0-9]/g, '');
  return letras.slice(0, 4);
}

/**
 * Texto de cabeçalho: "#NÚMERO - JUSTIFICATIVA" mais as observações de item,
 * cada uma como " -Item N OBSERVAÇÃO;".
 *
 * O número entra no texto porque a RM no SAP não guarda vínculo com a
 * solicitação do SISTEN — esse "#" é o único fio que liga as duas pontas
 * quando alguém for conferir depois.
 */
export function textoCabecalhoRm(request: Request, itens: RequestItem[]): string {
  // Só o texto vindo do usuário passa por `normalizarSap`: o rótulo "-Item N"
  // é do formato da planilha e continua como está escrito aqui.
  const base = `#${request.number} - ${normalizarSap((request.justificativa || '').trim())}`.trim();
  const observacoes = itens
    .map((it, idx) => ({ pos: (idx + 1) * 10, obs: normalizarSap((it.observation || '').trim()) }))
    .filter(o => o.obs)
    .map(o => ` -Item ${o.pos} ${o.obs};`)
    .join('');
  return `${base}${observacoes}`;
}

/* Montagem das linhas ------------------------------------------------------ */

/** Solicitação já casada com os seus itens, como a tela carrega. */
export interface SolicitacaoRm {
  request: Request;
  itens: RequestItem[];
}

/**
 * Os cadastros de que a planilha depende.
 *
 * São dois saltos até o comprador: o material diz em que grupo de mercadorias
 * ele está (catálogo SAP) e o grupo de mercadorias diz quem é o comprador
 * responsável (`sup_grupo_comprador_mercadorias`). Vêm como Map já pronto
 * porque quem monta a planilha percorre centenas de itens e não pode varrer o
 * catálogo inteiro a cada linha.
 */
export interface ContextoRm {
  sectors: Sector[];
  /** Código SAP do material (MATNR) → código do grupo de mercadorias. */
  grupoMercadoriaPorMaterial: Map<string, string>;
  /** Código do grupo de mercadorias → grupo de compras (EKGRP) do responsável. */
  grupoComprasPorMercadoria: Map<string, string>;
}

/**
 * Grupo de compras (EKGRP) do item: o comprador responsável pelo grupo de
 * mercadorias daquele material.
 *
 * Devolve `null` quando a corrente se rompe em qualquer elo — é assim que a
 * tela sabe quantos itens vão sair no padrão de recurso e avisa antes.
 */
export function grupoComprasRm(item: RequestItem, ctx: ContextoRm): string | null {
  const matnr = (item.sap_code || '').trim();
  if (!matnr) return null;
  const grupoMercadoria = ctx.grupoMercadoriaPorMaterial.get(matnr);
  if (!grupoMercadoria) return null;
  return ctx.grupoComprasPorMercadoria.get(grupoMercadoria) || null;
}

/**
 * Uma linha por item, na ordem em que as solicitações chegaram.
 *
 * Solicitação sem item não gera linha nenhuma: uma RM sem material não tem o
 * que abrir no SAP. "Status / Nº da RM" sai vazia de propósito — é a coluna
 * que o almoxarifado preenche à mão depois de criar a RM.
 */
export function montarLinhasRm(solicitacoes: SolicitacaoRm[], ctx: ContextoRm): LinhaRm[] {
  const porId = new Map(ctx.sectors.map(s => [s.id, s]));

  return solicitacoes.flatMap(({ request, itens }) => {
    const cabecalho = {
      'ID Req': `#${request.number}`,
      'Classificação': classificacaoRm(request.criticality),
      'Depósito (LGOBE)': depositoRm(request.tipo_compra),
      'Centro (NAME1)': RM_CENTRO,
      'Requisitante (AFNAM)': requisitanteRm(request.solicitante_name),
      'Campo Z (ZZKOKRS)': campoZRm(porId.get(request.solicitante_sector_id)),
      'Cat. Remessa (ELPEI)': RM_CAT_REMESSA,
      'Texto Cabeçalho (Justificativa)': textoCabecalhoRm(request, itens),
      'Status / Nº da RM': '',
    };

    // O grupo de compras é por item, não por solicitação: uma mesma RM pode
    // misturar materiais de compradores diferentes. O número do item segue o
    // padrão SAP com incremento de 10 (10, 20, 30...).
    return itens.map((it, idx): LinhaRm => ({
      ...cabecalho,
      'Item': (idx + 1) * 10,
      'Material (MATNR)': it.sap_code || '',
      'Quantidade (MENGE)': it.quantity,
      'Grupo Compras (EKGRP)': grupoComprasRm(it, ctx) || RM_GRUPO_COMPRAS_PADRAO,
    }));
  });
}

/** Itens sem código SAP: a RM não abre sem MATNR, então a tela avisa antes. */
export function itensSemCodigoSap(solicitacoes: SolicitacaoRm[]): number {
  return solicitacoes.reduce(
    (acc, s) => acc + s.itens.filter(it => !it.sap_code).length,
    0,
  );
}

/**
 * Itens cujo comprador o cadastro não soube dizer — vão sair no
 * `RM_GRUPO_COMPRAS_PADRAO`. Conta só quem tem código SAP: item sem MATNR já
 * é avisado por `itensSemCodigoSap` e não vale um segundo alerta.
 */
export function itensSemGrupoComprador(solicitacoes: SolicitacaoRm[], ctx: ContextoRm): number {
  return solicitacoes.reduce(
    (acc, s) => acc + s.itens.filter(it => it.sap_code && !grupoComprasRm(it, ctx)).length,
    0,
  );
}

/** `abrir_rm_20260906_1432.xlsx` — data e hora para não sobrescrever o anterior. */
export function nomeArquivoRm(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const carimbo =
    `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}` +
    `_${p(agora.getHours())}${p(agora.getMinutes())}`;
  return `abrir_rm_${carimbo}.xlsx`;
}

/** Gera e baixa o XLSX. Devolve o nome do arquivo, que vai para o log. */
export function exportarPlanilhaRm(
  solicitacoes: SolicitacaoRm[],
  ctx: ContextoRm,
): { arquivo: string; linhas: LinhaRm[] } {
  const linhas = montarLinhasRm(solicitacoes, ctx);
  // `header` explícito: sem ele o json_to_sheet ordena pelas chaves do
  // primeiro objeto e as colunas de item cairiam no fim da planilha.
  const ws = XLSX.utils.json_to_sheet(linhas, { header: [...RM_COLUNAS] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'RM');
  const arquivo = nomeArquivoRm();
  XLSX.writeFile(wb, arquivo);
  return { arquivo, linhas };
}

/* Leitura da planilha devolvida com a RM preenchida ------------------------
 *
 * O fluxo de volta: o almoxarife baixa a planilha que exportou daqui, o
 * comprador digita a RM (ou a própria SAP devolve isso) na coluna "Status /
 * Nº da RM", e o arquivo volta para a aba Abertas. Ler esse arquivo é o
 * espelho de `montarLinhasRm` — mesmas colunas, sentido contrário.
 */

/** Resultado de ler de volta uma planilha de RM com a coluna de status preenchida. */
export interface LeituraPlanilhaRm {
  /** Número da solicitação (sem "#") → número de RM lido na primeira linha dela com valor preenchido. */
  porSolicitacao: Map<string, string>;
  /** Total de linhas lidas da planilha, preenchidas ou não. */
  totalLinhas: number;
  /** Linhas com "ID Req" preenchido mas sem número de RM — ainda não têm RM para trazer. */
  linhasSemNumeroRm: number;
  /** Linhas sem "ID Req" nenhum — provavelmente uma planilha de outro formato. */
  linhasSemIdReq: number;
}

/**
 * Lê as linhas de uma planilha já convertida em objetos (`XLSX.utils.sheet_to_json`,
 * chaves = cabeçalho) e extrai o número de RM por solicitação.
 *
 * Uma solicitação pode repetir "ID Req" em várias linhas (uma por item) — só a
 * primeira ocorrência com "Status / Nº da RM" preenchido vale; as demais são
 * a mesma RM redigitada e não mudam nada.
 */
export function lerPlanilhaRmPreenchida(linhas: Record<string, unknown>[]): LeituraPlanilhaRm {
  const porSolicitacao = new Map<string, string>();
  let linhasSemNumeroRm = 0;
  let linhasSemIdReq = 0;

  for (const linha of linhas) {
    const idReqBruto = String(linha['ID Req'] ?? '').trim();
    const numero = idReqBruto.replace(/^#/, '').trim();
    if (!numero) {
      linhasSemIdReq++;
      continue;
    }

    const rm = String(linha['Status / Nº da RM'] ?? '').trim();
    if (!rm) {
      linhasSemNumeroRm++;
      continue;
    }

    if (!porSolicitacao.has(numero)) porSolicitacao.set(numero, rm);
  }

  return { porSolicitacao, totalLinhas: linhas.length, linhasSemNumeroRm, linhasSemIdReq };
}

/**
 * Escolhe a aba a ler de um arquivo de controle de RM.
 *
 * A planilha que o comprador mantém (às vezes um .xlsm com macro) guarda os
 * dados numa aba "BD" — as demais costumam ser painel, gráfico ou a própria
 * macro. Prefere essa aba, comparando sem diferenciar maiúsculas/espaço; se
 * não existir (caso do arquivo simples que esta tela mesma exporta, com uma
 * aba só), cai para a primeira aba do arquivo.
 */
export function escolherAbaRmPreenchida(nomesAbas: string[]): string | null {
  if (nomesAbas.length === 0) return null;
  const bd = nomesAbas.find(n => n.trim().toLowerCase() === 'bd');
  return bd ?? nomesAbas[0];
}

/** O que o valor lido da planilha representa frente ao que a solicitação já tinha. */
export type SituacaoVinculoRm = 'novo' | 'alterado' | 'inalterado';

/**
 * Compara o número de RM já vinculado com o que veio na planilha, para a
 * importação nunca escrever sem necessidade nem apagar em silêncio uma RM
 * diferente da que alguém já tinha digitado.
 */
export function classificarVinculoRm(rmAtual: string | null | undefined, rmNovo: string): SituacaoVinculoRm {
  const atual = (rmAtual || '').trim();
  const novo = rmNovo.trim();
  if (!atual) return 'novo';
  return atual === novo ? 'inalterado' : 'alterado';
}

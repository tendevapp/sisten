/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Requisição no Balcão (FRM.ALM-0014) — regras sem React e
 * sem Supabase: o que pode sair de qual depósito, busca de material e
 * validação das linhas antes de gravar.
 *
 * Só sai material que tem saldo na ZL0024 (`sap_zl0024_stk`) no depósito de
 * saída escolhido. A RPC `alm_req_balcao_salvar` repete a checagem no banco;
 * aqui ela existe para o almoxarife ver o saldo enquanto digita e não
 * descobrir o problema só ao salvar.
 */

import type { EstoqueItem } from '../types';

/** Prefixo do código `RQB-DDMMYY-NN` (índice reinicia por dia — ver a migration). */
export const PREFIXO_REQ_BALCAO = 'RQB';

export type TipoMovimentoBalcao = 'saida' | 'transferencia';

export const ROTULO_TIPO_MOVIMENTO: Record<TipoMovimentoBalcao, string> = {
  saida: 'Saída',
  transferencia: 'Transferência',
};

/** Material com saldo num depósito — o que o seletor de itens oferece. */
export interface MaterialDisponivel {
  material: string;
  descricao: string;
  unidade: string;
  saldo: number;
}

/** Linha em edição no formulário. */
export interface LinhaBalcao {
  material: string;
  descricao: string;
  unidade: string;
  saldo: number;
  quantidade: number;
}

/** Códigos de depósito chegam como '0004' ou '4' — o cadastro usa quatro dígitos. */
export function chaveDeposito(cod?: string | null): string {
  const s = String(cod ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s.toUpperCase();
}

/**
 * Agrupa a posição de estoque em `depósito → material → saldo`, somando
 * linhas repetidas do mesmo material (a ZL0024 pode trazer mais de uma linha
 * por lote/tipo de estoque). Material sem saldo positivo fica de fora.
 */
export function indexarEstoquePorDeposito(estoque: EstoqueItem[]): Map<string, Map<string, MaterialDisponivel>> {
  const porDeposito = new Map<string, Map<string, MaterialDisponivel>>();
  for (const row of estoque) {
    const dep = chaveDeposito(row.deposito);
    const mat = String(row.material ?? '').trim();
    if (!dep || !mat) continue;
    let mapa = porDeposito.get(dep);
    if (!mapa) { mapa = new Map(); porDeposito.set(dep, mapa); }
    const atual = mapa.get(mat);
    const qtd = Number(row.quantidade) || 0;
    if (atual) {
      atual.saldo += qtd;
      if (!atual.descricao && row.txt_breve_material) atual.descricao = row.txt_breve_material;
    } else {
      mapa.set(mat, {
        material: mat,
        descricao: row.txt_breve_material ?? '',
        unidade: row.umb ?? '',
        saldo: qtd,
      });
    }
  }
  for (const [dep, mapa] of porDeposito) {
    for (const [mat, item] of mapa) if (item.saldo <= 0) mapa.delete(mat);
    if (mapa.size === 0) porDeposito.delete(dep);
  }
  return porDeposito;
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Busca por código ou descrição. Todos os termos precisam aparecer (em
 * qualquer ordem) — "disco flap" acha "DISCO FLAP ZIRC 60". Código que começa
 * com o termo vem primeiro, porque o almoxarife costuma digitar o código
 * lido na etiqueta.
 */
export function buscarMateriais(
  disponiveis: Iterable<MaterialDisponivel>,
  termo: string,
  limite = 30,
): MaterialDisponivel[] {
  const termos = normalizar(termo.trim()).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return [];
  const achados: { item: MaterialDisponivel; peso: number }[] = [];
  for (const item of disponiveis) {
    const alvo = normalizar(`${item.material} ${item.descricao}`);
    if (!termos.every((t) => alvo.includes(t))) continue;
    const peso = item.material.startsWith(termos[0]) ? 0 : 1;
    achados.push({ item, peso });
  }
  achados.sort((a, b) => a.peso - b.peso || a.item.descricao.localeCompare(b.item.descricao, 'pt-BR'));
  return achados.slice(0, limite).map((a) => a.item);
}

/** Material com saldo e o depósito onde está — resultado da busca em todos os depósitos. */
export interface MaterialNoDeposito extends MaterialDisponivel {
  deposito: string;
}

/**
 * Busca de material em todos os depósitos — escolher o item define o depósito
 * de saída, sem o almoxarife precisar saber onde ele está. Com
 * `depositoFixo` a busca fica só nele: depois do primeiro item a requisição
 * já tem depósito (uma baixa no SAP sai de um depósito só).
 *
 * Um material em dois depósitos aparece duas vezes, uma por depósito, e o
 * depósito ativo vem antes do inativo.
 */
export function buscarMateriaisEmDepositos(
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>,
  termo: string,
  depositoFixo?: string | null,
  depositoInativo: (dep: string) => boolean = () => false,
  limite = 40,
): MaterialNoDeposito[] {
  const achados: MaterialNoDeposito[] = [];
  for (const [deposito, mapa] of estoquePorDeposito) {
    if (depositoFixo && deposito !== depositoFixo) continue;
    for (const item of buscarMateriais(mapa.values(), termo, limite)) achados.push({ ...item, deposito });
  }
  const t = normalizar(termo.trim()).split(/\s+/)[0] ?? '';
  const peso = (m: MaterialNoDeposito) => (m.material.startsWith(t) ? 0 : 2) + (depositoInativo(m.deposito) ? 1 : 0);
  achados.sort((a, b) =>
    peso(a) - peso(b)
    || a.descricao.localeCompare(b.descricao, 'pt-BR')
    || a.material.localeCompare(b.material)
    || a.deposito.localeCompare(b.deposito));
  return achados.slice(0, limite);
}

/**
 * Adiciona um material à lista. Se já estiver lá, soma a quantidade na linha
 * existente em vez de duplicar — duas linhas do mesmo material viram duas
 * baixas no SAP e confundem a conferência.
 */
export function adicionarLinha(linhas: LinhaBalcao[], item: MaterialDisponivel, quantidade: number): LinhaBalcao[] {
  const i = linhas.findIndex((l) => l.material === item.material);
  if (i >= 0) {
    return linhas.map((l, j) => (j === i ? { ...l, quantidade: l.quantidade + quantidade } : l));
  }
  return [...linhas, { ...item, quantidade }];
}

/** Erro da linha para exibir, ou `null` se está ok. */
export function erroDaLinha(linha: Pick<LinhaBalcao, 'quantidade' | 'saldo'>): string | null {
  if (!(linha.quantidade > 0)) return 'Quantidade precisa ser maior que zero.';
  if (linha.quantidade > linha.saldo) return 'Maior que o saldo na ZL0024.';
  return null;
}

/**
 * Reaplica o saldo do depósito atual sobre as linhas. Usado quando o
 * almoxarife troca o depósito de saída com itens já lançados: material que
 * não existe no novo depósito fica com saldo 0 (e a linha acusa erro) em vez
 * de sumir sem aviso.
 */
export function reaplicarSaldos(
  linhas: LinhaBalcao[],
  disponiveis: Map<string, MaterialDisponivel> | undefined,
): LinhaBalcao[] {
  return linhas.map((l) => ({ ...l, saldo: disponiveis?.get(l.material)?.saldo ?? 0 }));
}

export interface CabecalhoBalcao {
  tipoMovimento: TipoMovimentoBalcao;
  depositoOrigem: string;
  depositoDestino: string;
  colaboradorNome: string;
  aplicacao: string;
}

/** Lista de pendências para salvar; vazia = pode gravar. */
export function validarRequisicao(cab: CabecalhoBalcao, linhas: LinhaBalcao[]): string[] {
  const erros: string[] = [];
  if (!cab.depositoOrigem && linhas.length > 0) erros.push('Depósito de saída não identificado.');
  if (cab.tipoMovimento === 'transferencia' && cab.depositoDestino
      && chaveDeposito(cab.depositoDestino) === chaveDeposito(cab.depositoOrigem)) {
    erros.push('O depósito de destino precisa ser diferente do de saída.');
  }
  if (!cab.colaboradorNome.trim()) erros.push('Informe o colaborador que está retirando.');
  if (!cab.aplicacao.trim()) erros.push('Informe a aplicação (centro de custo / PEP).');
  if (linhas.length === 0) erros.push('Adicione ao menos um item.');
  const comErro = linhas.filter((l) => erroDaLinha(l));
  if (comErro.length > 0) {
    erros.push(`${comErro.length} item(ns) com quantidade inválida ou acima do saldo.`);
  }
  return erros;
}

/** Aplicação = centro de custo (PEP) da lista fixa `alm_balcao_aplicacoes`. */
export interface PepAplicacao {
  wbs: string;
  nome: string;
}

/**
 * Último PEP usado por cada colaborador — pré-preenche a aplicação quando a
 * mesma pessoa volta ao balcão. `requisicoes` deve vir da mais recente para
 * a mais antiga.
 */
export function ultimaAplicacaoPorColaborador(
  requisicoes: { colaborador_id: string | null; aplicacao: string; aplicacao_pep: string | null }[],
): Map<string, PepAplicacao> {
  const mapa = new Map<string, PepAplicacao>();
  for (const r of requisicoes) {
    if (!r.colaborador_id || !r.aplicacao_pep || mapa.has(r.colaborador_id)) continue;
    mapa.set(r.colaborador_id, { wbs: r.aplicacao_pep, nome: r.aplicacao });
  }
  return mapa;
}

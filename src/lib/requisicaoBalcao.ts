/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Requisição no Balcão (FRM.ALM-0014) — regras sem React e
 * sem Supabase: o que pode sair de qual depósito, busca de material,
 * agrupamento por PEP e validação das linhas antes de gravar.
 *
 * O almoxarife visualiza o saldo da ZL0024 (`sap_zl0024_stk`). Itens sem saldo
 * ou com quantidade maior que o estoque são permitidos com aviso de alerta
 * (para suprir defasagens de importação de notas/planilhas), devendo ser
 * confirmados antes do processamento no SAP.
 *
 * Permite múltiplos grupos de PEP em um mesmo formulário RQB.
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
  aplicacao_pep?: string | null;
  aplicacao?: string | null;
  deposito?: string | null;
  deposito_destino?: string | null;
}

/** Grupo de itens associados a um mesmo PEP (saída) ou Destino (transferência). */
export interface GrupoPepBalcao {
  id: string;
  pep?: PepAplicacao | null;
  deposito_destino?: string | null;
  deposito?: string | null;
  itens: LinhaBalcao[];
}

/** Códigos de depósito chegam como '0004' ou '4' — o cadastro usa quatro dígitos. */
export function chaveDeposito(cod?: string | null): string {
  const s = String(cod ?? '').trim();
  return /^\d+$/.test(s) ? s.padStart(4, '0') : s.toUpperCase();
}

/**
 * Agrupa a posição de estoque em `depósito → material → saldo`, somando
 * linhas repetidas do mesmo material (a ZL0024 pode trazer mais de uma linha
 * por lote/tipo de estoque). Por padrão, mantém materiais mesmo com saldo 0
 * para permitir selecionar itens sem saldo.
 */
export function indexarEstoquePorDeposito(
  estoque: EstoqueItem[],
  incluirSemSaldo = true,
): Map<string, Map<string, MaterialDisponivel>> {
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
    if (!incluirSemSaldo) {
      for (const [mat, item] of mapa) if (item.saldo <= 0) mapa.delete(mat);
    }
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
 * Um material em dois depósitos aparece duas vezes, uma por depósito.
 * Materiais com saldo positivo vêm antes dos com saldo <= 0, e depósito ativo
 * vem antes do inativo.
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
  const peso = (m: MaterialNoDeposito) =>
    (m.material.startsWith(t) ? 0 : 2) +
    (depositoInativo(m.deposito) ? 1 : 0) +
    (m.saldo <= 0 ? 10 : 0);
  achados.sort((a, b) =>
    peso(a) - peso(b)
    || a.descricao.localeCompare(b.descricao, 'pt-BR')
    || a.material.localeCompare(b.material)
    || a.deposito.localeCompare(b.deposito));
  return achados.slice(0, limite);
}

/**
 * Adiciona um material à lista. Se já estiver lá, soma a quantidade na linha
 * existente em vez de duplicar.
 */
export function adicionarLinha(linhas: LinhaBalcao[], item: MaterialDisponivel, quantidade: number): LinhaBalcao[] {
  const i = linhas.findIndex((l) => l.material === item.material);
  if (i >= 0) {
    return linhas.map((l, j) => (j === i ? { ...l, quantidade: l.quantidade + quantidade } : l));
  }
  return [...linhas, { ...item, quantidade }];
}

/**
 * Erro impeditivo da linha: quantidade precisa ser positiva.
 * Retorna texto do erro ou `null` se está apta para gravar.
 */
export function erroDaLinha(linha: Pick<LinhaBalcao, 'quantidade'>): string | null {
  if (!(linha.quantidade > 0)) return 'Quantidade precisa ser maior que zero.';
  return null;
}

/**
 * Alerta informativo da linha: saldo zerado ou quantidade superior ao saldo.
 * Não impede gravação (pode ser defasagem na importação da ZL0024), mas
 * deve ser conferido antes da importação no SAP.
 */
export function alertaDaLinha(linha: Pick<LinhaBalcao, 'quantidade' | 'saldo'>): string | null {
  if (linha.saldo <= 0) return 'Item sem saldo na ZL0024.';
  if (linha.quantidade > linha.saldo) return `Qtd (${linha.quantidade}) maior que o saldo (${linha.saldo}).`;
  return null;
}

/**
 * Reaplica o saldo do depósito atual sobre as linhas. Usado quando o
 * almoxarife troca o depósito de saída com itens já lançados: material que
 * não existe no novo depósito fica com saldo 0 em vez de sumir sem aviso.
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
  if (cab.tipoMovimento === 'saida') {
    if (!cab.depositoOrigem && linhas.length > 0) erros.push('Depósito de saída não identificado.');
    if (!cab.aplicacao.trim()) erros.push('Informe a aplicação (centro de custo / PEP).');
  } else if (cab.tipoMovimento === 'transferencia') {
    const semDepOrigem = linhas.some((l) => !l.deposito && !cab.depositoOrigem);
    if (semDepOrigem) erros.push('Depósito de saída não informado em um ou mais itens.');
    const semDepDestino = linhas.some((l) => !l.deposito_destino && !cab.depositoDestino);
    if (semDepDestino) erros.push('Informe o depósito de destino.');

    for (const l of linhas) {
      const dest = chaveDeposito(l.deposito_destino || cab.depositoDestino);
      const orig = chaveDeposito(l.deposito || cab.depositoOrigem);
      if (dest && orig && dest === orig) {
        erros.push('O depósito de destino precisa ser diferente do de saída.');
        break;
      }
    }
  }
  if (!cab.colaboradorNome.trim()) erros.push('Informe o colaborador que está retirando.');
  if (linhas.length === 0) erros.push('Adicione ao menos um item.');
  const comErro = linhas.filter((l) => erroDaLinha(l));
  if (comErro.length > 0) {
    erros.push(`${comErro.length} item(ns) com quantidade inválida (deve ser maior que zero).`);
  }
  return erros;
}

/** Retorna lista de alertas de saldo das linhas para confirmação do usuário. */
export function alertasRequisicao(linhas: LinhaBalcao[]): string[] {
  const avisos: string[] = [];
  const comAlerta = linhas.filter((l) => alertaDaLinha(l));
  if (comAlerta.length > 0) {
    avisos.push(`${comAlerta.length} item(ns) sem saldo na ZL0024 ou com quantidade superior.`);
  }
  return avisos;
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

// ===========================================================================
// Gerenciamento de Grupos (PEP em Saída / Destino em Transferência)
// ===========================================================================

export function criarGrupoPep(
  pepOuId?: PepAplicacao | string | null,
  pepSeId?: PepAplicacao | null,
  depositoDestino?: string | null,
): GrupoPepBalcao {
  if (typeof pepOuId === 'string') {
    return { id: pepOuId, pep: pepSeId ?? null, deposito_destino: depositoDestino ?? null, itens: [] };
  }
  const id = `grupo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return { id, pep: pepOuId ?? pepSeId ?? null, deposito_destino: depositoDestino ?? null, itens: [] };
}

export function adicionarGrupoPep(
  grupos: GrupoPepBalcao[],
  pep: PepAplicacao | null = null,
  depositoDestino: string | null = null,
): GrupoPepBalcao[] {
  return [...grupos, criarGrupoPep(pep, null, depositoDestino)];
}

export function removerGrupoPep(grupos: GrupoPepBalcao[], grupoId: string): GrupoPepBalcao[] {
  if (grupos.length <= 1) return grupos;
  return grupos.filter((g) => g.id !== grupoId);
}

export function definirPepDoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  pep: PepAplicacao | null,
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    return {
      ...g,
      pep,
      itens: g.itens.map((i) => ({
        ...i,
        aplicacao_pep: pep?.wbs ?? null,
        aplicacao: pep?.nome ?? null,
      })),
    };
  });
}

export function definirDestinoDoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  depositoDestino: string | null,
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    return {
      ...g,
      deposito_destino: depositoDestino,
      itens: g.itens.map((i) => ({
        ...i,
        deposito_destino: depositoDestino,
      })),
    };
  });
}

/** Alias de definirDestinoDoGrupo / definirDepositoDoGrupo */
export function definirDepositoDoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  deposito: string | null,
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    return {
      ...g,
      deposito,
      deposito_destino: g.deposito_destino || deposito,
      itens: g.itens.map((i) => ({
        ...i,
        deposito: i.deposito || deposito,
        deposito_destino: i.deposito_destino || deposito,
      })),
    };
  });
}

export function adicionarItemAoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  item: MaterialDisponivel & { deposito?: string },
  quantidade: number,
  tipoMovimento: TipoMovimentoBalcao = 'saida',
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    const depSaida = item.deposito || g.deposito || null;
    const depDestino = tipoMovimento === 'transferencia' ? (g.deposito_destino || null) : null;
    const linhaComDados: MaterialDisponivel = { ...item };
    const novasLinhas = adicionarLinha(g.itens, linhaComDados, quantidade).map((l) => ({
      ...l,
      aplicacao_pep: tipoMovimento === 'transferencia' ? null : (g.pep?.wbs ?? null),
      aplicacao: tipoMovimento === 'transferencia' ? 'Transferência' : (g.pep?.nome ?? null),
      deposito: l.deposito || depSaida,
      deposito_destino: l.deposito_destino || depDestino,
    }));
    return {
      ...g,
      itens: novasLinhas,
    };
  });
}

export function removerItemDoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  materialIndex: number,
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    return { ...g, itens: g.itens.filter((_, idx) => idx !== materialIndex) };
  });
}

export function atualizarQtdItemDoGrupo(
  grupos: GrupoPepBalcao[],
  grupoId: string,
  materialIndex: number,
  quantidade: number,
): GrupoPepBalcao[] {
  return grupos.map((g) => {
    if (g.id !== grupoId) return g;
    return {
      ...g,
      itens: g.itens.map((item, idx) => (idx === materialIndex ? { ...item, quantidade } : item)),
    };
  });
}

export function achatarGruposPep(
  grupos: GrupoPepBalcao[],
  tipoMovimento: TipoMovimentoBalcao = 'saida',
  depositoGeral?: string,
): LinhaBalcao[] {
  return grupos.flatMap((g) =>
    g.itens.map((i) => ({
      ...i,
      aplicacao_pep: tipoMovimento === 'transferencia' ? null : (g.pep?.wbs ?? i.aplicacao_pep ?? null),
      aplicacao: tipoMovimento === 'transferencia' ? 'Transferência' : (g.pep?.nome ?? i.aplicacao ?? null),
      deposito: i.deposito ?? g.deposito ?? depositoGeral ?? null,
      deposito_destino: tipoMovimento === 'transferencia' ? (g.deposito_destino ?? i.deposito_destino ?? null) : null,
    })),
  );
}

export function agruparLinhasPorPep(
  linhas: LinhaBalcao[],
  pepsDisponiveis: PepAplicacao[],
  pepPadrao?: PepAplicacao | null,
): GrupoPepBalcao[] {
  if (linhas.length === 0) {
    return [criarGrupoPep('grupo-1', pepPadrao ?? null)];
  }

  const mapa = new Map<string, LinhaBalcao[]>();
  const ordemChaves: string[] = [];

  for (const linha of linhas) {
    const chave = linha.aplicacao_pep || pepPadrao?.wbs || '__sem_pep__';
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
      ordemChaves.push(chave);
    }
    mapa.get(chave)!.push(linha);
  }

  return ordemChaves.map((chave, idx) => {
    let pepEncontrado: PepAplicacao | null = null;
    if (chave !== '__sem_pep__') {
      pepEncontrado = pepsDisponiveis.find((p) => p.wbs === chave) ?? {
        wbs: chave,
        nome: linhas.find((l) => l.aplicacao_pep === chave)?.aplicacao ?? chave,
      };
    } else {
      pepEncontrado = pepPadrao ?? null;
    }

    return {
      id: `grupo-${idx + 1}-${chave}`,
      pep: pepEncontrado,
      itens: mapa.get(chave) ?? [],
    };
  });
}

export function agruparLinhasPorDestino(
  linhas: LinhaBalcao[],
  destinoPadrao?: string | null,
): GrupoPepBalcao[] {
  if (linhas.length === 0) {
    return [criarGrupoPep('grupo-1', null, destinoPadrao ?? null)];
  }

  const mapa = new Map<string, LinhaBalcao[]>();
  const ordemChaves: string[] = [];

  for (const linha of linhas) {
    const chave = linha.deposito_destino || destinoPadrao || '__sem_destino__';
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
      ordemChaves.push(chave);
    }
    mapa.get(chave)!.push(linha);
  }

  return ordemChaves.map((chave, idx) => ({
    id: `grupo-dest-${idx + 1}-${chave}`,
    deposito_destino: chave === '__sem_destino__' ? (destinoPadrao ?? null) : chave,
    pep: null,
    itens: mapa.get(chave) ?? [],
  }));
}

export function agruparLinhasPorDeposito(
  linhas: LinhaBalcao[],
  depositoPadrao?: string | null,
): GrupoPepBalcao[] {
  if (linhas.length === 0) {
    return [criarGrupoPep('grupo-1', null, null)];
  }

  const mapa = new Map<string, LinhaBalcao[]>();
  const ordemChaves: string[] = [];

  for (const linha of linhas) {
    const chave = linha.deposito || depositoPadrao || '__sem_deposito__';
    if (!mapa.has(chave)) {
      mapa.set(chave, []);
      ordemChaves.push(chave);
    }
    mapa.get(chave)!.push(linha);
  }

  return ordemChaves.map((chave, idx) => ({
    id: `grupo-dep-${idx + 1}-${chave}`,
    deposito: chave === '__sem_deposito__' ? (depositoPadrao ?? null) : chave,
    deposito_destino: null,
    pep: null,
    itens: mapa.get(chave) ?? [],
  }));
}

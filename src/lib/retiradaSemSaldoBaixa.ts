/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Retirada sem saldo (RSS) → baixa no balcão do almoxarifado.
 *
 * O material saiu antes de a NF ser lançada. Registrada a RSS, nasce a
 * Requisição no Balcão (FRM.ALM-0014) PENDENTE DE CONFIRMAÇÃO, como na Ficha
 * de EPI (trigger no banco). Quando o item ganha saldo na ZL0024, o
 * almoxarifado abre a requisição, escolhe depósito e PEP e confirma — o banco
 * só aceita com saldo — e a RSS vira REGULARIZADA com o código RQB.
 *
 * A requisição guarda `origem`/`origem_ref` = a RSS.
 */

import { isDepositoInativo, normalizeCode } from './almoxarifado';
import { isUserSetorAlmoxarifado } from './pages';
import type { Profile } from '../types';
import {
  DEPOSITO_PADRAO_BALCAO, ORIGEM_RETIRADA_SEM_SALDO, chaveDeposito, semDepositosSemSaida,
  type MaterialDisponivel, type PepAplicacao,
} from './requisicaoBalcao';
import { codigoRequisicaoPorOrigem, criarRequisicaoPendenteDeFicha } from './requisicaoBalcaoApi';
import { atualizarDepositosRequisicaoDaRetirada, type SolExtra } from './solicitacaoExtraApi';
import type { ItemSolExtra } from './solicitacaoExtra';
import { formatarDataBR } from './fichaEpi';

/** Quem dá baixa: o Almoxarifado e o admin. */
export function podeDarBaixaRetirada(user: Profile): boolean {
  return user.roles.includes('admin') || isUserSetorAlmoxarifado(user);
}

export interface LinhaBaixa extends ItemSolExtra {
  /** Depósito de saída: o que cobre a quantidade (o de maior saldo), senão o de maior saldo, senão o central. */
  deposito: string;
  saldoDeposito: number;
  /** Saldo somado nos depósitos com saída. */
  saldoTotal: number;
  /** O depósito escolhido cobre a quantidade retirada. */
  cobre: boolean;
}

/** Material (código normalizado) → depósitos ativos com saída onde ele aparece na ZL0024. */
function depositosPorMaterial(
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>,
  depositoInativo: (dep: string) => boolean,
): Map<string, { deposito: string; material: MaterialDisponivel }[]> {
  const ondeTem = new Map<string, { deposito: string; material: MaterialDisponivel }[]>();
  for (const [deposito, mapa] of semDepositosSemSaida(estoquePorDeposito)) {
    if (depositoInativo(deposito)) continue;
    for (const material of mapa.values()) {
      const k = normalizeCode(material.material);
      const lista = ondeTem.get(k) ?? [];
      lista.push({ deposito: chaveDeposito(deposito), material });
      ondeTem.set(k, lista);
    }
  }
  return ondeTem;
}

/** Onde cada item sai na baixa, com o saldo que a ZL0024 mostra hoje. */
export function planejarBaixa(
  itens: ItemSolExtra[],
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>,
  depositoInativo: (dep: string) => boolean = isDepositoInativo,
): LinhaBaixa[] {
  const ondeTem = depositosPorMaterial(estoquePorDeposito, depositoInativo);

  return itens.map(it => {
    const candidatos = [...(ondeTem.get(normalizeCode(it.material)) ?? [])]
      .sort((a, b) => b.material.saldo - a.material.saldo);
    const saldoTotal = candidatos.reduce((s, c) => s + Math.max(0, c.material.saldo), 0);
    const escolhido = candidatos.find(c => c.material.saldo >= it.quantidade) ?? candidatos[0];
    const saldoDeposito = escolhido ? Math.max(0, escolhido.material.saldo) : 0;
    return {
      ...it,
      material: escolhido?.material.material ?? it.material,
      deposito: escolhido?.deposito ?? DEPOSITO_PADRAO_BALCAO,
      saldoDeposito,
      saldoTotal,
      cobre: saldoDeposito >= it.quantidade,
    };
  });
}

/**
 * Situação de uma saída pendente frente à ZL0024 importada:
 * - `pronta`: todo item já tem saldo — dá para regularizar / dar baixa;
 * - `parcial`: só parte dos itens tem;
 * - `aguardando`: nenhum item tem saldo ainda (NF não lançada).
 */
export type ProntidaoSaldo = 'pronta' | 'parcial' | 'aguardando';

export const PRONTIDAO_SALDO_ROTULO: Record<ProntidaoSaldo, string> = {
  pronta: 'Já pode regularizar',
  parcial: 'Saldo parcial',
  aguardando: 'Aguardando saldo',
};

export interface SaldoParaRegularizar {
  prontidao: ProntidaoSaldo;
  /** Itens que o saldo de hoje cobre, cada um num depósito só (como a baixa exige). */
  itensComSaldo: number;
  totalItens: number;
}

/**
 * Quais saídas sem saldo pendentes a ZL0024 de hoje já deixa regularizar.
 *
 * O saldo é repartido entre as pendentes da mais antiga para a mais nova: duas
 * saídas do mesmo material não contam com a mesma quantidade. Cada item precisa
 * caber inteiro num depósito (a baixa no balcão sai de um depósito por item);
 * item que não cabe não consome saldo, para não tirar de quem vem depois.
 * Registro que não está pendente fica de fora do mapa.
 *
 * A mesma regra roda no banco (`alm_req_balcao_atualizar_saldos`, a cada
 * importação da ZL0024) para a tag "Sem saldo" da Requisição no Balcão — mudou
 * aqui, mude lá também.
 */
export function prontidaoRegularizacao(
  registros: Pick<SolExtra, 'id' | 'status' | 'data' | 'created_at' | 'itens'>[],
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>,
  depositoInativo: (dep: string) => boolean = isDepositoInativo,
): Map<string, SaldoParaRegularizar> {
  // Saldo que ainda resta por material e depósito, consumido conforme as saídas são cobertas.
  const restante = new Map<string, Map<string, number>>();
  for (const [mat, lista] of depositosPorMaterial(estoquePorDeposito, depositoInativo)) {
    const porDep = new Map<string, number>();
    for (const { deposito, material } of lista) porDep.set(deposito, (porDep.get(deposito) ?? 0) + Math.max(0, material.saldo));
    restante.set(mat, porDep);
  }

  const pendentes = registros
    .filter(r => r.status === 'PENDENTE')
    .sort((a, b) => a.data.localeCompare(b.data) || (a.created_at || '').localeCompare(b.created_at || ''));

  const out = new Map<string, SaldoParaRegularizar>();
  for (const r of pendentes) {
    let itensComSaldo = 0;
    for (const it of r.itens) {
      const qtd = Number(it.quantidade) || 0;
      const porDep = restante.get(normalizeCode(it.material));
      let escolhido: string | null = null;
      let maior = -1;
      for (const [dep, saldo] of porDep ?? []) {
        if (saldo >= qtd && saldo > maior) { escolhido = dep; maior = saldo; }
      }
      if (escolhido && porDep) {
        porDep.set(escolhido, maior - qtd);
        itensComSaldo++;
      }
    }
    const totalItens = r.itens.length;
    out.set(r.id, {
      prontidao: totalItens > 0 && itensComSaldo === totalItens ? 'pronta' : itensComSaldo > 0 ? 'parcial' : 'aguardando',
      itensComSaldo,
      totalItens,
    });
  }
  return out;
}

/** Data da importação da ZL0024 lida (a mais recente das linhas). */
export function dataImportacaoEstoque(estoque: { imported_at?: string | null }[]): string | null {
  let maior: string | null = null;
  for (const e of estoque) if (e.imported_at && (!maior || e.imported_at > maior)) maior = e.imported_at;
  return maior;
}

/**
 * Código da Requisição no Balcão pendente da retirada. Ela nasce sozinha no
 * registro da RSS (trigger `alm_sol_extra_sincronizar_rqb`); se por algum
 * motivo não existir (falha no trigger, RSS antiga), é criada aqui, também
 * pendente e com o PEP em aberto.
 */
export async function requisicaoDaRetirada(registro: SolExtra, linhas: LinhaBaixa[], usuarioNome: string): Promise<string> {
  if (!registro.codigo) throw new Error('A retirada ainda não sincronizou — aguarde o código RSS.');
  const existente = await codigoRequisicaoPorOrigem(ORIGEM_RETIRADA_SEM_SALDO, registro.codigo);
  if (existente) {
    // Ainda pendente: leva cada item para o depósito que tem saldo agora.
    await atualizarDepositosRequisicaoDaRetirada(registro.codigo).catch((err) => console.warn('Depósitos da requisição não atualizados:', err));
    return existente;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sem conexão. Tente quando a rede voltar.');
  }
  const criada = await criarRequisicaoPendenteDeFicha({
    data: registro.data,
    colaborador_id: registro.retirante_id,
    colaborador_nome: registro.retirante_nome || '',
    colaborador_registro: registro.retirante_matricula,
    pep: registro.aplicacao_pep
      ? { wbs: registro.aplicacao_pep, nome: registro.aplicacao || registro.aplicacao_pep }
      : { wbs: '', nome: 'A definir na confirmação' },
    observacao: `Retirada sem saldo ${registro.codigo} (${formatarDataBR(registro.data)}${registro.setor_solicitante_nome ? `, setor ${registro.setor_solicitante_nome}` : ''}). Confirme quando a NF for lançada e o item tiver saldo na ZL0024.`,
    origemRef: registro.codigo,
    criadoPorNome: usuarioNome,
    origem: ORIGEM_RETIRADA_SEM_SALDO,
    pendenteConfirmacao: true,
    itens: linhas.map(l => ({ material: l.material, quantidade: l.quantidade, descricao: l.descricao, unidade: l.unidade, deposito: l.deposito })),
  });
  if (criada.offline || !criada.codigo) throw new Error('A requisição ficou na fila offline — abra quando a conexão voltar.');
  return criada.codigo;
}

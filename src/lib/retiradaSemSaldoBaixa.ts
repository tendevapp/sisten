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

/** Onde cada item sai na baixa, com o saldo que a ZL0024 mostra hoje. */
export function planejarBaixa(
  itens: ItemSolExtra[],
  estoquePorDeposito: Map<string, Map<string, MaterialDisponivel>>,
  depositoInativo: (dep: string) => boolean = isDepositoInativo,
): LinhaBaixa[] {
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
    pep: { wbs: '', nome: 'A definir na confirmação' },
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

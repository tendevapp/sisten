/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Retirada sem saldo (RSS) → baixa no balcão do almoxarifado.
 *
 * O material saiu antes de a NF ser lançada. Quando o item ganha saldo na
 * ZL0024, o almoxarifado dá baixa em Geral › Pendências: a Requisição no
 * Balcão (FRM.ALM-0014) nasce preenchida com quem retirou e os itens, cada um
 * no depósito que tem saldo, e o PEP escolhido na hora. Ela sai já conferida
 * (não pendente de confirmação) e a RSS vira REGULARIZADA com o código RQB.
 *
 * A requisição guarda `origem`/`origem_ref` = a RSS; se a gravação da baixa
 * falhar depois de a requisição existir, a nova tentativa reaproveita a
 * mesma requisição em vez de gerar outra.
 */

import { isDepositoInativo, normalizeCode } from './almoxarifado';
import { isUserSetorAlmoxarifado } from './pages';
import type { Profile } from '../types';
import {
  DEPOSITO_PADRAO_BALCAO, ORIGEM_RETIRADA_SEM_SALDO, chaveDeposito, semDepositosSemSaida,
  type MaterialDisponivel, type PepAplicacao,
} from './requisicaoBalcao';
import { codigoRequisicaoPorOrigem, criarRequisicaoPendenteDeFicha } from './requisicaoBalcaoApi';
import { baixarRetiradaSemSaldo, type SolExtra } from './solicitacaoExtraApi';
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

export interface EntradaBaixa {
  registro: SolExtra;
  linhas: LinhaBaixa[];
  pep: PepAplicacao;
  usuarioNome: string;
  obs?: string;
}

/** Gera (ou reaproveita) a Requisição no Balcão e marca a RSS como baixada. Devolve o código RQB. */
export async function darBaixaRetiradaSemSaldo(entrada: EntradaBaixa): Promise<string> {
  const { registro } = entrada;
  if (!registro.codigo) throw new Error('A retirada ainda não sincronizou — aguarde o código RSS.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Sem conexão. A baixa precisa do servidor — tente quando a rede voltar.');
  }

  let codigo = await codigoRequisicaoPorOrigem(ORIGEM_RETIRADA_SEM_SALDO, registro.codigo);
  if (!codigo) {
    const observacao = [
      `Baixa da retirada sem saldo ${registro.codigo} (${formatarDataBR(registro.data)}${registro.hora ? ` ${registro.hora.slice(0, 5)}` : ''}`
        + `${registro.setor_solicitante_nome ? `, setor ${registro.setor_solicitante_nome}` : ''}).`,
      entrada.obs?.trim() || '',
    ].filter(Boolean).join(' ');
    const criada = await criarRequisicaoPendenteDeFicha({
      data: registro.data,
      colaborador_id: registro.retirante_id,
      colaborador_nome: registro.retirante_nome || '',
      colaborador_registro: registro.retirante_matricula,
      pep: entrada.pep,
      observacao,
      origemRef: registro.codigo,
      criadoPorNome: entrada.usuarioNome,
      origem: ORIGEM_RETIRADA_SEM_SALDO,
      pendenteConfirmacao: false,
      itens: entrada.linhas.map(l => ({
        material: l.material,
        quantidade: l.quantidade,
        descricao: l.descricao,
        unidade: l.unidade,
        deposito: l.deposito,
      })),
    });
    if (criada.offline || !criada.codigo) throw new Error('A requisição ficou na fila offline — dê baixa quando a conexão voltar.');
    codigo = criada.codigo;
  }

  await baixarRetiradaSemSaldo(registro.id, codigo, entrada.obs);
  return codigo;
}

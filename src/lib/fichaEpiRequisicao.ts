/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha de EPI concluída → saída de estoque no balcão do almoxarifado.
 *
 * A ficha é a entrega assinada; o material precisa sair do estoque no SAP. Em
 * vez de o almoxarife redigitar, a Requisição no Balcão (FRM.ALM-0014) nasce
 * preenchida — itens, depósito com saldo, PEP sugerido pelo setor — como
 * PENDENTE DE CONFIRMAÇÃO: só depois de o almoxarifado abrir, conferir o PEP
 * e liberar ela entra na exportação para o SAP.
 */

import type { ItemFichaPayload } from './fichaEpi';
import { formatarDataBR } from './fichaEpi';
import { isDepositoInativo } from './almoxarifado';
import { DEPOSITO_EPI, indexarEstoquePorDeposito, itensRequisicaoDaFicha, sugerirPepEpi } from './requisicaoBalcao';
import {
  buscarEstoqueBalcao, criarRequisicaoPendenteDeFicha, listarAplicacoesBalcao,
} from './requisicaoBalcaoApi';
import { setorDoColaborador, type ColaboradorFichaEpi } from './ssmaFichaEpiApi';

export type ResultadoRequisicaoDaFicha =
  | { situacao: 'criada'; codigo: string; pepSugerido: string; semCodigo: string[]; pendente: boolean }
  /** Gravada sem rede: o código RQB nasce quando a fila sobe. */
  | { situacao: 'offline'; pepSugerido: string; semCodigo: string[] }
  /** Nenhum item da ficha tem código SAP — nada a baixar do estoque. */
  | { situacao: 'sem_itens'; semCodigo: string[] };

export interface EntradaRequisicaoDaFicha {
  fichaCodigo: string;
  pessoa: ColaboradorFichaEpi;
  dataEntrega: string;
  itens: ItemFichaPayload[];
  usuarioNome: string;
}

export async function gerarRequisicaoPendenteDaFicha(entrada: EntradaRequisicaoDaFicha): Promise<ResultadoRequisicaoDaFicha> {
  const [estoque, peps] = await Promise.all([
    buscarEstoqueBalcao(false).catch(() => []),
    listarAplicacoesBalcao().catch(() => []),
  ]);

  const { itens, semCodigo } = itensRequisicaoDaFicha(
    entrada.itens.map(i => ({ codigo_sap: i.codigo_sap, descricao: i.descricao, quantidade: i.quantidade, tamanho: i.tamanho })),
    indexarEstoquePorDeposito(estoque, true),
    isDepositoInativo,
    DEPOSITO_EPI,
  );
  if (!itens.length) return { situacao: 'sem_itens', semCodigo };

  const pep = sugerirPepEpi(setorDoColaborador(entrada.pessoa), peps)
    ?? { wbs: 'TEN001134003000', nome: 'EPI - PRODUÇÃO' };

  const observacao = [
    `Ficha de EPI ${entrada.fichaCodigo} (entrega de ${formatarDataBR(entrada.dataEntrega)}).`,
    semCodigo.length ? `Sem código SAP na ficha, lançar à mão se saírem do estoque: ${semCodigo.join('; ')}.` : '',
  ].filter(Boolean).join(' ');

  const criada = await criarRequisicaoPendenteDeFicha({
    data: entrada.dataEntrega,
    colaborador_id: entrada.pessoa.id,
    colaborador_nome: entrada.pessoa.nome,
    colaborador_registro: entrada.pessoa.registro,
    pep,
    observacao,
    origemRef: entrada.fichaCodigo,
    criadoPorNome: entrada.usuarioNome,
    itens,
  });

  if (criada.offline) return { situacao: 'offline', pepSugerido: pep.nome, semCodigo };
  return { situacao: 'criada', codigo: criada.codigo, pepSugerido: pep.nome, semCodigo, pendente: criada.pendente };
}

/** Chave de sessão: a ficha deixa o código aqui e a tela do balcão abre essa requisição. */
export const CHAVE_ABRIR_REQUISICAO_BALCAO = 'sisten_req_balcao_abrir';

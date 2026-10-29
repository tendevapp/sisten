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
 *
 * Item que o depósito de EPI não cobre na ZL0024 não entra nessa requisição
 * (ela não confirmaria): a ficha abre sozinha uma Retirada sem Saldo
 * (Solicitação Extraordinária RSS) com esses itens, que gera a própria
 * requisição pendente e regulariza quando a NF for lançada.
 */

import type { ItemFichaPayload } from './fichaEpi';
import { formatarDataBR } from './fichaEpi';
import { isDepositoInativo } from './almoxarifado';
import {
  DEPOSITO_EPI, indexarEstoquePorDeposito, itensRequisicaoDaFicha, separarItensSemSaldo, sugerirPepEpi,
  type ItemRequisicaoEpi, type PepAplicacao,
} from './requisicaoBalcao';
import { criarSolicitacaoExtra, solicitacaoExtraPorOrigem } from './solicitacaoExtraApi';
import { horaAgora } from './portariaApi';
import { localDb } from '../db/localDb';
import {
  buscarEstoqueBalcao, criarRequisicaoPendenteDeFicha, listarAplicacoesBalcao,
} from './requisicaoBalcaoApi';
import { setorDoColaborador, type ColaboradorFichaEpi } from './ssmaFichaEpiApi';

/** Retirada sem Saldo que a ficha abriu para os itens que o depósito de EPI não cobre. */
export type ExtraordinariaDaFicha =
  | { situacao: 'criada'; codigo: string; itens: string[]; reaproveitada: boolean }
  /** Gravada sem rede: o código RSS nasce quando a fila sobe. */
  | { situacao: 'offline'; itens: string[] }
  /** Não abriu — os itens ficaram na requisição da ficha, como antes. */
  | { situacao: 'erro'; itens: string[]; mensagem: string };

export type ResultadoRequisicaoDaFicha =
  | { situacao: 'criada'; codigo: string; pepSugerido: string; semCodigo: string[]; pendente: boolean; extraordinaria?: ExtraordinariaDaFicha }
  /** Gravada sem rede: o código RQB nasce quando a fila sobe. */
  | { situacao: 'offline'; pepSugerido: string; semCodigo: string[]; extraordinaria?: ExtraordinariaDaFicha }
  /** Nenhum item tem saldo: tudo saiu pela Retirada sem Saldo, sem requisição da ficha. */
  | { situacao: 'so_extraordinaria'; pepSugerido: string; semCodigo: string[]; extraordinaria: ExtraordinariaDaFicha }
  /** Nenhum item da ficha tem código SAP — nada a baixar do estoque. */
  | { situacao: 'sem_itens'; semCodigo: string[] };

export interface EntradaRequisicaoDaFicha {
  fichaCodigo: string;
  pessoa: ColaboradorFichaEpi;
  dataEntrega: string;
  itens: ItemFichaPayload[];
  usuarioNome: string;
  /** Assinatura da ficha (PNG) — vale como a de quem retirou na Retirada sem Saldo. */
  assinatura?: string | null;
}

export const ORIGEM_SOL_EXTRA_FICHA_EPI = 'ficha_epi';

/** Quem aprova a retirada de EPI sem saldo: o setor Segurança (dono da ficha de EPI). */
const SETOR_RETIRADA_EPI = { id: '13', nome: 'Segurança' };

function setorDaRetiradaEpi(): { id: string; nome: string } {
  const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const achado = localDb.getSectors().find(s => norm(s.name) === norm(SETOR_RETIRADA_EPI.nome));
  return achado ? { id: String(achado.id), nome: achado.name } : SETOR_RETIRADA_EPI;
}

/** A assinatura da ficha só vai para a retirada se couber na regra do banco. */
const assinaturaValida = (a?: string | null) =>
  a && a.startsWith('data:image/png;base64,') && a.length <= 400_000 ? a : null;

const rotuloItem = (i: ItemRequisicaoEpi) => `${i.material} ${i.descricao}`.trim();

/**
 * Abre (ou reaproveita, se a geração for repetida) a Retirada sem Saldo da
 * ficha. Ela vai para a aprovação da Segurança e gera a própria Requisição no
 * Balcão pendente, que só confirma quando a NF entrar e houver saldo.
 */
async function abrirRetiradaSemSaldoDaFicha(
  entrada: EntradaRequisicaoDaFicha,
  itens: (ItemRequisicaoEpi & { saldo: number })[],
  pep: PepAplicacao,
): Promise<ExtraordinariaDaFicha> {
  const rotulos = itens.map(rotuloItem);
  const existente = await solicitacaoExtraPorOrigem(ORIGEM_SOL_EXTRA_FICHA_EPI, entrada.fichaCodigo);
  if (existente?.codigo) return { situacao: 'criada', codigo: existente.codigo, itens: rotulos, reaproveitada: true };

  const setor = setorDaRetiradaEpi();
  const assinatura = assinaturaValida(entrada.assinatura);
  const criada = await criarSolicitacaoExtra({
    tipo: 'SEM_SALDO',
    data: entrada.dataEntrega,
    hora: horaAgora(),
    turno: null,
    projeto: null,
    tramo: null,
    itens: itens.map(i => ({ material: i.material, descricao: i.descricao, unidade: i.unidade || 'UN', quantidade: i.quantidade })),
    motivo: null,
    motivo_detalhe: null,
    area_reparada_m2: null,
    rugosidade_um: null,
    observacao: `Aberta pela Ficha de EPI ${entrada.fichaCodigo} (entrega de ${formatarDataBR(entrada.dataEntrega)}): `
      + `sem saldo no depósito ${DEPOSITO_EPI} da ZL0024 — ${itens.map(i => `${i.material} (pedido ${i.quantidade}, saldo ${i.saldo})`).join('; ')}.`,
    retirante_id: entrada.pessoa.id,
    retirante_nome: entrada.pessoa.nome.trim().toUpperCase(),
    retirante_matricula: entrada.pessoa.registro,
    setor_solicitante_id: setor.id,
    setor_solicitante_nome: setor.nome,
    fotos: [],
    assinatura_retirante: assinatura,
    assinatura_retirante_em: assinatura ? new Date().toISOString() : null,
    aplicacao_pep: pep.wbs,
    aplicacao: pep.nome,
    origem: ORIGEM_SOL_EXTRA_FICHA_EPI,
    origem_ref: entrada.fichaCodigo,
  }, entrada.usuarioNome);
  if (!criada.codigo) return { situacao: 'offline', itens: rotulos };
  return { situacao: 'criada', codigo: criada.codigo, itens: rotulos, reaproveitada: false };
}

export async function gerarRequisicaoPendenteDaFicha(entrada: EntradaRequisicaoDaFicha): Promise<ResultadoRequisicaoDaFicha> {
  // Saldo atual: é ele que decide o que vai para a Retirada sem Saldo.
  const [estoqueLido, peps] = await Promise.all([
    buscarEstoqueBalcao(true).catch(() => null),
    listarAplicacoesBalcao().catch(() => []),
  ]);
  const estoque = estoqueLido ?? [];
  const estoqueIdx = indexarEstoquePorDeposito(estoque, true);

  const { itens, semCodigo } = itensRequisicaoDaFicha(
    entrada.itens.map(i => ({ codigo_sap: i.codigo_sap, descricao: i.descricao, quantidade: i.quantidade, tamanho: i.tamanho })),
    estoqueIdx,
    isDepositoInativo,
    DEPOSITO_EPI,
  );
  if (!itens.length) return { situacao: 'sem_itens', semCodigo };

  const pep = sugerirPepEpi(setorDoColaborador(entrada.pessoa), peps)
    ?? { wbs: 'TEN001134003000', nome: 'EPI - PRODUÇÃO' };

  // Sem ZL0024 lida não dá para dizer o que falta: tudo segue na requisição da ficha.
  const { comSaldo, semSaldo } = estoque.length
    ? separarItensSemSaldo(itens, estoqueIdx)
    : { comSaldo: itens, semSaldo: [] };

  let extraordinaria: ExtraordinariaDaFicha | undefined;
  let paraRequisicao: ItemRequisicaoEpi[] = comSaldo;
  if (semSaldo.length) {
    try {
      extraordinaria = await abrirRetiradaSemSaldoDaFicha(entrada, semSaldo, pep);
    } catch (err) {
      // Não perde a saída: sem a retirada, o item volta para a requisição da ficha.
      paraRequisicao = itens;
      extraordinaria = {
        situacao: 'erro',
        itens: semSaldo.map(rotuloItem),
        mensagem: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!paraRequisicao.length && extraordinaria) {
    return { situacao: 'so_extraordinaria', pepSugerido: pep.nome, semCodigo, extraordinaria };
  }

  const foraDaRequisicao = extraordinaria && extraordinaria.situacao !== 'erro' ? semSaldo : [];
  const observacao = [
    `Ficha de EPI ${entrada.fichaCodigo} (entrega de ${formatarDataBR(entrada.dataEntrega)}).`,
    semCodigo.length ? `Sem código SAP na ficha, lançar à mão se saírem do estoque: ${semCodigo.join('; ')}.` : '',
    foraDaRequisicao.length
      ? `Sem saldo na ZL0024, saem pela retirada sem saldo${extraordinaria?.situacao === 'criada' ? ` ${extraordinaria.codigo}` : ''}: ${foraDaRequisicao.map(i => i.material).join(', ')}.`
      : '',
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
    itens: paraRequisicao,
  });

  if (criada.offline) return { situacao: 'offline', pepSugerido: pep.nome, semCodigo, extraordinaria };
  return { situacao: 'criada', codigo: criada.codigo, pepSugerido: pep.nome, semCodigo, pendente: criada.pendente, extraordinaria };
}

/** Chave de sessão: a ficha deixa o código aqui e a tela do balcão abre essa requisição. */
export const CHAVE_ABRIR_REQUISICAO_BALCAO = 'sisten_req_balcao_abrir';

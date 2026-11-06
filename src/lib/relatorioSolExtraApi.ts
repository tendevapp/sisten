/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Dados do relatório consolidado das Solicitações Extraordinárias: lê as
 * solicitações do período, a ZL0024 (o que já tem saldo) e, para os materiais
 * que ainda esperam a NF, o PO aberto (RPC `alm_situacao_material`, ~25 ms
 * por material — são poucos: só os pendentes sem saldo).
 *
 * Leitura de escritório: precisa de rede (o PO e o saldo vêm do servidor).
 */

import { normalizeCode } from './almoxarifado';
import { indexarEstoquePorDeposito } from './requisicaoBalcao';
import { buscarEstoqueBalcao } from './requisicaoBalcaoApi';
import { coberturaItensPendentes, dataImportacaoEstoque } from './retiradaSemSaldoBaixa';
import { listarSolicitacoesExtraPendentes, listarSolicitacoesExtraPeriodo } from './solicitacaoExtraApi';
import { buscarSituacaoMaterial } from './situacaoMaterial';
import {
  filtrarParaRelatorio, linhasRelatorio, materiaisAguardandoNf, pendenciaNfDoMaterial,
  type FiltroRelatorioSolExtra, type PendenciaNfMaterial,
} from './relatorioSolExtra';
import type { DadosRelatorioSolExtra } from './pdfExport/exportRelatorioSolExtraPdf';

/** Consultas de PO em paralelo (sem afogar o banco). */
const PARALELO = 4;

export async function carregarRelatorioSolExtra(filtro: FiltroRelatorioSolExtra, geradoPor: string): Promise<DadosRelatorioSolExtra> {
  const [registros, pendentes, estoque] = await Promise.all([
    listarSolicitacoesExtraPeriodo(filtro.de, filtro.ate),
    listarSolicitacoesExtraPendentes(),
    buscarEstoqueBalcao(true).catch((err) => {
      console.warn('ZL0024 não lida para o relatório de solicitações extraordinárias:', err);
      return null;
    }),
  ]);

  const cobertura = estoque ? coberturaItensPendentes(pendentes, indexarEstoquePorDeposito(estoque, true)) : null;
  const linhas = linhasRelatorio(filtrarParaRelatorio(registros, filtro), cobertura);

  const pendenciaNf = new Map<string, PendenciaNfMaterial>();
  const fila = materiaisAguardandoNf(linhas);
  const trabalhar = async () => {
    for (let mat = fila.shift(); mat; mat = fila.shift()) {
      try {
        pendenciaNf.set(normalizeCode(mat), pendenciaNfDoMaterial(await buscarSituacaoMaterial(mat)));
      } catch (err) {
        console.warn(`PO pendente do material ${mat} não consultado:`, err);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALELO }, trabalhar));

  return {
    linhas,
    pendenciaNf,
    filtro,
    estoqueImportadoEm: estoque ? dataImportacaoEstoque(estoque) : null,
    saldoLido: !!estoque,
    geradoPor,
  };
}

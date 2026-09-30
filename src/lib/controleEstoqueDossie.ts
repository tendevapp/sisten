import * as XLSX from 'xlsx';
import type { ControleEstoqueAnalise, StatusControleEstoque } from './controleEstoque';

/**
 * Dossiê: a história de cada material numa linha por RM — estoque, faixa,
 * requisição, pedido e chegada. Material sem RM ganha uma linha só; pedido em
 * aberto que nenhuma RM aponta entra como linha própria, para a compra não
 * sumir da análise.
 */
export interface LinhaDossie {
  chave: string;
  material: string;
  descricao: string | null;
  umb: string | null;
  saldo: number;
  saldoTotal: number;
  minimo: number | null;
  propostaRm: number | null;
  minimoSisten: number | null;
  prSisten: number | null;
  status: StatusControleEstoque;
  coberturaDias: number | null;
  rm: string | null;
  dataRm: string | null;
  requisitante: string | null;
  quantidadeSolicitada: number | null;
  existeRm: boolean;
  pedido: string | null;
  dataPedido: string | null;
  chegou: boolean;
  quantidadeChegou: number | null;
  /** Primeira linha do material: as demais repetem o cabeçalho e ficam esmaecidas. */
  primeiraDoMaterial: boolean;
}

/** Mesma relação máximo/mínimo da planilha (máximo ≈ 2 × mínimo). */
export const FATOR_PR_SISTEN = 2;

const texto = (valor: string | null | undefined): string | null => {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
};

export function montarDossie(
  analises: ControleEstoqueAnalise[],
  minimoSistenPorMaterial: Map<string, number | null>,
): LinhaDossie[] {
  const linhas: LinhaDossie[] = [];

  for (const { item, faixa } of analises) {
    const minimoSisten = minimoSistenPorMaterial.get(item.material) ?? null;
    const base = {
      material: item.material,
      descricao: item.descricao,
      umb: item.umb,
      saldo: item.saldo_reposicao,
      saldoTotal: item.saldo_total,
      minimo: faixa.estoqueMinimo,
      propostaRm: faixa.quantidadeComprar,
      minimoSisten,
      prSisten: minimoSisten === null ? null : minimoSisten * FATOR_PR_SISTEN,
      status: faixa.status,
      coberturaDias: faixa.coberturaDias,
    };

    const pedidosUsados = new Set<string>();
    const dadosDoMaterial: Omit<LinhaDossie, 'chave' | 'primeiraDoMaterial'>[] = [];

    for (const rm of item.rms) {
      const numeroPedido = texto(rm.pedido);
      const pedido = numeroPedido
        ? item.pedidos.find(p => texto(p.pedido) === numeroPedido)
        : undefined;
      if (numeroPedido) pedidosUsados.add(numeroPedido);
      const recebido = pedido?.quantidade_recebida_mb51 ?? null;
      dadosDoMaterial.push({
        ...base,
        rm: texto(rm.requisicao),
        dataRm: rm.data,
        requisitante: texto(rm.requisitante),
        quantidadeSolicitada: rm.quantidade,
        existeRm: true,
        pedido: numeroPedido,
        dataPedido: pedido?.data ?? null,
        chegou: (recebido ?? 0) > 0,
        quantidadeChegou: recebido !== null && recebido > 0 ? recebido : null,
      });
    }

    for (const pedido of item.pedidos) {
      const numeroPedido = texto(pedido.pedido);
      if (!numeroPedido || pedidosUsados.has(numeroPedido) || pedido.quantidade_pendente <= 0) continue;
      pedidosUsados.add(numeroPedido);
      const recebido = pedido.quantidade_recebida_mb51 ?? null;
      dadosDoMaterial.push({
        ...base,
        rm: null,
        dataRm: null,
        requisitante: null,
        quantidadeSolicitada: null,
        existeRm: false,
        pedido: numeroPedido,
        dataPedido: pedido.data,
        chegou: (recebido ?? 0) > 0,
        quantidadeChegou: recebido !== null && recebido > 0 ? recebido : null,
      });
    }

    if (dadosDoMaterial.length === 0) {
      dadosDoMaterial.push({
        ...base,
        rm: null,
        dataRm: null,
        requisitante: null,
        quantidadeSolicitada: null,
        existeRm: false,
        pedido: null,
        dataPedido: null,
        chegou: false,
        quantidadeChegou: null,
      });
    }

    dadosDoMaterial.forEach((dados, indice) => {
      linhas.push({
        ...dados,
        chave: `${item.centro}-${item.material}-${indice}`,
        primeiraDoMaterial: indice === 0,
      });
    });
  }

  return linhas;
}

const ROTULO_STATUS: Record<StatusControleEstoque, string> = {
  CRITICO: 'CRÍTICO',
  ALERTA: 'ALERTA',
  OK: 'OK',
  SEM_DADOS: 'SEM DADOS',
};

const simNao = (valor: boolean) => (valor ? 'SIM' : 'NÃO');

export const COLUNAS_DOSSIE = [
  'Material', 'Texto breve material', 'Total Stk (ZL0024)', 'UM Registro', 'Stk Mínimo', 'PR (RM)',
  'Sft STK (mínimo)', 'PR', 'STATUS', 'Cobertura (Dias)', 'RM', 'Data RM', 'Requisitante',
  'Quant Solicitada', 'Existe RM?', 'PEDIDO', 'Data Pedido', 'Chegou?', 'Quant. Chegou',
] as const;

export function criarWorkbookDossie(linhas: LinhaDossie[]): XLSX.WorkBook {
  const dados = linhas.map(linha => [
    linha.material,
    linha.descricao ?? '',
    linha.saldo,
    linha.umb ?? '',
    linha.minimo ?? '',
    linha.propostaRm ?? '',
    linha.minimoSisten ?? '',
    linha.prSisten ?? '',
    ROTULO_STATUS[linha.status],
    linha.coberturaDias ?? '',
    linha.rm ?? '',
    linha.dataRm ?? '',
    linha.requisitante ?? '',
    linha.quantidadeSolicitada ?? '',
    simNao(linha.existeRm),
    linha.pedido ?? '',
    linha.dataPedido ?? '',
    simNao(linha.chegou),
    linha.quantidadeChegou ?? '',
  ]);
  const planilha = XLSX.utils.aoa_to_sheet([Array.from(COLUNAS_DOSSIE), ...dados]);
  planilha['!cols'] = [18, 44, 14, 10, 12, 10, 14, 10, 12, 12, 14, 12, 16, 14, 11, 14, 12, 10, 13].map(wch => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, 'Dossie');
  return workbook;
}

export function exportarDossieExcel(linhas: LinhaDossie[]): void {
  XLSX.writeFile(criarWorkbookDossie(linhas), `dossie-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

import * as XLSX from 'xlsx';
import type { ControleEstoqueAnalise, StatusControleEstoque } from './controleEstoque';

/**
 * Dossiê: a história de cada material, uma linha por ligação RM → pedido.
 *
 * RM e pedido são muitos-para-muitos e a entrega é parcial por natureza, então:
 *  - cada RM vira uma linha por item de pedido que atendeu a ela (RM dividida em
 *    dois pedidos = duas linhas); RM sem pedido é uma linha só;
 *  - pedido em aberto que nenhuma RM aponta entra como linha própria;
 *  - a chegada é SIM / PARCIAL / NÃO e traz "chegou de pedido", com a lista de
 *    entregas (MB51 101/102, estornos inclusos) para abrir na linha;
 *  - pedido que atende várias RMs aparece em cada uma, mas é contado uma vez nos
 *    totais do material (primeira linha do material).
 */
export type SituacaoChegada = 'SEM_PEDIDO' | 'NAO' | 'PARCIAL' | 'SIM';

/**
 * A RM continua aberta na ME5A mesmo depois que o pedido dela foi entregue ou
 * encerrado; por isso "existe RM" não basta para dizer que há reposição.
 *  - SEM_PEDIDO: RM aguardando compra;
 *  - EM_PEDIDO: o pedido ainda tem quantidade a chegar (ou não está na ZL0132);
 *  - ATENDIDA: o pedido existe e não espera mais nada.
 */
export type SituacaoRm = 'SEM_PEDIDO' | 'EM_PEDIDO' | 'ATENDIDA';

/**
 * Visões de estoque zerado, por material (saldo de reposição ≤ 0):
 *  - ZERADO_COM_PO: há pedido com quantidade a chegar;
 *  - ZERADO_COM_RM: sem pedido em aberto, mas com RM aguardando compra;
 *  - ZERADO_SEM_REPOSICAO: já movimentou, tem mínimo (planilha ou SISTEN) e
 *    nada a caminho — nem pedido aberto, nem RM sem pedido.
 */
export type AlertaZerado = 'ZERADO_COM_PO' | 'ZERADO_COM_RM' | 'ZERADO_SEM_REPOSICAO';

export interface EntregaDossie {
  data: string | null;
  documento: string | null;
  quantidade: number;
  estorno: boolean;
  /** Quantidade líquida recebida até este lançamento. */
  acumulado: number;
}

export interface ResumoCompraDossie {
  rms: number;
  pedidos: number;
  solicitado: number;
  pedido: number;
  chegou: number;
  aChegar: number;
}

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
  /** Material zerado que não está mais na ZL0024. */
  foraZl0024: boolean;
  ultimoMovimento: string | null;
  /** Mesmo valor em todas as linhas do material. */
  alertaZerado: AlertaZerado | null;
  rm: string | null;
  itemRm: string | null;
  dataRm: string | null;
  requisitante: string | null;
  quantidadeSolicitada: number | null;
  existeRm: boolean;
  situacaoRm: SituacaoRm | null;
  /** Mesma RM/item da linha anterior (RM atendida por mais de um pedido). */
  rmRepetida: boolean;
  pedido: string | null;
  itemPedido: string | null;
  dataPedido: string | null;
  remessaPrevista: string | null;
  /** Ainda falta chegar e a remessa prevista já passou. */
  pedidoAtrasado: boolean;
  quantidadePedida: number | null;
  situacao: SituacaoChegada;
  quantidadeChegou: number | null;
  aChegar: number | null;
  entregas: EntregaDossie[];
  ultimaEntrega: string | null;
  pedidoCompartilhado: boolean;
  /** Primeira linha do material: as demais repetem o cabeçalho e ficam esmaecidas. */
  primeiraDoMaterial: boolean;
  /** Totais de compra do material; só na primeira linha. */
  resumo: ResumoCompraDossie | null;
}

/** Mesma relação máximo/mínimo da planilha (máximo ≈ 2 × mínimo). */
export const FATOR_PR_SISTEN = 2;

const texto = (valor: string | null | undefined): string | null => {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
};

/** O item do SAP vem como "10" numa base e "00010" em outra. */
const itemNorm = (valor: string | null | undefined): string => (valor ?? '').trim().replace(/^0+/, '');

const chavePedido = (pedido: string | null, item: string | null) => `${pedido ?? ''}|${itemNorm(item)}`;

export function calcularSituacaoChegada(
  pedidoConhecido: boolean,
  quantidadePedida: number | null,
  quantidadeChegou: number | null,
): SituacaoChegada {
  if (!pedidoConhecido) return 'SEM_PEDIDO';
  const chegou = quantidadeChegou ?? 0;
  if (chegou <= 0) return 'NAO';
  if (quantidadePedida === null || quantidadePedida <= 0 || chegou >= quantidadePedida) return 'SIM';
  return 'PARCIAL';
}

export function calcularAlertaZerado(params: {
  saldo: number;
  temPedidoAberto: boolean;
  temRmSemPedido: boolean;
  teveMovimento: boolean;
  minimo: number | null;
  minimoSisten: number | null;
}): AlertaZerado | null {
  if (params.saldo > 0) return null;
  if (params.temPedidoAberto) return 'ZERADO_COM_PO';
  if (params.temRmSemPedido) return 'ZERADO_COM_RM';
  const temMinimo = (params.minimo ?? 0) > 0 || (params.minimoSisten ?? 0) > 0;
  return params.teveMovimento && temMinimo ? 'ZERADO_SEM_REPOSICAO' : null;
}

const dataLocalISO = (data: Date) => {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
};

type DadosLinha = Omit<LinhaDossie, 'chave' | 'primeiraDoMaterial' | 'resumo' | 'rmRepetida' | 'pedidoCompartilhado' | 'alertaZerado'>;
type Pedido = ControleEstoqueAnalise['item']['pedidos'][number];

const montarEntregas = (pedido: Pedido | undefined): EntregaDossie[] => {
  let acumulado = 0;
  return (pedido?.entregas ?? []).map(entrega => {
    acumulado = Math.round((acumulado + entrega.quantidade) * 1e6) / 1e6;
    return {
      data: entrega.data,
      documento: entrega.documento,
      quantidade: entrega.quantidade,
      estorno: entrega.quantidade < 0 || entrega.tipo_movimento === '102',
      acumulado,
    };
  });
};

export function montarDossie(
  analises: ControleEstoqueAnalise[],
  minimoSistenPorMaterial: Map<string, number | null>,
  hoje: string = dataLocalISO(new Date()),
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
      foraZl0024: item.fora_zl0024 === true,
      ultimoMovimento: item.ultimo_movimento_geral ?? item.ultimo_movimento ?? null,
    };

    const dadosPedido = (pedido: Pedido | undefined, numero: string | null, itemPedido: string | null) => {
      const chegou = pedido?.quantidade_recebida_mb51 ?? null;
      const remessaPrevista = pedido?.remessa_prevista ?? null;
      return {
        pedido: numero,
        itemPedido: itemPedido ?? texto(pedido?.item),
        dataPedido: pedido?.data ?? null,
        remessaPrevista,
        pedidoAtrasado: !!pedido && pedido.quantidade_pendente > 0
          && remessaPrevista !== null && remessaPrevista.slice(0, 10) < hoje,
        quantidadePedida: pedido?.quantidade_pedida ?? null,
        situacao: calcularSituacaoChegada(numero !== null, pedido?.quantidade_pedida ?? null, chegou),
        quantidadeChegou: chegou !== null && chegou > 0 ? chegou : null,
        aChegar: pedido ? pedido.quantidade_pendente : null,
        entregas: montarEntregas(pedido),
        ultimaEntrega: pedido?.ultima_data_recebimento ?? null,
      };
    };

    const dados: DadosLinha[] = [];
    const pedidosUsados = new Map<string, Pedido>();
    const usos = new Map<string, number>();
    const marcarUso = (pedido: Pedido) => {
      const chave = chavePedido(texto(pedido.pedido), pedido.item);
      pedidosUsados.set(chave, pedido);
      usos.set(chave, (usos.get(chave) ?? 0) + 1);
    };

    for (const rm of item.rms) {
      const numeroPedido = texto(rm.pedido);
      const requisicao = texto(rm.requisicao);
      const candidatos = item.pedidos.filter(p => {
        if (numeroPedido) {
          return texto(p.pedido) === numeroPedido
            && (!texto(rm.item_pedido) || itemNorm(p.item) === itemNorm(rm.item_pedido));
        }
        return requisicao !== null && texto(p.requisicao) === requisicao;
      });
      const dadosRm = {
        ...base,
        rm: requisicao,
        itemRm: texto(rm.item),
        dataRm: rm.data,
        requisitante: texto(rm.requisitante),
        quantidadeSolicitada: rm.quantidade,
        existeRm: true,
      };
      if (candidatos.length === 0) {
        dados.push({
          ...dadosRm,
          situacaoRm: numeroPedido ? 'EM_PEDIDO' : 'SEM_PEDIDO',
          ...dadosPedido(undefined, numeroPedido, texto(rm.item_pedido)),
        });
        continue;
      }
      for (const pedido of candidatos) {
        marcarUso(pedido);
        dados.push({
          ...dadosRm,
          situacaoRm: pedido.quantidade_pendente > 0 ? 'EM_PEDIDO' : 'ATENDIDA',
          ...dadosPedido(pedido, texto(pedido.pedido), null),
        });
      }
    }

    for (const pedido of item.pedidos) {
      if (pedidosUsados.has(chavePedido(texto(pedido.pedido), pedido.item))) continue;
      if (!texto(pedido.pedido) || pedido.quantidade_pendente <= 0) continue;
      marcarUso(pedido);
      dados.push({
        ...base,
        rm: null,
        itemRm: null,
        dataRm: null,
        requisitante: null,
        quantidadeSolicitada: null,
        existeRm: false,
        situacaoRm: null,
        ...dadosPedido(pedido, texto(pedido.pedido), null),
      });
    }

    if (dados.length === 0) {
      dados.push({
        ...base,
        rm: null,
        itemRm: null,
        dataRm: null,
        requisitante: null,
        quantidadeSolicitada: null,
        existeRm: false,
        situacaoRm: null,
        ...dadosPedido(undefined, null, null),
      });
    }

    const pedidosContados = Array.from(pedidosUsados.values());
    const resumo: ResumoCompraDossie = {
      rms: item.rms.length,
      pedidos: pedidosContados.length,
      solicitado: item.rms.reduce((total, rm) => total + (rm.quantidade ?? 0), 0),
      pedido: pedidosContados.reduce((total, p) => total + (p.quantidade_pedida ?? 0), 0),
      chegou: pedidosContados.reduce((total, p) => total + Math.max(p.quantidade_recebida_mb51 ?? 0, 0), 0),
      aChegar: pedidosContados.reduce((total, p) => total + p.quantidade_pendente, 0),
    };

    const alertaZerado = calcularAlertaZerado({
      saldo: item.saldo_reposicao,
      temPedidoAberto: item.pedidos.some(p => p.quantidade_pendente > 0),
      temRmSemPedido: dados.some(l => l.situacaoRm === 'SEM_PEDIDO'),
      teveMovimento: base.ultimoMovimento !== null || item.entrada_quantidade > 0 || item.consumo_total > 0,
      minimo: faixa.estoqueMinimo,
      minimoSisten,
    });

    dados.forEach((linha, indice) => {
      const anterior = indice > 0 ? dados[indice - 1] : null;
      linhas.push({
        ...linha,
        chave: `${item.centro}-${item.material}-${indice}`,
        alertaZerado,
        primeiraDoMaterial: indice === 0,
        resumo: indice === 0 ? resumo : null,
        rmRepetida: !!anterior && linha.existeRm && anterior.rm === linha.rm && anterior.itemRm === linha.itemRm,
        pedidoCompartilhado: linha.pedido !== null
          && (usos.get(chavePedido(linha.pedido, linha.itemPedido)) ?? 0) > 1,
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

export const ROTULO_SITUACAO_RM: Record<SituacaoRm, string> = {
  SEM_PEDIDO: 'AGUARDANDO PEDIDO',
  EM_PEDIDO: 'EM PEDIDO',
  ATENDIDA: 'JÁ ATENDIDA',
};

export const ROTULO_ALERTA_ZERADO: Record<AlertaZerado, string> = {
  ZERADO_COM_PO: 'Zerado com PO aberta',
  ZERADO_COM_RM: 'Zerado com RM sem pedido',
  ZERADO_SEM_REPOSICAO: 'Zerado sem reposição',
};

export const ROTULO_SITUACAO_CHEGADA: Record<SituacaoChegada, string> = {
  SEM_PEDIDO: 'SEM PEDIDO',
  NAO: 'NÃO',
  PARCIAL: 'PARCIAL',
  SIM: 'SIM',
};

export const COLUNAS_DOSSIE = [
  'Material', 'Texto breve material', 'Total Stk (ZL0024)', 'UM Registro', 'Stk Mínimo', 'PR (RM)',
  'Sft STK (mínimo)', 'PR', 'STATUS', 'Cobertura (Dias)', 'RM', 'Item RM', 'Data RM', 'Requisitante',
  'Quant Solicitada', 'Existe RM?', 'PEDIDO', 'Item Pedido', 'Data Pedido', 'Quant. Pedida', 'Chegou?',
  'Quant. Chegou', 'A chegar', 'Nº Entregas', 'Última Entrega',
  'Situação RM', 'Remessa Prevista', 'PO Atrasada?', 'Estoque Zerado', 'Fora da ZL0024?', 'Último Movimento',
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
    linha.itemRm ?? '',
    linha.dataRm ?? '',
    linha.requisitante ?? '',
    linha.quantidadeSolicitada ?? '',
    linha.existeRm ? 'SIM' : 'NÃO',
    linha.pedido ?? '',
    linha.itemPedido ?? '',
    linha.dataPedido ?? '',
    linha.quantidadePedida ?? '',
    ROTULO_SITUACAO_CHEGADA[linha.situacao],
    linha.quantidadeChegou ?? '',
    linha.aChegar ?? '',
    linha.entregas.length,
    linha.ultimaEntrega ?? '',
    linha.situacaoRm ? ROTULO_SITUACAO_RM[linha.situacaoRm] : '',
    linha.remessaPrevista ?? '',
    linha.pedidoAtrasado ? 'SIM' : '',
    linha.alertaZerado ? ROTULO_ALERTA_ZERADO[linha.alertaZerado] : '',
    linha.foraZl0024 ? 'SIM' : 'NÃO',
    linha.ultimoMovimento ?? '',
  ]);
  const planilha = XLSX.utils.aoa_to_sheet([Array.from(COLUNAS_DOSSIE), ...dados]);
  planilha['!cols'] = [18, 44, 14, 10, 12, 10, 14, 10, 12, 12, 14, 9, 12, 16, 14, 11, 14, 9, 12, 13, 12, 13, 10, 11, 13, 18, 14, 11, 24, 12, 14].map(wch => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planilha, 'Dossie');
  return workbook;
}

export function exportarDossieExcel(linhas: LinhaDossie[]): void {
  XLSX.writeFile(criarWorkbookDossie(linhas), `dossie-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

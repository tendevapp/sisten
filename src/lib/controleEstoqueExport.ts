import * as XLSX from 'xlsx';
import type { ControleEstoqueItem } from '../types';
import type { FiltrosControleEstoque } from './controleEstoqueApi';
import { calcularFaixaDoItem as faixaDoItem } from './controleEstoque';

export interface ParametrosControleEstoqueExport {
  janela_inicio: string;
  janela_fim: string | null;
  lead_time_padrao_dias: number;
  intervalo_compra_dias: number;
}

const ajustarLarguras = (worksheet: XLSX.WorkSheet, larguras: number[]) => {
  worksheet['!cols'] = larguras.map(wch => ({ wch }));
};

export function criarWorkbookControleEstoque(
  dataset: ControleEstoqueItem[],
  filtros: FiltrosControleEstoque,
  parametros: ParametrosControleEstoqueExport,
  geradoEm = new Date(),
): XLSX.WorkBook {
  const calculados = dataset.map(item => ({ item, faixa: faixaDoItem(item) }));
  const totalCompra = calculados.reduce((total, linha) => total + (linha.faixa.valorComprar ?? 0), 0);
  const resumo = [
    { Indicador: 'Data/hora da exportação', Valor: geradoEm.toISOString() },
    { Indicador: 'Materiais no conjunto filtrado', Valor: dataset.length },
    { Indicador: 'Materiais críticos', Valor: calculados.filter(linha => linha.faixa.status === 'CRITICO').length },
    { Indicador: 'Materiais em alerta', Valor: calculados.filter(linha => linha.faixa.status === 'ALERTA').length },
    { Indicador: 'Materiais OK', Valor: calculados.filter(linha => linha.faixa.status === 'OK').length },
    { Indicador: 'Materiais com RM', Valor: dataset.filter(item => item.rms_abertas > 0).length },
    { Indicador: 'Materiais com PO', Valor: dataset.filter(item => item.pos_abertas > 0).length },
    { Indicador: 'Valor estimado de compra', Valor: totalCompra },
    { Indicador: 'Valor atual em estoque', Valor: dataset.reduce((total, item) => total + item.valor_estoque, 0) },
    { Indicador: 'Valor de entradas', Valor: dataset.reduce((total, item) => total + item.entrada_valor, 0) },
    { Indicador: 'Valor consumido', Valor: dataset.reduce((total, item) => total + item.consumo_valor, 0) },
  ];

  const controle = calculados.map(({ item, faixa }) => ({
    Material: String(item.material),
    Descrição: item.descricao,
    Centro: item.centro,
    Categoria: item.categoria,
    Aplicação: item.aplicacao,
    'Tipo de gestão': item.tipo_gestao,
    UMB: item.umb,
    'Curva ABC': item.curva_abc,
    'Saldo total': item.saldo_total,
    'Saldo para reposição': item.saldo_reposicao,
    'Consumo total': item.consumo_total,
    'Consumo/dia': faixa.consumoDia,
    'Estoque mínimo': faixa.estoqueMinimo,
    'Estoque máximo': faixa.estoqueMaximo,
    'Quantidade a comprar': faixa.quantidadeComprar,
    'Valor a comprar': faixa.valorComprar,
    Status: faixa.status,
    'Cobertura (dias)': faixa.coberturaDias,
    'Autonomia (torres)': faixa.autonomiaTorres,
    'RMs abertas': item.rms_abertas,
    'POs abertos': item.pos_abertas,
    'Quantidade recebida': item.quantidade_recebida,
    'Possui override': item.tem_override ? 'Sim' : 'Não',
    'Justificativa override': item.override_justificativa,
    'Lead time (dias)': item.lead_time_dias,
    'Intervalo de compra (dias)': item.intervalo_compra_dias,
    'Janela inicial': item.janela_inicio,
    'Janela final': item.janela_fim,
    'Dias úteis': item.dias_uteis,
    'Valor estoque': item.valor_estoque,
    'Preço médio SAP': item.preco_medio_sap,
  }));

  const movimentos = dataset.flatMap(item => item.movimentos_mensais.map(movimento => ({
    Material: String(item.material),
    Descrição: item.descricao,
    Centro: item.centro,
    Mês: movimento.mes,
    Entrada: movimento.entrada,
    Consumo: movimento.consumo,
    'Valor de entrada': movimento.valor_entrada,
    'Valor consumido': movimento.valor_consumo,
  })));

  const rmsPedidos = dataset.flatMap(item => [
    ...item.rms.map(rm => ({
      Material: String(item.material),
      Tipo: 'RM',
      Documento: rm.requisicao,
      Item: rm.item,
      Data: rm.data,
      Quantidade: rm.quantidade,
      Pendente: null,
      Pedido: rm.pedido,
      Fornecedor: null,
      Requisitante: rm.requisitante,
      Recebido: null,
      'Último recebimento': null,
    })),
    ...item.pedidos.map(pedido => ({
      Material: String(item.material),
      Tipo: 'PO',
      Documento: pedido.pedido,
      Item: pedido.item,
      Data: pedido.data,
      Quantidade: pedido.quantidade_pedida,
      Pendente: pedido.quantidade_pendente,
      Pedido: pedido.pedido,
      Fornecedor: pedido.fornecedor,
      Requisitante: null,
      Recebido: pedido.quantidade_recebida_mb51,
      'Último recebimento': pedido.ultima_data_recebimento,
    })),
  ]);

  const filtrosAtivos = Object.entries(filtros)
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([chave, valor]) => ({ Parâmetro: `Filtro: ${chave}`, Valor: String(valor) }));
  const parametrosLinhas = [
    { Parâmetro: 'Janela inicial', Valor: parametros.janela_inicio },
    { Parâmetro: 'Janela final', Valor: parametros.janela_fim ?? 'Última data da MB51' },
    { Parâmetro: 'Lead time padrão (dias)', Valor: parametros.lead_time_padrao_dias },
    { Parâmetro: 'Intervalo de compra (dias)', Valor: parametros.intervalo_compra_dias },
    { Parâmetro: 'Importação ZL0024 mais recente', Valor: dataset.map(i => i.estoque_importado_em).filter(Boolean).sort().at(-1) ?? '' },
    { Parâmetro: 'Importação MB51 mais recente', Valor: dataset.map(i => i.movimentos_importados_em).filter(Boolean).sort().at(-1) ?? '' },
    ...filtrosAtivos,
  ];

  const workbook = XLSX.utils.book_new();
  const wsResumo = XLSX.utils.json_to_sheet(resumo);
  const wsControle = XLSX.utils.json_to_sheet(controle);
  const wsMovimentos = XLSX.utils.json_to_sheet(movimentos);
  const wsRmsPedidos = XLSX.utils.json_to_sheet(rmsPedidos);
  const wsParametros = XLSX.utils.json_to_sheet(parametrosLinhas);
  ajustarLarguras(wsResumo, [34, 24]);
  ajustarLarguras(wsControle, [22, 42, 12, 24, 22, 18, 10, 12, 16, 20, 16, 16, 18, 18, 22, 18]);
  ajustarLarguras(wsMovimentos, [22, 42, 12, 14, 14, 14, 18, 18]);
  ajustarLarguras(wsRmsPedidos, [22, 10, 18, 10, 14, 14, 14, 18, 28, 22, 14, 18]);
  ajustarLarguras(wsParametros, [34, 32]);
  XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');
  XLSX.utils.book_append_sheet(workbook, wsControle, 'Controle_Estoque');
  XLSX.utils.book_append_sheet(workbook, wsMovimentos, 'Movimentacoes');
  XLSX.utils.book_append_sheet(workbook, wsRmsPedidos, 'RMs_Pedidos');
  XLSX.utils.book_append_sheet(workbook, wsParametros, 'Parametros');
  return workbook;
}

export function exportarControleEstoqueExcel(
  dataset: ControleEstoqueItem[],
  filtros: FiltrosControleEstoque,
  parametros: ParametrosControleEstoqueExport,
): void {
  const workbook = criarWorkbookControleEstoque(dataset, filtros, parametros);
  XLSX.writeFile(workbook, `controle-estoque-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

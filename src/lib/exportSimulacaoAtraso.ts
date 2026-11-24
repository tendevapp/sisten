import * as XLSX from 'xlsx';
import { metodoSimulacao, referenciaCotacoes, type CenarioAtraso, type simularAtraso } from './simulacaoAtraso';

type Resultado = ReturnType<typeof simularAtraso>;

function valores(r: Resultado['totais']) {
  return {
    'Principal devedor (R$)': (r.saldo + r.creditos) / 100,
    'Créditos (R$)': r.creditos / 100,
    'Saldo vencido (R$)': r.saldo / 100,
    'Multa (R$)': r.multa / 100,
    'Juros (R$)': r.juros / 100,
    'Multa + Juros (R$)': r.encargos / 100,
    'Saldo projetado (R$)': r.projetado / 100,
  };
}

export function montarPlanilhaSimulacao(c: CenarioAtraso, resultado: Resultado) {
  const wb = XLSX.utils.book_new();
  const { fornecedores, totais, foraDaBase } = resultado;
  const recorte = fornecedores.find(f => f.chave === c.fornecedor);
  const premissas = XLSX.utils.aoa_to_sheet([
    ['Parâmetro', 'Valor'],
    ['Data-base (vencimento anterior)', c.base], ['Pagamento simulado', c.pagamento],
    ['Última carga FBL1N', c.cargaFbl1n || 'Indisponível'],
    ['Multa única (%)', c.multa], ['Juros simples mensais (%)', c.juros],
    ['Vencimento de', c.vencimentoDe || 'Sem limite'], ['Vencimento até', c.vencimentoAte || 'Até a véspera da data-base'],
    ['Fornecedor', c.fornecedor ? (recorte?.nome || c.fornecedor) : 'Todos'],
    ['Fonte', 'FBL1N deduplicada · partidas em aberto na carga consultada'],
    ['Referência comercial', referenciaCotacoes], ['Cálculo', metodoSimulacao],
    ['Partidas vencidas fora da base em reais (moeda ou valor)', foraDaBase],
    ['Juros por dia adicional, estimativa (R$)', Math.round((totais.saldo + totais.creditos) * c.juros / 3000) / 100],
    ...Object.entries(valores(totais)),
  ]);
  premissas['!cols'] = [{ wch: 56 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, premissas, 'Premissas');
  function adicionar(nome: string, registros: Record<string, string | number>[]) {
    const ws = XLSX.utils.json_to_sheet(registros);
    const colunas = Object.keys(registros[0]);
    ws['!cols'] = colunas.map(coluna => ({ wch: coluna === 'Fornecedor' ? 46 : Math.max(16, coluna.length + 2) }));
    ws['!autofilter'] = { ref: ws['!ref']! };
    colunas.forEach((coluna, indice) => {
      if (coluna.endsWith('(R$)')) {
        for (let r = 1; r <= registros.length; r++) ws[XLSX.utils.encode_cell({ r, c: indice })].z = '#,##0.00';
      }
    });
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  if (fornecedores.length) {
    adicionar('Fornecedores', fornecedores.map(f => ({
      'Código SAP': f.codigo, Fornecedor: f.nome, Partidas: f.titulos.length, ...valores(f),
    })));
    adicionar('Partidas', fornecedores.flatMap(f => f.titulos.map(t => ({
      'Código SAP': f.codigo, Fornecedor: f.nome, 'ID FBL1N': t.partida.id,
      Empresa: t.partida.empresa || '', Documento: t.partida.numero_documento || '', Referência: t.partida.referencia || '',
      Parcela: t.partida.parcela || '', Tipo: t.partida.tipo_documento || '', Vencimento: t.partida.vencimento_liquido,
      'Dias em atraso': t.dias, ...valores(t),
    }))));
  }
  return wb;
}

export function exportarSimulacao(c: CenarioAtraso, resultado: Resultado) {
  XLSX.writeFile(montarPlanilhaSimulacao(c, resultado), 'Simulacao-FBL1N-' + c.base + '-pagamento-' + c.pagamento + '.xlsx');
}

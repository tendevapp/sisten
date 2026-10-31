/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura do "Detalhe da compra" do Mercado Livre colado pelo comprador na
 * Central de Compras. O texto copiado da página vem com vícios do leitor de
 * tela que o ML embute:
 *
 * - rótulos duplicados na mesma linha ("Pacote 1Pacote 1", "GrátisGrátis");
 * - valores sem vírgula, porque os centavos são sobrescritos na tela:
 *   "R$ 1.87874" é R$ 1.878,74. A mesma linha traz a forma falada
 *   "1878 reais com 74 centavos", que não é ambígua — é ela que vale;
 * - o nº do pagamento grudado na data: "Pagamento número 18548436270328 de
 *   outubro | # 185484362703" — vale o número depois do "#".
 *
 * Há dois modelos de página. "Detalhe da compra" traz "Produtos (n)", "Total",
 * a seção de pagamento/envio e os itens em blocos "Pacote N". "Detalhes da
 * transação" traz a data numa linha e o "#número" na seguinte, cada item como
 * descrição / "N unidades" / "R$ valor", "Desconto", "Frete" e "Total pago" —
 * sem forma de pagamento nem endereço.
 *
 * Tudo aqui é sugestão: o comprador confere e corrige antes de gravar.
 */

import { normalizarNumeroCompraMl } from './compraMercadoLivre';

export interface PacoteCompraMl {
  descricao: string;
  /** Valor total do pacote (não unitário) — a soma dos pacotes fecha o total da compra. */
  valor: number | null;
  quantidade: number | null;
}

export interface DetalheCompraMl {
  numeroCompra: string | null;
  /** AAAA-MM-DD. O ML mostra só dia e mês; o ano é o da data de referência. */
  dataCompra: string | null;
  qtdProdutos: number | null;
  valorProdutos: number | null;
  valorFrete: number | null;
  /** Desconto (positivo) do modelo "Detalhes da transação"; não é gravado — só confere a conta. */
  valorDesconto: number | null;
  valorTotal: number | null;
  formaPagamento: string | null;
  numeroPagamento: string | null;
  statusPagamento: string | null;
  endereco: string | null;
  pacotes: PacoteCompraMl[];
  /** Pontos que o comprador precisa conferir (soma que não fecha, campo não achado). */
  avisos: string[];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_RE = MESES.join('|').replace('ç', '(?:ç|c)');

const arred = (v: number): number => Math.round(v * 100) / 100;

/** "Pacote 1Pacote 1" → "Pacote 1". */
function semDuplicata(linha: string): string {
  const s = linha.trim();
  if (s.length % 2 === 0) {
    const meio = s.length / 2;
    if (s.slice(0, meio) === s.slice(meio)) return s.slice(0, meio).trim();
  }
  return s;
}

/**
 * Número de um "R$ ..." do ML, corrigindo a vírgula que some com os centavos
 * sobrescritos: "1.87874" → 1878,74; "22,18" → 22,18; "1.878" → 1878; "280" → 280.
 */
export function lerValorMl(bruto: string): number | null {
  const s = (bruto ?? '').replace(/[R$\s]/g, '');
  if (!/\d/.test(s)) return null;
  if (s.includes(',')) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? arred(n) : null;
  }
  const partes = s.split('.');
  const ultima = partes[partes.length - 1];
  if (partes.length > 1 && ultima.length === 5) {
    // Milhar com os centavos colados: 1.87874 → 1878.74
    const inteiro = partes.slice(0, -1).join('') + ultima.slice(0, 3);
    return arred(Number(`${inteiro}.${ultima.slice(3)}`));
  }
  if (partes.length > 1 && ultima.length <= 2) {
    // Ponto decimal digitado à mão: 1878.74
    return arred(Number(`${partes.slice(0, -1).join('')}.${ultima}`));
  }
  const n = Number(partes.join(''));
  return Number.isFinite(n) ? n : null;
}

/** Valor de uma linha: a forma falada ("1878 reais com 74 centavos") tem prioridade sobre "R$". */
function valorDaLinha(linha: string): number | null {
  const falado = linha.match(/(\d[\d.]*)\s+rea(?:l|is)(?:\s+com\s+(\d{1,2})\s+centavos?)?/i);
  if (falado) {
    const reais = Number(falado[1].replace(/\./g, ''));
    const centavos = falado[2] ? Number(falado[2]) : 0;
    return arred(reais + centavos / 100);
  }
  const soCentavos = linha.match(/(\d{1,2})\s+centavos?/i);
  if (soCentavos && !/R\$\s*\d/.test(linha)) return Number(soCentavos[1]) / 100;
  if (/gr[áa]tis/i.test(linha)) return 0;
  const rs = linha.match(/R\$\s*([\d.,]+)/);
  return rs ? lerValorMl(rs[1]) : null;
}

/** Primeiro valor nas linhas logo depois do rótulo (o ML repete o rótulo na linha seguinte). */
function valorApos(linhas: string[], rotulo: RegExp, inicio = 0): { valor: number | null; indice: number } {
  const i = linhas.findIndex((l, k) => k >= inicio && rotulo.test(l));
  if (i < 0) return { valor: null, indice: -1 };
  for (let k = i; k < Math.min(linhas.length, i + 4); k++) {
    const v = valorDaLinha(k === i ? linhas[k].replace(rotulo, '') : linhas[k]);
    if (v != null) return { valor: v, indice: i };
  }
  return { valor: null, indice: i };
}

function dataDoTexto(texto: string, referencia: Date): string | null {
  const m = texto.match(new RegExp(`(\\d{1,2})\\s+de\\s+(${MES_RE})(?:\\s+de\\s+(\\d{4}))?`, 'i'));
  if (!m) return null;
  const mesNome = m[2].toLowerCase().replace('marco', 'março');
  const mes = MESES.indexOf(mesNome) + 1;
  const dia = Number(m[1]);
  let ano = m[3] ? Number(m[3]) : referencia.getFullYear();
  // Sem ano: uma data "no futuro" é do ano passado (compra de dezembro lida em janeiro).
  if (!m[3] && (mes > referencia.getMonth() + 1 || (mes === referencia.getMonth() + 1 && dia > referencia.getDate()))) ano--;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function interpretarDetalheCompraMl(texto: string, referencia: Date = new Date()): DetalheCompraMl {
  const linhas = (texto ?? '').split(/\r?\n/).map(semDuplicata).filter(Boolean);
  const avisos: string[] = [];

  // O nº da compra é o primeiro "# <16 dígitos>"; o do pagamento é mais curto e vem depois.
  const numeroCompra = normalizarNumeroCompraMl(texto.match(/#\s*(\d{14,})/)?.[1] ?? '');
  const iCabecalho = linhas.findIndex(l => /#\s*\d{14,}/.test(l));
  const linhaCabecalho = iCabecalho >= 0 ? linhas[iCabecalho] : texto;
  // "Detalhes da transação" põe a data ("30 de outubro |") na linha de cima do "#número".
  const dataCompra = dataDoTexto(linhaCabecalho, referencia)
    ?? (iCabecalho > 0 ? dataDoTexto(linhas[iCabecalho - 1], referencia) : null);

  let qtdProdutos = Number(texto.match(/Produtos\s*\((\d+)\)/i)?.[1] ?? NaN);
  const produtos = valorApos(linhas, /^Produtos\s*\(\d+\)/i);
  const frete = valorApos(linhas, /^Frete$/i);
  const total = valorApos(linhas, /^Total(?:\s+pago)?$/i);
  const desconto = valorApos(linhas, /^Desconto$/i);

  const iPagamento = linhas.findIndex(l => /^Pagamento$/i.test(l));
  const formaPagamento = iPagamento >= 0 ? (linhas[iPagamento + 1] ?? null) : null;

  const linhaPagto = linhas.find(l => /Pagamento\s+n[úu]mero/i.test(l)) ?? '';
  let numeroPagamento = linhaPagto.match(/#\s*(\d{6,})/)?.[1] ?? null;
  if (!numeroPagamento) {
    // Sem o "#": tira o dia que o ML gruda no fim ("...70328 de outubro").
    const m = linhaPagto.match(new RegExp(`n[úu]mero\\s*(\\d{6,}?)(\\d{1,2})?\\s+de\\s+(?:${MES_RE})`, 'i'))
      ?? linhaPagto.match(/n[úu]mero\s*(\d{6,})/i);
    numeroPagamento = m?.[1] ?? null;
  }

  const statusPagamento = linhas.find(l => /^Pagamento\s+(pendente|aprovado|realizado|recusado|cancelado|em análise|creditado|devolvido)/i.test(l))
    ?? linhas.find(l => /^(Pago|Pagamento confirmado)$/i.test(l)) ?? null;

  // Endereço: entre o "Frete" da seção de envio (depois do pagamento) e o 1º pacote.
  // Sem seção de pagamento ("Detalhes da transação") não há endereço — o "Frete"
  // que existe é o do resumo, seguido de "Total pago".
  const iFreteEnvio = iPagamento < 0 ? -1 : linhas.findIndex((l, k) => k > iPagamento && /^Frete$/i.test(l));
  const iPrimeiroPacote = linhas.findIndex(l => /^Pacote\s+\d+$/i.test(l));
  let endereco: string | null = null;
  if (iFreteEnvio >= 0) {
    const fim = iPrimeiroPacote > iFreteEnvio ? iPrimeiroPacote : Math.min(linhas.length, iFreteEnvio + 4);
    const partes = linhas.slice(iFreteEnvio + 1, fim).filter(l => !/^(gr[áa]tis|frete)/i.test(l));
    endereco = partes.length ? partes.join(' — ') : null;
  }

  const pacotes: PacoteCompraMl[] = [];
  linhas.forEach((l, i) => {
    if (!/^Pacote\s+\d+$/i.test(l)) return;
    let descricao = '';
    let valor: number | null = null;
    let quantidade: number | null = null;
    for (let k = i + 1; k < linhas.length && !/^Pacote\s+\d+$/i.test(linhas[k]); k++) {
      const precoQtd = linhas[k].match(/^R\$\s*([\d.,]+)\s*(?:\|\s*(\d+)\s*unidades?)?/i);
      if (precoQtd) {
        valor = lerValorMl(precoQtd[1]);
        quantidade = precoQtd[2] ? Number(precoQtd[2]) : null;
        break;
      }
      if (!descricao) descricao = linhas[k];
    }
    if (descricao || valor != null) pacotes.push({ descricao, valor, quantidade });
  });

  // "Detalhes da transação": cada item é descrição / "N unidades" / "R$ valor".
  // O mesmo produto pode vir duas vezes (dois itens da compra) — os dois contam.
  if (pacotes.length === 0) {
    linhas.forEach((l, i) => {
      const un = l.match(/^(\d+)\s+unidades?$/i);
      if (!un || i === 0) return;
      const descricao = linhas[i - 1];
      if (/^R\$|^#|unidades?$/i.test(descricao)) return;
      const proxima = linhas.slice(i + 1, i + 3).find(x => /^R\$/.test(x));
      pacotes.push({ descricao, valor: proxima ? valorDaLinha(proxima) : null, quantidade: Number(un[1]) });
    });
  }

  // Sem "Produtos (n)", os produtos são a soma dos itens.
  let valorProdutos = produtos.valor;
  if (valorProdutos == null && pacotes.length && pacotes.every(p => p.valor != null)) {
    valorProdutos = arred(pacotes.reduce((s, p) => s + (p.valor ?? 0), 0));
    if (!Number.isFinite(qtdProdutos)) qtdProdutos = pacotes.reduce((s, p) => s + (p.quantidade ?? 0), 0);
  }

  const valorTotal = total.valor ?? produtos.valor;
  if (total.valor != null && produtos.valor == null && valorProdutos != null) {
    const esperado = arred(valorProdutos + (frete.valor ?? 0) - (desconto.valor ?? 0));
    if (Math.abs(esperado - total.valor) > 0.01) {
      avisos.push(`Itens + frete − desconto dão ${esperado.toFixed(2).replace('.', ',')}, mas o total pago é ${total.valor.toFixed(2).replace('.', ',')} — confira os valores.`);
    }
  }
  if (!numeroCompra) avisos.push('Nº da compra não encontrado no texto.');
  if (valorTotal == null) avisos.push('Total da compra não encontrado — digite o valor do boleto.');
  if (pacotes.length) {
    const soma = arred(pacotes.reduce((s, p) => s + (p.valor ?? 0), 0));
    if (produtos.valor != null && Math.abs(soma - produtos.valor) > 0.01) {
      avisos.push(`A soma dos pacotes (${soma.toFixed(2).replace('.', ',')}) não fecha com o valor dos produtos — confira os valores.`);
    }
    const unidades = pacotes.reduce((s, p) => s + (p.quantidade ?? 0), 0);
    if (Number.isFinite(qtdProdutos) && unidades && unidades !== qtdProdutos) {
      avisos.push(`Os pacotes somam ${unidades} unidades, mas a compra diz ${qtdProdutos}.`);
    }
  }

  return {
    numeroCompra,
    dataCompra,
    qtdProdutos: Number.isFinite(qtdProdutos) ? qtdProdutos : null,
    valorProdutos,
    valorFrete: frete.valor,
    valorDesconto: desconto.valor,
    valorTotal,
    formaPagamento,
    numeroPagamento,
    statusPagamento,
    endereco,
    pacotes,
    avisos,
  };
}

/** O texto colado parece um "Detalhe da compra" do ML (e não só o número)? */
export function pareceDetalheCompraMl(texto: string): boolean {
  return /Detalhes? da (compra|transa[çc][ãa]o)|Pacote\s+\d|Produtos\s*\(\d+\)|reais com|Total pago|^\d+\s+unidades?$/im.test(texto ?? '');
}

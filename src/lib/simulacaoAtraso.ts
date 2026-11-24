import { diasAte, estaVencida, nomeFornecedor, type PartidaPagar } from './contasPagar';

export interface PartidaSimulacao extends PartidaPagar {
  moeda_documento: string | null;
  referencia: string | null;
  parcela: string | null;
}

export const referenciaCotacoes = 'Em 24/11/2026, 43 das 795 propostas cadastradas mencionavam multa ou juros. Em 24 propostas, de 10 CNPJs, o texto previa multa de 2% e juros de 3% ao mês por atraso. A aplicação a cada título é uma hipótese de simulação.';
export const metodoSimulacao = 'Multa única sobre cada título devedor. Juros simples desde o vencimento até o pagamento, por dias corridos e mês de 30 dias. A multa e os juros são arredondados separadamente em cada partida. Créditos vencidos abatem o saldo sem gerar multa ou juros.';
export const taxasReferencia = { multa: 2, juros: 3 };

export function janeiroParaPagamento(base: string) {
  const ano = Number(base.slice(0, 4)) + (base.slice(5, 7) === '01' ? 0 : 1);
  const mes = ano + '-01';
  return { minimo: base > mes + '-01' ? base : mes + '-01', maximo: mes + '-31', inicial: base > mes + '-15' ? base : mes + '-15' };
}

export interface CenarioAtraso {
  base: string;
  cargaFbl1n?: string | null;
  pagamento: string;
  multa: number;
  juros: number;
  vencimentoDe: string;
  vencimentoAte: string;
  fornecedor: string;
}

export function validarCenario(c: CenarioAtraso) {
  const janeiro = janeiroParaPagamento(c.base);
  if (!/^\d{4}-01-(0[1-9]|[12]\d|3[01])$/.test(c.pagamento) || c.pagamento < janeiro.minimo || c.pagamento > janeiro.maximo)
    return 'Escolha uma data de pagamento no janeiro indicado.';
  if ([c.multa, c.juros].some(t => !Number.isFinite(t) || t < 0 || t > 100))
    return 'Informe taxas entre 0% e 100%. Para simular isenção, informe zero.';
  if (c.vencimentoDe && c.vencimentoAte && c.vencimentoDe > c.vencimentoAte)
    return 'O início do período de vencimento deve ser anterior ou igual ao fim.';
  return '';
}

export function chaveFornecedor(l: PartidaSimulacao) {
  return l.fornecedor?.trim() || 'nome:' + nomeFornecedor(l);
}

function totaisZerados() {
  return { saldo: 0, creditos: 0, multa: 0, juros: 0, encargos: 0, projetado: 0 };
}
type Totais = ReturnType<typeof totaisZerados>;
export type TituloSimulado = Totais & { partida: PartidaSimulacao; dias: number };
export type FornecedorSimulado = Totais & { chave: string; codigo: string; nome: string; titulos: TituloSimulado[] };

// Valores monetários em centavos até a exibição ou exportação.
function somar(destino: Totais, valores: Totais) {
  destino.saldo += valores.saldo;
  destino.creditos += valores.creditos;
  destino.multa += valores.multa;
  destino.juros += valores.juros;
  destino.encargos += valores.encargos;
  destino.projetado += valores.projetado;
}

export function simularAtraso(linhas: PartidaSimulacao[], c: CenarioAtraso) {
  const erro = validarCenario(c);
  if (erro) throw new Error(erro);
  const grupos = new Map<string, FornecedorSimulado>();
  const totais = totaisZerados();
  let foraDaBase = 0;
  for (const partida of linhas) {
    if (!estaVencida(partida, c.base)) continue;
    const vencimento = partida.vencimento_liquido!;
    const chave = chaveFornecedor(partida);
    if ((c.fornecedor && c.fornecedor !== chave) ||
        (c.vencimentoDe && vencimento < c.vencimentoDe) || (c.vencimentoAte && vencimento > c.vencimentoAte)) continue;
    if (partida.moeda_documento?.trim().toUpperCase() !== 'BRL' || partida.montante_moeda_doc == null) {
      foraDaBase++;
      continue;
    }
    const saldo = Math.round(-Number(partida.montante_moeda_doc) * 100);
    const devedor = Math.max(0, saldo);
    const dias = diasAte(c.pagamento, vencimento);
    const multa = Math.round(devedor * c.multa / 100);
    const juros = Math.round(devedor * c.juros * dias / 3000);
    const encargos = multa + juros;
    const titulo = { partida, dias, saldo, creditos: Math.max(0, -saldo), multa, juros, encargos, projetado: saldo + encargos };
    let grupo = grupos.get(chave);
    if (!grupo) {
      grupo = { ...totaisZerados(), chave, codigo: partida.fornecedor?.trim() || '', nome: nomeFornecedor(partida), titulos: [] };
      grupos.set(chave, grupo);
    }
    grupo.titulos.push(titulo);
    somar(grupo, titulo);
    somar(totais, titulo);
  }
  const fornecedores = [...grupos.values()].sort((a, b) => b.encargos - a.encargos || b.saldo - a.saldo || a.nome.localeCompare(b.nome));
  return { fornecedores, totais, foraDaBase };
}

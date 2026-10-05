/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sugestão do código de imposto SAP (`sup_impostos`, coluna "CI" da ZL0132 —
 * `EKPO-MWSKZ`) de cada item da cotação, para o comprador confirmar no export.
 *
 * O código junta duas decisões que moram em lugares diferentes:
 *
 * - **Prefixo = finalidade da compra** (I industrialização, H consumo com
 *   crédito de PIS/COFINS, C consumo sem crédito, D ativo). A cotação não
 *   diz isso; é decisão da TEN e muito estável por material (92% dos
 *   materiais comprados desde 2025 usaram um prefixo só). Vem do histórico
 *   de pedidos: primeiro o último CI do mesmo material + fornecedor, depois
 *   o mais usado no material. Sem histórico, chuta pelo tipo do material
 *   (código de projeto → I, demais → H) e marca confiança baixa.
 * - **Sufixo = tributação da operação** (ICMS, DIFAL, ST, IPI, Simples,
 *   ICMS 4%). Esta sim está na cotação: UF do fornecedor, alíquotas
 *   destacadas e CST/CSOSN. Conferido contra a ZL0136 de 2026: nos casos
 *   claros de consumo (C e H) a regra acerta ~100%.
 *
 * Na série I a regra erra mais — a NF costuma não destacar o IPI que o
 * cadastro do material manda tratar (I3 sem IPI na NF em 76% dos casos). Ali
 * o último CI do mesmo material + fornecedor vence a regra, e a divergência
 * fica visível.
 *
 * Sempre é sugestão: nada aqui grava o código; a tela pede a confirmação.
 */

export type ConfiancaCodigoImposto = 'alta' | 'media' | 'baixa';

/** Um uso anterior do código num pedido (linha da ZL0132). */
export interface UsoCodigoImposto {
  codigo: string;
  /** AAAA-MM-DD */
  data: string | null;
  pedido: string | null;
  /** CNPJ do fornecedor, só dígitos. */
  cnpj: string | null;
}

export interface EntradaSugestaoCodigoImposto {
  /** Código SAP do material — só para decidir o prefixo quando não há histórico. */
  material: string | null;
  /** CNPJ do fornecedor da cotação (qualquer formatação). */
  cnpj: string | null;
  ufFornecedor: string | null;
  aliqIcms: number | null;
  aliqIpi: number | null;
  /** CST/CSOSN como veio da proposta. */
  cst: string | null;
  /** Regime do fornecedor, quando se sabe (ZL0136). `null` = desconhecido. */
  simples?: boolean | null;
  /** Usos anteriores do código para este material, de qualquer fornecedor. */
  usosMaterial: readonly UsoCodigoImposto[];
  /** Códigos que existem em `sup_impostos`. */
  codigosValidos: ReadonlySet<string>;
  /** UF de destino da mercadoria (fábrica). */
  ufDestino?: string;
  /** Data de referência para "uso recente" (testes). */
  hoje?: string;
}

export type FonteSugestao = 'fornecedor' | 'material' | 'tipo';

export interface SugestaoCodigoImposto {
  codigo: string;
  confianca: ConfiancaCodigoImposto;
  /** De onde veio o prefixo (a finalidade). */
  fonte: FonteSugestao;
  /** Frases curtas para o tooltip — por que este código. */
  motivos: string[];
  /** Último uso do código para o mesmo material + fornecedor. */
  ultimoUso: UsoCodigoImposto | null;
  /** O último uso do mesmo fornecedor é um código diferente do sugerido. */
  divergeDoHistorico: boolean;
  /** Outros códigos já usados no material, para troca rápida. */
  alternativas: string[];
}

const PREFIXOS_COM_REGRA = new Set(['C', 'H', 'I', 'D']);

export const normalizarCnpjDigitos = (c: string | null | undefined) => String(c ?? '').replace(/\D/g, '');

/** Material de projeto: faixa de 18 dígitos iniciada em 100000000 (ver `HistoricoPedidoView.tipo_item`). */
export const ehMaterialDeProjeto = (material: string | null | undefined) =>
  /^100000000\d{9}$/.test(String(material ?? '').trim());

// ---------------------------------------------------------------------
// Perfil fiscal da cotação
// ---------------------------------------------------------------------

export interface PerfilFiscal {
  /** `null` = UF desconhecida e alíquota não decide. */
  dentroDaUf: boolean | null;
  icms: boolean;
  icms4: boolean;
  ipi: boolean;
  st: boolean;
  /** `null` = não dá para saber. */
  simples: boolean | null;
}

/** CSOSN sem ambiguidade com CST (origem + CST de 2 dígitos): 101–103 e 201–203. */
const CSOSN_SIMPLES = new Set(['101', '102', '103', '201', '202', '203']);

export function perfilFiscal(e: Pick<
  EntradaSugestaoCodigoImposto,
  'ufFornecedor' | 'aliqIcms' | 'aliqIpi' | 'cst' | 'simples' | 'ufDestino'
>): PerfilFiscal {
  const aliqIcms = e.aliqIcms ?? 0;
  const uf = (e.ufFornecedor ?? '').trim().toUpperCase();
  const destino = (e.ufDestino ?? 'BA').trim().toUpperCase();

  let dentroDaUf: boolean | null = null;
  if (uf) dentroDaUf = uf === destino;
  // Sem UF: 4/7/12% só existe em operação interestadual; 17% ou mais é alíquota interna.
  else if ([4, 7, 12].includes(aliqIcms)) dentroDaUf = false;
  else if (aliqIcms >= 17) dentroDaUf = true;

  const digitos = String(e.cst ?? '').replace(/\D/g, '');
  const csosn = digitos.length >= 3 ? digitos.slice(-3) : '';
  const cst2 = digitos.slice(-2);
  const st = ['201', '202', '203'].includes(csosn)
    || (digitos.length >= 2 && ['10', '30', '60', '70'].includes(cst2) && !CSOSN_SIMPLES.has(csosn));

  return {
    dentroDaUf,
    icms: aliqIcms > 0,
    icms4: aliqIcms === 4,
    ipi: (e.aliqIpi ?? 0) > 0,
    st,
    simples: e.simples ?? (CSOSN_SIMPLES.has(csosn) ? true : null),
  };
}

// ---------------------------------------------------------------------
// Regra do sufixo, por família de prefixo
// ---------------------------------------------------------------------

interface TabelaFamilia {
  sem: string;
  semIpi: string;
  /** ICMS destacado, operação interna (sem DIFAL). */
  interna: string;
  internaIpi: string;
  /** ICMS destacado, interestadual. */
  interestadual: string;
  interestadualIpi: string;
  icms4: string;
  icms4Ipi: string;
  st: string;
  stIpi: string;
  /** Fornecedor do Simples sem ICMS destacado, de fora da UF (DIFAL sobre o valor). */
  simplesFora: string;
  simplesForaIpi: string;
  simplesSt?: string;
  simplesStIpi?: string;
}

const FAMILIAS: Record<string, TabelaFamilia> = {
  C: {
    sem: 'C0', semIpi: 'C5', interna: 'C8', internaIpi: 'CA',
    interestadual: 'C1', interestadualIpi: 'C3', icms4: 'CN', icms4Ipi: 'CM',
    st: 'C2', stIpi: 'C4', simplesFora: 'C6', simplesForaIpi: 'C7', simplesSt: 'CB', simplesStIpi: 'CC',
  },
  H: {
    sem: 'H0', semIpi: 'H5', interna: 'H8', internaIpi: 'H9',
    interestadual: 'H1', interestadualIpi: 'H3', icms4: 'HM', icms4Ipi: 'HN',
    st: 'H2', stIpi: 'H4', simplesFora: 'H6', simplesForaIpi: 'H7',
  },
  // Industrialização credita ICMS e não paga DIFAL: interna e interestadual caem no mesmo código.
  I: {
    sem: 'I0', semIpi: 'I5', interna: 'I1', internaIpi: 'I3',
    interestadual: 'I1', interestadualIpi: 'I3', icms4: 'IM', icms4Ipi: 'IL',
    st: 'I2', stIpi: 'I4', simplesFora: 'I0', simplesForaIpi: 'I5',
  },
  // Ativo: só há D0/D1/D2 (CIAP + DIFAL); a regra é conservadora.
  D: {
    sem: 'D0', semIpi: 'D0', interna: 'D0', internaIpi: 'D0',
    interestadual: 'D1', interestadualIpi: 'D2', icms4: 'D1', icms4Ipi: 'D2',
    st: 'D1', stIpi: 'D2', simplesFora: 'D1', simplesForaIpi: 'D2',
  },
};

export interface CodigoPorRegra {
  codigo: string;
  /** Houve suposição (UF ou regime desconhecidos) — rebaixa a confiança. */
  suposicao: boolean;
  motivos: string[];
}

/** Sufixo pela tributação da cotação, dentro da família do prefixo. `null` se não há regra para o prefixo. */
export function codigoPorRegra(prefixo: string, p: PerfilFiscal): CodigoPorRegra | null {
  const t = FAMILIAS[prefixo];
  if (!t) return null;

  const motivos: string[] = [];
  let suposicao = false;

  const dentro = p.dentroDaUf;
  if (dentro === null) {
    suposicao = true;
    motivos.push('UF do fornecedor desconhecida — assumi operação interestadual');
  }
  const interna = dentro === true;

  // Fora da UF e sem ICMS destacado só pode ser Simples (ou isento): sem a informação, supõe Simples.
  let simples = p.simples;
  if (!p.icms && !interna && simples === null) {
    simples = true;
    suposicao = true;
    motivos.push('ICMS não destacado em operação interestadual — assumi fornecedor do Simples Nacional');
  }

  const ipiTxt = p.ipi ? ' + IPI' : '';
  let codigo: string;

  if (!p.icms) {
    if (!interna && simples) {
      codigo = p.ipi ? t.simplesForaIpi : t.simplesFora;
      motivos.push(`Simples Nacional fora da UF, sem ICMS destacado${ipiTxt}`);
    } else {
      codigo = p.ipi ? t.semIpi : t.sem;
      motivos.push(`Sem ICMS destacado${ipiTxt}`);
    }
  } else if (p.st) {
    if (simples && t.simplesSt && t.simplesStIpi) {
      codigo = p.ipi ? t.simplesStIpi : t.simplesSt;
      motivos.push(`ICMS com substituição tributária, Simples Nacional${ipiTxt}`);
    } else {
      codigo = p.ipi ? t.stIpi : t.st;
      motivos.push(`ICMS com substituição tributária${ipiTxt}`);
    }
  } else if (interna) {
    codigo = p.ipi ? t.internaIpi : t.interna;
    motivos.push(`ICMS destacado, operação interna${ipiTxt}`);
  } else if (p.icms4) {
    codigo = p.ipi ? t.icms4Ipi : t.icms4;
    motivos.push(`ICMS 4% (importado/FCI), interestadual${ipiTxt}`);
  } else {
    codigo = p.ipi ? t.interestadualIpi : t.interestadual;
    motivos.push(`ICMS destacado, interestadual${ipiTxt}`);
  }

  return { codigo, suposicao, motivos };
}

// ---------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------

const porDataDesc = (a: UsoCodigoImposto, b: UsoCodigoImposto) => (b.data ?? '').localeCompare(a.data ?? '');

/** Prefixo mais usado; em empate, o do uso mais recente. Considera os últimos 24 meses quando houver. */
function prefixoDoMaterial(usosOrdenados: readonly UsoCodigoImposto[], hoje: string): string | null {
  if (usosOrdenados.length === 0) return null;
  const limite = `${Number(hoje.slice(0, 4)) - 2}${hoje.slice(4)}`;
  const recentes = usosOrdenados.filter(u => (u.data ?? '') >= limite);
  const base = recentes.length > 0 ? recentes : usosOrdenados;

  const contagem = new Map<string, number>();
  for (const u of base) contagem.set(u.codigo[0], (contagem.get(u.codigo[0]) ?? 0) + 1);
  const melhor = Math.max(...contagem.values());
  // `base` está da data mais recente para a mais antiga: o primeiro que empata no topo é o mais recente.
  return base.find(u => contagem.get(u.codigo[0]) === melhor)!.codigo[0];
}

const NIVEIS: ConfiancaCodigoImposto[] = ['baixa', 'media', 'alta'];
const rebaixar = (c: ConfiancaCodigoImposto): ConfiancaCodigoImposto => NIVEIS[Math.max(0, NIVEIS.indexOf(c) - 1)];

const hojeISO = () => new Date().toISOString().slice(0, 10);

/**
 * Sugere o código de imposto de um item. `null` quando não há como sugerir
 * (sem histórico e sem regra aplicável, ou código fora de `sup_impostos`).
 */
export function sugerirCodigoImposto(e: EntradaSugestaoCodigoImposto): SugestaoCodigoImposto | null {
  const hoje = e.hoje ?? hojeISO();
  const usos = [...e.usosMaterial]
    .map(u => ({ ...u, codigo: u.codigo.trim().toUpperCase() }))
    .filter(u => u.codigo.length > 0)
    .sort(porDataDesc);
  const cnpj = normalizarCnpjDigitos(e.cnpj);
  const ultimoDoFornecedor = cnpj ? usos.find(u => normalizarCnpjDigitos(u.cnpj) === cnpj) ?? null : null;

  let fonte: FonteSugestao;
  let prefixo: string;
  if (ultimoDoFornecedor) {
    fonte = 'fornecedor';
    prefixo = ultimoDoFornecedor.codigo[0];
  } else {
    const doMaterial = prefixoDoMaterial(usos, hoje);
    if (doMaterial) { fonte = 'material'; prefixo = doMaterial; }
    else { fonte = 'tipo'; prefixo = ehMaterialDeProjeto(e.material) ? 'I' : 'H'; }
  }

  const motivos: string[] = [];
  motivos.push(
    fonte === 'fornecedor' ? `Finalidade (${prefixo}) igual ao último pedido deste fornecedor para o material`
      : fonte === 'material' ? `Finalidade (${prefixo}) mais usada nos pedidos do material, de outros fornecedores`
        : `Material sem histórico de pedido — finalidade ${prefixo} presumida pelo tipo do material; confira se é consumo, industrialização ou ativo`,
  );

  const perfil = perfilFiscal(e);
  const regra = PREFIXOS_COM_REGRA.has(prefixo) ? codigoPorRegra(prefixo, perfil) : null;
  const regraValida = regra && e.codigosValidos.has(regra.codigo) ? regra : null;

  let codigo: string;
  let confianca: ConfiancaCodigoImposto = fonte === 'fornecedor' ? 'alta' : fonte === 'material' ? 'media' : 'baixa';
  let divergeDoHistorico = false;

  if (!regraValida) {
    // Prefixo sem regra (REIDI, entrega futura, serviço...) ou código fora da tabela: o histórico é tudo o que há.
    const base = ultimoDoFornecedor ?? usos[0];
    if (!base || !e.codigosValidos.has(base.codigo)) return null;
    codigo = base.codigo;
    confianca = fonte === 'fornecedor' ? 'media' : 'baixa';
    motivos.push('Sem regra para esta família de código — repete o último uso');
  } else {
    motivos.push(...regraValida.motivos);
    codigo = regraValida.codigo;

    if (ultimoDoFornecedor && ultimoDoFornecedor.codigo !== codigo) {
      divergeDoHistorico = true;
      confianca = 'media';
      const historicoValido = e.codigosValidos.has(ultimoDoFornecedor.codigo);
      if (prefixo === 'I' && historicoValido) {
        // Na industrialização a regra é ruidosa (IPI do cadastro × NF): vale o que o SAP já usou.
        codigo = ultimoDoFornecedor.codigo;
        motivos.push(`A regra apontaria ${regraValida.codigo}, mas o pedido anterior deste fornecedor usou ${codigo} — na industrialização o histórico prevalece`);
      } else {
        motivos.push(`O último pedido deste fornecedor usou ${ultimoDoFornecedor.codigo}; as condições desta cotação indicam ${codigo} — confira o que mudou`);
      }
    } else if (ultimoDoFornecedor) {
      motivos.push(`Confirmado pelo último pedido do fornecedor (${ultimoDoFornecedor.codigo})`);
    }
    if (regraValida.suposicao) confianca = rebaixar(confianca);
  }

  if (!e.codigosValidos.has(codigo)) return null;

  const alternativas: string[] = [];
  for (const u of usos) {
    if (u.codigo !== codigo && !alternativas.includes(u.codigo) && e.codigosValidos.has(u.codigo)) alternativas.push(u.codigo);
    if (alternativas.length >= 3) break;
  }
  if (regraValida && regraValida.codigo !== codigo && !alternativas.includes(regraValida.codigo)) alternativas.unshift(regraValida.codigo);

  return { codigo, confianca, fonte, motivos, ultimoUso: ultimoDoFornecedor, divergeDoHistorico, alternativas: alternativas.slice(0, 3) };
}

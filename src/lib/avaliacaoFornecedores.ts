/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Suprimentos › Ava. Fornecedor — regras puras (sem banco).
 *
 * Dois registros convivem:
 *  - Ocorrências (rotina): um lançamento por fornecimento com várias
 *    ocorrências dentro. Cada tipo de ocorrência pertence a um critério do
 *    FRM.SUP-0005 e diz qual pergunta do questionário ele alimenta.
 *  - FRM.SUP-0005 (periódico): questionário de materiais com os pesos da
 *    planilha oficial. `calcularNotaFrm` reproduz a planilha; `sugerirRespostasFrm`
 *    propõe as respostas a partir das ocorrências do período.
 *
 * Gravidade (S) e detecção (D) de cada ocorrência já ficam gravadas para o
 * FMEA de Suprimentos; a frequência (O) sai da contagem por tipo.
 */

// ---------------------------------------------------------------------------
// Catálogo de ocorrências
// ---------------------------------------------------------------------------

export type CategoriaOcorrencia =
  | 'CUSTO' | 'PRAZO' | 'ENTREGA' | 'ATENDIMENTO' | 'QUALIDADE' | 'NOTA_FISCAL'
  | 'MEIO_AMBIENTE' | 'SMS' | 'RESP_SOCIAL' | 'CONDUTA' | 'OUTROS';

export interface CategoriaDef {
  id: CategoriaOcorrencia;
  rotulo: string;
  /** Cor base (CSS) do chip da categoria. */
  cor: string;
}

export const CATEGORIAS: CategoriaDef[] = [
  { id: 'PRAZO', rotulo: 'Prazo', cor: '#d97706' },
  { id: 'ENTREGA', rotulo: 'Entrega', cor: '#4f46e5' },
  { id: 'QUALIDADE', rotulo: 'Qualidade', cor: '#dc2626' },
  { id: 'NOTA_FISCAL', rotulo: 'Nota fiscal', cor: '#7c3aed' },
  { id: 'CUSTO', rotulo: 'Custo', cor: '#0891b2' },
  { id: 'ATENDIMENTO', rotulo: 'Atendimento', cor: '#2563eb' },
  { id: 'SMS', rotulo: 'Saúde e segurança', cor: '#ea580c' },
  { id: 'MEIO_AMBIENTE', rotulo: 'Meio ambiente', cor: '#16a34a' },
  { id: 'RESP_SOCIAL', rotulo: 'Resp. social', cor: '#0d9488' },
  { id: 'CONDUTA', rotulo: 'Conduta ética', cor: '#be123c' },
  { id: 'OUTROS', rotulo: 'Outros', cor: '#64748b' },
];

export const CATEGORIA_POR_ID: Record<CategoriaOcorrencia, CategoriaDef> =
  Object.fromEntries(CATEGORIAS.map(c => [c.id, c])) as Record<CategoriaOcorrencia, CategoriaDef>;

export interface TipoOcorrenciaDef {
  id: string;
  rotulo: string;
  categoria: CategoriaOcorrencia;
  /** Pergunta do FRM.SUP-0005 que este tipo pesa contra o fornecedor. */
  questaoFrm: string | null;
  /** Tipo genérico ("Outros"): o comprador precisa digitar o que foi. */
  exigeDescricao?: boolean;
}

export const TIPOS_OCORRENCIA: TipoOcorrenciaDef[] = [
  // Prazo
  { id: 'ATRASO_ENTREGA', rotulo: 'Atraso na entrega', categoria: 'PRAZO', questaoFrm: '2.1' },
  { id: 'PARCIAL_NAO_ALINHADA', rotulo: 'Entrega parcial sem alinhamento', categoria: 'PRAZO', questaoFrm: '2.1' },
  { id: 'IMPACTO_CRONOGRAMA', rotulo: 'Atraso impactou cronograma / produção', categoria: 'PRAZO', questaoFrm: '2.2' },
  // Entrega (logística do recebimento). Falha de conduta na entrega pesa em
  // Atendimento (3.1); o que afeta o material ou o documento, em Qualidade (4.1).
  { id: 'ENTREGA_SEM_AGENDAMENTO', rotulo: 'Sem agendamento / fora do horário de recebimento', categoria: 'ENTREGA', questaoFrm: '3.1' },
  { id: 'ENTREGA_ANTECIPADA', rotulo: 'Entrega antecipada sem aviso', categoria: 'ENTREGA', questaoFrm: '3.1' },
  { id: 'ENTREGA_LOCAL_ERRADO', rotulo: 'Entregou no local / endereço errado', categoria: 'ENTREGA', questaoFrm: '3.1' },
  { id: 'ENTREGA_DESCARGA', rotulo: 'Veículo ou descarga inadequados (sem munck, sem ajudante)', categoria: 'ENTREGA', questaoFrm: '3.1' },
  { id: 'ENTREGA_SEM_DOCUMENTO', rotulo: 'Material chegou sem NF / sem documentos', categoria: 'ENTREGA', questaoFrm: '4.1' },
  { id: 'ENTREGA_DANO_TRANSPORTE', rotulo: 'Avaria no transporte / carga mal acondicionada', categoria: 'ENTREGA', questaoFrm: '4.1' },
  { id: 'ENTREGA_SEM_IDENTIFICACAO', rotulo: 'Volumes sem identificação do PO / material', categoria: 'ENTREGA', questaoFrm: '4.1' },
  // Qualidade
  { id: 'AVARIA', rotulo: 'Material avariado', categoria: 'QUALIDADE', questaoFrm: '4.1' },
  { id: 'QTD_DIVERGENTE', rotulo: 'Quantidade divergente (falta / excedente)', categoria: 'QUALIDADE', questaoFrm: '4.1' },
  { id: 'MATERIAL_ERRADO', rotulo: 'Material errado / fora da especificação', categoria: 'QUALIDADE', questaoFrm: '4.3' },
  { id: 'DOC_QUALIDADE', rotulo: 'Sem certificado, laudo ou doc. de qualidade', categoria: 'QUALIDADE', questaoFrm: '4.2' },
  { id: 'EMBALAGEM', rotulo: 'Embalagem ou identificação inadequada', categoria: 'QUALIDADE', questaoFrm: '4.1' },
  // Nota fiscal (4.1 fala de "itens e/ou notas fiscais não conformes")
  { id: 'NF_DESACORDO', rotulo: 'NF em desacordo com o pedido', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'NF_IMPOSTO', rotulo: 'Erro de imposto, CFOP ou base na NF', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'NF_NCM', rotulo: 'NCM em desacordo', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'NF_REDUCAO_BASE', rotulo: 'Falta de redução de base de cálculo', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'NF_ALIQUOTA', rotulo: 'Falta de alíquota / alíquota errada', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  // Preço da NF diferente do que foi cotado: é a pergunta 1.1 (preço NF × pedido)
  { id: 'NF_VALOR_COTACAO', rotulo: 'Alteração de valor da cotação', categoria: 'NOTA_FISCAL', questaoFrm: '1.1' },
  { id: 'NF_INCOMPLETA', rotulo: 'NF sem nº do PO / documentação incompleta', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'ENTREGA_SEM_PEDIDO', rotulo: 'Entregou sem pedido / fora do PO', categoria: 'NOTA_FISCAL', questaoFrm: '4.1' },
  { id: 'NF_OUTROS', rotulo: 'Outros (descrever)', categoria: 'NOTA_FISCAL', questaoFrm: '4.1', exigeDescricao: true },
  // Custo
  { id: 'PRECO_NF_DIVERGENTE', rotulo: 'Preço da NF diferente do PO', categoria: 'CUSTO', questaoFrm: '1.1' },
  { id: 'REAJUSTE_NAO_ACORDADO', rotulo: 'Pediu reajuste não acordado', categoria: 'CUSTO', questaoFrm: '1.2' },
  { id: 'COBRANCA_EXTRA', rotulo: 'Cobrança extra não prevista (frete, taxa)', categoria: 'CUSTO', questaoFrm: '1.2' },
  // Atendimento
  { id: 'SEM_RETORNO', rotulo: 'Demora ou falta de retorno', categoria: 'ATENDIMENTO', questaoFrm: '3.1' },
  { id: 'NAO_ATENDEU_SOLICITACAO', rotulo: 'Não atendeu ajuste / solicitação', categoria: 'ATENDIMENTO', questaoFrm: '3.1' },
  // SMS / Meio ambiente / RS / Conduta
  { id: 'SMS_ENTREGA', rotulo: 'Descumpriu regra de segurança na entrega', categoria: 'SMS', questaoFrm: '6.1' },
  { id: 'DOC_SMS', rotulo: 'Faltou documento de SMS (FISPQ, NR...)', categoria: 'SMS', questaoFrm: '6.1' },
  { id: 'DOC_AMBIENTAL', rotulo: 'Faltou documento ambiental / descarte', categoria: 'MEIO_AMBIENTE', questaoFrm: '5.1' },
  { id: 'RESP_SOCIAL', rotulo: 'Descumpriu o Termo de Resp. Social', categoria: 'RESP_SOCIAL', questaoFrm: '7.1' },
  { id: 'CONDUTA', rotulo: 'Conduta inadequada / Código de Ética', categoria: 'CONDUTA', questaoFrm: '8.1' },
  // Outros
  { id: 'OUTRA', rotulo: 'Outra ocorrência', categoria: 'OUTROS', questaoFrm: null, exigeDescricao: true },
];

export const TIPO_POR_ID: Record<string, TipoOcorrenciaDef> =
  Object.fromEntries(TIPOS_OCORRENCIA.map(t => [t.id, t]));

export function tiposDaCategoria(categoria: CategoriaOcorrencia): TipoOcorrenciaDef[] {
  return TIPOS_OCORRENCIA.filter(t => t.categoria === categoria);
}

export function rotuloTipo(id: string | null | undefined): string {
  return (id && TIPO_POR_ID[id]?.rotulo) || 'Ocorrência';
}

export type Gravidade = 1 | 2 | 3;

export const GRAVIDADES: { valor: Gravidade; rotulo: string; dica: string; cor: string }[] = [
  { valor: 1, rotulo: 'Leve', dica: 'Resolvido sem afetar uso nem prazo', cor: '#16a34a' },
  { valor: 2, rotulo: 'Moderada', dica: 'Gerou retrabalho, espera ou custo', cor: '#d97706' },
  { valor: 3, rotulo: 'Grave', dica: 'Parou produção, obra ou gerou risco', cor: '#dc2626' },
];

export type Deteccao = 'RECEBIMENTO' | 'CONFERENCIA_FISCAL' | 'CENTRAL_FISCAL' | 'USO_PRODUCAO' | 'AVISO_FORNECEDOR' | 'COMPRADOR';

export const DETECCOES: { valor: Deteccao; rotulo: string }[] = [
  { valor: 'RECEBIMENTO', rotulo: 'No recebimento' },
  { valor: 'CONFERENCIA_FISCAL', rotulo: 'Na conferência da NF' },
  { valor: 'CENTRAL_FISCAL', rotulo: 'Pela Central Fiscal' },
  { valor: 'USO_PRODUCAO', rotulo: 'No uso / produção' },
  { valor: 'COMPRADOR', rotulo: 'Pelo comprador' },
  { valor: 'AVISO_FORNECEDOR', rotulo: 'Fornecedor avisou antes' },
];

export const IMPACTOS: { valor: string; rotulo: string }[] = [
  { valor: 'SEM_IMPACTO', rotulo: 'Sem impacto' },
  { valor: 'ATRASO_PRODUCAO', rotulo: 'Atrasou produção / obra' },
  { valor: 'PARADA', rotulo: 'Parou a produção' },
  { valor: 'RETRABALHO', rotulo: 'Retrabalho' },
  { valor: 'CUSTO_EXTRA', rotulo: 'Custo extra' },
  { valor: 'NOVA_COMPRA', rotulo: 'Precisou comprar de novo' },
];

export const ACOES: { valor: string; rotulo: string }[] = [
  { valor: 'NOTIFICADO', rotulo: 'Fornecedor notificado' },
  { valor: 'ALINHAMENTO', rotulo: 'Reunião / alinhamento' },
  { valor: 'DEVOLUCAO', rotulo: 'Devolução' },
  { valor: 'REPOSICAO', rotulo: 'Reposição' },
  { valor: 'DESCONTO', rotulo: 'Desconto / negociação' },
  { valor: 'CARTA_CORRECAO', rotulo: 'Carta de correção / NF nova' },
  { valor: 'SO_REGISTRO', rotulo: 'Apenas registro' },
];

export const ROTULO_ESTRELAS = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Ótimo'];

export interface ItemOcorrencia {
  /** Id local (React key / ordem). */
  id: string;
  tipo: string;
  categoria: CategoriaOcorrencia;
  gravidade: Gravidade;
  deteccao: Deteccao | null;
  descricao: string;
  /** Pendência que originou (REC:<id> / NF:<id>), quando veio de sugestão. */
  ref?: string | null;
}

export function novoItemOcorrencia(tipo = '', parcial: Partial<ItemOcorrencia> = {}): ItemOcorrencia {
  const def = TIPO_POR_ID[tipo];
  return {
    id: Math.random().toString(36).slice(2, 10),
    tipo,
    categoria: def?.categoria ?? 'OUTROS',
    gravidade: 1,
    deteccao: null,
    descricao: '',
    ref: null,
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Pendências → ocorrências sugeridas
// ---------------------------------------------------------------------------

/** Item de pendência devolvido pela RPC `sup_aval_sugestoes`. */
export interface RefPendencia {
  ref: string;
  origem: 'PEND_RECEBIMENTO' | 'PEND_NF';
  codigo?: string | null;
  motivo?: string | null;
  causa?: string | null;
  descricao?: string | null;
  material_code?: string | null;
  qtd_pedido?: number | null;
  qtd_recebida?: number | null;
  unidade?: string | null;
  observacao?: string | null;
  nc_codigo?: string | null;
  conferencia?: string | null;
  nota_fiscal?: string | null;
  status?: string | null;
  data?: string | null;
}

const TIPO_POR_MOTIVO: Record<string, string> = {
  parcial: 'PARCIAL_NAO_ALINHADA',
  falta: 'QTD_DIVERGENTE',
  excedente: 'QTD_DIVERGENTE',
  avaria: 'AVARIA',
  material_errado: 'MATERIAL_ERRADO',
  sem_pedido: 'ENTREGA_SEM_PEDIDO',
  outros: 'OUTRA',
};

const TIPO_POR_CAUSA_NF: Record<string, string> = {
  'Nota fiscal em desacordo com o pedido': 'NF_DESACORDO',
  'Divergência de valor, ICMS ou base de cálculo': 'NF_IMPOSTO',
  'Frete ou condição de frete': 'COBRANCA_EXTRA',
  'Documentação ou anexo faltando': 'NF_INCOMPLETA',
};

export const ROTULO_MOTIVO_PENDENCIA: Record<string, string> = {
  parcial: 'Entrega parcial',
  falta: 'Falta',
  excedente: 'Excedente',
  avaria: 'Avaria',
  material_errado: 'Material errado',
  sem_pedido: 'Sem pedido',
  outros: 'Outros',
};

export function tipoSugeridoDaPendencia(r: RefPendencia): string {
  if (r.origem === 'PEND_NF') return TIPO_POR_CAUSA_NF[r.causa || ''] || 'NF_DESACORDO';
  return TIPO_POR_MOTIVO[r.motivo || ''] || 'OUTRA';
}

export function rotuloRefPendencia(r: RefPendencia): string {
  if (r.origem === 'PEND_NF') return r.causa || 'Pendência na NF';
  return ROTULO_MOTIVO_PENDENCIA[r.motivo || ''] || 'Pendência de recebimento';
}

function descricaoDaPendencia(r: RefPendencia): string {
  if (r.origem === 'PEND_NF') {
    const partes = [r.nota_fiscal ? `NF ${r.nota_fiscal}` : '', r.observacao || ''].filter(Boolean);
    return partes.join(' — ');
  }
  const material = [r.material_code, r.descricao].filter(Boolean).join(' ');
  const qtd = r.qtd_pedido != null
    ? `pedido ${fmtQtd(r.qtd_pedido)}, recebido ${r.qtd_recebida != null ? fmtQtd(r.qtd_recebida) : '—'}${r.unidade ? ` ${r.unidade}` : ''}`
    : '';
  return [material, qtd, r.observacao ? `Almox: ${r.observacao}` : ''].filter(Boolean).join(' · ');
}

const fmtQtd = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/**
 * Converte as pendências de um PO em ocorrências do lançamento. Pendências do
 * mesmo tipo viram uma ocorrência só (descrições juntas), para o comprador não
 * ter que apagar repetidas — um PO com 5 itens avariados é UMA ocorrência de avaria.
 */
export function ocorrenciasDasPendencias(refs: RefPendencia[]): ItemOcorrencia[] {
  const porTipo = new Map<string, { refs: RefPendencia[] }>();
  for (const r of refs) {
    const tipo = tipoSugeridoDaPendencia(r);
    const g = porTipo.get(tipo) ?? { refs: [] };
    g.refs.push(r);
    porTipo.set(tipo, g);
  }
  return [...porTipo.entries()].map(([tipo, g]) => {
    const grave = g.refs.some(r => r.motivo === 'avaria' || r.motivo === 'material_errado');
    return novoItemOcorrencia(tipo, {
      gravidade: grave ? 2 : 1,
      deteccao: g.refs[0].origem === 'PEND_NF' ? 'CONFERENCIA_FISCAL' : 'RECEBIMENTO',
      descricao: g.refs.map(descricaoDaPendencia).filter(Boolean).join('\n'),
      ref: g.refs.map(r => r.ref).join(','),
    });
  });
}

// ---------------------------------------------------------------------------
// Validação do lançamento
// ---------------------------------------------------------------------------

export interface LancamentoOcorrenciaInput {
  fornecedor_nome: string;
  estrelas: number | null;
  ocorrencias: ItemOcorrencia[];
}

export function validarLancamento(l: LancamentoOcorrenciaInput): string | null {
  if (!l.fornecedor_nome.trim()) return 'Escolha o fornecedor.';
  if (l.ocorrencias.length === 0) return 'Inclua pelo menos uma ocorrência.';
  const semTipo = l.ocorrencias.findIndex(o => !o.tipo);
  if (semTipo >= 0) return `Escolha o tipo da ocorrência ${semTipo + 1}.`;
  const outraSemTexto = l.ocorrencias.findIndex(o => TIPO_POR_ID[o.tipo]?.exigeDescricao && !o.descricao.trim());
  if (outraSemTexto >= 0) return `Descreva a ocorrência ${outraSemTexto + 1} ("${rotuloTipo(l.ocorrencias[outraSemTexto].tipo)}").`;
  if (!l.estrelas) return 'Dê a nota do fornecimento (estrelas).';
  return null;
}

// ---------------------------------------------------------------------------
// FRM.SUP-0005 — Questionário para avaliação de desempenho de fornecedores (materiais)
// ---------------------------------------------------------------------------

export interface OpcaoFrm { valor: number; rotulo: string; nota: number }
export interface QuestaoFrm { id: string; texto: string; peso: number; opcoes: OpcaoFrm[] }
export interface CriterioFrm { id: string; titulo: string; rotuloCurto: string; peso: number; questoes: QuestaoFrm[] }

const SIM_RUIM: OpcaoFrm[] = [{ valor: 1, rotulo: 'Sim', nota: 0 }, { valor: 2, rotulo: 'Não', nota: 1 }];
const SIM_BOM: OpcaoFrm[] = [{ valor: 1, rotulo: 'Sim', nota: 1 }, { valor: 2, rotulo: 'Não', nota: 0 }];
const SIM_BOM_NA: OpcaoFrm[] = [...SIM_BOM, { valor: 3, rotulo: 'Não aplicável', nota: 1 }];

/** Pesos e notas por opção exatamente como na planilha do FRM.SUP-0005 Rev. 01. */
export const FRM_SUP_0005: CriterioFrm[] = [
  {
    id: 'CUSTO', titulo: '1. Custo', rotuloCurto: 'Custo', peso: 0.10, questoes: [
      { id: '1.1', texto: 'Houve divergência entre o preço informado na Nota Fiscal e o Pedido de compra?', peso: 0.5, opcoes: SIM_RUIM },
      { id: '1.2', texto: 'O fornecedor solicitou reajustes não acordados com o negociador ao longo do fornecimento?', peso: 0.5, opcoes: SIM_RUIM },
    ],
  },
  {
    id: 'PRAZO', titulo: '2. Confiabilidade de prazo', rotuloCurto: 'Prazo', peso: 0.20, questoes: [
      { id: '2.1', texto: 'Houve atraso na entrega do pedido?', peso: 0.5, opcoes: SIM_RUIM },
      { id: '2.2', texto: 'O fornecedor causou algum atraso no cronograma da obra?', peso: 0.5, opcoes: SIM_RUIM },
    ],
  },
  {
    id: 'ATENDIMENTO', titulo: '3. Atendimento', rotuloCurto: 'Atend.', peso: 0.10, questoes: [
      { id: '3.1', texto: 'O fornecedor possui presteza e flexibilidade para se adequar no atendimento às solicitações?', peso: 1, opcoes: SIM_BOM },
    ],
  },
  {
    id: 'QUALIDADE', titulo: '4. Qualidade', rotuloCurto: 'Qualidade', peso: 0.20, questoes: [
      {
        id: '4.1', texto: 'Qual o percentual de itens e/ou notas fiscais não conformes na entrega?', peso: 0.3, opcoes: [
          { valor: 1, rotulo: 'Alto — acima de 5%', nota: 0 },
          { valor: 2, rotulo: 'Médio — até 5%', nota: 0.5 },
          { valor: 3, rotulo: 'Nulo — 0%', nota: 1 },
        ],
      },
      { id: '4.2', texto: 'O fornecedor entrega as documentações de qualidade solicitadas?', peso: 0.3, opcoes: SIM_BOM },
      { id: '4.3', texto: 'O fornecedor atendeu às especificações técnicas e/ou normas relacionadas ao produto?', peso: 0.4, opcoes: SIM_BOM_NA },
    ],
  },
  {
    id: 'MEIO_AMBIENTE', titulo: '5. Meio ambiente', rotuloCurto: 'Meio Ambiente', peso: 0.10, questoes: [
      { id: '5.1', texto: 'O fornecedor entregou os documentos necessários para assegurar os requisitos ambientais de seu fornecimento?', peso: 1, opcoes: SIM_BOM_NA },
    ],
  },
  {
    id: 'SMS', titulo: '6. Saúde e segurança (QMSS)', rotuloCurto: 'SMS', peso: 0.10, questoes: [
      { id: '6.1', texto: 'O fornecedor entrega os documentos necessários para assegurar os requisitos de saúde e segurança de seu fornecimento?', peso: 1, opcoes: SIM_BOM_NA },
    ],
  },
  {
    id: 'RESP_SOCIAL', titulo: '7. Responsabilidade social', rotuloCurto: 'RS', peso: 0.10, questoes: [
      { id: '7.1', texto: 'O fornecedor entregou e atendeu nossos requisitos presentes no Termo de Compromisso de Responsabilidade Social?', peso: 1, opcoes: SIM_BOM },
    ],
  },
  {
    id: 'CONDUTA', titulo: '8. Conduta ética', rotuloCurto: 'Conduta Ética', peso: 0.10, questoes: [
      { id: '8.1', texto: 'O fornecedor agiu de forma a atender nosso Código de Ética e Conduta em 100% de suas atividades?', peso: 1, opcoes: SIM_BOM },
    ],
  },
];

export const QUESTOES_FRM: QuestaoFrm[] = FRM_SUP_0005.flatMap(c => c.questoes);

export type RespostasFrm = Record<string, number>;

export interface NotaFrm {
  /** Contribuição de cada critério para a nota final (ex.: CUSTO 0,05 = 5 p.p.). */
  porCriterio: Record<string, number>;
  /** Nota de cada questão (0–1) já respondida. */
  porQuestao: Record<string, number>;
  notaFinal: number;
  respondidas: number;
  total: number;
  completo: boolean;
}

/** Nota final = Σ critério.peso × Σ questão.peso × nota da opção (igual à planilha). */
export function calcularNotaFrm(respostas: RespostasFrm): NotaFrm {
  const porCriterio: Record<string, number> = {};
  const porQuestao: Record<string, number> = {};
  let respondidas = 0;
  for (const c of FRM_SUP_0005) {
    let soma = 0;
    for (const q of c.questoes) {
      const opcao = q.opcoes.find(o => o.valor === respostas[q.id]);
      if (!opcao) continue;
      respondidas++;
      porQuestao[q.id] = opcao.nota;
      soma += q.peso * opcao.nota;
    }
    porCriterio[c.id] = arred(c.peso * soma);
  }
  const notaFinal = arred(Object.values(porCriterio).reduce((a, b) => a + b, 0));
  return { porCriterio, porQuestao, notaFinal, respondidas, total: QUESTOES_FRM.length, completo: respondidas === QUESTOES_FRM.length };
}

const arred = (n: number) => Math.round(n * 10000) / 10000;

export type DecisaoFrm = 'MANTER' | 'DESENVOLVER' | 'DESQUALIFICAR';

export const DECISOES_FRM: { valor: DecisaoFrm; rotulo: string; cor: string }[] = [
  { valor: 'MANTER', rotulo: 'Manter fornecimento', cor: '#16a34a' },
  { valor: 'DESENVOLVER', rotulo: 'Desenvolvimento do fornecedor', cor: '#d97706' },
  { valor: 'DESQUALIFICAR', rotulo: 'Solicitar desqualificação', cor: '#dc2626' },
];

/**
 * Faixas da "Avaliação final". O FRM só traz o exemplo de 95% = Avaliação
 * Positiva; os cortes abaixo são o padrão do SISTEN até o procedimento
 * definir outros — mude aqui e a tela/PDF acompanham.
 */
export const FAIXAS_FRM: { min: number; classificacao: string; rotulo: string; decisao: DecisaoFrm; cor: string }[] = [
  { min: 0.8, classificacao: 'POSITIVA', rotulo: 'Avaliação Positiva', decisao: 'MANTER', cor: '#16a34a' },
  { min: 0.6, classificacao: 'REGULAR', rotulo: 'Avaliação Regular', decisao: 'DESENVOLVER', cor: '#d97706' },
  { min: 0, classificacao: 'NEGATIVA', rotulo: 'Avaliação Negativa', decisao: 'DESQUALIFICAR', cor: '#dc2626' },
];

export function faixaDaNota(nota: number) {
  return FAIXAS_FRM.find(f => nota >= f.min - 1e-9) ?? FAIXAS_FRM[FAIXAS_FRM.length - 1];
}

export function rotuloClassificacao(classificacao: string | null | undefined): string {
  return FAIXAS_FRM.find(f => f.classificacao === classificacao)?.rotulo ?? (classificacao || '—');
}

// ---------------------------------------------------------------------------
// Sugestão de respostas do FRM a partir das ocorrências do período
// ---------------------------------------------------------------------------

/** Ocorrência resumida (linha de `vw_sup_aval_ocorrencias_itens` ou do registro). */
export interface OcorrenciaResumo {
  tipo: string;
  codigo?: string | null;
  nro_pedido?: string | null;
  impactos?: string[] | null;
}

export interface SugestaoFrm {
  valor: number;
  motivo: string;
}

export interface BaseSugestaoFrm {
  ocorrencias: OcorrenciaResumo[];
  /** Pedidos do fornecedor no período (ZL0132). */
  pedidos: number;
}

/** Corte do 4.1 entre "Médio — até 5%" e "Alto — acima de 5%". */
export const LIMITE_41 = 0.05;

export function sugerirRespostasFrm(base: BaseSugestaoFrm): Record<string, SugestaoFrm> {
  const porQuestao = new Map<string, OcorrenciaResumo[]>();
  for (const o of base.ocorrencias) {
    const q = TIPO_POR_ID[o.tipo]?.questaoFrm;
    if (!q) continue;
    porQuestao.set(q, [...(porQuestao.get(q) ?? []), o]);
  }
  const lista = (q: string) => porQuestao.get(q) ?? [];
  const resumo = (ocs: OcorrenciaResumo[]) => {
    const codigos = [...new Set(ocs.map(o => o.codigo).filter(Boolean))];
    return `${ocs.length} ocorrência(s)${codigos.length ? `: ${codigos.slice(0, 4).join(', ')}${codigos.length > 4 ? '…' : ''}` : ''}`;
  };
  const semOcorrencia = 'Nenhuma ocorrência registrada no período';
  const out: Record<string, SugestaoFrm> = {};

  // Perguntas em que "Sim" é ruim (1 = Sim, 2 = Não)
  for (const q of ['1.1', '1.2', '2.1']) {
    const ocs = lista(q);
    out[q] = ocs.length ? { valor: 1, motivo: resumo(ocs) } : { valor: 2, motivo: semOcorrencia };
  }
  // 2.2: tipo próprio ou qualquer registro com impacto de atraso/parada
  const cronograma = [
    ...lista('2.2'),
    ...base.ocorrencias.filter(o => TIPO_POR_ID[o.tipo]?.questaoFrm !== '2.2'
      && (o.impactos || []).some(i => i === 'ATRASO_PRODUCAO' || i === 'PARADA')),
  ];
  out['2.2'] = cronograma.length ? { valor: 1, motivo: resumo(cronograma) } : { valor: 2, motivo: semOcorrencia };

  // Perguntas em que "Sim" é bom (1 = Sim, 2 = Não)
  for (const q of ['3.1', '4.2', '4.3', '7.1', '8.1']) {
    const ocs = lista(q);
    out[q] = ocs.length ? { valor: 2, motivo: resumo(ocs) } : { valor: 1, motivo: semOcorrencia };
  }
  // Documentos de MA/SMS: sem ocorrência, o mais comum em material é "Não aplicável"
  for (const q of ['5.1', '6.1']) {
    const ocs = lista(q);
    out[q] = ocs.length ? { valor: 2, motivo: resumo(ocs) } : { valor: 3, motivo: 'Sem ocorrência — confirme se o fornecimento exige documento' };
  }

  // 4.1: % de pedidos com item/NF não conforme
  const ocs41 = lista('4.1');
  // Sem PO, cada registro conta como um fornecimento afetado.
  const posAfetados = new Set(ocs41.map((o, i) => o.nro_pedido || o.codigo || `#${i}`));
  if (posAfetados.size === 0) {
    out['4.1'] = { valor: 3, motivo: semOcorrencia };
  } else {
    const denominador = Math.max(base.pedidos, posAfetados.size);
    const pct = posAfetados.size / denominador;
    const txt = `${posAfetados.size} de ${denominador} pedido(s) com não conformidade (${(pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;
    out['4.1'] = { valor: pct > LIMITE_41 ? 1 : 2, motivo: txt };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export interface LinhaPainel {
  chave: string;
  fornecedor_codigo: string | null;
  fornecedor_nome: string;
  cnpj: string | null;
  pedidos: number;
  itens: number;
  valor: number;
  itens_entregues: number;
  itens_no_prazo: number;
  registros: number;
  ocorrencias: number;
  pedidos_com_ocorrencia: number;
  por_categoria: Record<string, number>;
  por_tipo: Record<string, number>;
  estrelas_media: number | null;
  ultimo_registro: string | null;
  frm_codigo: string | null;
  frm_nota: number | null;
  frm_data: string | null;
  frm_decisao: DecisaoFrm | null;
}

/** OTD em fração (0–1) ou null quando não há item entregue com data prometida. */
export function otd(l: Pick<LinhaPainel, 'itens_entregues' | 'itens_no_prazo'>): number | null {
  return l.itens_entregues > 0 ? l.itens_no_prazo / l.itens_entregues : null;
}

/** % de pedidos do período que tiveram ocorrência registrada. */
export function taxaPedidosComOcorrencia(l: Pick<LinhaPainel, 'pedidos' | 'pedidos_com_ocorrencia'>): number | null {
  if (l.pedidos <= 0) return null;
  return Math.min(1, l.pedidos_com_ocorrencia / l.pedidos);
}

/** Avaliação FRM vencida: não existe ou tem mais de `meses` meses. */
export function frmVencida(dataFrm: string | null | undefined, hojeISO: string, meses = 12): boolean {
  if (!dataFrm) return true;
  const [a, m, d] = hojeISO.slice(0, 10).split('-').map(Number);
  const limite = new Date(Date.UTC(a, m - 1 - meses, d)).toISOString().slice(0, 10);
  return dataFrm.slice(0, 10) < limite;
}

/** Data ISO `meses` atrás (para o início do período), sem `new Date('aaaa-mm-dd')` local. */
export function subtrairMeses(hojeISO: string, meses: number): string {
  const [a, m, d] = hojeISO.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 - meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

export function normalizarBusca(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

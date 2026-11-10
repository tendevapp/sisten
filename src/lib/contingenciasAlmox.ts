/**
 * Contingências do almoxarifado — o que pode virar diferença no inventário.
 *
 * Toda saída física (Extraordinária de Projeto, Retirada sem saldo, Ficha de
 * EPI) só chega ao SAP pela Requisição no Balcão exportada e com documento SAP.
 * O banco (`alm_contingencias_verificar`, migration 20261110140000) procura os
 * elos quebrados desse caminho; aqui ficam os rótulos, a orientação de cada
 * verificação e a organização da lista para a tela.
 */

export type SeveridadeContingencia = 'critica' | 'alta' | 'media';

export type VerificacaoContingencia =
  | 'rss_sem_requisicao'
  | 'rss_nao_regularizada'
  | 'rss_regularizada_sem_requisicao'
  | 'rss_itens_divergentes'
  | 'rss_excluida_requisicao_viva'
  | 'epi_sem_requisicao'
  | 'epi_cancelada_requisicao_viva'
  | 'rqb_aguardando_confirmacao'
  | 'rqb_nao_exportada'
  | 'rqb_exportada_sem_doc'
  | 'rqb_doc_parcial'
  | 'sem_aguardando_regularizacao'
  | 'rss_aguardando_nf';

/** Correção que o banco sabe fazer sozinho, sem escolha a fazer. */
export type AcaoCorrecao = 'recriar_rqb' | 'regularizar_rss' | 'restaurar_rqb';

export interface TratativaContingencia {
  id: string;
  justificativa: string;
  por: string | null;
  em: string;
}

export interface Contingencia {
  verificacao: VerificacaoContingencia | string;
  severidade: SeveridadeContingencia;
  entidade: 'sol_extra' | 'req_balcao' | 'ficha_epi' | string;
  referencia: string;
  ref_id: string | null;
  data: string | null;
  dias: number | null;
  titulo: string;
  detalhe: string;
  acao: AcaoCorrecao | null;
  acao_ref: string | null;
  tratativa: TratativaContingencia | null;
}

export interface InfoVerificacao {
  rotulo: string;
  /** O que fazer — aparece no topo do grupo. */
  comoTratar: string;
}

export const VERIFICACOES: Record<VerificacaoContingencia, InfoVerificacao> = {
  rss_sem_requisicao: {
    rotulo: 'Retirada sem saldo sem requisição',
    comoTratar: 'O material saiu e nada vai baixá-lo no SAP. "Gerar requisição" cria de novo a Requisição no Balcão pendente com os itens da retirada.',
  },
  rss_nao_regularizada: {
    rotulo: 'Requisição confirmada, retirada pendente',
    comoTratar: 'A baixa já foi feita pela requisição; "Regularizar" fecha a retirada apontando para ela.',
  },
  rss_regularizada_sem_requisicao: {
    rotulo: 'Retirada regularizada sem requisição',
    comoTratar: 'Confira no SAP se a saída foi lançada. Se foi, justifique com o número do documento; se não, abra uma nova Requisição no Balcão.',
  },
  rss_itens_divergentes: {
    rotulo: 'Requisição diferente da retirada',
    comoTratar: 'Quantidade ou material da requisição não bate com o que saiu na retirada. Corrija a requisição ou justifique a diferença.',
  },
  rss_excluida_requisicao_viva: {
    rotulo: 'Retirada excluída, requisição valendo',
    comoTratar: 'Se o material voltou, exclua a requisição; se saiu mesmo, justifique.',
  },
  epi_sem_requisicao: {
    rotulo: 'EPI entregue sem requisição',
    comoTratar: 'A ficha entregou EPI e nenhuma requisição vai baixar no SAP. Confira a "possível substituta"; se não houver, "Restaurar" traz de volta a requisição excluída.',
  },
  epi_cancelada_requisicao_viva: {
    rotulo: 'Ficha cancelada com requisição',
    comoTratar: 'O EPI não foi entregue: exclua a requisição, ou peça o estorno no SAP se ela já tem documento.',
  },
  rqb_aguardando_confirmacao: {
    rotulo: 'Requisição de EPI sem confirmação',
    comoTratar: 'Confirme a requisição gerada pela ficha para que ela entre na próxima exportação.',
  },
  rqb_nao_exportada: {
    rotulo: 'Confirmada e não exportada',
    comoTratar: 'Exporte a requisição para o SAP em Requisição no Balcão › Não exportadas.',
  },
  rqb_exportada_sem_doc: {
    rotulo: 'Exportada sem documento SAP',
    comoTratar: 'Lance no SAP e importe a planilha concluída (ou informe o doc.). Se já foi lançada, justifique o lote com o número do documento.',
  },
  rqb_doc_parcial: {
    rotulo: 'Documento SAP em parte dos itens',
    comoTratar: 'Algum item não voltou com documento na importação. Confira no SAP e importe de novo ou justifique.',
  },
  sem_aguardando_regularizacao: {
    rotulo: 'Extraordinária de Projeto sem regularização',
    comoTratar: 'Regularize com o documento SAP em Solicitação Extraordinária › Registros.',
  },
  rss_aguardando_nf: {
    rotulo: 'Retirada sem saldo aguardando NF',
    comoTratar: 'A retirada espera saldo há muitos dias. Verifique com Suprimentos se a NF foi lançada (MIGO).',
  },
};

export const ROTULO_SEVERIDADE: Record<SeveridadeContingencia, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
};

export const ROTULO_CORRECAO: Record<AcaoCorrecao, string> = {
  recriar_rqb: 'Gerar requisição',
  regularizar_rss: 'Regularizar',
  restaurar_rqb: 'Restaurar requisição',
};

const PESO: Record<SeveridadeContingencia, number> = { critica: 0, alta: 1, media: 2 };

export function infoVerificacao(v: string): InfoVerificacao {
  return VERIFICACOES[v as VerificacaoContingencia] ?? { rotulo: v, comoTratar: '' };
}

export function piorSeveridade(lista: Pick<Contingencia, 'severidade'>[]): SeveridadeContingencia {
  return lista.reduce<SeveridadeContingencia>((pior, c) => (PESO[c.severidade] < PESO[pior] ? c.severidade : pior), 'media');
}

export interface ContagemSeveridade { critica: number; alta: number; media: number; total: number }

export function contarSeveridades(lista: Pick<Contingencia, 'severidade'>[]): ContagemSeveridade {
  const c: ContagemSeveridade = { critica: 0, alta: 0, media: 0, total: lista.length };
  for (const x of lista) c[x.severidade] += 1;
  return c;
}

export interface GrupoContingencia {
  verificacao: string;
  info: InfoVerificacao;
  severidade: SeveridadeContingencia;
  itens: Contingencia[];
}

/** Um grupo por verificação: o mais grave primeiro; dentro, o mais grave e o mais antigo. */
export function agruparContingencias(lista: Contingencia[]): GrupoContingencia[] {
  const mapa = new Map<string, Contingencia[]>();
  for (const c of lista) {
    const g = mapa.get(c.verificacao);
    if (g) g.push(c); else mapa.set(c.verificacao, [c]);
  }
  return [...mapa.entries()]
    .map(([verificacao, itens]) => ({
      verificacao,
      info: infoVerificacao(verificacao),
      severidade: piorSeveridade(itens),
      itens: [...itens].sort((a, b) => PESO[a.severidade] - PESO[b.severidade]
        || (b.dias ?? -1) - (a.dias ?? -1)
        || a.referencia.localeCompare(b.referencia)),
    }))
    .sort((a, b) => PESO[a.severidade] - PESO[b.severidade] || b.itens.length - a.itens.length || a.verificacao.localeCompare(b.verificacao));
}

/** Filtro de texto: código, título, detalhe ou referência da ação (ex.: arquivo exportado). */
export function filtrarContingencias(lista: Contingencia[], busca: string, severidade: SeveridadeContingencia | 'todas' = 'todas'): Contingencia[] {
  const termo = busca.trim().toUpperCase();
  return lista.filter(c => (severidade === 'todas' || c.severidade === severidade)
    && (!termo || [c.referencia, c.titulo, c.detalhe, c.acao_ref ?? ''].some(t => t.toUpperCase().includes(termo))));
}

/** Código da Requisição no Balcão viva que a tela pode abrir para corrigir, se houver. */
export function requisicaoParaAbrir(c: Contingencia): string | null {
  if (c.entidade === 'req_balcao') return c.referencia;
  if (c.verificacao === 'rss_nao_regularizada') return c.acao_ref;
  return null;
}

export const JUSTIFICATIVA_MINIMA = 15;

/** Valor do log (texto, número, lista de itens) em uma linha legível. */
export function textoValorLog(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (Array.isArray(v)) {
    return v.map(i => (i && typeof i === 'object' && 'material' in i
      ? `${String((i as Record<string, unknown>).material ?? '')} × ${String((i as Record<string, unknown>).quantidade ?? '')}`
      : textoValorLog(i))).join('; ') || '—';
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

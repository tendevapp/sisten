/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin > Equipes — volumetria, cronoanálise e indicadores por equipe.
 *
 * Tudo sai do que os formulários já gravam (quem fez e quando), trazido pela
 * função `adm_equipes_eventos` como uma lista de eventos. Aqui fica a regra
 * pura: recortes de período, catálogo de indicadores por processo, ritmo
 * (tempo entre ações seguidas), distribuição por hora e o HISTÓRICO — o
 * período escolhido contra os anteriores equivalentes, da própria pessoa (ou
 * da equipe). Não há ranking nem comparação com colegas.
 *
 * Princípio de gestão: volume e tempo são fatos para conversar, não nota.
 * A pessoa é comparada com ela mesma: esta semana contra as anteriores.
 */

import { diaLocal } from './sessaoDiaria';

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export type TipoEvento =
  | 'receb_conferencia' | 'receb_nc' | 'chegada'
  | 'cadastro_item' | 'cadastro_alteracao' | 'cadastro_foto'
  | 'inv_contagem'
  | 'balcao_requisicao' | 'balcao_baixa_sap' | 'balcao_confirmacao'
  | 'sol_extra' | 'sol_extra_regularizacao'
  | 'proj_movimento'
  | 'sup_pedido' | 'sup_entrega' | 'sup_assumiu' | 'sup_pedido_emitido'
  | 'sup_cotacao' | 'sup_proposta' | 'sup_mapa_decisao'
  | 'sup_chamado_resolvido' | 'sup_diligenciamento'
  | 'sup_carteira'
  | 'uso_dia';

/** Evento como vem da função: t tipo, u pessoa, em instante, q quantidade, d segundos de ciclo, f marcador, n número, v valor em R$. */
export interface EventoEquipe {
  t: TipoEvento;
  u: string;
  em: string;
  q: number | null;
  d: number | null;
  f: boolean | null;
  n: number | null;
  v?: number | null;
}

export interface PessoaEquipe {
  id: string;
  nome: string;
  setor: string | null;
  status: string | null;
  cargo: string | null;
}

export interface DadosEquipes {
  de: string;
  ate: string;
  pessoas: PessoaEquipe[];
  eventos: EventoEquipe[];
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export type Recorte = 'hoje' | 'ontem' | 'semana' | 'semana_passada' | 'mes' | 'mes_passado' | 'periodo';

export const OPCOES_RECORTE: { valor: Recorte; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: 'ontem', rotulo: 'Ontem' },
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'semana_passada', rotulo: 'Semana passada' },
  { valor: 'mes', rotulo: 'Este mês' },
  { valor: 'mes_passado', rotulo: 'Mês passado' },
  { valor: 'periodo', rotulo: 'Período…' },
];

const somarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Intervalo [de, até] em AAAA-MM-DD, pelo dia local. Semana de segunda a domingo. */
export function intervaloRecorte(recorte: Recorte, periodo: { de: string; ate: string }, agora = new Date()): { de: string; ate: string } {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const segunda = somarDias(hoje, -((hoje.getDay() + 6) % 7));
  switch (recorte) {
    case 'hoje': return { de: diaLocal(hoje), ate: diaLocal(hoje) };
    case 'ontem': { const o = somarDias(hoje, -1); return { de: diaLocal(o), ate: diaLocal(o) }; }
    case 'semana': return { de: diaLocal(segunda), ate: diaLocal(hoje) };
    case 'semana_passada': return { de: diaLocal(somarDias(segunda, -7)), ate: diaLocal(somarDias(segunda, -1)) };
    case 'mes': return { de: diaLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: diaLocal(hoje) };
    case 'mes_passado': return {
      de: diaLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
      ate: diaLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
    };
    case 'periodo': {
      const de = periodo.de || diaLocal(hoje);
      const ate = periodo.ate || de;
      return de <= ate ? { de, ate } : { de: ate, ate: de };
    }
  }
}

/** Dias do intervalo, inclusive (texto AAAA-MM-DD — sem `new Date('AAAA-MM-DD')`, que cai no dia anterior em UTC-3). */
export function diasDoIntervalo(de: string, ate: string): string[] {
  const [a, m, d] = de.split('-').map(Number);
  const dias: string[] = [];
  for (let x = new Date(a, m - 1, d); diaLocal(x) <= ate && dias.length < 401; x = somarDias(x, 1)) dias.push(diaLocal(x));
  return dias;
}

/** "02/11/2026" a partir de AAAA-MM-DD. */
export const dataBr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

export const diaDoEvento = (e: EventoEquipe) => diaLocal(new Date(e.em));

// ---------------------------------------------------------------------------
// Processos e indicadores
// ---------------------------------------------------------------------------

export type IdProcesso =
  | 'recebimento' | 'cadastro' | 'inventario' | 'balcao' | 'extraordinaria' | 'projetos'
  | 'compras' | 'cotacoes' | 'atendimento' | 'carteira'
  | 'uso';

export interface Processo {
  id: IdProcesso;
  rotulo: string;
  /** Setores (core_setores.id) em que o processo faz parte da rotina; '*' = todos. */
  setores: string[] | '*';
  tipos: TipoEvento[];
}

export const SETOR_ALMOXARIFADO = '2';
export const SETOR_SUPRIMENTOS = '5';
/** Equipes com indicadores de processo — as demais só têm o uso do SISTEN. */
export const SETORES_COM_PROCESSOS = [SETOR_ALMOXARIFADO, SETOR_SUPRIMENTOS];

export const PROCESSOS: Processo[] = [
  { id: 'recebimento', rotulo: 'Recebimento', setores: [SETOR_ALMOXARIFADO], tipos: ['chegada', 'receb_conferencia', 'receb_nc'] },
  { id: 'cadastro', rotulo: 'Cadastro de itens', setores: [SETOR_ALMOXARIFADO], tipos: ['cadastro_item', 'cadastro_alteracao', 'cadastro_foto'] },
  { id: 'inventario', rotulo: 'Inventário cíclico', setores: [SETOR_ALMOXARIFADO], tipos: ['inv_contagem'] },
  { id: 'balcao', rotulo: 'Balcão (baixas)', setores: [SETOR_ALMOXARIFADO], tipos: ['balcao_requisicao', 'balcao_baixa_sap', 'balcao_confirmacao'] },
  { id: 'extraordinaria', rotulo: 'Solicitação extraordinária', setores: [SETOR_ALMOXARIFADO], tipos: ['sol_extra', 'sol_extra_regularizacao'] },
  { id: 'projetos', rotulo: 'Projetos (peças)', setores: [SETOR_ALMOXARIFADO], tipos: ['proj_movimento'] },
  { id: 'compras', rotulo: 'Compras e pedidos', setores: [SETOR_SUPRIMENTOS], tipos: ['sup_pedido', 'sup_entrega', 'sup_assumiu', 'sup_pedido_emitido'] },
  { id: 'cotacoes', rotulo: 'Cotações', setores: [SETOR_SUPRIMENTOS], tipos: ['sup_cotacao', 'sup_proposta', 'sup_mapa_decisao'] },
  { id: 'atendimento', rotulo: 'Chamados e diligenciamento', setores: [SETOR_SUPRIMENTOS], tipos: ['sup_chamado_resolvido', 'sup_diligenciamento'] },
  { id: 'carteira', rotulo: 'Carteira aberta (hoje)', setores: [SETOR_SUPRIMENTOS], tipos: ['sup_carteira'] },
  { id: 'uso', rotulo: 'Uso do SISTEN', setores: '*', tipos: ['uso_dia'] },
];

export type FormatoIndicador = 'int' | 'pct' | 'tempo' | 'dec' | 'brl';

export interface DefIndicador {
  id: string;
  processo: IdProcesso;
  rotulo: string;
  /** O que o número é, em uma frase — vai para a tela e para o PDF. */
  descricao: string;
  formato: FormatoIndicador;
  /** Dá para dizer se melhorou ou piorou no histórico (falso = só informa: valor comprado, NCs, OTD…). */
  comparar: boolean;
  /** Para tempo: menor é melhor. */
  menorMelhor?: boolean;
  /** Indicador principal do processo (cartão e tabela por colaborador). */
  principal?: boolean;
  calcular: (ev: readonly EventoEquipe[]) => number | null;
}

const doTipo = (ev: readonly EventoEquipe[], ...tipos: TipoEvento[]) => ev.filter(e => tipos.includes(e.t));
const contar = (...tipos: TipoEvento[]) => (ev: readonly EventoEquipe[]) => doTipo(ev, ...tipos).length;
const somarQ = (...tipos: TipoEvento[]) => (ev: readonly EventoEquipe[]) => doTipo(ev, ...tipos).reduce((s, e) => s + (Number(e.q) || 0), 0);
const somarV = (...tipos: TipoEvento[]) => (ev: readonly EventoEquipe[]) => doTipo(ev, ...tipos).reduce((s, e) => s + (Number(e.v) || 0), 0);

export function mediana(valores: readonly number[]): number | null {
  const v = valores.filter(x => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const medianaD = (filtro: (e: EventoEquipe) => boolean, ...tipos: TipoEvento[]) => (ev: readonly EventoEquipe[]) =>
  mediana(doTipo(ev, ...tipos).filter(filtro).map(e => Number(e.d)).filter(d => Number.isFinite(d) && d >= 0));

const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

/** Intervalo entre ações seguidas que conta como ritmo: abaixo é lote (importação), acima é pausa. */
export const RITMO_MIN_S = 5;
export const RITMO_MAX_S = 30 * 60;

/**
 * Ritmo: mediana dos intervalos entre duas ações seguidas da MESMA pessoa no
 * mesmo dia, nos tipos dados. Intervalo < 5 s é lote; > 30 min é pausa.
 */
export function ritmoMediano(ev: readonly EventoEquipe[], tipos: TipoEvento[]): number | null {
  const porPessoaDia = new Map<string, number[]>();
  for (const e of doTipo(ev, ...tipos)) {
    const chave = `${e.u}|${diaDoEvento(e)}`;
    const lista = porPessoaDia.get(chave) ?? [];
    lista.push(new Date(e.em).getTime());
    porPessoaDia.set(chave, lista);
  }
  const gaps: number[] = [];
  for (const lista of porPessoaDia.values()) {
    lista.sort((a, b) => a - b);
    for (let i = 1; i < lista.length; i++) {
      const s = (lista[i] - lista[i - 1]) / 1000;
      if (s >= RITMO_MIN_S && s <= RITMO_MAX_S) gaps.push(s);
    }
  }
  return mediana(gaps);
}

export const INDICADORES: DefIndicador[] = [
  // Recebimento
  { id: 'receb_conferencias', processo: 'recebimento', rotulo: 'Conferências', descricao: 'Conferências de recebimento registradas.', formato: 'int', comparar: true, principal: true, calcular: contar('receb_conferencia') },
  { id: 'receb_itens', processo: 'recebimento', rotulo: 'Itens conferidos', descricao: 'Linhas de item conferidas nas conferências.', formato: 'int', comparar: true, principal: true, calcular: somarQ('receb_conferencia') },
  { id: 'receb_chegadas', processo: 'recebimento', rotulo: 'Chegadas registradas', descricao: 'Chegadas de material registradas no almoxarifado.', formato: 'int', comparar: true, calcular: contar('chegada') },
  { id: 'receb_nc', processo: 'recebimento', rotulo: 'Não conformidades', descricao: 'NCs de recebimento abertas.', formato: 'int', comparar: false, calcular: contar('receb_nc') },
  { id: 'receb_pct_nc', processo: 'recebimento', rotulo: '% conferências com NC', descricao: 'NCs abertas ÷ conferências do período.', formato: 'pct', comparar: false, calcular: ev => pct(contar('receb_nc')(ev), contar('receb_conferencia')(ev)) },
  { id: 'receb_tempo_nc', processo: 'recebimento', rotulo: 'Tempo para resolver NC', descricao: 'Mediana entre abrir e resolver a NC (só as resolvidas).', formato: 'tempo', comparar: false, menorMelhor: true, calcular: medianaD(e => e.f === true, 'receb_nc') },
  { id: 'receb_ritmo', processo: 'recebimento', rotulo: 'Ritmo entre conferências', descricao: 'Mediana do intervalo entre duas conferências seguidas da mesma pessoa no dia.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: ev => ritmoMediano(ev, ['receb_conferencia']) },
  // Cadastro de itens
  { id: 'cad_itens', processo: 'cadastro', rotulo: 'Itens cadastrados', descricao: 'Itens novos no Cadastro de Itens.', formato: 'int', comparar: true, principal: true, calcular: contar('cadastro_item') },
  { id: 'cad_alteracoes', processo: 'cadastro', rotulo: 'Cadastros atualizados', descricao: 'Itens cuja última alteração (foto, posição, etiqueta) foi no período — a tabela guarda só a mais recente.', formato: 'int', comparar: true, principal: true, calcular: contar('cadastro_alteracao') },
  { id: 'cad_fotos', processo: 'cadastro', rotulo: 'Fotos adicionais', descricao: 'Fotos adicionais anexadas aos itens.', formato: 'int', comparar: true, calcular: contar('cadastro_foto') },
  { id: 'cad_ritmo', processo: 'cadastro', rotulo: 'Ritmo de cadastro', descricao: 'Mediana do intervalo entre dois cadastros/atualizações seguidos da mesma pessoa no dia.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: ev => ritmoMediano(ev, ['cadastro_item', 'cadastro_alteracao']) },
  // Inventário
  { id: 'inv_contagens', processo: 'inventario', rotulo: 'Contagens', descricao: 'Contagens enviadas no Inventário Cíclico.', formato: 'int', comparar: true, principal: true, calcular: contar('inv_contagem') },
  { id: 'inv_acuracidade', processo: 'inventario', rotulo: 'Acuracidade na 1ª contagem', descricao: '1ªs contagens que bateram com o saldo ÷ 1ªs contagens.', formato: 'pct', comparar: true, principal: true, calcular: ev => {
    const primeiras = doTipo(ev, 'inv_contagem').filter(e => (e.n ?? 1) === 1);
    return pct(primeiras.filter(e => e.f === false).length, primeiras.length);
  } },
  { id: 'inv_recontagens', processo: 'inventario', rotulo: 'Recontagens', descricao: 'Contagens de 2ª ou 3ª rodada.', formato: 'int', comparar: false, calcular: ev => doTipo(ev, 'inv_contagem').filter(e => (e.n ?? 1) >= 2).length },
  { id: 'inv_tempo', processo: 'inventario', rotulo: 'Tempo por contagem', descricao: 'Mediana da duração gravada de cada contagem (abrir → enviar).', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'inv_contagem') },
  // Balcão
  { id: 'bal_requisicoes', processo: 'balcao', rotulo: 'Requisições no balcão', descricao: 'Requisições de saída registradas.', formato: 'int', comparar: true, principal: true, calcular: contar('balcao_requisicao') },
  { id: 'bal_itens', processo: 'balcao', rotulo: 'Itens baixados', descricao: 'Linhas de item nas requisições.', formato: 'int', comparar: true, principal: true, calcular: somarQ('balcao_requisicao') },
  { id: 'bal_baixas_sap', processo: 'balcao', rotulo: 'Baixas lançadas no SAP', descricao: 'Requisições com documento SAP lançado pela pessoa.', formato: 'int', comparar: true, calcular: contar('balcao_baixa_sap') },
  { id: 'bal_pct_sap', processo: 'balcao', rotulo: '% requisições já no SAP', descricao: 'Requisições do período que já têm documento SAP.', formato: 'pct', comparar: false, calcular: ev => {
    const r = doTipo(ev, 'balcao_requisicao');
    return pct(r.filter(e => e.f === true).length, r.length);
  } },
  { id: 'bal_tempo_sap', processo: 'balcao', rotulo: 'Tempo até a baixa no SAP', descricao: 'Mediana entre a requisição e o lançamento no SAP.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'balcao_baixa_sap') },
  { id: 'bal_confirmacoes', processo: 'balcao', rotulo: 'Retiradas confirmadas', descricao: 'Requisições confirmadas pela pessoa.', formato: 'int', comparar: true, calcular: contar('balcao_confirmacao') },
  { id: 'bal_ritmo', processo: 'balcao', rotulo: 'Ritmo de atendimento', descricao: 'Mediana do intervalo entre duas requisições seguidas da mesma pessoa no dia.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: ev => ritmoMediano(ev, ['balcao_requisicao']) },
  // Solicitação extraordinária
  { id: 'ext_criadas', processo: 'extraordinaria', rotulo: 'Extraordinárias abertas', descricao: 'Saídas extraordinárias (sem saldo) registradas.', formato: 'int', comparar: false, principal: true, calcular: contar('sol_extra') },
  { id: 'ext_regularizadas', processo: 'extraordinaria', rotulo: 'Extraordinárias regularizadas', descricao: 'Extraordinárias regularizadas pela pessoa.', formato: 'int', comparar: true, principal: true, calcular: contar('sol_extra_regularizacao') },
  { id: 'ext_tempo', processo: 'extraordinaria', rotulo: 'Tempo para regularizar', descricao: 'Mediana entre abrir e regularizar a extraordinária.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'sol_extra_regularizacao') },
  // Projetos
  { id: 'proj_movimentos', processo: 'projetos', rotulo: 'Movimentos de peças', descricao: 'Entradas e saídas de peças de projeto (inclui importações em lote).', formato: 'int', comparar: false, principal: true, calcular: contar('proj_movimento') },
  // Suprimentos — compras e pedidos (mesmas regras dos dashboards: item de RM, 1º pedido)
  { id: 'sup_itens', processo: 'compras', rotulo: 'Itens de RM em pedido', descricao: 'Itens de RM convertidos em pedido pelo comprador (o 1º pedido de cada item, como nos dashboards).', formato: 'int', comparar: true, principal: true, calcular: contar('sup_pedido') },
  { id: 'sup_valor', processo: 'compras', rotulo: 'Valor comprado', descricao: 'Valor dos pedidos desses itens (R$), da ZL0132.', formato: 'brl', comparar: false, principal: true, calcular: somarV('sup_pedido') },
  { id: 'sup_lead', processo: 'compras', rotulo: 'Lead time da RM ao pedido', descricao: 'Mediana de dias entre a RM e o pedido, nos itens convertidos.', formato: 'tempo', comparar: true, menorMelhor: true, principal: true, calcular: medianaD(() => true, 'sup_pedido') },
  { id: 'sup_assumidas', processo: 'compras', rotulo: 'Compras assumidas', descricao: 'Solicitações de compra assumidas (aprovada → em cotação).', formato: 'int', comparar: true, calcular: contar('sup_assumiu') },
  { id: 'sup_tempo_assumir', processo: 'compras', rotulo: 'Tempo para assumir', descricao: 'Mediana entre a aprovação da solicitação e o comprador assumir.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'sup_assumiu') },
  { id: 'sup_pedidos_emitidos', processo: 'compras', rotulo: 'Pedidos emitidos (SISTEN)', descricao: 'Solicitações marcadas como pedido emitido.', formato: 'int', comparar: true, calcular: contar('sup_pedido_emitido') },
  { id: 'sup_tempo_pedido', processo: 'compras', rotulo: 'Tempo de assumir ao pedido', descricao: 'Mediana entre assumir a compra e emitir o pedido.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'sup_pedido_emitido') },
  { id: 'sup_otd', processo: 'compras', rotulo: 'Entregas no prazo (OTD)', descricao: 'Entregas recebidas (MIGO) no período até a data de remessa do pedido. Depende muito do fornecedor.', formato: 'pct', comparar: false, calcular: ev => {
    const e = doTipo(ev, 'sup_entrega');
    return pct(e.filter(x => x.f === true).length, e.length);
  } },
  // Suprimentos — cotações
  { id: 'sup_cotacoes', processo: 'cotacoes', rotulo: 'Processos de cotação', descricao: 'Processos de cotação abertos no SISTEN.', formato: 'int', comparar: true, principal: true, calcular: contar('sup_cotacao') },
  { id: 'sup_propostas', processo: 'cotacoes', rotulo: 'Propostas lançadas', descricao: 'Propostas de fornecedor lançadas nas cotações.', formato: 'int', comparar: true, principal: true, calcular: contar('sup_proposta') },
  { id: 'sup_decisoes', processo: 'cotacoes', rotulo: 'Itens decididos no mapa', descricao: 'Itens com fornecedor escolhido no mapa de cotação.', formato: 'int', comparar: true, calcular: contar('sup_mapa_decisao') },
  { id: 'sup_ritmo_propostas', processo: 'cotacoes', rotulo: 'Ritmo de propostas', descricao: 'Mediana do intervalo entre duas propostas lançadas seguidas pela mesma pessoa no dia.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: ev => ritmoMediano(ev, ['sup_proposta']) },
  // Suprimentos — chamados e diligenciamento
  { id: 'sup_chamados', processo: 'atendimento', rotulo: 'Chamados resolvidos', descricao: 'Chamados e pedidos de cadastro SAP resolvidos.', formato: 'int', comparar: true, principal: true, calcular: contar('sup_chamado_resolvido') },
  { id: 'sup_tempo_chamado', processo: 'atendimento', rotulo: 'Tempo de resolução', descricao: 'Mediana entre a abertura e a resolução do chamado.', formato: 'tempo', comparar: true, menorMelhor: true, calcular: medianaD(() => true, 'sup_chamado_resolvido') },
  { id: 'sup_diligencias', processo: 'atendimento', rotulo: 'Itens diligenciados', descricao: 'Itens com diligenciamento atualizado no período (última atualização).', formato: 'int', comparar: true, principal: true, calcular: contar('sup_diligenciamento') },
  // Suprimentos — carteira de hoje (não depende do período)
  { id: 'sup_carteira_abertos', processo: 'carteira', rotulo: 'Itens em aberto', descricao: 'Itens de RM sem pedido hoje, no grupo de compras do comprador (ME5A).', formato: 'int', comparar: false, principal: true, calcular: contar('sup_carteira') },
  { id: 'sup_carteira_aging', processo: 'carteira', rotulo: 'Aging médio', descricao: 'Idade média, hoje, dos itens em aberto.', formato: 'tempo', comparar: false, calcular: ev => {
    const d = doTipo(ev, 'sup_carteira').map(e => Number(e.d)).filter(Number.isFinite);
    return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
  } },
  { id: 'sup_carteira_criticos', processo: 'carteira', rotulo: 'Críticos (> 30 dias)', descricao: 'Itens em aberto há mais de 30 dias.', formato: 'int', comparar: false, principal: true, calcular: ev => doTipo(ev, 'sup_carteira').filter(e => e.f === true).length },
  // Uso do SISTEN
  { id: 'uso_dias', processo: 'uso', rotulo: 'Dias ativos', descricao: 'Dias com alguma atividade no SISTEN.', formato: 'int', comparar: true, principal: true, calcular: contar('uso_dia') },
  { id: 'uso_sessoes', processo: 'uso', rotulo: 'Sessões', descricao: 'Sessões abertas (somadas nos dias).', formato: 'int', comparar: false, calcular: ev => doTipo(ev, 'uso_dia').reduce((s, e) => s + (Number(e.n) || 0), 0) },
  { id: 'uso_telas', processo: 'uso', rotulo: 'Telas abertas', descricao: 'Navegações entre telas do SISTEN.', formato: 'int', comparar: false, calcular: somarQ('uso_dia') },
  { id: 'uso_jornada', processo: 'uso', rotulo: 'Jornada no sistema', descricao: 'Mediana, por dia, entre a primeira e a última atividade no SISTEN (não é ponto).', formato: 'tempo', comparar: false, principal: true, calcular: medianaD(() => true, 'uso_dia') },
];

export const indicadoresDoProcesso = (p: IdProcesso) => INDICADORES.filter(i => i.processo === p);

/** Processos de rotina da equipe (setor). */
export function processosDaEquipe(setor: string): Processo[] {
  return PROCESSOS.filter(p => p.setores === '*' || p.setores.includes(setor));
}

/**
 * Ações de trabalho da pessoa. Fora: o uso agregado do SISTEN, a carteira de
 * hoje (é estoque, não ação) e a entrega recebida (é do fornecedor).
 */
const NAO_SAO_ACOES = new Set<TipoEvento>(['uso_dia', 'sup_carteira', 'sup_entrega']);
export const ehAcao = (e: EventoEquipe) => !NAO_SAO_ACOES.has(e.t);

// ---------------------------------------------------------------------------
// Recortes da equipe
// ---------------------------------------------------------------------------

export interface FiltroEquipe {
  setor: string;
  /** Inclui quem não é do setor mas atuou nos processos da equipe no período. */
  incluirDeFora: boolean;
  /** Só ativos (padrão) — ex-colaboradores entram se atuaram no período. */
  pessoaId?: string | null;
}

/** Membros da equipe no recorte: do setor (ativos ou com atividade) e, opcionalmente, quem atuou nos processos. */
export function membrosDaEquipe(dados: DadosEquipes, filtro: FiltroEquipe): PessoaEquipe[] {
  const tipos = new Set(processosDaEquipe(filtro.setor).filter(p => p.id !== 'uso').flatMap(p => p.tipos));
  const comAtividade = new Set(dados.eventos.filter(e => tipos.has(e.t) || e.t === 'uso_dia').map(e => e.u));
  const atuaramNosProcessos = new Set(dados.eventos.filter(e => tipos.has(e.t)).map(e => e.u));
  return dados.pessoas.filter(p => {
    const doSetor = p.setor === filtro.setor && (p.status === 'ativo' || comAtividade.has(p.id));
    return doSetor || (filtro.incluirDeFora && atuaramNosProcessos.has(p.id));
  });
}

/** Eventos da equipe (e, se dado, só da pessoa), restritos aos processos da equipe. */
export function eventosDaEquipe(dados: DadosEquipes, filtro: FiltroEquipe): EventoEquipe[] {
  const ids = new Set(membrosDaEquipe(dados, filtro).map(p => p.id));
  const tipos = new Set(processosDaEquipe(filtro.setor).flatMap(p => p.tipos));
  return dados.eventos.filter(e => ids.has(e.u) && tipos.has(e.t) && (!filtro.pessoaId || e.u === filtro.pessoaId));
}

export interface LinhaColaborador {
  pessoa: PessoaEquipe;
  acoes: number;
  valores: Record<string, number | null>;
}

/** Um valor por indicador por colaborador, mais o total de ações. */
export function porColaborador(eventos: readonly EventoEquipe[], membros: readonly PessoaEquipe[], indicadores: readonly DefIndicador[]): LinhaColaborador[] {
  return membros.map(pessoa => {
    const ev = eventos.filter(e => e.u === pessoa.id);
    const valores: Record<string, number | null> = {};
    for (const i of indicadores) valores[i.id] = i.calcular(ev);
    return { pessoa, acoes: ev.filter(ehAcao).length, valores };
  }).sort((a, b) => b.acoes - a.acoes || a.pessoa.nome.localeCompare(b.pessoa.nome, 'pt-BR'));
}

/** Ações por dia do intervalo (série da volumetria). */
export function serieDiaria(eventos: readonly EventoEquipe[], de: string, ate: string): { dia: string; acoes: number }[] {
  const conta = new Map<string, number>();
  for (const e of eventos) if (ehAcao(e)) conta.set(diaDoEvento(e), (conta.get(diaDoEvento(e)) ?? 0) + 1);
  return diasDoIntervalo(de, ate).map(dia => ({ dia, acoes: conta.get(dia) ?? 0 }));
}

/** Ações por hora do dia (0–23), no fuso do aparelho. */
export function porHora(eventos: readonly EventoEquipe[]): number[] {
  const horas = Array.from({ length: 24 }, () => 0);
  for (const e of eventos) if (ehAcao(e)) horas[new Date(e.em).getHours()] += 1;
  return horas;
}

// ---------------------------------------------------------------------------
// Histórico: o período escolhido contra os anteriores equivalentes
// ---------------------------------------------------------------------------

export interface Janela {
  de: string;
  ate: string;
  /** Rótulo curto para gráfico e tabela: "27/10", "out/26". */
  rotulo: string;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const deIso = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const diasEntreIso = (de: string, ate: string) => Math.round((deIso(ate).getTime() - deIso(de).getTime()) / 86_400_000);

/**
 * Janelas do histórico, da mais antiga à atual (a última é o período
 * escolhido). Cada anterior tem a MESMA posição e duração: "esta semana" até
 * quarta é comparada com segunda a quarta das semanas anteriores; "este mês"
 * até o dia 2, com os dias 1 e 2 dos meses anteriores (sem passar do fim do
 * mês). Dia contra os dias anteriores; período livre contra blocos de igual
 * duração logo antes.
 */
export function janelasHistorico(recorte: Recorte, atual: { de: string; ate: string }, n = 6): Janela[] {
  const dur = diasEntreIso(atual.de, atual.ate); // dias além do 1º
  const janelas: Janela[] = [];
  const porMes = recorte === 'mes' || recorte === 'mes_passado';
  for (let k = n - 1; k >= 0; k--) {
    let de: Date;
    let ate: Date;
    if (porMes) {
      const ini = deIso(atual.de);
      de = new Date(ini.getFullYear(), ini.getMonth() - k, 1);
      const fimDoMes = new Date(de.getFullYear(), de.getMonth() + 1, 0);
      ate = somarDias(de, dur) > fimDoMes ? fimDoMes : somarDias(de, dur);
      // Mês fechado: as janelas anteriores também são meses inteiros.
      if (recorte === 'mes_passado') ate = fimDoMes;
    } else {
      const passo = recorte === 'semana' || recorte === 'semana_passada' ? 7 : dur + 1;
      de = somarDias(deIso(atual.de), -passo * k);
      ate = somarDias(de, dur);
    }
    const deTxt = diaLocal(de);
    janelas.push({
      de: deTxt,
      ate: diaLocal(ate),
      rotulo: porMes ? `${MESES[de.getMonth()]}/${String(de.getFullYear()).slice(2)}` : dataBr(deTxt).slice(0, 5),
    });
  }
  return janelas;
}

export const naJanela = (e: EventoEquipe, j: Pick<Janela, 'de' | 'ate'>) => {
  const dia = diaDoEvento(e);
  return dia >= j.de && dia <= j.ate;
};

/** Indicadores que são foto de hoje (carteira): não têm histórico. */
export const semHistorico = (i: DefIndicador) => i.processo === 'carteira';

export type Tendencia = 'melhorou' | 'piorou' | 'estavel' | 'sem_base' | 'neutro';

/** Diferença que conta como melhora ou piora em relação ao período anterior (±10%). */
export const FAIXA_TENDENCIA = 0.1;

export interface HistoricoIndicador {
  indicador: DefIndicador;
  /** Um valor por janela, da mais antiga à atual. */
  valores: (number | null)[];
  atual: number | null;
  anterior: number | null;
  /** Média das janelas anteriores que tiveram valor. */
  mediaAnteriores: number | null;
  /** (atual − anterior) ÷ anterior; null sem base. */
  variacao: number | null;
  tendencia: Tendencia;
}

/** Melhorou / piorou / estável contra o período anterior, pela direção do indicador. */
export function tendenciaDe(i: DefIndicador, atual: number | null, anterior: number | null): Tendencia {
  if (!i.comparar || semHistorico(i)) return 'neutro';
  if (atual == null || anterior == null) return 'sem_base';
  if (anterior === 0) return atual === 0 ? 'estavel' : (i.menorMelhor ? 'piorou' : 'melhorou');
  const v = (atual - anterior) / anterior;
  const melhorou = i.menorMelhor ? v <= -FAIXA_TENDENCIA : v >= FAIXA_TENDENCIA;
  const piorou = i.menorMelhor ? v >= FAIXA_TENDENCIA : v <= -FAIXA_TENDENCIA;
  return melhorou ? 'melhorou' : piorou ? 'piorou' : 'estavel';
}

/**
 * Histórico de cada indicador nas janelas, sobre os eventos dados (de uma
 * pessoa ou da equipe toda). A carteira de hoje só tem o valor atual.
 */
export function historicoIndicadores(eventos: readonly EventoEquipe[], janelas: readonly Janela[], indicadores: readonly DefIndicador[]): HistoricoIndicador[] {
  const porJanela = janelas.map(j => eventos.filter(e => naJanela(e, j)));
  const ultima = janelas.length - 1;
  return indicadores.map(i => {
    const valores = semHistorico(i)
      ? janelas.map((_, k) => (k === ultima ? i.calcular(eventos.filter(e => e.t === 'sup_carteira')) : null))
      : porJanela.map(ev => i.calcular(ev));
    const atual = valores[ultima] ?? null;
    const anterior = ultima > 0 ? valores[ultima - 1] ?? null : null;
    const anteriores = valores.slice(0, ultima).filter((v): v is number => v != null);
    return {
      indicador: i,
      valores,
      atual,
      anterior,
      mediaAnteriores: anteriores.length ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : null,
      variacao: atual != null && anterior != null && anterior !== 0 ? (atual - anterior) / anterior : null,
      tendencia: tendenciaDe(i, atual, anterior),
    };
  });
}

/** Ações por janela (volume no histórico). */
export function acoesPorJanela(eventos: readonly EventoEquipe[], janelas: readonly Janela[]): number[] {
  return janelas.map(j => eventos.filter(e => ehAcao(e) && naJanela(e, j)).length);
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** "45 s", "12 min", "3 h 20 min", "2 d 4 h". */
export function formatarDuracao(seg: number | null | undefined): string {
  if (seg == null || !Number.isFinite(seg)) return '—';
  const s = Math.round(seg);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export function formatarIndicador(valor: number | null | undefined, formato: FormatoIndicador): string {
  if (valor == null || !Number.isFinite(valor)) return '—';
  switch (formato) {
    case 'int': return Math.round(valor).toLocaleString('pt-BR');
    case 'dec': return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    case 'pct': return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    case 'tempo': return formatarDuracao(valor);
    case 'brl': return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chamado com destino Suprimentos — categoria "Pendência de Processamento".
 *
 * Módulo puro (sem React nem Supabase): reconhece o bloco de texto colado da
 * planilha, monta o corpo do e-mail para `suprimentosten@ten.ind.br` e gera o
 * número de protocolo. É o que precisa de teste — a integração com o banco fica
 * em `supPendenciasApi.ts`.
 *
 * Dois modelos de planilha são aceitos, gravados na mesma tabela:
 *  - `nfse`      → relação de NFS-e com valor e mês de competência;
 *  - `documento` → relação de lançamentos com erro/ação necessária no SAP
 *                  (número de documento de 9 posições, série, UF, PO, comprador).
 * O modelo é detectado pelo cabeçalho colado (ou, na falta dele, pelo formato).
 */

export const NOME_SETOR_SUPRIMENTOS = 'Suprimentos';
export const CATEGORIA_PENDENCIA_PROCESSAMENTO = 'Pendência de Processamento';
export const CATEGORIA_AJUSTE_PEDIDO = 'Ajuste de Pedido';

/** Categorias do chamado com destino Suprimentos, na ordem do <select>. */
export const CATEGORIAS_SUPRIMENTOS = [
  CATEGORIA_PENDENCIA_PROCESSAMENTO,
  CATEGORIA_AJUSTE_PEDIDO,
] as const;

export type ModeloPendencia = 'nfse' | 'documento' | 'ajuste_pedido';

/** Remove acentos para comparação tolerante de nomes/rótulos. */
const semAcento = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Detecção por nome normalizado — mesmo padrão de `isJuridicoSector`. */
export function isSuprimentosSector(sector?: { name: string } | null): boolean {
  if (!sector || !sector.name) return false;
  const n = semAcento(sector.name);
  return n === 'suprimentos' || n.includes('suprimento');
}

/** É um chamado de "pendência de processamento" (planilha) com destino Suprimentos? */
export function isChamadoPendenciaProcessamento(r: { type?: string; category_id?: string | null }): boolean {
  return r.type === 'chamado' && (r.category_id || '') === CATEGORIA_PENDENCIA_PROCESSAMENTO;
}

/** É um chamado "Ajuste de Pedido" com destino Suprimentos? */
export function isChamadoAjustePedido(r: { type?: string; category_id?: string | null }): boolean {
  return r.type === 'chamado' && (r.category_id || '') === CATEGORIA_AJUSTE_PEDIDO;
}

/** É qualquer chamado que alimenta a fila de Pendências do Suprimentos? */
export function isChamadoSuprimentosPendencia(r: { type?: string; category_id?: string | null }): boolean {
  return isChamadoPendenciaProcessamento(r) || isChamadoAjustePedido(r);
}

/** Rótulos oficiais do modelo `nfse` (8 colunas), na ordem da planilha. */
export const COLUNAS_NF = [
  'Número da NFS-e',
  'NFS-e Cancelada',
  'Data Emissão NFS-e',
  'Fornecedor',
  'Nome Fornecedor',
  'OBSERVAÇÃO',
  'Valor da NFS-e',
  'Mês de Competência',
] as const;

/** Rótulos oficiais do modelo `documento` (11 colunas), na ordem da planilha. */
export const COLUNAS_DOC = [
  'STATUS',
  'Número de documento de nove posições',
  'Data da Emissão',
  'Séries',
  'UF emissor',
  'Chegou ?',
  'Nome do Fornecedor',
  'Documento de compras',
  'OBSERVAÇÕES',
  'COMPRADOR',
  'DATA ENVIO',
] as const;

export interface LinhaPendencia {
  modelo: ModeloPendencia;

  /** Modelo `nfse`: nº da NFS-e. Modelo `documento`: nº do documento (9 pos.). */
  numero_nfse: string;
  data_emissao_nfse: string;
  nome_fornecedor: string;
  observacao: string;

  /* Só no modelo `nfse` ----------------------------------------------------- */
  nfse_cancelada: string;
  fornecedor: string;
  /** Texto original do valor, como veio da planilha ("19.000,00"). */
  valor_nfse_raw: string;
  /** Valor convertido para número, ou null quando não foi possível. */
  valor_nfse: number | null;
  mes_competencia: string;

  /* Só no modelo `documento` --------------------------------------------------- */
  documento_status: string;
  serie: string;
  uf_emissor: string;
  chegou: string;
  documento_compras: string;
  comprador: string;
  data_envio: string;
}

/** @deprecated Use `LinhaPendencia`. Mantido para não quebrar imports antigos. */
export type LinhaNfParseada = LinhaPendencia;

export interface ResultadoParse {
  modelo: ModeloPendencia;
  linhas: LinhaPendencia[];
  erros: string[];
}

/** "19.000,00" -> 19000 . "1.080,00" -> 1080 . "374,00" -> 374 . "" -> null */
export function parsearValorBRL(valor: string): number | null {
  const limpo = (valor || '').trim();
  if (!limpo) return null;
  const semRuido = limpo.replace(/[^\d.,-]/g, '');
  if (!semRuido || semRuido === '-') return null;
  // Padrão pt-BR: ponto separa milhar, vírgula separa decimal.
  const normalizado = semRuido.replace(/\./g, '').replace(',', '.');
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** `true` quando o bloco de campos bate com os rótulos de um cabeçalho. */
function ehCabecalho(campos: string[], cols: readonly string[]): boolean {
  const alvo = cols.map(semAcento);
  const acertos = campos.map(semAcento).filter(c => alvo.includes(c)).length;
  return acertos >= 4;
}

/** Heurística para o modelo `documento` sem cabeçalho: a 1ª célula é um status. */
function pareceStatusDocumento(valor?: string): boolean {
  const n = semAcento(valor || '');
  return n.includes('erro') || n.includes('acao necessaria') || n.includes('pendente') || n.includes('aguardando');
}

function vazio(campo?: string): string {
  return (campo || '').trim();
}

function montarLinhaNf(campos: string[]): LinhaPendencia {
  const [numero, cancelada, data, forn, nomeForn, obs, valor, mes] = campos;
  return {
    modelo: 'nfse',
    numero_nfse: vazio(numero),
    data_emissao_nfse: vazio(data),
    nome_fornecedor: vazio(nomeForn),
    observacao: vazio(obs),
    nfse_cancelada: vazio(cancelada),
    fornecedor: vazio(forn),
    valor_nfse_raw: vazio(valor),
    valor_nfse: parsearValorBRL(valor || ''),
    mes_competencia: vazio(mes),
    documento_status: '', serie: '', uf_emissor: '', chegou: '',
    documento_compras: '', comprador: '', data_envio: '',
  };
}

function montarLinhaDoc(campos: string[]): LinhaPendencia {
  const [status, numero, data, serie, uf, chegou, nomeForn, docCompras, obs, comprador, dataEnvio] = campos;
  return {
    modelo: 'documento',
    numero_nfse: vazio(numero),
    data_emissao_nfse: vazio(data),
    nome_fornecedor: vazio(nomeForn),
    observacao: vazio(obs),
    nfse_cancelada: '', fornecedor: '', valor_nfse_raw: '', valor_nfse: null, mes_competencia: '',
    documento_status: vazio(status),
    serie: vazio(serie),
    uf_emissor: vazio(uf),
    chegou: vazio(chegou),
    documento_compras: vazio(docCompras),
    comprador: vazio(comprador),
    data_envio: vazio(dataEnvio),
  };
}

/**
 * Interpreta o bloco de texto colado da planilha. Aceita, para cada modelo:
 *
 *  1. **Uma linha por registro**, campos separados por TAB — colagem direta de
 *     um intervalo do Excel.
 *  2. **Uma célula por linha**, com linhas em branco entre os valores — o que
 *     aparece quando se copia uma seleção estreita. Os valores são agrupados
 *     conforme o nº de colunas do modelo (8 para `nfse`, 11 para `documento`).
 *
 * Um bloco de cabeçalho inicial com os rótulos das colunas é descartado, e é
 * também o que decide o modelo. Sem cabeçalho, cai numa heurística.
 */
export function parseColagemPlanilha(texto: string): ResultadoParse {
  const erros: string[] = [];
  const bruto = (texto || '').replace(/\r\n?/g, '\n');
  if (!bruto.trim()) return { modelo: 'nfse', linhas: [], erros };

  const linhasBrutas = bruto.split('\n');
  const temTab = linhasBrutas.some(l => l.includes('\t'));

  // 1. Detectar modelo + presença de cabeçalho.
  let modelo: ModeloPendencia;
  let temCabecalho = false;

  if (temTab) {
    const primeira = (linhasBrutas.find(l => l.trim().length > 0) || '').split('\t').map(c => c.trim());
    if (ehCabecalho(primeira, COLUNAS_NF)) { modelo = 'nfse'; temCabecalho = true; }
    else if (ehCabecalho(primeira, COLUNAS_DOC)) { modelo = 'documento'; temCabecalho = true; }
    else modelo = primeira.length >= 10 ? 'documento' : 'nfse';
  } else {
    const valores0 = linhasBrutas.map(l => l.trim()).filter(l => l.length > 0);
    if (ehCabecalho(valores0.slice(0, COLUNAS_NF.length), COLUNAS_NF)) { modelo = 'nfse'; temCabecalho = true; }
    else if (ehCabecalho(valores0.slice(0, COLUNAS_DOC.length), COLUNAS_DOC)) { modelo = 'documento'; temCabecalho = true; }
    else modelo = pareceStatusDocumento(valores0[0]) ? 'documento' : 'nfse';
  }

  const largura = modelo === 'nfse' ? COLUNAS_NF.length : COLUNAS_DOC.length;

  // 2. Montar os registros (um array de campos por linha da planilha).
  let registros: string[][] = [];
  if (temTab) {
    registros = linhasBrutas
      .filter(l => l.trim().length > 0)
      .map(l => l.split('\t').map(c => c.trim()));
    if (temCabecalho) registros = registros.slice(1);
  } else {
    const valores = linhasBrutas.map(l => l.trim()).filter(l => l.length > 0);
    for (let i = temCabecalho ? largura : 0; i < valores.length; i += largura) {
      registros.push(valores.slice(i, i + largura));
    }
  }

  // 3. Converter.
  const linhas: LinhaPendencia[] = [];
  registros.forEach((campos, idx) => {
    if (campos.every(c => !c || c.length === 0)) return;
    if (campos.length < largura) {
      erros.push(`Registro ${idx + 1}: ${campos.length} campo(s) encontrados, esperados ${largura}. Confira o texto colado.`);
      return;
    }
    const linha = modelo === 'nfse' ? montarLinhaNf(campos) : montarLinhaDoc(campos);
    if (!linha.numero_nfse) {
      erros.push(`Registro ${idx + 1}: sem ${modelo === 'nfse' ? '"Número da NFS-e"' : 'número de documento'}.`);
      return;
    }
    linhas.push(linha);
  });

  if (linhas.length === 0 && erros.length === 0) {
    erros.push('Nenhum registro reconhecido. Cole o conteúdo copiado da planilha, com o cabeçalho.');
  }

  return { modelo, linhas, erros };
}

/** Soma dos valores numéricos reconhecidos (0 no modelo `documento`). */
export function somarValores(linhas: LinhaPendencia[]): number {
  return linhas.reduce((tot, l) => tot + (l.valor_nfse ?? 0), 0);
}

/* -------------------------------------------------------------------------- */
/* Apresentação (compartilhada por prévia, e-mail e telas)                    */
/* -------------------------------------------------------------------------- */

function formatarBRL(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rótulo curto do "número" conforme o modelo. */
export const rotuloNumero = (modelo: ModeloPendencia) =>
  modelo === 'nfse' ? 'NFS-e' : modelo === 'ajuste_pedido' ? 'NF' : 'Documento';

/** Rótulo do modelo, usado em badges e filtros. */
export const rotuloModelo = (modelo: ModeloPendencia) =>
  modelo === 'documento' ? 'Lançamentos SAP' : modelo === 'ajuste_pedido' ? 'Ajuste de Pedido' : 'NFS-e';

/**
 * Forma mínima aceita por `camposExibicao` / `resumoValores` — tanto a linha
 * recém-parseada (`LinhaPendencia`) quanto a linha do banco
 * (`SupPendenciaProcessamentoNF`, com campos anuláveis) satisfazem.
 */
export interface RegistroExibivel {
  modelo: ModeloPendencia;
  numero_nfse?: string | null;
  data_emissao_nfse?: string | null;
  nome_fornecedor?: string | null;
  observacao?: string | null;
  nfse_cancelada?: string | null;
  fornecedor?: string | null;
  valor_nfse?: number | null;
  valor_nfse_raw?: string | null;
  mes_competencia?: string | null;
  documento_status?: string | null;
  serie?: string | null;
  uf_emissor?: string | null;
  chegou?: string | null;
  documento_compras?: string | null;
  comprador?: string | null;
  data_envio?: string | null;
}

const txt = (v?: string | null) => (v == null ? '' : v);

/** Todos os campos de um registro, rotulados e na ordem de exibição. */
export function camposExibicao(l: RegistroExibivel): { label: string; value: string }[] {
  if (l.modelo === 'ajuste_pedido') {
    return [
      { label: 'Número da NF', value: txt(l.numero_nfse) },
      { label: 'Número do Pedido', value: txt(l.documento_compras) },
      { label: 'Fornecedor', value: txt(l.nome_fornecedor) },
      { label: 'Comprador', value: txt(l.comprador) },
      { label: 'Demanda', value: txt(l.observacao) },
    ];
  }
  if (l.modelo === 'documento') {
    return [
      { label: 'Status', value: txt(l.documento_status) },
      { label: 'Documento', value: txt(l.numero_nfse) },
      { label: 'Data da Emissão', value: txt(l.data_emissao_nfse) },
      { label: 'Série', value: txt(l.serie) },
      { label: 'UF emissor', value: txt(l.uf_emissor) },
      { label: 'Chegou?', value: txt(l.chegou) },
      { label: 'Nome do Fornecedor', value: txt(l.nome_fornecedor) },
      { label: 'Documento de compras', value: txt(l.documento_compras) },
      { label: 'Observações', value: txt(l.observacao) },
      { label: 'Comprador', value: txt(l.comprador) },
      { label: 'Data envio', value: txt(l.data_envio) },
    ];
  }
  return [
    { label: 'Número da NFS-e', value: txt(l.numero_nfse) },
    { label: 'NFS-e Cancelada', value: txt(l.nfse_cancelada) },
    { label: 'Data Emissão NFS-e', value: txt(l.data_emissao_nfse) },
    { label: 'Fornecedor', value: [l.fornecedor, l.nome_fornecedor].filter(Boolean).join(' - ') },
    { label: 'Observação', value: txt(l.observacao) },
    { label: 'Valor da NFS-e', value: l.valor_nfse != null ? formatarBRL(l.valor_nfse) : txt(l.valor_nfse_raw) },
    { label: 'Mês de Competência', value: txt(l.mes_competencia) },
  ];
}

/** Colunas do resumo compacto usado na prévia e nas telas. */
export function resumoColunas(modelo: ModeloPendencia): string[] {
  if (modelo === 'ajuste_pedido') return ['NF', 'Pedido', 'Fornecedor', 'Comprador', 'Demanda'];
  return modelo === 'documento'
    ? ['Documento', 'Emissão', 'Fornecedor', 'Doc. compras', 'Comprador']
    : ['NFS-e', 'Emissão', 'Fornecedor', 'Valor', 'Comp.'];
}

/** Valores do resumo compacto, na ordem de `resumoColunas`. */
export function resumoValores(l: RegistroExibivel): string[] {
  const fornecedor = txt(l.nome_fornecedor) || txt(l.fornecedor);
  if (l.modelo === 'ajuste_pedido') {
    return [txt(l.numero_nfse), txt(l.documento_compras), fornecedor, txt(l.comprador), txt(l.observacao)];
  }
  return l.modelo === 'documento'
    ? [txt(l.numero_nfse), txt(l.data_emissao_nfse), fornecedor, txt(l.documento_compras), txt(l.comprador)]
    : [
        txt(l.numero_nfse),
        txt(l.data_emissao_nfse),
        fornecedor,
        l.valor_nfse != null ? formatarBRL(l.valor_nfse) : txt(l.valor_nfse_raw),
        txt(l.mes_competencia),
      ];
}

/* -------------------------------------------------------------------------- */
/* Protocolo                                                                  */
/* -------------------------------------------------------------------------- */

/** ISO (YYYY-MM-DD) -> DDMMAA. Sem data válida, usa hoje. */
export function formatarDataDDMMAA(dataISO?: string | null): string {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    const agora = new Date();
    const d = String(agora.getDate()).padStart(2, '0');
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    return `${d}${m}${String(agora.getFullYear()).slice(-2)}`;
  }
  const [y, m, d] = dataISO.split('-');
  return `${d}${m}${y.slice(-2)}`;
}

/** `SUP-DDMMAA-NN` — um protocolo por chamado, índice sequencial no dia. */
export function gerarProtocoloSup(indice: number, dataISO?: string | null): string {
  return `SUP-${formatarDataDDMMAA(dataISO)}-${String(indice).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------- */
/* E-mail                                                                     */
/* -------------------------------------------------------------------------- */

export function assuntoEmailPendencias(protocolo: string): string {
  return `[${protocolo}] - Pendências de Processamento de Notas Fiscais`;
}

/**
 * Relação dos registros em texto corrido, um bloco por item com os campos
 * rotulados e alinhados. Sem tabela — é o formato que o Outlook preserva bem no
 * corpo do e-mail.
 */
export function montarRelacaoPendencias(linhas: LinhaPendencia[]): string {
  const rotuloNum = (m: ModeloPendencia) => (m === 'nfse' ? 'Número da NFS-e' : 'Documento');

  return linhas
    .map((l, i) => {
      const campos = camposExibicao(l).filter(c => c.value && c.label !== rotuloNum(l.modelo));
      const larguraRotulo = campos.reduce((max, c) => Math.max(max, c.label.length), 0);
      const titulo = `${i + 1}. ${rotuloNumero(l.modelo)} ${l.numero_nfse}`;
      const corpo = campos.map(c => `   ${c.label.padEnd(larguraRotulo)}  ${c.value}`);
      return [titulo, ...corpo].join('\n');
    })
    .join('\n\n');
}

/** Corpo do e-mail enviado ao Suprimentos com a relação de registros pendentes. */
export function montarCorpoEmailPendencias(params: {
  protocolo: string;
  solicitante: string;
  numeroChamado: string;
  linkChamado?: string;
  linhas: LinhaPendencia[];
}): string {
  const { protocolo, solicitante, numeroChamado, linkChamado, linhas } = params;
  const modelo: ModeloPendencia = linhas[0]?.modelo ?? 'nfse';
  const rotulo = modelo === 'nfse' ? 'notas fiscais' : 'lançamentos';

  const cabecalho = [
    modelo === 'nfse'
      ? 'PENDÊNCIAS DE PROCESSAMENTO DE NOTAS FISCAIS'
      : 'PENDÊNCIAS DE PROCESSAMENTO — LANÇAMENTOS COM ERRO / AÇÃO NECESSÁRIA',
    '',
    `Protocolo: ${protocolo}`,
    `Chamado SISTEN: #${numeroChamado}`,
    `Solicitante: ${solicitante}`,
    `Total de registros: ${linhas.length}`,
  ];
  if (modelo === 'nfse') {
    cabecalho.push(`Valor total: R$ ${formatarBRL(somarValores(linhas))}`);
  }
  cabecalho.push(
    '',
    `Segue a relação de ${rotulo} pendentes de processamento:`,
    '',
    '------------------------------------------------------------',
  );

  const rodape = [
    '------------------------------------------------------------',
    '',
    `Cada ${modelo === 'nfse' ? 'nota' : 'lançamento'} será baixado individualmente pelo Suprimentos`,
    'no SISTEN, e o solicitante é notificado a cada conclusão.',
  ];
  if (linkChamado) rodape.push('', `Acompanhe o chamado: ${linkChamado}`);

  return [...cabecalho, montarRelacaoPendencias(linhas), ...rodape].join('\n');
}

/* -------------------------------------------------------------------------- */
/* E-mail — categoria "Ajuste de Pedido"                                      */
/* -------------------------------------------------------------------------- */

export interface DadosAjustePedido {
  demanda: string;
  nf: string;
  pedido: string;
  fornecedor: string;
  /** Comprador que deve receber a demanda — opcional. */
  comprador?: string;
}

/** Assunto do e-mail: NF, Pedido e Fornecedor no título, como pedido. */
export function assuntoEmailAjustePedido(protocolo: string, d: DadosAjustePedido): string {
  const partes = [
    d.nf && `NF ${d.nf}`,
    d.pedido && `Pedido ${d.pedido}`,
    d.fornecedor,
  ].filter(Boolean);
  return `[${protocolo}] - Ajuste de Pedido - ${partes.join(' · ')}`;
}

/** Corpo do e-mail de "Ajuste de Pedido", em texto organizado. */
export function montarCorpoEmailAjustePedido(params: {
  protocolo: string;
  solicitante: string;
  numeroChamado: string;
  dados: DadosAjustePedido;
  /** Nº de imagens anexadas ao chamado (não vão no e-mail). Aceita boolean por compat. */
  qtdImagens?: number | boolean;
  linkChamado?: string;
}): string {
  const { protocolo, solicitante, numeroChamado, dados, qtdImagens, linkChamado } = params;
  const nImagens = typeof qtdImagens === 'boolean' ? (qtdImagens ? 1 : 0) : (qtdImagens ?? 0);

  const linhas = [
    'AJUSTE DE PEDIDO',
    '',
    `Protocolo: ${protocolo}`,
    `Chamado SISTEN: #${numeroChamado}`,
    `Solicitante: ${solicitante}`,
    '',
    '------------------------------------------------------------',
    `Número da NF ....: ${dados.nf || '—'}`,
    `Número do Pedido : ${dados.pedido || '—'}`,
    `Fornecedor ......: ${dados.fornecedor || '—'}`,
    `Comprador .......: ${dados.comprador || '—'}`,
    '------------------------------------------------------------',
    '',
    'Demanda:',
    dados.demanda || '—',
    '',
    nImagens === 0
      ? 'Sem imagem anexada.'
      : nImagens === 1
        ? 'Uma imagem foi anexada ao chamado no SISTEN (não vai no e-mail).'
        : `${nImagens} imagens foram anexadas ao chamado no SISTEN (não vão no e-mail).`,
  ];
  if (linkChamado) linhas.push('', `Acompanhe o chamado: ${linkChamado}`);

  return linhas.join('\n');
}

export interface ItemConcluidoEmail {
  linha: RegistroExibivel;
  protocolo: string;
  numeroChamado: string;
  solicitanteNome: string;
  resolucao?: string;
}

/** Assunto do e-mail de conclusão/baixa de notas de pendência. */
export function montarAssuntoEmailConclusao(itens: ItemConcluidoEmail[]): string {
  if (itens.length === 1) {
    const it = itens[0];
    const rotulo = rotuloNumero(it.linha.modelo);
    return `[${it.protocolo}] - Conclusão de Processamento: ${rotulo} ${it.linha.numero_nfse}`;
  }
  const protocolos = Array.from(new Set(itens.map(i => i.protocolo))).join(', ');
  return `[SISTEN] Conclusão de Processamento - ${itens.length} notas/documentos (${protocolos})`;
}

/** Corpo do e-mail de notificação de conclusão para o responsável/solicitante. */
export function montarCorpoEmailConclusao(params: {
  itens: ItemConcluidoEmail[];
  usuarioAtendente: string;
  origemUrl?: string;
}): string {
  const { itens, usuarioAtendente, origemUrl } = params;
  const total = itens.length;
  const agoraFormatada = new Date().toLocaleString('pt-BR');

  const cabecalho = [
    'AVISO DE CONCLUSÃO DE PENDÊNCIAS DE PROCESSAMENTO',
    '',
    `Informamos que ${total === 1 ? 'o seguinte registro de pendência foi baixado' : `os seguintes ${total} registros de pendências foram baixados`} no SISTEN por ${usuarioAtendente}.`,
    `Data/Hora da Baixa: ${agoraFormatada}`,
    '',
    '------------------------------------------------------------',
    'RELAÇÃO DE ITENS PROCESSADOS / BAIXADOS:',
    '------------------------------------------------------------',
    '',
  ];

  const blocosItens = itens.map((it, idx) => {
    const l = it.linha;
    const rotulo = rotuloNumero(l.modelo);
    const campos = [
      `${idx + 1}. [${rotulo} ${l.numero_nfse}] - Protocolo: ${it.protocolo} (Chamado #${it.numeroChamado})`,
      `   Solicitante: ${it.solicitanteNome}`,
      `   Fornecedor: ${l.nome_fornecedor || l.fornecedor || '—'}`,
    ];

    if (l.modelo === 'nfse') {
      if (l.valor_nfse != null) campos.push(`   Valor: R$ ${formatarBRL(l.valor_nfse)}`);
      if (l.mes_competencia) campos.push(`   Mês de Competência: ${l.mes_competencia}`);
      if (l.nfse_cancelada) campos.push(`   Cancelada: ${l.nfse_cancelada}`);
    } else {
      if (l.documento_compras) campos.push(`   Doc. Compras / Pedido: ${l.documento_compras}`);
      if (l.comprador) campos.push(`   Comprador: ${l.comprador}`);
      if (l.serie) campos.push(`   Série: ${l.serie}`);
      if (l.uf_emissor) campos.push(`   UF: ${l.uf_emissor}`);
      if (l.documento_status) campos.push(`   Status Doc SAP: ${l.documento_status}`);
    }

    if (l.observacao) campos.push(`   Observação original: ${l.observacao}`);
    campos.push(`   Resolução da Baixa: ${it.resolucao ? it.resolucao.trim() : 'Processado com sucesso'}`);

    return campos.join('\n');
  });

  const rodape = [
    '',
    '------------------------------------------------------------',
    '',
    'Para acompanhar os chamados e o histórico de processamento, acesse o SISTEN:',
    origemUrl || 'https://sisten.ten.ind.br/#/suprimentos/pendencias-processamento',
  ];

  return [...cabecalho, blocosItens.join('\n\n'), ...rodape].join('\n');
}


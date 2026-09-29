/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lógica pura do modo offline dos formulários sobre o protocolo do
 * PostgREST (o que o `supabase.from(...)` manda pela rede):
 *
 *   - ler a URL de uma consulta (tabela, filtros, ordenação, embeds);
 *   - aplicar gravações ainda na fila do aparelho sobre uma lista lida
 *     (do servidor ou da cópia guardada), respeitando os filtros da consulta
 *     — o registro feito offline aparece na lista certa e some da lista
 *     "no pátio" quando a saída é registrada;
 *   - montar a resposta provisória de uma gravação guardada, no formato que
 *     o postgrest-js espera (`.select().single()` devolve o objeto).
 *
 * Sem IndexedDB nem rede — testado em `postgrest.test.ts`.
 */

export type Linha = Record<string, unknown>;

/** Gravação guardada na fila, reduzida ao que importa para refletir nas leituras. */
export interface EfeitoPendente {
  tabela: string;
  tipo: 'insert' | 'upsert' | 'update' | 'delete';
  /** insert/upsert: linhas completas (com `id`); update: o patch. */
  linhas: Linha[];
  /** update/delete: filtros da URL da gravação (`id=eq.X`). */
  filtros?: Filtro[];
}

export interface Filtro {
  coluna: string;
  negado: boolean;
  operador: string;
  valor: string;
}

export interface Embed {
  /** Chave na linha (apelido ou nome da tabela). */
  nome: string;
  tabela: string;
}

export interface ConsultaRest {
  tabela: string;
  filtros: Filtro[];
  ordem: { coluna: string; desc: boolean; nullsFirst?: boolean }[];
  /** Recursos embutidos no `select` (`itens:rh_ase_itens(*)`): viram `[]` nas linhas criadas offline e recebem os filhos criados offline. */
  embeds: Embed[];
}

const PARAMETROS_NAO_FILTRO = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/** Caminho `/rest/v1/<tabela>` → nome da tabela (ou `rpc/<fn>`). */
export function recursoRest(pathname: string): string | null {
  const m = pathname.match(/\/rest\/v1\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function lerFiltros(params: URLSearchParams): Filtro[] {
  const filtros: Filtro[] = [];
  params.forEach((bruto, coluna) => {
    if (PARAMETROS_NAO_FILTRO.has(coluna) || coluna === 'or' || coluna === 'and' || coluna.includes('.')) return;
    let resto = bruto;
    let negado = false;
    if (resto.startsWith('not.')) {
      negado = true;
      resto = resto.slice(4);
    }
    const ponto = resto.indexOf('.');
    if (ponto < 0) return;
    filtros.push({ coluna, negado, operador: resto.slice(0, ponto), valor: resto.slice(ponto + 1) });
  });
  return filtros;
}

/** Embeds de topo do `select` (`*,itens:rh_ase_itens!fk(*)` → `{ nome: 'itens', tabela: 'rh_ase_itens' }`). */
export function lerEmbeds(select: string | null): Embed[] {
  if (!select) return [];
  const nomes: Embed[] = [];
  let nivel = 0;
  let atual = '';
  for (const ch of select + ',') {
    if (ch === '(') {
      if (nivel === 0) {
        const partes = atual.trim().split(':');
        const tabela = (partes[1] ?? partes[0]).trim().replace(/!.*$/, '');
        const nome = partes.length > 1 ? partes[0].trim() : tabela;
        if (nome) nomes.push({ nome, tabela });
      }
      nivel++;
    } else if (ch === ')') {
      nivel--;
    } else if (ch === ',' && nivel === 0) {
      atual = '';
      continue;
    }
    if (nivel === 0 && ch !== ')') atual += ch;
  }
  return nomes;
}

export function lerOrdem(order: string | null): ConsultaRest['ordem'] {
  if (!order) return [];
  return order.split(',').map(parte => {
    const [coluna, ...mods] = parte.split('.');
    return { coluna, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : undefined };
  }).filter(item => item.coluna);
}

export function lerConsulta(url: URL): ConsultaRest | null {
  const tabela = recursoRest(url.pathname);
  if (!tabela || tabela.startsWith('rpc/')) return null;
  return {
    tabela,
    filtros: lerFiltros(url.searchParams),
    ordem: lerOrdem(url.searchParams.get('order')),
    embeds: lerEmbeds(url.searchParams.get('select')),
  };
}

function comoTexto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function comparar(a: unknown, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === 'number' || (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb) && /^-?\d/.test(String(a)))) return na - nb;
  return String(a).localeCompare(b);
}

function listaIn(valor: string): string[] {
  return valor.replace(/^\(|\)$/g, '').split(',').map(item => item.trim().replace(/^"|"$/g, ''));
}

/**
 * Avalia um filtro do PostgREST sobre a linha. Operador desconhecido conta
 * como "passa" — melhor mostrar um registro a mais do que esconder um feito
 * offline.
 */
export function atendeFiltro(linha: Linha, filtro: Filtro): boolean {
  const valor = linha[filtro.coluna];
  const texto = comoTexto(valor);
  let ok: boolean;
  switch (filtro.operador) {
    case 'eq': ok = texto !== null && texto === filtro.valor; break;
    case 'neq': ok = texto !== null && texto !== filtro.valor; break;
    case 'is':
      ok = filtro.valor === 'null' ? valor === null || valor === undefined
        : filtro.valor === 'true' ? valor === true
          : filtro.valor === 'false' ? valor === false
            : true;
      break;
    case 'in': ok = texto !== null && listaIn(filtro.valor).includes(texto); break;
    case 'gt': ok = texto !== null && comparar(valor, filtro.valor) > 0; break;
    case 'gte': ok = texto !== null && comparar(valor, filtro.valor) >= 0; break;
    case 'lt': ok = texto !== null && comparar(valor, filtro.valor) < 0; break;
    case 'lte': ok = texto !== null && comparar(valor, filtro.valor) <= 0; break;
    case 'like':
    case 'ilike': {
      if (texto === null) { ok = false; break; }
      const padrao = filtro.valor.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*').replace(/_/g, '.'); // `_` = um caractere, como no SQL
      ok = new RegExp(`^${padrao}$`, filtro.operador === 'ilike' ? 'i' : '').test(texto);
      break;
    }
    default: ok = true;
  }
  return filtro.negado ? !ok : ok;
}

export function atendeFiltros(linha: Linha, filtros: Filtro[]): boolean {
  return filtros.every(filtro => atendeFiltro(linha, filtro));
}

export function ordenar(linhas: Linha[], ordem: ConsultaRest['ordem']): Linha[] {
  if (!ordem.length) return linhas;
  return [...linhas].sort((a, b) => {
    for (const { coluna, desc, nullsFirst } of ordem) {
      const va = a[coluna];
      const vb = b[coluna];
      const nulaA = va === null || va === undefined;
      const nulaB = vb === null || vb === undefined;
      if (nulaA || nulaB) {
        if (nulaA && nulaB) continue;
        const primeiroNulo = nullsFirst ?? desc;
        return (nulaA ? -1 : 1) * (primeiroNulo ? 1 : -1);
      }
      const r = comparar(va, String(vb));
      if (r !== 0) return desc ? -r : r;
    }
    return 0;
  });
}

/** Linhas afetadas por um update/delete da fila (os filtros da gravação). */
function afetada(linha: Linha, efeito: EfeitoPendente): boolean {
  return !!efeito.filtros?.length && atendeFiltros(linha, efeito.filtros);
}

/** Há pendência na tabela da consulta ou em algum filho embutido nela? */
export function tocaConsulta(consulta: ConsultaRest, efeitos: EfeitoPendente[]): boolean {
  return efeitos.some(efeito => efeito.tabela === consulta.tabela || consulta.embeds.some(embed => embed.tabela === efeito.tabela));
}

/**
 * Filhos embutidos (`itens:rh_ase_itens(*)`) recebem o que foi criado/alterado
 * offline na tabela filha. O vínculo com o pai é a coluna `*_id` do filho que
 * aponta para o `id` do pai (`solicitacao_id`, `relatorio_id`…).
 */
function comFilhosPendentes(linha: Linha, embeds: Embed[], efeitos: EfeitoPendente[]): Linha {
  if (!embeds.length || linha.id === undefined) return linha;
  let saida = linha;
  for (const embed of embeds) {
    const daFilha = efeitos.filter(efeito => efeito.tabela === embed.tabela);
    const atuais = saida[embed.nome];
    if (!daFilha.length || (atuais !== undefined && !Array.isArray(atuais))) continue;
    const doPai = daFilha.map(efeito => (efeito.tipo === 'insert' || efeito.tipo === 'upsert')
      ? { ...efeito, linhas: efeito.linhas.filter(filho => Object.entries(filho).some(([coluna, valor]) => coluna.endsWith('_id') && valor === linha.id)) }
      : efeito);
    const antes = (atuais as Linha[] | undefined) || [];
    const filhos = aplicarEfeitos(antes, { tabela: embed.tabela, filtros: [], ordem: [], embeds: [] }, doPai);
    // Em lista de filhos (itens, ocorrências) o novo entra no fim, como na tela.
    const jaExistiam = new Set(antes.map(filho => String(filho.id)));
    saida = { ...saida, [embed.nome]: [...filhos.filter(f => jaExistiam.has(String(f.id))), ...filhos.filter(f => !jaExistiam.has(String(f.id)))] };
  }
  return saida;
}

/**
 * Aplica as gravações da fila sobre as linhas de uma consulta: inserções
 * entram (se atendem aos filtros), updates mesclam, deletes tiram — e no fim
 * os filtros da consulta são reavaliados (uma saída registrada tira a
 * carreta da lista "no pátio").
 */
export function aplicarEfeitos(linhas: Linha[], consulta: ConsultaRest, efeitos: EfeitoPendente[]): Linha[] {
  const daTabela = efeitos.filter(efeito => efeito.tabela === consulta.tabela);
  if (!daTabela.length) {
    return tocaConsulta(consulta, efeitos) ? linhas.map(linha => comFilhosPendentes(linha, consulta.embeds, efeitos)) : linhas;
  }
  const porId = new Map<string, Linha>();
  const semId: Linha[] = [];
  for (const linha of linhas) {
    if (linha.id !== undefined && linha.id !== null) porId.set(String(linha.id), linha);
    else semId.push(linha);
  }
  const novas = new Set<string>();
  for (const efeito of daTabela) {
    if (efeito.tipo === 'insert' || efeito.tipo === 'upsert') {
      for (const linha of efeito.linhas) {
        const id = String(linha.id);
        const existente = porId.get(id);
        const vazios = Object.fromEntries(consulta.embeds.filter(embed => !(embed.nome in linha)).map(embed => [embed.nome, []]));
        porId.set(id, existente ? { ...existente, ...linha } : { ...vazios, ...linha });
        if (!existente) novas.add(id);
      }
    } else if (efeito.tipo === 'update') {
      const patch = efeito.linhas[0] || {};
      for (const [id, linha] of porId) if (afetada(linha, efeito)) porId.set(id, { ...linha, ...patch });
    } else if (efeito.tipo === 'delete') {
      for (const [id, linha] of porId) if (afetada(linha, efeito)) porId.delete(id);
    }
  }
  const resultado = [...porId.values(), ...semId]
    .filter(linha => atendeFiltros(linha, consulta.filtros))
    .map(linha => comFilhosPendentes(linha, consulta.embeds, efeitos));
  // Sem ordem pedida, o que nasceu no aparelho vai para o topo (é o mais recente).
  if (!consulta.ordem.length) {
    return [...resultado.filter(l => novas.has(String(l.id))), ...resultado.filter(l => !novas.has(String(l.id)))];
  }
  return ordenar(resultado, consulta.ordem);
}

/**
 * Linhas que um update/delete da fila afetaria, procuradas no que o aparelho
 * já conhece da tabela (cópias de leituras + inserções pendentes). Serve para
 * a resposta provisória de `.update().eq('id', x).select().single()`.
 */
export function linhasAfetadas(conhecidas: Linha[], filtros: Filtro[]): Linha[] {
  const vistos = new Set<string>();
  return conhecidas.filter(linha => {
    const id = String(linha.id);
    if (vistos.has(id) || !atendeFiltros(linha, filtros)) return false;
    vistos.add(id);
    return true;
  });
}

/** Id do filtro `id=eq.X`, quando a gravação mira uma linha só. */
export function idDoFiltro(filtros: Filtro[] | undefined): string | null {
  const filtro = filtros?.find(item => item.coluna === 'id' && item.operador === 'eq' && !item.negado);
  return filtro ? filtro.valor : null;
}

/**
 * Corpo da resposta de uma leitura/gravação no formato pedido: objeto para
 * `.single()` (Accept `vnd.pgrst.object+json`), lista nos demais.
 * Devolve `null` quando o `.single()` não tem exatamente uma linha.
 */
export function corpoNoFormato(linhas: Linha[], accept: string | null): { corpo: unknown; status: number } {
  if (accept?.includes('vnd.pgrst.object')) {
    if (linhas.length !== 1) {
      return {
        status: 406,
        corpo: { code: 'PGRST116', details: `Results contain ${linhas.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' },
      };
    }
    return { corpo: linhas[0], status: 200 };
  }
  return { corpo: linhas, status: 200 };
}

/** Troca, em qualquer profundidade, os ids provisórios pelos definitivos. */
export function substituirIds<T>(valor: T, mapa: Record<string, string>): T {
  if (!Object.keys(mapa).length) return valor;
  if (typeof valor === 'string') return (mapa[valor] ?? valor.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, m => mapa[m] ?? m)) as unknown as T;
  if (Array.isArray(valor)) return valor.map(item => substituirIds(item, mapa)) as unknown as T;
  if (valor && typeof valor === 'object' && Object.getPrototypeOf(valor) === Object.prototype) {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, substituirIds(v, mapa)])) as T;
  }
  return valor;
}

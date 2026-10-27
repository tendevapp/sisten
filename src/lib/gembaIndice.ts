/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Índice do Gemba: cada material com os lugares onde está e, ao contrário,
 * o que tem em cada bloco. Puro — a carga do banco fica em `gembaApi.ts`.
 *
 * Mesma regra de `posicaoDoMaterial`: a posição digitada no cadastro vale mais
 * que a da ZL0024; sem nenhuma das duas, vale a última posição guardada em
 * `alm_posicao_material` (o material zerou, a prateleira é a mesma).
 *
 * As peças da BOM com localização no Cadastro de Itens (aba BOM) entram também,
 * logo abaixo do cadastro SAP. Peça com código SAP que está na ZL0024 junta com
 * o material; sem isso vira item próprio pelo part number, com o saldo do
 * módulo Projetos. Zerado continua no mapa, marcado como zerado.
 */

import type { EstoqueItem } from '../types';
import type { CatalogoItem } from './almoxCatalogoApi';
import { interpretarPosicao, separarPosicoes, type Endereco } from './gembaEndereco';
import { chaveBloco, localizar, localizarDeposito, type Localizacao } from './gembaLayout';

export type OrigemLocal = 'zl0024' | 'ultima' | 'cadastro' | 'bom' | 'deposito';

export interface LocalItem {
  /** Posição como veio (vazia quando só o depósito é conhecido). */
  posicao: string;
  endereco: Endereco | null;
  deposito: string | null;
  /** Saldo da ZL0024 nessa posição; `null` quando não se sabe. */
  saldo: number | null;
  origem: OrigemLocal;
  localizacao: Localizacao | null;
}

export interface ItemGemba {
  codigo: string;
  descricao: string;
  umb: string;
  saldoTotal: number;
  depositos: string[];
  locais: LocalItem[];
  imagemPath: string | null;
  /** Part number da peça da BOM (só itens que vieram do cadastro BOM). */
  partNumber: string | null;
  /** Sem saldo hoje: na ZL0024 ou, para a peça só da BOM, no Projetos. */
  zerado: boolean;
}

/** Peça da BOM com localização (`alm_bom_itens_cadastro` + saldo do Projetos). */
export interface PecaBomGemba {
  partNumber: string;
  codSap: string | null;
  descricao: string;
  umb: string;
  /** Como foi digitada; pode ter mais de uma, separadas por vírgula. */
  posicao: string;
  /** Saldo no almoxarifado pelo módulo Projetos; `null` sem item no catálogo do projeto. */
  saldo: number | null;
  imagemPath: string | null;
}

export interface ItemNoBloco {
  item: ItemGemba;
  local: LocalItem;
}

export interface IndiceGemba {
  itens: ItemGemba[];
  porCodigo: Map<string, ItemGemba>;
  /** Chave `chaveBloco(deposito, bloco)`. */
  porBloco: Map<string, ItemNoBloco[]>;
}

function criarLocal(posicao: string, origem: OrigemLocal, deposito: string | null, saldo: number | null): LocalItem {
  const endereco = interpretarPosicao(posicao);
  const depositoFinal = deposito ?? (endereco && 'deposito' in endereco ? endereco.deposito : null);
  return { posicao, endereco, deposito: depositoFinal, saldo, origem, localizacao: endereco ? localizar(endereco) : null };
}

function localSoDoDeposito(deposito: string, saldo: number): LocalItem {
  return {
    posicao: '',
    endereco: { tipo: 'deposito', deposito, bruto: '' },
    deposito,
    saldo,
    origem: 'deposito',
    localizacao: localizarDeposito(deposito),
  };
}

interface Acumulado {
  codigo: string;
  descricao: string;
  umb: string;
  saldoTotal: number;
  /** Saldo por depósito, inclusive o que está sem posição. */
  saldoDeposito: Map<string, number>;
  /** posição → { depósito, saldo } da ZL0024. */
  posicoes: Map<string, { deposito: string | null; saldo: number }>;
}

export function montarIndiceGemba(
  estoque: EstoqueItem[],
  posicoesGuardadas: Map<string, string[]>,
  catalogo: Pick<CatalogoItem, 'codigo_sap' | 'descricao' | 'umb' | 'posicao_estoque' | 'imagem_path'>[],
  pecasBom: PecaBomGemba[] = [],
): IndiceGemba {
  const acumulados = new Map<string, Acumulado>();
  const pegar = (codigo: string): Acumulado => {
    let a = acumulados.get(codigo);
    if (!a) {
      a = { codigo, descricao: '', umb: '', saldoTotal: 0, saldoDeposito: new Map(), posicoes: new Map() };
      acumulados.set(codigo, a);
    }
    return a;
  };

  for (const row of estoque) {
    const codigo = String(row.material ?? '').trim();
    if (!codigo) continue;
    const a = pegar(codigo);
    const saldo = Number(row.quantidade) || 0;
    const deposito = String(row.deposito ?? '').trim() || null;
    a.descricao ||= String(row.txt_breve_material ?? '').trim();
    a.umb ||= String(row.umb ?? '').trim();
    a.saldoTotal += saldo;
    if (deposito) a.saldoDeposito.set(deposito, (a.saldoDeposito.get(deposito) ?? 0) + saldo);
    const posicao = String(row.posicao_estoque ?? '').trim().toUpperCase();
    if (posicao) {
      const atual = a.posicoes.get(posicao);
      a.posicoes.set(posicao, { deposito: atual?.deposito ?? deposito, saldo: (atual?.saldo ?? 0) + saldo });
    }
  }

  const cadastroPorCodigo = new Map(catalogo.filter(c => c.codigo_sap).map(c => [c.codigo_sap, c]));
  for (const codigo of [...posicoesGuardadas.keys(), ...cadastroPorCodigo.keys()]) pegar(codigo);

  // Peça da BOM: junta com o material SAP quando ele já está no índice (o
  // código pode vir com ou sem zeros à esquerda); senão, item pelo part number.
  const semZeros = (c: string) => c.replace(/^0+/, '');
  const codigoPorSemZeros = new Map([...acumulados.keys()].map(c => [semZeros(c), c]));
  const bomPorCodigo = new Map<string, PecaBomGemba[]>();
  for (const peca of pecasBom) {
    if (separarPosicoes(peca.posicao).length === 0) continue;
    const sap = peca.codSap?.trim();
    const codigo = (sap && codigoPorSemZeros.get(semZeros(sap))) || peca.partNumber;
    if (!codigo) continue;
    pegar(codigo);
    const lista = bomPorCodigo.get(codigo);
    if (lista) lista.push(peca);
    else bomPorCodigo.set(codigo, [peca]);
  }

  const itens: ItemGemba[] = [];
  for (const a of acumulados.values()) {
    const cadastro = cadastroPorCodigo.get(a.codigo);
    const bom = bomPorCodigo.get(a.codigo) ?? [];
    // Peça só da BOM (não está na ZL0024): o saldo é o do Projetos.
    const soDaBom = bom.length > 0 && a.saldoDeposito.size === 0;
    const saldoBom = bom.some(p => p.saldo != null) ? bom.reduce((s, p) => s + (p.saldo ?? 0), 0) : null;
    let locais: LocalItem[];
    const digitadas = separarPosicoes(cadastro?.posicao_estoque);
    const posicoesBom = separarPosicoes(bom.map(p => p.posicao).join(','));
    if (digitadas.length > 0) {
      locais = digitadas.map(p => {
        const daZl = a.posicoes.get(p);
        return criarLocal(p, 'cadastro', daZl?.deposito ?? null, daZl?.saldo ?? null);
      });
    } else if (posicoesBom.length > 0) {
      // Saldo por posição só quando há uma: o Projetos não sabe dividir entre prateleiras.
      locais = posicoesBom.map(p => {
        const daZl = a.posicoes.get(p);
        const saldo = daZl?.saldo ?? (soDaBom && posicoesBom.length === 1 ? saldoBom : null);
        return criarLocal(p, 'bom', daZl?.deposito ?? null, saldo);
      });
    } else if (a.posicoes.size > 0) {
      locais = [...a.posicoes].map(([p, z]) => criarLocal(p, 'zl0024', z.deposito, z.saldo));
    } else {
      locais = separarPosicoes((posicoesGuardadas.get(a.codigo) ?? []).join(',')).map(p => criarLocal(p, 'ultima', null, null));
    }
    // Saldo em depósito sem nenhuma posição conhecida: acende ao menos a rua.
    const depositosComLocal = new Set(locais.map(l => l.deposito));
    for (const [deposito, saldo] of a.saldoDeposito) {
      if (saldo > 0 && !depositosComLocal.has(deposito)) locais.push(localSoDoDeposito(deposito, saldo));
    }
    locais.sort((x, y) => x.posicao.localeCompare(y.posicao, 'pt-BR', { numeric: true }));

    const saldoTotal = soDaBom ? saldoBom ?? 0 : a.saldoTotal;
    itens.push({
      codigo: a.codigo,
      descricao: a.descricao || cadastro?.descricao || bom[0]?.descricao || `Material ${a.codigo}`,
      umb: a.umb || cadastro?.umb || bom[0]?.umb || '',
      saldoTotal,
      depositos: soDaBom
        ? [...new Set(locais.map(l => l.deposito).filter((d): d is string => Boolean(d)))].sort()
        : [...a.saldoDeposito.keys()].sort(),
      locais,
      imagemPath: cadastro?.imagem_path ?? bom.find(p => p.imagemPath)?.imagemPath ?? null,
      partNumber: bom[0]?.partNumber ?? null,
      zerado: saldoTotal <= 0,
    });
  }
  itens.sort((x, y) => x.descricao.localeCompare(y.descricao, 'pt-BR'));

  const porBloco = new Map<string, ItemNoBloco[]>();
  for (const item of itens) {
    for (const local of item.locais) {
      if (local.endereco?.tipo !== 'prateleira') continue;
      const chave = chaveBloco(local.endereco.deposito, local.endereco.bloco);
      const lista = porBloco.get(chave);
      if (lista) lista.push({ item, local });
      else porBloco.set(chave, [{ item, local }]);
    }
  }
  for (const lista of porBloco.values()) {
    lista.sort((x, y) => x.local.posicao.localeCompare(y.local.posicao, 'pt-BR', { numeric: true }));
  }

  return { itens, porCodigo: new Map(itens.map(i => [i.codigo, i])), porBloco };
}

/** O item tem ao menos um lugar no mapa (mesmo que aproximado). */
export function itemTemLugar(item: ItemGemba): boolean {
  return item.locais.some(l => l.localizacao != null);
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const semPontos = (partNumber: string | null) => (partNumber ?? '').replace(/[.\-\s]/g, '').toUpperCase();

/**
 * Busca por código SAP (exato ou começo), por palavras da descrição ou por
 * começo de posição quando o termo tem ponto (`104.13`).
 */
export function buscarItensGemba(indice: IndiceGemba, termo: string, limite = 60): ItemGemba[] {
  const t = normalizar(termo).replace(/\s+/g, ' ');
  if (!t) return [];

  if (/^\d{3}\.\d*$/.test(t) || /^\d{9}$/.test(t)) {
    const prefixo = t.toUpperCase();
    // Nove dígitos também é part number da BOM sem os pontos (60.10.92715 → 601092715).
    return indice.itens
      .filter(i => i.locais.some(l => l.posicao.startsWith(prefixo) || l.posicao.replace('.', '').startsWith(prefixo))
        || semPontos(i.partNumber).startsWith(prefixo))
      .slice(0, limite);
  }

  const palavras = t.split(' ');
  const encontrados = indice.itens.filter(i => {
    const alvo = `${i.codigo} ${i.partNumber ? `${normalizar(i.partNumber)} ${semPontos(i.partNumber).toLowerCase()} ` : ''}${normalizar(i.descricao)}`;
    return palavras.every(p => alvo.includes(p));
  });
  const peso = (i: ItemGemba): number => {
    if (i.codigo === t) return 0;
    if (i.codigo.startsWith(t)) return 1;
    if (normalizar(i.descricao).startsWith(t)) return 2;
    return 3;
  };
  return encontrados
    .map(i => ({ i, p: peso(i) }))
    .sort((a, b) => a.p - b.p || Number(b.i.saldoTotal > 0) - Number(a.i.saldoTotal > 0))
    .slice(0, limite)
    .map(x => x.i);
}

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
 */

import type { EstoqueItem } from '../types';
import type { CatalogoItem } from './almoxCatalogoApi';
import { interpretarPosicao, separarPosicoes, type Endereco } from './gembaEndereco';
import { chaveBloco, localizar, localizarDeposito, type Localizacao } from './gembaLayout';

export type OrigemLocal = 'zl0024' | 'ultima' | 'cadastro' | 'deposito';

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

  const itens: ItemGemba[] = [];
  for (const a of acumulados.values()) {
    const cadastro = cadastroPorCodigo.get(a.codigo);
    let locais: LocalItem[];
    const digitadas = separarPosicoes(cadastro?.posicao_estoque);
    if (digitadas.length > 0) {
      locais = digitadas.map(p => {
        const daZl = a.posicoes.get(p);
        return criarLocal(p, 'cadastro', daZl?.deposito ?? null, daZl?.saldo ?? null);
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

    itens.push({
      codigo: a.codigo,
      descricao: a.descricao || cadastro?.descricao || `Material ${a.codigo}`,
      umb: a.umb || cadastro?.umb || '',
      saldoTotal: a.saldoTotal,
      depositos: [...a.saldoDeposito.keys()].sort(),
      locais,
      imagemPath: cadastro?.imagem_path ?? null,
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

/**
 * Busca por código SAP (exato ou começo), por palavras da descrição ou por
 * começo de posição quando o termo tem ponto (`104.13`).
 */
export function buscarItensGemba(indice: IndiceGemba, termo: string, limite = 60): ItemGemba[] {
  const t = normalizar(termo).replace(/\s+/g, ' ');
  if (!t) return [];

  if (/^\d{3}\.\d*$/.test(t) || /^\d{9}$/.test(t)) {
    const prefixo = t.toUpperCase();
    return indice.itens
      .filter(i => i.locais.some(l => l.posicao.startsWith(prefixo) || l.posicao.replace('.', '').startsWith(prefixo)))
      .slice(0, limite);
  }

  const palavras = t.split(' ');
  const encontrados = indice.itens.filter(i => {
    const alvo = `${i.codigo} ${normalizar(i.descricao)}`;
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

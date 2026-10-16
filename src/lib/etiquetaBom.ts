/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Etiqueta de identificação dos itens da BOM do projeto (Almox > Cadastro de
 * Itens > Itens BOM). Mesmo desenho da etiqueta de papel: descrição,
 * localização, código do item, código equivalente Qingdao, imagem, QR code e
 * a quantidade por seção (S1..S5) com o grupo da BOM.
 *
 * A BOM tem uma linha por uso da peça (a mesma arruela aparece em vários
 * conjuntos), e `quantity` já é por torre (ver `projetosBom.ts`). Por isso a
 * quantidade da seção na etiqueta é a SOMA das linhas da peça naquela seção.
 */

import { normalizarGrupo, normalizarPartNumber } from './projetos';
import { ORIGEM_SISTEN } from './etiquetaMaterial';
import type { ProjBomNo } from '../types';

/** Rota curta do QR da etiqueta BOM (App redireciona para Itens BOM com a peça aberta). */
export const ROTA_CURTA_QR_BOM = '/bom';
export const ROTA_CADASTRO_ITENS = '/formularios/almoxarifado-cadastro-itens';
/** `peca`, não `item`: o leitor do cabeçalho trata `item` como código SAP (baixa no balcão). */
export const PARAMETRO_PECA = 'peca';

/** Conteúdo gravado no QR da etiqueta BOM. */
export function conteudoQrEtiquetaBom(partNumber: string): string {
  return `${ORIGEM_SISTEN}/#${ROTA_CURTA_QR_BOM}?${PARAMETRO_PECA}=${encodeURIComponent(partNumber.trim())}`;
}

/** Part number do parâmetro `peca` de uma rota/endereço, ou null. */
export function pecaDaRota(endereco: string): string | null {
  const consulta = endereco.includes('?') ? endereco.slice(endereco.lastIndexOf('?') + 1) : '';
  const peca = (new URLSearchParams(consulta).get(PARAMETRO_PECA) ?? '').trim();
  return peca || null;
}

export interface SecaoItemBom {
  /** `S1`..`S5`; null quando a linha da BOM não tem seção. */
  secao: string | null;
  grupo: string;
  quantidade: number;
}

export interface ItemBom {
  /** Chave: part number normalizado (só letras e números, maiúsculas). */
  chave: string;
  /** Como aparece na BOM (a primeira grafia encontrada). */
  partNumber: string;
  descricao: string;
  descricaoEn: string;
  qingdao: string | null;
  codSap: string | null;
  uom: string | null;
  /** Menor nível da peça na árvore (1 = torre). */
  nivel: number | null;
  grupos: string[];
  secoes: SecaoItemBom[];
  quantidadeTotal: number;
}

const texto = (v: string | null | undefined) => (v ?? '').trim();

const ordemSecao = (s: string | null) => {
  if (!s) return 99;
  const n = Number(s.replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 98;
};

/**
 * Uma entrada por peça da BOM, com a quantidade somada por seção e grupo.
 * Linhas sem part number ficam de fora (não há o que etiquetar).
 */
export function agruparItensBom(linhas: Pick<ProjBomNo,
  'part_number' | 'part_number_norm' | 'descricao' | 'description' | 'codigo_equivalente_qingdao'
  | 'cod_sap' | 'uom' | 'level' | 'secao' | 'grupo' | 'qtd_por_torre'>[],
): ItemBom[] {
  const mapa = new Map<string, ItemBom & { _secoes: Map<string, SecaoItemBom> }>();
  for (const l of linhas) {
    const chave = texto(l.part_number_norm) || normalizarPartNumber(l.part_number);
    if (!chave) continue;
    let item = mapa.get(chave);
    if (!item) {
      item = {
        chave,
        partNumber: texto(l.part_number) || chave,
        descricao: '',
        descricaoEn: '',
        qingdao: null,
        codSap: null,
        uom: texto(l.uom) || null,
        nivel: l.level ?? null,
        grupos: [],
        secoes: [],
        quantidadeTotal: 0,
        _secoes: new Map(),
      };
      mapa.set(chave, item);
    }
    if (!item.descricao && texto(l.descricao)) item.descricao = texto(l.descricao);
    if (!item.descricaoEn && texto(l.description)) item.descricaoEn = texto(l.description);
    if (!item.qingdao && texto(l.codigo_equivalente_qingdao)) item.qingdao = texto(l.codigo_equivalente_qingdao);
    if (!item.codSap && texto(l.cod_sap)) item.codSap = texto(l.cod_sap);
    if (!item.uom && texto(l.uom)) item.uom = texto(l.uom);
    if (l.level != null && (item.nivel == null || l.level < item.nivel)) item.nivel = l.level;

    const grupo = normalizarGrupo(l.grupo);
    if (grupo && !item.grupos.includes(grupo)) item.grupos.push(grupo);
    const secao = texto(l.secao).toUpperCase() || null;
    const qtd = Number(l.qtd_por_torre) || 0;
    const chaveSecao = `${secao ?? ''}|${grupo}`;
    const s = item._secoes.get(chaveSecao) ?? { secao, grupo, quantidade: 0 };
    s.quantidade += qtd;
    item._secoes.set(chaveSecao, s);
    item.quantidadeTotal += qtd;
  }

  return [...mapa.values()]
    .map(({ _secoes, ...item }) => ({
      ...item,
      descricao: item.descricao || item.descricaoEn || item.partNumber,
      grupos: [...item.grupos].sort(),
      secoes: [..._secoes.values()].sort((a, b) => ordemSecao(a.secao) - ordemSecao(b.secao) || a.grupo.localeCompare(b.grupo)),
    }))
    .sort((a, b) => a.partNumber.localeCompare(b.partNumber, 'pt-BR', { numeric: true }));
}

/** Linhas que cabem na grade da etiqueta. */
export const MAX_LINHAS_SECAO_ETIQUETA = 6;

/**
 * Linhas da tabela de seções na etiqueta. Com mais combinações seção × grupo
 * do que cabem, junta os grupos de cada seção numa linha só ("VÁRIOS") —
 * a quantidade da seção continua certa, só o grupo deixa de ser detalhado.
 */
export function linhasSecaoEtiqueta(secoes: SecaoItemBom[]): SecaoItemBom[] {
  if (secoes.length <= MAX_LINHAS_SECAO_ETIQUETA) return secoes;
  const porSecao = new Map<string, SecaoItemBom>();
  for (const s of secoes) {
    const chave = s.secao ?? '';
    const atual = porSecao.get(chave);
    if (!atual) porSecao.set(chave, { ...s });
    else {
      atual.quantidade += s.quantidade;
      if (atual.grupo !== s.grupo) atual.grupo = 'VÁRIOS';
    }
  }
  return [...porSecao.values()].sort((a, b) => ordemSecao(a.secao) - ordemSecao(b.secao));
}

export interface CadastroBomEtiqueta {
  posicao_estoque?: string | null;
  etiqueta_descricao?: string | null;
}

export interface DadosEtiquetaBom {
  partNumber: string;
  /** Nome em português (o editado no cadastro vale mais que o da BOM). */
  descricao: string;
  /** Nome em inglês, da BOM; vazio quando não há ou é igual ao português. */
  descricaoEn: string;
  localizacao: string;
  qingdao: string;
  secoes: SecaoItemBom[];
  /** URL assinada da foto, se houver. */
  url_foto: string | null;
}

/**
 * O que vai impresso: nome em português (o editado no cadastro vale mais que o
 * da BOM) e, embaixo, o nome em inglês da BOM.
 */
export function dadosEtiquetaBom(item: ItemBom, cadastro: CadastroBomEtiqueta | null | undefined, urlFoto: string | null): DadosEtiquetaBom {
  const descricao = texto(cadastro?.etiqueta_descricao) || item.descricao;
  const ingles = texto(item.descricaoEn);
  return {
    partNumber: item.partNumber,
    descricao,
    descricaoEn: ingles && ingles.toLowerCase() !== descricao.toLowerCase() ? ingles : '',
    localizacao: texto(cadastro?.posicao_estoque),
    qingdao: item.qingdao ?? '',
    secoes: linhasSecaoEtiqueta(item.secoes),
    url_foto: urlFoto,
  };
}

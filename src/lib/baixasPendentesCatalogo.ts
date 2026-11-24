/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cadastro de Itens: material com retirada do balcão ainda sem documento no
 * SAP — Requisição no Balcão (saída ou transferência, inclusive a aguardando
 * confirmação) sem doc. SAP, ou Solicitação Extraordinária pendente sem RQB.
 *
 * A ZL0024 só abate o que foi lançado. Enquanto a baixa não sai, a contagem
 * física fica menor que o saldo e o inventário acusa divergência que não é
 * falta — por isso o cartão do item ganha a tag "Baixa pendente".
 *
 * A regra de "sem baixa" mora na RPC `alm_baixas_pendentes_por_material`
 * (migration 20261124120000); aqui só se agrupa por material.
 */

import { normalizeCode } from './almoxarifado';

export interface MovimentoSemBaixa {
  material: string;
  /** 'balcao' = Requisição no Balcão; 'extraordinaria' = Solicitação Extraordinária sem RQB. */
  origem: 'balcao' | 'extraordinaria';
  codigo: string;
  data: string;
  tipo_movimento: 'saida' | 'transferencia' | string;
  deposito: string | null;
  deposito_destino: string | null;
  quantidade: number | null;
  unidade: string | null;
  aguardando_confirmacao: boolean;
}

export interface BaixaPendenteMaterial {
  material: string;
  /** Soma das quantidades (todas as linhas, qualquer depósito). */
  quantidade: number;
  unidade: string;
  movimentos: MovimentoSemBaixa[];
}

/** Agrupa por código SAP normalizado; movimentos do mais antigo para o mais novo. */
export function baixasPendentesPorMaterial(linhas: MovimentoSemBaixa[]): Map<string, BaixaPendenteMaterial> {
  const mapa = new Map<string, BaixaPendenteMaterial>();
  for (const l of linhas) {
    const chave = normalizeCode(l.material);
    if (!chave) continue;
    let atual = mapa.get(chave);
    if (!atual) {
      atual = { material: chave, quantidade: 0, unidade: '', movimentos: [] };
      mapa.set(chave, atual);
    }
    atual.quantidade += Number(l.quantidade) || 0;
    if (!atual.unidade && l.unidade) atual.unidade = l.unidade;
    atual.movimentos.push(l);
  }
  for (const b of mapa.values()) {
    b.quantidade = Math.round(b.quantidade * 1000) / 1000;
    b.movimentos.sort((a, b2) => (a.data === b2.data ? a.codigo.localeCompare(b2.codigo) : a.data.localeCompare(b2.data)));
  }
  return mapa;
}

/** Documentos distintos (RQB/RSS/SEM) — uma RQB pode ter o material em dois depósitos. */
export function codigosDistintos(b: BaixaPendenteMaterial): string[] {
  return [...new Set(b.movimentos.map((m) => m.codigo))];
}

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** "2 requisições · 5 UN" — texto curto da tag. */
export function resumoBaixaPendente(b: BaixaPendenteMaterial): string {
  const n = codigosDistintos(b).length;
  const docs = `${n} ${n === 1 ? 'requisição' : 'requisições'}`;
  return b.quantidade > 0 ? `${docs} · ${fmt(b.quantidade)}${b.unidade ? ` ${b.unidade}` : ''}` : docs;
}

/** Rótulo do movimento: "Saída", "Transferência 0002→0105", "Extraordinária". */
export function rotuloMovimento(m: MovimentoSemBaixa): string {
  if (m.origem === 'extraordinaria') return 'Extraordinária (sem RQB)';
  if (m.tipo_movimento === 'transferencia') {
    const rota = [m.deposito, m.deposito_destino].filter(Boolean).join('→');
    return `Transferência${rota ? ` ${rota}` : ''}`;
  }
  return `Saída${m.deposito ? ` do ${m.deposito}` : ''}`;
}

/** Linhas do title da tag (desktop): uma por movimento. */
export function detalheBaixaPendente(b: BaixaPendenteMaterial): string {
  const linhas = b.movimentos.map((m) => {
    const [a, mes, d] = m.data.split('-');
    const qtd = m.quantidade != null ? ` · ${fmt(Number(m.quantidade))}${m.unidade ? ` ${m.unidade}` : ''}` : '';
    const aguardando = m.aguardando_confirmacao ? ' · aguardando confirmação' : '';
    return `${m.codigo} (${d}/${mes}/${a?.slice(2)}) · ${rotuloMovimento(m)}${qtd}${aguardando}`;
  });
  return ['Retirada sem baixa no SAP — a contagem vai divergir da ZL0024 até o lançamento.', ...linhas].join('\n');
}

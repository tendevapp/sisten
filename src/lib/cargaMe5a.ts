/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trava da importação da ME5A contra arquivo filtrado.
 *
 * A importação trata a ME5A como a foto completa das RMs: o que não vem no
 * arquivo é marcado `presente_ultima_carga = false` e some da Central de
 * Compras, da busca geral (Ctrl+K) e do QR. Em 11/11 a ME5A entrou três vezes
 * com ~325 linhas (só o grupo de compradores 575) contra ~3.480 da carga
 * completa, e 3.155 RMs abertas sumiram. Antes de gravar, a tela compara o
 * arquivo com as cargas recentes e pede confirmação quando ele vem bem menor.
 */

/** Abaixo desta fração das linhas da maior carga recente, o arquivo é suspeito. */
export const FRACAO_MINIMA_CARGA_ME5A = 0.6;

export interface AvaliacaoCargaMe5a {
  linhas: number;
  /** Maior quantidade de linhas lidas nas cargas recentes (0 = sem histórico). */
  referencia: number;
  /** Grupos de compradores presentes no arquivo, com a contagem de linhas. */
  grupos: { grupo: string; linhas: number }[];
  parcial: boolean;
}

const normalizar = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

/** Coluna do grupo de compradores ("Grupo de compradores" / "Grp.compradores"). */
function indiceGrupo(cabecalho: unknown[]): number {
  const nomes = cabecalho.map(normalizar);
  const exato = nomes.indexOf('grupo de compradores');
  if (exato >= 0) return exato;
  return nomes.findIndex((n) => /^gr(u)?p(o)?\.? ?(de )?compradores$/.test(n));
}

export function avaliarCargaMe5a(rawRows: unknown[][], referencia: number): AvaliacaoCargaMe5a {
  const [cabecalho = [], ...corpo] = rawRows;
  const dados = corpo.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  const iGrupo = indiceGrupo(cabecalho);
  const contagem = new Map<string, number>();
  if (iGrupo >= 0) {
    for (const r of dados) {
      const g = String(r[iGrupo] ?? '').trim() || '(sem grupo)';
      contagem.set(g, (contagem.get(g) ?? 0) + 1);
    }
  }
  const grupos = [...contagem.entries()]
    .map(([grupo, linhas]) => ({ grupo, linhas }))
    .sort((a, b) => b.linhas - a.linhas || a.grupo.localeCompare(b.grupo));
  return {
    linhas: dados.length,
    referencia,
    grupos,
    parcial: referencia > 0 && dados.length < referencia * FRACAO_MINIMA_CARGA_ME5A,
  };
}

/** Texto do diálogo de confirmação para arquivo suspeito. */
export function mensagemCargaParcialMe5a(a: AvaliacaoCargaMe5a): string {
  const grupos = a.grupos.slice(0, 6).map((g) => `${g.grupo} (${g.linhas})`).join(', ');
  return `O arquivo tem ${a.linhas} linha(s); as cargas recentes da ME5A tinham até ${a.referencia}. `
    + (grupos ? `Grupos de compradores no arquivo: ${grupos}${a.grupos.length > 6 ? '…' : ''}. ` : '')
    + 'Tudo o que não estiver no arquivo será tratado como RM fechada e sairá da Central de Compras e da busca. '
    + 'Se a ME5A foi extraída com filtro (ex.: por grupo de compradores), cancele e exporte de novo sem filtro.';
}

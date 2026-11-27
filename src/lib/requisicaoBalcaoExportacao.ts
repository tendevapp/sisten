/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Requisição no Balcão — conferência antes de exportar a planilha do SAP.
 *
 * 27/11/2026: dois almoxarifes exportaram as mesmas 30 requisições com 90 s
 * de diferença. A tela do segundo ainda mostrava a lista carregada antes da
 * primeira exportação, e o banco trocava o lote sem reclamar — duas
 * planilhas iguais, risco de baixa em dobro no SAP. Agora a tela relê as
 * selecionadas no servidor antes de gerar o arquivo, e o banco
 * (`alm_rqb_registrar_exportacao_original`) recusa o que outra pessoa já
 * exportou. Só passa reexportação que a própria pessoa viu e confirmou.
 */

interface ReqParaExportar {
  id: string;
  codigo: string;
  exportacao_id: string | null;
  pendente_confirmacao?: boolean | null;
}

export type ConferenciaExportacao<T> =
  | { ok: true; atuais: T[]; reexportar: string[] }
  | { ok: false; jaExportadas: string[]; sumiram: string[]; pendentes: string[] };

/**
 * `tela`: as selecionadas como a pessoa as viu. `servidor`: as mesmas, relidas
 * agora (sem as excluídas). Reexportar só o que já estava no mesmo lote quando
 * a pessoa confirmou "Exportar de novo".
 */
export function conferirAntesDeExportar<T extends ReqParaExportar>(tela: ReqParaExportar[], servidor: T[]): ConferenciaExportacao<T> {
  const porId = new Map(servidor.map(s => [s.id, s]));
  const jaExportadas: string[] = [];
  const sumiram: string[] = [];
  const pendentes: string[] = [];
  const reexportar: string[] = [];
  for (const t of tela) {
    const atual = porId.get(t.id);
    if (!atual) { sumiram.push(t.codigo); continue; }
    if (atual.pendente_confirmacao) { pendentes.push(t.codigo); continue; }
    if (atual.exportacao_id) {
      if (atual.exportacao_id === t.exportacao_id) reexportar.push(t.id);
      else jaExportadas.push(t.codigo);
    }
  }
  if (jaExportadas.length || sumiram.length || pendentes.length) return { ok: false as const, jaExportadas, sumiram, pendentes };
  const ordem = new Map(tela.map((t, i) => [t.id, i]));
  return { ok: true, reexportar, atuais: [...servidor].sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0)) };
}

export function mensagemConflitoExportacao(conferencia: ConferenciaExportacao<unknown>): string {
  if (conferencia.ok === true) return '';
  const c = conferencia as Extract<ConferenciaExportacao<unknown>, { ok: false }>;
  const partes: string[] = [];
  if (c.jaExportadas.length) partes.push(`${c.jaExportadas.join(', ')} já foram exportadas por outra pessoa enquanto esta lista estava aberta`);
  if (c.sumiram.length) partes.push(`${c.sumiram.join(', ')} foram excluídas`);
  if (c.pendentes.length) partes.push(`${c.pendentes.join(', ')} voltaram a pendente de confirmação`);
  return `Nada foi exportado: ${partes.join('; ')}. A lista foi atualizada — confira e exporte de novo.`;
}

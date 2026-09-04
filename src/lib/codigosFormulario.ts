/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Código de registro dos formulários do SISTEN — `MODULO-DDMMYY-INDICE`.
 *
 * REGRA DO APP: todo formulário novo identifica seus registros por este padrão
 * (ex.: `RID-030926-01`, `ASE-270826-01`), com o índice sequencial reiniciado
 * no recorte que o módulo definir (dia ou mês) e sempre com dois dígitos.
 * O código é o que o usuário lê, cita no e-mail e procura na listagem — ter um
 * formato por módulo obrigaria cada tela a ensinar o seu.
 *
 * Este arquivo é a implementação única. Módulos legados que nasceram com
 * variações (`SUP-DDMMAA-NN` por dia, `ASE-DDMMAA-SETOR`, protocolos de
 * portaria com sufixo aleatório) continuam como estão: o código já está
 * impresso em registro de produção e renumerar quebraria o histórico.
 */

/** `2026-09-04` → `040926`. Sem data, usa hoje. */
export function formatarDataDDMMYY(dataISO?: string | null): string {
  const deData = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;

  if (!dataISO) return deData(new Date());

  // Caminho normal: `YYYY-MM-DD` (com ou sem hora). Fatiar a string evita o
  // fuso — `new Date('2026-09-04')` volta como 03/09 em UTC-3.
  const partes = dataISO.split('-');
  if (partes.length === 3) {
    const [ano, mes, dia] = partes;
    return `${dia.slice(0, 2).padStart(2, '0')}${mes.padStart(2, '0')}${ano.slice(-2)}`;
  }

  const parsed = new Date(dataISO);
  return deData(isNaN(parsed.getTime()) ? new Date() : parsed);
}

/**
 * Monta o código no padrão `MODULO-DDMMYY-INDICE`.
 *
 * @param prefixo sigla do módulo/formulário (`RID`, `ASE`, ...).
 * @param dataISO data do registro; sem ela, hoje.
 * @param indice sequencial do recorte; sempre com dois dígitos no mínimo.
 */
export function gerarCodigoFormulario(
  prefixo: string,
  dataISO?: string | null,
  indice: number | string = 1,
): string {
  const numero = typeof indice === 'number' ? indice : parseInt(String(indice), 10) || 1;
  const sequencial = String(Math.max(1, numero)).padStart(2, '0');
  return `${prefixo.toUpperCase()}-${formatarDataDDMMYY(dataISO)}-${sequencial}`;
}

/**
 * Próximo índice a partir dos códigos já gravados, ignorando o que não seguir
 * o padrão. Use com a lista do recorte (mês ou dia) que o módulo adota.
 */
export function proximoIndiceCodigo(prefixo: string, codigosExistentes: (string | null | undefined)[]): number {
  const padrao = new RegExp(`^${prefixo.toUpperCase()}-\\d{6}-(\\d+)$`, 'i');
  let maior = 0;
  for (const codigo of codigosExistentes) {
    const achado = String(codigo ?? '').trim().match(padrao);
    if (!achado) continue;
    const indice = parseInt(achado[1], 10);
    if (!isNaN(indice) && indice > maior) maior = indice;
  }
  return maior + 1;
}

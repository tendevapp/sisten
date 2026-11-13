/**
 * Correção do horário de um lançamento do Livro de Ocorrências da Portaria.
 *
 * O texto da linha do livro (`descricao`) começa pelo horário de entrada
 * ("06:09 - PADARIA IDEAL ...") e, quando há saída, termina com
 * "(Saída registrada às 06:13 por ...)" / "(Retornou às ...)". Trocar só a
 * coluna deixaria o livro e o PDF com a hora antiga, então o texto é
 * ajustado no mesmo lugar — sem remontar a linha inteira, que nos
 * lançamentos antigos foi digitada livre.
 */

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "06:09" ou "06:09:00" → "06:09"; vazio quando não é hora válida. */
export function horaCurta(valor: string | null | undefined): string {
  const curta = String(valor || '').slice(0, 5);
  return HORA.test(curta) ? curta : '';
}

export function trocarHorariosNaDescricao(
  descricao: string,
  horarios: { entrada: string; saida?: string | null },
): string {
  let texto = descricao.replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?(\s*-\s*)/, `${horarios.entrada}$1`);
  if (horarios.saida) {
    texto = texto.replace(
      /\((Saída registrada|Retornou) às \d{1,2}:\d{2}(?::\d{2})?/,
      `($1 às ${horarios.saida}`,
    );
  }
  return texto;
}

/** Erro para mostrar, ou `null` quando os horários podem ser gravados. */
export function validarHorariosOcorrencia(entrada: string, saida: string | null, temSaida: boolean): string | null {
  if (!HORA.test(entrada)) return 'Informe o horário de entrada (HH:MM).';
  if (temSaida && !HORA.test(saida || '')) return 'Informe o horário de saída (HH:MM).';
  return null;
}

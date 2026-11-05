// Mais frequentes nas ASEs ENVIADAS, sem solicitações/itens excluídos.
// Consulta ao supabase-sisten em 02/11/2026; entrada e saída contadas separadamente.
export const ATALHOS_ENTRADA_ASE = ['17:00', '07:00', '16:00', '12:00'];
export const ATALHOS_SAIDA_ASE = ['19:00', '16:00', '18:00', '20:00'];

/** Aceita digitação pelo teclado numérico (700/1730) ou HH:MM. */
export function normalizarHoraAse(texto: string): string | null {
  const valor = texto.trim();
  const partes = /^(\d{1,2}):(\d{2})$/.exec(valor)
    ?? /^(\d{1,2})(\d{2})$/.exec(valor);
  if (!partes) return null;
  const hora = Number(partes[1]);
  const minuto = Number(partes[2]);
  if (hora > 23 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/**
 * Período mais longo aceito quando a saída cai no dia seguinte. O 2º turno sai de
 * madrugada (17:00 → 00:45 = 7h45); acima disso quase sempre é entrada e saída
 * trocadas (19:00 → 17:00 viraria 22h).
 */
export const MAX_HORAS_VIRADA_ASE = 12;

const minutosDoDia = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

/** Saída menor que a entrada: o período atravessa a meia-noite e termina no dia seguinte. */
export function viraDiaAse(entrada: string, saida: string): boolean {
  const inicio = normalizarHoraAse(entrada);
  const fim = normalizarHoraAse(saida);
  return Boolean(inicio && fim && fim < inicio);
}

/**
 * Rascunhos podem ter campos vazios. A data da ASE é a da entrada; saída menor que a
 * entrada é no dia seguinte (2º turno), até {@link MAX_HORAS_VIRADA_ASE} horas.
 */
export function validarPeriodoAse(entrada: string, saida: string): string | null {
  const inicio = normalizarHoraAse(entrada);
  const fim = normalizarHoraAse(saida);
  if ((entrada && !inicio) || (saida && !fim)) return 'Informe horários válidos de 00:00 a 23:59.';
  if (inicio && fim && fim < inicio) {
    const minutos = minutosDoDia(fim) + 24 * 60 - minutosDoDia(inicio);
    if (minutos > MAX_HORAS_VIRADA_ASE * 60) {
      return `Saída no dia seguinte deixaria o período com mais de ${MAX_HORAS_VIRADA_ASE}h. Confira se entrada e saída não estão trocadas.`;
    }
  }
  return null;
}

/**
 * "17:00 - 00:45 (+1 dia)": deixa explícito no e-mail/PDF que a saída é no dia seguinte.
 * Nas colunas estreitas do PDF use a marca curta " (+1)".
 */
export function formatarPeriodoAse(
  entrada: string | null | undefined,
  saida: string | null | undefined,
  separador = ' - ',
  marca = ' (+1 dia)',
): string {
  if (!entrada || !saida) return '';
  return `${entrada}${separador}${saida}${viraDiaAse(entrada, saida) ? marca : ''}`;
}

/** DD/MM do dia seguinte à data ISO da ASE, sem `new Date` em UTC (evita voltar um dia em UTC-3). */
export function diaSeguinteAse(dataISO: string | null | undefined): string | null {
  if (!dataISO || !/^\d{4}-\d{2}-\d{2}/.test(dataISO)) return null;
  const d = new Date(Number(dataISO.slice(0, 4)), Number(dataISO.slice(5, 7)) - 1, Number(dataISO.slice(8, 10)) + 1);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

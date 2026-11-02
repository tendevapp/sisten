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

/** Rascunhos podem ter campos vazios; períodos preenchidos são do mesmo dia. */
export function validarPeriodoAse(entrada: string, saida: string): string | null {
  const inicio = normalizarHoraAse(entrada);
  const fim = normalizarHoraAse(saida);
  if ((entrada && !inicio) || (saida && !fim)) return 'Informe horários válidos de 00:00 a 23:59.';
  if (inicio && fim && inicio > fim) return 'A entrada não pode ser posterior à saída.';
  return null;
}

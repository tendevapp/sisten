/**
 * Documento do motorista na Chegada de Transporte: CNH ou CPF.
 *
 * O número vai também para o teste de alcoolemia quando o vigilante marca
 * "Fará teste de bafômetro?" — lá fica num campo só (`documento`), então o
 * tipo segue na frente do número ("CNH 01234567890", "CPF 123.456.789-00").
 */
import { cpfValido, formatarCpf } from './cnpjLookup';

export type TipoDocMotorista = 'CNH' | 'CPF';

export const TIPOS_DOC_MOTORISTA: TipoDocMotorista[] = ['CNH', 'CPF'];

const digitos = (v: string) => (v || '').replace(/\D/g, '');

/** Máscara conforme digita: CPF 000.000.000-00; CNH só os 11 dígitos do registro. */
export function formatarDocMotorista(tipo: TipoDocMotorista, valor: string): string {
  return tipo === 'CPF' ? formatarCpf(valor) : digitos(valor).slice(0, 11);
}

/** Mensagem de erro do documento, ou null quando está bom (vazio também é bom: o campo é opcional). */
export function erroDocMotorista(tipo: TipoDocMotorista, valor: string): string | null {
  const d = digitos(valor);
  if (!d) return null;
  if (tipo === 'CPF') return cpfValido(d) ? null : 'CPF do motorista inválido — confira os números.';
  return d.length === 11 ? null : 'A CNH tem 11 números (nº do registro).';
}

/** Texto para o campo `documento` do teste de alcoolemia. Null sem número. */
export function documentoParaTeste(tipo: TipoDocMotorista | null | undefined, valor: string | null | undefined): string | null {
  const v = (valor || '').trim();
  if (!digitos(v)) return null;
  return tipo ? `${tipo} ${v}` : v;
}

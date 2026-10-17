/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura da "Pos.dpst." da ZL0024 no padrão DEPÓSITO.BLOCO.ANDAR.APARTAMENTO
 * (procedimento 5.5 — Lógica de Armazenagem).
 *
 * Na ZL0024 o depósito vem como 1DD (101 = 0001, 104 = 0004) e o resto como
 * BBAAPP: bloco, andar e apartamento com dois dígitos; apartamento 00 = sem
 * apartamento e andar 00 = chão do bloco. Onde isso fica no galpão é decisão
 * do layout (`gembaLayout.ts`), não daqui.
 */

export type MotivoFora = 'externo' | 'virtual' | 'desconhecido';

export type Endereco =
  /** Posição endereçada numa estante. */
  | { tipo: 'prateleira'; deposito: string; bloco: number; andar: number; apartamento: number | null; bruto: string }
  /** Área com nome (ex.: Material de Apoio Manutenção) ou estante inteira. */
  | { tipo: 'zona'; zona: string; bruto: string }
  /** Sabe-se o depósito, não o lugar exato. */
  | { tipo: 'deposito'; deposito: string; bruto: string }
  /** Fora do galpão, depósito virtual ou texto que não se encaixa no padrão. */
  | { tipo: 'fora'; motivo: MotivoFora; bruto: string };

/**
 * Posições gravadas por nome em vez de número. `102.ANEXO` fica no Material de
 * Apoio Manutenção da parede esquerda (confirmado no galpão); CABOS ainda é
 * provisório (Rua 04 inteira) até a calibração.
 */
type SemBruto<T> = T extends unknown ? Omit<T, 'bruto'> : never;

const POSICOES_COM_NOME: Record<string, SemBruto<Endereco>> = {
  '102.ANEXO': { tipo: 'zona', zona: 'apoio_manutencao' },
  '104.CABOS': { tipo: 'zona', zona: 'rua_04' },
  'AREA RECEB': { tipo: 'zona', zona: 'recebimento' },
  'BAIA EXTER': { tipo: 'fora', motivo: 'externo' },
  DEPVIRTUAL: { tipo: 'fora', motivo: 'virtual' },
};

/** Prefixo `1DD` → código de depósito `00DD`. */
function depositoDoPrefixo(prefixo: string): string | null {
  const m = /^1(\d\d)$/.exec(prefixo);
  return m && m[1] !== '00' ? `00${m[1]}` : null;
}

/** Lê uma posição da ZL0024 ou do cadastro. Vazio → `null`. */
export function interpretarPosicao(bruto: string | null | undefined): Endereco | null {
  const texto = String(bruto ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!texto) return null;

  const comNome = POSICOES_COM_NOME[texto];
  if (comNome) return { ...comNome, bruto: texto } as Endereco;

  // Com ponto, o sufixo pode ter perdido os zeros à direita no Excel (101.040100 → 101.0401).
  const numerico = /^(\d{3})\.(\d{1,6})$/.exec(texto) ?? /^(\d{3})(\d{6})$/.exec(texto);
  if (numerico) {
    const deposito = depositoDoPrefixo(numerico[1]);
    if (!deposito) return { tipo: 'fora', motivo: numerico[1] === '200' ? 'externo' : 'desconhecido', bruto: texto };
    const digitos = numerico[2].padEnd(6, '0');
    const apartamento = Number(digitos.slice(4, 6));
    return {
      tipo: 'prateleira',
      deposito,
      bloco: Number(digitos.slice(0, 2)),
      andar: Number(digitos.slice(2, 4)),
      apartamento: apartamento > 0 ? apartamento : null,
      bruto: texto,
    };
  }

  // Prefixo de depósito com nome livre (101.ARAMES): ao menos o depósito se sabe.
  const prefixo = /^(\d{3})\./.exec(texto)?.[1];
  if (prefixo === '200') return { tipo: 'fora', motivo: 'externo', bruto: texto };
  const deposito = prefixo ? depositoDoPrefixo(prefixo) : null;
  if (deposito) return { tipo: 'deposito', deposito, bruto: texto };

  return { tipo: 'fora', motivo: 'desconhecido', bruto: texto };
}

/** Quebra o "a, b" que `posicaoDoMaterial` devolve; repetidas e vazias saem. */
export function separarPosicoes(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const parte of String(texto ?? '').split(/[,;]/)) {
    const p = parte.trim().toUpperCase();
    if (p) vistas.add(p);
  }
  return [...vistas];
}

/** Dois dígitos, como o endereço vem impresso. */
export function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

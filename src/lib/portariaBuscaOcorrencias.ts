/**
 * Busca no conteúdo dos lançamentos do Relatório de Ocorrências (FRM.SGP-0010).
 *
 * Roda no aparelho, sobre os livros já carregados — funciona sem rede.
 * - ignora maiúsculas e acentos ("joao" acha "JOÃO");
 * - várias palavras: o lançamento precisa ter todas, em qualquer ordem;
 * - termo só de dígitos também casa ignorando pontuação ("02777852430" acha
 *   o CPF "027.778.524-30", "rpn3c38" acha "RPN-3C38" pela parte de letras).
 */
import type { PortRelatorioOcorrencia } from '../types';

type OcorrenciaBuscavel = Pick<PortRelatorioOcorrencia, 'descricao' | 'vigilante'> &
  Partial<Pick<PortRelatorioOcorrencia,
    'local_setor' | 'vigilante_saida' | 'empresa' | 'nome_pessoa' | 'documento_cpf' | 'documento_cnh' |
    'placa' | 'autorizado_por' | 'motivo_observacao' | 'veiculo_leve_modelo' | 'pessoas'>>;

/** Minúsculas e sem acento, caractere a caractere. */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Só letras e dígitos — para casar CPF, placa e telefone com ou sem pontuação. */
const compacto = (texto: string) => normalizarBusca(texto).replace(/[^a-z0-9]/g, '');

/** Palavras do termo, já normalizadas. */
export function palavrasBusca(termo: string): string[] {
  return normalizarBusca(termo).split(/\s+/).filter(Boolean);
}

/** Todo o texto pesquisável do lançamento (descrição + campos estruturados, quando vierem). */
export function textoPesquisavelOcorrencia(oc: OcorrenciaBuscavel): string {
  const pessoas = (oc.pessoas ?? []).flatMap((p) => [p.nome, p.cpf, p.cnh, p.funcao]);
  return [
    oc.descricao, oc.vigilante, oc.vigilante_saida, oc.local_setor, oc.empresa, oc.nome_pessoa,
    oc.documento_cpf, oc.documento_cnh, oc.placa, oc.autorizado_por, oc.motivo_observacao,
    oc.veiculo_leve_modelo, ...pessoas,
  ].filter(Boolean).join(' \n ');
}

/** O lançamento tem todas as palavras do termo? Termo vazio casa com tudo. */
export function ocorrenciaCombina(oc: OcorrenciaBuscavel, termo: string): boolean {
  const palavras = palavrasBusca(termo);
  if (palavras.length === 0) return true;
  const texto = textoPesquisavelOcorrencia(oc);
  const normal = normalizarBusca(texto);
  const semPontuacao = compacto(texto);
  return palavras.every((p) => {
    if (normal.includes(p)) return true;
    const pc = compacto(p);
    return pc.length >= 3 && semPontuacao.includes(pc);
  });
}

export interface TrechoBusca {
  texto: string;
  achado: boolean;
}

/**
 * Corta o texto em trechos marcando onde cada palavra do termo aparece
 * (sem acento/maiúscula), para destacar na tela. Preserva o texto original.
 */
export function trechosDestacados(texto: string, termo: string): TrechoBusca[] {
  const palavras = palavrasBusca(termo);
  if (!texto || palavras.length === 0) return [{ texto, achado: false }];

  // Normaliza caractere a caractere guardando de qual posição original veio cada um.
  let normal = '';
  const origem: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const n = normalizarBusca(texto[i]);
    for (let k = 0; k < n.length; k++) { normal += n[k]; origem.push(i); }
  }

  const marcado = new Array<boolean>(texto.length).fill(false);
  for (const p of palavras) {
    let de = normal.indexOf(p);
    while (de !== -1) {
      const ate = de + p.length - 1;
      for (let i = origem[de]; i <= origem[ate]; i++) marcado[i] = true;
      de = normal.indexOf(p, de + p.length);
    }
  }

  const trechos: TrechoBusca[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.achado === marcado[i]) ultimo.texto += texto[i];
    else trechos.push({ texto: texto[i], achado: marcado[i] });
  }
  return trechos;
}

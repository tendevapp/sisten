/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Leitura da planilha de colaboradores do RH (`rh_pessoas`).
 *
 * A planilha oficial traz a estrutura organizacional inteira:
 *
 *   MATRÍCULA · COLABORADOR · CHAVE DO NOME · MACROÁREA · ÁREA · SUBSETOR ·
 *   CARGO · LIDERANÇA · TURNO · SITUAÇÃO
 *
 * Só MATRÍCULA e COLABORADOR são obrigatórios — o resto entra quando a coluna
 * existe. Cada campo aceita mais de um cabeçalho porque a planilha muda de
 * nome conforme quem exporta ("REGISTRO"/"MATRÍCULA", "NOME DO EMPREGADO"/
 * "COLABORADOR"), e uma carga não pode falhar por causa disso.
 *
 * Fica separado da tela: é lógica pura, testável sem montar o AdminPanel.
 */

export interface PessoaImportada {
  registro: string;
  nome: string;
  chave_nome?: string;
  macroarea?: string;
  area?: string;
  subsetor?: string;
  cargo?: string;
  lideranca?: string;
  turno?: string;
  situacao?: string;
}

/** Cabeçalho sem acento, minúsculo e sem separadores: "ÁREA " → "area". */
export function normalizarCabecalho(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cabeçalhos aceitos por campo, já normalizados. O primeiro que aparecer na
 * planilha vence.
 */
const ALIASES: Record<keyof PessoaImportada, string[]> = {
  registro: ['matricula', 'registro', 'matriculacolaborador', 'chapa'],
  nome: ['colaborador', 'nomedoempregado', 'nome', 'funcionario', 'empregado', 'nomecolaborador'],
  chave_nome: ['chavedonome', 'chavenome', 'chave'],
  macroarea: ['macroarea', 'macro'],
  area: ['area', 'areasetor'],
  subsetor: ['subsetor', 'subarea'],
  cargo: ['cargo', 'descricaodocargo', 'descricaocargo', 'funcao'],
  lideranca: ['lideranca', 'lider', 'liderancaimediata', 'gestor'],
  turno: ['turno', 'turnotrabalho'],
  situacao: ['situacao', 'status', 'situacaocadastral'],
};

/**
 * Situações que significam vínculo encerrado. O resto — inclusive AFASTADO,
 * FÉRIAS e LICENÇA — continua ativo: a pessoa ainda é colaboradora e precisa
 * aparecer nas buscas dos formulários.
 */
const SITUACOES_INATIVAS = ['demit', 'deslig', 'rescis', 'inativ', 'encerr'];

/** Traduz a coluna SITUAÇÃO para o booleano `ativo` da tabela. */
export function situacaoParaAtivo(situacao?: string | null): boolean {
  const texto = normalizarCabecalho(situacao);
  if (!texto) return true;
  return !SITUACOES_INATIVAS.some(marca => texto.startsWith(marca) || texto.includes(marca));
}

const limpar = (valor: unknown): string => String(valor ?? '').trim();

/**
 * Converte a matriz crua da planilha (linha 0 = cabeçalho) nas linhas prontas
 * para o upsert.
 *
 * @throws quando a planilha está vazia ou não tem matrícula e nome.
 */
export function mapearPlanilhaPessoas(linhas: unknown[][]): PessoaImportada[] {
  if (!linhas || linhas.length < 2) {
    throw new Error('Planilha vazia ou sem linhas de dados.');
  }

  const cabecalhos = (linhas[0] || []).map(normalizarCabecalho);
  const indiceDe = (campo: keyof PessoaImportada): number => {
    for (const alias of ALIASES[campo]) {
      const idx = cabecalhos.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const indices = Object.fromEntries(
    (Object.keys(ALIASES) as (keyof PessoaImportada)[]).map(campo => [campo, indiceDe(campo)]),
  ) as Record<keyof PessoaImportada, number>;

  if (indices.registro === -1 || indices.nome === -1) {
    throw new Error(
      'Colunas obrigatórias não encontradas. Esperado ao menos "MATRÍCULA" e "COLABORADOR" — as demais (CHAVE DO NOME, MACROÁREA, ÁREA, SUBSETOR, CARGO, LIDERANÇA, TURNO, SITUAÇÃO) são opcionais.',
    );
  }

  const itens: PessoaImportada[] = [];
  for (const linha of linhas.slice(1)) {
    const registro = limpar(linha?.[indices.registro]);
    const nome = limpar(linha?.[indices.nome]);
    if (!registro || !nome) continue;

    const item: PessoaImportada = { registro, nome };
    for (const campo of Object.keys(ALIASES) as (keyof PessoaImportada)[]) {
      if (campo === 'registro' || campo === 'nome') continue;
      const idx = indices[campo];
      if (idx === -1) continue;
      const valor = limpar(linha?.[idx]);
      if (valor) item[campo] = valor;
    }
    itens.push(item);
  }

  if (itens.length === 0) {
    throw new Error('Nenhuma linha válida encontrada na planilha.');
  }
  return itens;
}

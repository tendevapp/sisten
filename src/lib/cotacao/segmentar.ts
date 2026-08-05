/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Separa o documento markdown unificado (colado pelo comprador, com várias
 * propostas de fornecedores concatenadas) em um bloco por arquivo — sem
 * gastar nenhum token de IA nisso. O formato é o de um conversor de PDF
 * típico: um índice, e blocos `## N. <nome-de-arquivo>` com subseções
 * `### Página N`.
 *
 * O nome do arquivo costuma ser um UUID gerado pelo storage e não serve para
 * identificar o fornecedor — isso sai do conteúdo (CNPJ/razão social no
 * cabeçalho), na Edge Function. Aqui só cortamos o documento nos pontos
 * certos para permitir uma chamada de IA por fornecedor em paralelo, em vez
 * de uma chamada única processando tudo.
 *
 * Também aceita markdown colado sem esses cabeçalhos (`## N. arquivo`): sem
 * nenhuma ocorrência do padrão, trata o texto inteiro como uma proposta só.
 */

export interface BlocoSegmentado {
  /** Número do arquivo no documento unificado (1, 2, 3...), ou 1 quando não segmentado. */
  numero: number;
  /** Nome do arquivo original (geralmente um UUID) — null quando não há cabeçalho. */
  nomeArquivo: string | null;
  /** Conteúdo do bloco, já sem os separadores `---` e âncoras `<a id="arquivo-N">`. */
  conteudo: string;
}

const CABECALHO_ARQUIVO_RE = /^##\s+(\d+)\.\s+(.+?)\s*$/gm;
const LINHA_SEPARADORA_RE = /^---\s*$/;
const LINHA_ANCORA_RE = /^<a\s+id="arquivo-\d+">\s*<\/a>\s*$/;

export function segmentarDocumentoUnificado(markdownBruto: string): BlocoSegmentado[] {
  const texto = markdownBruto.replace(/\r\n/g, '\n');

  const cabecalhos: Array<{ index: number; fimLinha: number; numero: number; nomeArquivo: string }> = [];
  const re = new RegExp(CABECALHO_ARQUIVO_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    cabecalhos.push({
      index: m.index,
      fimLinha: m.index + m[0].length,
      numero: Number(m[1]),
      nomeArquivo: m[2].trim(),
    });
  }

  if (cabecalhos.length === 0) {
    const conteudo = limparBloco(texto);
    return conteudo ? [{ numero: 1, nomeArquivo: null, conteudo }] : [];
  }

  const blocos: BlocoSegmentado[] = [];
  for (let i = 0; i < cabecalhos.length; i++) {
    const atual = cabecalhos[i];
    const proximo = cabecalhos[i + 1];
    const fim = proximo ? proximo.index : texto.length;
    const bruto = texto.slice(atual.fimLinha, fim);
    blocos.push({
      numero: atual.numero,
      nomeArquivo: atual.nomeArquivo,
      conteudo: limparBloco(bruto),
    });
  }
  return blocos;
}

/** Remove separadores e âncoras decorativas que sobram na borda entre blocos. */
function limparBloco(bloco: string): string {
  return bloco
    .split('\n')
    .filter(linha => !LINHA_SEPARADORA_RE.test(linha) && !LINHA_ANCORA_RE.test(linha))
    .join('\n')
    .trim();
}

/**
 * Divide um bloco de proposta grande em pedaços menores antes da extração
 * por IA. Medido empiricamente contra o OpenRouter (deepseek-v4-flash) com o
 * schema fiscal completo, direto na Edge Function de produção: 6 itens
 * (~650 caracteres) extraem em ~1,8s; 8 itens (~1.030 caracteres) em ~0,5s;
 * **15 itens — uma única página real de um documento (~2.180 caracteres) —
 * excedeu 140s sem terminar**, e 26 itens excedeu os 150s de teto rígido da
 * própria plataforma (Edge Functions do Supabase). O tempo de geração não
 * escala linearmente com o número de itens quando o schema por item é
 * grande — há uma barreira abrupta, não uma degradação gradual. Por isso o
 * limite abaixo fica com folga bem abaixo do maior tamanho confirmado
 * rápido, não perto dele.
 *
 * A divisão usa as quebras de página do próprio documento (`### Página N`)
 * como unidade primária — não corta um item ao meio na esmagadora maioria
 * dos casos, e cada página de um PDF real repete o cabeçalho do fornecedor
 * (nome, CNPJ, às vezes condição de pagamento), então nenhum pedaço fica
 * "órfão" de contexto. Como uma página inteira já se mostrou grande demais
 * na prática, o fallback por linha entra em jogo com frequência — nesse
 * caso um item pode legitimamente ser cortado ao meio; é um trade-off
 * aceito (perder um item é recuperável na revisão manual do passo 3; travar
 * a extração inteira em timeout não é).
 */
const MAX_CARACTERES_POR_CHAMADA = 1200;
const CABECALHO_PAGINA_RE = /(?=^### Página \d+\s*$)/m;

export function dividirBlocoParaExtracao(conteudo: string, maxCaracteres = MAX_CARACTERES_POR_CHAMADA): string[] {
  if (conteudo.length <= maxCaracteres) return [conteudo];

  let paginas = conteudo.split(CABECALHO_PAGINA_RE).filter(p => p.trim());

  // Sem nenhum marcador de página reconhecível não há unidade segura para
  // dividir sem risco de cortar um item ao meio — manda inteiro.
  const temMarcadorPagina = paginas.some(p => p.trimStart().startsWith('### Página'));
  if (!temMarcadorPagina) return [conteudo];

  // Preâmbulo antes da 1ª página (ex.: metadados do conversor, "`PDF` · ...
  // conteúdo bruto") não é uma página de verdade — funde no primeiro pedaço
  // real em vez de virar uma chamada própria sem nenhum dado de fornecedor.
  if (paginas.length > 1 && !paginas[0].trimStart().startsWith('### Página')) {
    paginas = [`${paginas[0]}\n\n${paginas[1]}`, ...paginas.slice(2)];
  }

  const lotes: string[] = [];
  for (const pagina of paginas) {
    if (pagina.length <= maxCaracteres) lotes.push(pagina);
    else lotes.push(...dividirPorLinhas(pagina, maxCaracteres));
  }
  return lotes;
}

function dividirPorLinhas(texto: string, maxCaracteres: number): string[] {
  const linhas = texto.split('\n');
  const partes: string[] = [];
  let atual: string[] = [];
  let tamanho = 0;
  for (const linha of linhas) {
    if (tamanho + linha.length > maxCaracteres && atual.length > 0) {
      partes.push(atual.join('\n'));
      atual = [];
      tamanho = 0;
    }
    atual.push(linha);
    tamanho += linha.length + 1;
  }
  if (atual.length > 0) partes.push(atual.join('\n'));
  return partes;
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formatação pt-BR — fonte única.
 *
 * Antes `formatBRL`, `formatDateBR` e `formatDateTimeBR` existiam em duas
 * cópias (lib/almoxarifado.ts e lib/rastreio.ts) que já divergiam: a de
 * rastreio usava `toLocaleDateString('pt-BR')` sem opções, a de almoxarifado
 * forçava 2 dígitos. Aqui há uma implementação só.
 *
 * Os formatadores do Intl são criados uma vez no módulo, não por chamada:
 * construir um `Intl.NumberFormat` é caro e essas funções rodam por célula em
 * tabelas de milhares de linhas e por tick de eixo em cada render de gráfico.
 */

export const EMPTY = '—';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlSemCentavos = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const quantidade = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const percentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});
const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' });

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Reconhece string de data pura (sem hora), formato das colunas DATE do Postgres. */
const DATA_SEM_HORA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aceita Date, ISO string ou timestamp. Retorna null quando não dá para ler.
 * Exportada para reuso por quem precisa só do parse (ex.: `lib/rastreio.ts`),
 * sem duplicar a regra de fuso horário abaixo.
 */
export function toDate(d?: string | number | Date | null): Date | null {
  if (d === undefined || d === null || d === '') return null;
  // Uma string "sem hora" (ex.: coluna DATE do Postgres) não pode ir direto
  // para `new Date(string)`: o construtor a lê como meia-noite UTC, e em
  // fusos negativos (Brasil) isso vira o dia anterior na formatação local.
  // Monta a data no fuso local para o dia não recuar.
  if (typeof d === 'string' && DATA_SEM_HORA.test(d)) {
    const [ano, mes, dia] = d.split('-').map(Number);
    const local = new Date(ano, mes - 1, dia);
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const parsed = d instanceof Date ? d : new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* Dinheiro --------------------------------------------------------------- */

export const formatBRL = (v?: number | null): string => (isNum(v) ? brl.format(v) : EMPTY);

/**
 * Versão curta para eixos e rótulos, onde o valor completo não cabe.
 * Acima de 1 mi usa "M", acima de mil usa "mil" — o eixo fica legível sem
 * girar rótulo.
 */
export function formatBRLCompacto(v?: number | null): string {
  if (!isNum(v)) return EMPTY;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${decimal1.format(v / 1_000_000)} M`;
  if (abs >= 1_000) return `R$ ${inteiro.format(v / 1_000)} mil`;
  return brlSemCentavos.format(v);
}

/* Números ---------------------------------------------------------------- */

export const formatInt = (v?: number | null): string => (isNum(v) ? inteiro.format(v) : EMPTY);

export const formatQtd = (v?: number | null): string => (isNum(v) ? quantidade.format(v) : EMPTY);

/** Recebe o número já em pontos percentuais (42.5 → "42,5%"). */
export const formatPct = (v?: number | null): string => (isNum(v) ? `${percentual.format(v)}%` : EMPTY);

/** Versão inteira, para rótulos dentro de barra onde não cabe a casa decimal. */
export const formatPctInt = (v?: number | null): string => (isNum(v) ? `${inteiro.format(v)}%` : EMPTY);

/* Datas ------------------------------------------------------------------ */

export function formatDateBR(d?: string | number | Date | null): string {
  const parsed = toDate(d);
  if (parsed) return data.format(parsed);
  return d ? String(d) : EMPTY;
}

export function formatDateTimeBR(d?: string | number | Date | null): string {
  const parsed = toDate(d);
  if (parsed) return dataHora.format(parsed);
  return d ? String(d) : EMPTY;
}

/** Rótulo curto de série temporal em eixo de gráfico ("jan/26"). */
export function formatMesAno(d?: string | number | Date | null): string {
  const parsed = toDate(d);
  return parsed ? mesAno.format(parsed).replace('.', '') : EMPTY;
}

export function yearOf(d?: string | number | Date | null): string {
  const parsed = toDate(d);
  return parsed ? String(parsed.getFullYear()) : '';
}

/* Tamanho de arquivo ------------------------------------------------------ */

/**
 * Tamanho de anexo em unidade legível ("180 KB", "2,3 MB"). Base 1024, que é o
 * que o usuário vê nas propriedades do arquivo no Windows.
 */
export function formatFileSize(bytes?: number | null): string {
  if (!isNum(bytes) || bytes < 0) return EMPTY;
  if (bytes < 1024) return `${inteiro.format(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${inteiro.format(kb)} KB`;
  return `${decimal1.format(kb / 1024)} MB`;
}

/* Duração e custo de IA — acompanhamento de execução (Conversor Markdown) - */

/**
 * Duração legível para acompanhar execução em tempo real ("340ms", "12,3s",
 * "1m 05s"). Casas decimais só abaixo de 1 minuto — acima disso, segundos
 * exatos já bastam e ficam mais fáceis de ler num relógio que tica.
 */
export function formatDuration(ms?: number | null): string {
  if (!isNum(ms) || ms < 0) return EMPTY;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${decimal1.format(ms / 1000)}s`;
  const min = Math.floor(ms / 60_000);
  const seg = Math.round((ms % 60_000) / 1000);
  return `${min}m ${String(seg).padStart(2, '0')}s`;
}

export const TAXA_DOLAR_REAL = 6;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const brlCusto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** Converte valor de USD para BRL multiplicando pela taxa fixa de 6. */
export function converterUsdParaBrl(v?: number | null): number | null {
  if (!isNum(v)) return null;
  return v * TAXA_DOLAR_REAL;
}

/** Custo de chamada de IA em USD ("US$0,0032"). `null`/`undefined` vira "—" — modelo fora da tabela de preço, nunca mostra um valor inventado. */
export function formatUsd(v?: number | null): string {
  if (!isNum(v)) return EMPTY;
  return usd.format(v);
}

/** Formata custo de chamada de IA em BRL ("R$ 0,0192"), preservando ate 4 casas decimais para micro-custos. */
export function formatCustoBrl(v?: number | null): string {
  if (!isNum(v)) return EMPTY;
  return brlCusto.format(v);
}

/** Converte custo de USD para BRL (multiplicando por 6) e formata como moeda brasileira ("R$ 0,0192"). */
export function formatUsdParaBrl(v?: number | null): string {
  if (!isNum(v)) return EMPTY;
  return brlCusto.format(v * TAXA_DOLAR_REAL);
}


const PROVEDOR_LABEL: Record<string, string> = {
  gemini: 'Gemini', openai: 'OpenAI', openrouter: 'OpenRouter',
};

/** "gemini:gemini-2.0-flash" (formato `provedor:modelo` usado pelas Edge Functions de IA) → "Gemini · gemini-2.0-flash", legível para acompanhamento em tela. */
export function formatModelo(modelo?: string | null): string {
  if (!modelo) return EMPTY;
  const [provedor, ...resto] = modelo.split(':');
  const nomeModelo = resto.join(':');
  const label = PROVEDOR_LABEL[provedor] ?? provedor;
  return nomeModelo ? `${label} · ${nomeModelo}` : label;
}

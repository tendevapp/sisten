/**
 * Os formulários trazem os textos bilíngues como "Português / English". Separa na
 * primeira barra cercada de espaços; a tela e o PDF mostram o inglês sem
 * negrito e em itálico. Texto repetido dos dois lados ("MOBILE STEPS / MOBILE
 * STEPS") vira um só.
 */
export function separarBilingue(texto: string | null | undefined): { pt: string; en: string } {
  const valor = (texto || '').trim();
  const indice = valor.indexOf(' / ');
  if (indice < 0) return { pt: valor, en: '' };
  const pt = valor.slice(0, indice).trim();
  const en = valor.slice(indice + 3).trim();
  return { pt, en: en.toLowerCase() === pt.toLowerCase() ? '' : en };
}

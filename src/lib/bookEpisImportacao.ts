import * as XLSX from 'xlsx';

export interface FotoBookEpi {
  blob: Blob;
  mimeType: string;
  nome: string;
}

export interface LinhaBookEpi {
  categoria: string;
  descricaoEpi: string;
  indicacao: string;
  ca: string;
  validade: string;
  fabricante: string;
  tamanhoCodigoSap: string;
  descricaoSap: string;
  foto: FotoBookEpi | null;
}

export interface VarianteBookEpi extends LinhaBookEpi {
  grupoEpi: string;
  tamanho: string | null;
  codigoSap: string | null;
}

const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const texto = (valor: unknown): string => String(valor ?? '').replace(/\r/g, '').trim();
const linhas = (valor: string): string[] => valor.split('\n').map(texto).filter(Boolean);

function valorPorVariante(valor: string, indice: number, total: number): string {
  const partes = linhas(valor);
  return partes.length === total ? partes[indice] : texto(valor);
}

function parseTamanhoCodigo(valor: string): { tamanho: string | null; codigoSap: string | null } {
  const codigo = valor.match(/(?:^|\s-\s*)(\d{6,})\s*$/)?.[1] ?? null;
  if (!codigo) return { tamanho: texto(valor) || null, codigoSap: null };

  const antesCodigo = texto(valor.slice(0, valor.lastIndexOf(codigo)).replace(/[\s-]+$/g, ''));
  return { tamanho: antesCodigo || null, codigoSap: codigo };
}

/**
 * Expande o agrupamento visual da planilha: cada linha SAP/tamanho vira um
 * registro próprio, mas todas preservam a mesma `grupoEpi` para a tela agrupar.
 */
export function expandirVariantesEpi(linha: LinhaBookEpi): VarianteBookEpi[] {
  const tamanhosCodigos = linhas(linha.tamanhoCodigoSap);
  const descricoesSap = linhas(linha.descricaoSap);
  const total = Math.max(tamanhosCodigos.length, descricoesSap.length, 1);

  return Array.from({ length: total }, (_, indice) => {
    const tamanhoCodigoSap = tamanhosCodigos[indice] ?? tamanhosCodigos[0] ?? '';
    const descricaoSap = descricoesSap[indice] ?? descricoesSap[0] ?? '';
    const { tamanho, codigoSap } = parseTamanhoCodigo(tamanhoCodigoSap);

    return {
      ...linha,
      ca: valorPorVariante(linha.ca, indice, total),
      validade: valorPorVariante(linha.validade, indice, total),
      tamanhoCodigoSap,
      descricaoSap,
      grupoEpi: texto(linha.descricaoEpi),
      tamanho,
      codigoSap,
    };
  });
}

/** Remove repetições físicas da planilha sem unir variantes SAP/CA distintas. */
export function deduplicarVariantesBookEpis(variantes: VarianteBookEpi[]): VarianteBookEpi[] {
  const unicas = new Map<string, VarianteBookEpi>();
  for (const variante of variantes) {
    const chave = `${texto(variante.codigoSap) || 'SEM_SAP'}|${texto(variante.ca).toLocaleLowerCase('pt-BR')}`;
    const anterior = unicas.get(chave);
    if (!anterior || (!anterior.foto && variante.foto)) unicas.set(chave, variante);
  }
  return [...unicas.values()];
}

type ArquivoCfb = { name: string; content?: Uint8Array | ArrayBuffer | number[] };
type Cfb = { FileIndex: ArquivoCfb[] };

function arquivoCfb(cfb: Cfb, nome: string): Uint8Array | null {
  const arquivo = cfb.FileIndex.find(item => item.name === nome);
  if (!arquivo?.content) return null;
  if (arquivo.content instanceof Uint8Array) return arquivo.content;
  if (arquivo.content instanceof ArrayBuffer) return new Uint8Array(arquivo.content);
  return new Uint8Array(arquivo.content);
}

function textoCfb(cfb: Cfb, nome: string): string {
  const conteudo = arquivoCfb(cfb, nome);
  return conteudo ? new TextDecoder().decode(conteudo) : '';
}

function fotosDaAba(cfb: Cfb, indiceAba: number): Map<number, FotoBookEpi> {
  // No Book original, Plan1 e Orientações não possuem imagens; as abas 3..13
  // se relacionam sequencialmente a drawing1..drawing11.
  const numeroDrawing = indiceAba - 1;
  if (numeroDrawing < 1) return new Map();

  const xml = textoCfb(cfb, `drawing${numeroDrawing}.xml`);
  const rels = textoCfb(cfb, `drawing${numeroDrawing}.xml.rels`);
  if (!xml || !rels) return new Map();

  const targets = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g)) {
    targets.set(rel[1], rel[2].split('/').pop() ?? '');
  }

  const fotos = new Map<number, FotoBookEpi>();
  const anchors = xml.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g);
  for (const anchor of anchors) {
    const linha = anchor[1].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>[\s\S]*?<\/xdr:from>/)?.[1];
    const relationId = anchor[1].match(/r:embed="([^"]+)"/)?.[1];
    const nomeArquivo = relationId ? targets.get(relationId) : undefined;
    if (!linha || !nomeArquivo) continue;

    const conteudo = arquivoCfb(cfb, nomeArquivo);
    const extensao = nomeArquivo.split('.').pop()?.toLowerCase() ?? '';
    const mimeType = MIME_POR_EXTENSAO[extensao];
    if (!conteudo || !mimeType) continue;

    fotos.set(Number(linha), {
      blob: new Blob([conteudo], { type: mimeType }),
      mimeType,
      nome: nomeArquivo,
    });
  }

  return fotos;
}

/** Lê todas as abas de EPI, conservando a foto ilustrativa associada à linha. */
export async function parseBookEpisWorkbook(buffer: ArrayBuffer): Promise<VarianteBookEpi[]> {
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  // O leitor CFB usado para extrair desenhos espera uma sequência indexável;
  // ArrayBuffer puro falha em alguns XLSX com imagens embutidas.
  const cfb = XLSX.CFB.read(new Uint8Array(buffer), { type: 'array' }) as unknown as Cfb;
  const resultado: VarianteBookEpi[] = [];

  workbook.SheetNames.forEach((nomeAba, indice) => {
    const sheet = workbook.Sheets[nomeAba];
    const dados = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    if (dados.length < 2) return;

    const fotos = fotosDaAba(cfb, indice);
    for (let indiceLinha = 1; indiceLinha < dados.length; indiceLinha += 1) {
      const valores = dados[indiceLinha].map(texto);
      if (!valores.some(Boolean)) continue;

      // As abas antigas possuem colunas descritivas adicionais antes de CA;
      // os cinco campos finais permanecem estáveis em todas elas.
      const fim = valores.length;
      if (fim < 7 || !valores[1]) continue;
      const ca = valores[fim - 5] ?? '';
      const validade = valores[fim - 4] ?? '';
      const fabricante = valores[fim - 3] ?? '';
      const tamanhoCodigoSap = valores[fim - 2] ?? '';
      const descricaoSap = valores[fim - 1] ?? '';
      const indicacao = valores.slice(2, fim - 5).filter(Boolean).join('\n');

      resultado.push(...expandirVariantesEpi({
        categoria: nomeAba,
        descricaoEpi: valores[1],
        indicacao,
        ca,
        validade,
        fabricante,
        tamanhoCodigoSap,
        descricaoSap,
        foto: fotos.get(indiceLinha) ?? null,
      }));
    }
  });

  return resultado;
}

/**
 * Carga operacional do Book de EPIs a partir do XLSX oficial.
 *
 * Executar primeiro com `--dry-run`; sem essa opção, sobe fotos comprimidas e
 * faz upsert das variantes pelo par código SAP + CA.
 */
import { File } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createClient } from '@supabase/supabase-js';

function instalarCanvasParaCompressao() {
  Object.assign(globalThis, {
    createImageBitmap: async (file: Blob) => {
      const imagem = await loadImage(Buffer.from(await file.arrayBuffer()));
      Object.assign(imagem, { close: () => undefined });
      return imagem;
    },
    document: {
      createElement: (tag: string) => tag === 'canvas' ? createCanvas(1, 1) : null,
    },
  });
}

function valorEnv(conteudo: string, chave: string): string | null {
  return conteudo.match(new RegExp(`^${chave}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') || null;
}

async function main() {
  instalarCanvasParaCompressao();

  const [ambiente, moduloImportacao, moduloCompressao] = await Promise.all([
    readFile('.env', 'utf8'),
    import('../src/lib/bookEpisImportacao'),
    import('../src/lib/imageCompression'),
  ]);
  const url = valorEnv(ambiente, 'VITE_SUPABASE_URL');
  const chaveServico = valorEnv(ambiente, 'VITE_SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !chaveServico) throw new Error('Variáveis de conexão segura do Supabase não foram encontradas.');

  const arquivo = process.argv.slice(2).find(argumento => !argumento.startsWith('--'))
    || 'C:/Users/andre.araujo/Downloads/EPI TEN REVISADO 2026.xlsx';
  const somenteValidar = process.argv.includes('--dry-run');
  const bytes = await readFile(arquivo);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const variantes = moduloImportacao.deduplicarVariantesBookEpis(await moduloImportacao.parseBookEpisWorkbook(buffer));
  if (!variantes.length) throw new Error('Nenhuma variante de EPI foi encontrada na planilha.');

  if (somenteValidar) {
    console.log(JSON.stringify({ variantes: variantes.length, fotos: new Set(variantes.flatMap(item => item.foto ? [item.foto] : [])).size }));
    return;
  }

  const supabase = createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });
  const fotos = new Map<object, Promise<{ path: string; nome: string; mimeType: string; tamanho: number }>>();
  const prefixo = `epis/importacao-${new Date().toISOString().slice(0, 10)}`;

  // Uma carga que falha antes do upsert pode deixar imagens órfãs. Só remove
  // esse lote técnico quando a tabela ainda está vazia, nunca em reimportação.
  const { count: itensExistentes, error: erroContagem } = await supabase
    .from('ssma_book_epis')
    .select('id', { count: 'exact', head: true });
  if (erroContagem) throw erroContagem;
  if (itensExistentes === 0) {
    const { data: orfaos, error: erroOrfaos } = await supabase.storage.from('ssma-book-epis').list(prefixo, { limit: 1000 });
    if (erroOrfaos) throw erroOrfaos;
    if (orfaos?.length) {
      const { error: erroRemocao } = await supabase.storage.from('ssma-book-epis').remove(orfaos.map(item => `${prefixo}/${item.name}`));
      if (erroRemocao) throw erroRemocao;
    }
  }

  const enviarFoto = (foto: NonNullable<(typeof variantes)[number]['foto']>) => {
    const existente = fotos.get(foto);
    if (existente) return existente;
    const envio = (async () => {
      const original = new File([foto.blob], foto.nome, { type: foto.mimeType });
      const comprimido = await moduloCompressao.comprimirImagemUpload(original);
      const mimeType = comprimido.type || foto.mimeType || 'image/jpeg';
      const extensao = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${prefixo}/${crypto.randomUUID()}.${extensao}`;
      const { error } = await supabase.storage.from('ssma-book-epis').upload(path, comprimido, { contentType: mimeType, upsert: false });
      if (error) throw error;
      return { path, nome: foto.nome, mimeType, tamanho: comprimido.size };
    })();
    fotos.set(foto, envio);
    return envio;
  };

  const payload = await Promise.all(variantes.map(async item => {
    const imagem = item.foto ? await enviarFoto(item.foto) : null;
    return {
      categoria: item.categoria,
      grupo_epi: item.grupoEpi,
      descricao_epi: item.descricaoEpi,
      indicacao: item.indicacao || null,
      ca: item.ca || '',
      validade: item.validade || null,
      fabricante: item.fabricante || null,
      tamanho: item.tamanho,
      codigo_sap: item.codigoSap,
      descricao_sap: item.descricaoSap || null,
      imagem_path: imagem?.path || null,
      imagem_nome: imagem?.nome || null,
      imagem_mime: imagem?.mimeType || null,
      imagem_tamanho: imagem?.tamanho || null,
      ativo: true,
    };
  }));

  const { error } = await supabase.from('ssma_book_epis').upsert(payload, { onConflict: 'chave_importacao' });
  if (error) throw error;
  console.log(JSON.stringify({ variantes: payload.length, fotos: fotos.size }));
}

main().catch(error => {
  const detalhe = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  console.error(
    error instanceof Error ? error.message : JSON.stringify({
      message: detalhe.message,
      code: detalhe.code,
      status: detalhe.status,
    })
  );
  process.exitCode = 1;
});

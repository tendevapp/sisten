import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  lerPlanilhaTramos,
  resumoImportacao,
  validarPlanilhaTramos,
} from '../src/lib/producaoTramosImportacao';

async function main() {
  const [arquivo, modo] = process.argv.slice(2);
  if (!arquivo || modo !== '--dry-run') {
    console.error('Uso: npx tsx scripts/importar-producao-tramos.ts <arquivo.xlsx> --dry-run');
    process.exitCode = 2;
    return;
  }

  const conteudo = await readFile(arquivo);
  const bytes = conteudo.buffer.slice(conteudo.byteOffset, conteudo.byteOffset + conteudo.byteLength);
  const resultado = lerPlanilhaTramos(bytes);
  const divergencias = validarPlanilhaTramos(resultado);

  console.log(`Preflight de ${basename(arquivo)}`);
  console.table([resumoImportacao(resultado, divergencias)]);
  for (const divergencia of divergencias) {
    const linha = divergencia.linhaOrigem ? `, linha ${divergencia.linhaOrigem}` : '';
    console.log(`${divergencia.bloqueante ? 'BLOQUEIO' : 'AVISO'}: ${divergencia.codigo}, sequencial ${divergencia.sequencial}${linha}`);
  }

  if (divergencias.some(divergencia => divergencia.bloqueante)) process.exitCode = 1;
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});

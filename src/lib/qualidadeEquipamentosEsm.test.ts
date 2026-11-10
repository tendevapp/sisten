import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

describe('Equipamentos — carregamento ESM no navegador', () => {
  it('carrega a página e o importador quando XLSX oferece apenas exports nomeados', async () => {
    // O otimizador do Vite pode servir a edição ESM sem `default`.
    // Reexportar a API real sem default reproduz esse contrato do navegador.
    const resultado = await build({
      absWorkingDir: fileURLToPath(new URL('../../', import.meta.url)),
      entryPoints: [
        'src/lib/qualidadeEquipamentos.ts',
        'src/components/qualidade/EquipamentosImportModal.tsx',
        'src/views/qualidade/QualidadeEquipamentosView.tsx',
      ],
      outdir: 'teste-esm-equipamentos',
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      packages: 'external',
      logLevel: 'silent',
      plugins: [{
        name: 'xlsx-sem-default',
        setup(builder) {
          builder.onResolve({ filter: /^xlsx\/xlsx\.mjs$/ }, args => ({ path: args.path, external: true }));
          builder.onResolve({ filter: /^xlsx$/ }, () => ({ path: 'xlsx', namespace: 'xlsx-sem-default' }));
          builder.onLoad({ filter: /.*/, namespace: 'xlsx-sem-default' }, () => ({
            contents: "export { read, writeFile, utils, SSF } from 'xlsx/xlsx.mjs';",
            loader: 'js',
          }));
        },
      }],
    });
    expect(resultado.outputFiles).toHaveLength(3);
  });
});

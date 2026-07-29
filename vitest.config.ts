/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Configuração de teste, separada da build.
 *
 * Os testes deste projeto cobrem lógica pura (normalização de termo, recorte
 * por papel, validação) e rodam em Node, sem DOM. Carregar os plugins de
 * React e Tailwind de `vite.config.ts` só somaria custo sem servir a nada.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

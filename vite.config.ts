import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Service worker do módulo Produção (chão de fábrica, rede intermitente):
      // faz precache do app shell para o SISTEN ABRIR mesmo sem sinal — o
      // outbox (src/lib/outbox.ts) já cobre a GRAVAÇÃO offline, mas sem SW o
      // app nem carrega se a aba for fechada sem rede.
      //
      // `manifest: false` — o SISTEN já publica seu próprio
      // public/manifest.webmanifest, referenciado no <head> do index.html;
      // deixar o plugin gerar o dele duplicaria a tag `<link rel="manifest">`.
      //
      // Navegação (o HTML) usa NetworkFirst, não o precache do shell: depois
      // de um deploy, o `ErrorBoundary` (CHUNK_RELOAD_GUARD_KEY) recarrega a
      // página UMA vez ao pegar um chunk antigo — se o reload caísse num
      // `index.html` cacheado (stale), o guard já gasto viraria tela de erro
      // em vez de resolver sozinho. NetworkFirst tenta a rede primeiro (pega
      // o HTML novo, que aponta pros chunks novos) e só cai no cache — a
      // aplicação usada offline — quando a rede falha de verdade. Só os
      // assets com hash (JS/CSS/imagens) vão de precache: nome novo a cada
      // build, sem risco de servir versão velha.
      VitePWA({
        registerType: 'autoUpdate',
        manifest: false,
        injectRegister: 'auto',
        workbox: {
          cleanupOutdatedCaches: true,
          // Só o essencial do app shell — código, estilo, ícones vetoriais e
          // fontes. Fotos/logos em PNG (ex.: logo-ten.png, ~2 MB) ficam de
          // fora do precache: carregam sob demanda pelo cache HTTP normal do
          // navegador, sem inflar a instalação do service worker.
          globPatterns: ['**/*.{js,css,svg,woff2,ico}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'sisten-shell',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 5 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@dnd-kit/core', '@dnd-kit/utilities', '@dnd-kit/accessibility'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/.agents/**', '**/.claude/**', '**/graphify-out/**'],
      },
    },
  };
});

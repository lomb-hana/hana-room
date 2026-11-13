import { defineConfig } from 'vite'

// Plain Vite build. The Cloudflare Worker / sign-in plugin from grokhouse is not used.
export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    outDir: 'dist',
    emptyOutDir: true,
  },
})

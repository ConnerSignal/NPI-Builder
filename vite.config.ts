import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'production-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src https: http://localhost:* http://127.0.0.1:* http://[::1]:*; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'none'",
      }, injectTo: 'head-prepend' }];
    },
  }],
  base: './', // Use relative paths so the built app works when loaded via file:// in Electron (packaged desktop app)
})

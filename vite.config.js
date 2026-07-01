import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Cloudflare Worker 地址（仅用于 EPG XML 代理，解决 CORS）
const PROXY_URL = 'https://niketv.helloajunjie.workers.dev'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    __PROXY_URL__: JSON.stringify(PROXY_URL),
  },
})

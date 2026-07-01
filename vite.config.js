import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Cloudflare Worker 代理地址（生产环境用于转换 HTTP 流为 HTTPS）
// 如果不需要代理，设为空字符串即可
// 注意：使用 __PROXY_URL__ 而非 import.meta.env，避免 Vite define 文本替换的坑
const PROXY_URL = 'https://niketv.helloajunjie.workers.dev'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    // 构建时注入代理地址，proxyUrl.js 中通过 typeof __PROXY_URL__ 访问
    __PROXY_URL__: JSON.stringify(PROXY_URL),
  },
  server: {
    proxy: {
      // 代理 M3U 源请求，避免 CORS 限制
      '/m3u-proxy': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/m3u-proxy/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[m3u-proxy] 代理错误:', err.message)
          })
        },
      },
    },
  },
})

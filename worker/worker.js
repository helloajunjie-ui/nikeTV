/**
 * NikoTV - Cloudflare Worker 流媒体代理
 *
 * 职责：代理 HTTP/HTTPS 直播流（通过 ?url= 参数）
 * 前端 SPA 部署在 Cloudflare Pages（同仓库，dist/ 目录）
 *
 * 核心设计：
 * - 拦截 OPTIONS 预检，解决跨域
 * - 强制 User-Agent 伪装，避免被源站拦截
 * - 支持 M3U8 相对路径重写
 * - 流式传输 TS/视频片段
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
}

export default {
  async fetch(request, env, ctx) {
    // ── 1. OPTIONS 预检（解决 99% 跨域问题）──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    // ── 2. 健康检查 ──
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // ── 3. 核心代理 ──
    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
      return new Response('Missing ?url= parameter', {
        status: 400,
        headers: CORS_HEADERS,
      })
    }

    try {
      // 安全校验
      const parsed = new URL(targetUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return new Response('Invalid protocol', {
          status: 400,
          headers: CORS_HEADERS,
        })
      }

      // 伪装浏览器 UA，避免被源站拦截
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      })

      const response = await fetch(modifiedRequest)
      const responseHeaders = new Headers(response.headers)

      // 合并 CORS 头
      Object.keys(CORS_HEADERS).forEach(key => responseHeaders.set(key, CORS_HEADERS[key]))

      // M3U8 相对路径重写
      if (targetUrl.includes('.m3u8') && response.ok) {
        const originalText = await response.text()
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
        const proxyBase = `${url.origin}${url.pathname}?url=`

        const rewritten = originalText.split('\n').map(line => {
          const trimmed = line.trim()
          if (trimmed.startsWith('#') || trimmed === '' ||
              trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return line
          }
          const absoluteUrl = new URL(trimmed, baseUrl).href
          return line.replace(trimmed, `${proxyBase}${encodeURIComponent(absoluteUrl)}`)
        }).join('\n')

        return new Response(rewritten, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      }

      // 流式响应（视频/TS/音频）
      if (response.body) {
        const contentType = responseHeaders.get('Content-Type') || ''
        const isStreamable = contentType.includes('video') ||
                             contentType.includes('audio') ||
                             contentType.includes('octet-stream') ||
                             targetUrl.includes('.ts') ||
                             targetUrl.includes('.m4s')

        if (isStreamable) {
          const { readable, writable } = new TransformStream()
          response.body.pipeTo(writable).catch(() => {})
          return new Response(readable, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
          })
        }
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })

    } catch (error) {
      return new Response(`Proxy Error: ${error.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      })
    }
  },
}

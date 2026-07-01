/**
 * NikoTV - Cloudflare Worker
 *
 * 职责（极简）：
 * 1. EPG XML 代理（解决 CORS 跨域）
 * 2. 健康检查
 *
 * 视频流直接播放，不经过 Worker
 * IPTV 源多为 HTTP，家用网络直连不会被拦截
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Content-Length',
}

export default {
  async fetch(request) {
    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    // 健康检查
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // 核心代理（仅用于 EPG XML 等非视频资源）
    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
      return new Response('Missing ?url=', { status: 400, headers: CORS_HEADERS })
    }

    try {
      const parsed = new URL(targetUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return new Response('Invalid protocol', { status: 400, headers: CORS_HEADERS })
      }

      const resp = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*',
        },
        redirect: 'follow',
      })

      const responseHeaders = new Headers(resp.headers)
      Object.keys(CORS_HEADERS).forEach(key => responseHeaders.set(key, CORS_HEADERS[key]))

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      })
    } catch (error) {
      return new Response(`Upstream Error: ${error.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      })
    }
  },
}

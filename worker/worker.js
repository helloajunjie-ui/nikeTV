/**
 * NikoTV - Cloudflare Worker
 *
 * 职责：
 * 1. EPG XML 代理（解决 CORS）
 * 2. 源列表版本号（客户端轮询检测更新）
 * 3. 健康检查
 *
 * 视频流直接播放，不经过 Worker
 */

// ── 源列表版本配置 ──
// 每次在 GitHub 更新 iptv4.m3u 后，手动递增此版本号
// 客户端检测到版本号变化，自动拉取最新列表
const SOURCE_VERSION = '1'
const SOURCE_URL = 'https://raw.githubusercontent.com/helloajunjie-ui/nikeTV/main/public/iptv4.m3u'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Expose-Headers': 'Content-Length',
}

export default {
  async fetch(request) {
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

    // 源列表版本查询（客户端轮询）
    // 返回当前版本号和最新源列表下载地址
    if (url.pathname === '/source-version') {
      return new Response(JSON.stringify({
        version: SOURCE_VERSION,
        url: SOURCE_URL,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // EPG XML 代理
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

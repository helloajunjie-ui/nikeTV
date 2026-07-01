/**
 * 源自动更新器 - 检测上游源变更并静默同步
 *
 * 核心策略：
 * 1. 通过 GitHub API 获取源文件的最新 commit SHA
 * 2. 与本地缓存的 SHA 对比，判断是否有更新
 * 3. 有更新时后台拉取新 M3U，替换对应源的频道列表
 * 4. 不打断当前播放，切换频道时自动使用新列表
 *
 * 设计约束：
 * - GitHub API 未认证下 60 req/h，每个源每 10min 检查一次绰绰有余
 * - 使用 ETag/If-None-Match 减少带宽消耗
 * - 所有网络错误静默处理，不影响用户
 *
 * 多仓库支持：
 * - 每个上游仓库独立配置 repo、分支、文件路径映射
 * - URL 前缀匹配自动路由到对应仓库
 */

import { get, set } from 'idb-keyval'

const SHA_CACHE_PREFIX = 'nikotv-sha-'
const CHECK_INTERVAL = 30 * 60 * 1000 // 30 分钟检查一次

/**
 * 上游仓库配置
 * 每个仓库包含：repo（owner/name）、branch、fileMap（URL 关键词 → 文件路径）
 */
const UPSTREAM_REPOS = [
  {
    repo: 'vbskycn/iptv',
    branch: 'master',
    fileMap: {
      'iptv4.m3u': 'tv/iptv4.m3u',
      'iptv6.m3u': 'tv/iptv6.m3u',
    },
  },
  {
    repo: 'iptv-org/iptv',
    branch: 'master',
    fileMap: {
      'streams/cn.m3u': 'streams/cn.m3u',
      'streams/cn_cctv.m3u': 'streams/cn_cctv.m3u',
      'streams/cn_cgtn.m3u': 'streams/cn_cgtn.m3u',
      'streams/cn_112114.m3u': 'streams/cn_112114.m3u',
    },
  },
  {
    repo: 'Free-TV/IPTV',
    branch: 'master',
    fileMap: {
      'playlist_china.m3u8': 'playlists/playlist_china.m3u8',
    },
  },
  {
    repo: 'HerbertHe/iptv-sources',
    branch: 'gh-pages',
    fileMap: {
      'cn.m3u': 'cn.m3u',
      'cn_c.m3u': 'cn_c.m3u',
      'cn_n.m3u': 'cn_n.m3u',
      'cn_p.m3u': 'cn_p.m3u',
    },
  },
]

/**
 * 根据 URL 匹配对应的仓库和文件路径
 * @returns {{ repo: string, branch: string, filePath: string } | null}
 */
export function matchRepo(url) {
  for (const repo of UPSTREAM_REPOS) {
    for (const [keyword, filePath] of Object.entries(repo.fileMap)) {
      if (url.includes(keyword)) {
        return { repo: repo.repo, branch: repo.branch, filePath }
      }
    }
  }
  return null
}

/**
 * 获取源文件的最新 commit SHA
 * 通过 GitHub API 获取，比直接下载文件头更轻量
 */
async function getLatestSHA(repo, filePath) {
  const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(filePath)}&per_page=1`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    clearTimeout(timer)
    if (!response.ok) return null

    const commits = await response.json()
    return commits[0]?.sha || null
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * 检查指定源是否有更新
 * @param {string} sourceUrl - 源的 URL（用于匹配本地源和仓库）
 * @returns {Promise<{hasUpdate: boolean, latestSha: string|null, repo: string|null, filePath: string|null}>}
 */
export async function checkUpdate(sourceUrl) {
  const match = matchRepo(sourceUrl)
  if (!match) return { hasUpdate: false, latestSha: null, repo: null, filePath: null }

  const { repo, filePath } = match
  const cacheKey = `${SHA_CACHE_PREFIX}${sourceUrl}`
  const cached = await get(cacheKey)
  const latestSha = await getLatestSHA(repo, filePath)

  if (!latestSha) {
    return { hasUpdate: false, latestSha: null, repo, filePath }
  }

  // 首次运行：cached 为 undefined，此时应写入 SHA 但不触发更新
  // 避免每次页面首次加载都拉取一次完整 M3U
  if (cached === undefined) {
    await set(cacheKey, latestSha)
    return { hasUpdate: false, latestSha, repo, filePath }
  }

  const hasUpdate = cached !== latestSha

  // 更新缓存 SHA
  if (hasUpdate) {
    await set(cacheKey, latestSha)
  }

  return { hasUpdate, latestSha, repo, filePath }
}

/**
 * 启动自动更新检测
 * @param {Array} sources - 当前源列表 [{ id, url, label }]
 * @param {Function} onUpdate - 检测到更新时的回调 (sourceId, sourceUrl) => Promise<void>
 * @returns {Function} stop 函数
 */
export function startAutoUpdate(sourcesRef, onUpdate) {
  let timer = null
  let stopped = false

  async function poll() {
    if (stopped) return

    // 每次 poll 时重新读取 sources（支持动态添加的新源）
    const sources = typeof sourcesRef === 'function' ? sourcesRef() : sourcesRef
    for (const src of sources) {
      if (stopped) break
      const url = src.url || ''
      const match = matchRepo(url)
      if (!match) continue
      const { hasUpdate } = await checkUpdate(url)
      if (hasUpdate && !stopped) {
        await onUpdate(src.id, url)
      }
    }

    if (!stopped) {
      timer = setTimeout(poll, CHECK_INTERVAL)
    }
  }

  // 首次检查延迟 5 秒，给页面加载留出时间
  timer = setTimeout(poll, 5000)

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

export async function fetchLatestSource(repo, filePath, branch = 'master') {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      cache: 'no-cache',
    })
    clearTimeout(timer)
    if (!response.ok) return null
    return await response.text()
  } catch {
    clearTimeout(timer)
    return null
  }
}

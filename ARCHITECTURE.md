# NikoTV 架构文档

> 版本：1.2
> 最后更新：2026-07-01  
> 本文档描述 NikoTV 的核心架构设计、数据流、关键决策、边界防御策略及已知修复。

---

## 目录

1. [架构总览](#1-架构总览)
2. [分层职责](#2-分层职责)
3. [核心数据流](#3-核心数据流)
4. [关键设计决策](#4-关键设计决策)
5. [边界防御与异常处理](#5-边界防御与异常处理)
6. [已知修复与演进](#6-已知修复与演进)
7. [扩展方案](#7-扩展方案)

---

## 1. 架构总览

```
┌──────────────────────────────────────────────────────────────────┐
│                       Presentation Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐         │
│  │ EmptyState│  │ TVPlayer │  │  HUD     │  │ Import  │         │
│  │  (空状态) │  │ (播放器) │  │ (工具栏) │  │ (导入)  │         │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ChannelList│  │EPGOverlay│  │SourceHealth                      │
│  │ (频道列表)│  │ (节目单) │  │ (健康面板)                       │
│  └──────────┘  └──────────┘  └──────────┘                       │
├──────────────────────────────────────────────────────────────────┤
│                       Composable Layer                           │
│  ┌──────────────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │  useChannelStore  │  │useGesture│  │  (EPG / Health /    │   │
│  │  (频道状态+持久化)│  │ (手势)   │  │   SW Channel Sync)  │   │
│  └──────────────────┘  └──────────┘  └──────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                        Utility Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │m3uParser │  │epgParser │  │proxyUrl  │  │ sourceManager  │   │
│  │          │  │          │  │          │  │ sourceUpdater  │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                     Infrastructure Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐           │
│  │  PWA SW  │  │ IndexedDB│  │ Cloudflare Worker    │           │
│  │ (sw.js)  │  │ (idb)    │  │ (CORS Proxy)         │           │
│  └──────────┘  └──────────┘  └──────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘

        主线程 ←── postMessage ──→ Service Worker
         │                              │
         ├── SYNC_CHANNELS ────────────→│ 同步频道列表
         │                              │
         │←── BATCH_HEALTH_UPDATE ──────│ 批量健康结果
         │←── DEAD_CHANNELS ────────────│ 死亡频道通知
         │←── CHANNEL_HEALTH_UPDATE ────│ 单线路状态（仅非健康检查时）
```

### 设计原则

- **单向数据流**：状态全部集中在 composable 层，组件只读不写
- **纯前端优先**：零后端依赖，所有持久化走 IndexedDB
- **渐进增强**：核心播放能力（hls.js → 原生 video → 直连）逐级降级
- **防御性编程**：每个 IO 操作都有超时熔断、错误恢复、静默失败
- **SW 同步一致性**：所有频道变更入口（导入/删除/刷新/自动更新/初始化）都必须同步到 SW

---

## 2. 分层职责

### 2.1 Presentation Layer — 组件层

| 组件 | 职责 | 输入 | 输出 |
|------|------|------|------|
| [`App.vue`](src/App.vue) | 应用编排：转场控制、生命周期、键盘快捷键、SW 消息协调 | — | — |
| [`TVPlayer.vue`](src/components/TVPlayer.vue) | 视频播放、OSD、Media Session、PiP、hls.js 错误兜底 | `channel`, `brightness` | `@prev`, `@next` |
| [`ChannelList.vue`](src/components/ChannelList.vue) | 频道列表展示、搜索、自动滚动 | `channels[]`, `activeIndex` | `@select` |
| [`ImportSheet.vue`](src/components/ImportSheet.vue) | 多源导入面板、剪贴板检测、预设源 | `visible`, `sources[]` | `@import`, `@remove-source` |
| [`EPGOverlay.vue`](src/components/EPGOverlay.vue) | 电子节目单展示 | `current`, `next` | — |
| [`SourceHealthPanel.vue`](src/components/SourceHealthPanel.vue) | 源健康检测进度与统计 | `checking`, `checked`, `total`, `alive`, `dead` | `@check`, `@refresh` |

**组件设计规范：**
- 组件不直接操作 IndexedDB 或 Service Worker
- 组件不持有业务状态，所有状态通过 props 注入
- 组件通过 emit 向上通知事件，由 App.vue 协调

### 2.2 Composable Layer — 逻辑层

| Composable | 职责 | 关键方法 |
|------------|------|----------|
| [`useChannelStore`](src/composables/useChannelStore.js) | 多源频道状态管理、IndexedDB 持久化、线路切换 | `addSource()`, `removeSource()`, `switchTo()`, `switchLine()`, `getActiveUrl()`, `persist()` |
| [`useGesture`](src/composables/useGesture.js) | 触摸手势识别 + 键盘 D-Pad | 返回 `brightness` ref |

**状态管理原则：**
- 全局单例模式（模块顶层的 `ref()`），所有组件共享同一实例
- 状态变更自动持久化到 IndexedDB
- 频道数据携带 `sourceId` 标记来源，支持多源聚合
- 每个频道可包含多条 `urls[]` 线路，通过 `_activeIdx` 切换

### 2.3 Utility Layer — 工具层

| 模块 | 职责 | 关键函数 |
|------|------|----------|
| [`m3uParser.js`](src/utils/m3uParser.js) | M3U 格式解析 | `parseM3U(content)`, `loadM3USource(input)` |
| [`epgParser.js`](src/utils/epgParser.js) | XMLTV EPG 解析 | `parseEPG(xml)`, `getCurrentProgramme(list)`, `buildEpgIndex()`, `findProgrammes()` |
| [`proxyUrl.js`](src/utils/proxyUrl.js) | CORS 代理 URL 构造 | `getProxiedUrl(url)`, `proxyChannelList(channels)` |
| [`sourceManager.js`](src/utils/sourceManager.js) | 源健康检测、上游刷新、IPv6 检测、健康缓存 | `filterAliveChannels()`, `refreshFromUpstream()`, `checkIPv6Support()`, `cacheHealthStatus()` |
| [`sourceUpdater.js`](src/utils/sourceUpdater.js) | 自动源更新轮询、GitHub SHA 比对 | `startAutoUpdate()`, `checkUpdate()`, `matchRepo()`, `fetchLatestSource()` |
| [`presetCache.js`](src/utils/presetCache.js) | 预设源缓存（IndexedDB + 后台刷新） | `getPresetChannels()`, `clearPresetCache()` |

### 2.4 Infrastructure Layer — 基础设施

| 组件 | 职责 | 关键设计 |
|------|------|----------|
| [`sw.js`](public/sw.js) | Service Worker：缓存 + 后台自适应源净化 | 网络优先策略、IndexedDB 频道存储、CORS HEAD→Range fallback 双阶段探测、动态批大小（上限 10）、自适应周期（5~30min）、当前频道保护、**防重入保护（isHealthChecking）**、**批量结果上报（BATCH_HEALTH_UPDATE）** |
| IndexedDB | 本地持久化 | 主线程用 `keyval-store` 库，SW 用 `nikotv-sw-cache` 库，互不冲突 |
| [`worker.js`](worker/worker.js) | Cloudflare Worker CORS 代理 + M3U8 路径重写 | Mixed Content 升级、Content-Type 修正、Range 头透传、M3U8 相对路径→绝对代理 URL 重写 |

---

## 3. 核心数据流

### 3.1 频道导入流

```
用户输入 URL / M3U 内容
       │
       ▼
ImportSheet.vue ──→ loadM3USource() ──→ fetch / parseM3U
       │                                          │
       │    ┌─────────────────────────────────────┘
       ▼    ▼
  preview 列表（用户确认）
       │
       ▼
  emit('import', list, meta)
       │
       ▼
App.vue ──→ useChannelStore.addSource()
       │
       ├──→ 去重（按 sourceId + tvgId/name）
       ├──→ 持久化到 IndexedDB
       ├──→ 同步频道列表到 SW（postMessage SYNC_CHANNELS）
       └──→ 触发健康检测（延迟 500ms）
```

### 3.2 播放流

```
频道切换
  │
  ▼
App.vue ──→ useChannelStore.switchTo(index)
  │
  ├──→ 持久化 activeIndex 到 IndexedDB
  │
  ▼
TVPlayer.vue ──→ watch(channel) ──→ initPlayer()
  │
  ├──→ clearTimeout(errorTimer)  // 清除旧错误定时器（防竞态）
  ├──→ getProxiedUrl(channel.url)  // 包装 CORS 代理
  ├──→ 检测 iOS 原生 HLS 支持
  │     ├── 是 → video.src = streamUrl
  │     └── 否 → hls.js 加载（含 MAX_HLS_ERRORS=5 兜底）
  ├──→ onReady() → video.play()
  ├──→ updateMediaSession()  // 锁屏信息更新
  └──→ showOSDTemporarily()  // OSD 3s 自动隐藏
```

### 3.3 后台净化流（v1.2 批量上报 + 防重入版）

```
主线程                              Service Worker
  │                                      │
  ├──postMessage(SYNC_CHANNELS)──────────→│
  │                                      ├──→ 存入 IndexedDB（nikotv-sw-cache 库）
  │                                      │
  │                             自适应周期触发
  │                              (实际耗时×3, 5~30min)
  │                                      │
  │                                      ├──→ isHealthChecking 检查
  │                                      │     ├── 检查中 → 跳过本次（防重入）
  │                                      │     └── 空闲 → 继续
  │                                      │
  │                                      ├──→ 读取频道列表
  │                                      ├──→ 动态计算批大小（max(3, ceil(N/maxBatches)), ≤10）
  │                                      ├──→ CORS HEAD 探测
  │                                      │     ├── 成功 → response.ok 判活
  │                                      │     └── 失败 → Range: bytes=0-0 fallback
  │                                      ├──→ 收集所有结果到 batchResults[]
  │                                      ├──→ 自适应间隔（时间紧迫时 200ms，否则 1s）
  │                                      │
  │←──postMessage(BATCH_HEALTH_UPDATE)───│   // 批量上报（替代逐条上报）
  │←──postMessage(DEAD_CHANNELS)─────────│   // 死亡频道通知（仅用于自动切换）
  │                                      │
  ├──→ BATCH_HEALTH_UPDATE 处理
  │     ├──→ 更新 healthChecked/deadCount/aliveCount
  │     └──→ 更新线路健康状态
  │
  ├──→ DEAD_CHANNELS 处理（仅非健康检查时）
  │     ├──→ 过滤当前播放频道（防误杀）
  │     ├──→ 静默剔除死亡频道
  │     ├──→ 更新 activeIndex
  │     ├──→ 清理空源
  │     └──→ persist()
  │
  └──→ isHealthChecking = false
  └──→ 调度下一轮
```

**关键变更说明：**
- **v1.0**：`no-cors` HEAD 探测（假阳性，废弃）
- **v1.1**：CORS HEAD → Range GET 双阶段 + 逐条 `CHANNEL_HEALTH_UPDATE` 上报
- **v1.2**：改为 `BATCH_HEALTH_UPDATE` 批量上报，消除与 `checkAllSources` 的计数竞争；新增 `isHealthChecking` 防重入保护

### 3.4 PiP 自动触发流（v1.1 竞态保护版）

```
用户切后台（visibilitychange）
  │
  ▼
TVPlayer.vue ──→ onVisibilityChange()
  │
  ├──→ document.hidden === true
  ├──→ 如果视频已暂停 → await video.play() 恢复
  ├──→ requestAnimationFrame 等待一帧同步
  └──→ video.requestPictureInPicture()
         │
         ├── 成功 → 悬浮小窗继续播放
         └── 失败 → 静默（PiP 不被支持）
```

### 3.5 SW 同步入口点（v1.2 新增）

所有可能变更频道列表的操作都必须同步到 SW，共 **6 个入口点**：

| # | 入口 | 触发时机 | 同步方式 |
|---|------|----------|----------|
| 1 | `handleImport()` | 用户导入新源 | `syncChannelsToSW()` 直接调用 |
| 2 | `handleRemoveSource()` | 用户删除源 | `setTimeout(() => syncChannelsToSW(), 300)` |
| 3 | `checkAllSources()` | 健康检测完成 | 内部 `syncChannelsToSW()`（仅当有频道被移除时） |
| 4 | `refreshSource()` | 用户手动刷新上游 | `setTimeout(() => syncChannelsToSW(), 600)`（即使无频道被移除也同步） |
| 5 | `startAutoUpdate` onUpdate | 自动更新发现新内容 | `setTimeout(() => syncChannelsToSW(), 300)` |
| 6 | `onMounted` 初始化 | 页面加载 | `syncChannelsToSW()` 直接调用 |

**设计考量**：`refreshSource` 和 `startAutoUpdate` 使用 `setTimeout` 延迟同步，是因为 `addSource` 内部可能触发 `checkAllSources`，而 `checkAllSources` 内部只有在频道被移除时才同步。如果所有线路都存活，SW 将得不到更新。延迟同步确保无论 `checkAllSources` 是否触发内部同步，SW 最终都会收到最新数据。

---

## 4. 关键设计决策

### 4.1 为什么用 IndexedDB 而不是 localStorage？

| 维度 | localStorage | IndexedDB |
|------|-------------|-----------|
| 容量上限 | 5MB | 无硬限制（通常 > 50MB） |
| 数据类型 | 仅字符串 | 任意 JS 对象 |
| 查询能力 | 无 | 游标、索引、事务 |
| 异步 | 同步（阻塞主线程） | 异步 |

**结论**：IPTV 频道列表动辄数百条，每条包含 name/url/logo/tvgId/group/sourceId 等字段，JSON 序列化后轻松超过 5MB。IndexedDB 是唯一选择。

### 4.2 为什么保留原生 `<video>` 回退？

iOS Safari **不支持 MSE**（Media Source Extension），因此 hls.js 在 iOS 上完全无法工作。但 iOS Safari **原生支持 HLS**（`application/vnd.apple.mpegurl`）。检测逻辑：

```javascript
if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // iOS 原生 HLS → 直接赋值 src
  video.src = streamUrl
} else if (Hls.isSupported()) {
  // 标准 hls.js
  hls.loadSource(streamUrl)
} else {
  // 最终降级：直接播放（适用于非 HLS 流）
  video.src = streamUrl
}
```

### 4.3 ~~为什么用 `no-cors` HEAD 做健康检测？~~（已废弃，v1.1 修复）

> **v1.0 的原始设计**：跨域直播源通常不设置 CORS 头，普通 `fetch` 会被浏览器拦截。`no-cors` 模式可以绕过 CORS 限制，但只能拿到 `opaque` 响应（无法读取状态码）。判活逻辑为 `response.ok || response.type === 'opaque'`。

> **v1.1 发现的问题**：`no-cors` 模式下 `response.type === 'opaque'` **永远为 true**（即使 404 也是 opaque），导致死频道永远不会被检测到。

**v1.1 修复**：改用 CORS HEAD → Range GET 双阶段探测策略：

```javascript
// 第一阶段：CORS HEAD
try {
  const response = await fetch(url, { method: 'HEAD', mode: 'cors' })
  alive = response.ok  // 能区分 200/404
} catch {
  // 第二阶段：Range: bytes=0-0 fallback
  const resp = await fetch(url, { headers: { Range: 'bytes=0-0' }, mode: 'cors' })
  alive = resp.ok  // 206 即存活
}
```

### 4.4 为什么用 Cloudflare Worker 做代理？（不用自建云服务器）

| 方案 | 延迟 | 成本 | 运维 | 带宽 | M3U8 路径重写 |
|------|------|------|------|------|--------------|
| CORS Anywhere | 高（多跳转） | 免费 | 无 | 有限 | ❌ |
| 自建云服务器 | 中（单地域） | 固定月费 | 需维护 OS/Nginx/证书 | 受限（5~30Mbps） | 需复杂 Nginx 规则 |
| Cloudflare Worker | **极低（边缘节点）** | **免费 10万请求/天** | **零运维** | **无限** | **代码级灵活处理** |

**核心决策依据：**

Worker 部署在全球 300+ 边缘节点，用户请求直接路由到最近的节点，延迟远低于自建服务器。免费额度（10万请求/天）对个人 IPTV 使用绰绰有余。

**什么场景才需要云服务器：**
- 需要 WebSocket/SSE 实时推送（如扫码投递的实时通信）
- 需要服务端转码/重编码（FFmpeg）
- 需要大量存储（录制回放）
- 需要数据库（用户系统、订阅管理）

NikoTV 定位为纯前端 IPTV 播放器，以上场景均不在路线图内，因此 **Cloudflare Worker 是最优解，云服务器是过度设计**。

**Worker 代理架构：**
```
用户浏览器
    │
    ├── HTTPS 流 → 直连（无需代理）
    │
    └── HTTP 流 → Cloudflare Worker（CORS 代理 + M3U8 重写）
                     │
                     ├── CORS 头注入（Access-Control-Allow-Origin: *）
                     ├── Mixed Content 升级（HTTP→HTTPS）
                     ├── M3U8 相对路径重写（.ts 分片路径修正）
                     ├── Content-Type 修正（application/vnd.apple.mpegurl）
                     ├── 15s 超时熔断
                     ├── 50MB 响应体上限
                     └── 可选 PROXY_SECRET 鉴权防滥用
```

**前端三级降级策略（[`proxyUrl.js`](src/utils/proxyUrl.js)）：**
1. HTTPS 流 → 直连
2. HTTP 流 → Worker 代理（带健康检测，5 分钟探活一次）
3. Worker 不可用 → 直连降级（部分源可能因 Mixed Content 失败）

### 4.5 多源去重策略

```
同一源内：按 (sourceId + tvgId) 去重，无 tvgId 则按 (sourceId + name)
跨源：同名频道保留（不同源的 CCTV-1 各自保留）
```

这样设计的原因是：不同源的同一频道可能有不同的播放质量或延迟，保留多个副本让用户可以选择最优的。

### 4.6 EPG 模糊匹配策略（v1.1 新增）

**问题**：M3U 中的 `tvg-id` 和 XMLTV 中的 `channel id` 命名格式完全不同（`CCTV-1` vs `CCTV1` vs `cctv1` vs `CCTV-1综合`）。

**方案**：三级降级匹配

```
输入 tvgId
  │
  ├── 1. 精确匹配 → 命中返回
  │
  ├── 2. 归一化匹配（normalizeTvgId）
  │     ├── 统一小写
  │     ├── 去除空格、连字符、下划线
  │     └── 只保留字母数字中文
  │     → 命中返回
  │
  └── 3. 部分包含匹配
        ├── normalized.includes(key)
        └── key.includes(normalized)
        → 命中返回
```

### 4.7 为什么用 `BATCH_HEALTH_UPDATE` 替代逐条 `CHANNEL_HEALTH_UPDATE`？（v1.2 新增）

**问题**：SW 健康检查对每条 URL 发送独立的 `CHANNEL_HEALTH_UPDATE` 消息，同时 `checkAllSources` 的 `onProgress` 回调也在递增相同的计数器（`healthChecked`/`deadCount`/`aliveCount`），导致**三重计数污染**。

**方案**：SW 将所有检测结果收集到 `batchResults[]` 数组，检测完成后一次性发送 `BATCH_HEALTH_UPDATE` 消息。主线程只在一个地方处理计数更新。

```javascript
// sw.js - 批量收集
const batchResults = []
// ... 对每条 URL 检测 ...
batchResults.push({ channelIndex, urlIndex, alive })

// 检测完成后一次性发送
client.postMessage({
  type: 'BATCH_HEALTH_UPDATE',
  results: batchResults
})
```

```javascript
// App.vue - 单点处理
if (e.data.type === 'BATCH_HEALTH_UPDATE') {
  for (const r of e.data.results) {
    healthChecked.value++
    if (r.alive) aliveCount.value++
    else deadCount.value++
    updateChannelHealth(r.channelIndex, r.urlIndex, r.alive)
  }
}
```

### 4.8 为什么需要 `totalLines` 计算属性？（v1.2 新增）

**问题**：`SourceHealthPanel` 的 `:total` prop 传入的是频道数（`totalChannels`），但健康检测的 `healthChecked` 是线路数（每个频道可能有多条 URL）。当频道有 3 条线路时，进度显示为 33% 而非 100%。

**方案**：新增 `totalLines` 计算属性，统计所有频道的线路总数：

```javascript
const totalLines = computed(() => {
  return channels.value.reduce((sum, ch) => sum + (ch.urls?.length || 0), 0)
})
```

---

## 5. 边界防御与异常处理

### 5.1 播放异常

| 场景 | 处理 |
|------|------|
| 视频加载失败 | 重试 2 次，每次间隔 5s（v1.2 从 2s 改为 5s） |
| 重试仍失败 | 自动切到下一个频道（5s 延迟） |
| hls.js 网络错误 | `hls.startLoad()` 恢复，**错误次数 ≤ 5（MAX_HLS_ERRORS）**，超限后降级到 `onVideoError` |
| hls.js 媒体错误 | `hls.recoverMediaError()` 恢复，**错误次数 ≤ 5（MAX_HLS_ERRORS）**，超限后降级到 `onVideoError` |
| `onVideoError` 竞态 | 使用 `errorTimer` 变量保存 setTimeout 引用，`initPlayer()` 和 `onBeforeUnmount()` 中 `clearTimeout(errorTimer)` 防止意外切换 |
| 空频道列表 | 显示空状态，引导导入 |

**hls.js 错误兜底逻辑（v1.2 新增）：**

```javascript
const MAX_HLS_ERRORS = 5
let hlsErrorCount = 0

hls.on(Hls.Events.ERROR, (event, data) => {
  if (data.fatal) {
    hlsErrorCount++
    if (hlsErrorCount > MAX_HLS_ERRORS) {
      // 超出上限，降级到原生 video 错误处理
      hls.destroy()
      onVideoError()
      return
    }
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        hls.startLoad()
        break
      case Hls.ErrorTypes.MEDIA_ERROR:
        hls.recoverMediaError()
        break
    }
  }
})
```

**errorTimer 竞态保护（v1.2 新增）：**

```javascript
let errorTimer = null

function onVideoError() {
  clearTimeout(errorTimer)  // 清除旧的错误定时器
  // ... 重试或切换逻辑 ...
  errorTimer = setTimeout(() => emit('next'), 5000)
}

function initPlayer() {
  clearTimeout(errorTimer)  // 新播放开始时清除旧定时器
  // ...
}

onBeforeUnmount(() => {
  clearTimeout(errorTimer)
  // ...
})
```

### 5.2 网络异常

| 场景 | 处理 |
|------|------|
| M3U 源无法访问 | 提示"链接无法访问，试试粘贴 m3u 内容" |
| EPG 加载失败 | 静默失败，不阻塞主流程 |
| SW 消息发送失败 | 静默失败（`?.` 操作符） |
| 剪贴板 API 被拒绝 | 静默失败，不弹权限请求 |

### 5.3 存储异常

| 场景 | 处理 |
|------|------|
| IndexedDB 写入失败 | `console.warn`，不阻塞 UI |
| IndexedDB 读取失败 | 返回空数组，显示空状态 |
| 数据格式不兼容（版本升级） | 清空旧数据，重新导入 |

### 5.4 PWA 边界

| 场景 | 处理 |
|------|------|
| SW 更新（幽灵缓存） | 检测 `updatefound` → 底部提示条 → 用户点击刷新 |
| 首次安装 SW | `skipWaiting()` + `clients.claim()` 立即接管 |
| 旧缓存残留 | `activate` 阶段清理非当前版本的缓存 |

### 5.5 安全防御

| 风险 | 防御 |
|------|------|
| Mixed Content（HTTPS 页面加载 HTTP 流） | Worker 代理自动升级 HTTP→HTTPS |
| CORS 拦截 | Worker 注入 `Access-Control-Allow-Origin: *` |
| XSS（M3U 内容注入） | 频道名仅作文本渲染，不使用 `v-html` |
| 剪贴板数据泄露 | 仅检测 `.m3u` 链接，不读取非 URL 内容 |

### 5.6 SW 防重入保护（v1.2 新增）

**问题**：`performHealthCheck` 没有防重入保护。如果在健康检查进行中收到 `SYNC_CHANNELS` 消息，`scheduleHealthCheck` 会设置一个新的 5s 定时器，导致两个 `performHealthCheck` 实例同时运行，产生重复的 `BATCH_HEALTH_UPDATE` 消息。

**方案**：`isHealthChecking` 标志位保护：

```javascript
let isHealthChecking = false

function scheduleHealthCheck() {
  if (healthCheckTimer) clearTimeout(healthCheckTimer)
  if (isHealthChecking) return  // 检查中，跳过调度
  healthCheckTimer = setTimeout(() => {
    performHealthCheck()
  }, 5000)
}

async function performHealthCheck() {
  if (isHealthChecking) return  // 防重入
  isHealthChecking = true
  // ... 执行健康检查 ...
  isHealthChecking = false
  // 调度下一轮
}
```

### 5.7 EPG 加载循环 timer 泄漏（v1.2 修复）

**问题**：EPG 加载循环中，当 `response.ok` 为 `false` 时，代码 `continue` 跳过了 `clearTimeout(timer)`，导致 AbortController 的定时器泄漏。

**修复**：将 `clearTimeout(timer)` 移到循环体末尾（catch 块之后），确保每次迭代都清理定时器。

---

## 6. 已知修复与演进

### 6.1 修复清单

| # | 严重度 | 问题 | 根因 | 修复 |
|---|--------|------|------|------|
| 1 | 🔴 | SW 健康检查假阳性 | `sw.js` 用 `mode: 'no-cors'`，`response.type === 'opaque'` 永远为 true，死链永不剔除 | 改用 CORS HEAD → Range GET 双阶段探测 |
| 2 | 🔴 | Worker HLS 代理 404 | `worker.js` 透传 M3U8 不重写相对路径，`.ts` 分片解析到 Worker 地址 | 拦截 M3U8 响应，重写相对路径为绝对代理 URL |
| 3 | 🟡 | PiP 竞态条件 | 移动端 Safari 在 `visibilitychange` 前已暂停视频，`requestPictureInPicture()` 抛出 `NotAllowedError` | 先 `await video.play()` 恢复，再 `requestAnimationFrame` 同步后触发 |
| 4 | 🟡 | EPG 匹配失败 | 精确 `tvgId` 匹配，`CCTV-1` vs `CCTV1` 等命名差异导致不命中 | 新增 `normalizeTvgId()` + `buildEpgIndex()` + `findProgrammes()` 三级降级匹配 |
| 5 | 🟡 | SW 误杀当前频道 | `onSWMessage` 无条件过滤，当前播放频道可能被剔除 | 过滤当前频道 URL，只剔除非播放中的死链 |
| 6 | 🟢 | 健康检查时间窗口溢出 | 固定 3 并发 × 1s 间隔，2000 频道需 667s > 10min 周期 | 动态批大小（上限 10 并发），时间紧迫时缩短间隔，自适应周期 |
| 7 | 🔴 | 健康统计三重计数污染 | `checkAllSources` onProgress、`CHANNEL_HEALTH_UPDATE` 逐条消息、`DEAD_CHANNELS` 批量消息三者独立递增相同计数器 | SW 改用 `BATCH_HEALTH_UPDATE` 批量上报；`CHANNEL_HEALTH_UPDATE` 和 `DEAD_CHANNELS` 在健康检查进行中跳过计数 |
| 8 | 🟡 | `syncChannelsToSW` 消息类型不匹配 | App.vue 发送 `type: 'UPDATE_CHANNELS'`，但 sw.js 监听 `type: 'SYNC_CHANNELS'` | 统一为 `type: 'SYNC_CHANNELS'` |
| 9 | 🟢 | `SourceHealthPanel` 进度显示错误 | `:total` 传入频道数（如 100），但 `healthChecked` 是线路数（如 300），进度显示 33% | 新增 `totalLines` 计算属性，传入线路总数 |
| 10 | 🟡 | EPG 加载循环 timer 泄漏 | `response.ok` 为 false 时 `continue` 跳过 `clearTimeout(timer)` | 将 `clearTimeout(timer)` 移到循环体末尾 |
| 11 | 🟡 | hls.js NETWORK_ERROR/MEDIA_ERROR 无限重试 | hls.js 错误处理调用 `hls.startLoad()`/`hls.recoverMediaError()` 后无上限，遇到持续错误时无限循环 | 新增 `hlsErrorCount` + `MAX_HLS_ERRORS=5`，超限后降级到 `onVideoError` |
| 12 | 🟡 | `handleRemoveSource` 未同步 SW | 删除源后 SW 仍持有已删除源的频道数据 | 添加 `setTimeout(() => syncChannelsToSW(), 300)` |
| 13 | 🟡 | `refreshSource` 未同步 SW | `refreshSource` 调用 `checkAllSources()` 但不调用 `syncChannelsToSW()`，当所有线路存活时 SW 得不到更新 | 添加 `setTimeout(() => syncChannelsToSW(), 600)` |
| 14 | 🟡 | 自动更新回调未同步 SW | `startAutoUpdate` 的 `onUpdate` 调用 `addSource` 但不同步 SW | 添加 `setTimeout(() => syncChannelsToSW(), 300)` |
| 15 | 🟡 | SW `performHealthCheck` 缺少防重入保护 | 健康检查进行中收到 `SYNC_CHANNELS` 时设置新定时器，导致两个实例同时运行 | 新增 `isHealthChecking` 标志位，调度和入口处双重检查 |
| 16 | 🟡 | `TVPlayer.onVideoError` setTimeout 竞态条件 | `setTimeout(() => emit('next'), 5000)` 未保存 timer 引用，用户手动切台后定时器仍触发 | 新增 `errorTimer` 变量，`initPlayer()` 和 `onBeforeUnmount()` 中 `clearTimeout(errorTimer)` |

### 6.2 演进路线

| 阶段 | 目标 | 优先级 |
|------|------|--------|
| v1.0 | 基础播放 + 多源管理 + PWA | ✅ 已完成 |
| v1.1 | 6 个 Bug 修复 + 自适应调度 + EPG 模糊匹配 | ✅ 已完成 |
| v1.2 | 10 个 Bug 修复 + 批量健康上报 + SW 防重入 + 全入口同步 + hls.js 错误兜底 + 竞态保护 | ✅ 已完成 |
| v1.3 | 扫码投递（Scan to Cast） | 📋 计划中 |
| v1.4 | 频道收藏 / 历史记录 | 📋 计划中 |
| v1.5 | 自定义 EPG 源 | 📋 计划中 |

---

## 7. 扩展方案

### 7.1 扫码投递（Scan to Cast）

**痛点**：电视端浏览器输入 URL 极其困难。

**方案**：
1. 电视端空状态生成二维码（含 6 位房间码）
2. 手机扫码打开遥控页面，粘贴源
3. 通过 Cloudflare Worker + KV 中转数据
4. 电视端轮询或 SSE 接收

**所需新增**：
- `qrcode` npm 包（前端生成二维码）
- Cloudflare Worker 新增 KV 读写端点
- 电视端轮询逻辑

### 7.2 频道收藏 / 历史记录

**方案**：
- IndexedDB 新增 `favorites` 和 `history` 存储
- 频道列表支持星标收藏
- 历史记录记录最近观看的频道和时间

### 7.3 自定义 EPG 源

**方案**：
- 导入面板增加 EPG URL 输入
- 支持多个 EPG 源合并
- EPG 数据缓存到 IndexedDB 减少重复请求

### 7.4 多语言 / i18n

**方案**：
- 使用 Vue I18n
- 提取所有 UI 文本到语言文件
- 自动检测浏览器语言

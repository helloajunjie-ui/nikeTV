# NikoTV 🎬

**纯净流媒体播放器 · 无广告 · 无追踪 · 零后端**

NikoTV 是一个纯前端 PWA 流媒体播放器，旨在解决现代电视 APP 的三大痛点：开机广告、订阅陷阱、臃肿 UI。你只需一个 M3U 直播源链接，即可在任何设备的浏览器中获得原生级的电视观看体验。

## 能力矩阵

| 维度 | 能力 |
|------|------|
| 🎬 播放引擎 | hls.js + iOS 原生回退 + 错误重试 + 自动切台 |
| 📡 源管理 | 多源聚合 + 自动去重 + 源级联 + 一键移除 |
| 🩺 健康检测 | 前端 CORS 检测 + SW 后台自适应净化（CORS→Range fallback） |
| 📺 EPG | XMLTV 解析 + tvg-id 模糊匹配 + 当前/下一档节目 |
| 🖥️ PWA | 全屏沉浸 + 横屏锁定 + 离线缓存 + 版本更新提示 |
| 👆 手势 | 左=亮度 / 右=音量 / 横滑=切台 |
| 🎮 TV 适配 | D-Pad 导航 + 10ft UI + 焦点管理 |
| 🔒 隐私 | 零后端 + 零追踪 + 本地 IndexedDB 存储 |
| 📱 系统融合 | Media Session 锁屏控制 + PiP 画中画自动触发 |
| 🌐 网络 | IPv6 检测 + Mixed Content 防御 + CORS 代理 |
| 🧹 自净化 | SW 后台自适应并发检测 + 动态批大小 + 当前频道保护 |
| 🔄 更新 | SW 幽灵缓存防御 + 玻璃质感更新提示条 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 使用方式

### 1. 导入直播源

点击「导入直播源」，支持三种方式：

- **URL 导入**：粘贴 M3U 链接，自动 fetch 解析
- **内容粘贴**：直接粘贴 `#EXTM3U` 格式文本
- **预设源**：一键导入 IPTV4 / IPTV6 公共源

支持**多源聚合**，多次导入自动合并去重。

### 2. 播放控制

| 操作 | 方式 |
|------|------|
| 切台 | 左右滑动 / 键盘 ← → / 耳机双击 |
| 亮度 | 屏幕左侧上下滑动 |
| 音量 | 屏幕右侧上下滑动 |
| HUD | 点击屏幕 / 按 Enter 或空格 |
| 画中画 | HUD 工具栏 PiP 按钮 / 切后台自动触发 |
| 频道列表 | HUD 左上角菜单按钮 |

### 3. 部署 Cloudflare Worker（CORS 代理）

某些直播源需要 CORS 代理才能在前端播放：

1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 创建 Worker
2. 将 [`worker/worker.js`](worker/worker.js) 内容粘贴部署
3. 在 [`src/utils/proxyUrl.js`](src/utils/proxyUrl.js) 中修改 `WORKER_BASE` 为你的 Worker 地址

> **注意**：Worker 会自动重写 M3U8 中的相对路径（如 `segments/0.ts`）为绝对代理 URL，确保 HLS 分片正确加载。

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Vue 3 (Composition API) |
| 构建 | Vite 8 + TailwindCSS |
| 播放 | hls.js + 原生 `<video>` 回退 |
| 存储 | IndexedDB (idb-keyval) |
| PWA | Service Worker + Manifest |
| 代理 | Cloudflare Worker |
| 样式 | TailwindCSS + 自定义动画 |

## 项目结构

```
src/
├── App.vue                    # 主应用：空状态/播放器转场 + HUD + 全局控制
├── main.js                    # 入口：PWA SW 注册 + 版本更新提示
├── style.css                  # TailwindCSS + 全局动画 + 10ft UI 焦点样式
├── components/
│   ├── TVPlayer.vue           # 核心播放器：hls.js + 原生回退 + OSD + Media Session + PiP
│   ├── ChannelList.vue        # 频道侧边栏：搜索 + 自动滚动 + 频道图标
│   ├── ImportSheet.vue        # 智能导入面板：URL/内容自动识别 + 剪贴板检测 + 多源管理
│   ├── EPGOverlay.vue         # 电子节目单：当前/下一档节目
│   └── SourceHealthPanel.vue  # 源健康检测：进度 + 存活率 + 刷新
├── composables/
│   ├── useChannelStore.js     # 频道状态管理：多源聚合 + IndexedDB 持久化
│   └── useGesture.js          # 手势控制：亮度/音量/切台 + 键盘 D-Pad
├── utils/
│   ├── m3uParser.js           # M3U 解析器：EXTINF + tvg 标签
│   ├── epgParser.js           # XMLTV EPG 解析器 + tvg-id 模糊匹配
│   ├── proxyUrl.js            # CORS 代理 URL 工具
│   └── sourceManager.js       # 源管理：健康检测 + 上游刷新 + IPv6 检测
public/
├── manifest.json              # PWA 清单：全屏 + 横屏
├── sw.js                      # Service Worker：缓存策略 + 后台自适应源净化
└── icons/                     # SVG 图标
worker/
└── worker.js                  # Cloudflare Worker：CORS 代理 + M3U8 路径重写
```

## 架构设计

### 多源聚合

```
源 A (IPTV4) ──→ 频道列表 A ──┐
                                ├──→ 合并去重 → 统一播放列表
源 B (IPTV6) ──→ 频道列表 B ──┘
```

- 每个频道携带 `sourceId` 标记来源
- 同一源内按 `tvgId` / `name` 去重
- 跨源同名频道保留，一个挂了自动切到另一个

### 后台自净化

```
主线程 ──postMessage(UPDATE_CHANNELS)──→ SW
SW ──→ IndexedDB 存储频道列表
SW ──→ 自适应并发检测（动态批大小，上限 10）
SW ──→ CORS HEAD → Range: bytes=0-0 fallback 双阶段探测
SW ──→ 保护当前播放频道不被误杀
SW ──postMessage(DEAD_CHANNELS)──→ 主线程静默剔除死链
SW ──→ 自适应周期（实际耗时 × 3，5min~30min）
```

### 系统融合

- **Media Session API**：锁屏显示频道名和台标，耳机按键切台
- **Picture-in-Picture**：切后台自动悬浮小窗（先恢复播放再触发，防竞态），HUD 工具栏手动触发
- **Service Worker 更新**：检测到新版本时底部弹出玻璃质感提示条

## 预设源

| 上游仓库 | 源 | 地址 |
|----------|----|------|
| [`vbskycn/iptv`](https://github.com/vbskycn/iptv)（6.9k ★） | 📡 IPv4 综合 | `https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u` |
| | 📡 IPv4 (zbds) | `https://live.zbds.top/tv/iptv4.m3u` |
| | 🔄 IPv4 加速 | `https://gh-proxy.com/raw.githubusercontent.com/vbskycn/iptv/refs/heads/master/tv/iptv4.m3u` |
| | 📡 IPv6 综合 | `https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv6.m3u` |
| | 📡 IPv6 (zbds) | `https://live.zbds.top/tv/iptv6.m3u` |
| | 🔄 IPv6 加速 | `https://gh-proxy.com/raw.githubusercontent.com/vbskycn/iptv/refs/heads/master/tv/iptv6.m3u` |
| [`iptv-org/iptv`](https://github.com/iptv-org/iptv)（129k ★） | 🌍 全球综合 | `https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/index.m3u` |
| | 🇨🇳 中国频道 | `https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/countries/cn.m3u` |
| | 🇨🇳 中国 CCTV | `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn_cctv.m3u` |
| | 🇨🇳 中国 CGTN | `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn_cgtn.m3u` |
| [`Free-TV/IPTV`](https://github.com/Free-TV/IPTV)（18.6k ★） | 🌍 全球 (Free-TV) | `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8` |
| | 🇨🇳 中国 (Free-TV) | `https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_china.m3u8` |
| [`HerbertHe/iptv-sources`](https://github.com/HerbertHe/iptv-sources)（8.8k ★） | 🇨🇳 中国聚合 | `https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn.m3u` |
| | 🇨🇳 央视 (聚合) | `https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_c.m3u` |
| | 🇨🇳 卫视 (聚合) | `https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_p.m3u` |
| | 🇨🇳 NewTV (聚合) | `https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_n.m3u` |

## 已知修复

| # | 问题 | 修复 |
|---|------|------|
| 1 | SW 用 `no-cors` 模式做健康检查，所有 opaque 响应都被视为存活，死链永不剔除 | 改用 CORS HEAD → Range GET 双阶段探测 |
| 2 | Worker 透传 M3U8 不重写相对路径，浏览器将 `.ts` 分片解析到 Worker 地址导致 404 | 拦截 M3U8 响应，将所有相对路径重写为绝对代理 URL |
| 3 | PiP 自动触发时移动端 Safari 已暂停视频，`requestPictureInPicture()` 抛出 `NotAllowedError` | 先 `await video.play()` 恢复播放，再 `requestAnimationFrame` 同步后触发 |
| 4 | EPG 用精确 `tvgId` 匹配，但 `CCTV-1` vs `CCTV1` vs `cctv1` 等命名差异导致匹配失败 | 新增 `normalizeTvgId()` + `buildEpgIndex()` + `findProgrammes()` 三级降级匹配 |
| 5 | SW 后台检测到死链后无条件剔除，当前正在播放的频道可能被误杀 | 过滤掉当前频道 URL，只剔除非播放中的死链 |
| 6 | 固定 3 并发 × 1s 间隔，2000 频道需 667s > 10min 周期，大源会溢出 | 动态计算批大小（上限 10 并发），时间紧迫时缩短间隔，自适应周期 |
| 7 | 健康统计被 `checkAllSources` onProgress、`CHANNEL_HEALTH_UPDATE`、`DEAD_CHANNELS` 三重独立递增，计数严重虚高 | SW 改用 `BATCH_HEALTH_UPDATE` 单次批量发送；`DEAD_CHANNELS` 不再参与计数；`CHANNEL_HEALTH_UPDATE` 和 `DEAD_CHANNELS` 受 `healthChecking` 守卫 |
| 8 | `syncChannelsToSW` 发送 `type: 'UPDATE_CHANNELS'` 但 SW 监听 `type: 'SYNC_CHANNELS'`，SW 永远收不到频道列表 | 统一为 `type: 'SYNC_CHANNELS'` |
| 9 | `SourceHealthPanel` 的 `:total` 传入频道数（如 100），但 `healthChecked` 是线路数（如 300），进度条永远到不了 100% | 新增 `totalLines` computed，传入线路总数 |
| 10 | EPG 加载循环中 `response.ok` 为 false 时 `continue` 跳过 `clearTimeout(timer)`，导致 AbortController timer 泄漏 | 将 `clearTimeout(timer)` 移到循环体末尾（catch 之后） |
| 11 | hls.js `NETWORK_ERROR`/`MEDIA_ERROR` 无限调用 `hls.startLoad()`/`hls.recoverMediaError()` 永不回退到 `onVideoError` | 新增 `hlsErrorCount` 上限 5 次，超限后调用 `onVideoError()` 走 3 级降级 |
| 12 | `handleRemoveSource` 移除源后未同步 SW，SW 仍持有已删除源的线路数据 | 添加 `setTimeout(() => syncChannelsToSW(), 300)` |
| 13 | `refreshSource` 刷新上游后未同步 SW，SW 仍持有旧频道列表 | 添加 `setTimeout(() => syncChannelsToSW(), 600)` |
| 14 | 自动更新回调 `addSource` 后未同步 SW，SW 仍持有旧频道列表 | 添加 `setTimeout(() => syncChannelsToSW(), 300)` |
| 15 | SW `performHealthCheck` 无防重入保护，多次 `SYNC_CHANNELS` 可导致多个健康检查实例重叠 | 新增 `isHealthChecking` 标志，检查中跳过新调度 |
| 16 | `onVideoError` 中 `setTimeout(() => emit('next'), 5000)` 未保存 timer 引用，用户手动切频道后仍触发意外切换 | 使用 `errorTimer` 保存引用，`initPlayer` 和 `onBeforeUnmount` 中清理 |

## License

MIT

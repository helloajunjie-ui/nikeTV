// 测试实际 M3U 源的 group-title 提取
const https = require('https');

function parseExtInf(line) {
  const meta = { name: '未知频道' };
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
  if (tvgIdMatch && tvgIdMatch[1]) meta.tvgId = tvgIdMatch[1];
  const logoMatch = line.match(/tvg-logo="([^"]*)"/);
  if (logoMatch && logoMatch[1]) meta.logo = logoMatch[1];
  const groupMatch = line.match(/group-title="([^"]*)"/);
  if (groupMatch && groupMatch[1]) meta.group = groupMatch[1];
  const commaIndex = line.indexOf(',');
  if (commaIndex >= 0) {
    const name = line.slice(commaIndex + 1).trim();
    if (name) meta.name = name;
  }
  return meta;
}

function parseM3U(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const channels = [];
  let currentMeta = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#EXTM3U')) continue;
    if (trimmed.startsWith('#EXTINF:')) {
      currentMeta = parseExtInf(trimmed);
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    if (currentMeta && trimmed) {
      channels.push({ ...currentMeta, url: trimmed });
      currentMeta = null;
    }
  }
  return channels;
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const urls = [
    ['vbskycn IPv4', 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u'],
    ['iptv-org CCTV', 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn_cctv.m3u'],
    ['Free-TV China', 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_china.m3u8'],
  ];

  for (const [label, url] of urls) {
    try {
      console.log(`\n=== ${label} ===`);
      const content = await fetch(url);
      const channels = parseM3U(content);
      
      // 统计分组
      const groups = new Map();
      for (const ch of channels) {
        const g = ch.group || '(无分组)';
        if (!groups.has(g)) groups.set(g, 0);
        groups.set(g, groups.get(g) + 1);
      }
      
      console.log(`总频道: ${channels.length}`);
      console.log(`分组数: ${groups.size}`);
      for (const [g, count] of groups) {
        console.log(`  [${g}] ${count} 个频道`);
      }
      
      // 显示前3个频道的 group
      console.log('前3个频道:');
      channels.slice(0, 3).forEach((ch, i) => {
        console.log(`  ${i}: name="${ch.name}" group="${ch.group || '(空)'}"`);
      });
    } catch (e) {
      console.log(`${label}: 失败 - ${e.message}`);
    }
  }
}

main();

import type { SearchResult, HotItem } from './types'

// ==================== Serper.dev 搜索 ====================
export async function serperSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return []

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 10 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.organic || []).map((r: Record<string, string>) => ({
      title: r.title || '',
      link: r.link || '',
      snippet: r.snippet || '',
    }))
  } catch {
    return []
  }
}

// ==================== RSSHub 热榜 ====================
const RSSHUB_INSTANCES = [
  'https://rsshub.app',
  'https://hub.slarker.me',
  'https://rsshub.rssforever.com',
]

const HOTLIST_PATHS: Record<string, string> = {
  weibo: '/weibo/search/hot',
  douyin: '/douyin/hot',
  zhihu: '/zhihu/hot',
  baidu: '/baidu/hot_search',
}

async function fetchRSS(path: string): Promise<string | null> {
  for (const instance of RSSHUB_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: { Accept: 'application/xml' },
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) return await res.text()
    } catch {
      continue
    }
  }
  return null
}

function parseRSSItems(xml: string): HotItem[] {
  const items: HotItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      || block.match(/<title>(.*?)<\/title>/)?.[1] || ''
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] || ''
    if (title) items.push({ title: title.trim(), url: link })
  }
  return items.slice(0, 20)
}

export async function fetchHotList(platform: keyof typeof HOTLIST_PATHS): Promise<HotItem[]> {
  const path = HOTLIST_PATHS[platform]
  if (!path) return []
  const xml = await fetchRSS(path)
  if (!xml) return []
  return parseRSSItems(xml)
}

export async function fetchAllHotLists(): Promise<Record<string, HotItem[]>> {
  const platforms = Object.keys(HOTLIST_PATHS) as Array<keyof typeof HOTLIST_PATHS>
  // 总超时 5 秒，避免阻塞 API 响应
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('hotlist timeout')), 5000)
  )
  try {
    const results = await Promise.race([
      Promise.allSettled(platforms.map((p) => fetchHotList(p))),
      timeout,
    ]) as PromiseSettledResult<HotItem[]>[]
    const out: Record<string, HotItem[]> = {}
    platforms.forEach((p, i) => {
      out[p] = results[i].status === 'fulfilled' ? results[i].value : []
    })
    return out
  } catch {
    return {}
  }
}

// ==================== 工具函数 ====================
export function truncateForAI(text: string, maxLength = 2000): string {
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

export function formatHotListForAI(hotLists: Record<string, HotItem[]>): string {
  let text = '【实时热榜数据】\n\n'
  for (const [platform, items] of Object.entries(hotLists)) {
    if (items.length === 0) continue
    const platformNames: Record<string, string> = {
      weibo: '微博热搜', douyin: '抖音热点', zhihu: '知乎热榜', baidu: '百度热搜',
    }
    text += `${platformNames[platform] || platform}：\n`
    items.slice(0, 10).forEach((item, i) => {
      text += `${i + 1}. ${item.title}\n`
    })
    text += '\n'
  }
  return truncateForAI(text, 2000)
}

export function formatSearchForAI(results: SearchResult[]): string {
  if (results.length === 0) return ''
  let text = '【搜索结果】\n\n'
  results.slice(0, 5).forEach((r, i) => {
    text += `${i + 1}. ${r.title}\n${r.snippet}\n\n`
  })
  return truncateForAI(text, 2000)
}

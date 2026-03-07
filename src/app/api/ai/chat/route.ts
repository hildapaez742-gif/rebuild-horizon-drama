import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { buildSystemPrompt } from '@/lib/skill-loader'
import { fetchAllHotLists, formatHotListForAI, serperSearch, formatSearchForAI } from '@/lib/search'
import type { SkillPhase, ChatMessage } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    messages,
    phase,
    engineConfig,
    searchQuery,
  }: {
    messages: ChatMessage[]
    phase: SkillPhase
    engineConfig: {
      activeEngine: 'claude' | 'qwen'
      config: { apiKey: string; model: string; baseUrl: string }
    }
    searchQuery?: string
  } = body

  // 构建额外上下文（搜索结果）
  let extraContext = ''

  if (phase === 'topic') {
    try {
      const hotLists = await fetchAllHotLists()
      extraContext = formatHotListForAI(hotLists)
    } catch {
      extraContext = '（实时热榜数据暂时不可用，请基于内置知识回答）'
    }
  }

  if (searchQuery) {
    try {
      const results = await serperSearch(searchQuery)
      extraContext += '\n' + formatSearchForAI(results)
    } catch {
      // 搜索失败降级
    }
  }

  const systemPrompt = buildSystemPrompt(phase, extraContext || undefined)

  const DEFAULT_BASE_URLS: Record<string, string> = {
    claude: 'https://api.anthropic.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  }

  const client = new OpenAI({
    apiKey: engineConfig.config.apiKey,
    baseURL: engineConfig.config.baseUrl || DEFAULT_BASE_URLS[engineConfig.activeEngine],
  })

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  const stream = await client.chat.completions.create({
    model: engineConfig.config.model,
    messages: openaiMessages,
    stream: true,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || ''
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

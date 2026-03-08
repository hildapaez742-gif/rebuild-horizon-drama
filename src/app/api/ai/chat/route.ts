import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { buildSystemPrompt } from '@/lib/skill-loader'
import { fetchAllHotLists, formatHotListForAI, serperSearch, formatSearchForAI } from '@/lib/search'
import type { SkillPhase, ChatMessage } from '@/lib/types'

const DEFAULT_BASE_URLS: Record<string, string> = {
  claude: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

export async function POST(req: NextRequest) {
  let engineConfig: {
    activeEngine: 'claude' | 'qwen'
    config: { apiKey: string; model: string; baseUrl: string }
  }
  let messages: ChatMessage[]
  let phase: SkillPhase
  let searchQuery: string | undefined

  try {
    const body = await req.json()
    messages = body.messages
    phase = body.phase
    engineConfig = body.engineConfig
    searchQuery = body.searchQuery
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

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

  const client = new OpenAI({
    apiKey: engineConfig.config.apiKey,
    baseURL: engineConfig.config.baseUrl || DEFAULT_BASE_URLS[engineConfig.activeEngine],
    defaultHeaders: engineConfig.activeEngine === 'claude'
      ? { 'anthropic-version': '2023-06-01' }
      : undefined,
  })

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  // 尝试创建流式连接
  let stream: ReturnType<typeof client.chat.completions.create> extends Promise<infer T> ? T : never
  try {
    stream = await client.chat.completions.create({
      model: engineConfig.config.model,
      messages: openaiMessages,
      stream: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '未知错误'
    // 返回 SSE 格式的错误，让客户端能正确显示
    const encoder = new TextEncoder()
    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `AI 连接失败: ${msg}` })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    return new Response(errorStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

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

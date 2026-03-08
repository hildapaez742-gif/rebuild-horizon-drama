import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { buildSystemPrompt } from '@/lib/skill-loader'
import { fetchAllHotLists, formatHotListForAI, serperSearch, formatSearchForAI } from '@/lib/search'
import type { SkillPhase, ChatMessage } from '@/lib/types'

const DEFAULT_BASE_URLS: Record<string, string> = {
  claude: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

function sseError(message: string): Response {
  console.error('[chat API error]', message)
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export async function POST(req: NextRequest) {
  // 1. 解析请求
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const messages = body.messages as ChatMessage[]
  const phase = body.phase as SkillPhase
  const searchQuery = body.searchQuery as string | undefined
  const engineConfig = body.engineConfig as {
    activeEngine: 'claude' | 'qwen'
    config: { apiKey: string; model: string; baseUrl: string }
  }

  if (!engineConfig?.config?.apiKey) {
    return sseError('未提供 API Key，请在设置页配置')
  }

  console.log('[chat] engine:', engineConfig.activeEngine, 'model:', engineConfig.config.model, 'baseUrl:', engineConfig.config.baseUrl || '(default)')

  // 2. 构建额外上下文
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
    } catch { /* 搜索失败降级 */ }
  }

  const systemPrompt = buildSystemPrompt(phase, extraContext || undefined)

  // 3. 创建 OpenAI 客户端
  const baseURL = engineConfig.config.baseUrl || DEFAULT_BASE_URLS[engineConfig.activeEngine]
  console.log('[chat] using baseURL:', baseURL)

  const client = new OpenAI({
    apiKey: engineConfig.config.apiKey,
    baseURL,
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

  // 4. 创建流式连接
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stream: any
  try {
    stream = await client.chat.completions.create({
      model: engineConfig.config.model,
      messages: openaiMessages,
      stream: true,
    })
    console.log('[chat] stream created successfully')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return sseError(`AI 连接失败: ${msg}`)
  }

  // 5. 流式输出
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let chunkCount = 0
      try {
        for await (const chunk of stream) {
          const text = chunk.choices?.[0]?.delta?.content || ''
          if (text) {
            chunkCount++
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        console.log('[chat] stream done, chunks:', chunkCount)
        if (chunkCount === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'AI 返回了空内容，请检查模型配置或重试' })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[chat] stream error:', msg)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `流式传输错误: ${msg}` })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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

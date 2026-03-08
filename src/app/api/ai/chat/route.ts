import { NextRequest, NextResponse } from 'next/server'
import { buildSystemPrompt } from '@/lib/skill-loader'
import { fetchAllHotLists, formatHotListForAI, serperSearch, formatSearchForAI } from '@/lib/search'
import type { SkillPhase, ChatMessage } from '@/lib/types'

const DEFAULT_BASE_URLS: Record<string, string> = {
  claude: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

// ═══════════════════════════════════════════
// SSE 工具函数
// ═══════════════════════════════════════════

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
}

/** 将多个 SSE 事件字符串包装为 Response */
function sseWrap(events: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const evt of events) controller.enqueue(encoder.encode(evt))
      controller.close()
    },
  })
  return new Response(stream, { headers: SSE_HEADERS })
}

/** 返回一条 SSE 错误事件 */
function sseError(message: string): Response {
  console.error('[chat API error]', message)
  return sseWrap([
    `data: ${JSON.stringify({ error: message })}\n\n`,
    'data: [DONE]\n\n',
  ])
}

/** 将完整文本包装为 SSE 事件流返回给前端 */
function sseFullText(text: string): Response {
  // 分段发送（每段约 200 字符），让前端看到渐进式渲染而不是一次性大段文字
  const events: string[] = []
  for (let i = 0; i < text.length; i += 200) {
    events.push(`data: ${JSON.stringify({ text: text.slice(i, i + 200) })}\n\n`)
  }
  events.push('data: [DONE]\n\n')
  return sseWrap(events)
}

// ═══════════════════════════════════════════
// 文本提取（兼容多种 API 格式）
// ═══════════════════════════════════════════

/**
 * 从流式 chunk 中提取文本
 * - OpenAI 标准:     choices[0].delta.content
 * - 部分代理:         choices[0].message.content
 * - Anthropic 原生:  delta.text / content_block.text
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromChunk(chunk: any): string {
  const deltaContent = chunk?.choices?.[0]?.delta?.content
  if (typeof deltaContent === 'string' && deltaContent) return deltaContent

  const msgContent = chunk?.choices?.[0]?.message?.content
  if (typeof msgContent === 'string' && msgContent) return msgContent

  const anthropicDelta = chunk?.delta?.text
  if (typeof anthropicDelta === 'string' && anthropicDelta) return anthropicDelta

  const blockText = chunk?.content_block?.text
  if (typeof blockText === 'string' && blockText) return blockText

  return ''
}

/**
 * 从非流式完整 JSON 响应中提取文本
 * - OpenAI:     { choices: [{ message: { content: "..." } }] }
 * - Anthropic:  { content: [{ type: "text", text: "..." }] }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromNonStream(data: any): string {
  // OpenAI 标准
  const choiceContent = data?.choices?.[0]?.message?.content
  if (typeof choiceContent === 'string' && choiceContent) return choiceContent

  // Anthropic Messages API
  if (Array.isArray(data?.content)) {
    const texts = data.content
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b: any) => b.text)
    if (texts.length > 0) return texts.join('')
  }

  // 兜底：尝试 data.text / data.response
  if (typeof data?.text === 'string' && data.text) return data.text
  if (typeof data?.response === 'string' && data.response) return data.response

  return ''
}

// ═══════════════════════════════════════════
// 主处理函数
// ═══════════════════════════════════════════

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
  const baseURL = engineConfig.config.baseUrl || DEFAULT_BASE_URLS[engineConfig.activeEngine]
  console.log('[chat] using baseURL:', baseURL)

  // 3. 构造 OpenAI 格式的消息体
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  // 4. 使用原生 fetch 发起请求（获取 Content-Type 控制权）
  let response: Response
  try {
    response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${engineConfig.config.apiKey}`,
      },
      body: JSON.stringify({
        model: engineConfig.config.model,
        messages: openaiMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      return sseError(`AI 连接失败: HTTP ${response.status} ${errBody.slice(0, 200)}`)
    }
  } catch (e) {
    return sseError(`AI 连接失败: ${e instanceof Error ? e.message : String(e)}`)
  }

  const contentType = response.headers.get('content-type') || ''
  console.log('[chat] response content-type:', contentType)

  // ─── 5a. 非流式 JSON 响应（中转服务器强制覆盖了 stream 参数）───
  if (contentType.includes('application/json')) {
    console.log('[chat] non-stream JSON response detected, falling back')
    try {
      const data = await response.json()

      // 检查是否是 API 错误
      if (data?.error) {
        const errMsg = typeof data.error === 'string'
          ? data.error
          : data.error?.message || JSON.stringify(data.error).slice(0, 200)
        return sseError(`AI 错误: ${errMsg}`)
      }

      const text = extractTextFromNonStream(data)
      if (!text) {
        return sseError(`AI 返回了空内容（非流式 JSON，顶层 keys: ${Object.keys(data).join(', ')}）`)
      }

      console.log('[chat] non-stream text extracted, length:', text.length)
      return sseFullText(text)
    } catch (e) {
      return sseError(`非流式响应解析失败: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ─── 5b. 标准流式 SSE 响应 ───
  console.log('[chat] processing as SSE stream')
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let chunkCount = 0
      let firstChunkRaw = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop()!

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data: ')) continue
            const payload = trimmed.slice(6)
            if (payload === '[DONE]') continue

            try {
              const chunk = JSON.parse(payload)
              if (chunkCount === 0) {
                firstChunkRaw = JSON.stringify(chunk).slice(0, 200)
                console.log('[chat] first SSE chunk:', firstChunkRaw)
              }
              const text = extractTextFromChunk(chunk)
              if (text) {
                chunkCount++
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
              }
            } catch { /* ignore SSE parse errors */ }
          }
        }

        console.log('[chat] stream done, textChunks:', chunkCount)
        if (chunkCount === 0) {
          const hint = firstChunkRaw
            ? `（首个 chunk: ${firstChunkRaw}）`
            : '（未收到有效 SSE 事件）'
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `AI 返回了空内容 ${hint}` })}\n\n`))
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

  return new Response(readable, { headers: SSE_HEADERS })
}

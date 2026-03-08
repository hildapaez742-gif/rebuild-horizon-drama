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

/**
 * 从 stream chunk 中提取文本，兼容多种 API 返回格式：
 * - OpenAI 标准: choices[0].delta.content
 * - 部分代理:    choices[0].message.content
 * - Anthropic 原生透传: delta.text / content_block.text
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromChunk(chunk: any): string {
  // Path 1: OpenAI standard streaming format
  const deltaContent = chunk?.choices?.[0]?.delta?.content
  if (typeof deltaContent === 'string' && deltaContent) return deltaContent

  // Path 2: Some proxies return message instead of delta
  const msgContent = chunk?.choices?.[0]?.message?.content
  if (typeof msgContent === 'string' && msgContent) return msgContent

  // Path 3: Anthropic native format (content_block_delta)
  const anthropicDelta = chunk?.delta?.text
  if (typeof anthropicDelta === 'string' && anthropicDelta) return anthropicDelta

  // Path 4: Anthropic content_block
  const blockText = chunk?.content_block?.text
  if (typeof blockText === 'string' && blockText) return blockText

  return ''
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
  //    注意：不注入 anthropic-version header —— 该头部仅适用于 Anthropic
  //    原生 Messages API，注入到 OAI 兼容 /chat/completions 会干扰响应格式
  const baseURL = engineConfig.config.baseUrl || DEFAULT_BASE_URLS[engineConfig.activeEngine]
  console.log('[chat] using baseURL:', baseURL)

  const client = new OpenAI({
    apiKey: engineConfig.config.apiKey,
    baseURL,
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
      max_tokens: 4096,
      temperature: 0.7,
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
      let totalChunksSeen = 0
      let firstChunkRaw = ''
      try {
        for await (const chunk of stream) {
          totalChunksSeen++
          // 记录前两个 chunk 结构用于诊断
          if (totalChunksSeen <= 2) {
            const raw = JSON.stringify(chunk).slice(0, 400)
            console.log(`[chat] chunk #${totalChunksSeen}:`, raw)
            if (totalChunksSeen === 1) firstChunkRaw = raw
          }
          const text = extractTextFromChunk(chunk)
          if (text) {
            chunkCount++
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
          }
        }
        console.log('[chat] stream done, totalChunks:', totalChunksSeen, 'textChunks:', chunkCount)
        if (chunkCount === 0) {
          // 将首个 chunk 结构包含在错误消息中，方便用户诊断 API 实际返回格式
          const hint = totalChunksSeen === 0
            ? '（API 返回了 0 个 chunk，可能端点不正确）'
            : `（收到 ${totalChunksSeen} 个 chunk 但均无文本，首个 chunk: ${firstChunkRaw.slice(0, 150)}）`
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

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

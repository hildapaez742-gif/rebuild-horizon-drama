import OpenAI from 'openai'
import type { AppConfig, ChatMessage } from './types'

const DEFAULT_BASE_URLS = {
  claude: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
} as const

function getClient(config: AppConfig['engines'][keyof AppConfig['engines']], engine: 'claude' | 'qwen') {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || DEFAULT_BASE_URLS[engine],
    defaultHeaders: engine === 'claude' ? { 'anthropic-version': '2023-06-01' } : undefined,
  })
}

export async function aiChat(
  messages: ChatMessage[],
  systemPrompt: string,
  engineConfig: {
    activeEngine: 'claude' | 'qwen'
    config: AppConfig['engines'][keyof AppConfig['engines']]
  },
  stream = true,
) {
  const client = getClient(engineConfig.config, engineConfig.activeEngine)

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  return client.chat.completions.create({
    model: engineConfig.config.model,
    messages: openaiMessages,
    stream,
  })
}

export async function testConnection(
  engine: 'claude' | 'qwen',
  config: AppConfig['engines'][keyof AppConfig['engines']],
): Promise<{ success: boolean; message: string }> {
  try {
    const client = getClient(config, engine)
    const res = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
      max_tokens: 20,
      stream: false,
    })
    const text = res.choices?.[0]?.message?.content || ''
    return { success: true, message: `连接成功：${text.slice(0, 50)}` }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误'
    return { success: false, message: msg }
  }
}

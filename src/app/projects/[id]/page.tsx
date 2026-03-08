'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Project, ChatMessage, SkillPhase, Episode, AppConfig } from '@/lib/types'

// ─── Color Tokens ───
const C = {
  bg: '#0A0A0F',
  surface: '#12121A',
  border: '#1E1E2E',
  text: '#E8E8F0',
  textSec: '#6B6B8A',
  brand: '#C8A96E',
  aiBlue: '#3D7EFF',
  danger: '#FF4D6D',
  success: '#2DD4A0',
  orange: '#FF9F43',
  yellow: '#FFD93D',
  grey: '#6B7280',
}

// ─── Phase Definitions ───
const PHASES: { key: SkillPhase; label: string }[] = [
  { key: 'topic', label: '选题' },
  { key: 'icebreak', label: '破冰' },
  { key: 'track', label: '赛道' },
  { key: 'character', label: '人物' },
  { key: 'outline', label: '大纲' },
  { key: 'writing', label: '写作' },
  { key: 'audit', label: '审核' },
  { key: 'export', label: '导出' },
]

// ─── Phase Inference ───
function inferPhase(status: string, messageCount: number): SkillPhase {
  if (status === 'topic') return 'topic'
  if (status === 'creating') {
    if (messageCount <= 2) return 'icebreak'
    if (messageCount <= 6) return 'track'
    if (messageCount <= 12) return 'character'
    return 'outline'
  }
  if (status === 'writing') return 'writing'
  if (status === 'done') return 'export'
  return 'icebreak'
}

// ─── Audit Level Colors ───
const AUDIT_LEVEL_COLORS: Record<string, string> = {
  red: C.danger,
  orange: C.orange,
  yellow: C.yellow,
  blue: C.aiBlue,
  grey: C.grey,
}

const AUDIT_LEVEL_LABELS: Record<string, string> = {
  red: '严重',
  orange: '警告',
  yellow: '注意',
  blue: '建议',
  grey: '信息',
}

// ─── Typing Animation Dots ───
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <span className="animate-bounce" style={{ animationDelay: '0ms', width: 4, height: 4, borderRadius: '50%', display: 'inline-block', backgroundColor: C.aiBlue }} />
      <span className="animate-bounce" style={{ animationDelay: '150ms', width: 4, height: 4, borderRadius: '50%', display: 'inline-block', backgroundColor: C.aiBlue }} />
      <span className="animate-bounce" style={{ animationDelay: '300ms', width: 4, height: 4, borderRadius: '50%', display: 'inline-block', backgroundColor: C.aiBlue }} />
    </span>
  )
}

// ═══════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════
export default function ProjectWorkbench() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // ─── State ───
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Tabs
  const [centerTab, setCenterTab] = useState<'chat' | 'script'>('chat')
  const [rightTab, setRightTab] = useState<'outline' | 'characters' | 'consistency' | 'audit'>('outline')
  const [rightCollapsed, setRightCollapsed] = useState(false)

  // Script
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState(0)

  // Save indicator
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveStatus, setSaveStatus] = useState('已保存')

  // ─── Load Project ───
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (error || !data) {
        setLoading(false)
        return
      }

      const proj = data as Project
      setProject(proj)
      setProjectName(proj.name)
      setMessages(proj.messages || [])
      setLoading(false)
    }
    load()
  }, [projectId])

  // ─── Load Episodes ───
  useEffect(() => {
    async function loadEpisodes() {
      const { data } = await supabase
        .from('episodes')
        .select('*')
        .eq('project_id', projectId)
        .order('index', { ascending: true })

      if (data) setEpisodes(data as Episode[])
    }
    loadEpisodes()
  }, [projectId])

  // ─── Scroll to bottom on new message ───
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // ─── Auto-grow textarea ───
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px'
    }
  }, [inputText])

  // ─── Phase ───
  const currentPhase = project ? inferPhase(project.status, messages.length) : 'icebreak'
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === currentPhase)

  // ─── Save Messages to Supabase ───
  const saveMessages = useCallback(
    async (msgs: ChatMessage[]) => {
      setSaveStatus('保存中...')
      const { error } = await supabase
        .from('projects')
        .update({ messages: msgs, updated_at: new Date().toISOString() })
        .eq('id', projectId)

      if (!error) {
        setLastSaved(new Date())
        setSaveStatus('已保存')
      } else {
        setSaveStatus('保存失败')
      }
    },
    [projectId],
  )

  // ─── Save Project Name ───
  const saveProjectName = async () => {
    setIsEditingName(false)
    if (!projectName.trim() || projectName === project?.name) return
    await supabase
      .from('projects')
      .update({ name: projectName.trim(), updated_at: new Date().toISOString() })
      .eq('id', projectId)
    setProject((prev) => (prev ? { ...prev, name: projectName.trim() } : prev))
  }

  // ─── Engine Config from localStorage ───
  const getEngineConfig = () => {
    try {
      const raw = localStorage.getItem('drama-settings')
      if (!raw) return null
      const config: AppConfig = JSON.parse(raw)
      const engineKey = config.activeEngine || 'qwen'
      return {
        activeEngine: engineKey,
        config: config.engines[engineKey],
      }
    } catch {
      return null
    }
  }

  // ─── Send Message (core logic, supports phase override) ───
  const sendMessage = useCallback(async (text: string, overridePhase?: SkillPhase) => {
    if (!text || isStreaming) return

    const engineConfig = getEngineConfig()
    if (!engineConfig) {
      alert('请先在设置页配置 AI 引擎')
      return
    }

    const usePhase = overridePhase || currentPhase

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      skill: usePhase,
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setIsStreaming(true)
    setStreamingContent('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          phase: usePhase,
          engineConfig,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6)
          if (payload === '[DONE]') continue

          try {
            const parsed = JSON.parse(payload)
            if (parsed.error) {
              accumulated += `\n\n[Error: ${parsed.error}]`
              setStreamingContent(accumulated)
              continue
            }
            if (parsed.text) {
              accumulated += parsed.text
              setStreamingContent(accumulated)
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: accumulated,
        timestamp: new Date().toISOString(),
        skill: usePhase,
      }

      const finalMessages = [...updatedMessages, assistantMsg]
      setMessages(finalMessages)
      setStreamingContent('')
      await saveMessages(finalMessages)
    } catch (e) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `[连接错误] ${e instanceof Error ? e.message : '未知错误'}，请检查 AI 引擎配置后重试。`,
        timestamp: new Date().toISOString(),
      }
      const finalMessages = [...updatedMessages, errorMsg]
      setMessages(finalMessages)
      setStreamingContent('')
      await saveMessages(finalMessages)
    } finally {
      setIsStreaming(false)
    }
  }, [isStreaming, messages, currentPhase, saveMessages])

  // ─── Send from Input Box ───
  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return
    setInputText('')
    await sendMessage(text)
  }

  // ─── Time formatting ───
  const formatSaveTime = () => {
    if (!lastSaved) return '刚刚'
    const diff = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
    if (diff < 10) return '刚刚'
    if (diff < 60) return `${diff}秒前`
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    return `${Math.floor(diff / 3600)}小时前`
  }

  // ─── Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: C.bg }}>
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: `${C.brand} transparent transparent transparent` }}
          />
          <span style={{ color: C.textSec }}>加载项目中...</span>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: C.bg }}>
        <div className="text-center">
          <p style={{ color: C.danger }} className="text-lg mb-4">
            项目不存在或加载失败
          </p>
          <button
            onClick={() => router.push('/projects')}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ backgroundColor: C.surface, color: C.text, border: `1px solid ${C.border}` }}
          >
            返回项目列表
          </button>
        </div>
      </div>
    )
  }

  const selectedEpisode = episodes[selectedEpisodeIndex] || null

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: C.bg, color: C.text }}>
      {/* ═══════ LEFT COLUMN ═══════ */}
      <aside
        className="flex flex-col w-52 flex-shrink-0 border-r overflow-y-auto"
        style={{ borderColor: C.border, backgroundColor: C.surface }}
      >
        {/* Project Name */}
        <div className="p-4 border-b" style={{ borderColor: C.border }}>
          {isEditingName ? (
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={saveProjectName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProjectName()
                if (e.key === 'Escape') {
                  setProjectName(project.name)
                  setIsEditingName(false)
                }
              }}
              className="w-full bg-transparent text-sm font-semibold outline-none px-2 py-1 rounded"
              style={{ color: C.text, border: `1px solid ${C.brand}` }}
            />
          ) : (
            <h2
              className="text-sm font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity"
              style={{ color: C.brand }}
              onClick={() => setIsEditingName(true)}
              title="点击编辑项目名"
            >
              {project.name}
            </h2>
          )}
          <p className="text-xs mt-1" style={{ color: C.textSec }}>
            {project.target_platform === 'all' ? '全平台' : project.target_platform}
          </p>
        </div>

        {/* Phase Stepper */}
        <div className="flex-1 p-3">
          <p className="text-xs font-medium mb-3" style={{ color: C.textSec }}>
            创作阶段
          </p>
          <div className="space-y-1">
            {PHASES.map((phase, i) => {
              const isActive = phase.key === currentPhase
              const isPast = i < currentPhaseIndex
              return (
                <div key={phase.key} className="flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors">
                  {/* Step indicator */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: isActive ? C.brand : isPast ? `${C.success}22` : `${C.textSec}22`,
                      color: isActive ? '#0A0A0F' : isPast ? C.success : C.textSec,
                      border: isActive ? `2px solid ${C.brand}` : isPast ? `2px solid ${C.success}44` : 'none',
                    }}
                  >
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span
                    className="text-xs"
                    style={{
                      color: isActive ? C.brand : isPast ? C.success : C.textSec,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {phase.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Connecting line between steps (visual) */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium mb-2" style={{ color: C.textSec }}>
              工具
            </p>

            <ToolButton emoji="🔥" label="热点雷达" onClick={() => {
              setCenterTab('chat')
              if (!isStreaming) sendMessage('🔥 启动热点雷达：请扫描当前全网热点趋势，分析赛道温度，给出AI短剧选题建议。', 'topic')
            }} />
            <ToolButton emoji="📊" label="爆款分析" onClick={() => {
              setCenterTab('chat')
              if (!isStreaming) sendMessage('📊 启动爆款分析：请解构当前短剧爆款作品，分析赛道趋势，评估AI漫剧借鉴价值。', 'hit-analysis')
            }} />
            <ToolButton emoji="🔍" label="审核扫描" onClick={() => {
              setRightTab('audit')
              setRightCollapsed(false)
            }} />
          </div>
        </div>

        {/* Back link */}
        <div className="p-3 border-t" style={{ borderColor: C.border }}>
          <button
            onClick={() => router.push('/projects')}
            className="flex items-center gap-2 text-xs w-full py-2 px-3 rounded-md transition-colors hover:opacity-80"
            style={{ color: C.textSec }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            返回项目列表
          </button>
        </div>
      </aside>

      {/* ═══════ CENTER COLUMN ═══════ */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div
          className="flex items-center justify-between px-4 h-11 border-b flex-shrink-0"
          style={{ borderColor: C.border, backgroundColor: C.surface }}
        >
          {/* Tab Bar */}
          <div className="flex gap-1">
            <TabButton
              active={centerTab === 'chat'}
              onClick={() => setCenterTab('chat')}
              label="💬 对话"
            />
            <TabButton
              active={centerTab === 'script'}
              onClick={() => setCenterTab('script')}
              label="📝 剧本"
            />
          </div>

          {/* Save Indicator */}
          <div className="flex items-center gap-2 text-xs" style={{ color: C.textSec }}>
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: saveStatus === '已保存' ? C.success : saveStatus === '保存失败' ? C.danger : C.yellow }}
            />
            {saveStatus} · {formatSaveTime()}
          </div>
        </div>

        {/* Content Area */}
        {centerTab === 'chat' ? (
          /* ─── Chat View ─── */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-60">
                  <div className="text-4xl">✨</div>
                  <p className="text-sm" style={{ color: C.textSec }}>
                    开始与 AI 对话，创作你的短剧
                  </p>
                  <p className="text-xs" style={{ color: C.textSec }}>
                    当前阶段: {PHASES.find((p) => p.key === currentPhase)?.label || currentPhase}
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}

              {/* Streaming message */}
              {isStreaming && (
                <div className="flex justify-start">
                  <div
                    className="max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed"
                    style={{
                      backgroundColor: C.surface,
                      borderLeft: `3px solid ${C.aiBlue}`,
                    }}
                  >
                    {streamingContent ? (
                      <div className="whitespace-pre-wrap">{streamingContent}</div>
                    ) : (
                      <div className="flex items-center gap-2" style={{ color: C.textSec }}>
                        AI 正在思考 <TypingDots />
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 p-4 border-t" style={{ borderColor: C.border }}>
              <div
                className="flex items-end gap-2 rounded-xl p-2"
                style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
              >
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={`当前阶段: ${PHASES.find((p) => p.key === currentPhase)?.label || ''}  ·  输入你的想法...`}
                  rows={1}
                  disabled={isStreaming}
                  className="flex-1 bg-transparent resize-none outline-none text-sm px-2 py-1.5"
                  style={{
                    color: C.text,
                    maxHeight: 160,
                    minHeight: 36,
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isStreaming || !inputText.trim()}
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: !inputText.trim() || isStreaming ? `${C.brand}44` : C.brand,
                    color: '#0A0A0F',
                    cursor: !inputText.trim() || isStreaming ? 'not-allowed' : 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ─── Script View ─── */
          <div className="flex-1 flex min-h-0">
            {/* Episode List */}
            <div
              className="w-48 border-r overflow-y-auto flex-shrink-0"
              style={{ borderColor: C.border }}
            >
              <div className="p-3">
                <p className="text-xs font-medium mb-2" style={{ color: C.textSec }}>
                  集数列表 ({episodes.length})
                </p>
                {episodes.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: C.textSec }}>
                    尚未生成剧本
                  </p>
                ) : (
                  <div className="space-y-1">
                    {episodes.map((ep, i) => (
                      <button
                        key={ep.id}
                        onClick={() => setSelectedEpisodeIndex(i)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs transition-colors"
                        style={{
                          backgroundColor: i === selectedEpisodeIndex ? `${C.brand}22` : 'transparent',
                          color: i === selectedEpisodeIndex ? C.brand : C.text,
                          border: i === selectedEpisodeIndex ? `1px solid ${C.brand}44` : '1px solid transparent',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span>第 {ep.index} 集</span>
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor:
                                ep.status === 'edited' ? C.success : ep.status === 'generated' ? C.aiBlue : C.textSec,
                            }}
                          />
                        </div>
                        {ep.hook_type && (
                          <span className="text-xs mt-0.5 block" style={{ color: C.textSec }}>
                            {ep.hook_type}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedEpisode ? (
                <>
                  <div
                    className="flex items-center justify-between px-4 h-10 border-b flex-shrink-0"
                    style={{ borderColor: C.border }}
                  >
                    <span className="text-sm font-medium">
                      第 {selectedEpisode.index} 集
                    </span>
                    <div className="flex items-center gap-3">
                      {selectedEpisode.consistency_score > 0 && (
                        <span className="text-xs" style={{ color: C.success }}>
                          一致性 {selectedEpisode.consistency_score}%
                        </span>
                      )}
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor:
                            selectedEpisode.status === 'edited'
                              ? `${C.success}22`
                              : selectedEpisode.status === 'generated'
                                ? `${C.aiBlue}22`
                                : `${C.textSec}22`,
                          color:
                            selectedEpisode.status === 'edited'
                              ? C.success
                              : selectedEpisode.status === 'generated'
                                ? C.aiBlue
                                : C.textSec,
                        }}
                      >
                        {selectedEpisode.status === 'edited' ? '已编辑' : selectedEpisode.status === 'generated' ? '已生成' : '待生成'}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <pre
                      className="whitespace-pre-wrap text-sm leading-relaxed font-mono"
                      style={{ color: C.text, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {selectedEpisode.content || '(内容为空)'}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm" style={{ color: C.textSec }}>
                    选择一集查看剧本内容，或在对话中生成剧本
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ═══════ RIGHT COLUMN ═══════ */}
      {/* Collapse Toggle */}
      <button
        onClick={() => setRightCollapsed(!rightCollapsed)}
        className="flex-shrink-0 w-5 flex items-center justify-center border-l border-r transition-colors hover:opacity-80"
        style={{
          borderColor: C.border,
          backgroundColor: C.surface,
          color: C.textSec,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ transform: rightCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {!rightCollapsed && (
        <aside
          className="w-80 flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{ borderColor: C.border, backgroundColor: C.surface }}
        >
          {/* Right Tab Bar */}
          <div
            className="flex border-b flex-shrink-0"
            style={{ borderColor: C.border }}
          >
            {([
              { key: 'outline' as const, label: '大纲' },
              { key: 'characters' as const, label: '人物' },
              { key: 'consistency' as const, label: '一致性' },
              { key: 'audit' as const, label: '审核' },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRightTab(tab.key)}
                className="flex-1 py-2.5 text-xs font-medium transition-colors"
                style={{
                  color: rightTab === tab.key ? C.brand : C.textSec,
                  borderBottom: rightTab === tab.key ? `2px solid ${C.brand}` : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {rightTab === 'outline' && (
              <OutlinePanel
                outline={project.outline}
                episodes={episodes}
              />
            )}
            {rightTab === 'characters' && (
              <CharactersPanel characters={project.outline?.characters || []} />
            )}
            {rightTab === 'consistency' && (
              <ConsistencyPanel episodes={episodes} />
            )}
            {rightTab === 'audit' && (
              <AuditPanel episodes={episodes} />
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// Sub-Components
// ═══════════════════════════════════════════

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
      style={{
        backgroundColor: active ? `${C.brand}22` : 'transparent',
        color: active ? C.brand : C.textSec,
      }}
    >
      {label}
    </button>
  )
}

function ToolButton({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
      style={{ backgroundColor: `${C.border}88`, color: C.text }}
    >
      <span>{emoji}</span>
      {label}
    </button>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed"
        style={{
          backgroundColor: isUser ? '#1A1A2E' : C.surface,
          borderLeft: isUser ? 'none' : `3px solid ${C.aiBlue}`,
          borderTopRightRadius: isUser ? 4 : 12,
          borderTopLeftRadius: isUser ? 12 : 4,
        }}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {message.timestamp && (
          <div className="mt-2 text-right" style={{ color: C.textSec, fontSize: 10 }}>
            {new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Outline Panel ───
function OutlinePanel({
  outline,
  episodes,
}: {
  outline: Project['outline']
  episodes: Episode[]
}) {
  if (!outline) {
    return (
      <p className="text-xs text-center py-8" style={{ color: C.textSec }}>
        尚未生成大纲，请在对话中完成大纲阶段
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Characters Summary */}
      <Section title="角色">
        {outline.characters.length === 0 ? (
          <EmptyHint text="尚无角色" />
        ) : (
          <div className="space-y-1.5">
            {outline.characters.map((ch, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                style={{ backgroundColor: `${C.border}66` }}
              >
                <span style={{ color: C.brand }}>●</span>
                <span style={{ color: C.text }}>{ch.name}</span>
                <span style={{ color: C.textSec }}>— {ch.role}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Emotion Wave */}
      <Section title="情绪波浪">
        {outline.emotion_wave.length === 0 ? (
          <EmptyHint text="尚无数据" />
        ) : (
          <div className="flex items-end gap-1 h-16 px-1">
            {outline.emotion_wave.map((val, i) => (
              <div
                key={i}
                className="flex-1 rounded-t transition-all"
                style={{
                  height: `${(val / 10) * 100}%`,
                  backgroundColor: val >= 8 ? C.danger : val >= 5 ? C.brand : C.aiBlue,
                  opacity: 0.7,
                }}
                title={`第${i + 1}集: ${val}/10`}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Payment Hooks */}
      <Section title="付费钩子">
        {outline.payment_hooks.length === 0 ? (
          <EmptyHint text="尚无钩子" />
        ) : (
          <div className="space-y-1.5">
            {outline.payment_hooks.map((hook, i) => (
              <div key={i} className="text-xs px-2 py-1.5 rounded-md" style={{ backgroundColor: `${C.border}66` }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: C.brand }}>E{hook.episode}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-xs"
                    style={{ backgroundColor: `${C.brand}22`, color: C.brand, fontSize: 10 }}
                  >
                    {hook.type}
                  </span>
                </div>
                <p className="mt-1" style={{ color: C.textSec }}>
                  {hook.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Twists */}
      <Section title="反转点">
        {outline.twists.length === 0 ? (
          <EmptyHint text="尚无反转" />
        ) : (
          <div className="space-y-1.5">
            {outline.twists.map((tw, i) => (
              <div key={i} className="text-xs px-2 py-1.5 rounded-md" style={{ backgroundColor: `${C.border}66` }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: C.brand }}>E{tw.episode}</span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: tw.intensity }).map((_, j) => (
                      <span key={j} style={{ color: C.danger, fontSize: 8 }}>●</span>
                    ))}
                  </div>
                </div>
                <p className="mt-1" style={{ color: C.textSec }}>
                  {tw.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Episode Progress */}
      <Section title="集数进度">
        {episodes.length === 0 ? (
          <EmptyHint text="尚无集数" />
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="aspect-square rounded flex items-center justify-center text-xs"
                style={{
                  backgroundColor:
                    ep.status === 'edited' ? `${C.success}33` : ep.status === 'generated' ? `${C.aiBlue}33` : `${C.textSec}22`,
                  color:
                    ep.status === 'edited' ? C.success : ep.status === 'generated' ? C.aiBlue : C.textSec,
                  fontSize: 10,
                }}
                title={`第${ep.index}集 - ${ep.status}`}
              >
                {ep.index}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Characters Panel ───
function CharactersPanel({ characters }: { characters: Project['outline']['characters'] }) {
  if (!characters || characters.length === 0) {
    return (
      <p className="text-xs text-center py-8" style={{ color: C.textSec }}>
        尚无角色数据，请在对话中完成人物设计
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {characters.map((ch, i) => (
        <div
          key={i}
          className="rounded-xl p-3 space-y-2"
          style={{ backgroundColor: `${C.border}66`, border: `1px solid ${C.border}` }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: C.brand }}>
              {ch.name}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${C.aiBlue}22`, color: C.aiBlue }}>
              {ch.role}
            </span>
          </div>

          {/* Identity */}
          <div className="text-xs space-y-1">
            <InfoRow label="表面身份" value={ch.surface_identity} />
            <InfoRow label="真实身份" value={ch.real_identity} />
            <InfoRow label="动机" value={ch.motivation} />
            <InfoRow label="说话风格" value={ch.speech_style} />
          </div>

          {/* Tags */}
          {ch.personality_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ch.personality_tags.map((tag, j) => (
                <span
                  key={j}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${C.brand}18`, color: C.brand, fontSize: 10 }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* DNA Card */}
          {ch.dna && (
            <div
              className="rounded-lg p-2 space-y-1"
              style={{ backgroundColor: `${C.bg}88`, border: `1px dashed ${C.aiBlue}44` }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: C.aiBlue }}>
                DNA 指纹
              </p>
              <InfoRow label="节奏" value={ch.dna.tempo} />
              <InfoRow label="词汇量" value={ch.dna.vocabulary_level} />
              <InfoRow label="情绪外露" value={ch.dna.emotion_exposure} />
              <InfoRow label="口头禅" value={ch.dna.verbal_habit} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Consistency Panel ───
function ConsistencyPanel({ episodes }: { episodes: Episode[] }) {
  const scoredEpisodes = episodes.filter((e) => e.consistency_score > 0)
  const avgScore =
    scoredEpisodes.length > 0
      ? Math.round(scoredEpisodes.reduce((sum, e) => sum + e.consistency_score, 0) / scoredEpisodes.length)
      : 0

  // Detect drift: episodes where score drops below 80
  const driftWarnings = scoredEpisodes.filter((e) => e.consistency_score < 80)

  return (
    <div className="space-y-5">
      {/* Overall Score */}
      <div className="text-center py-4">
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-2"
          style={{
            border: `3px solid ${avgScore >= 90 ? C.success : avgScore >= 70 ? C.brand : C.danger}`,
            backgroundColor: `${avgScore >= 90 ? C.success : avgScore >= 70 ? C.brand : C.danger}11`,
          }}
        >
          <span
            className="text-2xl font-bold"
            style={{ color: avgScore >= 90 ? C.success : avgScore >= 70 ? C.brand : C.danger }}
          >
            {avgScore || '--'}
          </span>
        </div>
        <p className="text-xs" style={{ color: C.textSec }}>
          整体一致性评分
        </p>
      </div>

      {/* Per-Episode Scores */}
      <Section title="各集评分">
        {scoredEpisodes.length === 0 ? (
          <EmptyHint text="尚无一致性评分数据" />
        ) : (
          <div className="space-y-1.5">
            {scoredEpisodes.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-md text-xs"
                style={{ backgroundColor: `${C.border}66` }}
              >
                <span>第 {ep.index} 集</span>
                <span
                  style={{
                    color: ep.consistency_score >= 90 ? C.success : ep.consistency_score >= 70 ? C.brand : C.danger,
                    fontWeight: 600,
                  }}
                >
                  {ep.consistency_score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Drift Warnings */}
      <Section title="漂移警告">
        {driftWarnings.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-3 rounded-md text-xs" style={{ backgroundColor: `${C.success}11` }}>
            <span style={{ color: C.success }}>✓</span>
            <span style={{ color: C.success }}>无角色漂移检测</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {driftWarnings.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs"
                style={{ backgroundColor: `${C.danger}11`, border: `1px solid ${C.danger}33` }}
              >
                <span style={{ color: C.danger }}>⚠</span>
                <span style={{ color: C.text }}>
                  第 {ep.index} 集 — 一致性 {ep.consistency_score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ─── Audit Panel ───
function AuditPanel({ episodes }: { episodes: Episode[] }) {
  const allFlags = episodes.flatMap((ep) =>
    (ep.audit_flags || []).map((f) => ({ ...f, episodeIndex: ep.index })),
  )

  const grouped = allFlags.reduce(
    (acc, flag) => {
      const level = flag.level || 'grey'
      if (!acc[level]) acc[level] = []
      acc[level].push(flag)
      return acc
    },
    {} as Record<string, typeof allFlags>,
  )

  const levelOrder: string[] = ['red', 'orange', 'yellow', 'blue', 'grey']

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        {levelOrder.map((level) => {
          const count = grouped[level]?.length || 0
          return (
            <div key={level} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: AUDIT_LEVEL_COLORS[level] }}
              />
              <span style={{ color: C.textSec }}>
                {AUDIT_LEVEL_LABELS[level]} {count}
              </span>
            </div>
          )
        })}
      </div>

      {allFlags.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: C.textSec }}>
            尚无审核数据
          </p>
          <p className="text-xs mt-1" style={{ color: C.textSec }}>
            完成剧本生成后可进行审核扫描
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {levelOrder.map((level) => {
            const flags = grouped[level]
            if (!flags || flags.length === 0) return null
            return (
              <div key={level} className="space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: AUDIT_LEVEL_COLORS[level] }}>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: AUDIT_LEVEL_COLORS[level] }}
                  />
                  {AUDIT_LEVEL_LABELS[level]} ({flags.length})
                </p>
                {flags.map((flag, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-2 text-xs space-y-1"
                    style={{
                      backgroundColor: `${AUDIT_LEVEL_COLORS[level]}11`,
                      border: `1px solid ${AUDIT_LEVEL_COLORS[level]}33`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ color: C.text }}>E{flag.episodeIndex}</span>
                      <span style={{ color: C.textSec }}>{flag.location}</span>
                    </div>
                    <p style={{ color: C.text }}>{flag.reason}</p>
                    {flag.original && (
                      <p style={{ color: C.textSec }}>
                        原文: &quot;{flag.original}&quot;
                      </p>
                    )}
                    {flag.suggestion && (
                      <p style={{ color: C.success }}>
                        建议: {flag.suggestion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Shared Sub-Components ───
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: C.textSec }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0" style={{ color: C.textSec }}>
        {label}:
      </span>
      <span style={{ color: C.text }}>{value}</span>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="text-xs py-2 text-center" style={{ color: C.textSec }}>
      {text}
    </p>
  )
}

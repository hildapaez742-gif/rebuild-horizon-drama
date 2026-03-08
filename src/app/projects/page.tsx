'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Project, ProjectStatus } from '@/lib/types'

const STATUS_MAP: Record<ProjectStatus, { label: string; color: string; bg: string }> = {
  topic:    { label: '选题中', color: '#C8A96E', bg: 'rgba(200,169,110,0.15)' },
  creating: { label: '创作中', color: '#3D7EFF', bg: 'rgba(61,126,255,0.15)' },
  writing:  { label: '写作中', color: '#2DD4A0', bg: 'rgba(45,212,160,0.15)' },
  done:     { label: '已完成', color: '#6B6B8A', bg: 'rgba(107,107,138,0.15)' },
}

const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  wechat: '微信',
  all: '全平台',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  return d.toLocaleDateString('zh-CN')
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const getUserId = useCallback((): string => {
    try {
      const raw = localStorage.getItem('drama-settings')
      if (raw) {
        const cfg = JSON.parse(raw)
        if (cfg.userName) return cfg.userName
      }
    } catch { /* ignore */ }
    return 'default-user'
  }, [])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    const userId = getUserId()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (!error && data) {
      setProjects(data as Project[])
    }
    setLoading(false)
  }, [getUserId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    const userId = getUserId()

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name,
        status: 'topic' as ProjectStatus,
        target_platform: 'douyin',
        context: {},
        outline: { characters: [], emotion_wave: [], payment_hooks: [], twists: [], confirmed: false },
        messages: [],
      })
      .select()
      .single()

    setCreating(false)
    if (!error && data) {
      setShowDialog(false)
      setNewName('')
      router.push(`/projects/${data.id}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#E8E8F0]">
      {/* Header */}
      <header className="border-b border-[#1E1E2E] px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-wide">
              重建地平线<span className="text-[#C8A96E]">·</span>短剧编剧台
            </h1>
            <p className="mt-1 text-sm text-[#6B6B8A]">AI 驱动的短剧创作工作台</p>
          </div>
          <button
            onClick={() => router.push('/settings')}
            className="rounded-lg border border-[#1E1E2E] p-2.5 text-[#6B6B8A] transition-colors hover:border-[#C8A96E] hover:text-[#C8A96E]"
            title="设置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Action bar */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#6B6B8A]">我的项目</h2>
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-lg bg-[#C8A96E] px-5 py-2.5 text-sm font-semibold text-[#0A0A0F] transition-opacity hover:opacity-90"
          >
            + 新建项目
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1E1E2E] border-t-[#C8A96E]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-4 rounded-full bg-[#12121A] p-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6B6B8A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M12 18v-6" />
                <path d="M9 15h6" />
              </svg>
            </div>
            <p className="text-[#6B6B8A]">还没有项目，点击上方按钮开始创作</p>
          </div>
        )}

        {/* Project grid */}
        {!loading && projects.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const status = STATUS_MAP[project.status] || STATUS_MAP.topic
              return (
                <button
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="group rounded-xl border border-[#1E1E2E] bg-[#12121A] p-5 text-left transition-all hover:border-[#C8A96E]/40 hover:shadow-lg hover:shadow-[#C8A96E]/5"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="text-base font-semibold leading-snug text-[#E8E8F0] group-hover:text-[#C8A96E] transition-colors line-clamp-2">
                      {project.name}
                    </h3>
                    <span
                      className="ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ color: status.color, backgroundColor: status.bg }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#6B6B8A]">
                    <span>{PLATFORM_LABELS[project.target_platform] || project.target_platform}</span>
                    <span>{formatTime(project.updated_at)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* New project dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1E1E2E] bg-[#12121A] p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-semibold text-[#E8E8F0]">新建短剧项目</h3>
            <p className="mb-5 text-sm text-[#6B6B8A]">为你的新短剧起一个名字</p>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="例如：逆袭人生、重生之路..."
              autoFocus
              className="mb-5 w-full rounded-lg border border-[#1E1E2E] bg-[#0A0A0F] px-4 py-3 text-sm text-[#E8E8F0] placeholder-[#6B6B8A]/50 outline-none transition-colors focus:border-[#C8A96E]"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowDialog(false); setNewName('') }}
                className="rounded-lg border border-[#1E1E2E] px-4 py-2 text-sm text-[#6B6B8A] transition-colors hover:border-[#6B6B8A] hover:text-[#E8E8F0]"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                className="rounded-lg bg-[#C8A96E] px-5 py-2 text-sm font-semibold text-[#0A0A0F] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? '创建中...' : '创建项目'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Project, Episode, Materials } from '@/lib/types'

export default function ExportPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [materials, setMaterials] = useState<Materials | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('projects').select('*').eq('id', id).single().then(({ data }) => {
      if (data) setProject(data as unknown as Project)
    })
    supabase.from('episodes').select('*').eq('project_id', id).order('index').then(({ data }) => {
      if (data) setEpisodes(data as unknown as Episode[])
    })
    supabase.from('materials').select('*').eq('project_id', id).single().then(({ data }) => {
      if (data) setMaterials(data as unknown as Materials)
    })
  }, [id])

  function generateMarkdown(): string {
    if (!project) return ''
    let md = `# ${project.name}\n\n`
    md += `> 目标平台：${project.target_platform} | 状态：${project.status}\n\n`

    if (project.outline?.characters?.length) {
      md += `## 角色表\n\n`
      project.outline.characters.forEach((c) => {
        md += `### ${c.name}（${c.role}）\n`
        md += `- 表面身份：${c.surface_identity}\n`
        md += `- 真实身份：${c.real_identity}\n`
        md += `- 动机：${c.motivation}\n`
        md += `- 性格标签：${c.personality_tags?.join('、') || ''}\n\n`
      })
    }

    if (episodes.length) {
      md += `## 剧本\n\n`
      episodes.forEach((ep) => {
        md += `### 第 ${ep.index} 集\n\n`
        md += ep.content || '（未生成）'
        md += '\n\n---\n\n'
      })
    }

    return md
  }

  function generateMaterialsPack(): string {
    if (!materials) return '（暂无物料数据）'
    let text = `【${project?.name || '未命名'}】发布物料包\n\n`

    if (materials.titles?.length) {
      text += `## 剧名方案\n`
      materials.titles.forEach((t, i) => {
        text += `${i + 1}. ${t.name}（${t.type}）\n   传播逻辑：${t.logic}\n   适合平台：${t.platform}\n\n`
      })
    }

    if (materials.synopsis && Object.keys(materials.synopsis).length) {
      text += `## 平台简介\n`
      Object.entries(materials.synopsis).forEach(([platform, content]) => {
        text += `【${platform}】\n${content}\n\n`
      })
    }

    if (materials.episode_titles?.length) {
      text += `## 每集标题\n`
      materials.episode_titles.forEach((t, i) => {
        text += `第${i + 1}集：${t}\n`
      })
      text += '\n'
    }

    if (materials.promo_copies && Object.keys(materials.promo_copies).length) {
      text += `## 推广文案\n`
      Object.entries(materials.promo_copies).forEach(([type, content]) => {
        text += `【${type}】\n${content}\n\n`
      })
    }

    return text
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportAll() {
    setExporting(true)
    try {
      const name = project?.name || '未命名'
      download(generateMarkdown(), `${name}_剧本.md`)
      if (materials) {
        download(generateMaterialsPack(), `${name}_物料包.txt`)
      }
    } finally {
      setExporting(false)
    }
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F]">
        <p className="text-[#6B6B8A]">加载中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] p-8">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => router.push(`/projects/${id}`)} className="mb-6 text-[#6B6B8A] hover:text-[#C8A96E]">
          ← 返回工作台
        </button>

        <h1 className="mb-2 font-serif text-2xl text-[#E8E8F0]">导出 · {project.name}</h1>
        <p className="mb-8 text-[#6B6B8A]">已完成 {episodes.filter((e) => e.status !== 'pending').length}/{episodes.length} 集</p>

        <div className="space-y-4">
          <div className="rounded-lg border border-[#1E1E2E] bg-[#12121A] p-6">
            <h3 className="mb-2 text-lg text-[#E8E8F0]">📄 剧本 Markdown</h3>
            <p className="mb-4 text-sm text-[#6B6B8A]">包含角色表 + 全部集数剧本</p>
            <button
              onClick={() => download(generateMarkdown(), `${project.name}_剧本.md`)}
              className="rounded-lg bg-[#C8A96E] px-4 py-2 text-sm font-medium text-[#0A0A0F] hover:bg-[#D4B97E]"
            >
              下载剧本
            </button>
          </div>

          <div className="rounded-lg border border-[#1E1E2E] bg-[#12121A] p-6">
            <h3 className="mb-2 text-lg text-[#E8E8F0]">📦 发布物料包</h3>
            <p className="mb-4 text-sm text-[#6B6B8A]">剧名方案 + 平台简介 + 每集标题 + 推广文案</p>
            <button
              onClick={() => materials && download(generateMaterialsPack(), `${project.name}_物料包.txt`)}
              disabled={!materials}
              className="rounded-lg bg-[#C8A96E] px-4 py-2 text-sm font-medium text-[#0A0A0F] hover:bg-[#D4B97E] disabled:opacity-40"
            >
              {materials ? '下载物料' : '暂无物料'}
            </button>
          </div>

          <div className="rounded-lg border border-[#1E1E2E] bg-[#12121A] p-6">
            <h3 className="mb-2 text-lg text-[#E8E8F0]">📋 一键导出全部</h3>
            <p className="mb-4 text-sm text-[#6B6B8A]">自动下载剧本 + 物料包</p>
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="rounded-lg bg-[#C8A96E] px-6 py-3 font-medium text-[#0A0A0F] hover:bg-[#D4B97E] disabled:opacity-40"
            >
              {exporting ? '导出中...' : '一键导出'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

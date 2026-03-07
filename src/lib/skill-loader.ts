import { readFileSync } from 'fs'
import { join } from 'path'
import type { SkillPhase } from './types'
import { truncateForAI } from './search'

const SKILLS_DIR = join(process.cwd(), 'skills')

function readSkillFile(path: string): string {
  try {
    return readFileSync(join(SKILLS_DIR, path), 'utf-8')
  } catch {
    return ''
  }
}

// 按阶段动态加载对应 Skill，控制 token
const PHASE_SKILLS: Record<SkillPhase, string[]> = {
  topic: [
    'hotspot-radar/SKILL.md',
  ],
  icebreak: [
    'short-drama-writer/SKILL.md',
  ],
  track: [
    'short-drama-writer/SKILL.md',
    'short-drama-writer/references/track-matrix.md',
  ],
  character: [
    'short-drama-writer/SKILL.md',
    'short-drama-writer/references/character-system.md',
  ],
  outline: [
    'short-drama-writer/SKILL.md',
    'short-drama-writer/references/story-structure.md',
  ],
  writing: [
    'short-drama-writer/references/episode-protocol.md',
    'short-drama-writer/references/script-format.md',
    'short-drama-writer/references/chinese-writing.md',
    'character-consistency/SKILL.md',
  ],
  audit: [
    'audit-predictor/SKILL.md',
    'audit-predictor/references/risk-rules.md',
  ],
  export: [
    'publish-materials/SKILL.md',
    'publish-materials/references/platform-standards.md',
  ],
  'hit-analysis': [
    'hit-analyzer/SKILL.md',
    'hit-analyzer/references/analysis-dimensions.md',
    'hit-analyzer/references/ai-drama-dimensions.md',
  ],
}

const MAX_SKILL_TOKENS = 6000 // 每个 skill 文件最大字符数

export function loadSkillsForPhase(phase: SkillPhase): string {
  const files = PHASE_SKILLS[phase] || []
  const parts: string[] = []

  for (const file of files) {
    const content = readSkillFile(file)
    if (content) {
      parts.push(truncateForAI(content, MAX_SKILL_TOKENS))
    }
  }

  return parts.join('\n\n---\n\n')
}

export function buildSystemPrompt(
  phase: SkillPhase,
  extraContext?: string,
): string {
  const BASE_PROMPT = `你是"重建地平线·短剧编剧台"的AI助手。
你正在帮助用户创作面向抖音/快手/微信视频号的AI短剧剧本。
请严格遵循以下Skill指令中的规则进行对话。
用中文回复，使用教练式对话风格。`

  const skillContent = loadSkillsForPhase(phase)
  const parts = [BASE_PROMPT]

  if (skillContent) {
    parts.push(`\n\n=== Skill 指令 ===\n\n${skillContent}`)
  }

  if (extraContext) {
    parts.push(`\n\n=== 额外上下文 ===\n\n${extraContext}`)
  }

  return parts.join('')
}

// 根据项目状态推断当前阶段
export function inferPhase(status: string, outlineConfirmed: boolean, messageCount: number): SkillPhase {
  if (status === 'topic') return 'topic'
  if (status === 'creating') {
    if (messageCount <= 2) return 'icebreak'
    if (!outlineConfirmed) {
      if (messageCount <= 6) return 'track'
      if (messageCount <= 12) return 'character'
      return 'outline'
    }
    return 'outline'
  }
  if (status === 'writing') return 'writing'
  if (status === 'done') return 'export'
  return 'icebreak'
}

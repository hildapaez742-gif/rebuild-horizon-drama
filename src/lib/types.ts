// ==================== AI 引擎配置 ====================
export interface EngineConfig {
  apiKey: string
  model: string
  baseUrl: string
}

export interface AppConfig {
  activeEngine: 'claude' | 'qwen'
  userName: string
  engines: {
    claude: EngineConfig
    qwen: EngineConfig
  }
}

// ==================== 项目数据 ====================
export type ProjectStatus = 'topic' | 'creating' | 'writing' | 'done'
export type TargetPlatform = 'douyin' | 'kuaishou' | 'wechat' | 'all'

export interface Project {
  id: string
  user_id: string
  name: string
  status: ProjectStatus
  target_platform: TargetPlatform
  context: ProjectContext
  outline: ProjectOutline
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ProjectContext {
  hotspot?: unknown
  track_analysis?: unknown
  selected_track?: string
}

export interface ProjectOutline {
  characters: Character[]
  emotion_wave: number[]
  payment_hooks: Hook[]
  twists: Twist[]
  confirmed: boolean
}

export interface Character {
  name: string
  role: string
  surface_identity: string
  real_identity: string
  personality_tags: string[]
  speech_style: string
  emotion_baseline: string
  motivation: string
  dna?: CharacterDNA
}

export interface CharacterDNA {
  tempo: string
  vocabulary_level: string
  emotion_exposure: string
  verbal_habit: string
}

export interface Hook {
  episode: number
  type: string
  description: string
}

export interface Twist {
  episode: number
  description: string
  intensity: number
}

// ==================== 单集 ====================
export type EpisodeStatus = 'pending' | 'generated' | 'edited'

export interface Episode {
  id: string
  project_id: string
  index: number
  content: string
  status: EpisodeStatus
  consistency_score: number
  audit_flags: AuditFlag[]
  hook_type: string
  created_at: string
}

export interface AuditFlag {
  level: 'red' | 'orange' | 'yellow' | 'blue' | 'grey'
  location: string
  original: string
  reason: string
  suggestion: string
}

// ==================== 物料 ====================
export interface Materials {
  id: string
  project_id: string
  titles: TitleOption[]
  synopsis: Record<string, string>
  episode_titles: string[]
  promo_copies: Record<string, string>
}

export interface TitleOption {
  name: string
  type: string
  logic: string
  platform: string
}

// ==================== 对话 ====================
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  skill?: string
}

// ==================== 搜索 ====================
export interface SearchResult {
  title: string
  link: string
  snippet: string
}

export interface HotItem {
  title: string
  url?: string
  hot?: string
}

// ==================== Skill 阶段 ====================
export type SkillPhase =
  | 'topic'        // 选题阶段
  | 'icebreak'     // 破冰
  | 'track'        // 赛道选择
  | 'character'    // 人物设计
  | 'outline'      // 大纲生成
  | 'writing'      // 单集生成
  | 'audit'        // 审核
  | 'export'       // 导出/物料
  | 'hit-analysis' // 爆款分析(手动)

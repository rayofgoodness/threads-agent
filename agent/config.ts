import { readFileSync, writeFileSync } from 'node:fs'

/**
 * How the account sounds. Kept as structured fields rather than one prose
 * block so the dashboard can edit it: a free-form paragraph is easy to write
 * and impossible to render as a form.
 */
export interface VoiceConfig {
  /** Who is speaking — role, not biography. */
  persona: string
  /** Who is being spoken to. */
  audience: string
  /** Language of the posts themselves, not of this config. */
  language: string
  /** Adjectives for the tone: «прямо», «без пафосу». */
  tone: string[]
  /** Positive rules — what a post should always do. */
  rules: string[]
  /** What never appears: clichés, formats, topics. */
  avoid: string[]
  emoji: 'none' | 'sparingly' | 'free'
  /** Short fragments in the target voice. Worth more than any adjective. */
  samples: string[]
}

export interface GenerationConfig {
  model: string
  /** How many drafts one generation call returns. */
  drafts: number
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

export interface AgentConfig {
  account: string
  timezone: string
  content: {
    queueDir: string
    draftsDir: string
    publishedDir: string
    knowledgeDir: string
    planFile: string
  }
  schedule: { slots: string[]; maxPerDay: number }
  guardrails: { maxLength: number; minLength: number; bannedPhrases: string[] }
  voice: VoiceConfig
  generation: GenerationConfig
  /** Single-word terms to watch. Threads matches no multi-word phrases. */
  monitor: { keywords: string[] }
}

const DEFAULTS: AgentConfig = {
  account: 'calendarsync',
  timezone: 'Europe/Kyiv',
  content: {
    queueDir: 'content/queue',
    draftsDir: 'content/drafts',
    publishedDir: 'content/published',
    knowledgeDir: 'content/knowledge',
    planFile: 'content/plan.md',
  },
  schedule: { slots: ['09:30', '18:00'], maxPerDay: 2 },
  guardrails: { maxLength: 500, minLength: 40, bannedPhrases: [] },
  voice: {
    persona: '',
    audience: '',
    language: 'українська',
    tone: [],
    rules: [],
    avoid: [],
    emoji: 'sparingly',
    samples: [],
  },
  generation: { model: 'claude-opus-5', drafts: 3, effort: 'high' },
  monitor: { keywords: [] },
}

/**
 * A fresh copy of the defaults. Deep enough that a caller mutating the result
 * — tests do — cannot reach back into the shared constant.
 */
export function defaultConfig(): AgentConfig {
  return structuredClone(DEFAULTS)
}

/**
 * Reads `agent.config.json`, falling back to the defaults for anything absent
 * so a partial config file stays valid.
 */
export function loadConfig(path = 'agent.config.json'): AgentConfig {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return DEFAULTS
  }

  const parsed = JSON.parse(raw) as Partial<AgentConfig>
  return {
    account: parsed.account ?? DEFAULTS.account,
    timezone: parsed.timezone ?? DEFAULTS.timezone,
    content: { ...DEFAULTS.content, ...parsed.content },
    schedule: { ...DEFAULTS.schedule, ...parsed.schedule },
    guardrails: { ...DEFAULTS.guardrails, ...parsed.guardrails },
    voice: { ...DEFAULTS.voice, ...parsed.voice },
    generation: { ...DEFAULTS.generation, ...parsed.generation },
    monitor: { ...DEFAULTS.monitor, ...parsed.monitor },
  }
}

/**
 * Writes the voice block back into the config file, leaving every other key
 * as it was on disk — the dashboard edits one section, not the whole file.
 */
export function saveVoice(voice: VoiceConfig, path = 'agent.config.json'): VoiceConfig {
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    // No config yet — the write below creates one.
  }
  const merged: VoiceConfig = { ...DEFAULTS.voice, ...voice }
  parsed.voice = merged
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`)
  return merged
}

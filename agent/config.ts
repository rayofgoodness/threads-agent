import { readFileSync } from 'node:fs'

export interface AgentConfig {
  account: string
  timezone: string
  content: { queueDir: string; publishedDir: string; knowledgeDir: string }
  schedule: { slots: string[]; maxPerDay: number }
  guardrails: { maxLength: number; minLength: number; bannedPhrases: string[] }
}

const DEFAULTS: AgentConfig = {
  account: 'calendarsync',
  timezone: 'Europe/Kyiv',
  content: {
    queueDir: 'content/queue',
    publishedDir: 'content/published',
    knowledgeDir: 'content/knowledge',
  },
  schedule: { slots: ['09:30', '18:00'], maxPerDay: 2 },
  guardrails: { maxLength: 500, minLength: 40, bannedPhrases: [] },
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
  }
}

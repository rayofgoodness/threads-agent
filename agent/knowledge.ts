import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { AgentConfig } from './config.ts'

export interface KnowledgeFile {
  /** Path relative to the knowledge directory — doubles as the label sent to the model. */
  name: string
  text: string
}

/** Per-file cap. One long transcript should not crowd out the other sources. */
const MAX_FILE_CHARS = 12_000

function walk(root: string, directory: string, found: KnowledgeFile[]) {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      walk(root, path, found)
      continue
    }
    // README files describe the folder to a human; they say nothing about the account.
    if (!entry.endsWith('.md') && !entry.endsWith('.txt')) continue
    if (entry.toLowerCase() === 'readme.md') continue

    const text = readFileSync(path, 'utf8').trim()
    if (text) found.push({ name: relative(root, path), text: text.slice(0, MAX_FILE_CHARS) })
  }
}

/**
 * Everything under `content/knowledge/` — real posts, call transcripts, the
 * product description. Empty is a valid answer: the generator then leans on
 * the voice config alone and says so.
 */
export function readKnowledge(config: AgentConfig): KnowledgeFile[] {
  const root = config.content.knowledgeDir
  if (!existsSync(root)) return []
  const found: KnowledgeFile[] = []
  walk(root, root, found)
  return found
}

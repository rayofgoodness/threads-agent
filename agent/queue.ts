import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig } from './config.ts'

export type ItemStatus = 'queued' | 'published' | 'failed'

export interface QueueItem {
  /** File name, which doubles as the item's id. */
  file: string
  path: string
  status: ItemStatus
  /** ISO timestamp; the item is due once this moment has passed. */
  publishAt?: string
  publishedAt?: string
  postId?: string
  permalink?: string
  note?: string
  text: string
}

/**
 * Front matter parser for the small, flat key/value blocks these files use.
 * A YAML dependency would buy nothing here — no nesting, no lists, no anchors.
 */
function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw.trim() }

  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: raw.trim() }

  const meta: Record<string, string> = {}
  for (const line of raw.slice(4, end).split('\n')) {
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim()
    if (key) meta[key] = line.slice(separator + 1).trim()
  }
  return { meta, body: raw.slice(end + 4).trim() }
}

function serialize(item: Omit<QueueItem, 'file' | 'path'>): string {
  const lines = ['---', `status: ${item.status}`]
  if (item.publishAt) lines.push(`publishAt: ${item.publishAt}`)
  if (item.publishedAt) lines.push(`publishedAt: ${item.publishedAt}`)
  if (item.postId) lines.push(`postId: ${item.postId}`)
  if (item.permalink) lines.push(`permalink: ${item.permalink}`)
  if (item.note) lines.push(`note: ${item.note}`)
  lines.push('---', '', item.text, '')
  return lines.join('\n')
}

function readItem(directory: string, file: string): QueueItem {
  const path = join(directory, file)
  const { meta, body } = parseFrontMatter(readFileSync(path, 'utf8'))
  const status = meta.status
  return {
    file,
    path,
    status: status === 'published' || status === 'failed' ? status : 'queued',
    publishAt: meta.publishAt,
    publishedAt: meta.publishedAt,
    postId: meta.postId,
    permalink: meta.permalink,
    note: meta.note,
    text: body,
  }
}

export function listQueue(config: AgentConfig): QueueItem[] {
  const directory = config.content.queueDir
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .map((file) => readItem(directory, file))
    .sort((a, b) => (a.publishAt ?? '').localeCompare(b.publishAt ?? ''))
}

export function listPublished(config: AgentConfig): QueueItem[] {
  const directory = config.content.publishedDir
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .map((file) => readItem(directory, file))
}

/** Items whose slot has arrived and that are still waiting. */
export function dueItems(config: AgentConfig, now = new Date()): QueueItem[] {
  return listQueue(config).filter(
    (item) => item.status === 'queued' && (!item.publishAt || Date.parse(item.publishAt) <= now.getTime()),
  )
}

export function addItem(config: AgentConfig, text: string, publishAt?: string): QueueItem {
  mkdirSync(config.content.queueDir, { recursive: true })
  // Timestamped name keeps the directory listing in chronological order. Two
  // adds inside the same millisecond would collide, so the name gets a suffix
  // until it is free — otherwise the second draft silently replaces the first.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let file = `${stamp}.md`
  for (let suffix = 2; existsSync(join(config.content.queueDir, file)); suffix++) {
    file = `${stamp}-${suffix}.md`
  }
  const path = join(config.content.queueDir, file)
  const item = { status: 'queued' as const, publishAt, text: text.trim() }
  writeFileSync(path, serialize(item))
  return { ...item, file, path }
}

/** Records the outcome on the file and moves a published item out of the queue. */
export function settleItem(
  config: AgentConfig,
  item: QueueItem,
  outcome:
    | { status: 'published'; postId: string; permalink?: string }
    | { status: 'failed'; note: string },
): string {
  const updated: Omit<QueueItem, 'file' | 'path'> = {
    status: outcome.status,
    publishAt: item.publishAt,
    text: item.text,
    ...(outcome.status === 'published'
      ? { publishedAt: new Date().toISOString(), postId: outcome.postId, permalink: outcome.permalink }
      : { note: outcome.note }),
  }

  writeFileSync(item.path, serialize(updated))
  if (outcome.status !== 'published') return item.path

  mkdirSync(config.content.publishedDir, { recursive: true })
  const target = join(config.content.publishedDir, item.file)
  renameSync(item.path, target)
  return target
}

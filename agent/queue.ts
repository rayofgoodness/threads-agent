import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { AgentConfig } from './config.ts'

/**
 * `draft` is deliberately not a queue state: a draft lives in its own
 * directory and has no slot, so nothing that publishes ever sees it. It is
 * still recognised here because a file that ends up in the wrong directory
 * must not be treated as due.
 */
export type ItemStatus = 'draft' | 'queued' | 'published' | 'failed'

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
  /** What the draft was written about. Set by the generator, kept for the reader. */
  topic?: string
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
  if (item.topic) lines.push(`topic: ${item.topic}`)
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
    status:
      status === 'published' || status === 'failed' || status === 'draft' ? status : 'queued',
    publishAt: meta.publishAt,
    publishedAt: meta.publishedAt,
    postId: meta.postId,
    permalink: meta.permalink,
    note: meta.note,
    topic: meta.topic,
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

/** Writes an item into `directory` under a free, chronologically sortable name. */
function writeNew(directory: string, item: Omit<QueueItem, 'file' | 'path'>): QueueItem {
  mkdirSync(directory, { recursive: true })
  // Timestamped name keeps the directory listing in chronological order. Two
  // adds inside the same millisecond would collide, so the name gets a suffix
  // until it is free — otherwise the second draft silently replaces the first.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let file = `${stamp}.md`
  for (let suffix = 2; existsSync(join(directory, file)); suffix++) {
    file = `${stamp}-${suffix}.md`
  }
  const path = join(directory, file)
  writeFileSync(path, serialize(item))
  return { ...item, file, path }
}

export function addItem(config: AgentConfig, text: string, publishAt?: string): QueueItem {
  return writeNew(config.content.queueDir, {
    status: 'queued',
    publishAt,
    text: text.trim(),
  })
}

/**
 * The draft shelf: generated or hand-written text that is not going anywhere
 * yet. No slot, its own directory, and `runDue` never looks here — keeping a
 * draft has to be cheaper than queueing one, or nobody will keep any.
 */
export function listDrafts(config: AgentConfig): QueueItem[] {
  const directory = config.content.draftsDir
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((file) => file.endsWith('.md'))
    .map((file) => readItem(directory, file))
    .sort((a, b) => b.file.localeCompare(a.file))
}

export function addDraft(config: AgentConfig, text: string, topic?: string): QueueItem {
  return writeNew(config.content.draftsDir, { status: 'draft', topic, text: text.trim() })
}

/**
 * A draft that cannot be addressed. Carries which of the two it is so the API
 * can answer 404 or 400 — the queue itself knows nothing about HTTP.
 *
 * The field is assigned in the body rather than declared as a constructor
 * parameter property: Node's type stripping rejects those.
 */
export class DraftError extends Error {
  readonly reason: 'missing' | 'invalid'

  constructor(reason: 'missing' | 'invalid', message: string) {
    super(message)
    this.name = 'DraftError'
    this.reason = reason
  }
}

function draftPath(config: AgentConfig, file: string): string {
  // The file name is the id and reaches this from the browser; a path
  // separator in it would let a request read or write outside the directory.
  if (file.includes('/') || file.includes('\\') || !file.endsWith('.md')) {
    throw new DraftError('invalid', `некоректне імʼя чернетки: ${file}`)
  }
  const path = join(config.content.draftsDir, file)
  if (!existsSync(path)) throw new DraftError('missing', `чернетки нема: ${file}`)
  return path
}

export function updateDraft(config: AgentConfig, file: string, text: string): QueueItem {
  const path = draftPath(config, file)
  const current = readItem(config.content.draftsDir, file)
  const updated = { ...current, text: text.trim() }
  writeFileSync(path, serialize(updated))
  return updated
}

export function removeDraft(config: AgentConfig, file: string): boolean {
  rmSync(draftPath(config, file))
  return true
}

/**
 * Moves a draft into the queue with a slot. This is the only way a draft
 * becomes publishable, and it is always an explicit act.
 */
export function scheduleDraft(config: AgentConfig, file: string, publishAt?: string): QueueItem {
  const path = draftPath(config, file)
  const draft = readItem(config.content.draftsDir, file)
  const queued = writeNew(config.content.queueDir, {
    status: 'queued',
    publishAt,
    topic: draft.topic,
    text: draft.text,
  })
  rmSync(path)
  return queued
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

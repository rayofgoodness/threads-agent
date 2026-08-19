import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig, loadConfig, saveVoice } from './config.ts'

let root: string
let path: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'config-'))
  path = join(root, 'agent.config.json')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('loadConfig', () => {
  it('falls back to the defaults for a file that is not there', () => {
    expect(loadConfig(join(root, 'missing.json'))).toEqual(defaultConfig())
  })

  it('fills in the blocks a partial file leaves out', () => {
    writeFileSync(path, JSON.stringify({ voice: { persona: 'Засновник' } }))
    const config = loadConfig(path)
    expect(config.voice.persona).toBe('Засновник')
    expect(config.voice.emoji).toBe('sparingly')
    expect(config.generation.model).toBe('claude-opus-5')
  })
})

describe('saveVoice', () => {
  it('writes the voice back and leaves every other block alone', () => {
    writeFileSync(path, JSON.stringify({ account: 'calendarsync', schedule: { maxPerDay: 7 } }))
    saveVoice({ ...defaultConfig().voice, persona: 'Новий голос' }, path)

    const written = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(written.account).toBe('calendarsync')
    expect(written.schedule).toEqual({ maxPerDay: 7 })
    expect(loadConfig(path).voice.persona).toBe('Новий голос')
  })

  it('creates a config when there is none yet', () => {
    saveVoice({ ...defaultConfig().voice, language: 'англійська' }, path)
    expect(loadConfig(path).voice.language).toBe('англійська')
  })
})

describe('defaultConfig', () => {
  // Tests mutate the result; a shared object would leak between them.
  it('hands out a copy, not the shared constant', () => {
    const first = defaultConfig()
    first.voice.tone.push('гучно')
    expect(defaultConfig().voice.tone).toEqual([])
  })
})

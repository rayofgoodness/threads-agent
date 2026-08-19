import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig, VoiceConfig } from './config.ts'
import { readKnowledge, type KnowledgeFile } from './knowledge.ts'
import { pendingTopics, readPlan, type ContentPlan } from './plan.ts'
import { listPublished } from './queue.ts'
import { checkGuardrails, type GuardrailViolation } from './publisher.ts'

/** One generated post, still a draft — nothing here has touched the queue. */
export interface Draft {
  topic: string
  text: string
  /** The angle in one line, for the reviewer. Never published. */
  note: string
  /** Line of `content/plan.md` the topic came from, or undefined if improvised. */
  planLine?: number
  /** Run of the same guardrails the publisher applies, so the UI can warn early. */
  violations: GuardrailViolation[]
}

export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>

/** One call to the model: the drafts plus what it cost. */
export interface GenerationResult {
  model: string
  brief?: string
  drafts: Draft[]
  usage: { input: number; output: number; cached: number }
}

export interface GenerateOptions {
  /** Defaults to `generation.drafts` from the config. */
  count?: number
  /** Free-form brief — a topic, an event, a link. Takes priority over the plan. */
  brief?: string
  /** Injected in tests; production builds a client from `ANTHROPIC_API_KEY`. */
  createMessage?: CreateMessage
}

const DRAFTS_SCHEMA = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'Тема поста, одним рядком' },
          planLine: {
            type: 'integer',
            description: 'Номер рядка теми з контент-плану, або -1 якщо теми там не було',
          },
          text: { type: 'string', description: 'Готовий текст поста, без хештегів і підпису' },
          note: { type: 'string', description: 'Чому саме такий кут — один рядок для рецензента' },
        },
        required: ['topic', 'planLine', 'text', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['drafts'],
  additionalProperties: false,
} as const

function bullets(label: string, values: string[]): string {
  if (!values.length) return ''
  return `${label}:\n${values.map((value) => `- ${value}`).join('\n')}\n`
}

const EMOJI_RULE: Record<VoiceConfig['emoji'], string> = {
  none: 'Емодзі не використовувати взагалі.',
  sparingly: 'Емодзі — не більше одного на пост, і лише якщо він щось додає.',
  free: 'Емодзі дозволені, але не замість слів.',
}

/**
 * The stable half of the prompt: who the account is and what a post may look
 * like. Kept separate from the request so it can be cached and so tests can
 * assert on it without calling the API.
 */
export function buildSystemPrompt(config: AgentConfig, knowledge: KnowledgeFile[]): string {
  const { voice, guardrails } = config
  const parts = [
    `Ти пишеш пости для акаунта @${config.account} у Threads.`,
    voice.persona && `Хто говорить: ${voice.persona}`,
    voice.audience && `До кого: ${voice.audience}`,
    `Мова постів: ${voice.language}.`,
    bullets('Тон', voice.tone),
    bullets('Правила', voice.rules),
    bullets('Ніколи', voice.avoid),
    EMOJI_RULE[voice.emoji],
    `Довжина: від ${guardrails.minLength} до ${guardrails.maxLength} символів. Це жорстке обмеження Threads, не орієнтир.`,
    guardrails.bannedPhrases.length
      ? bullets('Заборонені фрази — не вживати ні в якому вигляді', guardrails.bannedPhrases)
      : '',
    voice.samples.length
      ? `Фрагменти в потрібному голосі:\n${voice.samples.map((sample) => `«${sample}»`).join('\n')}`
      : '',
  ]

  if (knowledge.length) {
    parts.push(
      'Матеріали акаунта — з них беруться факти, приклади й формулювання. Нічого поза ними не вигадувати:',
      knowledge.map((file) => `--- ${file.name} ---\n${file.text}`).join('\n\n'),
    )
  } else {
    parts.push(
      'Матеріалів у content/knowledge/ поки немає. Пиши обережно: жодних цифр, кейсів і назв функцій, яких ти не знаєш напевно.',
    )
  }

  return parts.filter(Boolean).join('\n\n')
}

/** The varying half: what to write about right now, and what not to repeat. */
export function buildUserPrompt(
  config: AgentConfig,
  plan: ContentPlan,
  recent: string[],
  options: GenerateOptions,
): string {
  const count = options.count ?? config.generation.drafts
  const open = pendingTopics(plan)
  const parts = [`Напиши ${count} різних варіантів поста.`]

  if (options.brief) {
    parts.push(`Завдання на цю генерацію:\n${options.brief}`)
  }

  if (plan.raw.trim()) {
    parts.push(`Контент-план цілком:\n${plan.raw.trim()}`)
  }

  if (open.length) {
    parts.push(
      `Незакриті теми плану — бери їх, якщо завдання вище не каже інакше. Номер рядка повертай у planLine:\n${open
        .map((topic) => `${topic.line}: ${topic.text}`)
        .join('\n')}`,
    )
  } else if (!options.brief) {
    parts.push(
      'Незакритих тем у плані немає — запропонуй свої, виходячи з матеріалів акаунта. planLine тоді -1.',
    )
  }

  if (recent.length) {
    parts.push(
      `Уже опубліковано — не повторювати ні тему, ні заходження:\n${recent
        .map((text) => `- ${text.slice(0, 200).replace(/\n/g, ' ')}`)
        .join('\n')}`,
    )
  }

  parts.push(
    'Варіанти мають відрізнятися кутом, а не переставленими словами. Текст готовий до публікації як є: без заголовків, хештегів, підпису й лапок навколо.',
  )

  return parts.join('\n\n')
}

let client: Anthropic | undefined

/** Built lazily so importing this module without an API key stays harmless. */
function defaultCreateMessage(): CreateMessage {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Немає ANTHROPIC_API_KEY — додай його в .env')
    }
    client = new Anthropic()
  }
  const messages = client.messages
  return (params) => messages.create(params)
}

/** The last few published posts, newest first — the anti-repetition context. */
function recentTexts(config: AgentConfig, limit = 10): string[] {
  return listPublished(config)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
    .slice(0, limit)
    .map((item) => item.text)
}

/**
 * Asks Claude for drafts in the account's voice.
 *
 * Nothing is written anywhere: the caller decides what reaches the queue. The
 * guardrails run here anyway so a too-long draft is visible before it is kept.
 */
export async function generateDrafts(
  config: AgentConfig,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const plan = readPlan(config)
  const knowledge = readKnowledge(config)
  const createMessage = options.createMessage ?? defaultCreateMessage()

  const response = await createMessage({
    model: config.generation.model,
    max_tokens: 16000,
    output_config: {
      effort: config.generation.effort,
      format: { type: 'json_schema', schema: DRAFTS_SCHEMA },
    },
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(config, knowledge),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(config, plan, recentTexts(config), options),
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Модель відмовилася генерувати — перевір бриф і матеріали')
  }

  const block = response.content.find((candidate) => candidate.type === 'text')
  if (!block) throw new Error('Модель не повернула тексту')

  const parsed = JSON.parse(block.text) as {
    drafts: { topic: string; planLine: number; text: string; note: string }[]
  }

  const drafts = parsed.drafts.map((draft) => {
    const text = draft.text.trim()
    return {
      topic: draft.topic.trim(),
      text,
      note: draft.note.trim(),
      // -1 is the model's «not from the plan»; anything else indexes a line.
      ...(draft.planLine >= 0 ? { planLine: draft.planLine } : {}),
      violations: checkGuardrails(config, text),
    }
  })

  return {
    model: response.model,
    ...(options.brief ? { brief: options.brief } : {}),
    drafts,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cached: response.usage.cache_read_input_tokens ?? 0,
    },
  }
}

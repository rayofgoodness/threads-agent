/**
 * Terminal access to the Threads client.
 *
 *   source .env && node scripts/threads.ts <command> [args]
 *
 * Node runs this .ts file directly via type stripping (22.18+ / 24.12+), so
 * there is no build step. `source .env` first — it is not loaded automatically.
 */
import { ThreadsApiError, ThreadsClient } from '../src/threads/index.ts'

const [command = 'help', ...args] = process.argv.slice(2)

const COMMANDS = `
Commands:
  whoami                 profile behind the token
  token                  validity, expiry and granted scopes
  limits                 24-hour publish / reply quota usage
  posts [limit]          recent posts, newest first
  post <text>            publish a text post, prints its id and permalink
  delete <id>            delete a post (needs threads_delete)
  insights [postId]      account insights, or one post's insights
  replies <postId>       replies under a post
`

function print(value: unknown) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

async function main() {
  if (command === 'help' || command === '--help') {
    print(COMMANDS.trim())
    return
  }

  const client = ThreadsClient.fromEnv()

  switch (command) {
    case 'whoami':
      return print(await client.getProfile())

    case 'token': {
      const info = await client.inspectToken()
      return print({
        valid: info.is_valid,
        expires: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : 'unknown',
        canDelete: client.hasScope(info, 'threads_delete'),
        canPublish: client.hasScope(info, 'threads_content_publish'),
        scopes: info.scopes,
      })
    }

    case 'limits':
      return print(await client.publishingLimit())

    case 'posts': {
      const limit = Number(args[0] ?? 10)
      const page = await client.listPosts({ limit })
      return print(
        page.data.map((post) => ({
          id: post.id,
          at: post.timestamp,
          type: post.media_type,
          text: post.text?.slice(0, 80),
          permalink: post.permalink,
        })),
      )
    }

    case 'post': {
      const text = args.join(' ')
      if (!text) throw new Error('post: give me the text to publish')
      const published = await client.publishText(text)
      return print({ id: published.id, permalink: published.permalink })
    }

    case 'delete': {
      const id = args[0]
      if (!id) throw new Error('delete: give me a post id')
      return print({ deleted: await client.deletePost(id) })
    }

    case 'insights': {
      const metrics = args[0]
        ? await client.postInsights(args[0])
        : await client.accountInsights()
      return print(
        metrics.map((metric) => ({
          name: metric.name,
          value: metric.total_value?.value ?? metric.values?.at(-1)?.value,
          period: metric.period,
        })),
      )
    }

    case 'replies': {
      const id = args[0]
      if (!id) throw new Error('replies: give me a post id')
      const page = await client.listReplies(id)
      return print(page.data.map((r) => ({ id: r.id, by: r.username, text: r.text })))
    }

    default:
      throw new Error(`unknown command "${command}"\n${COMMANDS}`)
  }
}

main().catch((error: unknown) => {
  if (error instanceof ThreadsApiError) {
    console.error(`${error.endpoint} failed: ${error.message}`)
    console.error(`  code ${error.code ?? '?'} subcode ${error.subcode ?? '-'} http ${error.status}`)
    if (error.isPermissionDenied) console.error('  the token is missing a permission for this call')
    if (error.isAuthError) console.error('  token expired or revoked — issue a new one')
    if (error.isRateLimited) console.error('  quota exhausted, wait for the 24-hour window')
  } else {
    console.error(error instanceof Error ? error.message : String(error))
  }
  process.exitCode = 1
})

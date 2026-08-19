# threads-agent

[![CI](https://github.com/rayofgoodness/threads-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/rayofgoodness/threads-agent/actions/workflows/ci.yml)

Publishing agent for the [Casy](https://casy.beauty) Threads account
(`@calendarsync`). It drafts into a file-based queue, publishes on a schedule
through the official Threads API, and reports what comes back — replies,
metrics, keyword hits.

Drafts are written by Claude from a tone-of-voice config and a content plan,
then reviewed before anything is queued.

Content lives as markdown under `content/`, so a draft, an edit and the record
of what went out are all ordinary diffs. A Postgres database is optional and
holds only what git is bad at: generation history and post metrics over time.

## Layout

| Path           | What it is                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `src/threads/` | Typed Threads API client. Server-side only — it carries the access token.      |
| `agent/`       | Queue, schedule, guardrails, drafting, inbound monitoring.                     |
| `server/`      | JSON API over the client, so the browser never sees the token.                 |
| `src/`         | Vue 3 dashboard: composer, feed, metrics, inbound signals.                     |
| `scripts/`     | Two CLIs — `threads.ts` for direct API calls, `agent.ts` for the content loop. |
| `content/`     | Drafts, the queue, published history, the plan and the knowledge base.         |
| `db/`          | Optional Postgres: generation history and post metrics. Schema and migration.  |
| `docs/`        | Legal pages for Meta App Review, served by GitHub Pages.                       |

## Setup

Node `^22.18.0 || >=24.12.0`. The TypeScript runs directly via Node's type
stripping — nothing to build for the server or the CLIs.

```sh
npm ci
```

Create `.env` in the project root:

```sh
THREADS_ACCESS_TOKEN=...
THREADS_APP_ID=...        # the Threads app ID, not the Meta app ID
THREADS_APP_SECRET=...
ANTHROPIC_API_KEY=...     # drafting; everything else works without it
DATABASE_URL=...          # optional, see «Generation history» below
```

`.env.example` carries the full list with defaults.

The token comes from the App Dashboard → Threads PR Manager → Use Case
"Access the Threads API" → Settings → **User Token Generator**. That issues a
token carrying the app's current permissions; exchange it for a 60-day one with
`grant_type=th_exchange_token`. Running the OAuth authorize URL instead returns
a bare `error_code: 1`, and a token obtained that way carries whatever
permissions existed when the account first authorized, so newly added ones never
appear.

`.env` is gitignored and must stay that way. The server loads it by itself; the
CLIs need `source .env` first.

## Running

```sh
npm run server   # JSON API on :8788
npm run dev      # Vue app on :5173, proxying /api to the server
```

Both are needed for the dashboard — the app has no direct access to Threads.

### Direct API access

```sh
source .env
node scripts/threads.ts token            # validity, expiry, granted scopes
node scripts/threads.ts whoami
node scripts/threads.ts posts 10
node scripts/threads.ts post "text"      # publishes immediately
node scripts/threads.ts delete <postId>
node scripts/threads.ts insights [postId]
node scripts/threads.ts replies <postId>
node scripts/threads.ts limits
```

### The content loop

```sh
node scripts/agent.ts add "text"         # queue a draft in the next free slot
node scripts/agent.ts add "text" --at 2026-08-20T09:30:00+03:00
node scripts/agent.ts list               # what is queued
node scripts/agent.ts check              # guardrails across the queue
node scripts/agent.ts due                # what would go out now
node scripts/agent.ts run                # dry run — reports, publishes nothing
node scripts/agent.ts run --yes          # actually publishes
node scripts/agent.ts published
node scripts/agent.ts watch [--all]      # inbound replies, mentions, keywords
```

### Drafting

```sh
node scripts/agent.ts plan                       # the plan, and what is open in it
node scripts/agent.ts generate                   # drafts, printed, nothing queued
node scripts/agent.ts generate --count 5 --brief "про ціни"
node scripts/agent.ts generate --draft            # keep them all, no slot
node scripts/agent.ts generate --yes             # queue what passes the guardrails
node scripts/agent.ts drafts                     # the draft shelf
node scripts/agent.ts schedule <file> [--at ISO] # a draft takes a slot
node scripts/agent.ts drop <file>
node scripts/agent.ts history [--limit N]        # past generations, needs a database
```

A generated post has two destinations. `content/drafts/` is a shelf: no slot,
its own directory, and `runDue` never reads it — a kept text cannot publish by
accident, which is what makes it the right place for anything that still needs
work. `content/queue/` is the schedule. Moving between them is one explicit
command (or one button), and only that move applies a slot.

The model is given three things: the `voice` block of `agent.config.json` (who
is speaking, to whom, the tone, the rules, what never appears), everything under
`content/knowledge/`, and `content/plan.md`. A plan line reading `- [ ] тема` is
an open topic; the agent ticks it to `- [x]` once a draft from it reaches the
queue. Prose around the topics is context the model still reads.

Nothing is published by generating — `--yes` only queues, and the queue is still
subject to the slots, the daily cap and the guardrails. The same flow is in the
dashboard, where each draft stays editable before it is queued.

Both the voice and the plan are editable from the dashboard; the voice is
written back into `agent.config.json`, so it stays a diff like everything else.

### Generation history

Optional. Without `DATABASE_URL` every database call is a no-op and drafting
works unchanged — the history simply is not kept.

```sh
docker compose up -d      # Postgres on 127.0.0.1:55432
npm run db:migrate        # apply db/schema.sql to an existing volume
```

The host port is deliberately not 5432 so a local Postgres keeps working;
override it with `POSTGRES_PORT`. Three tables: `generations` (what was asked
and what it cost), `drafts` (each variant and whether it was queued) and
`post_metrics` (one row per reading, so a post's curve is visible rather than
just its latest number). Content itself is never stored there.

Every variant is recorded, including the ones nobody kept — `agent.ts history`
and the dashboard read them back, and an old draft can be pulled onto the shelf
again to work on.

`run` is dry unless you pass `--yes`. Slots, the daily cap, length bounds,
banned phrases and watched keywords all come from `agent.config.json`.

### Publishing on a schedule

`scripts/publish-due.sh` runs the queue unattended — it resolves node itself and
loads `.env`, so it works from launchd or cron where neither is inherited. The
launchd template is in `scripts/launchd/`; install it by substituting `__REPO__`
and bootstrapping it, and stop it with `launchctl bootout`. It checks every 15
minutes and publishes only what is due, within the daily cap.

While that job is loaded, queued posts go public without further review.

### Deploying to a Raspberry Pi

`deploy/` has systemd units, a Cloudflare Tunnel config and step-by-step notes —
see [`deploy/README.md`](deploy/README.md). One Node process serves `/api` and
the built dashboard on loopback; `cloudflared` reaches it through a tunnel, so
nothing is port-forwarded. The dashboard lives at <https://threads.quarters.casa>.

`/api` can publish and delete, so the server refuses to bind a non-loopback
address unless `THREADS_AGENT_TOKEN` is set, and every `/api` request must then
carry it as `Authorization: Bearer`. Put Cloudflare Access in front as well.

## What the Threads API will and will not do

Findings from working against the live account, not guesses:

- **Deleting needs `threads_delete`.** Without it the call fails _after_ the post
  is already public, and it then has to be removed by hand.
- **Mentions are gated.** `/me/mentions` answers `code 10` subcode 4279067
  ("insufficient app access level") even with `threads_manage_mentions` in the
  token. Needs App Review.
- **Keyword search is limited twice over.** At the default access level it
  returns only the account's own posts, and the query is a single word —
  multi-word phrases match nothing rather than falling back to OR.
- **The feed lags writes by a few seconds.** A deleted post can still appear in
  `/me/threads` while `GET /{id}` already reports it gone.
- **Publishing is two calls** — create a container, then publish it. Text needs
  no delay between them; media does.
- **Quotas** are 250 posts, 1000 replies and 100 deletions per rolling 24 hours.

## Verification

```sh
npm test          # 89 tests, no network
npm run type-check
npm run lint
```

Tests inject a `fetchImpl` into the client, a client into the agent modules and
a fake `createMessage` into the generator, so nothing reaches the real account,
Anthropic or Postgres. CI runs the same on Node 22 and 24, plus
a smoke run of both CLIs — type stripping fails at load, never at build.

## Legal pages

`docs/` is served at <https://rayofgoodness.github.io/threads-agent/> straight
from `master`. It holds the privacy policy, data deletion instructions, terms of
service and the OAuth redirect target registered with Meta. Any push touching
`docs/` goes live immediately, redirect URI included.

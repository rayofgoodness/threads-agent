# threads-agent

[![CI](https://github.com/rayofgoodness/threads-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/rayofgoodness/threads-agent/actions/workflows/ci.yml)

Publishing agent for the [Casy](https://casy.beauty) Threads account
(`@calendarsync`). It drafts into a file-based queue, publishes on a schedule
through the official Threads API, and reports what comes back — replies,
metrics, keyword hits.

Content lives as markdown under `content/`, so a draft, an edit and the record
of what went out are all ordinary diffs. There is no database.

## Layout

| Path           | What it is                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| `src/threads/` | Typed Threads API client. Server-side only — it carries the access token.      |
| `agent/`       | Queue, schedule, guardrails, inbound monitoring.                               |
| `server/`      | JSON API over the client, so the browser never sees the token.                 |
| `src/`         | Vue 3 dashboard: composer, feed, metrics, inbound signals.                     |
| `scripts/`     | Two CLIs — `threads.ts` for direct API calls, `agent.ts` for the content loop. |
| `content/`     | Drafts, the publishing queue and published history.                            |
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
```

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
npm test          # 46 tests, no network
npm run type-check
npm run lint
```

Tests inject a `fetchImpl` into the client and a client into the agent modules,
so nothing can reach the real account. CI runs the same on Node 22 and 24, plus
a smoke run of both CLIs — type stripping fails at load, never at build.

## Legal pages

`docs/` is served at <https://rayofgoodness.github.io/threads-agent/> straight
from `master`. It holds the privacy policy, data deletion instructions, terms of
service and the OAuth redirect target registered with Meta. Any push touching
`docs/` goes live immediately, redirect URI included.

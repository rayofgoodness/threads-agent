# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Threads API agent for the Casy account. Two independent parts in one repo:

- `src/` — Vue 3 + Vite + TypeScript app, the agent's UI. Four screens behind a
  nav rail (`src/views/`), one shared store (`composables/useDashboard.ts`), and
  a design system in `src/assets/main.css`. `src/threads/` is the API client and
  is server-side only; see below.
- `docs/` — hand-written static HTML (no build step) served live at
  <https://rayofgoodness.github.io/threads-agent/> for Meta App Review:
  privacy policy, data deletion instructions, and the OAuth redirect target
  `callback.html`.

Current state and open tasks: @PROGRESS.md

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — runs `type-check` and `build-only` in parallel via `npm-run-all2`
- `npm run type-check` — `vue-tsc --build` (TS project references; `tsc` alone
  cannot type `.vue` imports)
- `npm run lint` — `eslint . --fix` (config in `eslint.config.ts`; `docs/` is ignored)
- `npm run format` — Prettier over `src/` (no semicolons, single quotes, width 100)

- `npm run server` — JSON API over the Threads client on port 8788 (`PORT` overrides).
  It loads `.env` itself via `process.loadEnvFile`, so no `source` needed.
- `node scripts/agent.ts <command>` — content queue and scheduling
  (`list`, `add`, `check`, `due`, `run`, `published`, `slots`, `plan`,
  `generate`, `metrics`). `run` is a dry run; only `run --yes` publishes, and
  `generate` only queues with `--yes`. `metrics` takes the post readings the
  cadence says are due and does nothing at all without `DATABASE_URL`.
- `node scripts/threads.ts <command>` — terminal access to the Threads client
  (`whoami`, `token`, `limits`, `posts`, `post`, `delete`, `insights`, `replies`).
  Needs `source .env` first. Node type-strips the `.ts` directly, no build step —
  which is why imports under `src/threads/`, `scripts/` and `server/` carry
  explicit `.ts` extensions and both tsconfigs set `allowImportingTsExtensions`.
  Type stripping only erases; it cannot emit. Constructor parameter properties
  (`constructor(readonly x: number)`), `enum` and `namespace` crash at load with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` — assign fields in the body instead.

- `npm run db:up` / `npm run db:migrate` / `npm run db:down` — the optional
  Postgres for generation history. `docker-compose.yml` binds it to
  `127.0.0.1:${POSTGRES_PORT:-55432}`, deliberately not 5432, so a local
  Postgres keeps working.

- `npm test` — Vitest (`npm run test:watch` to iterate). Tests sit next to the
  code as `*.test.ts` and cover the queue, guardrails, monitor, router, plan,
  generator and the database layer. They never touch the network: the Threads
  client takes an injected `fetchImpl`, the agent modules take an injected
  client, and the generator takes an injected `createMessage`, so nothing
  reaches the real account, Anthropic or Postgres.

Verification = `npm test && npm run type-check && npm run lint`. CI
(`.github/workflows/ci.yml`) runs the same on Node 22 and 24, plus
`npm run lint:check` (no `--fix`, so CI fails instead of quietly rewriting) and
a smoke run of both CLIs — type stripping only breaks at load time, never at
build.

Node: `^22.18.0 || >=24.12.0` (enforced via `engines`).

## Conventions

- `@/*` is aliased to `./src/*` (both `vite.config.ts` and `tsconfig.app.json`).
- `noUncheckedIndexedAccess` is on — index and object lookups yield `T | undefined`.
- Vue SFCs use `<script setup lang="ts">`.
- Conventional Commits (`feat:`, `fix:`, `docs:`), committed straight to `master`.
  No feature branches, no PRs.

## Threads API

`.env` holds `THREADS_ACCESS_TOKEN`, `THREADS_APP_ID`, `THREADS_APP_SECRET`,
and — for drafting and history — `ANTHROPIC_API_KEY` and `DATABASE_URL`.
`.env.example` lists them all.
It is gitignored and **not** loaded automatically — run `source .env` in each new
shell before any command that talks to the Threads API. Never paste a token or
app secret into chat, a commit, or a file other than `.env`.

`THREADS_APP_ID` is the **Threads** app ID (1860340038261236), which is not the
Meta app ID (1794866701670684) shown in the app list. Both the OAuth code
exchange and `th_exchange_token` need the Threads one.

Account: `@calendarsync`, user id `28412520845024805`. API host is
`graph.threads.net`; pass the token as `Authorization: Bearer`, not in the query
string.

### Regenerating the token

Do not re-run the OAuth authorize URL — it returns a bare `error_code: 1`, and a
code obtained that way carries whatever permissions existed when the account
first authorized, so newly added ones never appear. Use instead:
App Dashboard → Threads PR Manager → Use Case «Access the Threads API» →
Settings → **User Token Generator** → Generate Access Token for `calendarsync`.
That issues a token matching the app's current permission set, but it expires in
~90 minutes — exchange it for a 60-day one:

```sh
curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=$THREADS_APP_SECRET&access_token=$SHORT_LIVED"
```

Verify what a token actually carries before trusting it — `debug_token` is the
only reliable check, and note that its `issued_at` is the account's original
authorization time, not the token's:

```sh
curl -s "https://graph.threads.net/debug_token?input_token=$T&access_token=$T"
```

### The client

`src/threads/` wraps the API: `ThreadsClient` (calls), `errors.ts`
(`ThreadsApiError`, which classifies failures — branch on `code`, not on HTTP
status), `types.ts` (response shapes). It is **server-side only**: it holds the
token and Threads sends no CORS headers, so importing it into the Vue bundle
would leak the secret and fail at runtime. Reach it from `scripts/` or a backend
route, never from a component.

### The agent layer

There are two shelves, not one. `content/drafts/` holds texts with no slot —
`status: draft`, invisible to `dueItems` and in a directory `runDue` never
reads, so a kept text cannot publish by accident. `content/queue/` holds what
is scheduled. `scheduleDraft` is the only path between them and is always an
explicit act; the file name is the id, and `draftPath` rejects anything with a
separator in it, since that id reaches the server from the browser.

`agent/` turns files into a schedule: `config.ts` reads `agent.config.json`
(slots, daily cap, length bounds, banned phrases), `queue.ts` reads and writes
the markdown files under `content/`, `publisher.ts` applies the guardrails and
the daily cap, then publishes and moves the file to `content/published/` with
its post id recorded. A failure is written back into the file's `note` and the
item stays queued.

Content is deliberately files, not a database — drafts, edits and publish
history all show up in `git diff`. `content/README.md` documents the format.
Publishing defaults to dry: `runDue` does nothing without `commit: true`.

### Drafting

`generator.ts` asks Claude for drafts and writes nothing: the caller decides
what happens to them — kept on the shelf (`--draft`, «У чернетки») or queued
with a slot (`--yes`, «У чергу»). Keeping has no guardrail gate; queueing does,
because a queued item publishes on its own. Its prompt has two halves, split so the stable one can
be cached — `buildSystemPrompt` (the `voice` block plus everything under
`content/knowledge/`, read by `knowledge.ts`) and `buildUserPrompt` (the plan,
the open topics, recently published posts, the brief).

The model is pinned to `claude-opus-5` with structured output
(`output_config.format`, `json_schema`), so the response parses without
recovery code. `generation.effort` in the config controls depth. The API key
lives only in `.env`; `defaultCreateMessage` builds the client lazily, so
importing the module without a key is harmless, and tests inject
`createMessage` instead.

Guardrails run on the result, but a violating draft is returned with its
violations rather than dropped — the reviewer sees what the model produced.

`plan.ts` owns `content/plan.md`. A line matching `- [ ] текст` is an open
topic; everything else is prose the model still reads. `markTopicDone` ticks
by line index, never by text, because two topics can legitimately read the same.

### The database

`db/` is optional, and every function in it is a no-op without `DATABASE_URL` —
`recordGeneration` then returns `undefined`, which `markDraftQueued` accepts, so
callers need no branching. It stores what git cannot: `generations` (what was
asked, what it cost), `drafts` (every variant, including the ones nobody kept)
and `post_metrics` (one row per reading, so a post's curve survives).
`agent.ts history` and the dashboard's history card read it back, and a text
from an old run can be pulled onto the draft shelf again. Content stays
in `content/`; do not move it here.

Writes go through `tryRecord`, which reports a failure and returns `undefined`
instead of raising: a stopped container must not lose a generation that already
cost an Anthropic call, nor refuse a draft that is already on disk.

`db/schema.sql` is mounted as a compose init script, which only runs on an empty
volume — `npm run db:migrate` is what applies it to a database that already
exists. Every statement is `IF NOT EXISTS`, so it is safe to re-run.

### Monitoring

`agent/monitor.ts` gathers inbound signals and dedupes them against
`content/monitor-state.json` (gitignored). Each channel fails independently, so
one blocked source does not hide the others. What each is worth today:

- **Replies** work. Note `/me/replies` returns replies *written by* the account,
  which is outbound noise — inbound means walking recent posts and reading
  `/{post}/replies`, one call per post. That is why `/api/signals` is on-demand.
- **Mentions** work. They answered `code 10` subcode 4279067 ("insufficient app
  access level") for months while `threads_manage_mentions` sat in the token —
  the permission was simply never added to the use case. A token can carry a
  scope the use case does not list, and the API reports that as an access-level
  error, which reads like App Review and is not. Fixed on 20 August 2026 with
  App Dashboard → Use Case «Access the Threads API» → Permissions and features →
  **Add** on the row. The same token then worked with no regeneration.
- **Keyword search** is off. `monitor.keywordSearch: false` in
  `agent.config.json` skips the channel entirely — no call, and nothing in
  `unavailable`, which carries breakage and not decisions. It was never usable:
  at the default access level the search returns only the account's own posts,
  and Advanced Access needs a verified company that does not exist behind this
  account. The watch words stay in the config for the day that changes. The flag
  defaults to `true`, so a config written before it existed behaves as it did.
  Queries are single words — multi-word phrases match nothing rather than
  falling back to OR.

### Scheduled publishing

`scripts/publish-due.sh` is the entry point for launchd or cron: it resolves
node (nvm puts it outside the PATH a job inherits), loads `.env`, runs
`agent.ts run --yes`, and appends to `content/publish.log` — but only when
something happened, since a quarter-hourly "nothing due" would bury the real
entries.

`scripts/launchd/com.casy.threads-agent.publish.plist` is a template; `__REPO__`
is replaced at install time:

```sh
sed "s|__REPO__|$PWD|g" scripts/launchd/com.casy.threads-agent.publish.plist \
  > ~/Library/LaunchAgents/com.casy.threads-agent.publish.plist
launchctl bootstrap "gui/$UID" ~/Library/LaunchAgents/com.casy.threads-agent.publish.plist
launchctl kickstart -p "gui/$UID/com.casy.threads-agent.publish"   # run once now
launchctl bootout "gui/$UID/com.casy.threads-agent.publish"        # stop it
```

That template is for running the loop on a Mac during development; in
production the Pi's systemd timer does it (`deploy/`). Do not enable both
against the same account — two machines with separate copies of `content/` would
each publish their own queue.

It fires every 15 minutes rather than at the configured slots: the queue decides
what is due, the daily cap bounds it, and a machine asleep at 09:30 still
publishes on waking. **While it is loaded, anything queued goes public without
review** — `launchctl bootout` is the off switch.

### Deployment

`deploy/` holds the Raspberry Pi setup: systemd units for the server and the
publish timer, a `cloudflared` tunnel config, and `deploy/README.md` with the
steps. The shape is one Node process on loopback serving `/api` plus the built
`dist/`, with Cloudflare reaching it through a tunnel at
<https://threads.quarters.casa>. That tunnel is shared — the same `cloudflared`
service on the Pi also carries `observer.`, `grafana.` and `mcp.quarters.casa`,
so its config is edited, never overwritten.

Two environment variables matter there and nowhere else: `HOST` (default
`127.0.0.1`) and `THREADS_AGENT_TOKEN`. The server refuses to bind a non-
loopback address without the token, because `/api` can publish and delete.

### The API server

`server/` puts the client behind same-origin JSON routes so the token stays out
of the browser: `http.ts` is a small router plus the error mapping (Threads codes
→ HTTP status: permission → 403, missing object → 404, quota → 429, anything
else → 502), `index.ts` declares the routes.

Routes that touch editable state (`/api/voice`, `/api/plan`, `/api/queue`,
`/api/generate`) call `loadConfig()` per request — the dashboard writes the
voice and the plan back to disk, and the config captured at boot would keep
serving the old values. `/api/generate` costs an Anthropic call, so it is a
POST and never runs on load. `vite.config.ts` proxies `/api` to port 8788 in
development, so the Vue app calls `/api/...` with no CORS involved.

### Metric capture

`post_metrics` is one row per reading, so a post's curve only exists if
something took the readings. `agent/metrics.ts` owns the cadence: every three
hours while a post is under two days old, daily to the end of its first week,
never after. `collectMetrics` reads what is due and writes one row each; a post
that fails takes only itself down. Without `DATABASE_URL` it makes no API call
at all, since there would be nowhere to put the answer.

Three entry points, same function: `agent.ts metrics` by hand,
`POST /api/metrics/collect` from the dashboard button, and
`scripts/collect-metrics.sh` under `deploy/systemd/threads-agent-metrics.timer`
(hourly — the per-post cadence, not the timer, decides what is actually read).

### The Vue app

Four screens — Огляд, Контент, Стрічка, Налаштування — selected by
`location.hash` through `composables/useView.ts`. No router: four screens do not
earn the dependency, and the hash already gives back, forward and a link that
survives being sent to a phone.

`composables/useDashboard.ts` is the one store every view shares, provided by
`App.vue` and injected by anything below it. Panels no longer own their own copy
of the queue or poke siblings through template refs — that worked while
everything was on one page and breaks the moment the generator and the queue
live on different screens.

`src/api/client.ts` talks to `/api` only — it shares *types* with `src/threads/`
but never imports the client itself, which is what keeps the token out of the
bundle. `src/composables/useResource.ts` holds the load/error/pending pattern
every panel uses; it keeps the old value on refresh so the feed does not blank.

`src/assets/main.css` is the whole design system: light is the base palette and
the dark block only re-points the same custom properties, so no component ever
branches on theme. Two rules that are not negotiable — every number carries
`font-variant-numeric: tabular-nums` (the `.num` class, plus `time`), and the
faint ink tier `--fg-3` is held above 4.5:1 against every ground it lands on,
because it carries real text and not decoration.

Icons are authored SVG in `src/components/AppIcon.vue`, one 24-grid and one
stroke weight. No icon dependency, and no emoji standing in for an icon.

Pure logic that would be awkward to test through a component lives in
`src/lib/` with its tests beside it: `slots.ts` resolves the configured
wall-clock slots into instants in the account's timezone (which is why it
survives a DST change), and `plural.ts` does Ukrainian numeral agreement, since
«4 слотів» reads like machine output.

Run both processes in development: `npm run server` and `npm run dev`.

### Permissions

The current token carries all 11 permissions the app has. `DELETE /v1.0/{id}`
needs `threads_delete`; without it the API answers `code 10: Application does
not have permission for this action` **after** the post is already public, and
it then has to be removed by hand. Check scopes before any publish test.

`/me/threads` lags a few seconds behind a delete — a just-removed post can still
appear in the feed while `GET /{id}` already returns `code 100.33`. Trust the
delete response, not an immediate re-list.

Publishing is two calls: `POST /me/threads` (returns a creation id) then
`POST /me/threads_publish` with `creation_id`. No delay is needed between them
for `media_type=TEXT`. Limits: 250 posts and 100 deletions per 24 hours.

## Deploying the legal pages

GitHub Pages serves `docs/` from the `master` branch (source: `master`, path
`/docs`). Any push to `master` that touches `docs/` goes live immediately on the
URLs registered with Meta — including the OAuth redirect URI. Do not rename or
delete files under `docs/` without checking what Meta has on file.

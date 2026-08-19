# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Threads API agent for the Casy account. Two independent parts in one repo:

- `src/` — Vue 3 + Vite + TypeScript app, the agent's UI. Currently still the
  unmodified `create-vue` scaffold (`HelloWorld.vue`, `TheWelcome.vue`, icons);
  treat it as disposable, not as an existing design to preserve.
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

- `npm run server` — JSON API over the Threads client on port 8787 (`PORT` overrides).
  It loads `.env` itself via `process.loadEnvFile`, so no `source` needed.
- `node scripts/threads.ts <command>` — terminal access to the Threads client
  (`whoami`, `token`, `limits`, `posts`, `post`, `delete`, `insights`, `replies`).
  Needs `source .env` first. Node type-strips the `.ts` directly, no build step —
  which is why imports under `src/threads/`, `scripts/` and `server/` carry
  explicit `.ts` extensions and both tsconfigs set `allowImportingTsExtensions`.
  Type stripping only erases; it cannot emit. Constructor parameter properties
  (`constructor(readonly x: number)`), `enum` and `namespace` crash at load with
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` — assign fields in the body instead.

There is no test setup. Verification = `npm run type-check && npm run lint`.

Node: `^22.18.0 || >=24.12.0` (enforced via `engines`).

## Conventions

- `@/*` is aliased to `./src/*` (both `vite.config.ts` and `tsconfig.app.json`).
- `noUncheckedIndexedAccess` is on — index and object lookups yield `T | undefined`.
- Vue SFCs use `<script setup lang="ts">`.
- Conventional Commits (`feat:`, `fix:`, `docs:`), committed straight to `master`.
  No feature branches, no PRs.

## Threads API

`.env` holds `THREADS_ACCESS_TOKEN`, `THREADS_APP_ID`, `THREADS_APP_SECRET`.
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

### The API server

`server/` puts the client behind same-origin JSON routes so the token stays out
of the browser: `http.ts` is a small router plus the error mapping (Threads codes
→ HTTP status: permission → 403, missing object → 404, quota → 429, anything
else → 502), `index.ts` declares the routes. `vite.config.ts` proxies `/api` to
port 8787 in development, so the Vue app calls `/api/...` with no CORS involved.

### The Vue app

`src/api/client.ts` talks to `/api` only — it shares *types* with `src/threads/`
but never imports the client itself, which is what keeps the token out of the
bundle. `src/composables/useResource.ts` holds the load/error/pending pattern
every panel uses; it keeps the old value on refresh so the feed does not blank.

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

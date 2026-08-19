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

There is no test setup. Verification = `npm run type-check && npm run lint`.

Node: `^22.18.0 || >=24.12.0` (enforced via `engines`).

## Conventions

- `@/*` is aliased to `./src/*` (both `vite.config.ts` and `tsconfig.app.json`).
- `noUncheckedIndexedAccess` is on — index and object lookups yield `T | undefined`.
- Vue SFCs use `<script setup lang="ts">`.
- Conventional Commits (`feat:`, `fix:`, `docs:`), committed straight to `master`.
  No feature branches, no PRs.

## Threads API secrets

`.env` holds `THREADS_ACCESS_TOKEN`, `THREADS_APP_ID`, `THREADS_APP_SECRET`.
It is gitignored and **not** loaded automatically — run `source .env` in each new
shell before any command that talks to the Threads API. Never paste a token or
app secret into chat, a commit, or a file other than `.env`.

## Deploying the legal pages

GitHub Pages serves `docs/` from the `master` branch (source: `master`, path
`/docs`). Any push to `master` that touches `docs/` goes live immediately on the
URLs registered with Meta — including the OAuth redirect URI. Do not rename or
delete files under `docs/` without checking what Meta has on file.

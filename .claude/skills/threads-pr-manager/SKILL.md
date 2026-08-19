---
name: threads-pr-manager
description: Draft, queue, review and publish Threads posts for the @calendarsync account through this repo's agent CLI. Use when asked to write a Threads post, schedule content, check the queue, review what is due, or look at how published posts performed.
---

# Threads PR manager

Runs the content loop for the Casy Threads account. Content is files under
`content/`, so every step is reviewable in git before anything goes public.

## Before anything else

Check what the token can do — permissions change, and a publish that fails on a
missing scope fails *after* the post is already live:

```sh
node scripts/threads.ts token
```

## Writing a draft

Read `content/knowledge/` first if it has anything in it, and the last few
published posts for voice:

```sh
node scripts/threads.ts posts 10
```

Then queue the draft. It lands in `content/queue/` with the next free slot from
`agent.config.json`, and the guardrails run immediately:

```sh
node scripts/agent.ts add "<text>"              # next free slot
node scripts/agent.ts add "<text>" --at 2026-08-20T09:30:00+03:00
```

Guardrails come from `agent.config.json`: length bounds and banned phrases. A
violation is reported, not enforced — the file is still written, so it can be
edited rather than retyped.

## Reviewing

```sh
node scripts/agent.ts list        # everything queued, earliest first
node scripts/agent.ts check       # guardrails across the whole queue
node scripts/agent.ts due         # what would go out right now, and today's usage
node scripts/agent.ts run         # dry run: what would happen, publishes nothing
```

## Publishing

**Never run this without the user asking for it in that turn.** Publishing is
outward-facing and reaches real followers; deleting afterwards does not undo
who saw it.

```sh
node scripts/agent.ts run --yes
```

The daily cap in `agent.config.json` applies; anything over it is skipped, not
queued for later in the day. A failed item keeps its reason in the file's `note`
and stays in the queue.

## After publishing

`/me/threads` lags a few seconds behind writes, so do not treat an immediate
re-read as proof of anything:

```sh
node scripts/agent.ts published
node scripts/threads.ts insights <postId>
node scripts/threads.ts replies <postId>
```

## Watching for inbound

```sh
node scripts/agent.ts watch          # only what has not been reported before
node scripts/agent.ts watch --all    # everything, ignoring the seen-list
```

Terms come from `monitor.keywords` in `agent.config.json` and must be single
words. Mentions currently report as unavailable — that is the app's access
level, not a bug, and the rest of the report is still valid.

## Deleting

Needs `threads_delete` in the token. Ask before removing anything that was not
published by this same session:

```sh
node scripts/threads.ts delete <postId>
```

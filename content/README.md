# content

The agent's working files. Everything here is plain markdown, so drafts, edits
and published history all show up in `git diff` — there is no database and no
hidden state.

| Directory    | What lives here                                                        |
| ------------ | ---------------------------------------------------------------------- |
| `queue/`     | Drafts waiting for their slot. One post per file.                       |
| `published/` | Where a file moves once it goes out, stamped with its post id and link. |
| `knowledge/` | Source material the agent writes from — see `knowledge/README.md`.      |

`plan.md` sits alongside them: the content plan, read by the generator on every
run. A line matching `- [ ] тема` is an open topic and gets ticked to `- [x]`
once a draft written from it reaches the queue. Everything else in the file is
prose the model reads as context — direction for the month, what not to touch.

A queue file is front matter plus the post body:

```markdown
---
status: queued
publishAt: 2026-08-20T09:30:00+03:00
---

The text of the post.
```

`status` is `queued`, `published` or `failed`. A failed item keeps a `note`
with the reason and stays in `queue/` so it can be fixed and retried.

Add items with `node scripts/agent.ts add "…"` rather than by hand — it picks
the next free slot and runs the guardrails immediately. `node scripts/agent.ts
generate` writes them from the plan and the voice config; without `--yes` it
only prints.

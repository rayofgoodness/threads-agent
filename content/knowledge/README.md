# knowledge

Source material the agent writes from. Show it real examples instead of
describing the voice in the abstract — a rule like "write like me" produces
generic copy, ten actual posts do not.

Worth keeping here:

- **`posts/`** — real published posts, at least 5–10, ideally from a channel
  with history. Two posts is not enough of a sample to imitate.
- **`calls/`** — transcripts of demos and customer calls. These carry the words
  customers themselves use for their problems, which is what makes copy land.
- **`product/`** — what Casy actually does, pricing, what it deliberately does
  not do. Prevents the agent from promising features that do not exist.

Every `.md` and `.txt` file here is read into the system prompt on each
generation, `README.md` excluded and each file capped at 12k characters. With
the directory empty the generator is told to avoid specifics — it will not
invent a case study — so filling this in is what moves drafts from plausible to
true.

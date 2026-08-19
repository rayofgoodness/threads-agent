-- Generation history and post analytics.
--
-- Content itself stays in `content/` as markdown — drafts, edits and publish
-- history belong in git. What lands here is the part git is bad at: what the
-- model was asked, what it cost, and how a post performed over time.

CREATE TABLE IF NOT EXISTS generations (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  model         TEXT        NOT NULL,
  brief         TEXT,
  input_tokens  INTEGER     NOT NULL DEFAULT 0,
  output_tokens INTEGER     NOT NULL DEFAULT 0,
  cached_tokens INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS drafts (
  id            BIGSERIAL PRIMARY KEY,
  generation_id BIGINT      NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  -- Position within the generation. Lets the caller tie a queued file back to
  -- the draft it came from without matching on the text.
  position      INTEGER     NOT NULL,
  topic         TEXT        NOT NULL,
  plan_line     INTEGER,
  body          TEXT        NOT NULL,
  note          TEXT,
  violations    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- draft: generated only. queued: written into content/queue/.
  status        TEXT        NOT NULL DEFAULT 'draft',
  queue_file    TEXT,
  UNIQUE (generation_id, position)
);

CREATE INDEX IF NOT EXISTS drafts_generation_idx ON drafts (generation_id);

-- One row per reading, not per post: the point is the curve over time.
CREATE TABLE IF NOT EXISTS post_metrics (
  post_id     TEXT        NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views       INTEGER,
  likes       INTEGER,
  replies     INTEGER,
  reposts     INTEGER,
  quotes      INTEGER,
  PRIMARY KEY (post_id, captured_at)
);

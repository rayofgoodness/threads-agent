#!/bin/bash
# Publishes whatever the queue says is due. Meant for launchd or cron, where
# there is no shell profile, no PATH to speak of and no working directory.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

LOG="$REPO/content/publish.log"
mkdir -p "$(dirname "$LOG")"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >>"$LOG"; }

# nvm installs node outside the paths a launchd job inherits, so resolve it:
# an explicit override first, then PATH, then the newest nvm build.
NODE="${THREADS_AGENT_NODE:-$(command -v node || true)}"
if [ -z "$NODE" ]; then
  # The binary sits at versions/node/<version>/bin/node — three levels down.
  NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 3 -name node -type f -perm -u+x 2>/dev/null | sort -V | tail -1)
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  log "ПОМИЛКА: node не знайдено; задай THREADS_AGENT_NODE"
  exit 127
fi

if [ ! -f "$REPO/.env" ]; then
  log "ПОМИЛКА: немає .env"
  exit 1
fi
set -a
# shellcheck disable=SC1091
. "$REPO/.env"
set +a

OUTPUT=$("$NODE" scripts/agent.ts run --yes 2>&1)
STATUS=$?

# Silence on an empty queue: every 15 minutes of "нічого не готове" would bury
# the entries that matter.
if [ $STATUS -ne 0 ]; then
  log "збій (код $STATUS): $OUTPUT"
elif [ -n "$OUTPUT" ] && ! printf '%s' "$OUTPUT" | grep -q 'Нічого не готове'; then
  while IFS= read -r line; do
    [ -n "$line" ] && log "$line"
  done <<<"$OUTPUT"
fi

# Keep the log from growing without bound.
if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt 2000 ]; then
  tail -1000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $STATUS

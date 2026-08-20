#!/bin/bash
# Takes the post readings that are due. Meant for a systemd timer or cron,
# where there is no shell profile, no PATH to speak of and no working
# directory. Mirrors publish-due.sh; the two share no state.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

LOG="$REPO/content/metrics.log"
mkdir -p "$(dirname "$LOG")"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*" >>"$LOG"; }

# nvm installs node outside the paths a scheduled job inherits, so resolve it:
# an explicit override first, then PATH, then the newest nvm build.
NODE="${THREADS_AGENT_NODE:-$(command -v node || true)}"
if [ -z "$NODE" ]; then
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

OUTPUT=$("$NODE" scripts/agent.ts metrics 2>&1)
STATUS=$?

# A sweep that read nothing is the normal case between cadence steps; logging
# it every hour would bury the sweeps that actually captured something.
if [ $STATUS -ne 0 ]; then
  log "збій (код $STATUS): $OUTPUT"
elif printf '%s' "$OUTPUT" | grep -q 'знято 0'; then
  :
elif [ -n "$OUTPUT" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && log "$line"
  done <<<"$OUTPUT"
fi

if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt 2000 ]; then
  tail -1000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $STATUS

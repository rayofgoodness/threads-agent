#!/usr/bin/env bash
# One-shot installer for the Raspberry Pi. Run on the Pi, as root:
#
#   sudo bash deploy/install.sh
#
# Idempotent: safe to re-run after a git pull to rebuild and restart.
set -euo pipefail

APP_USER=threads
APP_DIR=/opt/threads-agent
REPO=https://github.com/rayofgoodness/threads-agent.git
TZ_WANTED=Europe/Kyiv

die() { echo "ПОМИЛКА: $*" >&2; exit 1; }
note() { echo "→ $*"; }

[ "$(id -u)" -eq 0 ] || die "запускати через sudo"

# ── prerequisites ───────────────────────────────────────────────────────────
command -v node >/dev/null || die "node не встановлений; див. deploy/README.md"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$(node -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  die "потрібен Node ^22.18 або >=24.12, знайдено $(node -v)"
fi
note "node $(node -v)"

# Publishing slots are local time, so the clock has to match the account.
CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo unknown)
if [ "$CURRENT_TZ" != "$TZ_WANTED" ]; then
  note "часовий пояс $CURRENT_TZ → $TZ_WANTED"
  timedatectl set-timezone "$TZ_WANTED"
fi

# ── user and code ───────────────────────────────────────────────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  note "створюю користувача $APP_USER"
  useradd --system --create-home --home-dir "$APP_DIR" "$APP_USER"
fi

if [ -d "$APP_DIR/.git" ]; then
  note "оновлюю код"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  note "клоную репозиторій"
  # `useradd --create-home` already populated $APP_DIR from /etc/skel, and git
  # refuses a non-empty target — so clone beside it and move the contents in.
  # The clone runs as root because /opt is not writable by the service user.
  rm -rf "$APP_DIR.tmp"
  git clone "$REPO" "$APP_DIR.tmp"
  shopt -s dotglob
  mv "$APP_DIR.tmp"/* "$APP_DIR"/
  shopt -u dotglob
  rmdir "$APP_DIR.tmp"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

# `cd` rather than `npm --prefix`: the build writes dist/ relative to the
# working directory, and the server looks for it next to itself.
note "встановлюю залежності і збираю дашборд"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci && npm run build"

# ── secrets ─────────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  note "створюю заготовку .env — заповни її перед стартом"
  cat >"$APP_DIR/.env" <<EOF
THREADS_ACCESS_TOKEN=
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_AGENT_TOKEN=$(openssl rand -base64 32)
# Лише для генерації постів на цій машині; публікація черги його не потребує.
ANTHROPIC_API_KEY=
# Необовʼязково: історія генерацій і метрики. Без нього все працює так само.
DATABASE_URL=
EOF
  ENV_WAS_CREATED=1
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

# ── services ────────────────────────────────────────────────────────────────
note "ставлю systemd-юніти"
install -m 644 "$APP_DIR/deploy/systemd/threads-agent.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/threads-agent-publish.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/threads-agent-publish.timer" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/threads-agent-metrics.service" /etc/systemd/system/
install -m 644 "$APP_DIR/deploy/systemd/threads-agent-metrics.timer" /etc/systemd/system/
systemctl daemon-reload

if [ -n "${ENV_WAS_CREATED:-}" ]; then
  cat <<EOF

Заготовка .env створена, токени порожні. Заповни $APP_DIR/.env, потім:

  sudo systemctl enable --now threads-agent.service
  sudo systemctl enable --now threads-agent-publish.timer
  sudo systemctl enable --now threads-agent-metrics.timer

Таймер публікації публікує з черги без підтвердження — вмикай, коли впевнений
у вмісті. Таймер метрик лише читає; без DATABASE_URL він не робить жодного
запиту.
EOF
  exit 0
fi

note "перезапускаю сервіс"
systemctl enable threads-agent.service
systemctl restart threads-agent.service
sleep 2
systemctl is-active --quiet threads-agent.service ||
  die "сервіс не піднявся: journalctl -u threads-agent -n 30"

if command -v curl >/dev/null; then
  note "/api/health відповідає $(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $(grep -E '^THREADS_AGENT_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)" \
    http://127.0.0.1:8788/api/health)"
fi

cat <<EOF

Готово. Таймери вмикаються окремо:

  sudo systemctl enable --now threads-agent-publish.timer
  sudo systemctl enable --now threads-agent-metrics.timer

Перший публікує з черги без підтвердження. Другий лише знімає метрики постів
і без DATABASE_URL не робить жодного запиту.
EOF

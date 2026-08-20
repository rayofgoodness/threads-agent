#!/usr/bin/env bash
# One-shot installer for the Raspberry Pi. Run on the Pi, as root:
#
#   sudo bash deploy/install.sh
#
# Idempotent: safe to re-run. This is *setup*, not deploy — the deploy itself is
# scripts/deploy.sh and needs no root at all. What still needs root: the systemd
# units, the sudoers rule, and (once) moving the old /opt deployment across.
#
# The layout matches the other projects on this Pi (observer-app, foodie): the
# service runs as `pi` out of ~/Projects, so the working copy and production are
# the same tree.
set -euo pipefail

APP_USER=pi
APP_DIR=/home/pi/Projects/threads-agent
REPO=https://github.com/rayofgoodness/threads-agent.git
TZ_WANTED=Europe/Kyiv

# The deployment this replaces. Left in place on purpose — removing it is a
# separate, deliberate step, printed at the end.
OLD_DIR=/opt/threads-agent
OLD_USER=threads

SUDOERS=/etc/sudoers.d/020_pi-deploy

die() { echo "ПОМИЛКА: $*" >&2; exit 1; }
note() { echo "→ $*"; }

[ "$(id -u)" -eq 0 ] || die "запускати через sudo"

# ── prerequisites ───────────────────────────────────────────────────────────
# /usr/bin/node explicitly: that is what the units start, and nvm's node (which
# `command -v` would find in an interactive shell) is a different, older build.
NODE=/usr/bin/node
[ -x "$NODE" ] || die "немає $NODE; див. deploy/README.md"
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]')
NODE_MINOR=$("$NODE" -p 'process.versions.node.split(".")[1]')
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 18 ]; }; then
  die "потрібен Node ^22.18 або >=24.12, знайдено $("$NODE" -v)"
fi
note "node $("$NODE" -v)"

# Publishing slots are local time, so the clock has to match the account.
CURRENT_TZ=$(timedatectl show --property=Timezone --value 2>/dev/null || echo unknown)
if [ "$CURRENT_TZ" != "$TZ_WANTED" ]; then
  note "часовий пояс $CURRENT_TZ → $TZ_WANTED"
  timedatectl set-timezone "$TZ_WANTED"
fi

# ── code ────────────────────────────────────────────────────────────────────
if [ ! -d "$APP_DIR/.git" ]; then
  note "клоную репозиторій у $APP_DIR"
  sudo -u "$APP_USER" mkdir -p "$(dirname "$APP_DIR")"
  sudo -u "$APP_USER" git clone "$REPO" "$APP_DIR"
fi

# ── migrating off /opt ──────────────────────────────────────────────────────
# Everything under content/ except the state files is tracked, so git carries it
# across by itself. What git cannot carry: .env, and whatever the dashboard
# wrote into the old tree without anyone committing it.
if [ -d "$OLD_DIR" ]; then
  note "знайдено стару інсталяцію в $OLD_DIR — переношу те, чого нема в git"

  systemctl stop threads-agent.service threads-agent-publish.timer \
    threads-agent-metrics.timer 2>/dev/null || true

  if [ -f "$OLD_DIR/.env" ] && [ ! -f "$APP_DIR/.env" ]; then
    note "переношу .env"
    cp -p "$OLD_DIR/.env" "$APP_DIR/.env"
  elif [ -f "$OLD_DIR/.env" ]; then
    # Both exist and both are real: the old one is what production ran on, the
    # new one is the dev file that was already in the working copy. Merge rather
    # than pick — production wins every key it actually has a value for, and the
    # dev file fills the blanks (typically ANTHROPIC_API_KEY and DATABASE_URL,
    # which the /opt skeleton left empty). Both originals are kept.
    note "зливаю два .env: прод має пріоритет, робочий заповнює порожні ключі"
    cp -p "$APP_DIR/.env" "$APP_DIR/.env.dev-backup"
    cp -p "$OLD_DIR/.env" "$APP_DIR/.env.opt-backup"

    awk -F= '
      # Pass 1: the dev file, as fallback values.
      NR == FNR {
        if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
          key = $1; sub(/^[^=]*=/, "", $0); dev[key] = $0
        }
        next
      }
      # Pass 2: production, in its own order, blanks filled from dev.
      {
        if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
          key = $1; value = $0; sub(/^[^=]*=/, "", value)
          seen[key] = 1
          if (value == "" && key in dev && dev[key] != "") {
            print key "=" dev[key]; filled = filled " " key
            next
          }
        }
        print
      }
      END {
        # Keys the dev file has and production never knew about.
        for (key in dev) if (!(key in seen) && dev[key] != "") {
          print key "=" dev[key]; added = added " " key
        }
        if (filled != "") print "# заповнено з робочого .env:" filled > "/dev/stderr"
        if (added != "") print "# додано з робочого .env:" added > "/dev/stderr"
      }
    ' "$APP_DIR/.env.dev-backup" "$APP_DIR/.env.opt-backup" >"$APP_DIR/.env.merged"

    mv "$APP_DIR/.env.merged" "$APP_DIR/.env"
    ENV_WAS_MERGED=1
  fi

  # Gitignored state: dedupe keys for the monitor, and the two logs.
  for f in content/monitor-state.json content/publish.log content/metrics.log; do
    if [ -f "$OLD_DIR/$f" ] && [ ! -f "$APP_DIR/$f" ]; then
      note "переношу $f"
      cp -p "$OLD_DIR/$f" "$APP_DIR/$f"
    fi
  done

  # Content the dashboard wrote into the old tree and nobody committed: drafts,
  # queued items, publish results. Copied in as uncommitted changes so it shows
  # up in `git status` and gets reviewed rather than applied silently.
  MOVED=$(sudo -u "$OLD_USER" git -C "$OLD_DIR" status --porcelain -- content 2>/dev/null | wc -l)
  if [ "$MOVED" -gt 0 ]; then
    BACKUP="/home/$APP_USER/threads-agent-opt-content-backup"
    note "у старому дереві $MOVED незакомічених файлів у content/ — копія в $BACKUP"
    rm -rf "$BACKUP"
    cp -a "$OLD_DIR/content" "$BACKUP"
    chown -R "$APP_USER:$APP_USER" "$BACKUP"
    CONTENT_NEEDS_REVIEW=1
  fi

  chown -R "$APP_USER:$APP_USER" "$APP_DIR/content" 2>/dev/null || true
fi

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

# ── sudo ────────────────────────────────────────────────────────────────────
# The deploy needs root for exactly one thing. Written through a temp file and
# validated first: a broken sudoers file locks sudo out of the machine.
note "правило sudo для рестарту"
TMP_SUDOERS=$(mktemp)
cat >"$TMP_SUDOERS" <<'EOF'
# Деплой threads-agent (scripts/deploy.sh) — рестарт юніта і більше нічого.
# Обидва написання: systemctl приймає і коротке ім'я, і з .service, а sudoers
# зіставляє рядок буквально.
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart threads-agent
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart threads-agent.service

# Належить сусідньому проєкту observer на цій же малині.
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart observer-api
EOF
visudo -cf "$TMP_SUDOERS" >/dev/null || { rm -f "$TMP_SUDOERS"; die "sudoers не проходить перевірку"; }
install -m 440 -o root -g root "$TMP_SUDOERS" "$SUDOERS"
rm -f "$TMP_SUDOERS"

# ── build ───────────────────────────────────────────────────────────────────
# As `pi`, with /usr/bin first so the build uses the same node the unit starts.
note "встановлюю залежності і збираю дашборд"
sudo -u "$APP_USER" env PATH=/usr/bin:/bin:/usr/local/bin \
  bash -c "cd '$APP_DIR' && npm ci && npm run build"

# ── services ────────────────────────────────────────────────────────────────
note "ставлю systemd-юніти"
for u in threads-agent.service threads-agent-publish.service \
  threads-agent-publish.timer threads-agent-metrics.service \
  threads-agent-metrics.timer; do
  install -m 644 "$APP_DIR/deploy/systemd/$u" /etc/systemd/system/
done
systemctl daemon-reload

if [ -n "${ENV_WAS_CREATED:-}" ]; then
  cat <<EOF

Заготовка .env створена, токени порожні. Заповни $APP_DIR/.env, потім:

  sudo systemctl enable --now threads-agent.service
  sudo systemctl enable --now threads-agent-publish.timer
  sudo systemctl enable --now threads-agent-metrics.timer

Таймер публікує з черги без підтвердження — вмикай, коли впевнений у вмісті.
EOF
  exit 0
fi

note "перезапускаю сервіс"
systemctl enable threads-agent.service
systemctl restart threads-agent.service
sleep 2
systemctl is-active --quiet threads-agent.service ||
  die "сервіс не піднявся: journalctl -u threads-agent -n 30"

note "/api/health відповідає $(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $(grep -E '^THREADS_AGENT_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)" \
  http://127.0.0.1:8788/api/health)"

cat <<EOF

Готово. Сервіс працює від $APP_USER з $APP_DIR.

Таймери окремо — вони діють без підтвердження:

  sudo systemctl enable --now threads-agent-publish.timer
  sudo systemctl enable --now threads-agent-metrics.timer
EOF

if [ -n "${ENV_WAS_MERGED:-}" ]; then
  cat <<EOF

.env зібраний із двох. Оригінали поруч, поки не переконаєшся:
  $APP_DIR/.env.opt-backup  — прод із /opt
  $APP_DIR/.env.dev-backup  — робочий, що вже лежав тут
Перевір: node scripts/threads.ts whoami
EOF
fi

if [ -n "${CONTENT_NEEDS_REVIEW:-}" ]; then
  cat <<EOF

УВАГА: у старому дереві був незакомічений контент. Копія лежить у
/home/$APP_USER/threads-agent-opt-content-backup — звір із content/ і закомить,
чого бракує.
EOF
fi

cat <<EOF

Стару інсталяцію не чіпав. Коли переконаєшся, що все працює:

  sudo systemctl disable --now threads-agent-publish.timer  # якщо лишились старі
  sudo rm -rf $OLD_DIR
  sudo userdel $OLD_USER
EOF

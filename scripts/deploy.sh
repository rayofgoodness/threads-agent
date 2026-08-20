#!/usr/bin/env bash
#
# Деплой threads-agent на RPi. Викликається self-hosted GitHub Actions
# runner'ом (.github/workflows/ci.yml) після успішного CI, або вручну:
#
#   ./scripts/deploy.sh
#
# Прод і робоча директорія — одна папка, як в observer-app і foodie на цій же
# машині. Тому скрипт відмовляється працювати, якщо в дереві є незакомічені
# зміни: затирати чиюсь незбережену роботу автодеплоєм не можна.
#
# Sudo потрібне рівно на одну дію — рестарт юніта. Правило в
# /etc/sudoers.d/020_pi-deploy дозволяє саме її, без пароля.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/pi/Projects/threads-agent}"
SERVICE="${SERVICE:-threads-agent}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8788/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
LOCK_FILE="${LOCK_FILE:-/tmp/threads-agent-deploy.lock}"

# /usr/bin перший: systemd стартує сервіс через /usr/bin/node, тож збираємо тим
# самим node, а не тим, що nvm підсовує в інтерактивний шел. Node 20 з nvm не
# витягнув би ні type stripping у server/index.ts, ні `engines`.
export PATH="/usr/bin:/bin:/usr/local/bin"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

# Один деплой за раз — паралельні прогони затопчуть один одного на білді.
exec 9>"$LOCK_FILE"
flock -n 9 || die "інший деплой уже виконується ($LOCK_FILE)"

cd "$APP_DIR"

[ -f .env ] || die "немає $APP_DIR/.env — сервіс не підніметься без токенів"

log "Стан робочого дерева"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  die "у робочому дереві є незакомічені зміни — деплой скасовано.
    Закомить або прибери їх (git stash), потім перезапусти workflow."
fi

PREV_SHA="$(git rev-parse HEAD)"
log "Поточний коміт: $PREV_SHA"

log "Тягну origin/master"
git fetch --prune origin master
git merge --ff-only origin/master

NEW_SHA="$(git rev-parse HEAD)"
if [[ "$NEW_SHA" == "$PREV_SHA" ]]; then
  log "Нових комітів немає — пересобираю з поточного стану"
else
  log "Оновлено: $PREV_SHA -> $NEW_SHA"
  git --no-pager log --oneline "$PREV_SHA..$NEW_SHA"
fi

build() {
  log "Залежності"
  npm ci

  # Тайпчек і тести вже пройшли в CI на Node 22 і 24, але ручний запуск
  # скрипта їх не бачив — і білд усе одно тягне type-check за собою.
  log "Тести"
  npm test

  # Падаємо ДО рестарту сервіса: старий dist лишається живим.
  log "Білд дашборда"
  npm run build
}

restart() {
  log "Рестарт $SERVICE"
  # Окремо від health-check і з -n, щоб не висіти на запиті пароля: відмова
  # sudo — це «немає права», а не «сервіс не піднявся». Зливати їх в одне
  # означає відкочувати код у відповідь на проблему з sudoers.
  sudo -n systemctl restart "$SERVICE" || die "не вдалося перезапустити $SERVICE.
    Потрібен рядок у /etc/sudoers.d/020_pi-deploy:
      pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart $SERVICE
    Його виписує sudo bash deploy/install.sh."
}

health_check() {
  # /api/* закритий Bearer-токеном, тож health-check несе його з .env.
  local token
  token="$(grep -E '^THREADS_AGENT_TOKEN=' "$APP_DIR/.env" | cut -d= -f2-)"

  log "Health-check $HEALTH_URL (до ${HEALTH_TIMEOUT}s)"
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  while ((SECONDS < deadline)); do
    # -s без -S: поки сервіс піднімається, curl законно фейлиться — не шумимо.
    if curl -fs -o /dev/null --max-time 5 \
      -H "Authorization: Bearer $token" "$HEALTH_URL"; then
      log "Сервіс відповідає"
      return 0
    fi
    sleep 2
  done
  return 1
}

build
restart

if health_check; then
  log "Деплой успішний: $(git rev-parse --short HEAD)"
  exit 0
fi

journalctl -u "$SERVICE" -n 40 --no-pager || true

# Пересборка з того самого коміту нічого не полагодить, а git reset --hard на
# HEAD створює хибне враження, що прод відкотили.
if [[ "$NEW_SHA" == "$PREV_SHA" ]]; then
  die "сервіс не пройшов health-check, і відкочуватись нема куди — коміт той самий ($PREV_SHA)"
fi

# Білд пройшов, але новий код не піднявся — вертаємо прод на попередній коміт.
printf '\n\033[1;31m!!! health-check провалився — відкочуюсь на %s\033[0m\n' "$PREV_SHA" >&2
git reset --hard "$PREV_SHA"
build
restart
if health_check; then
  die "деплой $NEW_SHA провалив health-check; прод відкочено на $PREV_SHA"
fi

die "деплой провалився І відкат на $PREV_SHA теж не піднявся — потрібне ручне втручання"

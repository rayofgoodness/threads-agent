# Deploying to a Raspberry Pi behind Cloudflare

The Pi runs one Node process serving both the API and the built dashboard on
loopback; `cloudflared` dials out to Cloudflare and forwards the hostname to it.
Nothing is port-forwarded, and the origin is never reachable directly.

```
browser → https://threads.quarters.casa → Cloudflare edge (TLS, Access) → tunnel → 127.0.0.1:8788 on the Pi
```

## Before anything: the API is not read-only

`/api` can publish and delete posts in the Threads account. Two layers guard it,
and neither is optional once the host is on the internet:

1. **`THREADS_AGENT_TOKEN`** — a shared secret the server requires on every
   `/api` request. Without it set, the server refuses to listen on anything but
   loopback. Generate one with `openssl rand -base64 32`.
2. **Cloudflare Access** — put a Zero Trust application in front of the
   hostname, so the origin is only reachable after you authenticate at the edge.
   The shared secret then protects against a misconfigured Access policy rather
   than being the only thing between the internet and the account.

## Requirements

- Raspberry Pi OS (64-bit) — the arm64 build, not armhf
- Node `^22.18.0 || >=24.12.0`. Raspberry Pi OS ships an older one; install from
  NodeSource:
  ```sh
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
  node -v
  ```
- The Pi's clock must be in the account's timezone — publishing slots are local
  time:
  ```sh
  sudo timedatectl set-timezone Europe/Kyiv
  ```

## Install

One command does all of it — user, clone, dependencies, build, systemd units —
and is safe to re-run after a `git pull`:

```sh
sudo bash deploy/install.sh
```

On the first run it writes an `.env` skeleton with a generated
`THREADS_AGENT_TOKEN` and stops, so the services never start without the Threads
credentials. Fill it in, then enable them.

The manual equivalent, if you would rather see each step:

```sh
sudo useradd --system --create-home --home-dir /opt/threads-agent threads
sudo -u threads git clone https://github.com/rayofgoodness/threads-agent.git /opt/threads-agent
cd /opt/threads-agent
sudo -u threads npm ci
sudo -u threads npm run build      # produces dist/, which the server serves
```

Create `/opt/threads-agent/.env` (owned by `threads`, mode `0600`):

```sh
THREADS_ACCESS_TOKEN=...
THREADS_APP_ID=...
THREADS_APP_SECRET=...
THREADS_AGENT_TOKEN=...     # openssl rand -base64 32
ANTHROPIC_API_KEY=...       # тільки якщо генерувати пости на самій малині
DATABASE_URL=...            # необовʼязково; історія генерацій і метрик
```

`ANTHROPIC_API_KEY` потрібен лише для `/api/generate` і `agent.ts generate`.
Публікація черги без нього працює, тож якщо чернетки пишуться на ноуті й
доїжджають у `content/queue` через git, ключ на малині не потрібен.

Postgres із `docker-compose.yml` на малину не їде за замовчуванням — без
`DATABASE_URL` сервер просто не веде історію.

```sh
sudo chown threads:threads /opt/threads-agent/.env
sudo chmod 600 /opt/threads-agent/.env
```

## Services

```sh
sudo cp deploy/systemd/threads-agent.service /etc/systemd/system/
sudo cp deploy/systemd/threads-agent-publish.service /etc/systemd/system/
sudo cp deploy/systemd/threads-agent-publish.timer /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now threads-agent.service          # API + dashboard
sudo systemctl enable --now threads-agent-publish.timer    # queue, every 15 min

systemctl status threads-agent
systemctl list-timers threads-agent-publish
journalctl -u threads-agent -f
```

The timer replaces the launchd job used on macOS. **While it is enabled,
anything in the queue goes public without review** — `systemctl disable --now
threads-agent-publish.timer` is the off switch.

## Continuous deployment

A push to `master` deploys itself. `.github/workflows/ci.yml` runs the checks on
GitHub-hosted runners, and only then a `deploy` job lands on a self-hosted
runner living on the Pi (`~/actions-runner-threads`, systemd unit
`actions.runner.rayofgoodness-threads-agent.threads-rpi`, running as `pi`).

That job is gated on `github.event_name == 'push'` for a reason: **the repo is
public**, and a pull request from a fork must never execute on this machine. It
also takes no `actions/checkout` — `install.sh` pulls into `/opt/threads-agent`
itself, so the runner's own working copy never becomes a second source of truth.

The runner user's sudo is narrow — `/etc/sudoers.d/020_pi-deploy` grants
passwordless root for the installer and nothing else:

```sudoers
pi ALL=(root) NOPASSWD: /opt/threads-agent/deploy/install.sh
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart observer-api
```

The second line belongs to the unrelated `observer` runner on the same Pi;
removing the broad `NOPASSWD: ALL` without it would have broken that deploy.
Note the limit of this: `pi` is still in the `docker` group, which is
root-equivalent, so this narrows the obvious path rather than sealing the box.

Registering another runner needs a registration token from
*Settings → Actions → Runners → New self-hosted runner*, then:

```sh
cd ~/actions-runner-threads
./config.sh --url https://github.com/rayofgoodness/threads-agent \
  --token <REGISTRATION_TOKEN> --name threads-rpi --labels threads-agent \
  --work _work --unattended --replace
sudo ./svc.sh install pi && sudo ./svc.sh start
```

## Postgres on the Pi

Optional everywhere else, but it is running here:

```sh
sudo docker compose -f /opt/threads-agent/docker-compose.yml up -d
sudo -u threads bash -c 'cd /opt/threads-agent && npm run db:migrate'
```

`POSTGRES_*` and `DATABASE_URL` go into `/opt/threads-agent/.env` with a
generated password, not the `threads:threads` default from `.env.example` — the
port is on loopback, but every process on the machine can reach it.

The container runs under root and the service talks to it over TCP; `threads` is
deliberately **not** in the `docker` group, since that group is root-equivalent
and a Postgres client needs nothing of the sort. `restart: unless-stopped` brings
it back after a reboot. `threads-agent.service` has no `After=docker.service`,
so on boot the server may start first — `tryRecord` swallows the failure, and
only the first few history writes are lost.

## The tunnel

The dashboard is served at `threads.quarters.casa`. The zone is already on
Cloudflare (nameservers `karl`/`maria.ns.cloudflare.com`).

**The Pi already runs a tunnel, and it is not ours alone.** One `cloudflared`
service (`/etc/cloudflared/config.yml`) carries `observer.`, `grafana.` and
`mcp.quarters.casa` as well. So this is an *addition*, not an install:
`cp`-ing `deploy/cloudflared/config.yml` over the live file takes those three
offline. Add the ingress entry above the trailing `http_status:404` — the first
matching rule wins.

The apex `quarters.casa` is deliberately left alone: it resolves to a proxied
record with no origin behind it and answers **521**. That is pre-existing and
unrelated to this service.

```sh
# as pi, not root: `cloudflared tunnel route dns` reads ~/.cloudflared/cert.pem,
# and under sudo it looks in root's home and fails with "no file cert.pem"
cloudflared tunnel route dns threads-agent threads.quarters.casa

sudoedit /etc/cloudflared/config.yml   # add the ingress entry
sudo systemctl restart cloudflared
sudo systemctl status cloudflared
```

Verify from outside the network — a 521 afterwards means the tunnel is up but
the origin is not, and a 502 means the tunnel reached the Pi and the Node
service is down:

```sh
curl -sI https://threads.quarters.casa | head -3
```

Then, in Cloudflare Zero Trust → Access → Applications, add a self-hosted
application for `threads.quarters.casa` and a policy limiting it to your own
email. Do this **before** the tunnel goes live if the queue is not empty:
between routing the DNS and adding the policy, the dashboard is reachable by
anyone who knows the name, and only `THREADS_AGENT_TOKEN` stands in the way.

## Notes for this setup

- **Do not enable Cloudflare caching for `/api`.** The dashboard reads live
  data; a cached `/api/posts` shows a stale feed. Assets under `/assets/` are
  content-hashed and safe to cache — the server already sends `immutable` for
  them and `no-cache` for `index.html`.
- **Cloudflare terminates TLS**, so the origin speaks plain HTTP over the
  tunnel. That is fine here because the tunnel itself is encrypted and the
  origin only listens on loopback.
- **The visitor's IP arrives in `CF-Connecting-IP`**, not in the socket address.
  Nothing here logs or rate-limits by IP, so there is nothing to adjust — but do
  not start trusting `X-Forwarded-For` without stripping it at the edge first.
- **Websockets are not used**, so no extra tunnel configuration is needed.
- **The subdomain is proxied**, so Cloudflare's own TLS certificate covers it.
  Nothing on the Pi needs a certificate.
- **Port 8788, not 8787.** `claude-notify-server` (PM2) already holds 8787 on
  loopback, and the second listener dies with `EADDRINUSE`.
- **The legal pages stay on GitHub Pages, not on the Pi.** Meta needs the privacy
  and data-deletion URLs reachable at all times; a Pi at home is not. See the
  runbook below for putting them on a subdomain without taking them down.
- **The OAuth redirect URI stays on GitHub Pages**
  (`https://rayofgoodness.github.io/threads-agent/callback.html`) and must not
  follow the dashboard onto `threads.quarters.casa`: that hostname now resolves
  to the Pi, which is off half the time, and a redirect URI that answers 521
  breaks re-authorization. Moving it anywhere requires changing the Redirect
  Callback URLs field in the Meta app in the same step — one side alone breaks
  it. The legal pages Meta reviewed are in the same position.
- **Updating**: `git pull && npm ci && npm run build && sudo systemctl restart
threads-agent`. The queue lives in `content/`, which is not touched by a pull
  unless you commit queue files.
- **The Threads token expires every 60 days.** Refresh it before then and
  restart the service; the agent does not renew it on its own yet.

## Runbook: moving the legal pages to a subdomain

> ⚠ **On hold: the hostname is taken.** This runbook was written for
> `threads.quarters.casa`, which now points at the tunnel and serves the
> dashboard. One name cannot be a `CNAME` to `rayofgoodness.github.io` and to
> `<tunnel>.cfargotunnel.com` at once. Pick a different subdomain (`legal.`)
> before following the steps, and substitute it everywhere below.

They stay on GitHub Pages; only the hostname changes. **The order matters.**
GitHub starts serving a `301` to the custom domain the moment it is configured,
without waiting for DNS — so a domain set before the record exists takes the
privacy policy, the deletion instructions and the OAuth callback offline, which
are exactly the URLs Meta has on file.

1. **DNS first.** In Cloudflare, add `threads` as a `CNAME` to
   `rayofgoodness.github.io`, set to **DNS only** (grey cloud). Proxying it now
   blocks the certificate check GitHub runs. Confirm it resolves:

   ```sh
   dig +short threads.quarters.casa
   ```

2. **Then the domain.** Either commit `docs/CNAME` containing
   `threads.quarters.casa`, or:

   ```sh
   gh api -X PUT repos/rayofgoodness/threads-agent/pages -f cname=threads.quarters.casa
   ```

3. **Wait for the certificate** — up to about fifteen minutes. Until it is
   issued, https fails while http works:

   ```sh
   gh api repos/rayofgoodness/threads-agent/pages --jq '{cname, status, https_enforced}'
   curl -sI https://threads.quarters.casa/privacy.html | head -1
   ```

4. **Update the Meta app** — App Dashboard → Threads PR Manager → Use Case
   "Access the Threads API" → Settings:
   - Redirect Callback URLs → `https://threads.quarters.casa/callback.html`.
     Add it _beside_ the GitHub Pages one rather than replacing it, so an
     authorization in flight does not break; remove the old entry afterwards.
   - Privacy Policy URL, Data Deletion URL and Terms of Service URL in App
     Settings → Basic, likewise pointed at the new host.

5. **Verify** the whole set answers `200` over https:

   ```sh
   for page in "" privacy.html data-deletion.html terms.html callback.html; do
     curl -s -o /dev/null -w "$page %{http_code}\n" "https://threads.quarters.casa/$page"
   done
   ```

To undo at any point: clear the domain
(`gh api -X PUT .../pages -f cname=""`) and delete `docs/CNAME`. The old
`rayofgoodness.github.io/threads-agent/` URLs come back within a minute.

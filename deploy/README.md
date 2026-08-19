# Deploying to a Raspberry Pi behind Cloudflare

The Pi runs one Node process serving both the API and the built dashboard on
loopback; `cloudflared` dials out to Cloudflare and forwards the hostname to it.
Nothing is port-forwarded, and the origin is never reachable directly.

```
browser → Cloudflare edge (TLS, Access) → tunnel → 127.0.0.1:8787 on the Pi
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
```

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

## The tunnel

```sh
cloudflared tunnel login
cloudflared tunnel create threads-agent
cloudflared tunnel route dns threads-agent threads.example.com
sudo cp deploy/cloudflared/config.yml /etc/cloudflared/config.yml
# edit the tunnel id, credentials path and hostname
sudo cloudflared service install
sudo systemctl status cloudflared
```

Then, in Cloudflare Zero Trust → Access → Applications, add a self-hosted
application for the hostname and a policy limiting it to your own email.

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
- **Updating**: `git pull && npm ci && npm run build && sudo systemctl restart
threads-agent`. The queue lives in `content/`, which is not touched by a pull
  unless you commit queue files.
- **The Threads token expires every 60 days.** Refresh it before then and
  restart the service; the agent does not renew it on its own yet.

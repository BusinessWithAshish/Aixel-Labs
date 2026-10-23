#!/usr/bin/env bash
# Zero-downtime deploy of the backend's services, each on its own.
#
#   deploy.sh [git-ref] [service...]   default ref: origin/main (fetched first)
#   deploy.sh --plan [git-ref]         print what would deploy, change nothing
#   deploy.sh --prune [unit]           delete releases nothing uses (each slot's
#                                      ExecStopPost runs this once it has drained)
#
# With no services named, only the ones whose files changed since the commit each
# one runs now are deployed (all of them, the first time). Naming services
# deploys exactly those: `deploy.sh <older-sha> api` is a rollback of the api, and
# naming the sha a service already runs starts a fresh slot of it, which is how a
# changed .env (or any untracked runtime file) goes live. Never `systemctl
# restart` a live slot for that: it is down until it comes back.
#
# For each service:
# 1. Build the commit into releases/<sha>/ once (git archive + pnpm install
#    --frozen-lockfile + tsc), shared by every service. The checkout's own dist/
#    is never touched. A sha that is already built is reused.
# 2. Start it in the service's idle slot (aixel-labs-<service>@<port>) and poll
#    its health path. No 200 in time: the new slot is stopped and the live one is
#    left exactly as it was.
# 3. Point Caddy at the new slot (the one `to` line in
#    /etc/caddy/aixel-labs-<service>.upstream) and reload it gracefully.
# 4. SIGTERM the old slot and move on. It drains on its own (server.ts: in-flight
#    requests; the games: running matches; the voice engine, phone.py: running
#    calls) and, once it exits, its ExecStopPost
#    prunes old releases. Only the newest $KEEP releases and whatever a slot still
#    runs survive.
# Then deploy/Caddyfile is installed if it differs from the live one.
#
# Only committed code deploys: commit (and push, for the default ref) first.
set -euo pipefail

BACKEND="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(dirname "$BACKEND")"
RELEASES="$BACKEND/releases"
# The units run the main checkout's releases/: a worktree's copy would build and switch slots nobody runs.
[[ "$(git -C "$REPO" rev-parse --path-format=absolute --git-dir)" == "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)" ]] \
  || { echo "deploy.sh: run it from the main checkout ($(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir | xargs dirname)), not a worktree" >&2; exit 1; }
KEEP=3
HEALTH_TIMEOUT=120
NODE=/home/ubuntu/.local/bin/node # the units' node (ExecStart)

# --- services -----------------------------------------------------------------
# A service is a systemd template, deploy/aixel-labs-<service>@.service, whose
# instance is a port; it has two slots, one live behind Caddy and one idle.
SERVICES=(api games voice)
declare -A SLOTS=([api]="8101 8102" [games]="8111 8112" [voice]="8121 8122")
declare -A HEALTH=([api]=/v1/ping [games]=/v1/ping [voice]=/health)
# Paths a service owns besides the api, which owns everything else under backend/.
declare -A OWNS=([games]="backend/src/api/business backend/src/api/bluff backend/src/api/game-sockets.ts" [voice]="backend/voice")
# Boot code every Node service runs: a change here redeploys all of them (not voice, which is Python).
SHARED="backend/src/server.ts backend/src/routes.ts backend/src/config.ts backend/package.json backend/tsconfig.json pnpm-lock.yaml"
NODE_SERVICES="api games"
# The voice engine's runtime state: kept in the checkout's backend/voice (untracked) and linked into
# every release with the rest of its untracked files. Made before linking, so a release never starts
# a copy of its own that the next deploy would lose.
VOICE_STATE_DIRS="calls cache"
VOICE_STATE_FILES="suppressed.jsonl turns.jsonl"

log() { printf '[deploy %s IST] %s\n' "$(TZ=Asia/Kolkata date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }
is_service() { [[ " ${SERVICES[*]} " == *" $1 "* ]]; }
# "deactivating" is still running: a slot is only stopped once it is inactive or failed.
stopped() { [[ "$(systemctl show -p ActiveState --value "$1")" =~ ^(inactive|failed)$ ]]; }
upstream_file() { echo "/etc/caddy/aixel-labs-$1.upstream"; }
live_port() { sed -n 's/^to 127\.0\.0\.1:\([0-9]*\)$/\1/p' "$(upstream_file "$1")" 2>/dev/null || true; }

# Does a change to repo path $2 redeploy service $1?
affects() {
  local svc=$1 file=$2 owner=api other path
  [[ "$file" == *.md ]] && return 1
  [[ "$file" == "backend/deploy/aixel-labs-$svc@.service" ]] && return 0
  [[ "$file" == backend/deploy/* ]] && return 1
  if [[ " $NODE_SERVICES " == *" $svc "* ]]; then
    for path in $SHARED; do [[ "$file" == "$path" ]] && return 0; done
  fi
  for other in "${!OWNS[@]}"; do
    for path in ${OWNS[$other]}; do [[ "$file" == "$path" || "$file" == "$path"/* ]] && owner=$other; done
  done
  [[ "$owner" == "$svc" ]]
}

# The services $1 (a sha) changes, against the release each one runs now.
changed_services() {
  local sha=$1 svc port running file
  for svc in "${SERVICES[@]}"; do
    port="$(live_port "$svc")"
    running="$(readlink "$RELEASES/slot-$svc-$port" 2>/dev/null || true)"
    if [[ -z "$port" || -z "$running" ]] || ! git -C "$REPO" cat-file -e "$running^{commit}" 2>/dev/null; then
      echo "$svc"; continue # never deployed in this layout
    fi
    [[ "$running" == "$sha" ]] && continue
    while IFS= read -r file; do
      if affects "$svc" "$file"; then echo "$svc"; break; fi
    done < <(git -C "$REPO" diff --name-only "$running" "$sha" -- backend pnpm-lock.yaml)
  done
}

# Delete every release no slot uses, keeping the newest $KEEP deployed. $1, a
# unit in its ExecStopPost, counts as stopped: its own process has already exited.
prune() {
  local exiting="${1:-}" link name unit keep=() in_use=()
  for link in "$RELEASES"/slot-*; do
    [[ -L "$link" ]] || continue
    name="${link##*/slot-}"
    # slot-<service>-<port> is aixel-labs-<service>@<port>; any other slot link
    # (an older layout) is taken as in use until it is removed by hand. The live
    # slot is the enabled one (a deploy disables the old slot before stopping it),
    # and it keeps its link even while stopped: a `systemctl restart` or a crash
    # runs this same ExecStopPost and then starts that slot again from the link.
    if [[ "$name" =~ ^([a-z]+)-([0-9]+)$ ]]; then
      unit="aixel-labs-${BASH_REMATCH[1]}@${BASH_REMATCH[2]}.service"
      if ! systemctl is-enabled -q "$unit" 2>/dev/null && { [[ "$unit" == "$exiting" ]] || stopped "$unit"; }; then
        rm -f "$link"; continue
      fi
    fi
    in_use+=("$(readlink "$link")")
  done
  mapfile -t keep < <(cd "$RELEASES" && ls -1t --time=mtime -d [0-9a-f]*/.built 2>/dev/null | head -n "$KEEP" | cut -d/ -f1)
  for dir in "$RELEASES"/*/; do
    name="$(basename "$dir")"
    [[ -L "${dir%/}" || ! "$name" =~ ^[0-9a-f]{40}$ ]] && continue
    [[ " ${keep[*]} ${in_use[*]} " == *" $name "* ]] && continue
    log "removing old release ${name:0:7}"
    rm -rf "$dir"
  done
}

mkdir -p "$RELEASES"
exec 9>"$RELEASES/.deploy.lock"

if [[ "${1:-}" == --prune ]]; then
  # A deploy in progress prunes when it finishes; nothing to do here then.
  flock -n 9 || exit 0
  prune "${2:-}"
  exit 0
fi
plan=false
[[ "${1:-}" == --plan ]] && { plan=true; shift; }
$plan || flock -n 9 || die "another deploy is running"

# --- which commit, which services -----------------------------------------------
ref=origin/main
if [[ $# -gt 0 ]] && ! is_service "$1"; then ref=$1; shift; fi
for svc in "$@"; do is_service "$svc" || die "unknown service: $svc (known: ${SERVICES[*]})"; done
[[ "$ref" == origin/* ]] && git -C "$REPO" fetch -q origin "${ref#origin/}"
sha="$(git -C "$REPO" rev-parse --verify "$ref^{commit}")" || die "unknown ref: $ref"
named=false
if [[ $# -gt 0 ]]; then targets=("$@"); named=true; else mapfile -t targets < <(changed_services "$sha"); fi
log "$ref = ${sha:0:7} ($(git -C "$REPO" log -1 --format=%s "$sha"))"
log "services to deploy: ${targets[*]:-none}"
$plan && exit 0

# --- build ----------------------------------------------------------------------
release="$RELEASES/$sha"
if (( ${#targets[@]} == 0 )); then
  :
elif [[ -f "$release/.built" ]]; then
  log "release ${sha:0:7} already built, reusing it"
else
  rm -rf "$release"
  mkdir -p "$release"
  git -C "$REPO" archive "$sha" | tar -x -C "$release"
  # Untracked runtime files live once, in the checkout, and every release links
  # to them: the env file, each Python worker's venv / models / binaries, and the
  # voice engine's venv, keys (.env, service.env), prompt and runtime state.
  ln -s "$BACKEND/.env" "$release/backend/.env"
  (cd "$BACKEND/voice" && mkdir -p $VOICE_STATE_DIRS && touch $VOICE_STATE_FILES)
  while IFS= read -r path; do
    path="${path%/}"
    [[ "$path" =~ ^backend/(workers/[^/]+|voice)/[^/]+$ && "$path" != */__pycache__ ]] || continue
    [[ -e "$release/$path" ]] || ln -s "$REPO/$path" "$release/$path"
  done < <(git -C "$REPO" ls-files --others --ignored --exclude-standard --directory backend/workers backend/voice)
  log "installing dependencies"
  # The standalone pnpm binary bundles its own old Node and checks `engines`
  # against it, silently skipping optional native packages that need a newer
  # one (sharp's linux-arm64 binary). Check against the Node the slot runs.
  (cd "$release" && CI=true pnpm install --frozen-lockfile --prefer-offline --filter @aixellabs/backend \
    --config.node-version="$("$NODE" -p process.versions.node)" >"$release/.install.log" 2>&1) \
    || { tail -20 "$release/.install.log"; die "pnpm install failed (full log: $release/.install.log)"; }
  log "compiling"
  (cd "$release/backend" && pnpm run build >"$release/.build.log" 2>&1) \
    || { tail -20 "$release/.build.log"; die "build failed (full log: $release/.build.log)"; }
  touch "$release/.built"
fi

# --- one service --------------------------------------------------------------------
deploy_service() {
  local svc=$1 upstream live idle unit_src unit_dst deadline slots
  read -r -a slots <<<"${SLOTS[$svc]}"
  upstream="$(upstream_file "$svc")"
  live="$(live_port "$svc")"
  idle="${slots[0]}"; [[ "$live" == "$idle" ]] && idle="${slots[1]}"
  if [[ -n "$live" && "$(readlink "$RELEASES/slot-$svc-$live" 2>/dev/null)" == "$sha" ]]; then
    if ! $named; then
      log "$svc: ${sha:0:7} is already live on :$live"
      return
    fi
    log "$svc: ${sha:0:7} is already live on :$live; starting a fresh slot of it, as asked"
  fi
  log "$svc: live slot :${live:-none}, deploying to :$idle"

  if ! stopped "aixel-labs-$svc@$idle"; then
    log "$svc: :$idle is still draining from the previous deploy; waiting for it to stop"
    until stopped "aixel-labs-$svc@$idle"; do sleep 5; done
  fi
  unit_src="$release/backend/deploy/aixel-labs-$svc@.service"
  unit_dst="/etc/systemd/system/aixel-labs-$svc@.service"
  if ! cmp -s "$unit_src" "$unit_dst"; then
    sudo install -m 644 "$unit_src" "$unit_dst"
    sudo systemctl daemon-reload
  fi
  ln -sfn "$sha" "$RELEASES/slot-$svc-$idle"
  sudo systemctl start "aixel-labs-$svc@$idle"

  log "$svc: waiting for :$idle${HEALTH[$svc]}"
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  until [[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$idle${HEALTH[$svc]}")" == 200 ]]; do
    if (( SECONDS > deadline )) || stopped "aixel-labs-$svc@$idle"; then
      sudo journalctl -u "aixel-labs-$svc@$idle" -n 30 --no-pager || true
      sudo systemctl stop "aixel-labs-$svc@$idle"
      die "$svc: new slot :$idle never became healthy; :${live:-none} is untouched"
    fi
    sleep 1
  done
  log "$svc: :$idle is healthy"

  echo "to 127.0.0.1:$idle" | sudo tee "$upstream" >/dev/null
  if ! sudo systemctl reload caddy; then
    if [[ -n "$live" ]]; then echo "to 127.0.0.1:$live" | sudo tee "$upstream" >/dev/null; else sudo rm -f "$upstream"; fi
    sudo systemctl reload caddy || true
    sudo systemctl stop "aixel-labs-$svc@$idle"
    die "$svc: caddy reload failed; reverted to :${live:-none}"
  fi
  sudo systemctl enable -q "aixel-labs-$svc@$idle"
  touch "$release/.built" # the mtime orders releases for pruning: last deployed first, rollbacks included
  log "$svc: traffic now goes to :$idle (${sha:0:7})"

  if [[ -n "$live" ]] && ! stopped "aixel-labs-$svc@$live"; then
    sudo systemctl disable -q "aixel-labs-$svc@$live" 2>/dev/null || true
    sudo systemctl stop --no-block "aixel-labs-$svc@$live"
    log "$svc: :$live is draining; it exits on its own (journalctl -u aixel-labs-$svc@$live)"
  fi
}

for svc in "${targets[@]}"; do deploy_service "$svc"; done

# --- Caddy config -------------------------------------------------------------------
# The commit's deploy/Caddyfile, not the checkout's: only committed config goes live.
caddyfile="$(mktemp)"
git -C "$REPO" show "$sha:backend/deploy/Caddyfile" >"$caddyfile"
if ! cmp -s "$caddyfile" /etc/caddy/Caddyfile; then
  for file in $(grep -o '/etc/caddy/aixel-labs-[a-z]*\.upstream' "$caddyfile" | sort -u); do
    [[ -f "$file" ]] || die "the Caddyfile needs $file: deploy that service first (deploy.sh <ref> <service>)"
  done
  sudo install -m 644 "$caddyfile" /etc/caddy/Caddyfile.new
  sudo -u caddy env XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy \
    caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile >/dev/null 2>&1 \
    || { sudo rm -f /etc/caddy/Caddyfile.new; die "deploy/Caddyfile at ${sha:0:7} does not validate; the live one is unchanged"; }
  sudo mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  log "installed deploy/Caddyfile and reloaded Caddy"
fi
rm -f "$caddyfile"

prune
log "done: ${sha:0:7}${targets[*]:+ (${targets[*]})}"

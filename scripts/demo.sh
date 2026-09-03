#!/usr/bin/env bash
#
# MORPHIA — one-command local demo.
#
#   ./scripts/demo.sh            # build + start + migrate + seed + verify
#   ./scripts/demo.sh --down     # stop and remove the stack (keeps the .env)
#   ./scripts/demo.sh --reset    # stop, WIPE the database volume, then rebuild
#   ./scripts/demo.sh --journey  # (stack already up) drive a fresh live run + scope-denial
#
# A newcomer should be able to run this and reach a populated MORPHIA UI in a
# couple of minutes, with no API keys and nothing exploitable involved.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
say()  { echo -e "${BLUE}▸${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
die()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

API=http://localhost:8000
WEB=http://localhost:5173

# ── prerequisites ────────────────────────────────────────
need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }
check_prereqs() {
  need docker
  docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"
  docker info >/dev/null 2>&1 || die "docker daemon is not running"
  ok "prerequisites present"
}

# ── .env generation (local-only dev values) ──────────────
ensure_env() {
  if [[ -f .env ]]; then ok ".env present (left untouched)"; return; fi
  say "generating .env with fresh local-only secrets"
  local secret worker seed
  secret=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
  worker=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
  seed=$(python3 -c "import secrets;print(secrets.token_urlsafe(18))")
  cp .env.example .env
  # portable in-place edit
  python3 - "$secret" "$worker" "$seed" <<'PY'
import sys, pathlib
secret, worker, seed = sys.argv[1:4]
p = pathlib.Path(".env"); text = p.read_text()
text = text.replace("SECRET_KEY=change-me-to-a-random-64-char-string", f"SECRET_KEY={secret}")
text = text.replace("WORKER_AUTH_SECRET=change-me-to-a-random-secret", f"WORKER_AUTH_SECRET={worker}")
if "SEED_ADMIN_PASSWORD=" not in text.replace("# SEED_ADMIN_PASSWORD=", ""):
    text += f"\nSEED_ADMIN_EMAIL=admin@morphia.example.com\nSEED_ADMIN_PASSWORD={seed}\n"
p.write_text(text)
PY
  ok ".env created — secrets are local-only and git-ignored"
}

seed_password() { grep -E '^SEED_ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2-; }
seed_email()    { grep -E '^SEED_ADMIN_EMAIL='    .env | head -1 | cut -d= -f2- || echo admin@morphia.example.com; }

svc_health() {
  # Prints "healthy" / "unhealthy" / "starting" / "running" / "" for a service.
  docker compose ps --format json "$1" 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    d = d[0] if isinstance(d, list) else d
    print(d.get('Health') or d.get('State') or '')
    break
" 2>/dev/null || true
}

wait_healthy() {
  local svc=$1 tries=${2:-45}
  say "waiting for '$svc'"
  for _ in $(seq 1 "$tries"); do
    case "$(svc_health "$svc")" in
      healthy) ok "$svc: healthy"; return 0 ;;
      running) # no healthcheck on this service
        ok "$svc: running"; return 0 ;;
    esac
    sleep 2
  done
  warn "$svc not reporting healthy after $((tries * 2))s — recent logs:"
  docker compose logs "$svc" --tail 20 || true
  return 1
}

compose_up() {
  say "building images"
  docker compose build
  say "starting stack"
  docker compose up -d
  wait_healthy postgres
  wait_healthy redis
  wait_healthy api
  wait_healthy demo-target
  # The web dev server can take a bit; fall back to polling the URL directly.
  wait_healthy web 20 || {
    for _ in $(seq 1 20); do
      curl -fsS -o /dev/null "$WEB" && { ok "web: responding"; break; }
      sleep 2
    done
  }
}

migrate() {
  say "applying database migrations"
  docker compose exec -T -w /app/apps/api api alembic upgrade head
  ok "schema at head"
}

seed() {
  say "seeding the demo workspace"
  docker compose exec -T api python -m app.seed
  ok "workspace seeded"
}

verify() {
  say "verifying services"
  curl -fsS "$API/api/health"  >/dev/null && ok "api /health"
  curl -fsS "$API/api/ready"   | grep -q '"status":"ready"' && ok "api /ready (db + redis)"
  curl -fsS http://localhost:9000/health >/dev/null && ok "demo-target /health"
  curl -fsS -o /dev/null "$WEB" && ok "web app"
  docker compose ps
}

# ── live journey: one allowed run + one scope-denied run ──
journey() {
  say "driving a live end-to-end run through the real API + worker"
  local email pass jar csrf pid eid rid
  email="demo.live.$(date +%s)@morphia.example.com"
  pass="DemoLive-$(python3 -c 'import secrets;print(secrets.token_urlsafe(9))')"
  jar=$(mktemp)

  curl -fsS -X POST "$API/api/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\",\"display_name\":\"Live Demo\"}" >/dev/null
  csrf=$(curl -fsS -c "$jar" -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$pass\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
  local H=(-b "$jar" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json')

  pid=$(curl -fsSL "${H[@]}" -X POST "$API/api/v1/projects" \
    -d '{"name":"Live Demo Run","description":"scripted end-to-end demo"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  eid=$(curl -fsS "${H[@]}" -X POST "$API/api/v1/projects/$pid/engagements" \
    -d '{"program_name":"Local Validation","authorization_basis":"synthetic self-authorized target"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
  curl -fsS "${H[@]}" -X POST "$API/api/v1/engagements/$eid/scope" \
    -d '{"rule_type":"include","target_type":"domain","pattern":"demo-target","is_wildcard":false,"notes":"synthetic"}' >/dev/null
  ok "workspace created (project + engagement + scope: include demo-target)"

  _drive() {  # $1 target, $2 expected terminal state
    local target=$1 want=$2 r st
    r=$(curl -fsS "${H[@]}" -X POST "$API/api/v1/projects/$pid/runs" \
      -d "{\"title\":\"probe $target\",\"engagement_id\":\"$eid\",\"agent_profile\":\"passive_recon\",\"plan\":{\"steps\":[{\"action\":\"http_header_review\",\"target\":\"$target\",\"prompt\":\"Review response headers of $target\"}]}}" \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
    curl -fsS "${H[@]}" -X POST "$API/api/v1/runs/$r/transition" -d '{"target_state":"PLANNING"}' >/dev/null
    curl -fsS "${H[@]}" -X POST "$API/api/v1/runs/$r/transition" -d '{"target_state":"AWAITING_PLAN_APPROVAL"}' >/dev/null
    curl -fsS "${H[@]}" -X POST "$API/api/v1/runs/$r/approve" -d '{"justification":"demo journey approval: authorized synthetic target"}' >/dev/null
    for _ in $(seq 1 25); do
      st=$(curl -fsS -b "$jar" "$API/api/v1/runs/$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['state'])")
      [[ "$st" == "COMPLETED" || "$st" == "FAILED" ]] && break
      sleep 1
    done
    if [[ "$st" == "$want" ]]; then
      ok "target '$target' → run $st (expected $want)"
    else
      die "target '$target' → run $st (expected $want)"
    fi
    if [[ "$want" == "FAILED" ]]; then
      curl -fsS -b "$jar" "$API/api/v1/runs/$r/events" \
        | python3 -c "import sys,json;[print('   scope-denied reason:',e['payload'].get('reason')) for e in json.load(sys.stdin) if e['event_type']=='run.scope_denied']"
    fi
  }

  echo
  say "CASE A — in-scope target 'demo-target' (should proceed)"
  _drive "demo-target" "COMPLETED"
  echo
  say "CASE B — out-of-scope target 'production.example.com' (should be refused)"
  _drive "production.example.com" "FAILED"
  rm -f "$jar"
}

case "${1:-}" in
  --down)  docker compose down; ok "stack stopped"; exit 0 ;;
  --reset) say "wiping the database volume"; docker compose down -v; ok "clean";;
  --journey) journey; exit 0 ;;
esac

check_prereqs
ensure_env
compose_up
migrate
seed
verify
journey

cat <<EOF

$(echo -e "${GREEN}MORPHIA demo is up.${NC}")

  UI:        $WEB
  API docs:  $API/api/docs

  Demo sign-in (local, ephemeral — from your .env):
    email:     $(seed_email)
    password:  $(seed_password)

  The '$(echo Morphia Demo Research)' workspace already contains a completed run,
  a hash-verified evidence artifact, a verified synthetic finding, and a
  disclosure-style report. The two runs the script just drove live
  (CASE A / CASE B) demonstrate scope enforcement.

  Stop with:   ./scripts/demo.sh --down
EOF

#!/usr/bin/env bash
#
# Get the machine into a clean, recordable state for the demo walkthrough
# (docs/demo-script.md). Wipes the demo database, rebuilds, seeds, and leaves
# the stack running — then prints exactly what the presenter needs.
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; BOLD='\033[1m'; NC='\033[0m'

echo -e "${BOLD}Resetting the demo stack…${NC}"
./scripts/demo.sh --reset >/dev/null 2>&1 || true
./scripts/demo.sh 2>&1 | tail -n 20

EMAIL=$(grep -E '^SEED_ADMIN_EMAIL='    .env | head -1 | cut -d= -f2- || echo admin@morphia.example.com)
PASS=$(grep  -E '^SEED_ADMIN_PASSWORD=' .env | head -1 | cut -d= -f2-)

cat <<EOF

$(echo -e "${GREEN}${BOLD}Ready to record.${NC}")

  Sign in:   http://localhost:5173
    email     $EMAIL
    password  $PASS

  Live scope-enforcement clip (run this in beat 10):
    ./scripts/demo.sh --journey

  Recording checklist:
    [ ] 1920x1080, 30 fps
    [ ] browser zoom ~110%, bookmarks bar hidden
    [ ] Do Not Disturb / notifications off
    [ ] a clean terminal at the repo root, large font
    [ ] docs/demo-narration.md open on a second screen

  Script:  docs/demo-script.md
  Shots:   docs/demo-shot-list.md
EOF

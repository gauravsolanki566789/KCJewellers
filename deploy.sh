#!/bin/bash
#
# VPS deploy: git pull → migrate → (optional) client build → PM2 restart
# Faster path when only server.js / services change (skips Next build + keeps storefront up).
#
# Optional env (on the server):
#   KC_FORCE_CLIENT_BUILD=1  — always rebuild client (same as old deploy.sh behaviour)
#   KC_FORCE_CLIENT_CLEAN=1  — always rm -rf client/.next before build
#   KC_DEPLOY_BRANCH=master    — branch to track (default: master)

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

DEPLOY_BRANCH="${KC_DEPLOY_BRANCH:-master}"
START_TS=$(date +%s)

step_time() {
  local now end elapsed
  now=$(date +%s)
  elapsed=$((now - START_TS))
  printf '   (%ss elapsed)\n' "$elapsed"
}

echo "Starting deployment process…"
echo "   branch: origin/${DEPLOY_BRANCH}"

PREV_REF=""
if git rev-parse --verify HEAD >/dev/null 2>&1; then
  PREV_REF=$(git rev-parse HEAD)
fi

echo ""
echo "1/5: Fetching and resetting git…"
git fetch origin "${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}"
NEW_REF=$(git rev-parse HEAD)
step_time

CHANGED=""
if [ -n "$PREV_REF" ] && [ "$PREV_REF" != "$NEW_REF" ]; then
  CHANGED=$(git diff --name-only "$PREV_REF" "$NEW_REF" || true)
fi

CLIENT_BUILD=1
CLIENT_INSTALL=0
CLIENT_CLEAN=0
BACKEND_TOUCHED=1

if [ "${KC_FORCE_CLIENT_BUILD:-}" = "1" ] || [ "${KC_FORCE_CLIENT_BUILD:-}" = "true" ]; then
  CLIENT_BUILD=1
  CLIENT_INSTALL=1
  CLIENT_CLEAN=1
elif [ -z "$CHANGED" ]; then
  if [ "$PREV_REF" = "$NEW_REF" ] && [ -d client/.next ]; then
    CLIENT_BUILD=0
    echo "ℹ️  No new commits and client/.next exists — skipping client build (set KC_FORCE_CLIENT_BUILD=1 to rebuild)."
  else
    CLIENT_BUILD=1
    CLIENT_INSTALL=1
  fi
else
  if echo "$CHANGED" | grep -qE '^client/'; then
    CLIENT_BUILD=1
  else
    CLIENT_BUILD=0
    echo "ℹ️  No client/ changes in this pull — skipping client build."
  fi

  if echo "$CHANGED" | grep -qE '^client/package(-lock)?\.json'; then
    CLIENT_INSTALL=1
    CLIENT_CLEAN=1
  fi

  if echo "$CHANGED" | grep -qE '^client/next\.config'; then
    CLIENT_CLEAN=1
  fi

  BACKEND_TOUCHED=0
  if echo "$CHANGED" | grep -qE '^(server\.js|services/|migrations/|middleware/|routes/|package(-lock)?\.json|scripts/)'; then
    BACKEND_TOUCHED=1
  elif ! echo "$CHANGED" | grep -qvE '^(client/|\.cursor|README\.md|deploy\.sh)$'; then
    BACKEND_TOUCHED=0
  else
    BACKEND_TOUCHED=1
  fi
fi

if [ "${KC_FORCE_CLIENT_CLEAN:-}" = "1" ] || [ "${KC_FORCE_CLIENT_CLEAN:-}" = "true" ]; then
  CLIENT_CLEAN=1
fi

if [ "$CLIENT_BUILD" = "1" ]; then
  if [ ! -d client/node_modules ]; then
    CLIENT_INSTALL=1
  fi
fi

if [ "$CLIENT_BUILD" = "0" ]; then
  export KC_SKIP_FRONTEND_STOP=1
fi

echo ""
echo "2/5: Running database migrations…"
npm run migrate
step_time

if [ "$CLIENT_BUILD" = "1" ]; then
  echo ""
  echo "3/5: Preparing client build…"
  cd client
  if [ "$CLIENT_CLEAN" = "1" ]; then
    echo "   Removing client/.next (clean build)…"
    rm -rf .next
  else
    echo "   Keeping client/.next for incremental webpack build (faster)."
  fi
  step_time

  echo ""
  echo "4/5: Client dependencies and Next.js build…"
  if [ "$CLIENT_INSTALL" = "1" ]; then
    echo "   npm ci (client package-lock changed or missing node_modules)…"
    npm ci --prefer-offline --no-audit --no-fund
  else
    echo "   Skipping npm install (client lockfile unchanged)."
  fi
  npm run build
  cd ..
  step_time
else
  echo ""
  echo "3–4/5: Skipped — no client rebuild required."
  step_time
fi

if echo "$CHANGED" | grep -qE '^package(-lock)?\.json'; then
  echo ""
  echo "   Root package changed — installing backend dependencies…"
  npm ci --omit=dev --prefer-offline --no-audit --no-fund
  step_time
fi

echo ""
echo "5/5: Restarting PM2…"
pm2_restart_if_exists() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name"
    return 0
  fi
  return 1
}
if command -v pm2 >/dev/null 2>&1; then
  if [ "$CLIENT_BUILD" = "1" ] && [ "$BACKEND_TOUCHED" = "1" ]; then
    pm2 restart all
  elif [ "$CLIENT_BUILD" = "1" ]; then
    pm2_restart_if_exists kc-frontend || pm2 restart all
  elif [ "$BACKEND_TOUCHED" = "1" ]; then
    restarted=0
    pm2_restart_if_exists kc-backend && restarted=1
    pm2_restart_if_exists gaurav-app && restarted=1
    if [ "$restarted" = "0" ]; then
      pm2 restart all
    fi
  else
    echo "   No PM2 restart needed for this commit."
  fi
else
  echo "   pm2 not found — skip restart."
fi
step_time

END_TS=$(date +%s)
TOTAL=$((END_TS - START_TS))
echo ""
echo "✅ Deployment completed successfully! (${TOTAL}s total)"
if [ "$CLIENT_BUILD" = "0" ]; then
  echo "   Tip: backend-only deploy — storefront stayed online during migrate."
fi
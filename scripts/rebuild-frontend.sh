#!/bin/bash
# Rebuild Next.js on VPS when pm2 shows "Could not find a production build".
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "⏸️  Stopping kc-frontend (avoid crash loop)…"
pm2 stop kc-frontend 2>/dev/null || true

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"
cd client
if [ ! -d node_modules ]; then
  echo "📦 npm ci (client)…"
  npm ci --prefer-offline --no-audit --no-fund
fi
echo "🔨 npm run build (may take several minutes on 2GB VPS)…"
npm run build
cd "$ROOT"

if [ ! -f client/.next/BUILD_ID ]; then
  echo "❌ Build finished but client/.next/BUILD_ID missing — build failed."
  exit 1
fi

echo "▶️  Starting kc-frontend…"
pm2 restart kc-frontend 2>/dev/null || pm2 start kc-frontend
pm2 save 2>/dev/null || true
node scripts/ensure-frontend-after-deploy.js
echo "✅ Frontend rebuild complete."
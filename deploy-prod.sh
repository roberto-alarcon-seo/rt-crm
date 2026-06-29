#!/usr/bin/env bash
# deploy-prod.sh — promotes current branch to both production Supabase projects
# Usage: ./deploy-prod.sh [--skip-functions] [--skip-migrations]
set -euo pipefail

BROKIA_PRD="bemhvkirpcshpyjwvwvn"
MLS_DEV="kzhetgbegdytnoexbmev"   # MLS LATAM production

SKIP_FUNCTIONS=false
SKIP_MIGRATIONS=false

for arg in "$@"; do
  case $arg in
    --skip-functions)  SKIP_FUNCTIONS=true ;;
    --skip-migrations) SKIP_MIGRATIONS=true ;;
  esac
done

echo "=== Brokia24 Production Deploy ==="
echo "  brokia-prd : $BROKIA_PRD"
echo "  mlslatam   : $MLS_DEV"
echo ""

# ── Migrations ──────────────────────────────────────────────────────────────
if [ "$SKIP_MIGRATIONS" = false ]; then
  echo "▶ Applying migrations to brokia-prd..."
  npx supabase db push --yes --project-ref "$BROKIA_PRD"

  echo "▶ Applying migrations to mlslatam (prod)..."
  npx supabase db push --yes --project-ref "$MLS_DEV"
fi

# ── Edge Functions ───────────────────────────────────────────────────────────
if [ "$SKIP_FUNCTIONS" = false ]; then
  echo "▶ Deploying edge functions to brokia-prd..."
  npx supabase functions deploy --project-ref "$BROKIA_PRD"

  echo "▶ Deploying edge functions to mlslatam (prod)..."
  npx supabase functions deploy --project-ref "$MLS_DEV"
fi

echo ""
echo "✅ Deploy completo — brokia-prd + mlslatam actualizados."
echo "   Vercel se actualiza automáticamente al hacer push a main."

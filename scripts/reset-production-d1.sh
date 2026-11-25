#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-magic-screen-db}"
CONFIRM="${CONFIRM_PRODUCTION_RESET:-}"
EXPECTED="DROP-ALL-LEGACY-DATA"

if [[ "$CONFIRM" != "$EXPECTED" ]]; then
  echo "::error::Set CONFIRM_PRODUCTION_RESET=$EXPECTED to authorize the one-time destructive reset."
  exit 1
fi

echo "Reading production D1 table names only (no row data)..."
npx --yes wrangler@4 d1 execute "$DB_NAME" --remote --json \
  --command "SELECT name, type FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" > /tmp/d1-tables.json

mapfile -t tables < <(jq -r '.. | objects | select(.type? == "table") | .name? // empty' /tmp/d1-tables.json | sort -u)

if (( ${#tables[@]} == 0 )); then
  echo "No user tables found; continuing with schema initialization."
fi

echo "Tables scheduled for removal: ${#tables[@]}"
for table in "${tables[@]}"; do
  [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || { echo "::error::Unexpected table identifier; refusing reset."; exit 1; }
  echo "Dropping table: $table"
  npx --yes wrangler@4 d1 execute "$DB_NAME" --remote --command "DROP TABLE IF EXISTS \"$table\";"
done

echo "Applying clean Magic Folio schema..."
npx --yes wrangler@4 d1 migrations apply "$DB_NAME" --remote

echo "Verifying resulting user tables..."
npx --yes wrangler@4 d1 execute "$DB_NAME" --remote --command "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;"

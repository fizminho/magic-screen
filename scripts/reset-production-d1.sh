#!/usr/bin/env bash
set -euo pipefail

DB_NAME="${D1_DATABASE_NAME:-magic-screen-db}"
D1_SCOPE="${D1_SCOPE:---remote}"
CONFIRM="${CONFIRM_PRODUCTION_RESET:-}"
EXPECTED="DROP-ALL-LEGACY-DATA"

if [[ "$CONFIRM" != "$EXPECTED" ]]; then
  echo "::error::Set CONFIRM_PRODUCTION_RESET=$EXPECTED to authorize the one-time reset."
  exit 1
fi
if [[ "$D1_SCOPE" != "--remote" && "$D1_SCOPE" != "--local" ]]; then
  echo "::error::D1_SCOPE must be --remote or --local."
  exit 1
fi

echo "Reading D1 table names and CREATE statements (no row data)..."
npx --yes wrangler@4 d1 execute "$DB_NAME" "$D1_SCOPE" --json \
  --command "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" > /tmp/d1-tables.json

mapfile -t tables < <(jq -r '.. | objects | select(.name? != null and .sql? != null) | .name' /tmp/d1-tables.json | sort -u)

if (( ${#tables[@]} == 0 )); then
  echo "No user tables found; continuing with schema initialization."
fi

# Build a child-before-parent drop order from declared REFERENCES clauses.
# This avoids foreign-key failures when legacy tables contain linked rows.
declare -A dependencies=()
declare -A remaining=()
for table in "${tables[@]}"; do
  [[ "$table" =~ ^[A-Za-z0-9_]+$ ]] || { echo "::error::Unexpected table identifier; refusing reset."; exit 1; }
  remaining["$table"]=1
  ddl="$(jq -r --arg table "$table" '.. | objects | select(.name? == $table) | .sql? // empty' /tmp/d1-tables.json | head -n 1)"
  mapfile -t parents < <(printf '%s' "$ddl" | grep -oiE 'REFERENCES[[:space:]]+("[^"]+"|`[^`]+`|[A-Za-z0-9_]+)' | sed -E 's/^[Rr][Ee][Ff][Ee][Rr][Ee][Nn][Cc][Ee][Ss][[:space:]]+//; s/^["`]//; s/["`]$//' || true)
  dependencies["$table"]=" ${parents[*]:-} "
done

drop_order=()
while (( ${#remaining[@]} > 0 )); do
  candidate=""
  for table in "${tables[@]}"; do
    [[ -v remaining["$table"] ]] || continue
    has_child=0
    for other in "${!remaining[@]}"; do
      if [[ "${dependencies[$other]}" == *" $table "* ]]; then
        has_child=1
        break
      fi
    done
    if (( has_child == 0 )); then
      candidate="$table"
      break
    fi
  done
  if [[ -z "$candidate" ]]; then
    echo "::error::Foreign-key dependency cycle detected. No tables have been dropped; inspect schema manually."
    exit 1
  fi
  drop_order+=("$candidate")
  unset "remaining[$candidate]"
done

echo "Tables scheduled for removal: ${#drop_order[@]}"
drop_sql=""
for table in "${drop_order[@]}"; do
  echo "Scheduling drop: $table"
  drop_sql+="DROP TABLE IF EXISTS \"$table\";"
done
if [[ -n "$drop_sql" ]]; then
  npx --yes wrangler@4 d1 execute "$DB_NAME" "$D1_SCOPE" --command "$drop_sql"
fi

echo "Applying clean Magic Folio schema..."
npx --yes wrangler@4 d1 migrations apply "$DB_NAME" "$D1_SCOPE"

echo "Verifying resulting user tables..."
npx --yes wrangler@4 d1 execute "$DB_NAME" "$D1_SCOPE" --command "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name;"

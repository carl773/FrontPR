#!/bin/bash
set -euo pipefail

# ============================================================
# Input validation — guard against injection via env vars
# ============================================================

OUTPUT_FILE="$1"

# Validate output file exists and is a regular file
if [ ! -f "$OUTPUT_FILE" ]; then
  echo "Error: scanner output file not found: $OUTPUT_FILE" >&2
  exit 1
fi

# Validate REPO matches expected "owner/repo" format (alphanumeric, dash, dot, underscore only)
if ! echo "$REPO" | grep -qE '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'; then
  echo "Error: REPO has unexpected format: $REPO" >&2
  exit 1
fi

# Validate PR_NUMBER is a positive integer
if ! echo "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  echo "Error: PR_NUMBER is not a valid integer: $PR_NUMBER" >&2
  exit 1
fi

# ============================================================
# Build comment body
# ============================================================

TARGET=$(jq -r '.targetUrl' "$OUTPUT_FILE")
COUNT=$(jq -r '.findings | length' "$OUTPUT_FILE")

if [ "$COUNT" -eq 0 ]; then
  BODY=$(printf '## FrontPR Accessibility Scan\n\n**Target:** %s\n\nNo accessibility issues found. All clear!' "$TARGET")
else
  ROWS=$(jq -r '
    .findings[:10][] |
    "| " + (
      if .severity == "critical" then "CRITICAL"
      elif .severity == "serious" then "SERIOUS"
      elif .severity == "moderate" then "MODERATE"
      else "MINOR"
      end
    ) + " | `" + .ruleId + "` | " + .description + " |"
  ' "$OUTPUT_FILE")

  if [ "$COUNT" -gt 10 ]; then
    EXTRA=$(printf '\n> Showing 10 of %s issues.' "$COUNT")
  else
    EXTRA=""
  fi

  BODY=$(printf '## FrontPR Accessibility Scan\n\n**Target:** %s\n**Issues found:** %s\n\n| Severity | Rule | What to fix |\n|---|---|---|\n%s%s\n\n---\n*Powered by FrontPR*' \
    "$TARGET" "$COUNT" "$ROWS" "$EXTRA")
fi

# ============================================================
# Post comment — URL built from validated variables only
# ============================================================

API_URL="https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments"

curl -s -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_URL" \
  -d "$(jq -n --arg body "$BODY" '{body: $body}')"

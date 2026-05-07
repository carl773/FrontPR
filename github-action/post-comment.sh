#!/bin/bash
set -e

OUTPUT_FILE="$1"

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

curl -s -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/issues/$PR_NUMBER/comments" \
  -d "$(jq -n --arg body "$BODY" '{body: $body}')"

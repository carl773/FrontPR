#!/bin/bash
set -euo pipefail

# ============================================================
# Input validation
# ============================================================

OUTPUT_FILE="$1"

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "Error: scanner output file not found: $OUTPUT_FILE" >&2
  exit 1
fi

if ! echo "$REPO" | grep -qE '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'; then
  echo "Error: REPO has unexpected format: $REPO" >&2
  exit 1
fi

if ! echo "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  echo "Error: PR_NUMBER is not a valid integer: $PR_NUMBER" >&2
  exit 1
fi

if ! echo "$COMMIT_SHA" | grep -qE '^[0-9a-f]{40}$'; then
  echo "Error: COMMIT_SHA has unexpected format" >&2
  exit 1
fi

# ============================================================
# Parse scanner output
# ============================================================

TARGET=$(jq -r '.targetUrl' "$OUTPUT_FILE")
TOTAL=$(jq -r '.findings | length' "$OUTPUT_FILE")
SCAN_ID=$(jq -r '.scanId // "null"' "$OUTPUT_FILE")

HAS_PREVIOUS=$(jq -r '.diff.has_previous // false' "$OUTPUT_FILE")
NEW_COUNT=$(jq -r '.diff.new_count // 0' "$OUTPUT_FILE")
FIXED_COUNT=$(jq -r '.diff.fixed_count // 0' "$OUTPUT_FILE")
PERSISTING=$(jq -r '.diff.persisting_count // 0' "$OUTPUT_FILE")

DASHBOARD_URL="https://frontpr-dashboard.azurestaticapps.net"

# ============================================================
# Create GitHub Check Run
# ============================================================

if [ "$HAS_PREVIOUS" = "true" ]; then
  if [ "$NEW_COUNT" -gt 0 ]; then
    CONCLUSION="failure"
    CHECK_TITLE="${NEW_COUNT} new accessibility regression(s) found"
  else
    CONCLUSION="success"
    CHECK_TITLE="No new regressions — ${FIXED_COUNT} fixed, ${PERSISTING} persisting"
  fi
else
  if [ "$TOTAL" -eq 0 ]; then
    CONCLUSION="success"
    CHECK_TITLE="No accessibility issues found"
  else
    CONCLUSION="neutral"
    CHECK_TITLE="${TOTAL} accessibility findings (first scan — no baseline yet)"
  fi
fi

CHECK_SUMMARY="**Target:** ${TARGET}

| | Count |
|---|---|
| 🔴 New findings | ${NEW_COUNT} |
| ✅ Fixed | ${FIXED_COUNT} |
| — Persisting | ${PERSISTING} |
| Total | ${TOTAL} |"

gh api "repos/${REPO}/check-runs" \
  --method POST \
  --field name="FrontPR Accessibility" \
  --field head_sha="${COMMIT_SHA}" \
  --field status="completed" \
  --field conclusion="${CONCLUSION}" \
  --field "output[title]=${CHECK_TITLE}" \
  --field "output[summary]=${CHECK_SUMMARY}" \
  || echo "Warning: could not create check run (non-fatal)"

# ============================================================
# Build PR comment
# ============================================================

# Status line
if [ "$TOTAL" -eq 0 ]; then
  STATUS_LINE="## ✅ No accessibility issues found"
elif [ "$HAS_PREVIOUS" = "true" ] && [ "$NEW_COUNT" -eq 0 ]; then
  STATUS_LINE="## ✅ No new regressions"
elif [ "$HAS_PREVIOUS" = "true" ] && [ "$NEW_COUNT" -gt 0 ]; then
  STATUS_LINE="## ⚠️ ${NEW_COUNT} new accessibility regression(s)"
else
  STATUS_LINE="## 🔍 ${TOTAL} accessibility findings"
fi

# Diff summary (if we have a baseline)
if [ "$HAS_PREVIOUS" = "true" ]; then
  DIFF_SECTION="
**What changed vs last scan:**
🔴 **+${NEW_COUNT}** new &nbsp;&nbsp; ✅ **−${FIXED_COUNT}** fixed &nbsp;&nbsp; — ${PERSISTING} persisting
"
else
  DIFF_SECTION="
> First scan for this project — no baseline yet. Future scans will show what changed.
"
fi

# Top findings grouped by rule
if [ "$TOTAL" -gt 0 ]; then
  TOP_RULES=$(jq -r '
    .findings |
    group_by(.ruleId) |
    sort_by(-(length)) |
    .[:5][] |
    "| `" + .[0].ruleId + "` | " + (.[0].severity | ascii_upcase) + " | " + (length | tostring) + " |"
  ' "$OUTPUT_FILE")

  FINDINGS_SECTION="
<details>
<summary><strong>Top issues by rule</strong> (${TOTAL} total)</summary>

| Rule | Severity | Count |
|---|---|---|
${TOP_RULES}

</details>"
else
  FINDINGS_SECTION=""
fi

# Dashboard link
if [ "$SCAN_ID" != "null" ] && [ -n "$SCAN_ID" ]; then
  LINK_SECTION="[View full report →](${DASHBOARD_URL}/scan/${SCAN_ID})"
else
  LINK_SECTION="[Open dashboard →](${DASHBOARD_URL})"
fi

BODY="${STATUS_LINE}

**Target:** ${TARGET}
${DIFF_SECTION}
${FINDINGS_SECTION}

---
${LINK_SECTION} &nbsp;·&nbsp; *Powered by FrontPR*"

# ============================================================
# Post or update PR comment
# ============================================================

# Check if FrontPR comment already exists (update instead of spam)
EXISTING_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq '.[] | select(.body | contains("Powered by FrontPR")) | .id' \
  | head -1 || true)

if [ -n "$EXISTING_ID" ]; then
  gh api "repos/${REPO}/issues/comments/${EXISTING_ID}" \
    --method PATCH \
    --field body="$BODY"
  echo "FrontPR: updated existing PR comment (id: ${EXISTING_ID})"
else
  gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
    --method POST \
    --field body="$BODY"
  echo "FrontPR: posted new PR comment"
fi

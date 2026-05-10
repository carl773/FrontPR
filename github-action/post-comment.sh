#!/bin/bash
set -euo pipefail

# ============================================================
# post-comment.sh
# Args: $1 = scanner-output.json, $2 = lint-output.json
# Env:  GH_TOKEN, REPO, PR_NUMBER, COMMIT_SHA
# ============================================================

SCANNER_FILE="$1"
LINT_FILE="$2"

# ── Input validation ─────────────────────────────────────────

for file in "$SCANNER_FILE" "$LINT_FILE"; do
  if [ ! -f "$file" ]; then
    echo "Error: file not found: $file" >&2
    exit 1
  fi
done

if ! echo "$REPO" | grep -qE '^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$'; then
  echo "Error: REPO has unexpected format: $REPO" >&2; exit 1
fi
if ! echo "$PR_NUMBER" | grep -qE '^[0-9]+$'; then
  echo "Error: PR_NUMBER is not a valid integer: $PR_NUMBER" >&2; exit 1
fi
if ! echo "$COMMIT_SHA" | grep -qE '^[0-9a-f]{40}$'; then
  echo "Error: COMMIT_SHA has unexpected format" >&2; exit 1
fi

# ── Parse outputs ────────────────────────────────────────────

# axe-core / runtime
TARGET=$(jq -r '.targetUrl' "$SCANNER_FILE")
TOTAL=$(jq -r '.findings | length' "$SCANNER_FILE")
SCAN_ID=$(jq -r '.scanId // "null"' "$SCANNER_FILE")
HAS_PREVIOUS=$(jq -r '.diff.has_previous // false' "$SCANNER_FILE")
NEW_COUNT=$(jq -r '.diff.new_count // 0' "$SCANNER_FILE")
FIXED_COUNT=$(jq -r '.diff.fixed_count // 0' "$SCANNER_FILE")
PERSISTING=$(jq -r '.diff.persisting_count // 0' "$SCANNER_FILE")

# eslint / static
LINT_ERRORS=$(jq -r '.errorCount' "$LINT_FILE")
LINT_WARNINGS=$(jq -r '.warningCount' "$LINT_FILE")
LINT_TOTAL=$(jq -r '.findings | length' "$LINT_FILE")

DASHBOARD_URL="https://frontpr-dashboard.azurestaticapps.net"

# ── Check Run 1: Static Analysis (eslint) ────────────────────

if [ "$LINT_ERRORS" -gt 0 ]; then
  LINT_CONCLUSION="failure"
  LINT_TITLE="${LINT_ERRORS} accessibility error(s) found in source code"
elif [ "$LINT_WARNINGS" -gt 0 ]; then
  LINT_CONCLUSION="neutral"
  LINT_TITLE="No errors — ${LINT_WARNINGS} warning(s) to review"
else
  LINT_CONCLUSION="success"
  LINT_TITLE="No accessibility issues in source code"
fi

LINT_SUMMARY="Scanned JSX/TSX source files using \`eslint-plugin-jsx-a11y\`.

| | Count |
|---|---|
| 🔴 Errors (blocking) | ${LINT_ERRORS} |
| ⚠️ Warnings | ${LINT_WARNINGS} |"

# Build annotations array (max 50, errors first — already sorted by lint.ts)
ANNOTATIONS=$(jq -c '
  .findings[:50] | map({
    path: .filePath,
    start_line: .line,
    end_line: .line,
    start_column: .column,
    end_column: .column,
    annotation_level: (if .severity == "error" then "failure" else "warning" end),
    title: .ruleId,
    message: .message
  })
' "$LINT_FILE")

gh api "repos/${REPO}/check-runs" \
  --method POST \
  --field name="FrontPR — Static Analysis" \
  --field head_sha="${COMMIT_SHA}" \
  --field status="completed" \
  --field conclusion="${LINT_CONCLUSION}" \
  --field "output[title]=${LINT_TITLE}" \
  --field "output[summary]=${LINT_SUMMARY}" \
  --field "output[annotations]=${ANNOTATIONS}" \
  > /dev/null \
  || echo "Warning: could not create static analysis check run (non-fatal)"

# ── Check Run 2: Runtime Scan (axe-core) ─────────────────────

if [ "$HAS_PREVIOUS" = "true" ] && [ "$NEW_COUNT" -eq 0 ]; then
  RUNTIME_CONCLUSION="success"
  RUNTIME_TITLE="No new regressions — ${FIXED_COUNT} fixed, ${PERSISTING} persisting"
elif [ "$HAS_PREVIOUS" = "true" ] && [ "$NEW_COUNT" -gt 0 ]; then
  RUNTIME_CONCLUSION="neutral"
  RUNTIME_TITLE="${NEW_COUNT} new finding(s) since last scan (informational)"
elif [ "$TOTAL" -eq 0 ]; then
  RUNTIME_CONCLUSION="success"
  RUNTIME_TITLE="No accessibility issues found at runtime"
else
  RUNTIME_CONCLUSION="neutral"
  RUNTIME_TITLE="${TOTAL} findings — first scan, no baseline yet"
fi

RUNTIME_SUMMARY="Scanned \`${TARGET}\` using axe-core + Playwright.

| | Count |
|---|---|
| 🔴 New findings | ${NEW_COUNT} |
| ✅ Fixed | ${FIXED_COUNT} |
| — Persisting | ${PERSISTING} |
| Total | ${TOTAL} |"

gh api "repos/${REPO}/check-runs" \
  --method POST \
  --field name="FrontPR — Runtime Scan" \
  --field head_sha="${COMMIT_SHA}" \
  --field status="completed" \
  --field conclusion="${RUNTIME_CONCLUSION}" \
  --field "output[title]=${RUNTIME_TITLE}" \
  --field "output[summary]=${RUNTIME_SUMMARY}" \
  > /dev/null \
  || echo "Warning: could not create runtime check run (non-fatal)"

# ── Build PR comment ──────────────────────────────────────────

# Static section
if [ "$LINT_ERRORS" -gt 0 ]; then
  STATIC_HEADER="### 🔬 Static Analysis — ❌ ${LINT_ERRORS} error(s), merge blocked"
elif [ "$LINT_WARNINGS" -gt 0 ]; then
  STATIC_HEADER="### 🔬 Static Analysis — ⚠️ ${LINT_WARNINGS} warning(s)"
else
  STATIC_HEADER="### 🔬 Static Analysis — ✅ Clean"
fi

if [ "$LINT_TOTAL" -gt 0 ]; then
  LINT_TABLE=$(jq -r '
    .findings[:10] |
    map("| `" + .filePath + ":" + (.line|tostring) + "` | `" + .ruleId + "` | " + .message + " |") |
    join("\n")
  ' "$LINT_FILE")

  MORE_LINT=""
  if [ "$LINT_TOTAL" -gt 10 ]; then
    MORE_LINT="
+$(( LINT_TOTAL - 10 )) more — see **FrontPR — Static Analysis** check for full list"
  fi

  STATIC_SECTION="${STATIC_HEADER}

<details>
<summary>${LINT_ERRORS} error(s), ${LINT_WARNINGS} warning(s) in source code</summary>

| File:line | Rule | Issue |
|---|---|---|
${LINT_TABLE}
${MORE_LINT}
</details>"
else
  STATIC_SECTION="${STATIC_HEADER}

No issues found in JSX/TSX source files."
fi

# Runtime section
if [ "$HAS_PREVIOUS" = "true" ]; then
  if [ "$NEW_COUNT" -eq 0 ]; then
    RUNTIME_HEADER="### 🌐 Runtime Scan — ✅ No new regressions"
  else
    RUNTIME_HEADER="### 🌐 Runtime Scan — ⚠️ ${NEW_COUNT} new finding(s)"
  fi
  DIFF_LINE="🔴 **+${NEW_COUNT}** new &nbsp; ✅ **−${FIXED_COUNT}** fixed &nbsp; — ${PERSISTING} persisting"
else
  RUNTIME_HEADER="### 🌐 Runtime Scan — 🔍 First scan"
  DIFF_LINE="No baseline yet — future scans will show what changed."
fi

# Top rules from axe-core (grouped by ruleId)
if [ "$TOTAL" -gt 0 ]; then
  TOP_RULES=$(jq -r '
    .findings |
    group_by(.ruleId) |
    sort_by(-length) |
    .[:5][] |
    "| `" + .[0].ruleId + "` | " + (.[0].severity | ascii_upcase) + " | " + (length|tostring) + " |"
  ' "$SCANNER_FILE")

  RUNTIME_SECTION="${RUNTIME_HEADER}

${DIFF_LINE}

<details>
<summary>Top rules (${TOTAL} total findings)</summary>

| Rule | Severity | Count |
|---|---|---|
${TOP_RULES}

</details>"
else
  RUNTIME_SECTION="${RUNTIME_HEADER}

No accessibility issues found at runtime."
fi

# Dashboard link
if [ "$SCAN_ID" != "null" ] && [ -n "$SCAN_ID" ]; then
  LINK="[View full report →](${DASHBOARD_URL}/scan/${SCAN_ID})"
else
  LINK="[Open dashboard →](${DASHBOARD_URL})"
fi

BODY="## FrontPR Accessibility Report

**Target:** ${TARGET}

${STATIC_SECTION}

${RUNTIME_SECTION}

---
${LINK} &nbsp;·&nbsp; *Powered by FrontPR*"

# ── Post or update PR comment ────────────────────────────────

EXISTING_ID=$(gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
  --jq '.[] | select(.body | contains("Powered by FrontPR")) | .id' \
  | head -1 || true)

if [ -n "$EXISTING_ID" ]; then
  gh api "repos/${REPO}/issues/comments/${EXISTING_ID}" \
    --method PATCH \
    --field body="$BODY" > /dev/null
  echo "FrontPR: updated PR comment (id: ${EXISTING_ID})"
else
  gh api "repos/${REPO}/issues/${PR_NUMBER}/comments" \
    --method POST \
    --field body="$BODY" > /dev/null
  echo "FrontPR: posted new PR comment"
fi

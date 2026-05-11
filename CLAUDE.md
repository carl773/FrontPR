# FrontPR — Full Project Guide

> This document is the single source of truth for the FrontPR project.
> It is written for both humans and Claude to read.
> Last updated: May 2026.

---

## What is FrontPR?

FrontPR is an automated accessibility scanner that runs on every GitHub pull request.
It checks for accessibility issues in two ways:

1. **Static analysis** — ESLint + jsx-a11y rules on your JSX/TSX source code (~15 seconds)
2. **Runtime analysis** — axe-core running on your live site in a headless browser (~1–3 minutes)

Results are posted as a PR comment and a GitHub Check Run. Findings are saved to a Xano
database and visible in the FrontPR dashboard.

---

## The Three Repos

| Repo | Owner | Purpose |
|------|-------|---------|
| `carl773/FrontPR` | carl773 | GitHub Action + TypeScript scanner |
| `oscar19023/frontpr-dashboard` | oscar19023 | React dashboard (Vite + shadcn/ui) |
| Xano workspace 34 | — | Backend API + database (no repo, managed via Xano UI or MCP) |

The demo target repo (for testing) is `carl773/FrontendForDemoTesting`.

---

## Architecture Overview

```
GitHub PR opened
        │
        ▼
carl773/FrontPR@main  (action.yml)
        │
        ├─ Step 1: npm run lint-a11y   → lint-output.json
        ├─ Step 2: post-comment.sh --lint-only   → PR comment (fast, ~15s)
        ├─ Step 3: npm run scan --url <target>   → scanner-output.json
        │          └─ POST /scan/submit  (Phase 1 → Xano, saves scan + ESLint findings)
        │          └─ axe-core browser scan
        │          └─ POST /scan/runtime (Phase 2 → Xano, saves axe findings + diff)
        └─ Step 4: post-comment.sh (full) → updates PR comment with runtime results
                   └─ includes link: https://<dashboard>/scan?id=X&token=Y
```

---

## Repo 1: carl773/FrontPR (Scanner + GitHub Action)

### File structure
```
FrontPR/
├── github-action/
│   ├── action.yml          ← defines inputs, steps, env vars
│   └── post-comment.sh     ← posts GitHub Check Runs + PR comment
└── scanner/
    ├── package.json
    └── src/
        ├── index.ts        ← axe-core scanner + Xano submission (two-phase)
        └── lint.ts         ← ESLint jsx-a11y static analysis
```

### Key constants in scanner/src/index.ts
```typescript
const XANO_HOST = "xnbe-j9zq-8ibd.f2.xano.io";
const XANO_API  = "/api:aeK-ruu4";   // ← LIVE branch, NO :dEV suffix
```

> **IMPORTANT**: Do NOT add `:dEV` to the XANO_API path. That routes to a separate
> isolated branch with no data. Always use `/api:aeK-ruu4` (live).

### action.yml inputs
| Input | Required | Description |
|-------|----------|-------------|
| `target_url` | Yes | URL to scan with axe-core |
| `api_key` | Yes | FrontPR API key — store as GitHub Secret `FRONTPR_API_KEY` |
| `preview_url` | No | Override scan URL with a PR preview URL (Vercel, Netlify, etc.) |

### GitHub Secret required in every repo that uses FrontPR
| Secret name | Value |
|-------------|-------|
| `FRONTPR_API_KEY` | The api_key from the project's row in `frontpr_projects` table |

The demo project's api_key is `d94ec8da32e747fa95083e36845f2ed4` (project_id=4 in Xano).

### Workflow file used in target repos (.github/workflows/frontpr.yml)
```yaml
name: FrontPR Accessibility Scan

on:
  pull_request:
    branches: [main]

jobs:
  frontpr:
    name: FrontPR
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      checks: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Run FrontPR Scanner
        uses: carl773/FrontPR@main
        with:
          target_url: 'https://your-site.com'
          api_key: ${{ secrets.FRONTPR_API_KEY }}
```

---

## Repo 2: oscar19023/frontpr-dashboard (React Dashboard)

### Tech stack
- Vite + React 19 + TypeScript
- shadcn/ui components (Tailwind CSS v4)
- TanStack Query for data fetching
- React Router v7

### Key files
| File | Purpose |
|------|---------|
| `src/api/client.ts` | Xano base URLs — `API_BASE.frontpr` must match live branch |
| `src/api/project.ts` | All TypeScript interfaces + API call functions |
| `src/pages/DashboardPage.tsx` | Main dashboard — lists projects + scan history |
| `src/pages/ScanDetailPage.tsx` | Scan detail — findings table, diff, polling for pending scans |
| `src/pages/SetupPage.tsx` | Setup guide — shows API key + workflow YAML to copy |
| `src/App.tsx` | Routes: `/`, `/dashboard`, `/setup`, `/scan/:id`, `/scan?id=X&token=Y` |

### API base URL in src/api/client.ts
```typescript
export const API_BASE = {
  auth:    "https://xnbe-j9zq-8ibd.f2.xano.io/api:CumTlcnv:dEV",  // auth group (OK to keep dEV)
  frontpr: "https://xnbe-j9zq-8ibd.f2.xano.io/api:aeK-ruu4",       // ← LIVE, no :dEV
}
```

### Routes
| Path | Auth | Description |
|------|------|-------------|
| `/` | No | Login page |
| `/dashboard` | Yes | Project overview + scan history |
| `/setup` | Yes | Setup guide with API key |
| `/scan/:id` | Yes | Scan detail (authenticated) |
| `/scan?id=X&token=Y` | No | Scan detail via 30-min share link (from PR comment) |

### Running locally
```bash
cd frontpr-dashboard
npm install
npm run dev    # → http://localhost:5173
```

---

## Xano Backend (Workspace 34)

### Connection details
| Field | Value |
|-------|-------|
| Host | `xnbe-j9zq-8ibd.f2.xano.io` |
| Workspace ID | `34` |
| API group name | `FrontPR Scanner` |
| API group ID | `109` |
| API group canonical | `aeK-ruu4` |
| **Active branch** | **`v1` (live)** — this is the default, no suffix needed |
| Dev branch | `dEV` — isolated data, do NOT use for production |

### Database tables
| Table | ID | Purpose |
|-------|----|---------|
| `frontpr_projects` | 88 | One row per customer project, contains `api_key` |
| `frontpr_scans` | 89 | One row per PR scan |
| `frontpr_findings` | 90 | Individual accessibility findings per scan |

### API endpoints (all in API group 109, live branch)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/scan/submit` | api_key in body | Phase 1: create scan + save ESLint findings |
| POST | `/scan/runtime` | api_key in body | Phase 2: save axe findings, compute diff, mark complete |
| GET | `/scan` | Bearer token | Get scan + findings (authenticated dashboard) |
| GET | `/scan/public` | share token in query | Get scan + findings (public 30-min link) |
| GET | `/project` | Bearer token | List user's projects |
| GET | `/project/scans` | Bearer token | Paginated scan history for a project |

### Share token logic
The share token embedded in PR comment links is generated as:
```
sha256(api_key + commit_sha) → first 32 chars
```
In XanoScript: `$input.api_key|concat:$input.commit_sha|sha256|substr:0:32`

Valid for 30 minutes from scan creation (`share_token_expires_at`).

---

## Setting Up Xano MCP Locally (for Claude)

The Xano MCP server lets Claude read and edit the Xano backend directly.
This is how we manage all API endpoints and database without using the Xano web UI.

### Install the MCP server

In your Claude Code settings file (usually `~/.claude/claude_code_config.json` or
via `claude mcp add`), add the Xano MCP server:

```json
{
  "mcpServers": {
    "xano-meta": {
      "command": "npx",
      "args": ["-y", "@xano/mcp-server"],
      "env": {
        "XANO_TOKEN": "<your-xano-api-token>"
      }
    }
  }
}
```

To get your Xano API token:
1. Log in to xano.com
2. Go to your account → **API Keys** (or Settings → API Keys)
3. Create a new key with full access
4. Paste it as `XANO_TOKEN`

### Using the MCP in a Claude session

When starting a new Claude session about the Xano backend, always begin with:

```
Use workspace_id: 34
```

Then Claude can call tools like:
- `getWorkspaceContext` — get a map of all tables, APIs, functions
- `listAPIs` — list endpoints in API group 109
- `getAPI` / `updateAPI` — read and edit XanoScript
- `getTableContent` — inspect database rows
- `searchApiRequestHistory` — debug failing requests (shows input + output + status)

---

## XanoScript — Key Rules (Lessons Learned)

These are syntax rules we learned the hard way. Claude must follow these exactly.

### String concatenation
```
// WRONG — ~ does not exist in XanoScript
($a ~ $b)|sha256

// CORRECT — use concat pipe
$a|concat:$b|sha256
```

### Substring (first N chars)
```
// WRONG — left: pipe does not exist
$value|sha256|left:32

// CORRECT
$value|sha256|substr:0:32
```

### Current element in filter/map/some/every pipes
```
// WRONG — $this does not exist
$array|filter:($other|contains:$this.field)

// CORRECT — use $$
$array|filter:($other|in:$$.field)
```

### Array membership check
```
// WRONG — contains checks text substrings, not array membership
$array|contains:$value

// CORRECT — in checks if value is in array
$array|in:$value
```

### Timestamp — adding seconds
```
// WRONG — nested pipe in argument is not valid
now|add_secs_to_timestamp:(1800|to_int)

// CORRECT — use integer literal directly
now|add_secs_to_timestamp:1800
```

### foreach loop
```
// CORRECT syntax
foreach ($input.items) {
  each as $item {
    db.add some_table {
      data = { field: $item.value }
    }
  }
}
```

---

## Current Status (May 2026)

### ✅ Working
- GitHub Action runs on every PR in `carl773/FrontendForDemoTesting`
- ESLint findings posted to PR comment within ~15 seconds
- Scan record created in Xano (`frontpr_scans` table) via `POST /scan/submit`
- ESLint findings saved to `frontpr_findings` table
- axe-core browser scan runs and findings saved via `POST /scan/runtime`
- Diff computed vs previous scan (new / fixed / persisting counts)
- Share token generated and embedded in PR comment link
- Dashboard at `localhost:5173` shows scan history and stats
- Setup page shows API key for copying

### ❌ Known Issues / Next Steps

#### 1. Scan detail page — findings not displaying
When clicking into a scan from the dashboard, the findings table is empty even though
findings exist in the database. The `GET /scan` endpoint is likely returning findings
in a shape the frontend doesn't expect (e.g. paginated wrapper vs plain array).
**Fix needed in**: Xano `GET /scan` endpoint response shape or `ScanDetailPage.tsx`.

#### 2. Dashboard not publicly deployed (Azure)
The PR comment links to `https://frontpr.io/dashboard` which doesn't exist yet.
The dashboard is currently only accessible at `localhost:5173`.

**To deploy to Azure Static Web Apps:**
1. Go to portal.azure.com → Create resource → Static Web App
   - Name: `frontpr-dashboard`
   - Plan: Free
   - Source: **Other** (we have our own GitHub Actions workflow)
2. After creation → Manage deployment token → copy the token
3. Add secret to `oscar19023/frontpr-dashboard` GitHub repo:
   - Name: `AZURE_STATIC_WEB_APPS_API_TOKEN`
   - Value: (token from step 2)
4. Push to `main` — the workflow at `.github/workflows/azure-static-web-apps.yml`
   will build and deploy automatically
5. Azure gives a URL like `https://polite-stone-0abc123.azurestaticapps.net`
6. Update `FRONTPR_DASHBOARD_URL` in `carl773/FrontPR/github-action/action.yml`
   to point to that URL

#### 3. Scanner repo — dev branch ahead of main
Local `dev` branch in `carl773/FrontPR` may be 1 commit ahead of `origin/main`.
Use GitHub Desktop or GitHub web UI to merge dev → main (email verification issues
with CLI push). The `:dEV` fix is already live on `origin/main` (edited via GitHub web UI).

---

## Environment Variables Reference

### Scanner (GitHub Actions env)
| Variable | Set by | Value |
|----------|--------|-------|
| `FRONTPR_API_KEY` | GitHub Secret | e.g. `d94ec8da32e747fa95083e36845f2ed4` |
| `FRONTPR_PREVIEW_URL` | action input (optional) | Override URL for PR preview |
| `GITHUB_PR_NUMBER` | action.yml | Pull request number |
| `GITHUB_REPOSITORY` | GitHub Actions built-in | `owner/repo` |
| `GITHUB_SHA` | GitHub Actions built-in | Full commit SHA |

### Dashboard (browser)
No env vars — all config is in `src/api/client.ts`. Auth token stored in
`localStorage` as `frontpr_token`.

---

## Quick Reference — Who Does What

| Layer | Technology | Where to edit |
|-------|-----------|---------------|
| Scanner | TypeScript + Node.js | `carl773/FrontPR/scanner/src/` |
| GitHub Action | YAML + bash | `carl773/FrontPR/github-action/` |
| Backend API | XanoScript | Xano UI or via MCP (workspace 34, group 109) |
| Database | Xano tables | Xano UI or via MCP (workspace 34) |
| Dashboard | React + Vite | `oscar19023/frontpr-dashboard/src/` |

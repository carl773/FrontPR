# FrontPR — New Machine Setup Guide

Follow these steps in order whenever you set up a new computer.

---

## 1. Install prerequisites

- [Node.js 22+](https://nodejs.org/)
- [Git](https://git-scm.com/)
- [Claude Code](https://claude.ai/code) — install the CLI and sign in
- [GitHub CLI](https://cli.github.com/) — `gh auth login` after install

---

## 2. Clone the three repos

Create a folder and clone all three projects:

```bash
mkdir C:\Users\<you>\source\FrontPR
cd C:\Users\<you>\source\FrontPR

git clone https://github.com/carl773/FrontPR.git
git clone https://github.com/carl773/FrontendForDemoTesting.git
git clone https://github.com/carl773/frontpr-dashboard.git
```

---

## 3. Give Claude access to GitHub

Claude uses the GitHub CLI (`gh`) to read repos, PRs, and issues.

```bash
gh auth login
```

Follow the prompts — choose GitHub.com, HTTPS, and authenticate via browser.

---

## 4. Connect Xano to Claude (MCP)

This gives Claude full read/write access to your Xano workspace (database, APIs, functions, etc.).

**Step 1 — Get a fresh Xano access token:**
1. Go to [xano.com](https://xano.com) → your instance (Oscar) → gear icon → **Metadata API & MCP Server**
2. Click **Manage Access Tokens**
3. Revoke any expired tokens, then click **+ New Access Token**
4. Name it `ClaudeCode`, set to **Never Expires**, copy the token

**Step 2 — Add the MCP server to your Claude config:**

Open `C:\Users\<you>\.claude.json` and add this block at the top, inside the root `{}`:


```json
"mcpServers": {
  "xano-meta": {
    "type": "sse",
    "url": "https://xnbe-j9zq-8ibd.f2.xano.io/x2/mcp/meta/mcp/sse",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN_HERE"
    }
  }
},
```

Replace `YOUR_TOKEN_HERE` with the token from Step 1. Make sure it sits inside the root `{` of the file alongside the other keys (not nested inside anything).

**Step 3 — Restart Claude Code** so it picks up the new MCP server.

---

## 5. Tell Claude to use this guide

When starting a new session, say:

> "Check SETUP.md and CLAUDE.md for context on this project."

Claude will read both files and have full context on the codebase, architecture, and setup.

---

## Project structure

| Repo | Purpose |
|------|---------|
| `FrontPR` | GitHub Action + scanner (ESLint + axe-core) |
| `FrontendForDemoTesting` | Demo frontend for testing FrontPR scans |
| `frontpr-dashboard` | Dashboard for viewing scan results |

**Backend:** Xano instance `xnbe-j9zq-8ibd.f2.xano.io` (workspace: Frontpr)

---

## Xano MCP details

| | |
|---|---|
| SSE URL | `https://xnbe-j9zq-8ibd.f2.xano.io/x2/mcp/meta/mcp/sse` |
| Streaming URL | `https://xnbe-j9zq-8ibd.f2.xano.io/x2/mcp/meta/mcp/stream` |
| Token location | `C:\Users\<you>\.claude.json` (never commit this file) |

---

## Notes

- The token in `settings.json` is secret — never commit it to git
- `CLAUDE.md` in each repo has architecture details — Claude reads it automatically
- If Claude seems to have lost context, say: "Read CLAUDE.md and SETUP.md"

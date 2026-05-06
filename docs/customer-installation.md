# Customer Installation Guide

This guide explains how to add FrontPR to your own GitHub repository so it automatically scans pull requests for accessibility and compliance issues.

## Prerequisites

- A GitHub repository with pull requests you want to scan
- A publicly reachable URL that your PR deploys to (e.g. a preview deployment from Vercel, Netlify, or a staging environment)
- *(Optional, later)* A deployed FrontPR backend and API token

## Step 1: Add the workflow file

Create `.github/workflows/frontpr.yml` in your repository with the following content:

```yaml
name: FrontPR Scan

on:
  pull_request:

jobs:
  frontpr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run FrontPR scanner
        uses: carl773/FrontPR/github-action@main
        with:
          target_url: ${{ vars.FRONTPR_TARGET_URL }}
```

The `target_url` is the only required input. Set it to the URL of the preview or staging environment that your PR workflow deploys to.

## Step 2: Configure inputs

| Input | Required | Description |
|---|---|---|
| `target_url` | Yes | The URL to scan. Should point to a live deployment of the pull request. |
| `backend_url` | No | Base URL of the deployed FrontPR backend. When provided, scan results are POSTed to `{backend_url}/api/scans/ingest`. Omit to skip result reporting. |
| `api_token` | No | Bearer token for authenticating with the FrontPR backend. Required when `backend_url` is set and the backend has authentication enabled. |

## Step 3: Store secrets safely

Credentials must never be hardcoded in the workflow file. Use GitHub Actions secrets and variables:

1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions**.
3. Add the following as needed:

| Name | Type | When to add |
|---|---|---|
| `FRONTPR_API_TOKEN` | Secret | When your backend requires authentication |
| `FRONTPR_BACKEND_URL` | Variable | When you have a deployed backend |
| `FRONTPR_TARGET_URL` | Variable | When the scan URL is fixed across PRs |

Reference them in your workflow like this:

```yaml
- name: Run FrontPR scanner
  uses: carl773/FrontPR/github-action@main
  with:
    target_url: ${{ vars.FRONTPR_TARGET_URL }}
    backend_url: ${{ vars.FRONTPR_BACKEND_URL }}
    api_token: ${{ secrets.FRONTPR_API_TOKEN }}
```

## Step 4: Point `backend_url` to the FrontPR backend

When a FrontPR backend is deployed and you have your API token, set `backend_url` to its base URL (e.g. `https://api.yourfrontpr.com`). The action will POST `scanner-output.json` to `{backend_url}/api/scans/ingest` after every scan.

Leave `backend_url` empty during early setup — the scanner will still run and print results to the GitHub Actions log.

## Example: full workflow with backend reporting

```yaml
name: FrontPR Scan

on:
  pull_request:

jobs:
  frontpr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run FrontPR scanner
        uses: carl773/FrontPR/github-action@main
        with:
          target_url: ${{ vars.FRONTPR_TARGET_URL }}
          backend_url: ${{ vars.FRONTPR_BACKEND_URL }}
          api_token: ${{ secrets.FRONTPR_API_TOKEN }}
```

## Current V0 limitations

FrontPR is in early development. Before using it in production, be aware of the following:

- **Scanner is a stub.** The current scanner generates a fake `scanner-output.json` for testing the pipeline. Real Playwright + axe scanning is not yet implemented.
- **No GitHub PR status checks.** The backend does not yet post pass/fail checks or comments back to pull requests. Results are visible only in the Actions log.
- **No Xano integration.** Scan results are not yet persisted to a database. The backend returns pass/fail only.
- **Authentication is V0-simple.** Bearer token auth is enforced when `FRONTPR_API_TOKEN` is set on the backend. Token rotation and per-project keys will come in a later milestone.
- **No dashboard.** There is no UI to browse scan history or findings yet.

These limitations will be resolved as each vertical slice is completed.

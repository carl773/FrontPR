# FrontPR

Automated accessibility scanning on every pull request.

FrontPR runs as a GitHub Action and checks your frontend for accessibility issues before code merges. Results appear directly in the PR as a comment and a GitHub Check.

---

## What it checks

- **Static analysis** — scans your JSX/TSX source files for accessibility violations (~15 seconds)
- **Runtime analysis** — loads your deployed site in a headless browser and runs accessibility checks (~1–3 minutes)

---

## Setup

### 1. Get an API key

Sign up at [frontpr.com](https://www.frontprdev.com) and create a project to receive your API key.

### 2. Add the secret to your repo

In your repository: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|------|-------|
| `FRONTPR_API_KEY` | Your API key from the FrontPR dashboard |

### 3. Add the workflow file

Create `.github/workflows/frontpr.yml` in your repository:

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

Replace `https://your-site.com` with the URL of your deployed site.

---

## Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `target_url` | Yes | URL of the site to scan |
| `api_key` | Yes | Your FrontPR API key (use a GitHub Secret) |
| `preview_url` | No | Override the scan URL — useful for PR preview deployments (Vercel, Netlify, etc.) |

### Using preview URLs

If your CI creates a preview deployment per PR, pass the preview URL so FrontPR scans the actual changes:

```yaml
- name: Run FrontPR Scanner
  uses: carl773/FrontPR@main
  with:
    target_url: 'https://your-site.com'
    preview_url: ${{ steps.deploy.outputs.url }}
    api_key: ${{ secrets.FRONTPR_API_KEY }}
```

---

## Output

Each scan posts a comment on the pull request with:

- A summary of findings by severity (critical, serious, moderate, minor)
- A diff showing new issues introduced, issues fixed, and persisting issues
- A link to the full findings in the FrontPR dashboard

A GitHub Check Run is also created so you can require a passing scan before merging.

# FrontPR

FrontPR is a GitHub PR compliance scanner for frontend applications.

The goal is to run automated checks on pull requests and return a clear pass/fail result directly in GitHub.

Initial checks:
- Accessibility issues using Playwright + axe
- Broken privacy/compliance links
- Basic frontend compliance risks
- Later: AI-assisted fix suggestions after user approval

## Intended flow

1. Customer installs the FrontPR GitHub Action
2. The action runs the scanner during pull requests
3. The scanner generates `scanner-output.json`
4. The action sends the result to the FrontPR raw backend
5. The backend validates and normalizes results
6. The backend stores scan runs/findings in Xano
7. The backend posts a result back to the GitHub PR

## Architecture

- `scanner/` — TypeScript scanner using Playwright and axe
- `github-action/` — GitHub Action wrapper that runs the scanner
- `backend/` — C#/.NET API for scan ingestion, GitHub integration, baseline logic, and AI fix orchestration
- `frontend/` — FrontPR dashboard
- `docs/` — architecture, API contracts, scanner flow, Xano data model
- `CLAUDE.md` — AI development instructions

## Backend/Xano split

Xano is used for:
- users
- organizations
- projects
- billing/subscriptions
- scan runs
- scan findings
- baselines
- audit logs

The raw .NET backend owns:
- scanner ingestion
- GitHub PR checks/comments
- request validation
- baseline comparison
- AI fix orchestration
- security-sensitive logic

The GitHub Action should call the .NET backend, not Xano directly.

## Documentation

- [Customer installation guide](docs/customer-installation.md) — how to add FrontPR to your own repository

## Current priority

Build the first vertical slice:

1. Fake scanner creates `scanner-output.json`
2. GitHub Action runs the scanner
3. .NET backend receives scanner output
4. Backend returns pass/fail
5. Xano integration comes after the local flow works
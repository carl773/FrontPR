# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

FrontPR is a GitHub PR compliance scanner for frontend applications.

The goal is to run automated checks during pull requests and return a clear pass/fail result directly in GitHub.

Initial checks:
- Accessibility issues using Playwright + axe
- Broken privacy/compliance links
- Basic frontend compliance risks
- Later: AI-assisted fix suggestions after user approval

## Core Flow

1. Customer installs the FrontPR GitHub Action
2. GitHub Action runs on pull requests
3. GitHub Action invokes the scanner
4. Scanner generates `scanner-output.json`
5. GitHub Action sends the result to the FrontPR raw backend
6. Raw backend validates and normalizes the result
7. Raw backend stores scan runs and findings in Xano
8. Raw backend returns pass/fail
9. Raw backend later posts GitHub PR checks/comments
10. AI fix suggestions are generated only after explicit user approval

## Monorepo Structure

- `backend/` — C# / ASP.NET Core API
- `frontend/` — TypeScript / Vite dashboard app
- `scanner/` — TypeScript Node scanner using Playwright + axe
- `github-action/` — GitHub Action wrapper that runs the scanner
- `docs/` — architecture, API contracts, scanner flow, Xano data model

## Architecture Rules

- TypeScript owns scanner, GitHub Action wrapper, and frontend.
- C#/.NET owns the raw backend API.
- Xano stores users, organizations, projects, billing/subscription state, scan runs, scan findings, baselines, and audit logs.
- Xano should not contain core scanner logic.
- GitHub Action should not talk directly to Xano long-term.
- Correct runtime flow is: GitHub Action → .NET backend → Xano.
- The scanner should produce structured JSON.
- The scanner should not decide billing, user access, or final business logic.
- The backend owns validation, normalization, baseline comparison, GitHub PR result logic, and AI fix orchestration.

## Current Build Priority

Build the first vertical slice only:

1. Fake scanner creates `scanner-output.json`
2. GitHub workflow runs the scanner
3. Backend receives scanner output
4. Backend returns pass/fail
5. Xano integration comes after local flow works

Do not build billing, dashboard polish, AI fix logic, or real Xano integration before the first scanner/backend flow works.

## Dev Environment

This project uses a Dev Container with .NET 9 and Node.js 22.

Expected ports:
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

## Backend Commands

Use after the backend project has been initialized:

```bash
cd backend
dotnet restore
dotnet build
dotnet run
dotnet test
Frontend Commands

Use after the frontend project has been initialized:

cd frontend
npm install
npm run dev
npm run build
npm run lint
npm test
Scanner Commands

Use after the scanner project has been initialized:

cd scanner
npm install
npm run scan -- --url https://example.com
GitHub Action

The GitHub Action should run the scanner and send scanner-output.json to the backend.

Do not send scanner results directly to Xano in the long-term architecture.

Security Rules

Never request, print, or commit production secrets.

Forbidden:

production Xano API keys
Stripe secret keys
GitHub App private keys
customer repo tokens
real production customer data
.env files

Allowed:

.env.example
fake credentials
local dev data
staging/dev Xano schema
anonymized test payloads
Editing Rules

Before making changes:

explain intended changes
keep changes scoped
avoid touching unrelated folders
do not rewrite architecture without approval

Do not modify:

billing logic unless explicitly requested
Xano schema unless explicitly approved
unrelated folders outside the requested scope

Prefer small, focused changes over large rewrites.

Team Workflow

This project is built by two developers using a shared Codespace, Live Share, GitHub branches, and Pull Requests.

GitHub is the source of truth.

Rules:

Do not work directly on main for feature work.
Use feature branches.
Keep Pull Requests small.
Commit after each working milestone.
Avoid editing the same files at the same time.
Do not let Claude make broad repo-wide changes unless explicitly approved.

Recommended branch examples:

feature/fake-scanner
feature/github-action-workflow
feature/backend-ingest
feature/xano-client
Work Ownership

Default ownership:

scanner/ — scanner logic, Playwright, axe, scanner-output generation
github-action/ — GitHub Action wrapper and CI execution
backend/ — .NET API, scan ingestion, validation, Xano client, GitHub PR result logic
frontend/ — dashboard UI
docs/ — shared contracts and architecture decisions

Shared files that should be changed carefully:

docs/api-contracts.md
CLAUDE.md
README.md
First Milestone

The first working milestone is:

A fake scanner can run from scanner/
It accepts --url
It creates scanner-output.json
GitHub Actions can run the scanner
The output can be printed in the GitHub Actions logs

No backend, Xano, billing, AI fix, or dashboard work should happen before this scanner/action proof works.

Scanner Output Contract

The scanner should eventually produce JSON shaped like this:

{
  "projectId": "string",
  "repository": "owner/repo",
  "commitSha": "abc123",
  "pullRequestNumber": 12,
  "scannerVersion": "0.1.0",
  "targetUrl": "https://example.com",
  "findings": [
    {
      "category": "accessibility",
      "severity": "serious",
      "ruleId": "color-contrast",
      "title": "Element has insufficient color contrast",
      "description": "Text contrast does not meet WCAG requirements",
      "filePath": "src/App.tsx",
      "lineNumber": 42,
      "fingerprint": "abc123",
      "rawPayload": {}
    }
  ]
}
Important Constraint

Do not overbuild.

FrontPR should be built as a sequence of small vertical slices. Each slice should run, be testable, and be committed before moving to the next one.
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
- The scanner should produce structured JSON. It should not decide billing, user access, or final business logic.
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
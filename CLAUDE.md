# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FrontPR is a GitHub Action and scanner tool. The repository is structured as a monorepo with five components:

- **backend** — ASP.NET Core (.NET 9) API, runs on port 5000
- **frontend** — Node.js 22 / Vite-based app, runs on port 5173
- **github-action** — GitHub Action definition and entrypoint
- **scanner** — Core scanning logic
- **docs** — Documentation

## Dev Environment

This project uses a Dev Container (`.devcontainer`) with .NET 9 and Node.js 22 pre-installed.

### Backend (.NET)

```bash
cd backend
dotnet restore
dotnet build
dotnet run          # starts on http://localhost:5000
dotnet test         # run all tests
dotnet test --filter "FullyQualifiedName~MyTest"  # run a single test
```

### Frontend (Node/Vite)

```bash
cd frontend
npm install
npm run dev         # starts on http://localhost:5173
npm run build
npm run lint
npm test
```

### GitHub Action / Scanner

```bash
cd github-action    # or scanner
npm install         # if Node-based
dotnet build        # if .NET-based
```

## Architecture

The backend exposes an API consumed by the frontend. The scanner performs PR analysis and is invoked by the GitHub Action. The GitHub Action packages the scanner and runs it in CI pipelines.

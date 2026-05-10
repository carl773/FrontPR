# FrontPR Scanner & GitHub Action — Claude Guide

> Se också `S:\FRONTPR\CLAUDE.md` för övergripande projektinfo och Xano-setup.

---

## Vad detta repo innehåller

- **`github-action/`** — GitHub Action-wrapper som kör scannern i CI
- **`scanner/`** — TypeScript-scanner (ESLint + axe-core via Playwright)

GitHub: `carl773/FrontPR` (main-branch är live)

---

## Scanner — tvåfas-arkitektur

Scannern kör i **två faser** för att visa ESLint-resultat snabbt medan axe-core-skanningen pågår:

### Fas 1 — Statisk analys (ESLint, ~5s)
- Körs via `npm run lint-a11y -- <workspace-dir>`
- Analyserar JSX/TSX-källkod med `eslint-plugin-jsx-a11y`
- Skriver `lint-output.json`: `{ errorCount, warningCount, findings[] }`
- Varje finding har: `filePath`, `line`, `column`, `severity`, `ruleId`, `message`

### Fas 2 — Runtime-skanning (axe-core, ~60-180s)
- Körs via `npm run scan -- --url <url>`
- `index.ts` läser `lint-output.json` (skriven av fas 1)
- **Fas 2a:** POST `/scan/submit` med lint-fynd → får `scan_id`, scan skapas med `status: pending_runtime`
- Playwright öppnar Chromium, besöker URL:en
- axe-core analyserar DOM
- **Fas 2b:** POST `/scan/{scan_id}/runtime` med axe-fynd → scan uppdateras till `status: complete`, diff beräknas

---

## Filstruktur

```
FrontPR-repo/
├── github-action/
│   ├── action.yml          ← Definierar inputs, steg, cleanup
│   └── post-comment.sh     ← Postar GitHub Check Runs + PR-kommentar
└── scanner/
    ├── package.json
    └── src/
        ├── index.ts        ← axe-core scanner + Xano-submission (tvåfas)
        └── lint.ts         ← ESLint jsx-a11y statisk analys
```

---

## action.yml — inputs

| Input | Krav | Beskrivning |
|-------|------|-------------|
| `target_url` | Obligatorisk | URL att skanna med axe-core |
| `api_key` | Obligatorisk | FrontPR API-nyckel (GitHub Secret) |

### Steg i action.yml
1. Setup Node.js 22
2. Mask API key i loggar
3. `npm ci` — installera beroenden
4. `npx playwright install chromium`
5. **Run lint** — `npm run lint-a11y -- ${{ github.workspace }}`
6. **Run scanner** — `npm run scan -- --url ${{ inputs.target_url }}`
7. **Post results** — `post-comment.sh scanner-output.json lint-output.json`
8. Cleanup — ta bort output-filer

---

## post-comment.sh

Tar emot två JSON-filer och skapar:

1. **GitHub Check Run "FrontPR — Static Analysis"**
   - `failure` om lint errors > 0 (blockerar merge)
   - `neutral` om bara warnings
   - Inkluderar file:line-annotationer (max 50)

2. **GitHub Check Run "FrontPR — Runtime Scan"**
   - Blockerar aldrig — visar diff mot tidigare scan
   - `success` om inga nya regressions
   - `neutral` om nya fynd (informationellt)

3. **PR-kommentar** — kombinerar statisk + runtime-sektion
   - Uppdaterar befintlig kommentar istället för att skapa nya
   - Identifieras via "Powered by FrontPR"-markör

---

## Miljövariabler i scanner

| Variabel | Källa | Användning |
|----------|-------|-----------|
| `FRONTPR_API_KEY` | GitHub Secret | Autentisering mot Xano |
| `GITHUB_REPOSITORY` | GitHub Actions | `owner/repo`-format |
| `GITHUB_SHA` | GitHub Actions | Commit SHA (40 hex) |
| `GITHUB_PR_NUMBER` | Sätts i action.yml | PR-nummer |

---

## Xano API

Scannern pratar med Xano dEV:
- Host: `xnbe-j9zq-8ibd.f2.xano.io`
- API-group: `whaFBXbn`
- `POST /api:whaFBXbn:dEV/scan/submit` — fas 1
- `POST /api:whaFBXbn:dEV/scan/{id}/runtime` — fas 2

---

## Kommandon

```bash
cd scanner

# Installera beroenden
npm ci

# Kör statisk analys
npm run lint-a11y -- /path/to/repo

# Kör runtime-scan
FRONTPR_API_KEY=xxx GITHUB_REPOSITORY=owner/repo GITHUB_SHA=abc...def npm run scan -- --url https://example.com

# Bygg TypeScript
npm run build
```

---

## ESLint-regler (jsx-a11y)

**Errors** (blockerar merge): `alt-text`, `anchor-has-content`, `aria-props`, `aria-proptypes`, `aria-role`, `aria-unsupported-elements`, `heading-has-content`, `interactive-supports-focus`, `label-has-associated-control`, `no-distracting-elements`, `role-has-required-aria-props`, `role-supports-aria-props`, `scope`

**Warnings** (informationellt): `anchor-is-valid`, `click-events-have-key-events`, `html-has-lang`, `img-redundant-alt`, `no-access-key`, `no-autofocus`, `no-interactive-element-to-noninteractive-role`, `no-noninteractive-element-interactions`, `no-noninteractive-tabindex`, `no-redundant-roles`, `no-static-element-interactions`, `tabindex-no-positive`

---

## Återstående att bygga

- [ ] **Preview URL-detection** — polla GitHub Deployments API för att hitta rätt preview-URL automatiskt
- [ ] **`preview_url`-input** — valfri input i `action.yml` för manuell preview-URL

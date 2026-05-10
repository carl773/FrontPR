import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const SCANNER_VERSION = "0.1.0";
const XANO_HOST = "xnbe-j9zq-8ibd.f2.xano.io";
const XANO_API  = "/api:whaFBXbn:dEV";

interface Finding {
  category: string;
  severity: string;
  ruleId: string;
  title: string;
  description: string;
  filePath: string;
  fingerprint: string;
  rawPayload: unknown;
}

interface LintFinding {
  filePath: string;
  line: number;
  column: number;
  severity: "error" | "warning";
  ruleId: string;
  message: string;
}

interface LintOutput {
  errorCount: number;
  warningCount: number;
  findings: LintFinding[];
}

interface SubmitResponse {
  scan_id: number;
  status: string;
  lint_findings_saved: number;
}

interface RuntimeResponse {
  scan_id: number;
  status: string;
  total_findings: number;
  diff: {
    has_previous: boolean;
    new_count: number;
    fixed_count: number;
    persisting_count: number;
  };
}

function parseArgs(): { fallbackUrl: string } {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf("--url");
  if (urlIndex === -1 || !args[urlIndex + 1]) {
    console.error("Usage: npm run scan -- --url <url>");
    process.exit(1);
  }
  return { fallbackUrl: args[urlIndex + 1] };
}

function validateUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`Invalid target URL: ${raw}`);
    process.exit(1);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.error(`Blocked: only http/https URLs are allowed (got ${parsed.protocol})`);
    process.exit(1);
  }

  const hostname = parsed.hostname;
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      console.error(`Blocked: target URL points to a private/internal address (${hostname})`);
      process.exit(1);
    }
  }
}

function xanoPost<T>(apiPath: string, payload: object): Promise<T | null> {
  const apiKey = process.env.FRONTPR_API_KEY;
  if (!apiKey) {
    console.warn("FRONTPR_API_KEY not set — skipping Xano submission.");
    return Promise.resolve(null);
  }

  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: XANO_HOST,
        path: `${XANO_API}${apiPath}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data) as T);
          } else {
            console.error(`Xano POST ${apiPath} failed with status: ${res.statusCode}`);
            resolve(null);
          }
        });
      }
    );

    req.on("error", (err) => {
      console.error(`Xano request error (${apiPath}): ${err.message}`);
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Resolve the URL to scan.
 * Priority: FRONTPR_PREVIEW_URL (manual) → GitHub Deployments API → fallbackUrl (production)
 */
async function resolveTargetUrl(fallbackUrl: string): Promise<string> {
  // 1. Manual override takes precedence
  const manualPreview = process.env.FRONTPR_PREVIEW_URL?.trim();
  if (manualPreview) {
    console.log(`Preview URL (manual): ${manualPreview}`);
    return manualPreview;
  }

  // 2. Try GitHub Deployments API for auto-detected preview URL
  const token     = process.env.GITHUB_TOKEN;
  const repo      = process.env.GITHUB_REPOSITORY;
  const commitSha = process.env.GITHUB_SHA;

  if (token && repo && commitSha) {
    const detected = await pollDeploymentUrl(token, repo, commitSha);
    if (detected) {
      console.log(`Preview URL (auto-detected): ${detected}`);
      return detected;
    }
  }

  // 3. Fall back to production URL
  console.log(`Preview URL: none found — scanning production URL: ${fallbackUrl}`);
  return fallbackUrl;
}

/** Poll GitHub Deployments API until a preview URL matching the commit SHA is found, or timeout. */
async function pollDeploymentUrl(
  token: string,
  repo: string,
  commitSha: string,
  timeoutMs = 300_000,  // 5 min max wait
  intervalMs = 10_000,  // poll every 10s
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  const [owner, repoName] = repo.split("/");

  console.log(`Polling GitHub Deployments for commit ${commitSha.slice(0, 7)}…`);

  while (Date.now() < deadline) {
    const url = `https://api.github.com/repos/${owner}/${repoName}/deployments?sha=${commitSha}&per_page=10`;

    const previewUrl = await new Promise<string | null>((resolve) => {
      const req = https.request(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "FrontPR-Scanner",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", async () => {
          try {
            const deployments: Array<{ id: number; environment: string }> = JSON.parse(data);
            if (!Array.isArray(deployments) || deployments.length === 0) {
              resolve(null);
              return;
            }

            // Check statuses for each deployment — find a "success" with a target URL
            for (const deployment of deployments) {
              const statusUrl = `https://api.github.com/repos/${owner}/${repoName}/deployments/${deployment.id}/statuses?per_page=5`;
              const statusResult = await fetchJson<Array<{ state: string; environment_url: string }>>(statusUrl, token);
              if (!statusResult) continue;

              const success = statusResult.find(
                (s) => s.state === "success" && s.environment_url && s.environment_url.startsWith("https://")
              );
              if (success) {
                resolve(success.environment_url);
                return;
              }
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      });
      req.on("error", () => resolve(null));
      req.end();
    });

    if (previewUrl) return previewUrl;

    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(`  No preview URL yet — retrying in ${intervalMs / 1000}s (${remaining}s remaining)…`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  console.log("  Timed out waiting for deployment — falling back to production URL.");
  return null;
}

function fetchJson<T>(url: string, token: string): Promise<T | null> {
  return new Promise((resolve) => {
    const req = https.request(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "FrontPR-Scanner",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data) as T); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

/** Read lint-output.json written by lint.ts (runs before this script) */
function readLintOutput(): LintOutput {
  const lintPath = path.resolve("lint-output.json");
  if (!fs.existsSync(lintPath)) {
    console.warn("lint-output.json not found — skipping static findings.");
    return { errorCount: 0, warningCount: 0, findings: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(lintPath, "utf8")) as LintOutput;
  } catch {
    console.warn("Failed to parse lint-output.json — skipping static findings.");
    return { errorCount: 0, warningCount: 0, findings: [] };
  }
}

/** Convert LintFinding → payload shape the scan/submit endpoint expects */
function lintFindingToPayload(f: LintFinding) {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`eslint:${f.ruleId}:${f.filePath}:${f.line}`)
    .digest("hex")
    .slice(0, 32);

  return {
    severity: f.severity === "error" ? "serious" : "minor",
    ruleId: f.ruleId,
    message: f.message,
    filePath: f.filePath,
    line: f.line,
    column: f.column,
    fingerprint,
  };
}

async function run(): Promise<void> {
  const { fallbackUrl } = parseArgs();
  validateUrl(fallbackUrl);

  const apiKey            = process.env.FRONTPR_API_KEY ?? "";
  const repository        = process.env.GITHUB_REPOSITORY ?? "unknown/unknown";
  const commitSha         = process.env.GITHUB_SHA ?? "unknown";
  const pullRequestNumber = parseInt(process.env.GITHUB_PR_NUMBER ?? "0", 10);

  console.log(`FrontPR scanner v${SCANNER_VERSION}`);

  // Resolve the actual URL to scan (preview > manual > production)
  const url = await resolveTargetUrl(fallbackUrl);
  validateUrl(url);

  console.log(`Scanning: ${url}`);

  // ── Phase 1: Submit static (eslint) findings ──────────────────────────────
  const lintOutput = readLintOutput();
  const lintPayload = lintOutput.findings.map(lintFindingToPayload);

  console.log(`Static findings: ${lintOutput.errorCount} error(s), ${lintOutput.warningCount} warning(s)`);
  console.log("Submitting static findings to Xano (Phase 1)...");

  const submitResult = await xanoPost<SubmitResponse>("/scan/submit", {
    api_key: apiKey,
    repository,
    pull_request_number: pullRequestNumber,
    commit_sha: commitSha,
    target_url: url,
    scanner_version: SCANNER_VERSION,
    lint_findings: lintPayload,
  });

  const scanId = submitResult?.scan_id ?? null;
  if (scanId) {
    console.log(`Xano: scan created (scan_id: ${scanId}, status: pending_runtime)`);
  } else {
    console.warn("Xano: Phase 1 submission failed — continuing with runtime scan.");
  }

  // ── Phase 2: Run axe-core and submit runtime findings ────────────────────
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  console.log("Running axe accessibility checks...");
  const results = await new AxeBuilder({ page }).analyze();
  await browser.close();

  const findings: Finding[] = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const target      = node.target.join(" ");
      const fingerprint = crypto
        .createHash("sha256")
        .update(`${violation.id}:${target}`)
        .digest("hex")
        .slice(0, 32);

      return {
        category: "accessibility",
        severity: violation.impact ?? "minor",
        ruleId: violation.id,
        title: violation.description,
        description: violation.help,
        filePath: target,
        fingerprint,
        rawPayload: {
          violation: {
            id: violation.id,
            impact: violation.impact,
            tags: violation.tags,
            helpUrl: violation.helpUrl,
          },
          node: {
            html: node.html,
            target: node.target,
            failureSummary: node.failureSummary ?? "",
          },
        },
      };
    })
  );

  console.log(`Runtime findings: ${findings.length}`);

  let runtimeResult: RuntimeResponse | null = null;

  if (scanId) {
    console.log("Submitting runtime findings to Xano (Phase 2)...");
    runtimeResult = await xanoPost<RuntimeResponse>(`/scan/${scanId}/runtime`, {
      api_key: apiKey,
      scan_id: scanId,
      findings,
    });

    if (runtimeResult) {
      console.log(`Xano: scan complete (total_findings: ${runtimeResult.total_findings})`);
      if (runtimeResult.diff?.has_previous) {
        const d = runtimeResult.diff;
        console.log(`Diff: +${d.new_count} new, -${d.fixed_count} fixed, ${d.persisting_count} persisting`);
      }
    }
  }

  // ── Write scanner-output.json for post-comment.sh ─────────────────────────
  const outputPath = path.resolve("scanner-output.json");
  fs.writeFileSync(outputPath, JSON.stringify({
    repository,
    commitSha,
    pullRequestNumber,
    scannerVersion: SCANNER_VERSION,
    targetUrl: url,
    scanId,
    findings,
    diff: runtimeResult?.diff ?? null,
  }, null, 2));

  console.log(`Output written to: ${outputPath}`);
}

run().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});

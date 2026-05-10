import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const SCANNER_VERSION = "0.1.0";

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

function parseArgs(): { url: string } {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf("--url");
  if (urlIndex === -1 || !args[urlIndex + 1]) {
    console.error("Usage: npm run scan -- --url <url>");
    process.exit(1);
  }
  return { url: args[urlIndex + 1] };
}

function validateUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`Invalid target URL: ${raw}`);
    process.exit(1);
  }

  // Only allow http and https — block file://, data://, ftp://, etc.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    console.error(`Blocked: only http/https URLs are allowed (got ${parsed.protocol})`);
    process.exit(1);
  }

  // Block private/internal IP ranges (SSRF protection)
  const hostname = parsed.hostname;
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^0\.0\.0\.0$/,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // link-local (AWS IMDS etc.)
    /^::1$/,       // IPv6 loopback
    /^fc00:/i,     // IPv6 unique local
    /^fe80:/i,     // IPv6 link-local
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      console.error(`Blocked: target URL points to a private/internal address (${hostname})`);
      process.exit(1);
    }
  }
}

async function submitToXano(payload: object): Promise<void> {
  const apiKey = process.env.FRONTPR_API_KEY;
  if (!apiKey) {
    console.warn("FRONTPR_API_KEY not set — skipping Xano submission.");
    return;
  }

  const body = JSON.stringify(payload);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "xnbe-j9zq-8ibd.f2.xano.io",
        path: "/api:whaFBXbn:dEV/scan/submit",
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
            const parsed = JSON.parse(data);
            console.log(`Xano: scan saved (scan_id: ${parsed.scan_id})`);
            resolve();
          } else {
            // Log only the status code — never log response body (may echo request data)
            console.error(`Xano submission failed with status: ${res.statusCode}`);
            resolve();
          }
        });
      }
    );

    req.on("error", (err) => {
      console.error(`Xano submission error: ${err.message}`);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

async function run(): Promise<void> {
  const { url } = parseArgs();
  validateUrl(url);

  const apiKey            = process.env.FRONTPR_API_KEY ?? "";
  const repository        = process.env.GITHUB_REPOSITORY ?? "unknown/unknown";
  const commitSha         = process.env.GITHUB_SHA ?? "unknown";
  const pullRequestNumber = parseInt(process.env.GITHUB_PR_NUMBER ?? "0", 10);

  console.log(`FrontPR scanner v${SCANNER_VERSION}`);
  console.log(`Target URL: ${url}`);
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

  const outputPath = path.resolve("scanner-output.json");
  fs.writeFileSync(outputPath, JSON.stringify({
    repository,
    commitSha,
    pullRequestNumber,
    scannerVersion: SCANNER_VERSION,
    targetUrl: url,
    findings,
  }, null, 2));

  console.log(`Findings: ${findings.length}`);
  console.log(`Output written to: ${outputPath}`);

  console.log("Submitting scan to Xano...");
  await submitToXano({
    api_key: apiKey,
    repository,
    pull_request_number: pullRequestNumber,
    commit_sha: commitSha,
    target_url: url,
    scanner_version: SCANNER_VERSION,
    findings,
  });
}

run().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

interface Finding {
  category: string;
  severity: string;
  ruleId: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber: number | null;
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

async function submitToXano(payload: object): Promise<void> {
  const apiKey = process.env.FRONTPR_API_KEY;
  if (!apiKey) {
    console.warn("FRONTPR_API_KEY not set — skipping Xano submission.");
    return;
  }

  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
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
            console.error(`Xano submission failed: ${res.statusCode} ${data}`);
            // Don't fail the action if Xano is unreachable
            resolve();
          }
        });
      }
    );

    req.on("error", (err) => {
      console.error(`Xano submission error: ${err.message}`);
      // Don't fail the action if Xano is unreachable
      resolve();
    });

    req.write(body);
    req.end();
  });
}

async function run(): Promise<void> {
  const { url } = parseArgs();

  const apiKey     = process.env.FRONTPR_API_KEY ?? "";
  const repository = process.env.GITHUB_REPOSITORY ?? "unknown/unknown";
  const commitSha  = process.env.GITHUB_SHA ?? "unknown";
  const pullRequestNumber = parseInt(process.env.GITHUB_PR_NUMBER ?? "0", 10);

  console.log("FrontPR scanner v0.1.0");
  console.log(`Target URL: ${url}`);
  console.log("Launching browser...");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  console.log("Running axe accessibility checks...");
  const results = await new AxeBuilder({ page }).analyze();
  await browser.close();

  const findings: Finding[] = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => {
      const target = node.target.join(" ");
      const fingerprint = crypto
        .createHash("sha256")
        .update(`${violation.id}:${target}`)
        .digest("hex")
        .slice(0, 16);

      return {
        category: "accessibility",
        severity: violation.impact ?? "minor",
        ruleId: violation.id,
        title: violation.description,
        description: violation.help,
        filePath: target,
        lineNumber: null,
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

  const output = {
    repository,
    commitSha,
    pullRequestNumber,
    scannerVersion: "0.1.0",
    targetUrl: url,
    findings,
  };

  const outputPath = path.resolve("scanner-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Findings: ${findings.length}`);
  console.log(`Output written to: ${outputPath}`);

  // Submit to Xano
  console.log("Submitting scan to Xano...");
  await submitToXano({
    api_key: apiKey,
    repository,
    pull_request_number: pullRequestNumber,
    commit_sha: commitSha,
    target_url: url,
    scanner_version: "0.1.0",
    findings,
  });
}

run().catch((err) => {
  console.error("Scanner failed:", err);
  process.exit(1);
});

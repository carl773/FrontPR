import fs from "fs";
import path from "path";

function parseArgs(): { url: string } {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf("--url");
  if (urlIndex === -1 || !args[urlIndex + 1]) {
    console.error("Usage: npm run scan -- --url <url>");
    process.exit(1);
  }
  return { url: args[urlIndex + 1] };
}

function run() {
  const { url } = parseArgs();

  const output = {
    projectId: "fake-project-001",
    repository: "owner/repo",
    commitSha: "abc1234567890",
    pullRequestNumber: 1,
    scannerVersion: "0.1.0",
    targetUrl: url,
    findings: [
      {
        category: "accessibility",
        severity: "serious",
        ruleId: "color-contrast",
        title: "Element has insufficient color contrast",
        description: "Text contrast does not meet WCAG requirements",
        filePath: "src/App.tsx",
        lineNumber: 42,
        fingerprint: "fake-fingerprint-001",
        rawPayload: {},
      },
      {
        category: "compliance",
        severity: "moderate",
        ruleId: "missing-privacy-link",
        title: "Privacy policy link not found",
        description: "No privacy policy link detected on the page",
        filePath: "src/App.tsx",
        lineNumber: 10,
        fingerprint: "fake-fingerprint-002",
        rawPayload: {},
      },
    ],
  };

  const outputPath = path.resolve("scanner-output.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`FrontPR scanner v${output.scannerVersion}`);
  console.log(`Target URL: ${url}`);
  console.log(`Findings: ${output.findings.length}`);
  console.log(`Output written to: ${outputPath}`);
}

run();

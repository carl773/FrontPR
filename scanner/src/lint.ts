import { ESLint } from "eslint";
import fs from "fs";
import path from "path";

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

const IGNORE_DIRS = /[/\\](node_modules|dist|build|\.next|out|coverage)[/\\]/;

const JSX_A11Y_RULES: Record<string, "error" | "warn"> = {
  // Errors — clear WCAG violations
  "jsx-a11y/alt-text":                              "error",
  "jsx-a11y/anchor-has-content":                    "error",
  "jsx-a11y/aria-props":                            "error",
  "jsx-a11y/aria-proptypes":                        "error",
  "jsx-a11y/aria-role":                             "error",
  "jsx-a11y/aria-unsupported-elements":             "error",
  "jsx-a11y/heading-has-content":                   "error",
  "jsx-a11y/interactive-supports-focus":            "error",
  "jsx-a11y/label-has-associated-control":          "error",
  "jsx-a11y/no-distracting-elements":               "error",
  "jsx-a11y/role-has-required-aria-props":          "error",
  "jsx-a11y/role-supports-aria-props":              "error",
  "jsx-a11y/scope":                                 "error",

  // Warnings — best practice, not always a hard violation
  "jsx-a11y/anchor-is-valid":                       "warn",
  "jsx-a11y/click-events-have-key-events":          "warn",
  "jsx-a11y/html-has-lang":                         "warn",
  "jsx-a11y/img-redundant-alt":                     "warn",
  "jsx-a11y/no-access-key":                         "warn",
  "jsx-a11y/no-autofocus":                          "warn",
  "jsx-a11y/no-interactive-element-to-noninteractive-role": "warn",
  "jsx-a11y/no-noninteractive-element-interactions": "warn",
  "jsx-a11y/no-noninteractive-tabindex":            "warn",
  "jsx-a11y/no-redundant-roles":                    "warn",
  "jsx-a11y/no-static-element-interactions":        "warn",
  "jsx-a11y/tabindex-no-positive":                  "warn",
};

async function runLint(): Promise<void> {
  const targetDir = process.argv[2];
  const outputPath = path.resolve("lint-output.json");

  if (!targetDir || !fs.existsSync(targetDir)) {
    console.error("Usage: npm run lint-a11y -- <directory>");
    writeOutput(outputPath, { errorCount: 0, warningCount: 0, findings: [] });
    process.exit(0);
  }

  // Prefer src/ if it exists, otherwise scan the whole project
  const scanTarget = fs.existsSync(path.join(targetDir, "src"))
    ? path.join(targetDir, "src")
    : targetDir;

  const eslint = new (ESLint as any)({
    useEslintrc: false,
    extensions: [".tsx", ".jsx", ".js", ".ts"],
    overrideConfig: {
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      plugins: ["jsx-a11y"],
      rules: JSX_A11Y_RULES,
      ignorePatterns: ["node_modules/", "dist/", "build/", ".next/", "out/", "coverage/"],
    },
  });

  let results: ESLint.LintResult[] = [];
  try {
    results = await eslint.lintFiles([scanTarget]);
  } catch (err) {
    console.warn("ESLint error:", err instanceof Error ? err.message : String(err));
    writeOutput(outputPath, { errorCount: 0, warningCount: 0, findings: [] });
    process.exit(0);
  }

  const findings: LintFinding[] = [];

  for (const result of results) {
    if (IGNORE_DIRS.test(result.filePath)) continue;

    for (const msg of result.messages) {
      if (!msg.ruleId?.startsWith("jsx-a11y/")) continue;

      findings.push({
        filePath: path.relative(targetDir, result.filePath).replace(/\\/g, "/"),
        line: msg.line ?? 1,
        column: msg.column ?? 1,
        severity: msg.severity === 2 ? "error" : "warning",
        ruleId: msg.ruleId,
        message: msg.message,
      });
    }
  }

  // Sort: errors first, then by file path, then by line
  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return a.line - b.line;
  });

  const errorCount   = findings.filter(f => f.severity === "error").length;
  const warningCount = findings.filter(f => f.severity === "warning").length;

  writeOutput(outputPath, { errorCount, warningCount, findings });
  console.log(`ESLint jsx-a11y: ${errorCount} error(s), ${warningCount} warning(s)`);
}

function writeOutput(outputPath: string, data: LintOutput): void {
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
}

// Always exit 0 — blocking decision is made in post-comment.sh
runLint().catch((err) => {
  console.warn("ESLint runner failed unexpectedly:", err instanceof Error ? err.message : String(err));
  const outputPath = path.resolve("lint-output.json");
  if (!fs.existsSync(outputPath)) {
    fs.writeFileSync(outputPath, JSON.stringify({ errorCount: 0, warningCount: 0, findings: [] }, null, 2));
  }
});

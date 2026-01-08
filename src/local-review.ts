import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { runReview, getModelString, type ReviewContext } from "./utils/review-common.js";

async function runLocalReview(): Promise<void> {
  // Load environment variables from .env.local if present
  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const [key, ...valueParts] = line.split("=");
      const value = valueParts.join("=");
      if (key && !key.startsWith("#") && value) {
        process.env[key.trim()] = value.trim();
      }
    }
  }

  const provider = process.env.PROVIDER || "openrouter:openrouter/auto";
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error("❌ No API key found!");
    console.error("Set one of:");
    console.error("  export OPENROUTER_API_KEY=your_key");
    console.error("  export ANTHROPIC_API_KEY=your_key");
    console.error("Or create .env.local file:");
    console.error("  OPENROUTER_API_KEY=your_key");
    process.exit(1);
  }

  // Configure provider environment variables
  if (provider.startsWith("openrouter:")) {
    process.env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
    process.env.ANTHROPIC_AUTH_TOKEN = apiKey;
    process.env.ANTHROPIC_API_KEY = "";
  } else {
    process.env.ANTHROPIC_API_KEY = apiKey;
  }

  // Fix for ncc-bundled environments: ensure SDK can spawn node processes
  if (!process.env.NODE) {
    process.env.NODE = process.execPath;
  }

  console.log("🔍 Starting local code review...");
  console.log(`   Provider: ${provider}`);
  console.log(`   Working directory: ${process.cwd()}`);
  console.log("");

  // Detect changed files from git
  let changedFiles: string[] = [];
  try {
    const diffOutput = execSync(
      "git diff --name-only main 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo 'src/'",
      { encoding: "utf-8" },
    );
    changedFiles = diffOutput.trim().split("\n").filter(Boolean);
  } catch {
    changedFiles = ["src/"];
  }

  // Load custom prompt from .claude/prompt.md if available
  const promptPath = path.join(process.cwd(), ".claude", "prompt.md");
  let customPrompt = "Review this codebase for security, correctness, and code quality issues.";
  if (fs.existsSync(promptPath)) {
    customPrompt = fs.readFileSync(promptPath, "utf-8");
  }

  const contextMessage = `
## Local Review Context
- Working directory: ${process.cwd()}
- Changed files: ${changedFiles.join(", ") || "all files"}
- Review mode: LOCAL DEVELOPMENT

Please review the changed files focusing on:
1. TypeScript best practices
2. GitHub Actions security (in .github/workflows/)
3. Error handling patterns
4. Code quality and maintainability

Provide a detailed summary of your findings, organized by severity:
- CRITICAL issues (security vulnerabilities, data loss)
- HIGH priority (bugs that will fail in production)
- MEDIUM priority (code quality, maintainability)
- LOW priority (style, minor improvements)

Do NOT explore the entire codebase. Focus only on the changed files listed above.
`;

  try {
    const reviewContext: ReviewContext = {
      model: getModelString(provider),
      maxTurns: 50,
      cwd: path.join(process.cwd(), ".claude"),
      allowedTools: ["Read"],
      permissionMode: "bypassPermissions",
      maxBudgetUsd: 5.0,
    };

    const { totalCost, hadOutput } = await runReview({
      prompt: `${customPrompt}\n${contextMessage}`,
      context: reviewContext,
      onMessage: (message) => {
        const msg = message as any;
        if (msg.type === "system" && msg.subtype === "init") {
          console.log(`   Session ID: ${msg.session_id}`);
        }
      },
      onOutput: (text) => {
        console.log(text);
      },
      onError: (error) => {
        console.error("\n❌ Fatal error:");
        console.error(error.message);
        if (error.stack) {
          console.error("\nStack trace:");
          console.error(error.stack);
        }
      },
    });

    if (!hadOutput) {
      console.log("\n⚠️ No review output was generated. This might indicate an issue with the API key or model.");
    }

    if (totalCost > 0) {
      console.log(`\n✅ Review complete! Cost: $${totalCost.toFixed(4)}`);
    }

    console.log(`\n📊 Total cost: $${totalCost.toFixed(4)}`);
  } catch (error) {
    console.error("Failed to run review");
    process.exit(1);
  }
}

runLocalReview().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});

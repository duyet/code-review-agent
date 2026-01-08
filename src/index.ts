import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { githubMcpServer } from "./tools/github-tools.js";
import { loadConfig } from "./utils/config.js";

async function run(): Promise<void> {
  try {
    const config = loadConfig();
    const context = github.context;

    // Configure OpenRouter environment variables
    if (config.provider.startsWith("openrouter:")) {
      process.env.ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
      process.env.ANTHROPIC_AUTH_TOKEN = config.openrouterApiKey || "";
      process.env.ANTHROPIC_API_KEY = ""; // Must be explicitly empty for OpenRouter
    } else if (config.provider === "claude" || config.provider === "anthropic") {
      // For Anthropic provider, set the API key
      process.env.ANTHROPIC_API_KEY = config.anthropicApiKey || "";
    }

    // Check if we should run
    if (!shouldRun(context, config)) {
      core.info("Skipping: not a relevant event");
      return;
    }

    core.info(`Starting code review for PR #${context.issue.number}...`);

    // Fix for ncc-bundled environments: ensure SDK can spawn node processes
    // In bundled code, 'node' may not be in PATH when SDK tries to spawn subprocesses
    // Only set if not already configured to avoid overriding explicit settings
    if (!process.env.NODE) {
      process.env.NODE = process.execPath;
    }

    // Use V1 query with full options
    for await (const message of query({
      prompt: buildPrompt(config),
      options: {
        model: getModelString(config.provider),
        maxTurns: 50,
        cwd: path.join(process.cwd(), ".claude"),
        allowedTools: ["Read", "WebSearch", "WebFetch"],
        mcpServers: { github: githubMcpServer },
        permissionMode: "bypassPermissions",
        maxBudgetUsd: config.maxBudgetUsd,
      },
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            core.debug(block.text);
          }
        }
      }

      if (message.type === "result") {
        if (message.subtype === "success") {
          core.info(`Review complete. Cost: $${message.total_cost_usd?.toFixed(4)}`);
        } else {
          core.warning(`Review ended: ${message.subtype}`);
        }
      }
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function getModelString(provider: string): string {
  // Format: "openrouter:model" or "anthropic" or "claude"
  if (provider === "anthropic" || provider === "claude") {
    return "claude-sonnet-4-5-20250929";
  }
  return provider;
}

function shouldRun(
  context: typeof github.context,
  config: { githubUsername: string; reviewOnOpen: boolean; reviewOnUpdate: boolean },
): boolean {
  const { eventName, payload } = context;

  // PR events
  if (eventName === "pull_request") {
    const action = payload.action;
    if (action === "opened" && config.reviewOnOpen) return true;
    if ((action === "synchronize" || action === "reopened") && config.reviewOnUpdate) return true;
    return false;
  }

  // Comment mentions
  if (eventName === "issue_comment" || eventName === "pull_request_review_comment") {
    const comment = payload.comment?.body || "";
    const isPR = eventName === "pull_request_review_comment" || payload.issue?.pull_request;
    return isPR && comment.includes(config.githubUsername.replace("@", ""));
  }

  return false;
}

function buildPrompt(config: {
  customPrompt?: string;
  autoMerge: boolean;
  mergeMethod: string;
}): string {
  const autoMergeInstructions = config.autoMerge
    ? `
## Auto-Merge Enabled
This action has auto-merge enabled. After submitting your review:
1. If verdict is APPROVE and no CRITICAL/HIGH issues: Use check_ci_status tool
2. If CI checks pass: Use merge_pr tool with method="${config.mergeMethod}"
3. If CI fails or verdict is REQUEST_CHANGES: Do not merge
`
    : "";

  const base = `Review this pull request. Analyze the diff, identify issues, add inline comments, and submit a review.${autoMergeInstructions}`;
  return config.customPrompt ? `${base}\n\nAdditional instructions: ${config.customPrompt}` : base;
}

run();

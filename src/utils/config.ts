import * as core from "@actions/core";
import type { Config } from "./types.js";

export function loadConfig(): Config {
  const provider = core.getInput("provider") || "claude";
  const githubToken = process.env.GITHUB_TOKEN;

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  // Validate provider-specific API keys
  if (provider === "claude" || provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when using claude/anthropic provider");
    }
  } else if (provider.startsWith("openrouter:")) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is required when using openrouter provider");
    }
  }

  return {
    provider,
    customPrompt: core.getInput("prompt") || undefined,
    githubUsername: core.getInput("github_username") || "@duyetbot",
    reviewOnOpen: core.getInput("review_on_open") !== "false",
    reviewOnUpdate: core.getInput("review_on_update") !== "false",
    maxBudgetUsd: parseFloat(core.getInput("max_budget_usd") || "5.00"),
    autoMerge: core.getInput("auto_merge") === "true",
    mergeMethod: (core.getInput("merge_method") || "merge") as "merge" | "squash" | "rebase",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    githubToken,
  };
}

export function validateConfig(config: Config): void {
  if (config.maxBudgetUsd <= 0) {
    throw new Error("max_budget_usd must be greater than 0");
  }

  if (!config.githubUsername.startsWith("@")) {
    core.warning("github_username should start with @, adding it automatically");
  }
}

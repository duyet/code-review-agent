/**
 * Common review utilities shared between GitHub Actions and local review modes
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

export interface ReviewContext {
  model: string;
  maxTurns: number;
  cwd: string;
  allowedTools: string[];
  permissionMode: "bypassPermissions" | "requirePermissions";
  maxBudgetUsd: number;
  mcpServers?: Record<string, unknown>;
}

export interface ReviewOptions {
  prompt: string;
  context: ReviewContext;
  onMessage?: (message: unknown) => void;
  onOutput?: (text: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Common function to run a code review using the Claude Agent SDK
 * Used by both GitHub Actions and local review modes
 */
export async function runReview(
  options: ReviewOptions,
): Promise<{ totalCost: number; hadOutput: boolean }> {
  const { prompt, context, onMessage, onOutput, onError } = options;

  let totalCost = 0;
  let hadOutput = false;

  try {
    const queryOptions: Record<string, unknown> = {
      model: context.model,
      maxTurns: context.maxTurns,
      cwd: context.cwd,
      allowedTools: context.allowedTools,
      permissionMode: context.permissionMode,
      maxBudgetUsd: context.maxBudgetUsd,
      ...(context.mcpServers && { mcpServers: context.mcpServers }),
    };

    for await (const message of query({
      prompt,
      options: queryOptions,
    })) {
      if (onMessage) {
        onMessage(message);
      }

      // Process assistant messages
      // biome-ignore lint/suspicious/noExplicitAny: SDK message types are not exported
      if ((message as any).type === "assistant" && (message as any).message?.content) {
        // biome-ignore lint/suspicious/noExplicitAny: SDK message types are not exported
        for (const block of (message as any).message.content) {
          if (block.type === "text") {
            hadOutput = true;
            if (onOutput) {
              onOutput(block.text);
            }
          }
        }
      }

      // Track completion and cost
      // biome-ignore lint/suspicious/noExplicitAny: SDK message types are not exported
      if ((message as any).type === "result") {
        // biome-ignore lint/suspicious/noExplicitAny: SDK message types are not exported
        if ((message as any).subtype === "success") {
          // biome-ignore lint/suspicious/noExplicitAny: SDK message types are not exported
          totalCost = (message as any).total_cost_usd || 0;
        }
      }
    }

    return { totalCost, hadOutput };
  } catch (error) {
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw error;
  }
}

/**
 * Convert provider string to model identifier
 * Examples:
 *   "openrouter:anthropic/claude-sonnet-4" -> "anthropic/claude-sonnet-4"
 *   "anthropic" -> "claude-sonnet-4-5-20250929"
 *   "claude" -> "claude-sonnet-4-5-20250929"
 */
export function getModelString(provider: string): string {
  if (provider === "anthropic" || provider === "claude") {
    return "claude-sonnet-4-5-20250929";
  }
  if (provider.startsWith("openrouter:")) {
    return provider.substring("openrouter:".length);
  }
  return provider;
}

/**
 * Build a standard review prompt with optional auto-merge instructions
 */
export function buildReviewPrompt(options: {
  customPrompt?: string;
  autoMerge?: boolean;
  mergeMethod?: string;
  context?: string;
}): string {
  const autoMergeInstructions = options.autoMerge
    ? `
## Auto-Merge Enabled
This action has auto-merge enabled. After submitting your review:
1. If verdict is APPROVE and no CRITICAL/HIGH issues: Use check_ci_status tool
2. If CI checks pass: Use merge_pr tool with method="${options.mergeMethod || "merge"}"
3. If CI fails or verdict is REQUEST_CHANGES: Do not merge
`
    : "";

  const contextSection = options.context ? `\n\n${options.context}` : "";

  const base = `Review this code. Analyze for security vulnerabilities, bugs, and code quality issues. Add inline comments and submit a review.${autoMergeInstructions}`;
  const withCustom = options.customPrompt
    ? `${base}\n\nAdditional instructions: ${options.customPrompt}`
    : base;

  return withCustom + contextSection;
}

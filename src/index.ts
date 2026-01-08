import { query } from '@anthropic-ai/claude-agent-sdk';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { githubMcpServer } from './tools/github-tools.js';
import { loadConfig } from './utils/config.js';
import * as path from 'path';

async function run(): Promise<void> {
  try {
    const config = loadConfig();
    const context = github.context;

    // Check if we should run
    if (!shouldRun(context, config)) {
      core.info('Skipping: not a relevant event');
      return;
    }

    core.info(`Starting code review for PR #${context.issue.number}...`);

    let reviewId = '';
    let commentCount = 0;

    // Use V1 query with full options
    for await (const message of query({
      prompt: buildPrompt(config),
      options: {
        model: getModelString(config.provider),
        maxTurns: 50,
        cwd: path.join(process.cwd(), '.claude'),
        allowedTools: ['Read', 'WebSearch', 'WebFetch'],
        mcpServers: { github: githubMcpServer },
        permissionMode: 'bypassPermissions',
        maxBudgetUsd: config.maxBudgetUsd,
      },
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if ('text' in block) {
            core.debug(block.text);
          }
        }
      }

      if (message.type === 'result') {
        if (message.subtype === 'success') {
          core.info(`Review complete. Cost: $${message.total_cost_usd?.toFixed(4)}`);
        } else {
          core.warning(`Review ended: ${message.subtype}`);
        }
      }
    }

    core.setOutput('review_id', reviewId);
    core.setOutput('comment_count', commentCount);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

function getModelString(provider: string): string {
  // Format: "openrouter:model" or "anthropic" or "claude"
  if (provider === 'anthropic' || provider === 'claude') {
    return 'claude-sonnet-4-5-20250929';
  }
  return provider;
}

function shouldRun(context: typeof github.context, config: { githubUsername: string; reviewOnOpen: boolean; reviewOnUpdate: boolean }): boolean {
  const { eventName, payload } = context;

  // PR events
  if (eventName === 'pull_request') {
    const action = payload.action;
    if (action === 'opened' && config.reviewOnOpen) return true;
    if ((action === 'synchronize' || action === 'reopened') && config.reviewOnUpdate) return true;
    return false;
  }

  // Comment mentions
  if (eventName === 'issue_comment' || eventName === 'pull_request_review_comment') {
    const comment = payload.comment?.body || '';
    const isPR = eventName === 'pull_request_review_comment' || payload.issue?.pull_request;
    return isPR && comment.includes(config.githubUsername.replace('@', ''));
  }

  return false;
}

function buildPrompt(config: { customPrompt?: string }): string {
  const base = 'Review this pull request. Analyze the diff, identify issues, add inline comments, and submit a review.';
  return config.customPrompt ? `${base}\n\nAdditional instructions: ${config.customPrompt}` : base;
}

run();

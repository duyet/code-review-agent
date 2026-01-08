import * as core from '@actions/core';
import { runCodeReview } from '../agent/review-agent.js';
import type { Config, ReviewResult } from '../utils/types.js';
import { logger } from '../utils/logger.js';
import { getOctokit, addPRComment } from '../github/api.js';

interface MentionCommand {
  action: 'review' | 'help' | 'unknown';
  instructions?: string;
}

export async function handleMention(config: Config, commentBody: string): Promise<ReviewResult | null> {
  logger.startGroup('Handling @mention');

  try {
    const command = parseCommand(commentBody, config.githubUsername);
    logger.info(`Detected command: ${command.action}`);

    if (command.action === 'help') {
      await postHelpMessage(config);
      return null;
    }

    if (command.action === 'unknown') {
      logger.warning('Unknown command, defaulting to review');
    }

    // Post acknowledgment
    const octokit = getOctokit(config.githubToken);
    await addPRComment(
      octokit,
      `${config.githubUsername} Starting code review... 🔍\n\n_This may take a few minutes depending on PR size._`
    );

    // Run review with custom instructions if provided
    const reviewConfig: Config = {
      ...config,
      customPrompt: command.instructions || config.customPrompt,
    };

    const result = await runCodeReview(reviewConfig);

    // Set outputs
    core.setOutput('review_id', result.reviewId);
    core.setOutput('comment_count', result.commentCount);
    core.setOutput('summary', result.summary);

    return result;
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)));

    // Post error message to PR
    try {
      const octokit = getOctokit(config.githubToken);
      await addPRComment(
        octokit,
        `${config.githubUsername} ❌ Code review failed.\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\``
      );
    } catch {
      // Ignore errors posting the error message
    }

    throw error;
  } finally {
    logger.endGroup();
  }
}

function parseCommand(commentBody: string, username: string): MentionCommand {
  const cleanUsername = username.replace('@', '');
  const mentionPattern = new RegExp(`@${cleanUsername}\\s*(.*)`, 'is');
  const match = commentBody.match(mentionPattern);

  if (!match) {
    return { action: 'unknown' };
  }

  const commandText = match[1].trim().toLowerCase();

  // Check for help command
  if (commandText === 'help' || commandText === '--help' || commandText === '-h') {
    return { action: 'help' };
  }

  // Check for review command with optional instructions
  if (commandText.startsWith('review')) {
    const instructions = commandText.slice(6).trim();
    return {
      action: 'review',
      instructions: instructions || undefined,
    };
  }

  // Default to review with the full text as instructions
  if (commandText) {
    return {
      action: 'review',
      instructions: match[1].trim(), // Use original case
    };
  }

  return { action: 'review' };
}

async function postHelpMessage(config: Config): Promise<void> {
  const octokit = getOctokit(config.githubToken);
  const helpMessage = `## ${config.githubUsername} Help

### Commands
- \`${config.githubUsername}\` - Run a code review
- \`${config.githubUsername} review\` - Run a code review
- \`${config.githubUsername} review [instructions]\` - Run a review with custom focus
- \`${config.githubUsername} help\` - Show this help message

### Examples
\`\`\`
${config.githubUsername} focus on security issues
${config.githubUsername} review check for SQL injection
${config.githubUsername} please review the authentication changes
\`\`\`

### Configuration
- Provider: \`${config.provider}\`
- Auto-review on open: \`${config.reviewOnOpen}\`
- Auto-review on update: \`${config.reviewOnUpdate}\`
- Max budget: \`$${config.maxBudgetUsd}\`
`;

  await addPRComment(octokit, helpMessage);
}

export function isMentioned(commentBody: string, username: string): boolean {
  const cleanUsername = username.replace('@', '');
  return commentBody.toLowerCase().includes(`@${cleanUsername.toLowerCase()}`);
}

import * as core from '@actions/core';
import * as github from '@actions/github';
import { loadConfig, validateConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { handlePREvent } from './handlers/pr-opened.js';
import { handleMention, isMentioned } from './handlers/mention.js';

async function run(): Promise<void> {
  try {
    const config = loadConfig();
    validateConfig(config);

    const context = github.context;
    const eventName = context.eventName;
    const action = context.payload.action;

    logger.info(`Event: ${eventName}, Action: ${action || 'N/A'}`);
    logger.info(`Repository: ${context.repo.owner}/${context.repo.repo}`);

    // Handle pull_request events
    if (eventName === 'pull_request') {
      if (action === 'opened' && config.reviewOnOpen) {
        logger.info('PR opened, starting review...');
        await handlePREvent(config, 'opened');
      } else if (action === 'synchronize' && config.reviewOnUpdate) {
        logger.info('PR updated, starting re-review...');
        await handlePREvent(config, 'updated');
      } else if (action === 'reopened' && config.reviewOnOpen) {
        logger.info('PR reopened, starting review...');
        await handlePREvent(config, 'reopened');
      } else {
        logger.info(`Skipping PR action: ${action}`);
      }
      return;
    }

    // Handle issue_comment events (for @mentions)
    if (eventName === 'issue_comment') {
      const comment = context.payload.comment;
      const issue = context.payload.issue;

      // Only process comments on PRs, not issues
      if (!issue?.pull_request) {
        logger.info('Comment is on an issue, not a PR. Skipping.');
        return;
      }

      // Only process new comments
      if (action !== 'created') {
        logger.info(`Skipping comment action: ${action}`);
        return;
      }

      const commentBody = comment?.body || '';
      const username = config.githubUsername;

      // Check if the bot is mentioned
      if (isMentioned(commentBody, username)) {
        logger.info(`Bot mentioned in comment, processing...`);
        await handleMention(config, commentBody);
      } else {
        logger.info('Bot not mentioned in comment. Skipping.');
      }
      return;
    }

    // Handle pull_request_review_comment events
    if (eventName === 'pull_request_review_comment') {
      const comment = context.payload.comment;

      if (action !== 'created') {
        logger.info(`Skipping review comment action: ${action}`);
        return;
      }

      const commentBody = comment?.body || '';
      const username = config.githubUsername;

      if (isMentioned(commentBody, username)) {
        logger.info(`Bot mentioned in review comment, processing...`);
        await handleMention(config, commentBody);
      } else {
        logger.info('Bot not mentioned in review comment. Skipping.');
      }
      return;
    }

    logger.warning(`Unsupported event: ${eventName}`);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
      logger.error(error);
    } else {
      core.setFailed(String(error));
      logger.error(new Error(String(error)));
    }
  }
}

run();

import * as core from '@actions/core';
import { runCodeReview } from '../agent/review-agent.js';
import type { Config, ReviewResult } from '../utils/types.js';
import { logger } from '../utils/logger.js';

export async function handlePREvent(
  config: Config,
  trigger: 'opened' | 'updated' | 'reopened'
): Promise<ReviewResult> {
  logger.startGroup(`Handling PR ${trigger} event`);

  try {
    logger.info(`Trigger: ${trigger}`);
    logger.info(`Provider: ${config.provider}`);
    logger.info(`Max budget: $${config.maxBudgetUsd}`);

    const result = await runCodeReview(config);

    logger.info(`Review completed`);
    logger.info(`- Review ID: ${result.reviewId}`);
    logger.info(`- Comments: ${result.commentCount}`);
    if (result.cost !== undefined) {
      logger.info(`- Cost: $${result.cost.toFixed(4)}`);
    }

    // Set outputs
    core.setOutput('review_id', result.reviewId);
    core.setOutput('comment_count', result.commentCount);
    core.setOutput('summary', result.summary);

    return result;
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    logger.endGroup();
  }
}

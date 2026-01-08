import { createProvider, type ChatMessage, type ToolDefinition } from '../providers/index.js';
import { tools, executeTool, getQueuedCommentCount, clearQueuedComments } from './tools/github-tools.js';
import { buildReviewPrompt, REVIEW_START_MESSAGE } from './prompts.js';
import type { Config, ReviewResult } from '../utils/types.js';
import { logger } from '../utils/logger.js';
import { zodToJsonSchema } from './utils/zod-to-json.js';

const MAX_TURNS = 20;

export async function runCodeReview(config: Config): Promise<ReviewResult> {
  logger.info('Starting code review agent...');

  // Clear any leftover comments from previous runs
  clearQueuedComments();

  const provider = createProvider(config);
  const systemPrompt = buildReviewPrompt({
    customPrompt: config.customPrompt,
  });

  // Convert our tools to provider format
  const toolDefs: ToolDefinition[] = Object.values(tools).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema),
  }));

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: REVIEW_START_MESSAGE },
  ];

  let reviewId = '';
  let summary = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turn = 0;

  // Agent loop
  while (turn < MAX_TURNS) {
    turn++;
    logger.info(`Turn ${turn}/${MAX_TURNS}`);

    try {
      const response = await provider.chat(messages, {
        tools: toolDefs,
        maxTokens: 4096,
      });

      // Track usage
      if (response.usage) {
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;
      }

      // Add assistant response to history
      messages.push({ role: 'assistant', content: response.content });

      // If no tool calls, we're done
      if (!response.toolCalls || response.toolCalls.length === 0) {
        logger.info('No more tool calls, finishing review');
        summary = response.content;
        break;
      }

      // Execute tool calls
      for (const toolCall of response.toolCalls) {
        logger.info(`Executing tool: ${toolCall.name}`);
        logger.debug(`Arguments: ${JSON.stringify(toolCall.arguments)}`);

        try {
          const result = await executeTool(toolCall.name, toolCall.arguments, config.githubToken);
          const resultText = result.content.map((c) => c.text).join('\n');

          // Add tool result to messages
          messages.push({
            role: 'user',
            content: `Tool ${toolCall.name} result:\n${resultText}`,
          });

          // Check if review was submitted
          if (toolCall.name === 'submit_review' && resultText.includes('Review submitted')) {
            const idMatch = resultText.match(/Review ID: (\d+)/);
            if (idMatch) {
              reviewId = idMatch[1];
            }
            summary = ((toolCall.arguments as unknown) as { summary?: string }).summary || '';
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Tool execution failed: ${errorMessage}`);

          messages.push({
            role: 'user',
            content: `Tool ${toolCall.name} failed: ${errorMessage}`,
          });
        }
      }
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  if (turn >= MAX_TURNS) {
    logger.warning(`Reached max turns (${MAX_TURNS}), forcing review submission`);
  }

  // Calculate cost (approximate)
  const cost = calculateCost(totalInputTokens, totalOutputTokens, config.provider);

  return {
    reviewId,
    commentCount: getQueuedCommentCount() || 0,
    summary,
    cost,
  };
}

function calculateCost(inputTokens: number, outputTokens: number, provider: string): number {
  // Approximate costs per 1M tokens
  const costs: Record<string, { input: number; output: number }> = {
    claude: { input: 3, output: 15 },
    anthropic: { input: 3, output: 15 },
    'openrouter:anthropic/claude-sonnet-4': { input: 3, output: 15 },
    'openrouter:anthropic/claude-opus-4': { input: 15, output: 75 },
  };

  const rate = costs[provider] || costs['claude'];
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

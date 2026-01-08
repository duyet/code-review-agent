import { z } from 'zod';
import {
  getOctokit,
  getPRDiff,
  getChangedFiles,
  getFileContent,
  createReview,
  addPRComment,
  getPRInfo,
} from '../../github/api.js';
import type { ReviewComment, ToolResult } from '../../utils/types.js';

// Shared state for batching review comments
const reviewComments: ReviewComment[] = [];

// Tool definitions for MCP server
export const tools = {
  get_pr_info: {
    name: 'get_pr_info',
    description: 'Get metadata about the current pull request (title, author, branches, stats)',
    schema: z.object({}),
    execute: async (_args: Record<string, never>, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const info = await getPRInfo(octokit);
      return {
        content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
      };
    },
  },

  get_pr_diff: {
    name: 'get_pr_diff',
    description: 'Get the full unified diff of the current pull request',
    schema: z.object({}),
    execute: async (_args: Record<string, never>, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const diff = await getPRDiff(octokit);
      return {
        content: [{ type: 'text', text: diff }],
      };
    },
  },

  get_changed_files: {
    name: 'get_changed_files',
    description: 'List all files changed in this PR with their status and line counts',
    schema: z.object({}),
    execute: async (_args: Record<string, never>, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const files = await getChangedFiles(octokit);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              files.map((f) => ({
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
              })),
              null,
              2
            ),
          },
        ],
      };
    },
  },

  get_file_content: {
    name: 'get_file_content',
    description: 'Get the full content of a specific file at the PR head commit',
    schema: z.object({
      path: z.string().describe('The file path to read'),
    }),
    execute: async (args: { path: string }, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const content = await getFileContent(octokit, args.path);
      return {
        content: [{ type: 'text', text: content }],
      };
    },
  },

  get_file_patch: {
    name: 'get_file_patch',
    description: 'Get the patch/diff for a specific changed file',
    schema: z.object({
      path: z.string().describe('The file path to get the patch for'),
    }),
    execute: async (args: { path: string }, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const files = await getChangedFiles(octokit);
      const file = files.find((f) => f.filename === args.path);
      if (!file) {
        return {
          content: [{ type: 'text', text: `File not found in PR: ${args.path}` }],
        };
      }
      return {
        content: [{ type: 'text', text: file.patch || 'No patch available' }],
      };
    },
  },

  add_review_comment: {
    name: 'add_review_comment',
    description:
      'Queue an inline comment for a specific line in a file. Comments are batched and submitted together.',
    schema: z.object({
      path: z.string().describe('File path in the repository'),
      line: z.number().describe('Line number in the new file version'),
      body: z.string().describe('Comment text (supports markdown)'),
      side: z
        .enum(['LEFT', 'RIGHT'])
        .default('RIGHT')
        .describe('Side of diff (LEFT for deletions, RIGHT for additions)'),
    }),
    execute: async (args: {
      path: string;
      line: number;
      body: string;
      side: 'LEFT' | 'RIGHT';
    }): Promise<ToolResult> => {
      reviewComments.push({
        path: args.path,
        line: args.line,
        body: args.body,
        side: args.side,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Queued comment for ${args.path}:${args.line} (${reviewComments.length} total queued)`,
          },
        ],
      };
    },
  },

  submit_review: {
    name: 'submit_review',
    description: 'Submit all queued comments as a PR review with a summary',
    schema: z.object({
      summary: z.string().describe('Overall review summary in markdown'),
      verdict: z
        .enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT'])
        .default('COMMENT')
        .describe('Review verdict'),
    }),
    execute: async (
      args: { summary: string; verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' },
      token: string
    ): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const commentCount = reviewComments.length;

      const reviewId = await createReview(
        octokit,
        args.summary,
        args.verdict,
        reviewComments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
          side: c.side,
        }))
      );

      // Clear the queue after submission
      reviewComments.length = 0;

      return {
        content: [
          {
            type: 'text',
            text: `Review submitted successfully!\n- Review ID: ${reviewId}\n- Comments: ${commentCount}\n- Verdict: ${args.verdict}`,
          },
        ],
      };
    },
  },

  add_pr_comment: {
    name: 'add_pr_comment',
    description: 'Add a general comment to the PR (not attached to specific code)',
    schema: z.object({
      body: z.string().describe('Comment text in markdown'),
    }),
    execute: async (args: { body: string }, token: string): Promise<ToolResult> => {
      const octokit = getOctokit(token);
      const commentId = await addPRComment(octokit, args.body);
      return {
        content: [{ type: 'text', text: `Comment added with ID: ${commentId}` }],
      };
    },
  },
};

// Get list of tool names
export const toolNames = Object.keys(tools) as Array<keyof typeof tools>;

// Execute a tool by name
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  token: string
): Promise<ToolResult> {
  const tool = tools[toolName as keyof typeof tools];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Validate args against schema
  const validatedArgs = tool.schema.parse(args);
  return tool.execute(validatedArgs as never, token);
}

// Get queued comment count
export function getQueuedCommentCount(): number {
  return reviewComments.length;
}

// Clear queued comments (for error recovery)
export function clearQueuedComments(): void {
  reviewComments.length = 0;
}

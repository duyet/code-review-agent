import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as github from '@actions/github';

// Initialize GitHub client
const octokit = github.getOctokit(process.env.GITHUB_TOKEN!);
const context = github.context;

// Store comments for batch submission
let reviewComments: Array<{ path: string; line: number; body: string; side: string }> = [];

// Security scanning patterns
const SECURITY_PATTERNS = [
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'API_KEY', severity: 'HIGH' },
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'HARDCODED_PASSWORD', severity: 'CRITICAL' },
  { pattern: /AWS[A-Z0-9]{16,}/g, type: 'AWS_KEY', severity: 'CRITICAL' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'GITHUB_TOKEN', severity: 'CRITICAL' },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, type: 'OPENAI_KEY', severity: 'CRITICAL' },
  { pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----/g, type: 'PRIVATE_KEY', severity: 'CRITICAL' },
  { pattern: /\$\{[^}]+\}[^;]*(?:SELECT|INSERT|UPDATE|DELETE)/gi, type: 'SQL_INJECTION', severity: 'HIGH' },
  { pattern: /\.innerHTML\s*=/gi, type: 'XSS_RISK', severity: 'MEDIUM' },
  { pattern: /eval\s*\(/gi, type: 'CODE_INJECTION', severity: 'CRITICAL' },
  { pattern: /exec\s*\(\s*[`'"]\s*\$\{/gi, type: 'COMMAND_INJECTION', severity: 'CRITICAL' },
] as const;

export const githubMcpServer = createSdkMcpServer({
  name: 'github-pr',
  version: '1.0.0',
  tools: [
    tool(
      'get_pr_info',
      'Get pull request metadata (title, description, author, branches)',
      {},
      async () => {
        const { data } = await octokit.rest.pulls.get({
          ...context.repo,
          pull_number: context.issue.number,
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              title: data.title,
              body: data.body,
              author: data.user?.login,
              baseBranch: data.base.ref,
              headBranch: data.head.ref,
              additions: data.additions,
              deletions: data.deletions,
              changedFiles: data.changed_files,
            }, null, 2),
          }],
        };
      }
    ),

    tool(
      'get_pr_diff',
      'Get the full unified diff of the pull request',
      {},
      async () => {
        const { data } = await octokit.rest.pulls.get({
          ...context.repo,
          pull_number: context.issue.number,
          mediaType: { format: 'diff' },
        });
        return { content: [{ type: 'text', text: data as unknown as string }] };
      }
    ),

    tool(
      'get_changed_files',
      'List all files changed in the PR with additions/deletions stats',
      {},
      async () => {
        const { data } = await octokit.rest.pulls.listFiles({
          ...context.repo,
          pull_number: context.issue.number,
          per_page: 100,
        });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data.map(f => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })), null, 2),
          }],
        };
      }
    ),

    tool(
      'get_file_content',
      'Read the full content of a file at the PR head commit',
      { path: z.string().describe('File path in the repository') },
      async (args) => {
        const { data } = await octokit.rest.repos.getContent({
          ...context.repo,
          path: args.path,
          ref: context.payload.pull_request?.head.sha,
        });
        if ('content' in data) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          return { content: [{ type: 'text', text: content }] };
        }
        return { content: [{ type: 'text', text: `Error: ${args.path} is not a file` }] };
      }
    ),

    tool(
      'add_review_comment',
      'Queue an inline comment for a specific file and line',
      {
        path: z.string().describe('File path'),
        line: z.number().describe('Line number'),
        body: z.string().describe('Comment text in markdown'),
        side: z.enum(['LEFT', 'RIGHT']).default('RIGHT').describe('Side of diff'),
      },
      async (args) => {
        reviewComments.push(args);
        return { content: [{ type: 'text', text: `Queued comment for ${args.path}:${args.line}` }] };
      }
    ),

    tool(
      'submit_review',
      'Submit all queued comments as a pull request review',
      {
        summary: z.string().describe('Overall review summary'),
        verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).default('COMMENT').describe('Review verdict'),
      },
      async (args) => {
        const { data } = await octokit.rest.pulls.createReview({
          ...context.repo,
          pull_number: context.issue.number,
          body: args.summary,
          event: args.verdict,
          comments: reviewComments.map(c => ({
            path: c.path,
            line: c.line,
            body: c.body,
            side: c.side as 'LEFT' | 'RIGHT',
          })),
        });
        const count = reviewComments.length;
        reviewComments = [];
        return { content: [{ type: 'text', text: `Review submitted (ID: ${data.id}) with ${count} inline comments` }] };
      }
    ),

    tool(
      'security_scan',
      'Scan code content for security vulnerabilities',
      {
        path: z.string().describe('File path being scanned'),
        content: z.string().describe('File content to analyze'),
      },
      async (args) => {
        const issues: Array<{ type: string; severity: string; line: number; description: string }> = [];

        for (const { pattern, type, severity } of SECURITY_PATTERNS) {
          const matches = args.content.matchAll(pattern);
          for (const match of matches) {
            const line = args.content.substring(0, match.index || 0).split('\n').length;
            issues.push({
              type,
              severity,
              line,
              description: `Potential ${type.toLowerCase().replace(/_/g, ' ')} detected`,
            });
          }
        }

        const summary = issues.length === 0
          ? `No security issues found in ${args.path}`
          : `Found ${issues.length} security issue(s) in ${args.path}:\n${issues.map(i =>
              `- [${i.severity}] ${i.type} at line ${i.line}: ${i.description}`
            ).join('\n')}`;

        return { content: [{ type: 'text', text: summary }] };
      }
    ),

    tool(
      'add_pr_comment',
      'Add a general comment to the pull request',
      { body: z.string().describe('Comment text in markdown') },
      async (args) => {
        const { data } = await octokit.rest.issues.createComment({
          ...context.repo,
          issue_number: context.issue.number,
          body: args.body,
        });
        return { content: [{ type: 'text', text: `Comment added (ID: ${data.id})` }] };
      }
    ),
  ],
});

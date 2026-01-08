import * as github from '@actions/github';

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface Config {
  provider: string;
  customPrompt?: string;
  githubUsername: string;
  reviewOnOpen: boolean;
  reviewOnUpdate: boolean;
  maxBudgetUsd: number;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  githubToken: string;
}

export interface ReviewResult {
  reviewId: string;
  commentCount: number;
  summary: string;
  cost?: number;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  side: 'LEFT' | 'RIGHT';
}

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface SecurityIssue {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  line?: number;
  description: string;
}

export interface QueryOptions {
  tools: string[];
  mcpServers?: Record<string, unknown>;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
}

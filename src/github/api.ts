import * as github from '@actions/github';
import type { Octokit, ChangedFile } from '../utils/types.js';

let octokitInstance: Octokit | null = null;

export function getOctokit(token: string): Octokit {
  if (!octokitInstance) {
    octokitInstance = github.getOctokit(token);
  }
  return octokitInstance;
}

export function getContext() {
  return github.context;
}

export async function getPRDiff(octokit: Octokit): Promise<string> {
  const context = github.context;
  const { data } = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number,
    mediaType: { format: 'diff' },
  });
  return data as unknown as string;
}

export async function getChangedFiles(octokit: Octokit): Promise<ChangedFile[]> {
  const context = github.context;
  const { data } = await octokit.rest.pulls.listFiles({
    ...context.repo,
    pull_number: context.issue.number,
    per_page: 100,
  });

  return data.map((f: { filename: string; status: string; additions: number; deletions: number; patch?: string }) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));
}

export async function getFileContent(octokit: Octokit, path: string): Promise<string> {
  const context = github.context;
  const { data } = await octokit.rest.repos.getContent({
    ...context.repo,
    path,
    ref: context.payload.pull_request?.head.sha,
  });

  if ('content' in data) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  throw new Error(`Cannot read content of ${path}: not a file`);
}

export async function createReview(
  octokit: Octokit,
  body: string,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  comments: Array<{ path: string; line: number; body: string; side?: 'LEFT' | 'RIGHT' }>
): Promise<number> {
  const context = github.context;
  const { data } = await octokit.rest.pulls.createReview({
    ...context.repo,
    pull_number: context.issue.number,
    body,
    event,
    comments: comments.map((c) => ({
      path: c.path,
      line: c.line,
      body: c.body,
      side: c.side || 'RIGHT',
    })),
  });
  return data.id;
}

export async function addPRComment(octokit: Octokit, body: string): Promise<number> {
  const context = github.context;
  const { data } = await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number: context.issue.number,
    body,
  });
  return data.id;
}

export async function getPRInfo(octokit: Octokit) {
  const context = github.context;
  const { data } = await octokit.rest.pulls.get({
    ...context.repo,
    pull_number: context.issue.number,
  });
  return {
    title: data.title,
    body: data.body,
    author: data.user?.login,
    baseBranch: data.base.ref,
    headBranch: data.head.ref,
    additions: data.additions,
    deletions: data.deletions,
    changedFiles: data.changed_files,
  };
}

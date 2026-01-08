# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered code review GitHub Action built with Bun, TypeScript, and the Claude Agent SDK V1. The action reviews pull requests using Claude or OpenRouter models, providing inline comments and security scanning via a custom MCP server.

## Development Commands

| Command | Purpose |
|---------|---------|
| `bun run build` | Bundle source with `ncc` into `dist/index.js` |
| `bun run dev` | Run the action locally (for testing) |
| `bun run lint` | Check code with Biome linter |
| `bun run lint:fix` | Auto-fix lint issues with Biome |
| `bun run format` | Format code with Biome |
| `bun run typecheck` | Run TypeScript type checking |

## Architecture

### Entry Point (`src/index.ts`)

Main GitHub Action entry point using `@actions/core` and `@actions/github`:

1. **Provider Configuration**: Routes to Anthropic or OpenRouter based on `provider` input
   - OpenRouter: Sets `ANTHROPIC_BASE_URL` to `https://openrouter.ai/api` and `ANTHROPIC_AUTH_TOKEN`
   - Anthropic: Uses `ANTHROPIC_API_KEY` directly

2. **Event Filtering**: `shouldRun()` determines if review should execute based on:
   - PR opened/synchronized/reopened events (configurable via inputs)
   - Comment mentions containing the bot username

3. **Agent Execution**: Uses Claude Agent SDK `query()` with:
   - `maxTurns: 50` - Maximum agent iterations
   - `allowedTools: ["Read", "WebSearch", "WebFetch"]` - Built-in SDK tools
   - `mcpServers: { github: githubMcpServer }` - Custom GitHub PR tools
   - `permissionMode: "bypassPermissions"` - Bypass since running in Action context

### MCP Server (`src/tools/github-tools.ts`)

Custom MCP server providing GitHub PR tools to the agent. Uses `createSdkMcpServer()` and `tool()` from the Agent SDK:

| Tool | Purpose |
|------|---------|
| `get_pr_info` | Fetch PR metadata (title, author, branch, stats) |
| `get_pr_diff` | Get unified diff of all changes |
| `get_changed_files` | List files with per-file patch and stats |
| `get_file_content` | Read full file content at PR head |
| `add_review_comment` | Queue inline comment (batched, not immediate) |
| `submit_review` | Submit all queued comments with verdict |
| `security_scan` | Scan content for security patterns (secrets, injection, XSS) |
| `add_pr_comment` | Add general PR comment (for progress tracking) |
| `check_ci_status` | Check if CI/status checks passed |
| `merge_pr` | Merge PR (for auto-merge feature) |

**Key Implementation Details**:
- Review comments are queued in memory (`reviewComments` array) and batch-submitted via `submit_review`
- Security scanning uses regex patterns for common vulnerabilities (API keys, SQL injection, XSS, etc.)
- All tools use `github.context.repo()` for owner/repo context

### Configuration (`src/utils/config.ts`)

Loads and validates action inputs from `@actions/core`:

- Validates provider-specific API keys (`ANTHROPIC_API_KEY` vs `OPENROUTER_API_KEY`)
- Parses boolean inputs (empty string or `"false"` → `false`)
- Converts `max_budget_usd` to float for cost tracking

### Build Process

Uses `@vercel/ncc` to bundle all dependencies (including `@actions/core`, `@actions/github`, and the Agent SDK) into a single `dist/index.js` file for Node 20 runtime.

## Provider Selection

The `provider` input accepts:
- `"claude"` or `"anthropic"` → Uses Anthropic API directly
- `"openrouter:<model>"` → Routes through OpenRouter (e.g., `"openrouter:anthropic/claude-sonnet-4"`, `"openrouter:auto"`)

## Auto-Merge Feature

When `auto_merge: true`, the agent is instructed to:
1. Check CI status with `check_ci_status` tool
2. If CI passes and verdict is `APPROVE` with no CRITICAL/HIGH issues, call `merge_pr`
3. Otherwise, skip merge

This is implemented via prompt injection in `buildPrompt()` rather than hardcoded logic.

## Important Constraints

- **No CommonJS exports**: This package uses ES modules (`"type": "module"` in package.json). The build output uses `.cjs` extension for Node 20 compatibility.
- **Bundling**: All dependencies must be bundled by `ncc` for GitHub Actions distribution
- **Environment Variables**: Provider-specific keys are set at runtime based on `provider` input
- **SDK API Mode**: The Agent SDK runs in API mode (not CLI mode), using `query()` function directly

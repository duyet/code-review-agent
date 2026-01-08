# Code Review Agent

AI-powered code review GitHub Action using Claude.

## Quick Start

```yaml
- uses: duyet/code-review-agent@v1
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `provider` | LLM provider (`claude`, `anthropic`, `openrouter:<model>`) | No | `claude` |
| `prompt` | Custom review instructions | No | - |
| `github_username` | Bot username for comments | No | `@duyetbot` |
| `review_on_open` | Auto-review when PR opened | No | `true` |
| `review_on_update` | Re-review when PR updated | No | `true` |
| `max_budget_usd` | Maximum budget in USD | No | `5.00` |

## Outputs

| Output | Description |
|--------|-------------|
| `review_id` | ID of the created review |
| `comment_count` | Number of inline comments |
| `summary` | Review summary text |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key (for `claude`/`anthropic` provider) | Yes* |
| `OPENROUTER_API_KEY` | OpenRouter API key (for `openrouter:*` provider) | Yes* |
| `GITHUB_TOKEN` | GitHub token for API access | Yes |

*Required based on selected provider.

## Features

- Multi-provider support (Claude or any model via OpenRouter)
- Inline comments on specific lines of code
- Security scanning (secrets, SQL injection, XSS, command injection)
- Mention triggers (`@duyetbot review`)
- Custom prompts for focused reviews

## Quick Install

Create a workflow file in `.github/workflows/code-review.yml`:

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    uses: duyet/code-review-agent/.github/workflows/callable-code-review.yml@main
    with:
      provider: openrouter/auto  # Auto-routes to best model
    secrets:
      api-key: ${{ secrets.OPENROUTER_API_KEY }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

**Required secrets:**
- `OPENROUTER_API_KEY` - Get from [openrouter.ai](https://openrouter.ai)

**Optional:** Add `GITHUB_TOKEN` is automatically provided by GitHub Actions.

---

## Reusable Workflows

You can also use our **reusable workflows** for simpler setup:

<details>
<summary><strong>Using OpenRouter with Auto-Routing</strong></summary>

Uses `openrouter/auto` to automatically route to the best available model at no extra cost:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    uses: duyet/code-review-agent/.github/workflows/callable-code-review.yml@main
    with:
      provider: openrouter/auto
    secrets:
      api-key: ${{ secrets.OPENROUTER_API_KEY }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Using OpenRouter with Presets</strong></summary>

Use a specific preset model for code review:

```yaml
jobs:
  review:
    uses: duyet/code-review-agent/.github/workflows/callable-code-review.yml@main
    with:
      provider: openrouter:@preset/claude-code-github-action
      prompt: "Focus on security and performance"
    secrets:
      api-key: ${{ secrets.OPENROUTER_API_KEY }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Using Anthropic Claude directly</strong></summary>

```yaml
jobs:
  review:
    uses: duyet/code-review-agent/.github/workflows/callable-code-review.yml@main
    with:
      provider: claude-sonnet-4-5-20250929
      prompt: "Review for best practices"
    secrets:
      api-key: ${{ secrets.ANTHROPIC_API_KEY }}
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Bun CI Workflow</strong></summary>

Reusable CI pipeline for Bun projects:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    uses: duyet/code-review-agent/.github/workflows/callable-bun-ci.yml@main
    with:
      bun-version: "1.1.0"
      run-typecheck: true
      run-lint: true
```

</details>

<details>
<summary><strong>Bun Release Workflow</strong></summary>

Automated release workflow for Bun projects:

```yaml
on:
  push:
    tags: ['v*']

jobs:
  release:
    uses: duyet/code-review-agent/.github/workflows/callable-bun-release.yml@main
    secrets:
      github-token: ${{ secrets.GITHUB_TOKEN }}
```

</details>

## Examples

<details>
<summary><strong>Basic Usage with Claude</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Using OpenRouter with Claude Sonnet</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: openrouter:anthropic/claude-sonnet-4
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Using OpenRouter with Claude Opus</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: openrouter:anthropic/claude-opus-4
          max_budget_usd: '10.00'
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Using OpenRouter with GPT-4</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: openrouter:openai/gpt-4-turbo
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Security-Focused Review</strong></summary>

```yaml
name: Security Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  security-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
          prompt: |
            Focus on security vulnerabilities:
            - SQL injection
            - XSS attacks
            - Command injection
            - Hardcoded secrets
            - Authentication issues
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Performance-Focused Review</strong></summary>

```yaml
name: Performance Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  perf-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
          prompt: |
            Focus on performance issues:
            - N+1 queries
            - Inefficient loops
            - Memory leaks
            - Missing caching
            - Bundle size impact
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Custom Bot Username</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
          github_username: "@myreviewer"
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Review Only on Open (Not Updates)</strong></summary>

```yaml
name: Code Review
on:
  pull_request:
    types: [opened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
          review_on_update: 'false'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Manual Trigger via Mention Only</strong></summary>

```yaml
name: Code Review on Mention
on:
  issue_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
          review_on_open: 'false'
          review_on_update: 'false'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

<details>
<summary><strong>Combined: Auto Review + Mention Trigger (Recommended)</strong></summary>

This workflow handles all scenarios in one file:
- Auto-review when PR is opened/updated
- Re-review when someone mentions `@duyetbot`

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    # Only run if:
    # - PR event (opened/sync/reopened)
    # - OR comment on a PR that mentions the bot
    if: |
      github.event_name == 'pull_request' ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request && contains(github.event.comment.body, '@duyetbot')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@duyetbot'))
    steps:
      - uses: duyet/code-review-agent@v1
        with:
          provider: claude
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

</details>

## Mention Commands

Trigger reviews by mentioning the bot in PR comments:

- `@duyetbot` - Run a code review
- `@duyetbot review` - Run a code review
- `@duyetbot review [instructions]` - Review with custom focus
- `@duyetbot help` - Show help message

### Examples

```
@duyetbot focus on security issues
@duyetbot review check for SQL injection
@duyetbot please review the authentication changes
```

## License

MIT

---

## Local Development

### Setup

```bash
# Install dependencies
bun install

# Set your API key (choose one)
export ANTHROPIC_API_KEY=your_key_here  # for Claude
export OPENROUTER_API_KEY=your_key_here # for OpenRouter
```

### Run Local Code Review

Test the code review agent on your local codebase:

```bash
# Review all changes from main branch
bun run review

# Review specific provider
PROVIDER=openrouter:@preset/claude-code-github-action bun run review
```

### Development Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Format code
bun run format

# Build for production
bun run build
```

### `.claude` Directory

The agent uses the `.claude/` directory for configuration:

```
.claude/
├── prompt.md          # System prompt for code reviewer
├── skills/            # Skill definitions
│   ├── security-review.md
│   ├── typescript-review.md
│   └── github-actions-review.md
└── CLAUDE.md          # Project-specific context
```

The Claude Agent SDK automatically loads:
- `prompt.md` → System prompt
- `skills/*.md` → Available skills
- `CLAUDE.md` → Project context

You can customize the review behavior by editing these files.

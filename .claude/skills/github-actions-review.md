# GitHub Actions Code Review Skill

Specializes in GitHub Actions workflow security and best practices.

## Security Checks

- Pin action versions (no `@main` or `@master`)
- Use `${{ }}` syntax for user input to prevent injection
- Minimum required permissions
- Proper secret handling (never log secrets)
- Third-party action verification

## Best Practices

- Composite actions for reusability
- Proper caching strategies
- Matrix builds for testing
- Artifact management
- Dependency caching (npm, yarn, bun)

## Performance

- Parallel job execution where possible
- Conditional job execution
- Proper use of `needs` for dependencies
- Timeout configuration

## Common Issues to Catch

- Unpinned action versions
- Overly permissive permissions
- Missing `continue-on-error` where appropriate
- Hardcoded credentials in workflows
- Missing environment variable validation
- Inefficient workflow triggers

## Output Format

For workflow issues:
1. Security risk or best practice violation
2. Specific file and line reference
3. Corrected YAML example
4. Security implications if applicable

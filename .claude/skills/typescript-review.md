# TypeScript Code Review Skill

Expert in TypeScript best practices, type safety, and patterns.

## Focus Areas

### Type Safety
- Avoid `any` types - use proper interfaces or `unknown`
- Use discriminated unions for type narrowing
- Leverage utility types (Pick, Omit, Partial, Required)
- Proper generic constraints

### Async Patterns
- Correct promise chaining and error handling
- Avoid callback hell with async/await
- Proper race condition handling
- Memory leak prevention (cleanup listeners, timeouts)

### Modern TypeScript
- Use `satisfies` operator for type checking
- Leverage `const` assertions for literal types
- Template literal types for string manipulation
- Conditional types for advanced type transformations

### Common Pitfalls to Catch
- Missing `await` in async functions
- Unhandled promise rejections
- Type assertion overuse (`as`)
- Missing null checks after optional chaining
- Incorrect use of `unknown` vs `never`

## Output Format

For TypeScript issues:
1. Specific type error or pattern violation
2. Why this matters (type safety, maintainability)
3. Proper TypeScript idioms to use instead
4. Before/after code examples

# Security Review Skill

Specializes in identifying security vulnerabilities in code changes.

## Capabilities

- Detects OWASP Top 10 vulnerabilities
- Identifies authentication and authorization flaws
- Finds injection vulnerabilities (SQL, XSS, Command, LDAP)
- Spot hardcoded secrets and credentials
- Analyzes cryptographic implementations
- Reviews input validation and sanitization

## Usage

When reviewing code, automatically scans for:
- Hardcoded API keys, passwords, tokens
- SQL injection patterns
- XSS vulnerabilities
- Command injection risks
- Insecure direct object references
- Missing authentication checks
- Weak cryptography usage

## Output Format

For each security issue found:
1. Severity level (CRITICAL for exploitability)
2. CWE reference if applicable
3. Exploitation scenario
4. Concrete remediation steps
5. Code example of secure implementation

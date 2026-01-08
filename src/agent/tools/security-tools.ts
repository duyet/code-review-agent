import { z } from 'zod';
import type { ToolResult, SecurityIssue } from '../../utils/types.js';

// Security scanning patterns
const SECRET_PATTERNS = [
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: 'API_KEY', severity: 'HIGH' as const },
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'HARDCODED_PASSWORD', severity: 'CRITICAL' as const },
  { pattern: /AWS[A-Z0-9]{16,}/g, type: 'AWS_KEY', severity: 'CRITICAL' as const },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: 'GITHUB_TOKEN', severity: 'CRITICAL' as const },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, type: 'GITHUB_OAUTH', severity: 'CRITICAL' as const },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, type: 'OPENAI_KEY', severity: 'CRITICAL' as const },
  { pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----/g, type: 'PRIVATE_KEY', severity: 'CRITICAL' as const },
  { pattern: /Bearer\s+[a-zA-Z0-9._-]{20,}/gi, type: 'BEARER_TOKEN', severity: 'HIGH' as const },
];

const SQL_INJECTION_PATTERNS = [
  { pattern: /\$\{[^}]+\}[^;]*(?:SELECT|INSERT|UPDATE|DELETE|DROP|TRUNCATE)/gi, type: 'SQL_INJECTION' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE)\s+.*\+\s*(?:req\.|params\.|query\.)/gi, type: 'SQL_INJECTION' },
  { pattern: /(?:query|execute|raw)\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE)/gi, type: 'SQL_INJECTION' },
];

const XSS_PATTERNS = [
  { pattern: /\.innerHTML\s*=/gi, type: 'XSS_INNERHTML' },
  { pattern: /document\.write\s*\(/gi, type: 'XSS_DOCUMENT_WRITE' },
  { pattern: /eval\s*\(/gi, type: 'CODE_INJECTION' },
  { pattern: /new\s+Function\s*\(/gi, type: 'CODE_INJECTION' },
];

const COMMAND_INJECTION_PATTERNS = [
  { pattern: /exec\s*\(\s*[`'"]\s*\$\{/gi, type: 'COMMAND_INJECTION' },
  { pattern: /spawn\s*\(\s*[^,]+,\s*\[.*\$\{/gi, type: 'COMMAND_INJECTION' },
  { pattern: /child_process.*exec.*\+/gi, type: 'COMMAND_INJECTION' },
];

export const securityTools = {
  security_scan: {
    name: 'security_scan',
    description: 'Scan code for security vulnerabilities (secrets, SQL injection, XSS, command injection)',
    schema: z.object({
      path: z.string().describe('File path being scanned'),
      content: z.string().describe('File content to analyze'),
    }),
    execute: async (args: { path: string; content: string }): Promise<ToolResult> => {
      const issues: SecurityIssue[] = [];

      // Scan for secrets
      for (const { pattern, type, severity } of SECRET_PATTERNS) {
        const matches = args.content.matchAll(pattern);
        for (const match of matches) {
          const lineNumber = findLineNumber(args.content, match.index || 0);
          issues.push({
            type,
            severity,
            line: lineNumber,
            description: `Potential ${type.toLowerCase().replace(/_/g, ' ')} detected`,
          });
        }
      }

      // Scan for SQL injection
      for (const { pattern, type } of SQL_INJECTION_PATTERNS) {
        const matches = args.content.matchAll(pattern);
        for (const match of matches) {
          const lineNumber = findLineNumber(args.content, match.index || 0);
          issues.push({
            type,
            severity: 'HIGH',
            line: lineNumber,
            description: 'Potential SQL injection vulnerability - use parameterized queries',
          });
        }
      }

      // Scan for XSS
      for (const { pattern, type } of XSS_PATTERNS) {
        const matches = args.content.matchAll(pattern);
        for (const match of matches) {
          const lineNumber = findLineNumber(args.content, match.index || 0);
          issues.push({
            type,
            severity: type === 'CODE_INJECTION' ? 'CRITICAL' : 'MEDIUM',
            line: lineNumber,
            description: `Potential ${type.toLowerCase().replace(/_/g, ' ')} - sanitize user input`,
          });
        }
      }

      // Scan for command injection
      for (const { pattern, type } of COMMAND_INJECTION_PATTERNS) {
        const matches = args.content.matchAll(pattern);
        for (const match of matches) {
          const lineNumber = findLineNumber(args.content, match.index || 0);
          issues.push({
            type,
            severity: 'CRITICAL',
            line: lineNumber,
            description: 'Potential command injection - validate and sanitize inputs',
          });
        }
      }

      // Check for insecure practices
      if (/disable.*ssl|verify.*false|rejectUnauthorized.*false/gi.test(args.content)) {
        issues.push({
          type: 'INSECURE_SSL',
          severity: 'HIGH',
          description: 'SSL/TLS verification disabled - this allows man-in-the-middle attacks',
        });
      }

      if (/cors.*\*|Access-Control-Allow-Origin.*\*/gi.test(args.content)) {
        issues.push({
          type: 'PERMISSIVE_CORS',
          severity: 'MEDIUM',
          description: 'Permissive CORS policy - consider restricting allowed origins',
        });
      }

      const summary = issues.length === 0
        ? `No security issues found in ${args.path}`
        : `Found ${issues.length} security issue(s) in ${args.path}:\n${formatIssues(issues)}`;

      return {
        content: [{ type: 'text', text: summary }],
      };
    },
  },

  check_dependencies: {
    name: 'check_dependencies',
    description: 'Check package.json for known vulnerable dependencies',
    schema: z.object({
      content: z.string().describe('package.json content'),
    }),
    execute: async (args: { content: string }): Promise<ToolResult> => {
      const issues: string[] = [];

      try {
        const pkg = JSON.parse(args.content);
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Check for known problematic packages
        const riskyPackages: Record<string, string> = {
          'event-stream': 'Known malware injection (CVE-2018-16490)',
          'flatmap-stream': 'Known malware package',
          'node-ipc': 'Known protestware (CVE-2022-23812)',
          'colors': 'Known sabotage in v1.4.44-liberty-2',
          'faker': 'Known sabotage in v6.6.6',
        };

        for (const [name, reason] of Object.entries(riskyPackages)) {
          if (allDeps[name]) {
            issues.push(`⚠️ ${name}: ${reason}`);
          }
        }

        // Check for wildcard versions
        for (const [name, version] of Object.entries(allDeps)) {
          if (version === '*' || version === 'latest') {
            issues.push(`⚠️ ${name}: Uses unpinned version (${version}) - pin to specific version`);
          }
        }
      } catch {
        issues.push('Failed to parse package.json');
      }

      const summary = issues.length === 0
        ? 'No known vulnerable dependencies found'
        : `Found ${issues.length} dependency concern(s):\n${issues.join('\n')}`;

      return {
        content: [{ type: 'text', text: summary }],
      };
    },
  },
};

function findLineNumber(content: string, index: number): number {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

function formatIssues(issues: SecurityIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.line ? ` (line ${issue.line})` : '';
      const icon = issue.severity === 'CRITICAL' ? '🚨' : issue.severity === 'HIGH' ? '⚠️' : '⚡';
      return `${icon} [${issue.severity}] ${issue.type}${location}: ${issue.description}`;
    })
    .join('\n');
}

export const securityToolNames = Object.keys(securityTools) as Array<keyof typeof securityTools>;

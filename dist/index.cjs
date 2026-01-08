var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};

// src/index.ts
var import_claude_agent_sdk2 = require("@anthropic-ai/claude-agent-sdk");
var core2 = __toESM(require("@actions/core"));
var github2 = __toESM(require("@actions/github"));

// src/tools/github-tools.ts
var import_claude_agent_sdk = require("@anthropic-ai/claude-agent-sdk");
var import_zod = require("zod");
var github = __toESM(require("@actions/github"));
var octokit = github.getOctokit(process.env.GITHUB_TOKEN);
var context2 = github.context;
var reviewComments = [];
var SECURITY_PATTERNS = [
  { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{10,}['"]/gi, type: "API_KEY", severity: "HIGH" },
  { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: "HARDCODED_PASSWORD", severity: "CRITICAL" },
  { pattern: /AWS[A-Z0-9]{16,}/g, type: "AWS_KEY", severity: "CRITICAL" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, type: "GITHUB_TOKEN", severity: "CRITICAL" },
  { pattern: /sk-[a-zA-Z0-9]{32,}/g, type: "OPENAI_KEY", severity: "CRITICAL" },
  { pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----/g, type: "PRIVATE_KEY", severity: "CRITICAL" },
  { pattern: /\$\{[^}]+\}[^;]*(?:SELECT|INSERT|UPDATE|DELETE)/gi, type: "SQL_INJECTION", severity: "HIGH" },
  { pattern: /\.innerHTML\s*=/gi, type: "XSS_RISK", severity: "MEDIUM" },
  { pattern: /eval\s*\(/gi, type: "CODE_INJECTION", severity: "CRITICAL" },
  { pattern: /exec\s*\(\s*[`'"]\s*\$\{/gi, type: "COMMAND_INJECTION", severity: "CRITICAL" }
];
var githubMcpServer = import_claude_agent_sdk.createSdkMcpServer({
  name: "github-pr",
  version: "1.0.0",
  tools: [
    import_claude_agent_sdk.tool("get_pr_info", "Get pull request metadata (title, description, author, branches)", {}, async () => {
      const { data } = await octokit.rest.pulls.get({
        ...context2.repo,
        pull_number: context2.issue.number
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            title: data.title,
            body: data.body,
            author: data.user?.login,
            baseBranch: data.base.ref,
            headBranch: data.head.ref,
            additions: data.additions,
            deletions: data.deletions,
            changedFiles: data.changed_files
          }, null, 2)
        }]
      };
    }),
    import_claude_agent_sdk.tool("get_pr_diff", "Get the full unified diff of the pull request", {}, async () => {
      const { data } = await octokit.rest.pulls.get({
        ...context2.repo,
        pull_number: context2.issue.number,
        mediaType: { format: "diff" }
      });
      return { content: [{ type: "text", text: data }] };
    }),
    import_claude_agent_sdk.tool("get_changed_files", "List all files changed in the PR with additions/deletions stats", {}, async () => {
      const { data } = await octokit.rest.pulls.listFiles({
        ...context2.repo,
        pull_number: context2.issue.number,
        per_page: 100
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(data.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch
          })), null, 2)
        }]
      };
    }),
    import_claude_agent_sdk.tool("get_file_content", "Read the full content of a file at the PR head commit", { path: import_zod.z.string().describe("File path in the repository") }, async (args) => {
      const { data } = await octokit.rest.repos.getContent({
        ...context2.repo,
        path: args.path,
        ref: context2.payload.pull_request?.head.sha
      });
      if ("content" in data) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return { content: [{ type: "text", text: content }] };
      }
      return { content: [{ type: "text", text: `Error: ${args.path} is not a file` }] };
    }),
    import_claude_agent_sdk.tool("add_review_comment", "Queue an inline comment for a specific file and line", {
      path: import_zod.z.string().describe("File path"),
      line: import_zod.z.number().describe("Line number"),
      body: import_zod.z.string().describe("Comment text in markdown"),
      side: import_zod.z.enum(["LEFT", "RIGHT"]).default("RIGHT").describe("Side of diff")
    }, async (args) => {
      reviewComments.push(args);
      return { content: [{ type: "text", text: `Queued comment for ${args.path}:${args.line}` }] };
    }),
    import_claude_agent_sdk.tool("submit_review", "Submit all queued comments as a pull request review", {
      summary: import_zod.z.string().describe("Overall review summary"),
      verdict: import_zod.z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).default("COMMENT").describe("Review verdict")
    }, async (args) => {
      const { data } = await octokit.rest.pulls.createReview({
        ...context2.repo,
        pull_number: context2.issue.number,
        body: args.summary,
        event: args.verdict,
        comments: reviewComments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
          side: c.side
        }))
      });
      const count = reviewComments.length;
      reviewComments = [];
      return { content: [{ type: "text", text: `Review submitted (ID: ${data.id}) with ${count} inline comments` }] };
    }),
    import_claude_agent_sdk.tool("security_scan", "Scan code content for security vulnerabilities", {
      path: import_zod.z.string().describe("File path being scanned"),
      content: import_zod.z.string().describe("File content to analyze")
    }, async (args) => {
      const issues = [];
      for (const { pattern, type, severity } of SECURITY_PATTERNS) {
        const matches = args.content.matchAll(pattern);
        for (const match of matches) {
          const line = args.content.substring(0, match.index || 0).split(`
`).length;
          issues.push({
            type,
            severity,
            line,
            description: `Potential ${type.toLowerCase().replace(/_/g, " ")} detected`
          });
        }
      }
      const summary = issues.length === 0 ? `No security issues found in ${args.path}` : `Found ${issues.length} security issue(s) in ${args.path}:
${issues.map((i) => `- [${i.severity}] ${i.type} at line ${i.line}: ${i.description}`).join(`
`)}`;
      return { content: [{ type: "text", text: summary }] };
    }),
    import_claude_agent_sdk.tool("add_pr_comment", "Add a general comment to the pull request", { body: import_zod.z.string().describe("Comment text in markdown") }, async (args) => {
      const { data } = await octokit.rest.issues.createComment({
        ...context2.repo,
        issue_number: context2.issue.number,
        body: args.body
      });
      return { content: [{ type: "text", text: `Comment added (ID: ${data.id})` }] };
    })
  ]
});

// src/utils/config.ts
var core = __toESM(require("@actions/core"));
function loadConfig() {
  const provider = core.getInput("provider") || "claude";
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }
  if (provider === "claude" || provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when using claude/anthropic provider");
    }
  } else if (provider.startsWith("openrouter:")) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is required when using openrouter provider");
    }
  }
  return {
    provider,
    customPrompt: core.getInput("prompt") || undefined,
    githubUsername: core.getInput("github_username") || "@duyetbot",
    reviewOnOpen: core.getInput("review_on_open") !== "false",
    reviewOnUpdate: core.getInput("review_on_update") !== "false",
    maxBudgetUsd: parseFloat(core.getInput("max_budget_usd") || "5.00"),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    githubToken
  };
}

// node:path
function assertPath(path) {
  if (typeof path !== "string")
    throw TypeError("Path must be a string. Received " + JSON.stringify(path));
}
function normalizeStringPosix(path, allowAboveRoot) {
  var res = "", lastSegmentLength = 0, lastSlash = -1, dots = 0, code;
  for (var i = 0;i <= path.length; ++i) {
    if (i < path.length)
      code = path.charCodeAt(i);
    else if (code === 47)
      break;
    else
      code = 47;
    if (code === 47) {
      if (lastSlash === i - 1 || dots === 1)
        ;
      else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== 46 || res.charCodeAt(res.length - 2) !== 46) {
          if (res.length > 2) {
            var lastSlashIndex = res.lastIndexOf("/");
            if (lastSlashIndex !== res.length - 1) {
              if (lastSlashIndex === -1)
                res = "", lastSegmentLength = 0;
              else
                res = res.slice(0, lastSlashIndex), lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
              lastSlash = i, dots = 0;
              continue;
            }
          } else if (res.length === 2 || res.length === 1) {
            res = "", lastSegmentLength = 0, lastSlash = i, dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0)
            res += "/..";
          else
            res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0)
          res += "/" + path.slice(lastSlash + 1, i);
        else
          res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i, dots = 0;
    } else if (code === 46 && dots !== -1)
      ++dots;
    else
      dots = -1;
  }
  return res;
}
function _format(sep, pathObject) {
  var dir = pathObject.dir || pathObject.root, base = pathObject.base || (pathObject.name || "") + (pathObject.ext || "");
  if (!dir)
    return base;
  if (dir === pathObject.root)
    return dir + base;
  return dir + sep + base;
}
function resolve() {
  var resolvedPath = "", resolvedAbsolute = false, cwd;
  for (var i = arguments.length - 1;i >= -1 && !resolvedAbsolute; i--) {
    var path;
    if (i >= 0)
      path = arguments[i];
    else {
      if (cwd === undefined)
        cwd = process.cwd();
      path = cwd;
    }
    if (assertPath(path), path.length === 0)
      continue;
    resolvedPath = path + "/" + resolvedPath, resolvedAbsolute = path.charCodeAt(0) === 47;
  }
  if (resolvedPath = normalizeStringPosix(resolvedPath, !resolvedAbsolute), resolvedAbsolute)
    if (resolvedPath.length > 0)
      return "/" + resolvedPath;
    else
      return "/";
  else if (resolvedPath.length > 0)
    return resolvedPath;
  else
    return ".";
}
function normalize(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var isAbsolute = path.charCodeAt(0) === 47, trailingSeparator = path.charCodeAt(path.length - 1) === 47;
  if (path = normalizeStringPosix(path, !isAbsolute), path.length === 0 && !isAbsolute)
    path = ".";
  if (path.length > 0 && trailingSeparator)
    path += "/";
  if (isAbsolute)
    return "/" + path;
  return path;
}
function isAbsolute(path) {
  return assertPath(path), path.length > 0 && path.charCodeAt(0) === 47;
}
function join() {
  if (arguments.length === 0)
    return ".";
  var joined;
  for (var i = 0;i < arguments.length; ++i) {
    var arg = arguments[i];
    if (assertPath(arg), arg.length > 0)
      if (joined === undefined)
        joined = arg;
      else
        joined += "/" + arg;
  }
  if (joined === undefined)
    return ".";
  return normalize(joined);
}
function relative(from, to) {
  if (assertPath(from), assertPath(to), from === to)
    return "";
  if (from = resolve(from), to = resolve(to), from === to)
    return "";
  var fromStart = 1;
  for (;fromStart < from.length; ++fromStart)
    if (from.charCodeAt(fromStart) !== 47)
      break;
  var fromEnd = from.length, fromLen = fromEnd - fromStart, toStart = 1;
  for (;toStart < to.length; ++toStart)
    if (to.charCodeAt(toStart) !== 47)
      break;
  var toEnd = to.length, toLen = toEnd - toStart, length = fromLen < toLen ? fromLen : toLen, lastCommonSep = -1, i = 0;
  for (;i <= length; ++i) {
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === 47)
          return to.slice(toStart + i + 1);
        else if (i === 0)
          return to.slice(toStart + i);
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === 47)
          lastCommonSep = i;
        else if (i === 0)
          lastCommonSep = 0;
      }
      break;
    }
    var fromCode = from.charCodeAt(fromStart + i), toCode = to.charCodeAt(toStart + i);
    if (fromCode !== toCode)
      break;
    else if (fromCode === 47)
      lastCommonSep = i;
  }
  var out = "";
  for (i = fromStart + lastCommonSep + 1;i <= fromEnd; ++i)
    if (i === fromEnd || from.charCodeAt(i) === 47)
      if (out.length === 0)
        out += "..";
      else
        out += "/..";
  if (out.length > 0)
    return out + to.slice(toStart + lastCommonSep);
  else {
    if (toStart += lastCommonSep, to.charCodeAt(toStart) === 47)
      ++toStart;
    return to.slice(toStart);
  }
}
function _makeLong(path) {
  return path;
}
function dirname(path) {
  if (assertPath(path), path.length === 0)
    return ".";
  var code = path.charCodeAt(0), hasRoot = code === 47, end = -1, matchedSlash = true;
  for (var i = path.length - 1;i >= 1; --i)
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else
      matchedSlash = false;
  if (end === -1)
    return hasRoot ? "/" : ".";
  if (hasRoot && end === 1)
    return "//";
  return path.slice(0, end);
}
function basename(path, ext) {
  if (ext !== undefined && typeof ext !== "string")
    throw TypeError('"ext" argument must be a string');
  assertPath(path);
  var start = 0, end = -1, matchedSlash = true, i;
  if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
    if (ext.length === path.length && ext === path)
      return "";
    var extIdx = ext.length - 1, firstNonSlashEnd = -1;
    for (i = path.length - 1;i >= 0; --i) {
      var code = path.charCodeAt(i);
      if (code === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else {
        if (firstNonSlashEnd === -1)
          matchedSlash = false, firstNonSlashEnd = i + 1;
        if (extIdx >= 0)
          if (code === ext.charCodeAt(extIdx)) {
            if (--extIdx === -1)
              end = i;
          } else
            extIdx = -1, end = firstNonSlashEnd;
      }
    }
    if (start === end)
      end = firstNonSlashEnd;
    else if (end === -1)
      end = path.length;
    return path.slice(start, end);
  } else {
    for (i = path.length - 1;i >= 0; --i)
      if (path.charCodeAt(i) === 47) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1)
        matchedSlash = false, end = i + 1;
    if (end === -1)
      return "";
    return path.slice(start, end);
  }
}
function extname(path) {
  assertPath(path);
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, preDotState = 0;
  for (var i = path.length - 1;i >= 0; --i) {
    var code = path.charCodeAt(i);
    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
    return "";
  return path.slice(startDot, end);
}
function format(pathObject) {
  if (pathObject === null || typeof pathObject !== "object")
    throw TypeError('The "pathObject" argument must be of type Object. Received type ' + typeof pathObject);
  return _format("/", pathObject);
}
function parse(path) {
  assertPath(path);
  var ret = { root: "", dir: "", base: "", ext: "", name: "" };
  if (path.length === 0)
    return ret;
  var code = path.charCodeAt(0), isAbsolute2 = code === 47, start;
  if (isAbsolute2)
    ret.root = "/", start = 1;
  else
    start = 0;
  var startDot = -1, startPart = 0, end = -1, matchedSlash = true, i = path.length - 1, preDotState = 0;
  for (;i >= start; --i) {
    if (code = path.charCodeAt(i), code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }
      continue;
    }
    if (end === -1)
      matchedSlash = false, end = i + 1;
    if (code === 46) {
      if (startDot === -1)
        startDot = i;
      else if (preDotState !== 1)
        preDotState = 1;
    } else if (startDot !== -1)
      preDotState = -1;
  }
  if (startDot === -1 || end === -1 || preDotState === 0 || preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
    if (end !== -1)
      if (startPart === 0 && isAbsolute2)
        ret.base = ret.name = path.slice(1, end);
      else
        ret.base = ret.name = path.slice(startPart, end);
  } else {
    if (startPart === 0 && isAbsolute2)
      ret.name = path.slice(1, startDot), ret.base = path.slice(1, end);
    else
      ret.name = path.slice(startPart, startDot), ret.base = path.slice(startPart, end);
    ret.ext = path.slice(startDot, end);
  }
  if (startPart > 0)
    ret.dir = path.slice(0, startPart - 1);
  else if (isAbsolute2)
    ret.dir = "/";
  return ret;
}
var sep = "/";
var delimiter = ":";
var posix = ((p) => (p.posix = p, p))({ resolve, normalize, isAbsolute, join, relative, _makeLong, dirname, basename, extname, format, parse, sep, delimiter, win32: null, posix: null });

// src/index.ts
async function run() {
  try {
    const config = loadConfig();
    const context4 = github2.context;
    if (!shouldRun(context4, config)) {
      core2.info("Skipping: not a relevant event");
      return;
    }
    core2.info(`Starting code review for PR #${context4.issue.number}...`);
    let reviewId = "";
    let commentCount = 0;
    for await (const message of import_claude_agent_sdk2.query({
      prompt: buildPrompt(config),
      options: {
        model: getModelString(config.provider),
        maxTurns: 50,
        cwd: join(process.cwd(), ".claude"),
        allowedTools: ["Read", "WebSearch", "WebFetch"],
        mcpServers: { github: githubMcpServer },
        permissionMode: "bypassPermissions",
        maxBudgetUsd: config.maxBudgetUsd
      }
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            core2.debug(block.text);
          }
        }
      }
      if (message.type === "result") {
        if (message.subtype === "success") {
          core2.info(`Review complete. Cost: $${message.total_cost_usd?.toFixed(4)}`);
        } else {
          core2.warning(`Review ended: ${message.subtype}`);
        }
      }
    }
    core2.setOutput("review_id", reviewId);
    core2.setOutput("comment_count", commentCount);
  } catch (error) {
    core2.setFailed(error instanceof Error ? error.message : String(error));
  }
}
function getModelString(provider) {
  if (provider === "anthropic" || provider === "claude") {
    return "claude-sonnet-4-5-20250929";
  }
  return provider;
}
function shouldRun(context4, config) {
  const { eventName, payload } = context4;
  if (eventName === "pull_request") {
    const action = payload.action;
    if (action === "opened" && config.reviewOnOpen)
      return true;
    if ((action === "synchronize" || action === "reopened") && config.reviewOnUpdate)
      return true;
    return false;
  }
  if (eventName === "issue_comment" || eventName === "pull_request_review_comment") {
    const comment = payload.comment?.body || "";
    const isPR = eventName === "pull_request_review_comment" || payload.issue?.pull_request;
    return isPR && comment.includes(config.githubUsername.replace("@", ""));
  }
  return false;
}
function buildPrompt(config) {
  const base = "Review this pull request. Analyze the diff, identify issues, add inline comments, and submit a review.";
  return config.customPrompt ? `${base}

Additional instructions: ${config.customPrompt}` : base;
}
run();

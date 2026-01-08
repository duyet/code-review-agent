export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  position: number; // Position in diff for GitHub API
}

export interface FileDiff {
  path: string;
  hunks: DiffHunk[];
}

export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = diff.split('\n');

  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let position = 0;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // New file header
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = { path: '', hunks: [] };
      currentHunk = null;
      position = 0;
      continue;
    }

    // File path from +++ line
    if (line.startsWith('+++ b/') && currentFile) {
      currentFile.path = line.slice(6);
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      position = 0;
      continue;
    }

    // Diff content lines
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      position++;

      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.slice(1),
          newLineNumber: newLine,
          position,
        });
        newLine++;
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.slice(1),
          oldLineNumber: oldLine,
          position,
        });
        oldLine++;
      } else {
        currentHunk.lines.push({
          type: 'context',
          content: line.slice(1),
          oldLineNumber: oldLine,
          newLineNumber: newLine,
          position,
        });
        oldLine++;
        newLine++;
      }
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

export function findLinePosition(
  fileDiffs: FileDiff[],
  path: string,
  lineNumber: number
): number | null {
  const fileDiff = fileDiffs.find((f) => f.path === path);
  if (!fileDiff) return null;

  for (const hunk of fileDiff.hunks) {
    for (const line of hunk.lines) {
      if (line.newLineNumber === lineNumber && line.type !== 'deletion') {
        return line.position;
      }
    }
  }

  return null;
}

export function getAddedLines(fileDiffs: FileDiff[], path: string): number[] {
  const fileDiff = fileDiffs.find((f) => f.path === path);
  if (!fileDiff) return [];

  const addedLines: number[] = [];
  for (const hunk of fileDiff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'addition' && line.newLineNumber !== undefined) {
        addedLines.push(line.newLineNumber);
      }
    }
  }

  return addedLines;
}

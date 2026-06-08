/**
 * Brace/bracket/paren balance for non-TypeScript text files. Extracted
 * from engine.ts to keep that file below the architecture-guard line
 * budget; same algorithm, same supported extensions.
 */

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
const OPEN = new Set(['(', '[', '{']);

export function structuralErrors(ext: string, text: string): string[] {
  const errors: string[] = [];
  const stack: { ch: string; line: number }[] = [];
  const hashComment = new Set(['.py', '.rb', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml']).has(
    ext,
  );
  const slashComment = new Set([
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.c',
    '.h',
    '.cc',
    '.cpp',
    '.hpp',
    '.cs',
    '.php',
    '.swift',
    '.scala',
    '.css',
    '.scss',
    '.less',
    '.sql',
  ]).has(ext);
  let line = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    // line comment
    if (hashComment && c === '#') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (slashComment && c === '/' && text[i + 1] === '/') {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (slashComment && c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) {
        errors.push(`unterminated block comment (from line ${line})`);
        return errors;
      }
      for (let k = i; k < end; k++) if (text[k] === '\n') line++;
      i = end + 2;
      continue;
    }
    if (ext === '.py' && (c === '"' || c === "'") && text.slice(i, i + 3) === c.repeat(3)) {
      const startLine = line;
      const end = text.indexOf(c.repeat(3), i + 3);
      if (end === -1) {
        errors.push(`unterminated triple-quoted string (line ${startLine})`);
        return errors;
      }
      for (let k = i; k < end; k++) if (text[k] === '\n') line++;
      i = end + 3;
      continue;
    }
    // string literal — skip content, honor backslash escapes
    if (c === '"' || c === "'" || c === '`') {
      const startLine = line;
      let j = i + 1;
      while (j < n) {
        const d = text[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') {
          line++;
          // single/double quotes don't span lines in most langs; backtick does
          if (c !== '`') {
            errors.push(`unterminated string (line ${startLine})`);
            break;
          }
        }
        if (d === c) break;
        j++;
      }
      if (j >= n) errors.push(`unterminated string (line ${startLine})`);
      i = j + 1;
      continue;
    }
    if (OPEN.has(c)) {
      stack.push({ ch: c, line });
    } else if (c in PAIRS) {
      const top = stack.pop();
      if (!top || top.ch !== PAIRS[c]) {
        errors.push(`unbalanced '${c}' (line ${line})`);
      }
    }
    i++;
  }
  for (const o of stack) errors.push(`unclosed '${o.ch}' (line ${o.line})`);
  return errors;
}

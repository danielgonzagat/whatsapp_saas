import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

import {
  CODE_STATE_COLOR_GROUPS,
  GRAPH_SETTINGS_PATH,
  LANG_BY_FILENAME,
  MANIFEST_PATH,
  MIRROR_FORMAT_VERSION,
  REPO_ROOT,
  ROOT_FILE_PATTERNS,
  SKIP_DIR_PATTERNS,
  SKIP_FILE_PATTERNS,
  SKIP_SECRET_PATTERNS,
  SOURCE_DIRECTORIES,
  SOURCE_MIRROR_DIR,
  VAULT_ROOT,
  WORKSPACE_GRAPH_SEARCH,
  EXT_TO_LANG,
} from '../obsidian-mirror-daemon-constants.mjs';

export function log(level, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix =
    level === 'ERR'
      ? `\x1b[31m[${ts} ERR]\x1b[0m`
      : level === 'WARN'
        ? `\x1b[33m[${ts} WARN]\x1b[0m`
        : level === 'OK'
          ? `\x1b[32m[${ts} OK]\x1b[0m`
          : `\x1b[2m[${ts}]\x1b[0m`;
  console.log(prefix, ...args);
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    while (bytesRead > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

export function normalizePath(path) {
  return path.split('\\').join('/');
}

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function writeJsonAtomic(filePath, data) {
  ensureDir(dirname(filePath));
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  renameSync(tmp, filePath);
}

let gitDirtySourcesCache = null;
let gitLocalCommitSourcesCache = null;

function readNullDelimitedGitOutput(args) {
  try {
    const output = execFileSync('git', ['-C', REPO_ROOT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  } catch {
    return [];
  }
}

export function readGitDirtySources(force = false) {
  if (gitDirtySourcesCache && !force) {
    return gitDirtySourcesCache;
  }

  const dirty = new Set();
  for (const rel of readNullDelimitedGitOutput(['diff', '--name-only', '-z', 'HEAD', '--'])) {
    dirty.add(normalizePath(rel));
  }
  for (const rel of readNullDelimitedGitOutput([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ])) {
    dirty.add(normalizePath(rel));
  }

  gitDirtySourcesCache = dirty;
  return dirty;
}

export function readGitLocalCommitSources(force = false) {
  if (gitLocalCommitSourcesCache && !force) {
    return gitLocalCommitSourcesCache;
  }

  gitLocalCommitSourcesCache = new Set(
    readNullDelimitedGitOutput(['diff', '--name-only', '-z', '@{upstream}..HEAD', '--']).map(
      normalizePath,
    ),
  );
  return gitLocalCommitSourcesCache;
}

export function gitDirtySignature(
  dirtySources = readGitDirtySources(),
  localCommitSources = readGitLocalCommitSources(),
) {
  return [
    ...[...dirtySources].sort(),
    '\0--local-commit--\0',
    ...[...localCommitSources].sort(),
  ].join('\0');
}

export function gitStateForSource(sourcePath) {
  const rel = normalizePath(relative(REPO_ROOT, sourcePath));
  const dirty = readGitDirtySources().has(rel);
  const localCommit = !dirty && readGitLocalCommitSources().has(rel);
  return {
    dirty,
    localCommit,
    rel,
    workspaceState: dirty ? 'DIRTY' : localCommit ? 'LOCAL_COMMIT' : 'NO_LOCAL_DIFF',
  };
}

function shouldSkipDir(dirName, fullPath) {
  const rel = normalizePath(relative(REPO_ROOT, fullPath) || dirName);
  return SKIP_DIR_PATTERNS.some((pattern) => pattern.test(rel) || pattern.test(dirName));
}

function shouldSkipFile(fileName, fullPath) {
  const rel = normalizePath(relative(REPO_ROOT, fullPath) || fileName);
  return [...SKIP_SECRET_PATTERNS, ...SKIP_FILE_PATTERNS].some(
    (pattern) => pattern.test(rel) || pattern.test(fileName),
  );
}

export function isConfiguredSourcePath(fullPath) {
  const rel = normalizePath(relative(REPO_ROOT, fullPath));
  if (rel.startsWith('..') || rel === '') {
    return false;
  }
  const [top] = rel.split('/');
  if (SOURCE_DIRECTORIES.includes(top)) {
    return true;
  }
  return ROOT_FILE_PATTERNS.some(({ pattern }) => pattern.test(rel));
}

function isCandidateSourcePath(fullPath) {
  if (!isConfiguredSourcePath(fullPath)) {
    return false;
  }
  if (shouldSkipFile(basename(fullPath), fullPath)) {
    return false;
  }

  const parts = normalizePath(relative(REPO_ROOT, fullPath)).split('/');
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (shouldSkipDir(parts[index], join(REPO_ROOT, ...parts.slice(0, index + 1)))) {
      return false;
    }
  }
  return true;
}

export function isMirrorableSourceFile(fullPath) {
  if (!isCandidateSourcePath(fullPath)) {
    return false;
  }
  try {
    const st = statSync(fullPath);
    return st.isFile();
  } catch {
    return false;
  }
}

export function collectAllSourceFiles() {
  const files = [];
  const visit = (dirPath) => {
    let entries;
    try {
      entries = statSync(dirPath).isDirectory()
        ? [...new Set(readDirNames(dirPath))]
        : [];
    } catch {
      return;
    }
    for (const name of entries) {
      const fullPath = join(dirPath, name);
      let st;
      try {
        st = statSync(fullPath);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!shouldSkipDir(name, fullPath)) {
          visit(fullPath);
        }
      } else if (isMirrorableSourceFile(fullPath)) {
        files.push(fullPath);
      }
    }
  };

  for (const sourceDir of SOURCE_DIRECTORIES) {
    const fullPath = join(REPO_ROOT, sourceDir);
    if (existsSync(fullPath)) {
      visit(fullPath);
    }
  }

  let rootEntries = [];
  try {
    rootEntries = readDirNames(REPO_ROOT);
  } catch {
    rootEntries = [];
  }
  for (const name of rootEntries) {
    const fullPath = join(REPO_ROOT, name);
    if (ROOT_FILE_PATTERNS.some(({ pattern }) => pattern.test(name)) && isMirrorableSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return [...new Set(files)].sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
}

function readDirNames(dirPath) {
  return execFileSync('find', [dirPath, '-maxdepth', '1', '-mindepth', '1', '-print0'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\0')
    .filter(Boolean)
    .map((item) => basename(item));
}

export function detectLanguage(filePath) {
  const name = basename(filePath);
  if (LANG_BY_FILENAME[name]) {
    return LANG_BY_FILENAME[name];
  }
  if (name.endsWith('.d.ts')) {
    return 'typescript';
  }
  return EXT_TO_LANG[extname(name).toLowerCase()] || '';
}

function mirrorVisibleSegment(segment) {
  return segment.startsWith('.') ? `_dot_${segment.slice(1)}` : segment;
}

export function sourceToMirrorPath(sourceAbs) {
  const rel = normalizePath(relative(REPO_ROOT, sourceAbs))
    .split('/')
    .map(mirrorVisibleSegment)
    .join('/');
  return join(SOURCE_MIRROR_DIR, `${rel}.md`);
}

export function obsidianLinkTarget(filePath) {
  const rel = normalizePath(relative(VAULT_ROOT, filePath));
  return rel.endsWith('.md') ? rel.slice(0, -3) : rel;
}

export function obsidianLink(targetPath, alias) {
  const safeAlias = String(alias || basename(targetPath)).replace(/[\[\]|]/g, '-');
  return `[[${obsidianLinkTarget(targetPath)}|${safeAlias}]]`;
}

export function readManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      return {
        version: parsed.version || 2,
        generated: parsed.generated || new Date().toISOString(),
        repo_root: parsed.repo_root || REPO_ROOT,
        files: parsed.files || {},
      };
    }
  } catch (error) {
    log('WARN', 'Manifest read error, reinitializing:', error.message);
  }
  return { version: 2, generated: new Date().toISOString(), repo_root: REPO_ROOT, files: {} };
}

export function writeManifest(data) {
  writeJsonAtomic(MANIFEST_PATH, {
    version: data.version || 2,
    generated: data.generated || new Date().toISOString(),
    repo_root: REPO_ROOT,
    files: data.files || {},
  });
}

export function ensureGraphLensSettings() {
  if (!existsSync(GRAPH_SETTINGS_PATH)) {
    return false;
  }
  let current;
  try {
    current = JSON.parse(readFileSync(GRAPH_SETTINGS_PATH, 'utf8'));
  } catch (error) {
    log('WARN', 'Cannot read Obsidian graph settings:', error.message);
    return false;
  }

  const next = {
    ...current,
    search: WORKSPACE_GRAPH_SEARCH,
    showOrphans: true,
    hideUnresolved: true,
    colorGroups: CODE_STATE_COLOR_GROUPS,
  };
  const currentText = `${JSON.stringify(current, null, 2)}\n`;
  const nextText = `${JSON.stringify(next, null, 2)}\n`;
  if (currentText === nextText) {
    return false;
  }
  const tmp = `${GRAPH_SETTINGS_PATH}.tmp`;
  writeFileSync(tmp, nextText, 'utf8');
  renameSync(tmp, GRAPH_SETTINGS_PATH);
  return true;
}

export function ensureSourceDir() {
  ensureDir(SOURCE_MIRROR_DIR);
  if (!existsSync(MANIFEST_PATH)) {
    writeManifest({
      version: 2,
      generated: new Date().toISOString(),
      repo_root: REPO_ROOT,
      files: {},
    });
  }
  ensureGraphLensSettings();
  return readManifest();
}

export { MIRROR_FORMAT_VERSION };

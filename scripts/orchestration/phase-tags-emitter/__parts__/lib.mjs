import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

import {
  BACKEND_DIR_MAP,
  FRONTEND_PATH_SEGMENTS,
  SKIP_PREFIXES,
  SKIP_ROOT_FILES,
  SKIP_EXTS,
  SOURCE_MIRROR_DIR,
} from './constants.mjs';

export function isSkippable(relPath) {
  if (SKIP_ROOT_FILES.has(relPath)) return true;
  for (const prefix of SKIP_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }
  const ext = relPath.includes('.') ? '.' + relPath.split('.').pop() : '';
  if (SKIP_EXTS.has(ext)) return true;
  if (relPath.startsWith('../../') || relPath.startsWith('/')) return true;
  if (
    relPath.includes('/node_modules/') ||
    relPath.includes('/dist/') ||
    relPath.includes('/build/') ||
    relPath.includes('/coverage/') ||
    relPath.includes('/.next/') ||
    relPath.includes('/__pycache__/')
  )
    return true;
  return false;
}

export function fileIsDotfileInRoot(relPath) {
  return relPath.startsWith('.') && !relPath.includes('/');
}

export function listAllRepoFiles(rootDir, relPrefix) {
  const files = [];
  const stack = [{ dir: rootDir, rel: relPrefix }];
  while (stack.length > 0) {
    const { dir, rel } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.next' ||
          entry.name === '__pycache__'
        )
          continue;
        if (isSkippable(relPath + '/')) continue;
        stack.push({ dir: abs, rel: relPath });
      } else if (entry.isFile()) {
        if (fileIsDotfileInRoot(relPath)) continue;
        if (isSkippable(relPath)) continue;
        files.push(relPath);
      }
    }
  }
  return files;
}

export function inferModule(relPath) {
  const segments = relPath.replace(/\\/g, '/').split('/');

  if (segments[0] === 'backend' && segments[1] === 'src' && segments[2]) {
    const dir = segments[2];
    if (BACKEND_DIR_MAP[dir]) return BACKEND_DIR_MAP[dir];
  }

  if (segments[0] === 'worker') {
    if (relPath.includes('whatsapp') || relPath.includes('waha') || relPath.includes('meta-'))
      return 'WhatsApp';
    return null;
  }

  if (segments[0] === 'frontend') {
    const srcIdx = segments.indexOf('src');
    if (srcIdx === -1) return null;

    for (let i = srcIdx + 1; i < segments.length; i++) {
      const seg = segments[i].toLowerCase();
      if (FRONTEND_PATH_SEGMENTS[seg]) return FRONTEND_PATH_SEGMENTS[seg];
    }
  }

  return null;
}

export function inferModuleFromTestPath(relPath) {
  const clean = relPath.replace(/^.*\/__tests__\//, '');
  const noExt = clean.replace(/\.(spec|test)\.[cm]?[jt]sx?$/, '');
  const noMock = noExt.replace(/^__mocks__\//, '');
  return inferModule(noMock);
}

export function pathToModule(relPath) {
  let module = inferModule(relPath);
  if (
    !module &&
    (relPath.endsWith('.test.ts') ||
      relPath.endsWith('.spec.ts') ||
      relPath.endsWith('.test.tsx') ||
      relPath.endsWith('.spec.tsx') ||
      relPath.includes('/__tests__/'))
  ) {
    module = inferModuleFromTestPath(relPath);
  }
  return module;
}

export function readMirrorTags(mirrorRelPath) {
  const absPath = join(SOURCE_MIRROR_DIR, mirrorRelPath);
  if (!existsSync(absPath)) return null;
  const content = readFileSync(absPath, 'utf8');
  if (!content.startsWith('---\n')) return null;
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end).split('\n');
  const tags = [];
  let inTags = false;
  for (const line of frontmatter) {
    if (line === 'tags:') {
      inTags = true;
      continue;
    }
    if (inTags) {
      if (line.startsWith('  - ')) {
        tags.push(line.slice(4));
        continue;
      }
      inTags = false;
    }
  }
  return tags;
}

export function mirrorVisibleSegment(segment) {
  return segment.startsWith('.') ? `_dot_${segment.slice(1)}` : segment;
}

export function mirrorRelPathForSource(relPath) {
  const segments = relPath.replace(/\\/g, '/').split('/');
  const mirrored = segments.map(mirrorVisibleSegment);
  return mirrored.join('/') + '.md';
}

export function atomWrite(absPath, content) {
  const tmp = absPath + '.tmp';
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
}

export function extractClaimedModules(fileContent, relPath) {
  const modules = new Set();
  const lower = fileContent.toLowerCase();
  for (const [dir, module] of Object.entries(BACKEND_DIR_MAP)) {
    if (relPath.includes(`/${dir}/`)) {
      modules.add(module);
    }
  }
  return modules;
}

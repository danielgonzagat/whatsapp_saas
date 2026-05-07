// Helpers extracted from phase-tags-emitter
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


import { readFileSync, existsSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_MIRROR_DIR } from './constants.mjs';

export function atomWrite(absPath, content) {
  const tmp = absPath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, absPath);
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

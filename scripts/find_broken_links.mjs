import { readFileSync, existsSync, lstatSync } from 'fs';
import { globSync } from 'glob';
import { resolve, dirname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

const mdFiles = globSync('.agents/skills/**/*.md', { cwd: ROOT, absolute: true, nodir: true });

const broken = [];

for (const file of mdFiles) {
  const content = readFileSync(file, 'utf8');
  const dir = dirname(file);

  // Match [text](url) patterns - capture both reference-style and inline
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const [, text, rawUrl] = match;

    // Skip external URLs
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) continue;
    // Skip anchor-only links
    if (rawUrl.startsWith('#')) continue;
    // Skip mailto
    if (rawUrl.startsWith('mailto:')) continue;
    // Skip pure fragment links (text#fragment)
    if (rawUrl.match(/^[^/]*#/)) continue;

    // Resolve relative to the file's directory
    const resolved = resolve(dir, rawUrl);

    if (!existsSync(resolved)) {
      broken.push({
        file: file.replace(ROOT + '/', ''),
        link: rawUrl,
        resolved: resolved.replace(ROOT + '/', ''),
        text,
      });
    }
  }
}

console.log(JSON.stringify({ total: broken.length, broken }, null, 2));

import * as fs from 'fs';
import * as path from 'path';

function parseEnvFile(content: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (!key) {
      continue;
    }
    pairs.push([key, value]);
  }

  return pairs;
}

export function loadPulseLocalEnv(rootDir: string): string[] {
  const candidateFiles = ['.env.pulse.local'];

  const loaded: string[] = [];

  for (const relativePath of candidateFiles) {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(fullPath);
      loaded.push(relativePath);
      continue;
    }

    const pairs = parseEnvFile(fs.readFileSync(fullPath, 'utf8'));
    for (const [key, value] of pairs) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
    loaded.push(relativePath);
  }

  return loaded;
}

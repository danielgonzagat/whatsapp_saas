import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Matches: process.env.SOME_VAR_NAME
const PROCESS_ENV_RE = /process\.env\.([A-Z][A-Z0-9_]+)/g;

// Matches: configService.get('SOME_VAR') or configService.get<T>('SOME_VAR')
const CONFIG_SERVICE_RE = /configService\.get(?:<[^>]+>)?\(\s*['"`]([A-Z][A-Z0-9_]+)['"`]/g;

// Hardcoded secret patterns (in string literals)
const HARDCODED_SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  // Live Stripe/payment keys
  { re: /['"`]sk_live_[A-Za-z0-9]{20,}['"`]/, label: 'Stripe live secret key' },
  { re: /['"`]pk_live_[A-Za-z0-9]{20,}['"`]/, label: 'Stripe live publishable key' },
  { re: /['"`]sk_test_[A-Za-z0-9]{20,}['"`]/, label: 'Stripe test secret key' },
  { re: /['"`]pk_test_[A-Za-z0-9]{20,}['"`]/, label: 'Stripe test publishable key' },
  // Generic long hex/alphanum API key (32+ chars) assigned to a key-sounding variable
  {
    re: /(?:apiKey|api_key|secret|token|password|credential|auth_key)\s*(?:=|:)\s*['"`][A-Za-z0-9+/=_\-]{32,}['"`]/i,
    label: 'Hardcoded API key / secret',
  },
];

function shouldSkipFile(file: string): boolean {
  return (
    /node_modules|\.next|\/dist\/|\.next\/|\.spec\.ts$|\.test\.ts$|__tests__|__mocks__|\/seed\.|\/migration\.|fixture/i.test(file)
  );
}

function readEnvExample(rootDir: string): Set<string> {
  const candidates = ['.env.example', '.env.sample', '.env.template'];
  for (const name of candidates) {
    const fullPath = path.join(rootDir, name);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const vars = new Set<string>();
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
          const varName = trimmed.split('=')[0].trim();
          if (varName) vars.add(varName);
        }
        return vars;
      } catch {
        return new Set();
      }
    }
  }
  return new Set();
}

export function checkEnvVars(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const documentedVars = readEnvExample(config.rootDir);

  const referencedVars = new Map<string, { file: string; line: number }>();

  const scanDirs = [config.backendDir, config.workerDir];

  for (const dir of scanDirs) {
    const files = walkFiles(dir, ['.ts']);

    for (const file of files) {
      if (shouldSkipFile(file)) continue;

      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comment lines
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

        // Collect process.env.VAR references
        PROCESS_ENV_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = PROCESS_ENV_RE.exec(line)) !== null) {
          const varName = m[1];
          if (!referencedVars.has(varName)) {
            referencedVars.set(varName, { file: relFile, line: i + 1 });
          }
        }

        // Collect configService.get('VAR') references
        CONFIG_SERVICE_RE.lastIndex = 0;
        while ((m = CONFIG_SERVICE_RE.exec(line)) !== null) {
          const varName = m[1];
          if (!referencedVars.has(varName)) {
            referencedVars.set(varName, { file: relFile, line: i + 1 });
          }
        }

        // Scan for hardcoded secrets
        for (const { re, label } of HARDCODED_SECRET_PATTERNS) {
          if (re.test(line)) {
            breaks.push({
              type: 'HARDCODED_SECRET',
              severity: 'critical',
              file: relFile,
              line: i + 1,
              description: `Hardcoded secret detected: ${label}`,
              detail: trimmed.slice(0, 120),
            });
          }
        }
      }
    }
  }

  // Check referenced vars against documented vars
  for (const [varName, location] of referencedVars.entries()) {
    // Skip Node.js built-ins and common non-secret vars that are always set
    if (['NODE_ENV', 'PORT', 'HOST', 'TZ', 'PWD', 'HOME', 'PATH', 'HOSTNAME'].includes(varName)) continue;

    if (!documentedVars.has(varName)) {
      breaks.push({
        type: 'ENV_NOT_DOCUMENTED',
        severity: 'medium',
        file: location.file,
        line: location.line,
        description: `Environment variable ${varName} is referenced but not documented in .env.example`,
        detail: `Add ${varName}= to .env.example with a description comment`,
      });
    }
  }

  return breaks;
}

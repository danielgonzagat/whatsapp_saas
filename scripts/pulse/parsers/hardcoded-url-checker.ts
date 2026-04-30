import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readDir, readTextFile } from '../safe-fs';

// Matches any http/https URL that contains a domain name
const URL_RE = /https?:\/\/([a-zA-Z0-9.\-]+)/g;

type DomainEvidenceSource = 'env' | 'config' | 'runtime_artifact';

interface DomainEvidence {
  domain: string;
  sources: Set<DomainEvidenceSource>;
}

const RUNTIME_ARTIFACT_NAMES = [
  'PULSE_BEHAVIOR_GRAPH.json',
  'PULSE_EXTERNAL_SIGNAL_STATE.json',
  'PULSE_RUNTIME_EVIDENCE.json',
  'PULSE_SCOPE_STATE.json',
  'PULSE_STRUCTURAL_GRAPH.json',
];

function shouldSkipFile(file: string): boolean {
  return /node_modules|\.(spec|test)\.(ts|tsx|js|jsx)$|__tests__|__mocks__|\.next[/\\]/.test(file);
}

function isCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('#')
  );
}

function isImportLine(trimmed: string): boolean {
  return (
    /^\s*(?:import|export)\s+/.test(trimmed) || /^\s*(?:from|require)\s*\(?\s*['"`]/.test(trimmed)
  );
}

function isConfigurationFile(file: string): boolean {
  // Skip files that are explicitly configuration / documentation
  return /(?:README|CHANGELOG|\.md$|\.env|env\.ts$|env\.js$|constants\.ts$|config\.ts$|app-config\.module\.ts$|next\.config\.|jest\.config\.|tsconfig\.|\.eslintrc|\.prettierrc|package\.json$)/.test(
    path.basename(file),
  );
}

function isDomainEvidenceFile(file: string): boolean {
  const normalized = file.split(path.sep).join('/');
  return (
    isConfigurationFile(file) ||
    /\/(?:config|configs|env|provider|providers|adapter|adapters|runtime)\//.test(normalized)
  );
}

function isDotEnvFile(file: string): boolean {
  return /^\.env(?:\.|$)/.test(path.basename(file));
}

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/\.$/, '');
}

function extractDomainsFromText(text: string): string[] {
  const domains = new Set<string>();
  URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    domains.add(normalizeDomain(match[1]));
  }
  return [...domains];
}

function addDomainEvidence(
  evidence: Map<string, DomainEvidence>,
  domain: string,
  source: DomainEvidenceSource,
): void {
  const normalized = normalizeDomain(domain);
  const existing = evidence.get(normalized);
  if (existing) {
    existing.sources.add(source);
    return;
  }
  evidence.set(normalized, { domain: normalized, sources: new Set([source]) });
}

function collectEnvironmentDomainEvidence(evidence: Map<string, DomainEvidence>): void {
  for (const value of Object.values(process.env)) {
    if (!value || !value.includes('http')) {
      continue;
    }
    for (const domain of extractDomainsFromText(value)) {
      addDomainEvidence(evidence, domain, 'env');
    }
  }
}

function collectSourceDomainEvidence(
  config: PulseConfig,
  evidence: Map<string, DomainEvidence>,
): void {
  const scanDirs = [config.frontendDir, config.backendDir, config.workerDir].filter(Boolean);
  for (const dir of scanDirs) {
    for (const file of walkFiles(dir, ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'])) {
      if (!isDomainEvidenceFile(file) || isDotEnvFile(file)) {
        continue;
      }
      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }
      for (const domain of extractDomainsFromText(content)) {
        addDomainEvidence(evidence, domain, 'config');
      }
    }
  }
}

function collectRuntimeArtifactDomainEvidence(
  config: PulseConfig,
  evidence: Map<string, DomainEvidence>,
): void {
  const artifactDirs = [path.join(config.rootDir, '.pulse', 'current'), config.rootDir];
  for (const artifactDir of artifactDirs) {
    if (!pathExists(artifactDir)) {
      continue;
    }
    let entries: string[];
    try {
      entries = readDir(artifactDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!RUNTIME_ARTIFACT_NAMES.includes(entry)) {
        continue;
      }
      let content: string;
      try {
        content = readTextFile(path.join(artifactDir, entry), 'utf8');
      } catch {
        continue;
      }
      for (const domain of extractDomainsFromText(content)) {
        addDomainEvidence(evidence, domain, 'runtime_artifact');
      }
    }
  }
}

function buildDomainEvidence(config: PulseConfig): Map<string, DomainEvidence> {
  const evidence = new Map<string, DomainEvidence>();
  collectEnvironmentDomainEvidence(evidence);
  collectSourceDomainEvidence(config, evidence);
  collectRuntimeArtifactDomainEvidence(config, evidence);
  return evidence;
}

function findDomainEvidence(
  domainEvidence: Map<string, DomainEvidence>,
  domain: string,
): DomainEvidence | null {
  const normalized = normalizeDomain(domain);
  for (const evidence of domainEvidence.values()) {
    if (
      normalized === evidence.domain ||
      normalized.endsWith(`.${evidence.domain}`) ||
      evidence.domain.endsWith(`.${normalized}`)
    ) {
      return evidence;
    }
  }
  return null;
}

function hasEnvironmentFallbackContext(raw: string, prevLines: string): boolean {
  return (
    /\|\|\s*['"`]|(?:\?\?)\s*['"`]/.test(raw) ||
    /process\.env/.test(raw) ||
    /process\.env/.test(prevLines) ||
    /\.get\s*\([^)]+,\s*['"`]http/.test(raw) ||
    /configService\.get|this\.config\.get|config\.get/.test(prevLines) ||
    /Joi\.|\.default\s*\(/.test(raw) ||
    /NEXT_PUBLIC_[A-Z0-9_]*URL|[A-Z0-9_]*(?:FRONTEND|BACKEND|SERVICE|API|APP|BASE)_URL/i.test(raw)
  );
}

function hasLocalParserContext(raw: string, prevLines: string): boolean {
  return (
    /new\s+URL\s*\(/.test(raw) ||
    /hostname/i.test(raw) ||
    /getServerApiBase|getApiBase|getBackendBase|API_BASE/i.test(raw) ||
    /getServerApiBase|getApiBase|getBackendBase/i.test(prevLines)
  );
}

function hasConnectivityAllowlistContext(raw: string, prevLines: string): boolean {
  return (
    /cors|origin|gateway|WebSocketGateway|allowedOrigins|Set\s*\(/i.test(raw) ||
    /cors|origin|gateway|WebSocketGateway|allowedOrigins|Set\s*\(/i.test(prevLines)
  );
}

/** Check hardcoded urls. */
export function checkHardcodedUrls(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const domainEvidence = buildDomainEvidence(config);

  const scanDirs = [config.frontendDir, config.backendDir, config.workerDir].filter(Boolean);

  for (const dir of scanDirs) {
    const files = walkFiles(dir, ['.ts', '.tsx']);

    for (const file of files) {
      if (shouldSkipFile(file)) {
        continue;
      }
      if (isConfigurationFile(file)) {
        continue;
      }

      let content: string;
      try {
        content = readTextFile(file, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (isCommentLine(trimmed)) {
          continue;
        }
        if (isImportLine(trimmed)) {
          continue;
        }
        if (!trimmed.includes('http')) {
          continue;
        }

        URL_RE.lastIndex = 0;
        let m: RegExpExecArray | null;

        while ((m = URL_RE.exec(raw)) !== null) {
          const fullUrl = m[0];
          const domain = m[1];
          const prevLines = lines.slice(Math.max(0, i - 8), i).join('\n');

          if (
            hasEnvironmentFallbackContext(raw, prevLines) ||
            hasLocalParserContext(raw, prevLines) ||
            hasConnectivityAllowlistContext(raw, prevLines)
          ) {
            continue;
          }

          const observedEvidence = findDomainEvidence(domainEvidence, domain);
          const evidenceSummary = observedEvidence
            ? [...observedEvidence.sources].sort().join(',')
            : 'unconfirmed';

          breaks.push({
            type: observedEvidence ? 'HARDCODED_CONFIRMED_URL' : 'HARDCODED_URL_WEAK_EVIDENCE',
            severity: 'low',
            file: relFile,
            line: i + 1,
            description: observedEvidence
              ? `Hardcoded URL also appears in discovered runtime/config evidence: ${fullUrl}`
              : `Hardcoded URL regex match needs runtime/config confirmation: ${fullUrl}`,
            detail: `Evidence source: ${evidenceSummary}. Line: ${trimmed.slice(0, 120)}`,
            source: observedEvidence
              ? 'regex-confirmed-signal:hardcoded-url-checker'
              : 'regex-weak-signal:hardcoded-url-checker:needs_probe',
          });
        }
      }
    }
  }

  return breaks;
}

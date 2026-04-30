import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readDir, readTextFile } from '../safe-fs';
import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import {
  buildPulseSignalGraph,
  type PulseSignalEvidence,
  type PulseSignalTruthMode,
} from '../signal-graph';

type DomainEvidenceSource = 'env' | 'config' | 'runtime_artifact';

interface DomainEvidence {
  domain: string;
  sources: Set<DomainEvidenceSource>;
}

interface UrlWeakSignal {
  fullUrl: string;
  domain: string;
  index: number;
}

function severityFromRisk(riskScore: number, fallback: Break['severity']): Break['severity'] {
  if (riskScore >= 0.9) return 'critical';
  if (riskScore >= 0.7) return 'high';
  if (riskScore >= 0.4) return 'medium';
  return fallback;
}

function synthesizeUrlDiagnosticBreak(
  signal: PulseSignalEvidence,
  fallback: Break['severity'],
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const risk = calculateDynamicRisk({ predicateGraph });
  const diagnostic = synthesizeDiagnostic(signalGraph, predicateGraph, risk);

  return {
    type: diagnostic.id,
    severity: severityFromRisk(risk.score, fallback),
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; signal=${signal.detail ?? signal.summary}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode};proofMode=${diagnostic.proofMode}`,
  };
}

function buildUrlBreak(input: {
  file: string;
  line: number;
  summary: string;
  detail: string;
  truthMode: PulseSignalTruthMode;
  fallbackSeverity: Break['severity'];
}): Break {
  return synthesizeUrlDiagnosticBreak(
    {
      source: 'url-literal-sensor',
      detector: 'hardcoded-url-checker',
      truthMode: input.truthMode,
      summary: input.summary,
      detail: input.detail,
      location: {
        file: input.file,
        line: input.line,
      },
    },
    input.fallbackSeverity,
  );
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
  for (const signal of extractUrlWeakSignals(text)) {
    domains.add(normalizeDomain(signal.domain));
  }
  return [...domains];
}

function isUrlTerminator(char: string | undefined): boolean {
  return (
    char === undefined ||
    char.trim() === '' ||
    char === '"' ||
    char === "'" ||
    char === '`' ||
    char === ')' ||
    char === ']'
  );
}

function readUrlWeakSignal(text: string, index: number): UrlWeakSignal | null {
  const lower = text.slice(index, index + 8).toLowerCase();
  const schemeLength = lower.startsWith('https://') ? 8 : lower.startsWith('http://') ? 7 : 0;
  if (schemeLength === 0) {
    return null;
  }

  let cursor = index + schemeLength;
  while (!isUrlTerminator(text[cursor])) {
    cursor++;
  }

  const fullUrl = text.slice(index, cursor);
  const domainEndCandidates = ['/', ':', '?', '#']
    .map((separator) => {
      const separatorIndex = fullUrl.indexOf(separator, schemeLength);
      return separatorIndex === -1 ? fullUrl.length : separatorIndex;
    })
    .sort((a, b) => a - b);
  const domain = fullUrl.slice(schemeLength, domainEndCandidates[0] ?? fullUrl.length);
  if (!domain.includes('.')) {
    return null;
  }

  return { fullUrl, domain, index };
}

function extractUrlWeakSignals(text: string): UrlWeakSignal[] {
  const signals: UrlWeakSignal[] = [];
  for (let index = 0; index < text.length; index++) {
    const signal = readUrlWeakSignal(text, index);
    if (!signal) {
      continue;
    }
    signals.push(signal);
    index += signal.fullUrl.length - 1;
  }
  return signals;
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

        for (const signal of extractUrlWeakSignals(raw)) {
          const fullUrl = signal.fullUrl;
          const domain = signal.domain;
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

          breaks.push(
            buildUrlBreak({
              file: relFile,
              line: i + 1,
              truthMode: observedEvidence ? 'confirmed_static' : 'weak_signal',
              fallbackSeverity: 'low',
              summary: observedEvidence
                ? `URL literal ${fullUrl} is corroborated by discovered runtime or config domain evidence`
                : `URL literal ${fullUrl} was seen by the structural URL scanner and needs runtime or config confirmation`,
              detail: `Evidence source: ${evidenceSummary}. Line: ${trimmed.slice(0, 120)}`,
            }),
          );
        }
      }
    }
  }

  return breaks;
}

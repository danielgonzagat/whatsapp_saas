import * as path from 'path';
import type { Break, PulseParserContract } from '../../types';
import { pathExists, readTextFile, statPath } from '../../safe-fs';
import { discoverParserContracts } from '../../parser-registry';
import {
  type SelfTrustCheckpoint,
  checkpointScore,
  isActiveParserContract,
  isHelperContract,
  parseJsonObject,
  requiredManifestFields,
  selfTrustCriticalParserNames,
  loadExecutionTraceCandidate,
} from './checkpoint-types';

export function checkManifestIntegrity(manifestPath: string): SelfTrustCheckpoint {
  let id = 'manifest-integrity';

  try {
    if (!pathExists(manifestPath)) {
      return {
        id,
        name: 'Manifest File Exists',
        description: 'pulse.manifest.json must exist',
        pass: false,
        reason: 'pulse.manifest.json not found',
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    let content = readTextFile(manifestPath, 'utf-8');
    let manifest = parseJsonObject(content);
    let requiredFields = requiredManifestFields(manifestPath, manifest);

    let missing = requiredFields.filter((field) => !(field in manifest));

    if (missing.length > 0) {
      return {
        id,
        name: 'Manifest Completeness',
        description: 'All required manifest fields must be present',
        pass: false,
        reason: `Missing fields: ${missing.join(', ')}`,
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Manifest Integrity',
      description: 'pulse.manifest.json is complete and valid',
      pass: true,
      severity: 'critical',
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Manifest Parsing',
      description: 'pulse.manifest.json must be valid JSON',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'critical',
      score: checkpointScore(false),
    };
  }
}

export function checkParserRegistry(parsersDir: string): SelfTrustCheckpoint {
  let id = 'parser-registry';

  try {
    let repoRoot = path.resolve(parsersDir, '..', '..', '..');
    let contracts = discoverParserContracts(repoRoot);
    let executionTrace = loadExecutionTraceCandidate(repoRoot);
    let activeParsers = contracts.filter(isActiveParserContract);
    let helperModules = contracts.filter(isHelperContract);

    if (contracts.length === 0) {
      return {
        id,
        name: 'Parser Registry Discovery',
        description: 'Parser registry must discover parser module contracts',
        pass: false,
        reason: 'No parser modules were discovered',
        severity: 'high',
        score: checkpointScore(false),
      };
    }

    if (activeParsers.length === 0) {
      return {
        id,
        name: 'Parser Registry Contracts',
        description: 'At least one parser module must declare an executable parser contract',
        pass: false,
        reason: `${helperModules.length} helper module(s) discovered but no active parser contract matched`,
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    let activeParserNames = new Set(activeParsers.map((contract) => contract.name));
    let missingCriticalParsers = selfTrustCriticalParserNames(contracts, executionTrace).filter(
      (parserName) => !activeParserNames.has(parserName),
    );
    if (missingCriticalParsers.length > 0) {
      let helperCriticalParsers = contracts
        .filter(
          (contract): contract is PulseParserContract =>
            isHelperContract(contract) &&
            missingCriticalParsers.some((parserName) => parserName === contract.name),
        )
        .map((contract) => `${contract.name} (${contract.proof})`);
      let helperDetail =
        helperCriticalParsers.length > 0
          ? ` Helper contract(s): ${helperCriticalParsers.join('; ')}.`
          : '';
      return {
        id,
        name: 'Critical Parser Contracts',
        description: 'Financial and security critical parsers must remain active parser contracts',
        pass: false,
        reason: `Missing active critical parser contract(s): ${missingCriticalParsers.join(', ')}.${helperDetail}`,
        severity: 'critical',
        score: checkpointScore(false),
      };
    }

    return {
      id,
      name: 'Parser Registry',
      description: `${activeParsers.length} active parser contract(s) discovered; ${helperModules.length} helper module(s) skipped without failing execution`,
      pass: true,
      severity: 'critical',
      score: checkpointScore(true),
    };
  } catch (err) {
    return {
      id,
      name: 'Parser Registry Access',
      description: 'Parser directory must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'high',
      score: checkpointScore(false),
    };
  }
}

export function checkEvidenceFreshness(stateFile: string): SelfTrustCheckpoint {
  let id = 'evidence-freshness';

  try {
    if (!pathExists(stateFile)) {
      return {
        id,
        name: 'Evidence File',
        description: 'External evidence must be cached',
        pass: false,
        reason: 'No evidence cache found',
        severity: 'high',
        score: checkpointScore(false),
      };
    }

    let stat = statPath(stateFile);
    let ageMinutes = (Date.now() - stat.mtimeMs) / 60000;

    if (ageMinutes > 1440) {
      return {
        id,
        name: 'Evidence Age',
        description: 'External evidence must be < 24 hours old',
        pass: false,
        reason: `Evidence is ${Math.round(ageMinutes)} minutes old`,
        severity: 'high',
        score: checkpointScore(false),
      };
    }

    let freshness = Math.max(0, 100 - (ageMinutes / 1440) * 100);

    return {
      id,
      name: 'Evidence Freshness',
      description: `Evidence is ${Math.round(ageMinutes)} minutes old`,
      pass: true,
      severity: 'high',
      score: freshness,
    };
  } catch (err) {
    return {
      id,
      name: 'Evidence Access',
      description: 'Evidence cache must be accessible',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'high',
      score: checkpointScore(false),
    };
  }
}

export function checkIdempotence(lastOutput: unknown, currentOutput: unknown): SelfTrustCheckpoint {
  let id = 'idempotence';

  try {
    let lastStr = JSON.stringify(lastOutput);
    let currentStr = JSON.stringify(currentOutput);

    let match = lastStr === currentStr;

    return {
      id,
      name: 'Output Idempotence',
      description: 'Multiple PULSE runs must produce identical results',
      pass: match,
      reason: match ? undefined : 'Output differs between runs (non-deterministic)',
      severity: 'high',
      score: checkpointScore(match),
    };
  } catch (err) {
    return {
      id,
      name: 'Idempotence Check',
      description: 'Outputs must be comparable',
      pass: false,
      reason: err instanceof Error ? err.message : String(err),
      severity: 'medium',
      score: checkpointScore(false),
    };
  }
}

export function checkBreakConsistency(breaks: Break[]): SelfTrustCheckpoint {
  let id = 'break-consistency';

  let suspicionCount = 0;

  for (const brk of breaks) {
    if (hasSuspiciousBreakEvidence(brk)) {
      suspicionCount++;
    }
  }

  let falsePositiveRatio = breaks.length > 0 ? suspicionCount / breaks.length : 0;

  if (falsePositiveRatio > 0.1) {
    return {
      id,
      name: 'Break Consistency',
      description: 'Breaks must not be obviously false positives',
      pass: false,
      reason: `~${Math.round(falsePositiveRatio * 100)}% of breaks look suspicious`,
      severity: 'medium',
      score: Math.max(0, 100 - falsePositiveRatio * 1000),
    };
  }

  return {
    id,
    name: 'Break Consistency',
    description: 'Breaks appear credible (no obvious false positives)',
    pass: true,
    severity: 'medium',
    score: checkpointScore(true),
  };
}

function hasSuspiciousBreakEvidence(brk: Break): boolean {
  let serialized = JSON.stringify(brk).toLowerCase();
  let impossibleIndex = serialized.indexOf('impossible');
  if (impossibleIndex !== -1 && serialized.indexOf('pattern', impossibleIndex) !== -1) {
    return true;
  }
  let commentIndex = serialized.indexOf('comment');
  let lineIndex = commentIndex === -1 ? -1 : serialized.indexOf('line', commentIndex);
  return lineIndex !== -1 && hasLongDigitRun(serialized.slice(lineIndex));
}

function hasLongDigitRun(value: string): boolean {
  let runLength = 0;
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      runLength += 1;
      if (runLength >= 10) {
        return true;
      }
      continue;
    }
    runLength = 0;
  }
  return false;
}

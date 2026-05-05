import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { rewriteMirrorFrontmatterTags } from '../../../__parts__/obsidian-mirror-daemon-indexes.mjs';
import {
  collectAllFindings,
  SOURCE_MIRROR_DIR,
  PULSE_CURRENT_DIR,
  PULSE_PARITY_GAPS_PATH,
  PULSE_STRUCTURAL_GRAPH_PATH,
  severityScore,
} from './core.mjs';

// ── sidecar I/O ────────────────────────────────────────────────────────────

export function sidecarAbsPathForFile(repoRelativeFile) {
  const rel = repoRelativeFile.replace(/\\/g, '/');
  return join(SOURCE_MIRROR_DIR, rel + '.findings.json');
}

export function readSidecar(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, 'utf8'));
  } catch {
    return null;
  }
}

export function recomputeSidecarStats(findingsArray) {
  if (!Array.isArray(findingsArray) || findingsArray.length === 0) return null;

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  let dominant = 'low';
  const categories = new Set();

  for (const f of findingsArray) {
    const s = f.severity || 'low';
    severityCounts[s] = (severityCounts[s] || 0) + 1;
    if (f.category) categories.add(f.category);

    if (severityScore(s) < severityScore(dominant)) {
      dominant = s;
    }
  }

  return {
    count: findingsArray.length,
    dominantSeverity: dominant,
    severityCounts,
    categories: [...categories].sort(),
  };
}

export function writeSidecarAtomic(absPath, sidecarObj) {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = absPath + '.tmp';
  writeFileSync(tmp, JSON.stringify(sidecarObj, null, 2) + '\n');
  renameSync(tmp, absPath);
}

// ── mirror tag helpers ─────────────────────────────────────────────────────

const SEVERITY_TAGS = {
  critical: 'findings/severity-critical',
  high: 'findings/severity-high',
  medium: 'findings/severity-medium',
  low: 'findings/severity-low',
};

const SEVERITY_TAG_PREFIX = 'findings/severity-';

function readMirrorTags(relMirror) {
  const fullPath = join(SOURCE_MIRROR_DIR, relMirror);
  if (!existsSync(fullPath)) return null;
  const content = readFileSync(fullPath, 'utf8');
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

export function refreshMirrorSeverityTag(relMirror, dominantSeverity) {
  if (!relMirror || !dominantSeverity) return false;
  const sevTag = SEVERITY_TAGS[dominantSeverity];
  if (!sevTag) return false;

  const existing = readMirrorTags(relMirror);
  if (existing === null) return false;

  const merged = existing.filter((t) => !t.startsWith(SEVERITY_TAG_PREFIX));
  merged.push(sevTag);
  merged.sort();

  if (JSON.stringify(merged) === JSON.stringify(existing)) return false;

  return rewriteMirrorFrontmatterTags(relMirror, merged);
}

// ── orphan pulse sidecar cleanup ───────────────────────────────────────────

export function cleanOrphanPulseSidecars(currentFilesWithPulse) {
  let cleaned = 0;
  if (!existsSync(SOURCE_MIRROR_DIR)) return cleaned;

  const stack = [SOURCE_MIRROR_DIR];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith('.findings.json')) {
        try {
          const sc = JSON.parse(readFileSync(p, 'utf8'));
          if (!sc.schema || !Array.isArray(sc.findings)) continue;

          const pulseCount = sc.findings.filter((f) => f.engine === 'pulse').length;
          if (pulseCount === 0) continue;

          if (currentFilesWithPulse && !currentFilesWithPulse.has(sc.file)) {
            const nonPulse = sc.findings.filter((f) => f.engine !== 'pulse');
            if (nonPulse.length === sc.findings.length) continue;

            if (nonPulse.length === 0) {
              try {
                unlinkSync(p);
              } catch {
                /* ignore */
              }
              cleaned++;
            } else {
              sc.findings = nonPulse;
              const stats = recomputeSidecarStats(nonPulse);
              if (stats) {
                sc.count = stats.count;
                sc.dominantSeverity = stats.dominantSeverity;
                sc.severityCounts = stats.severityCounts;
                sc.categories = stats.categories;
                sc.generatedAt = new Date().toISOString();
              }
              writeSidecarAtomic(p, sc);
              cleaned++;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return cleaned;
}

// ── MAIN ───────────────────────────────────────────────────────────────────

export function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const summaryOnly = args.includes('--summary');

  if (!existsSync(PULSE_PARITY_GAPS_PATH) && !existsSync(PULSE_STRUCTURAL_GRAPH_PATH)) {
    process.stderr.write(
      JSON.stringify({
        error: 'No PULSE output found',
        expectedDir: PULSE_CURRENT_DIR,
      }) + '\n',
    );
    process.exit(2);
  }

  // 1) Collect all findings
  const allFindings = collectAllFindings();

  // --- summary mode: markdown table to stdout, JSON to stderr ---
  if (summaryOnly) {
    const signalsByKind = {};
    for (const f of allFindings) {
      signalsByKind[f.rule] = (signalsByKind[f.rule] || 0) + 1;
    }

    console.log('| Rule | Count | Severity |');
    console.log('|------|-------|----------|');
    for (const [rule, count] of Object.entries(signalsByKind).sort((a, b) => b[1] - a[1])) {
      const sevs = {};
      for (const f of allFindings.filter((x) => x.rule === rule)) {
        sevs[f.severity] = (sevs[f.severity] || 0) + 1;
      }
      const domSev = Object.entries(sevs).sort((a, b) => b[1] - a[1])[0]?.[0] || '?';
      console.log(`| ${rule} | ${count} | ${domSev} |`);
    }
    console.log(`\n| **Total** | **${allFindings.length}** | |`);

    const stderrSummary = {
      filesScanned: new Set(allFindings.map((f) => f.file).filter(Boolean)).size,
      signalsByKind,
    };
    process.stderr.write(JSON.stringify(stderrSummary) + '\n');
    return;
  }

  // 2) Group findings by file
  const findingsByFile = new Map();
  const filelessFindings = [];

  for (const finding of allFindings) {
    if (!finding.file) {
      filelessFindings.push(finding);
    } else {
      const list = findingsByFile.get(finding.file) || [];
      list.push(finding);
      findingsByFile.set(finding.file, list);
    }
  }

  // 3) Process each file: merge into sidecars
  let sidecarsTouched = 0;
  let mirrorsTouched = 0;
  let filesWithNewFindings = 0;
  const signalsByKind = {};
  const filesWithPulse = new Set();

  for (const finding of allFindings) {
    signalsByKind[finding.rule] = (signalsByKind[finding.rule] || 0) + 1;
    if (finding.file) filesWithPulse.add(finding.file);
  }

  for (const [repoRelFile, pulseFindings] of findingsByFile) {
    const absSidecar = sidecarAbsPathForFile(repoRelFile);
    const existing = readSidecar(absSidecar);

    let allFileFindings = [];

    if (existing && existing.schema === 'kloel.findings.v1') {
      const nonPulse = (existing.findings || []).filter((f) => f.engine !== 'pulse');
      allFileFindings.push(...nonPulse);
    }

    const pulseEntries = pulseFindings.map((f) => ({
      line: f.line,
      column: f.column,
      category: f.category,
      severity: f.severity,
      engine: 'pulse',
      rule: f.rule,
      message: f.message,
      fingerprint: f.fingerprint,
    }));
    allFileFindings.push(...pulseEntries);

    const stats = recomputeSidecarStats(allFileFindings);
    if (!stats) {
      if (existing && !dry) {
        try {
          unlinkSync(absSidecar);
        } catch {
          // ignore
        }
      }
      continue;
    }

    const sidecar = {
      schema: 'kloel.findings.v1',
      file: repoRelFile,
      generatedAt: new Date().toISOString(),
      count: stats.count,
      dominantSeverity: stats.dominantSeverity,
      severityCounts: stats.severityCounts,
      categories: stats.categories,
      findings: allFileFindings,
    };

    if (!dry) {
      writeSidecarAtomic(absSidecar, sidecar);
    }
    sidecarsTouched++;
    filesWithNewFindings++;

    // Refresh severity tag on mirror .md
    const relMirror = repoRelFile.replace(/\\/g, '/') + '.md';
    const mirrorAbs = join(SOURCE_MIRROR_DIR, relMirror);
    if (existsSync(mirrorAbs)) {
      if (!dry) {
        const changed = refreshMirrorSeverityTag(relMirror, stats.dominantSeverity);
        if (changed) mirrorsTouched++;
      } else {
        const existingTags = readMirrorTags(relMirror);
        const sevTag = SEVERITY_TAGS[stats.dominantSeverity];
        if (existingTags && sevTag && !existingTags.includes(sevTag)) {
          mirrorsTouched++;
        }
      }
    }
  }

  // 4) Clean up stale pulse sidecars (files no longer in pulse findings)
  if (!dry) {
    const orphanCleaned = cleanOrphanPulseSidecars(filesWithPulse);
    if (orphanCleaned > 0) {
      sidecarsTouched += orphanCleaned;
    }
  }

  // 5) Emit summary
  const summary = {
    filesScanned: filesWithPulse.size,
    signalsByKind,
    sidecarsTouched,
    mirrorsTouched,
    filesWithNewFindings,
    filelessFindingsCount: filelessFindings.length,
  };
  process.stderr.write(JSON.stringify(summary) + '\n');
}

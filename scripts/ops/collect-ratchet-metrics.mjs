#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectMadgeCycles } from './check-madge-cycles.mjs';
import { collectKnipIssues } from './collect-knip-issues.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const pulseHealthPath = path.join(repoRoot, 'PULSE_HEALTH.json');
const pulseCertificatePath = path.join(repoRoot, 'PULSE_CERTIFICATE.json');
const pulseCodacyStatePath = path.join(repoRoot, 'PULSE_CODACY_STATE.json');
const ratchetBaselinePath = path.join(repoRoot, 'ratchet.json');

const CODE_PATHS = ['backend/src', 'frontend/src', 'worker', 'scripts'];
const PRODUCT_CODE_PATHS = ['backend/src', 'frontend/src', 'worker'];
const FRONTEND_PATHS = ['frontend/src'];
const LINE_COUNT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.prisma',
]);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const STYLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']);
const COMMENT_ONLY_RE = /^\s*(?:\/\/|\/\*|\*|\*\/)/;
const EXPLICIT_ANY_PATTERNS = [
  /\bas\s+any\b/g,
  /:\s*any\b/g,
  /<\s*any\s*>/g,
  /\bArray<\s*any\s*>\b/g,
  /\bPromise<\s*any\s*>\b/g,
  /\bRecord<[^>\n]+,\s*any\s*>\b/g,
  /\bMap<[^>\n]+,\s*any\s*>\b/g,
  /\bSet<\s*any\s*>\b/g,
  /\bany\[\]/g,
  /[,(]\s*any\b/g,
];
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const TAILWIND_FONT_RE = /\btext-(xs|sm)\b|text-\[(\d{1,2})px\]/g;
const CSS_FONT_RE = /font-size\s*:\s*['"`]?(\d{1,2})px/gi;
const INLINE_FONT_RE = /fontSize\s*:\s*['"`]?(\d{1,2})px/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CHAT_FILE_HINT_RE =
  /(chat|inbox|conversation|composer|assistant|thread|onboarding-chat|kloel-message|kloel-chat)/i;
const AI_SPEECH_PATTERNS = [
  /Entendendo sua/i,
  /Redigindo a resposta/i,
  /Processando sua/i,
  /Executando a ferramenta/i,
  /Integrando o resultado/i,
  /Consolidando os resultados/i,
  /Reprocessando esta/i,
  /Resposta pronta/i,
  /reunindo o contexto/i,
  /Avaliando se precisa/i,
];
const ALLOWED_HEX_COLORS = new Set([
  '#0A0A0A',
  '#0A0A0C',
  '#0F0F0F',
  '#141414',
  '#1A1A1A',
  '#212121',
  '#262626',
  '#111113',
  '#19191C',
  '#222226',
  '#333338',
  '#E0DDD8',
  '#6E6E73',
  '#3A3A3F',
  '#E85D30',
  '#F5F5F5',
]);
const DEAD_CODE_BREAK_TYPES = new Set(['DEAD_EXPORT', 'DEAD_COMPONENT']);
const CIRCULAR_BREAK_TYPES = new Set(['CIRCULAR_IMPORT', 'CIRCULAR_MODULE_DEPENDENCY']);
const ANTI_HARDCODE_BREAK_TYPES = new Set(['AI_PSEUDO_THINKING_HARDCODED']);
const VISUAL_CONTRACT_BREAK_TYPES = new Set([
  'VISUAL_CONTRACT_FONT_BELOW_MIN',
  'VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS',
  'VISUAL_CONTRACT_EMOJI_UI',
  'VISUAL_CONTRACT_GENERIC_SPINNER',
]);
const IGNORED_TRACKED_SEGMENTS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '__tests__',
  '__mocks__',
  'test',
]);

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getTrackedFiles(prefixes, allowedExtensions) {
  const args = ['ls-files', ...prefixes];
  return runGit(args)
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((relPath) => existsSync(path.join(repoRoot, relPath)))
    .filter((relPath) => !shouldIgnoreTrackedFile(relPath))
    .filter((relPath) => allowedExtensions.has(path.extname(relPath)));
}

function shouldIgnoreTrackedFile(relPath) {
  if (/\.(spec|test)\.[jt]sx?$/.test(relPath)) {
    return true;
  }

  const segments = relPath.split(/[\\/]/);
  return segments.some((segment) => IGNORED_TRACKED_SEGMENTS.has(segment));
}

function readLines(relPath) {
  return readFileSync(path.join(repoRoot, relPath), 'utf8').split('\n');
}

function countRegexMatches(value, regex) {
  const matches = value.match(regex);
  return matches ? matches.length : 0;
}

function normalizedHex(value) {
  return value.toUpperCase();
}

function sampleEntry(file, line, content, extra = {}) {
  return {
    file,
    line,
    content: content.trim().slice(0, 240),
    ...extra,
  };
}

function createMetric(value, comparator, samples = [], extra = {}) {
  return {
    value,
    comparator,
    samples: samples.slice(0, 20),
    ...extra,
  };
}

function countExplicitAnyMetrics(files) {
  let total = 0;
  let prismaTotal = 0;
  const samples = [];
  const prismaSamples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      if (COMMENT_ONLY_RE.test(line)) return;

      let lineCount = 0;
      for (const pattern of EXPLICIT_ANY_PATTERNS) {
        lineCount += countRegexMatches(line, pattern);
      }

      if (lineCount === 0) return;
      total += lineCount;
      if (samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line));
      }

      if (/(prisma|prismaAny|Prisma)/.test(line)) {
        prismaTotal += lineCount;
        if (prismaSamples.length < 20) {
          prismaSamples.push(sampleEntry(relPath, index + 1, line));
        }
      }
    });
  }

  return {
    any: createMetric(total, 'max', samples),
    prismaAny: createMetric(prismaTotal, 'max', prismaSamples),
  };
}

function countLiteralMatches(files, regex, comparator = 'max') {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      if (COMMENT_ONLY_RE.test(line)) return;
      const matches = countRegexMatches(line, regex);
      if (matches === 0) return;
      total += matches;
      if (samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line));
      }
    });
  }

  return createMetric(total, comparator, samples);
}

function countCommentDirective(files, directive) {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      if (!directive.test(line)) return;
      if (!/(\/\/|\/\*|\*\/|\{\/\*|\* )/.test(line)) return;
      total += 1;
      if (samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line));
      }
    });
  }

  return createMetric(total, 'max', samples);
}

function countHardcodedAiSpeech(files) {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      const matched = AI_SPEECH_PATTERNS.some((pattern) => pattern.test(line));
      if (!matched) return;
      total += 1;
      if (samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line));
      }
    });
  }

  return createMetric(total, 'max', samples);
}

function countEmojiOccurrences(files) {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      if (COMMENT_ONLY_RE.test(line)) return;
      const sanitizedLine = line.replace(/\/\/.*$/, '');
      if (!/['"`<>]/.test(sanitizedLine)) return;
      const matches = sanitizedLine.match(EMOJI_RE);
      if (!matches || matches.length === 0) return;
      total += matches.length;
      if (samples.length < 20) {
        samples.push(
          sampleEntry(relPath, index + 1, sanitizedLine, { matches: matches.join(' ') }),
        );
      }
    });
  }

  return createMetric(total, 'max', samples);
}

function countHardcodedHexColors(files) {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      const matches = line.match(HEX_COLOR_RE) || [];
      const violating = matches.filter((match) => !ALLOWED_HEX_COLORS.has(normalizedHex(match)));
      if (violating.length === 0) return;
      total += violating.length;
      if (samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line, { matches: violating }));
      }
    });
  }

  return createMetric(total, 'max', samples);
}

function countChatFontsBelow16(files) {
  let total = 0;
  const samples = [];

  for (const relPath of files) {
    if (!CHAT_FILE_HINT_RE.test(relPath)) continue;

    const lines = readLines(relPath);
    lines.forEach((line, index) => {
      let lineMatched = false;
      for (const match of line.matchAll(TAILWIND_FONT_RE)) {
        const size = match[1] === 'xs' ? 12 : match[1] === 'sm' ? 14 : Number(match[2]);
        if (Number.isFinite(size) && size < 16) {
          total += 1;
          lineMatched = true;
        }
      }

      for (const match of line.matchAll(CSS_FONT_RE)) {
        const size = Number(match[1]);
        if (Number.isFinite(size) && size < 16) {
          total += 1;
          lineMatched = true;
        }
      }

      for (const match of line.matchAll(INLINE_FONT_RE)) {
        const size = Number(match[1]);
        if (Number.isFinite(size) && size < 16) {
          total += 1;
          lineMatched = true;
        }
      }

      if (lineMatched && samples.length < 20) {
        samples.push(sampleEntry(relPath, index + 1, line));
      }
    });
  }

  return createMetric(total, 'max', samples);
}

function countFilesOverLimit(files, maxLines) {
  const samples = [];
  let total = 0;

  for (const relPath of files) {
    const lineCount = readLines(relPath).length;
    if (lineCount <= maxLines) continue;
    total += 1;
    if (samples.length < 20) {
      samples.push({ file: relPath, lines: lineCount });
    }
  }

  return createMetric(total, 'max', samples, { limit: maxLines });
}

function ensurePulseArtifacts({ refreshPulse = false, ciSafeMode = false } = {}) {
  if (!refreshPulse && existsSync(pulseHealthPath) && existsSync(pulseCertificatePath)) {
    return true;
  }

  if (ciSafeMode) {
    return false;
  }

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, 'scripts', 'pulse', 'run.js'), '--report'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PULSE_EXECUTION_TRACE_PATH:
          process.env.PULSE_EXECUTION_TRACE_PATH ||
          path.join(repoRoot, 'PULSE_EXECUTION_TRACE.json'),
      },
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `PULSE refresh failed with exit code ${result.status ?? 1}.\n${result.stdout || ''}\n${result.stderr || ''}`.trim(),
    );
  }

  return true;
}

function readPulseArtifacts() {
  const health = JSON.parse(readFileSync(pulseHealthPath, 'utf8'));
  const certificate = JSON.parse(readFileSync(pulseCertificatePath, 'utf8'));
  return { health, certificate };
}

function collectPulseMetrics({ refreshPulse = false } = {}) {
  const artifactsReady = ensurePulseArtifacts({
    refreshPulse,
    ciSafeMode: !refreshPulse && process.env.CI === 'true',
  });

  if (!artifactsReady) {
    const baseline = readRatchetBaseline();
    return {
      pulseScore: createMetric(Number(baseline.pulse_score_min || 0), 'min', [], {
        rawScore: null,
        environment: 'ci-baseline-fallback',
        fallback: 'ratchet.json',
      }),
      facadeCount: createMetric(Number(baseline.facade_count_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      deadCodeFiles: createMetric(Number(baseline.dead_code_files_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      orphanPrismaModels: createMetric(Number(baseline.orphan_prisma_models_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      circularImports: createMetric(Number(baseline.circular_imports_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      antiHardcodeBreaks: createMetric(Number(baseline.anti_hardcode_breaks_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      visualContractBreaks: createMetric(
        Number(baseline.visual_contract_breaks_max || 0),
        'max',
        [],
        { fallback: 'ratchet.json' },
      ),
      browserStressPassRate: createMetric(
        Number(baseline.browser_stress_pass_rate_min || 0),
        'min',
        [],
        {
          executed: false,
          fallback: 'ratchet.json',
        },
      ),
    };
  }

  const { health, certificate } = readPulseArtifacts();
  const deadCodeFiles = [
    ...new Set(
      (health.breaks || [])
        .filter((item) => DEAD_CODE_BREAK_TYPES.has(item.type))
        .map((item) => item.file),
    ),
  ];
  const circularBreaks = (health.breaks || []).filter((item) =>
    CIRCULAR_BREAK_TYPES.has(item.type),
  );
  const antiHardcodeBreaks = (health.breaks || []).filter((item) =>
    ANTI_HARDCODE_BREAK_TYPES.has(item.type),
  );
  const visualContractBreaks = (health.breaks || []).filter((item) =>
    VISUAL_CONTRACT_BREAK_TYPES.has(item.type),
  );

  return {
    pulseScore: createMetric(Number(certificate.score || 0), 'min', [], {
      rawScore: Number(certificate.rawScore || 0),
      environment: certificate.environment || 'unknown',
    }),
    facadeCount: createMetric(Number(health.stats?.facades || 0), 'max'),
    deadCodeFiles: createMetric(
      deadCodeFiles.length,
      'max',
      deadCodeFiles.slice(0, 20).map((file) => ({ file })),
    ),
    orphanPrismaModels: createMetric(Number(health.stats?.modelOrphans || 0), 'max'),
    circularImports: createMetric(
      circularBreaks.length,
      'max',
      circularBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    antiHardcodeBreaks: createMetric(
      antiHardcodeBreaks.length,
      'max',
      antiHardcodeBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    visualContractBreaks: createMetric(
      visualContractBreaks.length,
      'max',
      visualContractBreaks.slice(0, 20).map((item) => ({
        file: item.file,
        line: item.line,
        content: item.description,
      })),
    ),
    browserStressPassRate: createMetric(
      Number(certificate.evidenceSummary?.browser?.passRate || 0),
      'min',
      [],
      {
        executed: Boolean(certificate.evidenceSummary?.browser?.executed),
      },
    ),
  };
}

function collectCodacyMetrics() {
  // PULSE_CODACY_STATE.json is produced by scripts/ops/sync-codacy-issues.mjs
  // on the nightly workflow (and on-demand locally). It is the source of
  // truth for Codacy-reported issue counts because the Codacy REST API is
  // rate-limited and intermittently reports stale totals; we only ever read
  // the committed snapshot here so ratchet checks are deterministic.
  if (!existsSync(pulseCodacyStatePath)) {
    const fallback = readRatchetBaseline();
    return {
      total: createMetric(Number(fallback.codacy_total_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
        reason: 'PULSE_CODACY_STATE.json missing',
      }),
      high: createMetric(Number(fallback.codacy_high_severity_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      medium: createMetric(Number(fallback.codacy_medium_severity_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(pulseCodacyStatePath, 'utf8'));
    const total = Number(parsed.totalIssues || 0);
    const bySeverity = parsed.bySeverity || {};
    const topFiles = Array.isArray(parsed.topFiles) ? parsed.topFiles : [];
    const topFileSamples = topFiles.slice(0, 20).map((entry) => ({
      file: entry.file,
      lines: entry.count,
    }));
    return {
      total: createMetric(total, 'max', topFileSamples, {
        syncedAt: parsed.syncedAt || null,
        apiTotal: parsed.totalIssuesFromApi ?? null,
      }),
      high: createMetric(Number(bySeverity.HIGH || 0), 'max'),
      medium: createMetric(Number(bySeverity.MEDIUM || 0), 'max'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = readRatchetBaseline();
    return {
      total: createMetric(Number(fallback.codacy_total_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
        reason: `PULSE_CODACY_STATE.json invalid: ${message}`,
      }),
      high: createMetric(Number(fallback.codacy_high_severity_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
      medium: createMetric(Number(fallback.codacy_medium_severity_issues_max || 0), 'max', [], {
        fallback: 'ratchet.json',
      }),
    };
  }
}

function readRatchetBaseline() {
  if (!existsSync(ratchetBaselinePath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(ratchetBaselinePath, 'utf8'));
    return parsed?.ratchet || {};
  } catch {
    return {};
  }
}

export function collectRatchetMetrics(options = {}) {
  const codeFiles = getTrackedFiles(CODE_PATHS, SOURCE_EXTENSIONS);
  const productFiles = getTrackedFiles(PRODUCT_CODE_PATHS, SOURCE_EXTENSIONS);
  const frontendFiles = getTrackedFiles(FRONTEND_PATHS, STYLE_EXTENSIONS);
  const lineCountFiles = getTrackedFiles([...CODE_PATHS, 'backend/prisma'], LINE_COUNT_EXTENSIONS);

  const anyMetrics = countExplicitAnyMetrics(codeFiles);
  const tsIgnoreMetric = countCommentDirective(codeFiles, /@ts-ignore\b/);
  const eslintDisableMetric = countCommentDirective(
    codeFiles,
    /eslint-disable(?:-next-line|-line)?\b/,
  );
  const hardcodedAiSpeechMetric = countHardcodedAiSpeech(productFiles);
  const emojiMetric = countEmojiOccurrences(productFiles);
  const hardcodedHexMetric = countHardcodedHexColors(frontendFiles);
  const chatFontMetric = countChatFontsBelow16(frontendFiles);
  const oversizedFilesMetric = countFilesOverLimit(lineCountFiles, 800);
  const pulseMetrics = collectPulseMetrics(options);
  const knipMetrics = collectKnipIssues();
  const madgeMetrics = collectMadgeCycles();
  const codacyMetrics = collectCodacyMetrics();

  return {
    generatedAt: new Date().toISOString(),
    source: 'scripts/ops/collect-ratchet-metrics.mjs',
    ratchet: {
      pulse_score_min: pulseMetrics.pulseScore.value,
      any_count_max: anyMetrics.any.value,
      prisma_any_max: anyMetrics.prismaAny.value,
      ts_ignore_max: tsIgnoreMetric.value,
      eslint_disable_max: eslintDisableMetric.value,
      hardcoded_ai_speech_max: hardcodedAiSpeechMetric.value,
      emoji_in_prompts_max: emojiMetric.value,
      hardcoded_hex_outside_tokens_max: hardcodedHexMetric.value,
      font_below_16px_in_chat_max: chatFontMetric.value,
      files_over_800_lines_max: oversizedFilesMetric.value,
      facade_count_max: pulseMetrics.facadeCount.value,
      dead_code_files_max: pulseMetrics.deadCodeFiles.value,
      orphan_prisma_models_max: pulseMetrics.orphanPrismaModels.value,
      circular_imports_max: pulseMetrics.circularImports.value,
      knip_issues_max: knipMetrics.totalIssues,
      madge_cycles_max: madgeMetrics.totalCycles,
      anti_hardcode_breaks_max: pulseMetrics.antiHardcodeBreaks.value,
      visual_contract_breaks_max: pulseMetrics.visualContractBreaks.value,
      browser_stress_pass_rate_min: pulseMetrics.browserStressPassRate.value,
      codacy_total_issues_max: codacyMetrics.total.value,
      codacy_high_severity_issues_max: codacyMetrics.high.value,
      codacy_medium_severity_issues_max: codacyMetrics.medium.value,
    },
    details: {
      pulse_score_min: pulseMetrics.pulseScore,
      any_count_max: anyMetrics.any,
      prisma_any_max: anyMetrics.prismaAny,
      ts_ignore_max: tsIgnoreMetric,
      eslint_disable_max: eslintDisableMetric,
      hardcoded_ai_speech_max: hardcodedAiSpeechMetric,
      emoji_in_prompts_max: emojiMetric,
      hardcoded_hex_outside_tokens_max: hardcodedHexMetric,
      font_below_16px_in_chat_max: chatFontMetric,
      files_over_800_lines_max: oversizedFilesMetric,
      facade_count_max: pulseMetrics.facadeCount,
      dead_code_files_max: pulseMetrics.deadCodeFiles,
      orphan_prisma_models_max: pulseMetrics.orphanPrismaModels,
      circular_imports_max: pulseMetrics.circularImports,
      knip_issues_max: createMetric(
        knipMetrics.totalIssues,
        'max',
        knipMetrics.issues.slice(0, 20).map((issue) => ({
          file: issue.file || `${issue.workspace}:${issue.type}`,
          content: [issue.workspace, issue.type, issue.symbol].filter(Boolean).join(' :: '),
        })),
        {
          workspaceCounts: knipMetrics.issues.reduce((acc, issue) => {
            acc[issue.workspace || 'root'] = (acc[issue.workspace || 'root'] || 0) + 1;
            return acc;
          }, {}),
        },
      ),
      madge_cycles_max: createMetric(
        madgeMetrics.totalCycles,
        'max',
        madgeMetrics.results.flatMap((result) =>
          result.cycles.slice(0, 10).map((cycle) => ({
            file: result.workspace,
            content: cycle.join(' -> '),
          })),
        ),
        {
          workspaceCounts: madgeMetrics.results.reduce((acc, result) => {
            acc[result.workspace] = result.cycles.length;
            return acc;
          }, {}),
        },
      ),
      anti_hardcode_breaks_max: pulseMetrics.antiHardcodeBreaks,
      visual_contract_breaks_max: pulseMetrics.visualContractBreaks,
      browser_stress_pass_rate_min: pulseMetrics.browserStressPassRate,
      codacy_total_issues_max: codacyMetrics.total,
      codacy_high_severity_issues_max: codacyMetrics.high,
      codacy_medium_severity_issues_max: codacyMetrics.medium,
    },
    inputs: {
      pulseHealthPath: path.relative(repoRoot, pulseHealthPath),
      pulseCertificatePath: path.relative(repoRoot, pulseCertificatePath),
      pulseHealthMtime: existsSync(pulseHealthPath)
        ? statSync(pulseHealthPath).mtime.toISOString()
        : null,
      pulseCertificateMtime: existsSync(pulseCertificatePath)
        ? statSync(pulseCertificatePath).mtime.toISOString()
        : null,
      codeFilesScanned: codeFiles.length,
      frontendFilesScanned: frontendFiles.length,
      productFilesScanned: productFiles.length,
    },
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const measurement = collectRatchetMetrics({
    refreshPulse: args.has('--refresh-pulse'),
  });
  console.log(JSON.stringify(measurement, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`[ratchet] ${error?.message || String(error)}`);
    process.exit(1);
  }
}

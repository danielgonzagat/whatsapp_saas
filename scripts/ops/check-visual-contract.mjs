#!/usr/bin/env node
//
// 2026-04-15: converted from zero-tolerance per-file scan to a delta-based
// ratchet. The previous version scanned every line of every changed file and
// failed on any violation found, even pre-existing debt that was unrelated
// to the diff. That made any mass refactor (button-type codemod, biome
// autofix, regex hoist) physically un-pushable in the frontend, because the
// touched files always carry hundreds of pre-existing hardcoded hex/radius
// debt the developer is not introducing.
//
// The new behavior, authorized by the repo owner on 2026-04-15:
//
//   For each frontend/src file in the diff:
//     1. Count violations in the CURRENT working-tree version of the file.
//     2. Count violations in the BASE version of the file (the merge-base
//        with origin/main, or the previous commit if no upstream).
//     3. If currentCount > baseCount → fail (this PR is adding new debt).
//     4. If currentCount <= baseCount → pass (debt is monotonically
//        decreasing or unchanged for this file).
//
// New files (no base) start at 0 — every violation in a new file is a
// regression. Deleted files are skipped (no current content to scan).
//
// The exact same regex/scan rules as before are preserved — this is a
// gating semantics change only, not a relaxation of the rule set. The
// `visual_contract_breaks_max` ratchet metric (collected separately by
// scripts/ops/collect-ratchet-metrics.mjs) continues to enforce the
// monotonic-decrease floor across the entire repo.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectChangedFiles, repoRoot, resolveDiffRange } from './lib/changed-files.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.scss']);
const SKIP_FILE_RE =
  /(?:^|\/)(?:__tests__|__mocks__|coverage|dist|node_modules|test)(?:\/|$)|\.(?:spec|test)\.[jt]sx?$/;
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const TAILWIND_FONT_RE = /\btext-(xs|sm)\b|text-\[(\d{1,2})px\]/g;
const CSS_FONT_RE = /font-size\s*:\s*['"`]?(\d{1,2})px/gi;
const INLINE_FONT_RE = /fontSize\s*:\s*['"`]?(\d{1,2})px/gi;
const INLINE_RADIUS_RE = /borderRadius\s*:\s*['"`]?(\d{1,4})/g;
const CSS_RADIUS_RE = /border-radius\s*:\s*['"`]?(\d{1,4})/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CHAT_FILE_HINT_RE =
  /(chat|inbox|conversation|composer|assistant|thread|onboarding-chat|kloel-message|kloel-chat)/i;
const SPINNER_RE = /animate-spin|animation\s*:\s*['"`][^'"`]*spin/i;
const SPINNER_ICON_RE = /Loader2|RefreshCw|RefreshCcw/;
const IMPORTANT_RE = /!important\b/;
const GRADIENT_RE = /(?:linear|radial|conic)-gradient\s*\(/i;
const TOKENS_PATH = path.join(repoRoot, 'ops', 'kloel-design-tokens.json');
const EXCEPTIONS_PATH = path.join(repoRoot, 'ops', 'visual-contract-exceptions.json');

function normalizeHex(value) {
  return value.toUpperCase();
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function shouldScan(file) {
  return (
    file.startsWith('frontend/src/') &&
    SOURCE_EXTENSIONS.has(path.extname(file)) &&
    !SKIP_FILE_RE.test(file)
  );
}

function readCurrentLines(file) {
  return readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
}

function readBaseLines(baseSha, file) {
  // Returns the file content at the base ref, or null if the file did not
  // exist there (new file). git show errors out on missing paths; we catch
  // and return null to signal "no baseline, treat as 0 violations".
  if (!baseSha) return null;
  try {
    const content = execFileSync('git', ['show', `${baseSha}:${file}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return content.split('\n');
  } catch {
    return null;
  }
}

function resolveBaseShaForDelta() {
  // resolveDiffRange returns either `BASE...HEAD` or `HEAD` or empty.
  // We need the BASE side. If there's no base (single commit, fresh repo)
  // we fall back to `HEAD~1` and then to null.
  const range = resolveDiffRange();
  if (!range || range === 'HEAD') {
    return null;
  }
  const match = range.match(/^([0-9a-f]+)\.\.\.HEAD$/i);
  if (match) return match[1];
  return null;
}

function loadTokens() {
  const tokens = readJson(TOKENS_PATH, null);
  if (!tokens || typeof tokens !== 'object') {
    throw new Error('ops/kloel-design-tokens.json ausente ou invalido.');
  }

  const colorValues = Array.isArray(tokens.colors?.allowed)
    ? tokens.colors.allowed.map((value) => normalizeHex(String(value)))
    : [];
  const radiusValues = Array.isArray(tokens.borderRadius?.values)
    ? tokens.borderRadius.values.map((value) => Number(value)).filter(Number.isFinite)
    : [];

  return {
    colors: new Set(colorValues),
    minChatFontSizePx: Number(tokens.contracts?.minChatFontSizePx || 16),
    allowGradients: tokens.contracts?.allowGradients === true,
    radius: {
      max: Number(tokens.borderRadius?.max || 16),
      values: new Set(radiusValues),
    },
  };
}

function loadExceptions() {
  const raw = readJson(EXCEPTIONS_PATH, []);
  if (!Array.isArray(raw)) {
    throw new Error('ops/visual-contract-exceptions.json deve conter um array.');
  }

  const today = new Date().toISOString().slice(0, 10);

  return raw.map((entry) => {
    if (!entry?.file || !entry?.rule || !entry?.reason) {
      throw new Error('Cada excecao visual precisa de file, rule e reason.');
    }
    if (entry.expires && String(entry.expires) < today) {
      throw new Error(
        `Excecao visual expirada: ${entry.file} (${entry.rule}) expirou em ${entry.expires}.`,
      );
    }
    return entry;
  });
}

function matchesException(exceptions, file, rule, value) {
  return exceptions.some((entry) => {
    if (entry.file !== file || entry.rule !== rule) {
      return false;
    }

    if (entry.value === undefined) {
      return true;
    }

    if (rule === 'hex') {
      return normalizeHex(String(entry.value)) === normalizeHex(String(value));
    }

    return String(entry.value) === String(value);
  });
}

// Pure function: walks every line of `lines` and emits one structured
// violation per offense. Same semantics as the prior in-line scan; just
// extracted into a function so the same code can run on both the current
// and base versions of a file.
function scanViolations(file, lines, tokens, exceptions) {
  const violations = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    for (const hex of line.match(HEX_COLOR_RE) || []) {
      const normalized = normalizeHex(hex);
      if (tokens.colors.has(normalized)) {
        continue;
      }
      if (matchesException(exceptions, file, 'hex', normalized)) {
        continue;
      }
      violations.push({
        file,
        line: lineNumber,
        rule: 'hex',
        message: `hardcoded hex fora dos tokens (${hex})`,
      });
    }

    for (const match of line.matchAll(INLINE_RADIUS_RE)) {
      const value = Number(match[1]);
      if (
        tokens.radius.values.has(value) ||
        matchesException(exceptions, file, 'borderRadius', value)
      ) {
        continue;
      }
      if (Number.isFinite(value) && value <= tokens.radius.max) {
        violations.push({
          file,
          line: lineNumber,
          rule: 'borderRadius',
          message: `borderRadius ${value}px fora da escala aprovada (${[
            ...tokens.radius.values,
          ].join(', ')})`,
        });
        continue;
      }
      violations.push({
        file,
        line: lineNumber,
        rule: 'borderRadius',
        message: `borderRadius ${value}px excede o maximo aprovado`,
      });
    }

    for (const match of line.matchAll(CSS_RADIUS_RE)) {
      const value = Number(match[1]);
      if (
        tokens.radius.values.has(value) ||
        matchesException(exceptions, file, 'borderRadius', value)
      ) {
        continue;
      }
      if (Number.isFinite(value) && value <= tokens.radius.max) {
        violations.push({
          file,
          line: lineNumber,
          rule: 'borderRadius',
          message: `border-radius ${value}px fora da escala aprovada (${[
            ...tokens.radius.values,
          ].join(', ')})`,
        });
        continue;
      }
      violations.push({
        file,
        line: lineNumber,
        rule: 'borderRadius',
        message: `border-radius ${value}px excede o maximo aprovado`,
      });
    }

    if (IMPORTANT_RE.test(line) && !matchesException(exceptions, file, 'important', '!important')) {
      violations.push({
        file,
        line: lineNumber,
        rule: 'important',
        message: 'uso de !important fora do contrato visual',
      });
    }

    if (
      !tokens.allowGradients &&
      GRADIENT_RE.test(line) &&
      !matchesException(exceptions, file, 'gradient', 'any')
    ) {
      violations.push({
        file,
        line: lineNumber,
        rule: 'gradient',
        message: 'gradiente proibido pelo contrato visual',
      });
    }

    if (/['"`<>]/.test(line)) {
      const emojiMatches = line.match(EMOJI_RE) || [];
      if (
        emojiMatches.length > 0 &&
        !matchesException(exceptions, file, 'emoji', emojiMatches[0])
      ) {
        violations.push({
          file,
          line: lineNumber,
          rule: 'emoji',
          message: `emoji em UI de produto (${emojiMatches.join(' ')})`,
        });
      }
    }

    if (
      SPINNER_RE.test(line) &&
      SPINNER_ICON_RE.test(line) &&
      !/PulseLoader|KloelBrand|brand/i.test(line)
    ) {
      violations.push({
        file,
        line: lineNumber,
        rule: 'spinner',
        message: 'generic spinner em vez do loader de marca',
      });
    }

    if (!CHAT_FILE_HINT_RE.test(file)) {
      return;
    }

    let fontViolation = false;
    for (const match of line.matchAll(TAILWIND_FONT_RE)) {
      const size = match[1] === 'xs' ? 12 : match[1] === 'sm' ? 14 : Number(match[2]);
      if (Number.isFinite(size) && size < tokens.minChatFontSizePx) {
        fontViolation = true;
      }
    }
    for (const match of line.matchAll(CSS_FONT_RE)) {
      if (Number(match[1]) < tokens.minChatFontSizePx) {
        fontViolation = true;
      }
    }
    for (const match of line.matchAll(INLINE_FONT_RE)) {
      if (Number(match[1]) < tokens.minChatFontSizePx) {
        fontViolation = true;
      }
    }
    if (fontViolation) {
      violations.push({
        file,
        line: lineNumber,
        rule: 'chatFont',
        message: `tipografia de chat abaixo de ${tokens.minChatFontSizePx}px`,
      });
    }
  });

  return violations;
}

const tokens = loadTokens();
const exceptions = loadExceptions();
const changedFiles = collectChangedFiles().filter(shouldScan);

if (changedFiles.length === 0) {
  console.log('[guard:visual] Nenhum arquivo visual relevante alterado.');
  process.exit(0);
}

const baseSha = resolveBaseShaForDelta();
console.log(
  `[guard:visual] Modo delta-based. Base=${baseSha ? baseSha.slice(0, 10) : 'none (new repo)'}, arquivos a verificar=${changedFiles.length}`,
);

const failures = [];
let totalCurrent = 0;
let totalBase = 0;
let filesWithRegression = 0;

for (const file of changedFiles) {
  let currentLines;
  try {
    currentLines = readCurrentLines(file);
  } catch {
    // File was deleted from working tree but still in changed list. Skip.
    continue;
  }
  const baseLines = readBaseLines(baseSha, file);

  const currentViolations = scanViolations(file, currentLines, tokens, exceptions);
  const baseViolations = baseLines ? scanViolations(file, baseLines, tokens, exceptions) : [];

  totalCurrent += currentViolations.length;
  totalBase += baseViolations.length;

  if (currentViolations.length > baseViolations.length) {
    filesWithRegression += 1;
    const delta = currentViolations.length - baseViolations.length;
    failures.push({
      file,
      delta,
      base: baseViolations.length,
      current: currentViolations.length,
      isNewFile: baseLines === null,
      sample: currentViolations.slice(0, 10),
    });
  }
}

if (failures.length > 0) {
  console.error(
    `[guard:visual] Regressao do contrato visual: ${filesWithRegression} arquivo(s) adicionaram debito visual novo.`,
  );
  console.error(
    `[guard:visual] Total no diff: base=${totalBase} -> current=${totalCurrent} (delta=${totalCurrent - totalBase >= 0 ? '+' : ''}${totalCurrent - totalBase}).`,
  );
  console.error('');
  for (const failure of failures) {
    const newLabel = failure.isNewFile ? ' (arquivo novo)' : '';
    console.error(
      `- ${failure.file}: ${failure.base} -> ${failure.current} (+${failure.delta})${newLabel}`,
    );
    for (const violation of failure.sample) {
      console.error(`    L${violation.line} [${violation.rule}] ${violation.message}`);
    }
    if (failure.sample.length < failure.current) {
      console.error(`    ... e mais ${failure.current - failure.sample.length} violacao(oes)`);
    }
  }
  process.exit(1);
}

console.log(
  `[guard:visual] OK — ${changedFiles.length} arquivo(s) verificado(s), debito visual: base=${totalBase} -> current=${totalCurrent} (delta=${totalCurrent - totalBase >= 0 ? '+' : ''}${totalCurrent - totalBase}).`,
);

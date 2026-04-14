#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectChangedFiles, repoRoot } from './lib/changed-files.mjs';

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

function readLines(file) {
  return readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
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

const tokens = loadTokens();
const exceptions = loadExceptions();
const changedFiles = collectChangedFiles().filter(shouldScan);

if (changedFiles.length === 0) {
  console.log('[guard:visual] Nenhum arquivo visual relevante alterado.');
  process.exit(0);
}

const failures = [];

for (const file of changedFiles) {
  const lines = readLines(file);

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
      failures.push(`${file}:${lineNumber} hardcoded hex fora dos tokens (${hex})`);
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
        failures.push(
          `${file}:${lineNumber} borderRadius ${value}px fora da escala aprovada (${[
            ...tokens.radius.values,
          ].join(', ')})`,
        );
        continue;
      }
      failures.push(`${file}:${lineNumber} borderRadius ${value}px excede o maximo aprovado`);
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
        failures.push(
          `${file}:${lineNumber} border-radius ${value}px fora da escala aprovada (${[
            ...tokens.radius.values,
          ].join(', ')})`,
        );
        continue;
      }
      failures.push(`${file}:${lineNumber} border-radius ${value}px excede o maximo aprovado`);
    }

    if (IMPORTANT_RE.test(line) && !matchesException(exceptions, file, 'important', '!important')) {
      failures.push(`${file}:${lineNumber} uso de !important fora do contrato visual`);
    }

    if (
      !tokens.allowGradients &&
      GRADIENT_RE.test(line) &&
      !matchesException(exceptions, file, 'gradient', 'any')
    ) {
      failures.push(`${file}:${lineNumber} gradiente proibido pelo contrato visual`);
    }

    if (/['"`<>]/.test(line)) {
      const emojiMatches = line.match(EMOJI_RE) || [];
      if (
        emojiMatches.length > 0 &&
        !matchesException(exceptions, file, 'emoji', emojiMatches[0])
      ) {
        failures.push(`${file}:${lineNumber} emoji em UI de produto (${emojiMatches.join(' ')})`);
      }
    }

    if (
      SPINNER_RE.test(line) &&
      SPINNER_ICON_RE.test(line) &&
      !/PulseLoader|KloelBrand|brand/i.test(line)
    ) {
      failures.push(`${file}:${lineNumber} generic spinner em vez do loader de marca`);
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
      failures.push(
        `${file}:${lineNumber} tipografia de chat abaixo de ${tokens.minChatFontSizePx}px`,
      );
    }
  });
}

if (failures.length > 0) {
  console.error('[guard:visual] Violacoes mecanicas do contrato visual detectadas:');
  for (const failure of failures.slice(0, 80)) {
    console.error(`- ${failure}`);
  }
  if (failures.length > 80) {
    console.error(`- ... e mais ${failures.length - 80} violacao(oes)`);
  }
  process.exit(1);
}

console.log('[guard:visual] OK');

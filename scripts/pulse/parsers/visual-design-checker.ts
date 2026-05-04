/**
 * PULSE Parser 105: Visual Design Checker
 * Contract: docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md
 * Mode: STATIC
 *
 * Enforces a subset of the visual design contract with static code scans.
 * It focuses on violations that are mechanically detectable and high-signal.
 */
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { readFileSafe, walkFiles } from './utils';
import { discoverDesignTokens, isDiscoveredDesignColor } from '../design-token-discovery';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'];
const SKIP_PATH_SEGMENTS = new Set([
  '__tests__',
  '__mocks__',
  'coverage',
  'dist',
  'node_modules',
  'test',
]);
const CHAT_FILE_HINTS = [
  'chat',
  'inbox',
  'conversation',
  'composer',
  'assistant',
  'thread',
  'onboarding-chat',
  'kloel-message',
  'kloel-chat',
];
const SPINNER_ICON_HINTS = ['Loader2', 'RefreshCw', 'RefreshCcw'];
const APPROVED_SPINNER_HINTS = ['PulseLoader', 'KloelBrand', 'brand'];

function isSkippable(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join('/');
  const segments = normalized.split('/');
  if (segments.some((segment) => SKIP_PATH_SEGMENTS.has(segment))) {
    return true;
  }
  const fileName = segments[segments.length - 1] ?? '';
  return [
    '.spec.ts',
    '.spec.tsx',
    '.spec.js',
    '.spec.jsx',
    '.test.ts',
    '.test.tsx',
    '.test.js',
    '.test.jsx',
  ].some((suffix) => fileName.endsWith(suffix));
}

function pushLimited(
  output: Break[],
  limits: Map<string, number>,
  key: string,
  entry: Break,
  maxPerFile: number,
) {
  const current = limits.get(key) || 0;
  if (current >= maxPerFile) {
    return;
  }
  output.push(entry);
  limits.set(key, current + 1);
}

/** Check visual design. */
export function checkVisualDesign(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const perFileLimits = new Map<string, number>();
  const frontendFiles = walkFiles(config.frontendDir, SOURCE_EXTENSIONS);
  const designTokens = discoverDesignTokens(config.rootDir);

  for (const file of frontendFiles) {
    const relFile = path.relative(config.rootDir, file);
    if (isSkippable(relFile)) {
      continue;
    }

    const content = readFileSafe(file);
    if (!content) {
      continue;
    }

    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      const hexMatches = extractHexColors(line);
      const violatingHexes = hexMatches.filter(
        (value) => !isDiscoveredDesignColor(value, designTokens),
      );
      if (violatingHexes.length > 0) {
        pushHexBreak(breaks, perFileLimits, relFile, index + 1, violatingHexes);
      }

      if (isChatFile(relFile)) {
        const fontViolation = lineHasSmallFont(line);
        if (fontViolation) {
          pushFontBreak(breaks, perFileLimits, relFile, index + 1);
        }
      }

      if (lineHasUiLiteralBoundary(line)) {
        const emojiMatches = extractEmojiGlyphs(line);
        if (emojiMatches.length > 0) {
          pushEmojiBreak(breaks, perFileLimits, relFile, index + 1, emojiMatches);
        }
      }

      if (
        lineHasGenericSpinner(line) &&
        !APPROVED_SPINNER_HINTS.some((hint) => line.toLowerCase().includes(hint.toLowerCase()))
      ) {
        pushSpinnerBreak(breaks, perFileLimits, relFile, index + 1);
      }
    }
  }

  return breaks;
}

function pushHexBreak(
  breaks: Break[],
  perFileLimits: Map<string, number>,
  relFile: string,
  line: number,
  violatingHexes: string[],
): void {
  pushLimited(
    breaks,
    perFileLimits,
    `${relFile}:hex`,
    {
      type: 'VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS',
      severity: 'medium',
      file: relFile,
      line,
      source: 'design-token-discovery',
      description:
        'Raw color literal has no discovered design-token evidence in project token sources.',
      detail: `Colors ${violatingHexes.join(', ')} were not discovered in CSS variables, Tailwind theme, token files, theme files, or component primitive styles scanned by PULSE.`,
    },
    5,
  );
}

function pushFontBreak(
  breaks: Break[],
  perFileLimits: Map<string, number>,
  relFile: string,
  line: number,
): void {
  pushLimited(
    breaks,
    perFileLimits,
    `${relFile}:font`,
    {
      type: 'VISUAL_CONTRACT_FONT_BELOW_MIN',
      severity: 'high',
      file: relFile,
      line,
      description:
        'Chat body typography drops below 16px, violating the minimum readability contract.',
      detail:
        'Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.',
    },
    5,
  );
}

function pushEmojiBreak(
  breaks: Break[],
  perFileLimits: Map<string, number>,
  relFile: string,
  line: number,
  emojiMatches: string[],
): void {
  pushLimited(
    breaks,
    perFileLimits,
    `${relFile}:emoji`,
    {
      type: 'VISUAL_CONTRACT_EMOJI_UI',
      severity: 'high',
      file: relFile,
      line,
      description:
        'Emoji found in product UI code, violating the restrained Kloel visual contract.',
      detail: `Remove emoji glyphs (${emojiMatches.join(' ')}) from product-facing UI and use text or SVG iconography instead.`,
    },
    5,
  );
}

function pushSpinnerBreak(
  breaks: Break[],
  perFileLimits: Map<string, number>,
  relFile: string,
  line: number,
): void {
  pushLimited(
    breaks,
    perFileLimits,
    `${relFile}:spinner`,
    {
      type: 'VISUAL_CONTRACT_GENERIC_SPINNER',
      severity: 'high',
      file: relFile,
      line,
      description:
        'Generic spinner detected where the visual contract requires branded loading treatment.',
      detail:
        'Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.',
    },
    5,
  );
}

function extractHexColors(line: string): string[] {
  const colors: string[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '#') {
      continue;
    }
    let cursor = index + 1;
    while (cursor < line.length && isHexChar(line[cursor]) && cursor - index <= 8) {
      cursor += 1;
    }
    const length = cursor - index - 1;
    if (length >= 3 && length <= 8) {
      colors.push(line.slice(index, cursor));
    }
  }
  return colors;
}

function isHexChar(char: string): boolean {
  const lower = char.toLowerCase();
  return (lower >= 'a' && lower <= 'f') || (char >= '0' && char <= '9');
}

function isChatFile(relFile: string): boolean {
  const lower = relFile.toLowerCase();
  return CHAT_FILE_HINTS.some((hint) => lower.includes(hint));
}

function lineHasSmallFont(line: string): boolean {
  if (line.includes('text-xs') || line.includes('text-sm')) {
    return true;
  }
  return (
    readNumberBeforePx(line, 'text-[') < 16 ||
    readNumberBeforePx(line, 'font-size') < 16 ||
    readNumberBeforePx(line, 'fontSize') < 16
  );
}

function readNumberBeforePx(line: string, marker: string): number {
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) {
    return Number.POSITIVE_INFINITY;
  }
  const pxIndex = line.indexOf('px', markerIndex);
  if (pxIndex < 0) {
    return Number.POSITIVE_INFINITY;
  }
  let cursor = pxIndex - 1;
  let digits = '';
  while (cursor >= markerIndex) {
    const char = line[cursor];
    if (char >= '0' && char <= '9') {
      digits = `${char}${digits}`;
      cursor -= 1;
      continue;
    }
    if (digits.length > 0) {
      break;
    }
    cursor -= 1;
  }
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

function lineHasUiLiteralBoundary(line: string): boolean {
  return ["'", '"', '`', '<', '>'].some((token) => line.includes(token));
}

function extractEmojiGlyphs(line: string): string[] {
  const glyphs: string[] = [];
  for (const char of line) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
      (codePoint >= 0x2600 && codePoint <= 0x27bf)
    ) {
      glyphs.push(char);
    }
  }
  return glyphs;
}

function lineHasGenericSpinner(line: string): boolean {
  const lower = line.toLowerCase();
  const hasSpinAnimation =
    lower.includes('animate-spin') || (lower.includes('animation') && lower.includes('spin'));
  return hasSpinAnimation && SPINNER_ICON_HINTS.some((hint) => line.includes(hint));
}

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
const SKIP_FILE_RE =
  /(?:^|\/)(?:__tests__|__mocks__|coverage|dist|node_modules|test)(?:\/|$)|\.(?:spec|test)\.[jt]sx?$/;
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g;
const TAILWIND_FONT_RE = /\btext-(xs|sm)\b|text-\[(\d{1,2})px\]/g;
const CSS_FONT_RE = /font-size\s*:\s*['"`]?(\d{1,2})px/gi;
const INLINE_FONT_RE = /fontSize\s*:\s*['"`]?(\d{1,2})px/gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const CHAT_FILE_HINT_RE =
  /(chat|inbox|conversation|composer|assistant|thread|onboarding-chat|kloel-message|kloel-chat)/i;
const SPINNER_RE = /animate-spin|animation\s*:\s*['"`][^'"`]*spin/i;
const SPINNER_ICON_RE = /Loader2|RefreshCw|RefreshCcw/;

function isSkippable(relPath: string): boolean {
  return SKIP_FILE_RE.test(relPath);
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

      const hexMatches = line.match(HEX_COLOR_RE) || [];
      const violatingHexes = hexMatches.filter(
        (value) => !isDiscoveredDesignColor(value, designTokens),
      );
      if (violatingHexes.length > 0) {
        pushLimited(
          breaks,
          perFileLimits,
          `${relFile}:hex`,
          {
            type: 'VISUAL_CONTRACT_HEX_OUTSIDE_TOKENS',
            severity: 'medium',
            file: relFile,
            line: index + 1,
            source: 'design-token-discovery',
            description:
              'Raw color literal has no discovered design-token evidence in project token sources.',
            detail: `Colors ${violatingHexes.join(', ')} were not discovered in CSS variables, Tailwind theme, token files, theme files, or component primitive styles scanned by PULSE.`,
          },
          5,
        );
      }

      if (CHAT_FILE_HINT_RE.test(relFile)) {
        let fontViolation = false;
        for (const match of line.matchAll(TAILWIND_FONT_RE)) {
          const size = match[1] === 'xs' ? 12 : match[1] === 'sm' ? 14 : Number(match[2]);
          if (Number.isFinite(size) && size < 16) {
            fontViolation = true;
          }
        }
        for (const match of line.matchAll(CSS_FONT_RE)) {
          if (Number(match[1]) < 16) {
            fontViolation = true;
          }
        }
        for (const match of line.matchAll(INLINE_FONT_RE)) {
          if (Number(match[1]) < 16) {
            fontViolation = true;
          }
        }
        if (fontViolation) {
          pushLimited(
            breaks,
            perFileLimits,
            `${relFile}:font`,
            {
              type: 'VISUAL_CONTRACT_FONT_BELOW_MIN',
              severity: 'high',
              file: relFile,
              line: index + 1,
              description:
                'Chat body typography drops below 16px, violating the minimum readability contract.',
              detail:
                'Chat body copy must stay at 16px+ with breathable line-height. Restrict smaller sizes to metadata and badges only.',
            },
            5,
          );
        }
      }

      if (/['"`<>]/.test(line)) {
        const emojiMatches = line.match(EMOJI_RE) || [];
        if (emojiMatches.length > 0) {
          pushLimited(
            breaks,
            perFileLimits,
            `${relFile}:emoji`,
            {
              type: 'VISUAL_CONTRACT_EMOJI_UI',
              severity: 'high',
              file: relFile,
              line: index + 1,
              description:
                'Emoji found in product UI code, violating the restrained Kloel visual contract.',
              detail: `Remove emoji glyphs (${emojiMatches.join(' ')}) from product-facing UI and use text or SVG iconography instead.`,
            },
            5,
          );
        }
      }

      if (
        SPINNER_RE.test(line) &&
        SPINNER_ICON_RE.test(line) &&
        !/PulseLoader|KloelBrand|brand/i.test(line)
      ) {
        pushLimited(
          breaks,
          perFileLimits,
          `${relFile}:spinner`,
          {
            type: 'VISUAL_CONTRACT_GENERIC_SPINNER',
            severity: 'high',
            file: relFile,
            line: index + 1,
            description:
              'Generic spinner detected where the visual contract requires branded loading treatment.',
            detail:
              'Replace ad-hoc animate-spin loaders with PulseLoader or the approved branded loading pattern for Kloel surfaces.',
          },
          5,
        );
      }
    }
  }

  return breaks;
}

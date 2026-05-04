/**
 * PULSE Parser 70: Responsive Layout Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend files for responsive design signals.
 * Checks whether the main layout and pages use media queries or responsive
 * Tailwind/CSS breakpoints. Missing responsive design on main layout = broken mobile UX.
 *
 * Emits responsive-layout evidence. Diagnostic identity is synthesized
 * downstream from static signals and predicates.
 */

import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import { buildParserDiagnosticBreak } from './diagnostic-break';

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

function countOccurrences(content: string, needle: string): number {
  let count = 0;
  let offset = 0;
  while (offset < content.length) {
    const index = content.indexOf(needle, offset);
    if (index === -1) {
      break;
    }
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function countResponsiveClassPrefixes(content: string): number {
  const prefixes = ['sm:', 'md:', 'lg:', 'xl:', '2xl:'];
  return prefixes.reduce((total, prefix) => total + countOccurrences(content, prefix), 0);
}

/** Count @media queries in a string */
function countMediaQueries(content: string): number {
  return countOccurrences(content, '@media');
}

/** Count Tailwind responsive prefix usage: sm:, md:, lg:, xl:, 2xl: */
function countTailwindBreakpoints(content: string): number {
  return countResponsiveClassPrefixes(content);
}

/** Count CSS-in-JS media queries: "@media" strings in template literals or style objects */
function countCssInJsMedia(content: string): number {
  return (
    countOccurrences(content, "'@media") +
    countOccurrences(content, '"@media') +
    countOccurrences(content, '`@media')
  );
}

/** Check responsive. */
export function checkResponsive(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ── Primary check: main layout file ────────────────────────────────────────
  // The main layout drives the shell for all pages. If it has no responsive
  // design, every page is broken on mobile regardless of individual page code.
  const layoutCandidates = [
    safeJoin(config.frontendDir, 'src', 'app', 'layout.tsx'),
    safeJoin(config.frontendDir, 'src', 'app', '(main)', 'layout.tsx'),
    safeJoin(config.frontendDir, 'src', 'components', 'kloel', 'layout.tsx'),
    safeJoin(config.frontendDir, 'src', 'components', 'layout.tsx'),
  ].filter(pathExists);

  let layoutResponsive = false;

  for (const layoutFile of layoutCandidates) {
    const content = readSafe(layoutFile);
    const media = countMediaQueries(content);
    const tailwind = countTailwindBreakpoints(content);
    const cssInJs = countCssInJsMedia(content);

    if (media + tailwind + cssInJs > 0) {
      layoutResponsive = true;
    }
  }

  if (layoutCandidates.length > 0 && !layoutResponsive) {
    const evidenceFile = path.relative(
      config.rootDir,
      layoutCandidates[0] ?? safeJoin(config.frontendDir, 'src', 'app', 'layout.tsx'),
    );
    breaks.push(
      buildParserDiagnosticBreak({
        detector: 'responsive-layout-static-evidence',
        source: 'static-layout-signal:responsive-tester',
        truthMode: 'confirmed_static',
        severity: 'medium',
        file: evidenceFile,
        line: 1,
        summary: 'Main layout has no responsive layout evidence',
        detail:
          'The root layout controls the sidebar, header, and grid shell. ' +
          'No responsive breakpoint evidence was found in candidate layout files. ' +
          'Expected evidence includes breakpoint classes, media queries, or CSS-in-JS responsive rules.',
        surface: 'frontend-responsive-layout',
      }),
    );
  }

  // ── Secondary check: aggregate @media across all frontend files ─────────────
  // If the entire frontend has fewer than 5 @media queries, responsive design is likely absent
  const allFrontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts', '.css', '.scss']).filter(
    (f) => {
      const normalized = f.replaceAll('\\', '/');
      return (
        !normalized.includes('/node_modules/') &&
        !normalized.includes('/.next/') &&
        !normalized.includes('/dist/')
      );
    },
  );

  let totalMedia = 0;
  let totalTailwind = 0;

  for (const file of allFrontendFiles) {
    const content = readSafe(file);
    totalMedia += countMediaQueries(content);
    totalTailwind += countTailwindBreakpoints(content);
  }

  const totalResponsiveSignals = totalMedia + totalTailwind;

  if (totalResponsiveSignals < 5) {
    breaks.push(
      buildParserDiagnosticBreak({
        detector: 'responsive-aggregate-static-evidence',
        source: 'static-layout-signal:responsive-tester',
        truthMode: 'confirmed_static',
        severity: 'medium',
        file: path.relative(config.rootDir, config.frontendDir),
        line: 1,
        summary: 'Frontend has sparse responsive breakpoint evidence across scanned files',
        detail:
          `Found ${totalMedia} @media queries and ${totalTailwind} Tailwind breakpoints (sm:/md:/lg:) ` +
          'across the entire frontend. This suggests the app needs responsive proof for layout, sidebar, and data-table surfaces.',
        surface: 'frontend-responsive-coverage',
      }),
    );
  }

  return breaks;
}

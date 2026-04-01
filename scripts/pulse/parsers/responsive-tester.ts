/**
 * PULSE Parser 70: Responsive Layout Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend files for responsive design signals.
 * Checks whether the main layout and pages use media queries or responsive
 * Tailwind/CSS breakpoints. Missing responsive design on main layout = broken mobile UX.
 *
 * BREAK TYPES:
 *   RESPONSIVE_BROKEN (medium) — main layout has zero media queries or responsive breakpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/** Count @media queries in a string */
function countMediaQueries(content: string): number {
  return (content.match(/@media\b/g) || []).length;
}

/** Count Tailwind responsive prefix usage: sm:, md:, lg:, xl:, 2xl: */
function countTailwindBreakpoints(content: string): number {
  return (content.match(/\b(?:sm|md|lg|xl|2xl):/g) || []).length;
}

/** Count CSS-in-JS media queries: "@media" strings in template literals or style objects */
function countCssInJsMedia(content: string): number {
  return (content.match(/['"`]@media\b/g) || []).length;
}

export function checkResponsive(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ── Primary check: main layout file ────────────────────────────────────────
  // The main layout drives the shell for all pages. If it has no responsive
  // design, every page is broken on mobile regardless of individual page code.
  const layoutCandidates = [
    path.join(config.frontendDir, 'src', 'app', 'layout.tsx'),
    path.join(config.frontendDir, 'src', 'app', '(main)', 'layout.tsx'),
    path.join(config.frontendDir, 'src', 'components', 'kloel', 'layout.tsx'),
    path.join(config.frontendDir, 'src', 'components', 'layout.tsx'),
  ].filter(fs.existsSync);

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
    breaks.push({
      type: 'RESPONSIVE_BROKEN',
      severity: 'medium',
      file: path.relative(
        config.rootDir,
        layoutCandidates[0] ?? path.join(config.frontendDir, 'src', 'app', 'layout.tsx'),
      ),
      line: 1,
      description: 'Main layout has zero @media queries or responsive breakpoints',
      detail:
        'The root layout controls the sidebar, header, and grid shell. ' +
        'Without responsive breakpoints (sm:/md:/lg: or @media), the layout is broken on mobile. ' +
        'Add flex-col layout for narrow viewports and hide/collapse the sidebar at < 768px.',
    });
  }

  // ── Secondary check: aggregate @media across all frontend files ─────────────
  // If the entire frontend has fewer than 5 @media queries, responsive design is likely absent
  const allFrontendFiles = walkFiles(config.frontendDir, ['.tsx', '.ts', '.css', '.scss']).filter(
    f => !/node_modules|\.next\/|dist\//.test(f),
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
    breaks.push({
      type: 'RESPONSIVE_BROKEN',
      severity: 'medium',
      file: path.relative(config.rootDir, config.frontendDir),
      line: 1,
      description: `Frontend has only ${totalResponsiveSignals} responsive breakpoint signals across all files`,
      detail:
        `Found ${totalMedia} @media queries and ${totalTailwind} Tailwind breakpoints (sm:/md:/lg:) ` +
        'across the entire frontend. This strongly suggests the app is not responsive. ' +
        'Minimum expectation: main layout, sidebar, and data tables should all have mobile breakpoints.',
    });
  }

  return breaks;
}

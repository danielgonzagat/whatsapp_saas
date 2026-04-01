/**
 * PULSE Parser 69: Accessibility Tester (STATIC)
 * Layer 9: Frontend Health
 *
 * STATIC analysis: scans frontend .tsx files for common accessibility violations
 * that can be detected without running a browser:
 * - <img> without alt prop
 * - Buttons with no accessible text (no text content, no aria-label, no aria-labelledby)
 * - Form inputs without associated labels
 *
 * BREAK TYPES:
 *   ACCESSIBILITY_VIOLATION (medium) — detected pattern prevents screen reader access
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

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
}

export function checkAccessibility(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const tsxFiles = walkFiles(config.frontendDir, ['.tsx']).filter(
    f => !/\.(spec|test)\.tsx$|__tests__|__mocks__|node_modules|\.next\//.test(f),
  );

  for (const file of tsxFiles) {
    const content = readSafe(file);
    if (!content) continue;

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (isCommentLine(raw)) continue;
      const trimmed = raw.trim();

      // ── CHECK 1: <img without alt ──────────────────────────────────────────
      // Match <img but not <Image (Next.js component which requires alt)
      // Look for <img ... without alt= on the same line
      // Also check the next few lines for multi-line JSX
      if (/<img\b/.test(trimmed)) {
        // Collect up to 5 lines for the img tag
        const block = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
        if (!(/\balt\s*=/.test(block))) {
          breaks.push({
            type: 'ACCESSIBILITY_VIOLATION',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: '<img> element missing alt attribute',
            detail:
              `${trimmed.slice(0, 100)} — ` +
              'Screen readers cannot describe this image without an alt attribute. ' +
              'Add alt="" for decorative images or alt="descriptive text" for informative ones.',
          });
        }
      }

      // ── CHECK 2: <button> with no accessible text ──────────────────────────
      // Buttons that contain only icon children (SVG-only) and have no aria-label are inaccessible
      // Pattern: <button ... > with no text content and no aria-label
      // Simplified: look for <button that has no aria-label and whose content block has only SVG
      if (/^<button\b/.test(trimmed) || /\s<button\b/.test(trimmed)) {
        // Collect the button's inner content (up to 6 lines)
        const block = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');

        const hasAriaLabel = /aria-label\s*=/.test(block);
        const hasAriaLabelledBy = /aria-labelledby\s*=/.test(block);
        const hasTitle = /<title\b/.test(block);
        const hasVisibleText = />[A-Za-zÀ-ÿ][^<]{2,}<\//.test(block); // at least 3 chars of text

        // Check if button appears to contain only icon/SVG
        const seemsIconOnly =
          /<svg\b|<Icon\b|<.*Icon\b/.test(block) &&
          !hasVisibleText;

        if (seemsIconOnly && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
          breaks.push({
            type: 'ACCESSIBILITY_VIOLATION',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: 'Icon-only <button> missing aria-label — inaccessible to screen readers',
            detail:
              `${trimmed.slice(0, 100)} — ` +
              'This button appears to contain only an SVG icon with no visible text. ' +
              'Add aria-label="Action description" so screen readers can announce the button purpose.',
          });
        }
      }

      // ── CHECK 3: Form <input> without associated label ─────────────────────
      // Inputs without id+label[for] or aria-label or aria-labelledby
      // Only check standalone inputs, not those inside labeled containers
      if (
        /<input\b/.test(trimmed) &&
        !/type\s*=\s*['"](?:hidden|submit|button|reset|image)['"]/i.test(trimmed)
      ) {
        // Collect context: the input line + a few lines before (for label wrapping)
        const blockAfter = lines.slice(i, Math.min(i + 4, lines.length)).join('\n');
        const blockBefore = lines.slice(Math.max(0, i - 8), i + 1).join('\n');

        const hasAriaLabel = /aria-label\s*=/.test(blockAfter);
        const hasAriaLabelledBy = /aria-labelledby\s*=/.test(blockAfter);
        const hasId = /\bid\s*=/.test(blockAfter);
        // Check if there's a <label> with htmlFor or for that references this input
        const hasLabelFor = /<label\b[\s\S]*?(?:htmlFor|for)\s*=/.test(blockBefore);
        // Check if input is wrapped in a <label>
        const isWrappedInLabel = /<label\b/.test(blockBefore) && !/<\/label>/.test(blockBefore.slice(0, blockBefore.lastIndexOf('<label')));

        if (!hasAriaLabel && !hasAriaLabelledBy && !hasLabelFor && !isWrappedInLabel) {
          breaks.push({
            type: 'ACCESSIBILITY_VIOLATION',
            severity: 'medium',
            file: relFile,
            line: i + 1,
            description: '<input> without associated label or aria-label',
            detail:
              `${trimmed.slice(0, 100)} — ` +
              'Screen readers cannot describe this input to users. ' +
              'Add aria-label="Field description" or wrap in <label> or use <label htmlFor={id}>.',
          });
        }
      }
    }
  }

  return breaks;
}

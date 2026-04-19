// Pure typewriter delay calculator extracted from KloelLanding.tsx to
// reduce the host component's cyclomatic complexity. Behaviour matches the
// original branch-by-branch table exactly; no visual delta is introduced.

const PATTERN_RE = /[.,!?]/;

export type TypewriterMode = 'type' | 'delete';

export function delayForTypewriter(
  character: string,
  mode: TypewriterMode,
  index: number,
  phrase: string,
): number {
  const prev = phrase[index - 1] ?? '';
  const next = phrase[index + 1] ?? '';
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.regex-dos-vulnerability.regex-dos-vulnerability
  // Safe: PATTERN_RE is a module-scope literal /[.,!?]/ char-class regex; `character` is a single
  // character from a hardcoded phrase used for typewriter animation. No user input, no nested quantifiers.
  const isPauseMark = PATTERN_RE.test(character);

  if (mode === 'delete') {
    if (index === phrase.length - 1) return 190 + Math.random() * 90;
    if (isPauseMark) return 150 + Math.random() * 70;
    if (character === ' ') return 105 + Math.random() * 55;
    if (next === ' ') return 88 + Math.random() * 42;
    return 68 + Math.random() * 54;
  }

  if (index === 0) return 150 + Math.random() * 90;
  if (isPauseMark) return 240 + Math.random() * 150;
  if (character === ' ') return 118 + Math.random() * 78;
  if (prev === ' ') return 102 + Math.random() * 74;
  if (next === ' ') return 88 + Math.random() * 54;
  return 72 + Math.random() * 72;
}

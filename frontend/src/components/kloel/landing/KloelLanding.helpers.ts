// Pure typewriter delay calculator extracted from KloelLanding.tsx to
// reduce the host component's cyclomatic complexity. Behaviour matches the
// original branch-by-branch table exactly; no visual delta is introduced.

const PAUSE_MARKS = new Set(['.', ',', '!', '?']);

export type TypewriterMode = 'type' | 'delete';

type ContinueWhile = () => boolean;

export function delayForTypewriter(
  character: string,
  mode: TypewriterMode,
  index: number,
  phrase: string,
): number {
  const prev = phrase[index - 1] ?? '';
  const next = phrase[index + 1] ?? '';
  const isPauseMark = PAUSE_MARKS.has(character);

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

export async function runSequentialRange(
  start: number,
  end: number,
  step: number,
  callback: (index: number) => Promise<void> | void,
  continueWhile: ContinueWhile = () => true,
): Promise<void> {
  const withinBounds = step >= 0 ? start <= end : start >= end;
  if (!withinBounds || !continueWhile()) {
    return;
  }

  await callback(start);
  await runSequentialRange(start + step, end, step, callback, continueWhile);
}

export async function runSequentialList<T>(
  items: readonly T[],
  callback: (item: T, index: number) => Promise<void> | void,
  continueWhile: ContinueWhile = () => true,
  index = 0,
): Promise<void> {
  if (index >= items.length || !continueWhile()) {
    return;
  }

  await callback(items[index], index);
  await runSequentialList(items, callback, continueWhile, index + 1);
}

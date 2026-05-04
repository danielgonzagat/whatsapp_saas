import { compactCode, includesAny, lower } from './utils';

export function isAnimationContext(lines: string[], idx: number): boolean {
  const start = Math.max(0, idx - 50);
  const end = Math.min(lines.length, idx + 20);
  const context = lines.slice(start, end).join('\n');
  const fullFile = lines.join('\n');
  const contextLower = context.toLowerCase();
  const fullFileLower = fullFile.toLowerCase();
  const isAnimationFile =
    fullFile.includes(".getContext('2d')") ||
    fullFile.includes('.getContext("2d")') ||
    fullFile.includes('.getContext(`2d`)') ||
    fullFile.includes('requestAnimationFrame') ||
    fullFile.includes('<canvas') ||
    ['waveform', 'heartbeat', 'loading-screen', 'scramble', 'glitch', 'particle', 'animation'].some(
      (token) => fullFileLower.includes(token),
    );

  if (isAnimationFile) {
    return true;
  }

  return (
    [
      'useeffect',
      'requestanimationframe',
      'canvas',
      'ctx.',
      '.getcontext',
      'animation',
      'animate',
      'transition',
      'keyframe',
      'svg',
      'path d=',
      'viewbox',
      'stroke',
      'fill',
      'opacity',
      'transform',
      'waveform',
      'heartbeat',
      'pulse',
      'scramble',
      'glitch',
      'particle',
      'makebeat',
      'drawframe',
      'renderloop',
      'animationloop',
    ].some((token) => contextLower.includes(token)) ||
    (contextLower.includes('setinterval') &&
      ['animation', 'visual', 'render', 'draw', 'frame'].some((token) =>
        contextLower.includes(token),
      ))
  );
}

export function isIdContext(lines: string[], idx: number): boolean {
  const line = lines[idx];
  const lowerLine = line.toLowerCase();
  return (
    line.includes('.toString(36)') ||
    ['crypto', 'uuid', 'nanoid', 'key=', 'key:'].some((token) => lowerLine.includes(token))
  );
}

export function isGuardedEmptyReturnContext(context: string): boolean {
  const compact = compactCode(context);
  const lowerContext = lower(context);
  const lastIfIndex = compact.lastIndexOf('if(');
  return (
    lastIfIndex !== -1 &&
    includesAny(lowerContext, [
      'length===0',
      '<=0',
      'null',
      'undefined',
      'array.isarray',
      'object.keys',
      'empty',
      'invalid',
      'missing',
    ])
  );
}

import { compactCode, includesAny, lower, startsWithAny } from './utils';

export function isSetTimeoutStateReset(line: string): boolean {
  const compact = compactCode(line);
  return compact.includes('setTimeout(()=>set') || compact.includes('setTimeout(function(){set');
}

export function isClipboardFeedback(context: string): boolean {
  return includesAny(context, ['clipboard', 'navigator.clipboard', 'copytoclipboard', 'setcopied']);
}

export function isUiStatusTimer(line: string): boolean {
  return includesAny(line, [
    'setisthinking',
    'setisloading',
    'setisprocessing',
    'setshowtoast',
    'setnotification',
    'setshowcouponmodal',
    'setvisible',
    'setshow(',
    'setshowcheck',
    'setmt(',
  ]);
}

export function resetsVisualFlag(line: string): boolean {
  const compact = lower(compactCode(line));
  return (
    compact.includes('(false)') &&
    compact.includes('setis') &&
    !includesAny(compact, ['setsaved', 'setsaving', 'setsuccess'])
  );
}

export function clearsStatusMessage(line: string): boolean {
  const compact = lower(compactCode(line));
  const clearsValue =
    compact.includes('(null)') || compact.includes("('')") || compact.includes('("")');
  return (
    clearsValue &&
    compact.startsWith('set') &&
    includesAny(compact, ['msg', 'message', 'status', 'action', 'error', 'info', 'feedback'])
  );
}

export function togglesVisibility(line: string): boolean {
  const compact = lower(compactCode(line));
  const togglesBoolean = compact.includes('(true)') || compact.includes('(false)');
  return (
    togglesBoolean &&
    startsWithAny(compact, [
      'setvisible',
      'setshow',
      'setmt',
      'setopen',
      'setexpanded',
      'setactive',
    ])
  );
}

export function usesMathRandom(line: string): boolean {
  return compactCode(line).includes('Math.random()');
}

export function isRandomIdGeneration(line: string): boolean {
  const compact = lower(compactCode(line));
  return (
    compact.includes('*1e') || compact.includes('*1000000') || compact.includes('.tostring(36)')
  );
}

export function isRetryJitter(line: string): boolean {
  const compact = lower(compactCode(line));
  return (
    compact.includes('*basedelay') ||
    compact.includes('*delay') ||
    compact.includes('*timeout') ||
    compact.includes('*interval') ||
    compact.includes('*retrydelay') ||
    compact.includes('*backoff')
  );
}

export function isDisplayedRandomDataContext(line: string): boolean {
  const compact = compactCode(line);
  return (
    (compact.includes('set') && compact.includes('(')) ||
    (compact.startsWith('let') && compact.includes('=')) ||
    compact.includes('toFixed') ||
    compact.includes('toLocaleString') ||
    compact.includes('++') ||
    compact.includes('--') ||
    compact.includes('+=') ||
    compact.includes('-=')
  );
}

export function initializesUseStateArray(line: string): boolean {
  return compactCode(line).includes('useState([');
}

export function blockLooksLikeHardcodedObjectData(block: string): boolean {
  const compact = compactCode(block);
  const objectSegments = compact.split('{');
  const repeatedObjectThreshold = Number(Boolean(compact)) + Number(Boolean(block));
  return (
    objectSegments.length > repeatedObjectThreshold &&
    ['q', 'label', 'name', 'title', 'text'].some((key) =>
      [`{${key}:'`, `{${key}:"`, `{${key}:\``].some((needle) => compact.includes(needle)),
    )
  );
}

export function commentReferencesIntegrationGap(line: string): boolean {
  const normalized = lower(line);
  return (
    ['todo', 'fixme', 'hack', 'stub'].some((token) => normalized.includes(token)) &&
    ['api', 'connect', 'implement', 'integrat', 'backend', 'endpoint', 'fetch', 'prisma'].some(
      (token) => normalized.includes(token),
    )
  );
}

export function hasEmptyInlineHandler(line: string): boolean {
  const compact = compactCode(line);
  return compact.includes('onClick={()=>{}}') || compact.includes('onSubmit={()=>{}}');
}

export function hasConsoleOnlyInlineHandler(line: string): boolean {
  const compact = compactCode(line);
  return compact.includes('onClick={()=>console.') || compact.includes('onSubmit={()=>console.');
}

export function isSilentCatch(line: string): boolean {
  const compact = compactCode(line);
  return compact.startsWith('catch(') && compact.endsWith('{}');
}

export function referencesFallbackResponses(line: string): boolean {
  return includesAny(line, ['FALLBACK_RESPONSES', 'fallbackResponses', 'FALLBACK_MESSAGES']);
}

export function startsInterval(line: string): boolean {
  return compactCode(line).includes('setInterval(');
}

export function intervalBlockChangesDisplayedValue(block: string): boolean {
  const compact = compactCode(block);
  return (
    ['=>prev+', '=>prev-', '=>p+', '=>p-', '=>v+', '=>v-'].some((token) =>
      compact.includes(token),
    ) || compact.includes('Math.random')
  );
}

export function isServiceEmptyReturn(line: string): boolean {
  const compact = compactCode(line);
  return (
    compact === 'return[];' ||
    compact === 'return{};' ||
    compact === 'return[]' ||
    compact === 'return{}'
  );
}

export function contextAllowsEmptyReturn(context: string): boolean {
  return includesAny(context, [
    'catch',
    'default',
    'fallback',
    'if(!',
    'normalize',
    'sanitize',
    'safeparse',
    'json.parse',
  ]);
}

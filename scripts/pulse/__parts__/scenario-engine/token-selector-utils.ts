import type { ScenarioBuildContext } from './constants';
import { getCapabilitiesForSurface, getSurface } from './constants';

function collectScenarioTokens(
  ctx: ScenarioBuildContext,
  subFlowId: string,
): { text: string; tokens: Set<string> } {
  const surface = getSurface(ctx.productGraph, ctx.primarySurfaceId);
  const capabilities = getCapabilitiesForSurface(ctx.productGraph, ctx.primarySurfaceId);
  const raw = [
    subFlowId,
    ctx.primarySurfaceId,
    surface?.id,
    surface?.name,
    surface?.description,
    ...(surface?.artifactIds || []),
    ...(surface?.capabilities || []),
    ...capabilities.flatMap((capability) => [
      capability.id,
      capability.name,
      ...capability.artifactIds,
      ...capability.flowIds,
      ...capability.blockers,
    ]),
    ...ctx.endpoints.flatMap((endpoint) => [
      endpoint.name,
      endpoint.filePath,
      endpoint.docComment,
      ...endpoint.inputs.map((input) => input.name),
      ...endpoint.outputs.map((output) => output.target),
      ...endpoint.stateAccess.map((access) => access.model),
      ...endpoint.externalCalls.map((call) => `${call.provider} ${call.operation}`),
    ]),
    ...ctx.entities.map((entity) => entity.model),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return {
    text: raw,
    tokens: new Set(tokenizeScenarioText(raw).filter((token) => token.length > 1)),
  };
}

function tokenizeScenarioText(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value.toLowerCase()) {
    const isDigit = char >= '0' && char <= '9';
    const isLetter = char >= 'a' && char <= 'z';
    if (isDigit || isLetter) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function hasAnyScenarioToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function normalizeSelectorToken(inputName: string, fallbackIndex: number): string {
  const trimmed = inputName.trim();
  if (isStableSelectorToken(trimmed)) {
    return trimmed;
  }
  const normalized = normalizeSelectorCharacters(trimmed).slice(0, 48);
  return normalized || `pulse-field-${fallbackIndex}`;
}

function isStableSelectorToken(value: string): boolean {
  if (value.length === 0 || value.length > 80 || !isAsciiLetter(value[0])) {
    return false;
  }
  return value
    .split('')
    .every(
      (char) =>
        isAsciiLetter(char) ||
        (char >= '0' && char <= '9') ||
        char === '_' ||
        char === '.' ||
        char === ':' ||
        char === '-',
    );
}

function normalizeSelectorCharacters(value: string): string {
  const output: string[] = [];
  for (const char of value) {
    const isLetter = isAsciiLetter(char);
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '_' || char === '-') {
      output.push(char.toLowerCase());
      continue;
    }
    if (output.length > 0 && output[output.length - 1] !== '-') {
      output.push('-');
    }
  }
  while (output[0] === '-') {
    output.shift();
  }
  while (output[output.length - 1] === '-') {
    output.pop();
  }
  return output.join('');
}

function isAsciiLetter(char: string): boolean {
  const lower = char.toLowerCase();
  return lower >= 'a' && lower <= 'z';
}

function buildInputSelector(inputName: string, fallbackIndex: number): string {
  const token = normalizeSelectorToken(inputName, fallbackIndex);
  return `[name="${token}"], [data-testid="${token}"]`;
}

export {
  collectScenarioTokens,
  tokenizeScenarioText,
  hasAnyScenarioToken,
  normalizeSelectorToken,
  isStableSelectorToken,
  normalizeSelectorCharacters,
  isAsciiLetter,
  buildInputSelector,
};

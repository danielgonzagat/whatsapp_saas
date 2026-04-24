import type { FlowNodeData } from './flow-engine.types';

// Narrowing helpers for FlowNodeData — data is a runtime JSON bag, so we pull
// typed scalars explicitly with defaults instead of trusting dot-access.
export const readString = (data: FlowNodeData | undefined, key: string, fallback = ''): string => {
  const v = data?.[key];
  return typeof v === 'string' ? v : fallback;
};

export const readOptionalString = (
  data: FlowNodeData | undefined,
  key: string,
): string | undefined => {
  const v = data?.[key];
  return typeof v === 'string' ? v : undefined;
};

export const readNumber = (data: FlowNodeData | undefined, key: string, fallback = 0): number => {
  const v = data?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

export const readBoolean = (
  data: FlowNodeData | undefined,
  key: string,
  fallback = false,
): boolean => {
  const v = data?.[key];
  return typeof v === 'boolean' ? v : fallback;
};

export const readObject = (
  data: FlowNodeData | undefined,
  key: string,
): Record<string, unknown> | undefined => {
  const v = data?.[key];
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
};

// Narrow a FlowVariables value to a string for APIs that require string input.
export const varAsString = (v: unknown, fallback = ''): string => {
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return fallback;
};

// Safely extract a nested string from a JSON-like object (e.g. providerSettings.openai.apiKey)
export const nestedString = (obj: unknown, ...keys: string[]): string | undefined => {
  let current: unknown = obj;
  for (const k of keys) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[k];
  }
  return typeof current === 'string' ? current : undefined;
};

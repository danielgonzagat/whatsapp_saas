import { BadRequestException } from '@nestjs/common';

const MAX_META_SEGMENT_LENGTH = 128;

const SAFE_META_EXTRA_CHARS = new Set(['_', '-', '.']);

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isSafeMetaSegmentChar(char: string): boolean {
  const code = char.charCodeAt(0);
  if (isDigit(code) || isAsciiLetter(code)) {
    return true;
  }
  return SAFE_META_EXTRA_CHARS.has(char);
}

export function normalizeMetaGraphSegment(value: string, label = 'Meta identifier'): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new BadRequestException(`${label} is required`);
  }
  if (normalized.length > MAX_META_SEGMENT_LENGTH) {
    throw new BadRequestException(`${label} is invalid`);
  }

  for (const char of normalized) {
    if (!isSafeMetaSegmentChar(char)) {
      throw new BadRequestException(`${label} is invalid`);
    }
  }

  return normalized;
}

export function normalizeMetaGraphPath(value: string, label = 'Meta endpoint'): string {
  const segments = String(value || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) =>
      normalizeMetaGraphSegment(segment, index === 0 ? label : `${label} segment`),
    );

  if (segments.length === 0) {
    throw new BadRequestException(`${label} is required`);
  }

  return segments.join('/');
}

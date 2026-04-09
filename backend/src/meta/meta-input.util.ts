import { BadRequestException } from '@nestjs/common';

const MAX_META_SEGMENT_LENGTH = 128;

function isSafeMetaSegmentChar(char: string): boolean {
  const code = char.charCodeAt(0);
  const isNumber = code >= 48 && code <= 57;
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  return isNumber || isUpper || isLower || char === '_' || char === '-' || char === '.';
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

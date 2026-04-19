export interface UploadedFileLike {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

const ALLOWED_CONTROL_BYTES: ReadonlySet<number> = new Set([9, 10, 13]);

function isTextSafeByte(byte: number): boolean {
  if (ALLOWED_CONTROL_BYTES.has(byte)) return true;
  if (byte >= 32 && byte <= 126) return true;
  return byte >= 128;
}

function isSuspiciousControlByte(byte: number): boolean {
  return !isTextSafeByte(byte);
}

function countSuspiciousControlBytes(sample: Buffer): number {
  let count = 0;
  for (const byte of sample) {
    if (isSuspiciousControlByte(byte)) count += 1;
  }
  return count;
}

function looksLikeUtf8Text(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return false;

  if (sample.toString('utf8').includes('\uFFFD')) {
    return false;
  }

  return countSuspiciousControlBytes(sample) / sample.length < 0.02;
}

function bufferStartsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function bufferSliceEquals(buffer: Buffer, start: number, end: number, ascii: string): boolean {
  if (buffer.length < end) return false;
  return buffer.subarray(start, end).toString('ascii') === ascii;
}

const PDF_SIG = [0x25, 0x50, 0x44, 0x46] as const;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIG = [0xff, 0xd8, 0xff] as const;
const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04] as const;
const CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;
const MATROSKA_SIG = [0x1a, 0x45, 0xdf, 0xa3] as const;

function isWebpContainer(buffer: Buffer): boolean {
  return bufferSliceEquals(buffer, 0, 4, 'RIFF') && bufferSliceEquals(buffer, 8, 12, 'WEBP');
}

function isGifMarker(buffer: Buffer): boolean {
  if (buffer.length < 6) return false;
  return bufferSliceEquals(buffer, 0, 6, 'GIF87a') || bufferSliceEquals(buffer, 0, 6, 'GIF89a');
}

type ImageSignatureProbe = (buffer: Buffer) => boolean;

const IMAGE_SIGNATURE_CHAIN: ReadonlyArray<readonly [ImageSignatureProbe, string]> = [
  [(buffer) => bufferStartsWith(buffer, PNG_SIG), 'image/png'],
  [(buffer) => bufferStartsWith(buffer, JPEG_SIG), 'image/jpeg'],
  [isWebpContainer, 'image/webp'],
  [isGifMarker, 'image/gif'],
];

function detectImageMime(buffer: Buffer): string | null {
  for (const [probe, mime] of IMAGE_SIGNATURE_CHAIN) {
    if (probe(buffer)) return mime;
  }
  return null;
}

function detectOfficeMime(buffer: Buffer, name: string): string | null {
  if (name.endsWith('.docx') && bufferStartsWith(buffer, ZIP_SIG)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (name.endsWith('.xlsx') && bufferStartsWith(buffer, ZIP_SIG)) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if ((name.endsWith('.doc') || name.endsWith('.xls')) && bufferStartsWith(buffer, CFB_SIG)) {
    return name.endsWith('.xls') ? 'application/vnd.ms-excel' : 'application/msword';
  }
  return null;
}

function isMp3Signature(buffer: Buffer): boolean {
  if (buffer.length >= 3 && bufferSliceEquals(buffer, 0, 3, 'ID3')) return true;
  return buffer.length >= 2 && buffer[0] === 0xff && [0xf2, 0xf3, 0xfb].includes(buffer[1]);
}

function detectBasicAudioMime(buffer: Buffer): string | null {
  if (isMp3Signature(buffer)) return 'audio/mpeg';
  if (bufferSliceEquals(buffer, 0, 4, 'RIFF') && bufferSliceEquals(buffer, 8, 12, 'WAVE')) {
    return 'audio/wav';
  }
  if (bufferSliceEquals(buffer, 0, 4, 'OggS')) return 'audio/ogg';
  return null;
}

function isWebmExtension(name: string, declaredMime: string): boolean {
  return name.endsWith('.webm') || declaredMime.includes('webm');
}

function isMp4Container(name: string, declaredMime: string): boolean {
  return (
    name.endsWith('.m4a') ||
    name.endsWith('.mp4') ||
    declaredMime.includes('mp4') ||
    declaredMime.includes('m4a')
  );
}

function detectMatroskaMime(buffer: Buffer, name: string, declaredMime: string): string | null {
  if (!bufferStartsWith(buffer, MATROSKA_SIG)) return null;
  if (!isWebmExtension(name, declaredMime)) return null;
  return declaredMime.startsWith('video/') ? 'video/webm' : 'audio/webm';
}

function detectFtypMime(buffer: Buffer, name: string, declaredMime: string): string | null {
  if (!bufferSliceEquals(buffer, 4, 8, 'ftyp')) return null;
  if (!isMp4Container(name, declaredMime)) return null;
  return name.endsWith('.m4a') || declaredMime.includes('m4a') ? 'audio/x-m4a' : 'audio/mp4';
}

function detectTextMime(buffer: Buffer, name: string, declaredMime: string): string | null {
  const hasTextIndicator =
    name.endsWith('.txt') || name.endsWith('.csv') || declaredMime.includes('text');
  if (!hasTextIndicator || !looksLikeUtf8Text(buffer)) return null;
  if (name.endsWith('.csv') || declaredMime.includes('csv')) return 'text/csv';
  return 'text/plain';
}

type MimeDetector = (buffer: Buffer, name: string, declaredMime: string) => string | null;

const MIME_DETECTION_CHAIN: readonly MimeDetector[] = [
  (buffer) => (bufferStartsWith(buffer, PDF_SIG) ? 'application/pdf' : null),
  (buffer) => detectImageMime(buffer),
  (buffer, name) => detectOfficeMime(buffer, name),
  (buffer) => detectBasicAudioMime(buffer),
  (buffer, name, declaredMime) => detectMatroskaMime(buffer, name, declaredMime),
  (buffer, name, declaredMime) => detectFtypMime(buffer, name, declaredMime),
  (buffer, name, declaredMime) => detectTextMime(buffer, name, declaredMime),
];

export function detectUploadedMime(file: UploadedFileLike): string | null {
  const buffer = file.buffer;
  const name = String(file.originalname || '').toLowerCase();
  const declaredMime = String(file.mimetype || '').toLowerCase();

  for (const detect of MIME_DETECTION_CHAIN) {
    const resolved = detect(buffer, name, declaredMime);
    if (resolved) return resolved;
  }
  return null;
}

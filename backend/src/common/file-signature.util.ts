export interface UploadedFileLike {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

function looksLikeUtf8Text(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return false;

  const decoded = sample.toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return false;
  }

  let suspiciousControlBytes = 0;
  for (const byte of sample) {
    const isAllowedControl = byte === 9 || byte === 10 || byte === 13;
    const isPrintable = byte >= 32 && byte <= 126;
    const isExtended = byte >= 128;
    if (!isAllowedControl && !isPrintable && !isExtended) {
      suspiciousControlBytes += 1;
    }
  }

  return suspiciousControlBytes / sample.length < 0.02;
}

export function detectUploadedMime(file: UploadedFileLike): string | null {
  const buffer = file.buffer;
  const name = String(file.originalname || '').toLowerCase();
  const declaredMime = String(file.mimetype || '').toLowerCase();

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }

  if (
    name.endsWith('.docx') &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  if (
    name.endsWith('.xlsx') &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  if (
    (name.endsWith('.doc') || name.endsWith('.xls')) &&
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  ) {
    return name.endsWith('.xls')
      ? 'application/vnd.ms-excel'
      : 'application/msword';
  }

  if (
    (buffer.length >= 3 &&
      buffer.subarray(0, 3).toString('ascii') === 'ID3') ||
    (buffer.length >= 2 &&
      buffer[0] === 0xff &&
      [0xf2, 0xf3, 0xfb].includes(buffer[1]))
  ) {
    return 'audio/mpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return 'audio/wav';
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return 'audio/ogg';
  }

  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3 &&
    (name.endsWith('.webm') || declaredMime.includes('webm'))
  ) {
    return declaredMime.startsWith('video/') ? 'video/webm' : 'audio/webm';
  }

  if ((name.endsWith('.txt') || declaredMime.includes('text')) && looksLikeUtf8Text(buffer)) {
    return 'text/plain';
  }

  return null;
}

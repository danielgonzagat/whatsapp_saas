const PATTERN_RE = /\.+$/g;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIMEO_ID_RE = /^\d+$/;

function coerceToString(value: unknown): string {
  return String(value || '');
}

function stripTrailingDots(value: string): string {
  return value.replace(PATTERN_RE, '');
}

function normalizeHost(hostname: string): string {
  const coerced = coerceToString(hostname).trim();
  const stripped = stripTrailingDots(coerced);
  return stripped.toLowerCase();
}

function isValidYouTubeId(value: string | null | undefined): value is string {
  const normalized = String(value || '').trim();
  if (normalized.length !== 11) {
    return false;
  }

  for (const char of normalized) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isDigit && !isUpper && !isLower && char !== '_' && char !== '-') {
      return false;
    }
  }

  return true;
}

function extractVimeoId(pathname: string): string | null {
  const segments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    let allDigits = segment.length > 0;
    for (const char of segment) {
      const code = char.charCodeAt(0);
      if (code < 48 || code > 57) {
        allDigits = false;
        break;
      }
    }
    if (allDigits) {
      return segment;
    }
  }

  return null;
}

function splitPathSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function extractYouTubeIdFromShortHost(segments: string[]): string | null {
  return segments[0] ?? null;
}

function extractYouTubeIdFromEmbed(segments: string[]): string | null {
  if (segments[0] !== 'embed') {
    return null;
  }
  return segments[1] ?? null;
}

function extractYouTubeId(url: URL, host: string): string | null {
  const queryId = url.searchParams.get('v');
  if (queryId) {
    return queryId;
  }

  const segments = splitPathSegments(url.pathname);

  if (host === 'youtu.be') {
    const shortId = extractYouTubeIdFromShortHost(segments);
    if (shortId) {
      return shortId;
    }
  }

  return extractYouTubeIdFromEmbed(segments);
}

/** To you tube embed url. */
export function toYouTubeEmbedUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = normalizeHost(url.hostname);
    if (!YOUTUBE_HOSTS.has(host)) {
      return '';
    }

    const videoId = extractYouTubeId(url, host);
    if (!isValidYouTubeId(videoId)) {
      return '';
    }

    return `https://www.youtube.com/embed/${videoId}`;
  } catch {
    return '';
  }
}

function isValidVimeoId(videoId: string | null): videoId is string {
  return !!videoId && VIMEO_ID_RE.test(videoId);
}

function isSafeEmbedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const host = normalizeHost(parsed.hostname);
    const pathname = parsed.pathname;

    if (host === 'www.youtube.com') {
      return /^\/embed\/[A-Za-z0-9_-]{11}$/.test(pathname);
    }

    if (host === 'player.vimeo.com') {
      return /^\/video\/\d+$/.test(pathname);
    }

    return false;
  } catch {
    return false;
  }
}

/** To supported embed url. */
export function toSupportedEmbedUrl(rawUrl: string): string | null {
  const youtubeUrl = toYouTubeEmbedUrl(rawUrl);
  if (youtubeUrl) {
    const embed = new URL(youtubeUrl);
    embed.searchParams.set('autoplay', '1');
    const safe = embed.toString();
    return isSafeEmbedUrl(safe) ? safe : null;
  }

  try {
    const url = new URL(rawUrl);
    const host = normalizeHost(url.hostname);
    if (!VIMEO_HOSTS.has(host)) {
      return null;
    }

    const videoId = extractVimeoId(url.pathname);
    if (!isValidVimeoId(videoId)) {
      return null;
    }

    const embed = new URL(`https://player.vimeo.com/video/${videoId}`);
    embed.searchParams.set('autoplay', '1');
    const safe = embed.toString();
    return isSafeEmbedUrl(safe) ? safe : null;
  } catch {
    return null;
  }
}

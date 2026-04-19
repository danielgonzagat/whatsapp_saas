import { describe, expect, it } from 'vitest';

import { detectSecuritySessionSurface } from './security-session-surface';

describe('detectSecuritySessionSurface', () => {
  it('classifies iPhone Safari as a mobile session', () => {
    const result = detectSecuritySessionSurface(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'America/Sao_Paulo',
    );

    expect(result).toEqual({
      device: 'Safari em iOS',
      detail: 'Sessão atual neste dispositivo • America/Sao_Paulo',
      deviceType: 'mobile',
    });
  });

  it('classifies Chrome on macOS as a desktop session', () => {
    const result = detectSecuritySessionSurface(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'America/New_York',
    );

    expect(result).toEqual({
      device: 'Chrome em macOS',
      detail: 'Sessão atual neste dispositivo • America/New_York',
      deviceType: 'desktop',
    });
  });

  it('classifies Windows browsers as monitor sessions', () => {
    const result = detectSecuritySessionSurface(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/123.0.0.0 Chrome/123.0.0.0 Safari/537.36',
      'Europe/London',
    );

    expect(result.deviceType).toBe('monitor');
    expect(result.device).toBe('Edge em Windows');
  });
});

import { describe, expect, it } from 'vitest';

import { getChannelAvailability } from './channel-availability';

describe('getChannelAvailability', () => {
  it('keeps email available because the surface is implemented', () => {
    expect(getChannelAvailability('email')).toEqual({
      blocked: false,
      title: null,
      description: null,
    });
  });

  it('keeps tiktok blocked while the channel is still placeholder-only', () => {
    expect(getChannelAvailability('tiktok')).toEqual({
      blocked: true,
      title: 'Em breve',
      description: 'TikTok Marketing está sendo finalizado.',
    });
  });

  it('leaves Meta-backed channels unblocked', () => {
    expect(getChannelAvailability('whatsapp').blocked).toBe(false);
    expect(getChannelAvailability('instagram').blocked).toBe(false);
    expect(getChannelAvailability('facebook').blocked).toBe(false);
  });
});

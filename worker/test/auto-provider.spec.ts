import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendText = vi.fn();
const mockSendMedia = vi.fn();

vi.mock('../providers/unified-whatsapp-provider', () => ({
  unifiedWhatsAppProvider: {
    sendText: mockSendText,
    sendMedia: mockSendMedia,
  },
}));

const mockGetWhatsAppProviderFromEnv = vi.fn();

vi.mock('../providers/whatsapp-provider-resolver', () => ({
  getWhatsAppProviderFromEnv: mockGetWhatsAppProviderFromEnv,
}));

vi.mock('../providers/health-monitor', () => ({
  providerStatus: {
    error: vi.fn(),
  },
}));

describe('auto-provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWhatsAppProviderFromEnv.mockReturnValue('meta-cloud');
  });

  describe('name', () => {
    it('has name "auto"', async () => {
      const { autoProvider } = await import('../providers/auto-provider');
      expect(autoProvider.name).toBe('auto');
    });
  });

  describe('sendText', () => {
    it('delegates to unifiedWhatsAppProvider with env provider', async () => {
      mockSendText.mockResolvedValue({ id: 'msg-1', status: 'SENT' });
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendText({ id: 'ws1' }, '+5511999999999', 'Hello');
      expect(result).toEqual({ id: 'msg-1', status: 'SENT' });
      expect(mockGetWhatsAppProviderFromEnv).toHaveBeenCalled();
      expect(mockSendText).toHaveBeenCalledWith(
        expect.objectContaining({ whatsappProvider: 'meta-cloud' }),
        '+5511999999999',
        'Hello',
      );
    });

    it('tracks provider error when result has error', async () => {
      mockSendText.mockResolvedValue({ error: 'timeout' });
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendText({ id: 'ws1' }, '+5511999999999', 'Hello');
      expect(result).toEqual({ error: 'timeout' });
    });

    it('returns error on thrown exception', async () => {
      mockSendText.mockRejectedValue(new Error('network error'));
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendText({ id: 'ws1' }, '+5511999999999', 'Hello');
      expect(result).toEqual({ error: 'network error' });
    });

    it('returns fallback error for non-Error throws', async () => {
      mockSendText.mockRejectedValue('boom');
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendText({ id: 'ws1' }, '+5511999999999', 'Hello');
      expect(result).toEqual({ error: 'meta_send_failed' });
    });
  });

  describe('sendMedia', () => {
    it('delegates to unifiedWhatsAppProvider.sendMedia', async () => {
      mockSendMedia.mockResolvedValue({ id: 'media-1', status: 'SENT' });
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendMedia(
        { id: 'ws1' },
        '+5511999999999',
        'image',
        'https://example.com/img.jpg',
        'caption',
      );
      expect(result).toEqual({ id: 'media-1', status: 'SENT' });
      expect(mockSendMedia).toHaveBeenCalledWith(
        expect.objectContaining({ whatsappProvider: 'meta-cloud' }),
        '+5511999999999',
        'image',
        'https://example.com/img.jpg',
        'caption',
      );
    });

    it('tracks error and returns error object on result error', async () => {
      mockSendMedia.mockResolvedValue({ error: 'upload_failed' });
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendMedia(
        { id: 'ws1' },
        '+5511999999999',
        'video',
        'https://example.com/vid.mp4',
      );
      expect(result).toEqual({ error: 'upload_failed' });
    });

    it('returns error on thrown exception', async () => {
      mockSendMedia.mockRejectedValue(new Error('timeout'));
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendMedia(
        { id: 'ws1' },
        '+5511999999999',
        'document',
        'https://example.com/doc.pdf',
      );
      expect(result).toEqual({ error: 'timeout' });
    });

    it('returns fallback error for non-Error media throws', async () => {
      mockSendMedia.mockRejectedValue(42);
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendMedia(
        { id: 'ws1' },
        '+5511999999999',
        'audio',
        'https://example.com/audio.mp3',
      );
      expect(result).toEqual({ error: 'meta_media_failed' });
    });
  });

  describe('sendTemplate', () => {
    it('falls back to sendText with template name and component count', async () => {
      mockSendText.mockResolvedValue({ id: 'tmpl-1', status: 'SENT' });
      const { autoProvider } = await import('../providers/auto-provider');
      const result = await autoProvider.sendTemplate(
        { id: 'ws1' },
        '+5511999999999',
        'hello_world',
        'pt_BR',
        [{ type: 'body', parameters: [{ type: 'text', text: 'John' }] }],
      );
      expect(result).toEqual({ id: 'tmpl-1', status: 'SENT' });
      expect(mockSendText).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws1', whatsappProvider: 'meta-cloud' }),
        '+5511999999999',
        'Template hello_world (pt_BR; 1 componente(s))',
      );
    });

    it('omits component suffix when no components', async () => {
      mockSendText.mockResolvedValue({ id: 'tmpl-2', status: 'SENT' });
      const { autoProvider } = await import('../providers/auto-provider');
      await autoProvider.sendTemplate({ id: 'ws1' }, '+5511999999999', 'hello_world', 'en', []);
      expect(mockSendText).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws1', whatsappProvider: 'meta-cloud' }),
        '+5511999999999',
        'Template hello_world',
      );
    });

    it('omits component suffix when components undefined', async () => {
      mockSendText.mockResolvedValue({ id: 'tmpl-3', status: 'SENT' });
      const { autoProvider } = await import('../providers/auto-provider');
      await autoProvider.sendTemplate({ id: 'ws1' }, '+5511999999999', 'hello_world', 'en');
      expect(mockSendText).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws1', whatsappProvider: 'meta-cloud' }),
        '+5511999999999',
        'Template hello_world',
      );
    });
  });
});

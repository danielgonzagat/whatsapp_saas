import { sendMessage } from './provider-send-message.helpers';

function makeDeps(
  overrides: Partial<{
    metaSendMessage: jest.Mock;
    metaSendMediaFromUrl: jest.Mock;
    opsAlert: jest.Mock;
    loggerError: jest.Mock;
    readRecord: jest.Mock;
  }> = {},
) {
  const metaCloudProvider = {
    sendMessage: overrides.metaSendMessage ?? jest.fn(),
    sendMediaFromUrl: overrides.metaSendMediaFromUrl ?? jest.fn(),
  };
  const opsAlert = overrides.opsAlert ? { alertOnCriticalError: overrides.opsAlert } : undefined;
  const logger = { error: overrides.loggerError ?? jest.fn() };
  const readRecord = overrides.readRecord ?? jest.fn((v: unknown) => v as Record<string, unknown>);

  return {
    metaCloudProvider: metaCloudProvider as unknown as Parameters<
      typeof sendMessage
    >[0]['metaCloudProvider'],
    opsAlert: opsAlert as unknown as Parameters<typeof sendMessage>[0]['opsAlert'],
    logger: logger as unknown as Parameters<typeof sendMessage>[0]['logger'],
    readRecord: readRecord as Parameters<typeof sendMessage>[0]['readRecord'],
  };
}

describe('provider-send-message.helpers', () => {
  describe('sendMessage — Meta Cloud path', () => {
    it('sends a text message via Meta Cloud and returns success with messageId', async () => {
      const metaSendMessage = jest.fn().mockResolvedValue({
        success: true,
        message: { id: 'wamid.abc123' },
      });
      const deps = makeDeps({ metaSendMessage });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Hello');

      expect(metaSendMessage).toHaveBeenCalledWith('ws-1', '5511999991111', 'Hello', {});
      expect(result).toEqual({ success: true, messageId: 'wamid.abc123' });
    });

    it('forwards quotedMessageId to Meta Cloud sendMessage', async () => {
      const metaSendMessage = jest.fn().mockResolvedValue({
        success: true,
        message: { id: 'wamid.def456' },
      });
      const deps = makeDeps({ metaSendMessage });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Reply', {
        quotedMessageId: 'wamid.quoted',
      });

      expect(metaSendMessage).toHaveBeenCalledWith('ws-1', '5511999991111', 'Reply', {
        quotedMessageId: 'wamid.quoted',
      });
      expect(result.messageId).toBe('wamid.def456');
    });

    it('sends media via Meta Cloud and returns success with messageId', async () => {
      const metaSendMediaFromUrl = jest.fn().mockResolvedValue({
        success: true,
        message: { id: 'wamid.media1' },
      });
      const deps = makeDeps({ metaSendMediaFromUrl });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Check this', {
        mediaUrl: 'https://example.com/image.png',
        mediaType: 'image',
        caption: 'Optional caption',
      });

      expect(metaSendMediaFromUrl).toHaveBeenCalledWith(
        'ws-1',
        '5511999991111',
        'https://example.com/image.png',
        'Optional caption',
        'image',
        {},
      );
      expect(result).toEqual({ success: true, messageId: 'wamid.media1' });
    });

    it('falls back message text as caption when no explicit caption', async () => {
      const metaSendMediaFromUrl = jest.fn().mockResolvedValue({
        success: true,
        message: { id: 'wamid.media2' },
      });
      const deps = makeDeps({ metaSendMediaFromUrl });

      await sendMessage(deps, 'ws-1', '5511999991111', 'Fallback caption', {
        mediaUrl: 'https://example.com/video.mp4',
        mediaType: 'video',
      });

      expect(metaSendMediaFromUrl).toHaveBeenCalledWith(
        'ws-1',
        '5511999991111',
        'https://example.com/video.mp4',
        'Fallback caption',
        'video',
        {},
      );
    });

    it('forwards quotedMessageId with media send', async () => {
      const metaSendMediaFromUrl = jest.fn().mockResolvedValue({
        success: true,
        message: { id: 'wamid.media3' },
      });
      const deps = makeDeps({ metaSendMediaFromUrl });

      await sendMessage(deps, 'ws-1', '5511999991111', 'Med', {
        mediaUrl: 'https://example.com/doc.pdf',
        mediaType: 'document',
        quotedMessageId: 'wamid.quoted',
      });

      expect(metaSendMediaFromUrl).toHaveBeenCalledWith(
        'ws-1',
        '5511999991111',
        'https://example.com/doc.pdf',
        'Med',
        'document',
        { quotedMessageId: 'wamid.quoted' },
      );
    });

    it('returns success:true even when messageId is missing', async () => {
      const metaSendMessage = jest.fn().mockResolvedValue({
        success: true,
        message: {},
      });
      const deps = makeDeps({ metaSendMessage });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Hi');

      expect(result).toEqual({ success: true });
    });

    it('returns success:false with messageId when Meta Cloud reports failure', async () => {
      const metaSendMessage = jest.fn().mockResolvedValue({
        success: false,
        message: { id: 'wamid.fail' },
      });
      const deps = makeDeps({ metaSendMessage });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Will fail');

      expect(result).toEqual({ success: false, messageId: 'wamid.fail' });
    });
  });

  describe('sendMessage — error handling', () => {
    it('returns success:false and logs when meta-cloud send throws', async () => {
      const metaSendMessage = jest.fn().mockRejectedValue(new Error('Network failure'));
      const opsAlert = jest.fn();
      const loggerError = jest.fn();
      const deps = makeDeps({ metaSendMessage, opsAlert, loggerError });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Msg');

      expect(result).toEqual({ success: false, error: 'Network failure' });
      expect(opsAlert).toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalledWith('Send failed: Network failure');
    });

    it('handles non-Error throws gracefully', async () => {
      const metaSendMessage = jest.fn().mockRejectedValue('raw string error');
      const opsAlert = jest.fn();
      const deps = makeDeps({ metaSendMessage, opsAlert });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Msg');

      expect(result).toEqual({ success: false, error: 'unknown error' });
    });

    it('tolerates missing opsAlert service', async () => {
      const metaSendMessage = jest.fn().mockRejectedValue(new Error('Boom'));
      const deps = makeDeps({ metaSendMessage });

      const result = await sendMessage(deps, 'ws-1', '5511999991111', 'Msg');

      expect(result).toEqual({ success: false, error: 'Boom' });
    });
  });
});

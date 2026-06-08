import { BadRequestException } from '@nestjs/common';
import { InstagramMarketingService } from './instagram-marketing.service';

jest.mock('../../meta/meta-token-crypto', () => ({
  decryptMetaToken: jest.fn((token: string | null | undefined) => token || null),
}));

describe('InstagramMarketingService', () => {
  const metaConnectionFindFirst = jest.fn();
  const sendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendDirectMessage — canonical dispatch flag (KLOEL_INSTAGRAM_CANONICAL_DISPATCH)', () => {
    const FLAG = 'KLOEL_INSTAGRAM_CANONICAL_DISPATCH';
    const canonicalDispatch = jest.fn();
    let priorFlag: string | undefined;
    let flaggedService: InstagramMarketingService;

    beforeEach(() => {
      priorFlag = process.env[FLAG];
      canonicalDispatch.mockReset();
      flaggedService = new InstagramMarketingService(
        { metaConnection: { findFirst: metaConnectionFindFirst } } as never,
        { sendMessage } as never,
        { dispatch: canonicalDispatch } as never,
      );
    });

    afterEach(() => {
      if (priorFlag === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = priorFlag;
      }
    });

    function connectedRow() {
      metaConnectionFindFirst.mockResolvedValue({
        instagramAccountId: 'ig-123',
        accessToken: 'user-token',
        pageAccessToken: 'page-token',
      });
    }

    describe('flag OFF (default)', () => {
      it('runs the existing InstagramService.sendMessage path and never touches the canonical service', async () => {
        delete process.env[FLAG];
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-raw' });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(canonicalDispatch).not.toHaveBeenCalled();
        expect(result.messageId).toBe('mid-raw');
      });

      it('treats a literal non-true flag value as OFF', async () => {
        process.env[FLAG] = 'false';
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-raw' });

        await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(canonicalDispatch).not.toHaveBeenCalled();
      });
    });

    describe('flag ON', () => {
      it('delegates to ChannelMessageDispatchService.dispatch with credential overrides and maps messageId', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockResolvedValue({
          success: true,
          messageId: 'mid-canonical',
          provider: 'meta-instagram',
          delivery: 'direct',
        });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', '  hello  ');

        expect(canonicalDispatch).toHaveBeenCalledWith('ws-1', 'instagram', 'igsid-1', 'hello', {
          igAccountId: 'ig-123',
          accessToken: 'page-token',
        });
        // The raw provider path is NOT used when delegating.
        expect(sendMessage).not.toHaveBeenCalled();
        expect(result.messageId).toBe('mid-canonical');
        expect(result.metaResponse).toEqual(
          expect.objectContaining({ success: true, messageId: 'mid-canonical' }),
        );
      });

      it('falls back to externalId when messageId is absent on the canonical result', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockResolvedValue({
          success: true,
          externalId: 'ext-9',
          provider: 'meta-instagram',
        });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(result.messageId).toBe('ext-9');
      });

      it('falls back to the raw path when the canonical service is not injected', async () => {
        process.env[FLAG] = 'true';
        // No canonical service provided (third ctor arg omitted).
        const noCanonical = new InstagramMarketingService(
          { metaConnection: { findFirst: metaConnectionFindFirst } } as never,
          { sendMessage } as never,
        );
        connectedRow();
        sendMessage.mockResolvedValue({ message_id: 'mid-fallback' });

        const result = await noCanonical.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(result.messageId).toBe('mid-fallback');
      });

      it('falls back to the raw path when the canonical dispatch throws', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockRejectedValue(new Error('di_build_failure'));
        sendMessage.mockResolvedValue({ message_id: 'mid-after-fallback' });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(canonicalDispatch).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(result.messageId).toBe('mid-after-fallback');
      });

      it('treats a failed canonical result (success:false) as a failure and falls back to the raw path', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        // The canonical adapter catches Meta send exceptions this way.
        canonicalDispatch.mockResolvedValue({
          success: false,
          provider: 'meta-instagram',
          error: 'meta_send_exception',
        });
        sendMessage.mockResolvedValue({ message_id: 'mid-after-fallback' });

        const result = await flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi');

        expect(canonicalDispatch).toHaveBeenCalledTimes(1);
        // Must not report the failed canonical send as a success with no id.
        expect(sendMessage).toHaveBeenCalledWith('ig-123', 'igsid-1', 'hi', 'page-token');
        expect(result.messageId).toBe('mid-after-fallback');
      });

      it('surfaces the raw Meta failure when the canonical result is success:false and the raw retry also fails', async () => {
        process.env[FLAG] = 'true';
        connectedRow();
        canonicalDispatch.mockResolvedValue({
          success: false,
          provider: 'meta-instagram',
          error: 'meta_send_exception',
        });
        // Raw path rethrows real Meta failures (graphApiPost re-throws) — the
        // caller must see the error, not a success-looking { messageId: null }.
        sendMessage.mockRejectedValue(new Error('meta_send_exception'));

        await expect(flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi')).rejects.toThrow(
          'meta_send_exception',
        );
        expect(canonicalDispatch).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledTimes(1);
      });

      it('still enforces the existing validation/connection guards before delegating', async () => {
        process.env[FLAG] = 'true';
        metaConnectionFindFirst.mockResolvedValue(null);

        await expect(
          flaggedService.sendDirectMessage('ws-1', 'igsid-1', 'hi'),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(canonicalDispatch).not.toHaveBeenCalled();
      });
    });
  });
});

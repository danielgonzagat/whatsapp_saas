/**
 * Tests for the channel-selector normalization + transactional-email builder in
 * {@link ChannelMessageDispatchService}'s pure helpers. Focus: the
 * `email_transactional` selector must normalize onto
 * {@link ChannelKind.EMAIL_TRANSACTIONAL} so the canonical tuple-dispatch path
 * (and `isConfigured`) recognize the registered transactional adapter instead
 * of falling through to `channel_not_supported`.
 *
 * @cluster Marketing/Channels/Dispatch
 * @see backend/src/marketing/channel-message-dispatch.helpers.ts
 */
import { ChannelKind } from '../common/channel-dispatch/channel-dispatch.port';
import {
  buildEmailTransactional,
  normalizeChannel,
} from './channel-message-dispatch.helpers';

describe('normalizeChannel', () => {
  it('maps the existing canonical channel selectors', () => {
    expect(normalizeChannel('whatsapp')).toBe(ChannelKind.WHATSAPP);
    expect(normalizeChannel('instagram')).toBe(ChannelKind.INSTAGRAM);
    expect(normalizeChannel('messenger')).toBe(ChannelKind.MESSENGER);
    expect(normalizeChannel('facebook')).toBe(ChannelKind.FACEBOOK);
    expect(normalizeChannel('email')).toBe(ChannelKind.EMAIL);
  });

  it('maps the transactional-email selector (string + enum forms)', () => {
    expect(normalizeChannel('email_transactional')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    expect(normalizeChannel('email-transactional')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    expect(normalizeChannel('EMAIL_TRANSACTIONAL')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    // The enum value stringifies to its raw form — the path used by callers
    // dispatching with ChannelKind.EMAIL_TRANSACTIONAL directly.
    expect(normalizeChannel(ChannelKind.EMAIL_TRANSACTIONAL)).toBe(
      ChannelKind.EMAIL_TRANSACTIONAL,
    );
  });

  it('returns null for unknown selectors', () => {
    expect(normalizeChannel('telegram')).toBeNull();
    expect(normalizeChannel('')).toBeNull();
  });
});

describe('buildEmailTransactional', () => {
  it('builds the discriminated EMAIL_TRANSACTIONAL input from the tuple', () => {
    const input = buildEmailTransactional('ws-1', 'user@example.com', '<p>body</p>', {
      subject: 'Receipt',
    });
    expect(input).toEqual({
      channelKind: ChannelKind.EMAIL_TRANSACTIONAL,
      workspaceId: 'ws-1',
      toEmail: 'user@example.com',
      subject: 'Receipt',
      html: '<p>body</p>',
    });
  });

  it('prefers opts.html over the message body and defaults subject to empty', () => {
    const input = buildEmailTransactional('ws-2', 'user@example.com', 'plain', {
      html: '<h1>Hi</h1>',
    });
    if (input.channelKind !== ChannelKind.EMAIL_TRANSACTIONAL) {
      throw new Error('expected EMAIL_TRANSACTIONAL input');
    }
    expect(input.html).toBe('<h1>Hi</h1>');
    expect(input.subject).toBe('');
  });
});

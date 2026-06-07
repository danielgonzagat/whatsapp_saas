/**
 * Spec for the EMAIL message-class routing facade (design item: EMAIL routing
 * decision — bucket C).
 *
 * Proves the facade is:
 *   1. INERT by default — flag OFF → blocked result, never an input.
 *   2. Correct when ON — routes `transactional` → `ChannelKind.EMAIL`
 *      (connected mailbox) and `campaign` → `ChannelKind.EMAIL_TRANSACTIONAL`
 *      (platform sender).
 *   3. Honest about missing required fields (no silent empty send).
 *   4. Pure on the routing TABLE (flag-independent), so the canonical mapping
 *      is always inspectable.
 */
import { ChannelKind } from '../../../common/channel-dispatch/channel-dispatch.port';
import {
  EMAIL_CLASS_TO_CHANNEL_KIND,
  resolveEmailChannelKind,
  routeEmail,
  type EmailRouteRequest,
} from './email-routing';

const FLAG = 'KLOEL_EMAIL_ROUTING_FACADE';

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  }
}

const baseReq: EmailRouteRequest = {
  workspaceId: 'ws-1',
  toEmail: 'dest@example.com',
  subject: 'Assunto',
  html: '<p>Olá</p>',
};

describe('email-routing — canonical mapping table', () => {
  it('maps transactional → connected-mailbox channel kind', () => {
    expect(EMAIL_CLASS_TO_CHANNEL_KIND.transactional).toBe(ChannelKind.EMAIL);
    expect(resolveEmailChannelKind('transactional')).toBe(ChannelKind.EMAIL);
  });

  it('maps campaign → platform/transactional channel kind', () => {
    expect(EMAIL_CLASS_TO_CHANNEL_KIND.campaign).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    expect(resolveEmailChannelKind('campaign')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
  });

  it('resolveEmailChannelKind is flag-independent (always honest)', () => {
    withFlag(undefined, () => {
      expect(resolveEmailChannelKind('campaign')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    });
    withFlag('true', () => {
      expect(resolveEmailChannelKind('campaign')).toBe(ChannelKind.EMAIL_TRANSACTIONAL);
    });
  });
});

describe('routeEmail — flag OFF (default, inert)', () => {
  it('returns a blocked result for transactional when flag is unset', () => {
    withFlag(undefined, () => {
      const out = routeEmail('transactional', baseReq);
      expect('channelKind' in out).toBe(false);
      expect((out as { blocked?: boolean }).blocked).toBe(true);
      expect((out as { blockedReason?: string }).blockedReason).toBe(
        'email_routing_facade_disabled',
      );
    });
  });

  it('returns a blocked result for campaign when flag is unset', () => {
    withFlag(undefined, () => {
      const out = routeEmail('campaign', baseReq);
      expect('channelKind' in out).toBe(false);
      expect((out as { blocked?: boolean }).blocked).toBe(true);
    });
  });

  it('treats any non-"true" value as OFF', () => {
    withFlag('1', () => {
      const out = routeEmail('campaign', baseReq);
      expect('channelKind' in out).toBe(false);
    });
    withFlag('false', () => {
      const out = routeEmail('campaign', baseReq);
      expect('channelKind' in out).toBe(false);
    });
  });
});

describe('routeEmail — flag ON', () => {
  it('routes transactional to ChannelKind.EMAIL (connected mailbox)', () => {
    withFlag('true', () => {
      const out = routeEmail('transactional', {
        workspaceId: 'ws-1',
        toEmail: 'dest@example.com',
        subject: 'Oi',
        html: '<p>Reply</p>',
        proactive: false,
      });
      expect('channelKind' in out).toBe(true);
      if ('channelKind' in out && out.channelKind === ChannelKind.EMAIL) {
        expect(out.workspaceId).toBe('ws-1');
        expect(out.toEmail).toBe('dest@example.com');
        expect(out.subject).toBe('Oi');
        expect(out.html).toBe('<p>Reply</p>');
        expect(out.proactive).toBe(false);
      } else {
        throw new Error('expected ChannelKind.EMAIL input');
      }
    });
  });

  it('routes transactional with only required fields (subject/html optional)', () => {
    withFlag('true', () => {
      const out = routeEmail('transactional', {
        workspaceId: 'ws-1',
        toEmail: 'dest@example.com',
      });
      expect('channelKind' in out).toBe(true);
      if ('channelKind' in out && out.channelKind === ChannelKind.EMAIL) {
        expect(out.subject).toBeUndefined();
        expect(out.html).toBeUndefined();
      } else {
        throw new Error('expected ChannelKind.EMAIL input');
      }
    });
  });

  it('routes campaign to ChannelKind.EMAIL_TRANSACTIONAL (platform sender)', () => {
    withFlag('true', () => {
      const out = routeEmail('campaign', {
        workspaceId: 'ws-2',
        toEmail: 'bulk@example.com',
        subject: 'Newsletter',
        html: '<h1>Hi</h1>',
        headers: { 'X-Campaign': 'spring' },
      });
      expect('channelKind' in out).toBe(true);
      if ('channelKind' in out && out.channelKind === ChannelKind.EMAIL_TRANSACTIONAL) {
        expect(out.workspaceId).toBe('ws-2');
        expect(out.toEmail).toBe('bulk@example.com');
        expect(out.subject).toBe('Newsletter');
        expect(out.html).toBe('<h1>Hi</h1>');
        expect(out.headers).toEqual({ 'X-Campaign': 'spring' });
      } else {
        throw new Error('expected ChannelKind.EMAIL_TRANSACTIONAL input');
      }
    });
  });

  it('blocks campaign send missing subject or html (no silent empty send)', () => {
    withFlag('true', () => {
      const noHtml = routeEmail('campaign', {
        workspaceId: 'ws-2',
        toEmail: 'bulk@example.com',
        subject: 'Newsletter',
      });
      expect('channelKind' in noHtml).toBe(false);
      expect((noHtml as { blockedReason?: string }).blockedReason).toBe(
        'subject_and_html_required',
      );

      const noSubject = routeEmail('campaign', {
        workspaceId: 'ws-2',
        toEmail: 'bulk@example.com',
        html: '<h1>Hi</h1>',
      });
      expect('channelKind' in noSubject).toBe(false);
    });
  });

  it('blocks when recipient is missing', () => {
    withFlag('true', () => {
      const out = routeEmail('transactional', {
        workspaceId: 'ws-1',
        toEmail: '',
      });
      expect('channelKind' in out).toBe(false);
      expect((out as { blockedReason?: string }).blockedReason).toBe('recipient_required');
    });
  });
});

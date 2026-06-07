import {
  ONBOARDING_SUBJECTS,
  buildResendBody,
  buildSendGridBody,
  buildSmtpMessage,
  buildUnsubscribeBundle,
  renderEmailTemplate,
  selectEmailProvider,
  stripHtmlTagsSafely,
} from './email.helpers';

describe('email.helpers', () => {
  describe('selectEmailProvider', () => {
    it('prefers resend over sendgrid and smtp', () => {
      expect(
        selectEmailProvider({
          RESEND_API_KEY: 'r',
          SENDGRID_API_KEY: 's',
          SMTP_HOST: 'h',
        }),
      ).toBe('resend');
    });

    it('falls back to sendgrid when resend missing', () => {
      expect(selectEmailProvider({ SENDGRID_API_KEY: 's', SMTP_HOST: 'h' })).toBe('sendgrid');
    });

    it('falls back to smtp when resend and sendgrid missing', () => {
      expect(selectEmailProvider({ SMTP_HOST: 'h' })).toBe('smtp');
    });

    it('returns log when nothing is configured', () => {
      expect(selectEmailProvider({})).toBe('log');
    });
  });

  describe('buildResendBody', () => {
    it('builds minimal payload without headers', () => {
      const body = buildResendBody({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
      });
      expect(body).toEqual({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
      });
      expect(body).not.toHaveProperty('headers');
    });

    it('includes headers when supplied', () => {
      const body = buildResendBody({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        headers: { 'List-Unsubscribe': '<https://example.com/u>' },
      });
      expect(body.headers).toEqual({ 'List-Unsubscribe': '<https://example.com/u>' });
    });
  });

  describe('buildSendGridBody', () => {
    it('builds personalization without headers', () => {
      const body = buildSendGridBody({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
      });
      expect(body).toEqual({
        personalizations: [{ to: [{ email: 'u@example.com' }] }],
        from: { email: 'noreply@kloel.com' },
        subject: 'Hi',
        content: [{ type: 'text/html', value: '<p>hi</p>' }],
      });
    });

    it('attaches headers to the personalization when supplied', () => {
      const body = buildSendGridBody({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        headers: { 'List-Unsubscribe': '<x>' },
      });
      const personalizations = body.personalizations as Array<Record<string, unknown>>;
      expect(personalizations[0].headers).toEqual({ 'List-Unsubscribe': '<x>' });
    });
  });

  describe('stripHtmlTagsSafely', () => {
    it('removes a single tag', () => {
      expect(stripHtmlTagsSafely('<p>hi</p>')).toBe('hi');
    });

    it('removes multiple tags in one input', () => {
      expect(stripHtmlTagsSafely('<p>hello</p><br/><b>world</b>')).toBe('helloworld');
    });

    it('iterates until convergence (loop terminates on no-change)', () => {
      // Pathological partial tag — the regex consumes the inner `<script>`,
      // leaving a dangling `<` that on its own no longer matches; the loop
      // detects no-change and exits.
      const out = stripHtmlTagsSafely('<<script>foo');
      expect(out).toBe('foo');
    });

    it('returns input unchanged when no tags are present', () => {
      expect(stripHtmlTagsSafely('plain text')).toBe('plain text');
    });
  });

  describe('buildSmtpMessage', () => {
    it('produces a multipart/alternative envelope with deterministic boundary', () => {
      const msg = buildSmtpMessage({
        from: 'noreply@kloel.com',
        to: 'u@example.com',
        subject: 'Hi',
        html: '<p>hi</p>',
        now: () => 1234567890,
      });
      expect(msg).toContain('From: noreply@kloel.com');
      expect(msg).toContain('To: u@example.com');
      expect(msg).toContain('Subject: Hi');
      expect(msg).toContain('boundary="BOUNDARY_1234567890"');
      expect(msg).toContain('--BOUNDARY_1234567890');
      expect(msg).toContain('--BOUNDARY_1234567890--');
      expect(msg).toContain('Content-Type: text/plain; charset=UTF-8');
      expect(msg).toContain('Content-Type: text/html; charset=UTF-8');
      // text/plain part should be the stripped version
      expect(msg).toContain('\r\nhi\r\n');
      // text/html part is the original
      expect(msg).toContain('<p>hi</p>');
      // CRLF separators
      expect(msg.split('\r\n').length).toBeGreaterThan(10);
    });
  });

  describe('renderEmailTemplate', () => {
    it('replaces placeholders with HTML-escaped values', () => {
      const out = renderEmailTemplate('Hello {{name}}', { name: '<b>Dan</b>' });
      expect(out).toBe('Hello &lt;b&gt;Dan&lt;/b&gt;');
    });

    it('renders unknown placeholders as empty string', () => {
      expect(renderEmailTemplate('A{{missing}}B', {})).toBe('AB');
    });

    it('leaves text without placeholders untouched', () => {
      expect(renderEmailTemplate('plain', {})).toBe('plain');
    });
  });

  describe('buildUnsubscribeBundle', () => {
    const OLD_JWT = process.env.JWT_SECRET;
    const OLD_FRONT = process.env.FRONTEND_URL;

    afterEach(() => {
      if (OLD_JWT === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = OLD_JWT;
      }
      if (OLD_FRONT === undefined) {
        delete process.env.FRONTEND_URL;
      } else {
        process.env.FRONTEND_URL = OLD_FRONT;
      }
    });

    it('appends the unsubscribe footer to the html body', () => {
      process.env.JWT_SECRET = 'test-secret';
      process.env.FRONTEND_URL = 'https://test.kloel.com';
      const { html } = buildUnsubscribeBundle('<p>body</p>', {
        email: 'u@example.com',
        workspaceId: 'ws1',
      });
      expect(html.startsWith('<p>body</p>')).toBe(true);
      expect(html.length).toBeGreaterThan('<p>body</p>'.length);
    });

    it('returns headers when JWT signing is available', () => {
      process.env.JWT_SECRET = 'test-secret';
      process.env.FRONTEND_URL = 'https://test.kloel.com';
      const { headers } = buildUnsubscribeBundle('<p>body</p>', {
        email: 'u@example.com',
        workspaceId: 'ws1',
      });
      expect(headers).toBeDefined();
      expect(headers).toMatchObject({
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
      expect(headers['List-Unsubscribe']).toMatch(/^<https?:\/\//);
    });

    it('propagates the underlying token signer error when JWT secret is missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
      // The footer util mandates a signing secret; absence is a config bug,
      // not something the helper should silently swallow.
      expect(() => buildUnsubscribeBundle('<p>body</p>', { email: 'u@example.com' })).toThrow(
        /EMAIL_UNSUBSCRIBE_SECRET/,
      );
    });

    it('handles audiences with no workspaceId when secret is configured', () => {
      process.env.JWT_SECRET = 'test-secret';
      process.env.FRONTEND_URL = 'https://test.kloel.com';
      const { html, headers } = buildUnsubscribeBundle('<p>body</p>', { email: 'u@example.com' });
      expect(html.startsWith('<p>body</p>')).toBe(true);
      expect(headers).toBeDefined();
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    });
  });

  describe('ONBOARDING_SUBJECTS', () => {
    it('contains all three onboarding day subjects', () => {
      expect(ONBOARDING_SUBJECTS['onboarding-day1']).toBe('Primeiros passos no KLOEL');
      expect(ONBOARDING_SUBJECTS['onboarding-day3']).toBe(
        'Recursos avancados que voce precisa conhecer',
      );
      expect(ONBOARDING_SUBJECTS['onboarding-day7']).toBe('Hora de escalar com o KLOEL!');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(ONBOARDING_SUBJECTS)).toBe(true);
    });
  });
});

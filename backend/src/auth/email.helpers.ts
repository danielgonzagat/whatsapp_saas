import { escapeHtml } from '../common/utils/html-escape.util';
import {
  buildListUnsubscribeHeader,
  buildUnsubscribeFooterHtml,
} from '../common/utils/unsubscribe-footer.util';
import { PLACEHOLDER_RE } from '../common/regex';

/**
 * Pure helpers for {@link EmailService}.
 *
 * Everything here is side-effect free and provider-agnostic so it can be
 * exercised by unit tests without spinning a Nest TestingModule. The service
 * keeps only orchestration and IO (HTTP, SMTP, env reads, prisma hook).
 */

/** Resolve the active provider purely from env vars. */
export function selectEmailProvider(
  env: NodeJS.ProcessEnv = process.env,
): 'resend' | 'sendgrid' | 'smtp' | 'log' {
  if (env.RESEND_API_KEY) {
    return 'resend';
  }
  if (env.SENDGRID_API_KEY) {
    return 'sendgrid';
  }
  if (env.SMTP_HOST) {
    return 'smtp';
  }
  return 'log';
}

/** Build the JSON body sent to the Resend `/emails` endpoint. */
export function buildResendBody(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
  };
  if (args.headers) {
    body.headers = args.headers;
  }
  return body;
}

/** Build the JSON body sent to the SendGrid `/v3/mail/send` endpoint. */
export function buildSendGridBody(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}): Record<string, unknown> {
  const personalization: Record<string, unknown> = { to: [{ email: args.to }] };
  if (args.headers) {
    personalization.headers = args.headers;
  }
  return {
    personalizations: [personalization],
    from: { email: args.from },
    subject: args.subject,
    content: [{ type: 'text/html', value: args.html }],
  };
}

/** Repeatedly strip HTML tags until no `<…>` substring remains. */
export function stripHtmlTagsSafely(input: string): string {
  let previous: string;
  let current = input;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current;
}

/**
 * Construct the multipart/alternative MIME envelope used by the bare-bones
 * SMTP transport. Boundary is timestamp-based to keep messages unique but
 * remains deterministic if a clock is supplied for testing.
 */
export function buildSmtpMessage(args: {
  from: string;
  to: string;
  subject: string;
  html: string;
  now?: () => number;
}): string {
  const ts = (args.now ?? Date.now)();
  const boundary = `BOUNDARY_${ts}`;
  const lines = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    `Subject: ${args.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    stripHtmlTagsSafely(args.html),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    args.html,
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

/**
 * Render a cached HTML template, replacing every `{{name}}` placeholder
 * with the HTML-escaped value of `vars[name]`. Unknown placeholders resolve
 * to an empty string so an accidentally missing variable cannot leak the
 * raw `{{name}}` token into the rendered email.
 */
export function renderEmailTemplate(source: string, vars: Record<string, string>): string {
  return source.replace(PLACEHOLDER_RE, (_match, key: string) => escapeHtml(vars[key] ?? ''));
}

/** Bundle that captures HTML body + List-Unsubscribe headers for one email. */
export interface UnsubscribeBundle {
  html: string;
  headers: Record<string, string> | undefined;
}

/**
 * Append the unsubscribe footer to an outgoing HTML body and, when JWT
 * signing is available, build the matching `List-Unsubscribe` /
 * `List-Unsubscribe-Post` header pair. When the signer cannot mint a token
 * (no JWT secret in env), the body is still augmented with the visible
 * footer but the headers come back `undefined` so the caller does not
 * advertise one-click unsubscribe that would 401.
 */
export function buildUnsubscribeBundle(
  html: string,
  audience: { email: string; workspaceId?: string },
): UnsubscribeBundle {
  const audienceArg: { email: string; workspaceId?: string } = { email: audience.email };
  if (audience.workspaceId !== undefined) {
    audienceArg.workspaceId = audience.workspaceId;
  }
  const footer = buildUnsubscribeFooterHtml(audienceArg);
  const headerValue = buildListUnsubscribeHeader(audienceArg);
  const headers: Record<string, string> | undefined = headerValue
    ? {
        'List-Unsubscribe': headerValue,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : undefined;
  return { html: html + footer, headers };
}

/** Static map of onboarding template subjects keyed by template name. */
export const ONBOARDING_SUBJECTS: Readonly<
  Record<'onboarding-day1' | 'onboarding-day3' | 'onboarding-day7', string>
> = Object.freeze({
  'onboarding-day1': 'Primeiros passos no KLOEL',
  'onboarding-day3': 'Recursos avancados que voce precisa conhecer',
  'onboarding-day7': 'Hora de escalar com o KLOEL!',
});

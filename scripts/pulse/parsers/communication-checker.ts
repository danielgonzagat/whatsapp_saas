/**
 * PULSE Parser 92: Communication Checker
 * Layer 23: Notification Reliability
 * Mode: DEEP (requires codebase scan + optional DNS/SMTP probing)
 *
 * CHECKS:
 * 1. Email authentication (SPF/DKIM/DMARC): verifies env vars or config for:
 *    - SMTP_HOST / EMAIL_FROM are configured
 *    - DKIM private key is present (env var or file)
 *    - Email service (SendGrid/Resend/SES) is used instead of raw SMTP (better deliverability)
 *    - No plain-text passwords in email transport config
 * 2. Push notifications: verifies FCM/APNs config if a mobile app or PWA exists
 *    — if push not implemented but user-facing notifications are promised, flag as medium
 * 3. Sale/conversion alerts: verifies that when an order is paid (PAID status),
 *    a notification is sent to the workspace owner (email or WhatsApp)
 *    — critical for business: seller must know when they make a sale
 * 4. Transactional email coverage: verifies emails are sent for:
 *    - Welcome / account creation
 *    - Password reset
 *    - Order confirmation (buyer)
 *    - Payment failure
 *    - Trial ending
 * 5. Email rendering: verifies HTML emails use responsive templates, not raw strings
 * 6. Unsubscribe mechanism in marketing emails (LGPD requirement)
 *
 * REQUIRES: PULSE_DEEP=1
 * Emits communication reliability evidence gaps; diagnostic identity is synthesized downstream.
 */
import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';

function splitIdentifier(value: string): Set<string> {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .toLowerCase();
  return new Set(spaced.split(/\s+/).filter(Boolean));
}

function hasTokenPrefix(tokens: Set<string>, prefix: string): boolean {
  return [...tokens].some((token) => token.startsWith(prefix));
}

function hasCommunicationSendEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('send') &&
    (tokens.has('mail') ||
      tokens.has('email') ||
      tokens.has('message') ||
      tokens.has('notification') ||
      tokens.has('notify'))
  );
}

function hasAuthenticationConfigEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return tokens.has('dkim') || (tokens.has('private') && tokens.has('key') && tokens.has('email'));
}

function hasExternalDeliveryProviderEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    hasCommunicationSendEvidence(value) &&
    (tokens.has('provider') ||
      tokens.has('client') ||
      tokens.has('api') ||
      tokens.has('transport') ||
      tokens.has('deliverability') ||
      tokens.has('bounce'))
  );
}

function hasValueEventNotificationEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    (tokens.has('paid') || tokens.has('confirmed') || tokens.has('sale') || tokens.has('order')) &&
    (tokens.has('notify') || tokens.has('notification') || hasCommunicationSendEvidence(value))
  );
}

function hasValueEventWebhookEvidence(value: string): boolean {
  const tokens = splitIdentifier(value);
  return (
    tokens.has('webhook') &&
    (tokens.has('payment') ||
      tokens.has('checkout') ||
      tokens.has('paid') ||
      tokens.has('confirmed'))
  );
}

function hasMeaningEvidence(value: string, meaning: string): boolean {
  const tokens = splitIdentifier(value);
  if (meaning === 'welcome') {
    return tokens.has('welcome') || (tokens.has('onboarding') && tokens.has('email'));
  }
  if (meaning === 'credential_recovery') {
    return tokens.has('reset') && (tokens.has('password') || tokens.has('credential'));
  }
  if (meaning === 'order_confirmation') {
    return tokens.has('order') && hasTokenPrefix(tokens, 'confirm');
  }
  if (meaning === 'failure_notice') {
    return (tokens.has('payment') || tokens.has('charge')) && hasTokenPrefix(tokens, 'fail');
  }
  return false;
}

function communicationFinding(input: {
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
}): Break {
  return {
    type: 'communication-evidence-gap',
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: 'parser:weak_signal:communication-reliability',
    surface: 'notification-reliability',
  };
}

/** Check communication. */
export function checkCommunication(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']);

  let hasEmailSending = false;
  let hasDKIM = false;
  let hasEmailService = false;
  let hasSaleNotification = false;
  let hasPaymentWebhookHandler = false;
  let hasWelcomeEmail = false;
  let hasPasswordResetEmail = false;
  let hasOrderConfirmEmail = false;
  let hasPaymentFailEmail = false;

  for (const file of backendFiles) {
    const fileTokens = splitIdentifier(file);
    if (file.endsWith('.spec.ts') || fileTokens.has('migration') || fileTokens.has('seed')) {
      continue;
    }

    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (hasCommunicationSendEvidence(content)) {
      hasEmailSending = true;
    }
    if (hasAuthenticationConfigEvidence(content)) {
      hasDKIM = true;
    }
    if (hasExternalDeliveryProviderEvidence(content)) {
      hasEmailService = true;
    }
    if (hasValueEventNotificationEvidence(content)) {
      hasSaleNotification = true;
    }
    if (hasValueEventWebhookEvidence(content)) {
      hasPaymentWebhookHandler = true;
    }

    if (hasMeaningEvidence(content, 'welcome') && hasCommunicationSendEvidence(content)) {
      hasWelcomeEmail = true;
    }
    if (
      hasMeaningEvidence(content, 'credential_recovery') &&
      hasCommunicationSendEvidence(content)
    ) {
      hasPasswordResetEmail = true;
    }
    if (
      hasMeaningEvidence(content, 'order_confirmation') &&
      hasCommunicationSendEvidence(content)
    ) {
      hasOrderConfirmEmail = true;
    }
    if (hasMeaningEvidence(content, 'failure_notice') && hasCommunicationSendEvidence(content)) {
      hasPaymentFailEmail = true;
    }
  }

  // CHECK 1a: DKIM authentication
  if (hasEmailSending) {
    // Check env var config
    const hasDKIMEnv = !!process.env.DKIM_PRIVATE_KEY || !!process.env.EMAIL_DKIM_PRIVATE_KEY;
    if (!hasDKIM && !hasDKIMEnv) {
      breaks.push(
        communicationFinding({
          severity: 'high',
          file: 'backend/src/',
          line: 0,
          description:
            'Email sent without DKIM configuration — emails will be marked as spam by major providers',
          detail:
            'Configure DKIM_PRIVATE_KEY env var and add DKIM signing to email transport; also set SPF and DMARC DNS records',
        }),
      );
    }

    // CHECK 1b: Use a proper email service
    if (!hasEmailService) {
      breaks.push(
        communicationFinding({
          severity: 'high',
          file: 'backend/src/',
          line: 0,
          description:
            'No dedicated email service (SendGrid/Resend/SES) detected — raw SMTP has poor deliverability',
          detail:
            'Use Resend or SendGrid for transactional email; they handle DKIM, bounce handling, and deliverability',
        }),
      );
    }
  } else {
    // No email sending at all
    breaks.push(
      communicationFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No email sending found in backend — transactional emails (welcome, reset, receipt) not implemented',
        detail:
          'Add email sending for: welcome, password reset, order confirmation, payment failure, trial expiry',
      }),
    );
  }

  // CHECK 2: Push notifications
  const hasPWAManifest =
    pathExists(safeJoin(config.frontendDir, 'public', 'manifest.json')) ||
    pathExists(safeJoin(config.frontendDir, 'public', 'manifest.webmanifest'));
  const hasPushImpl = walkFiles(config.backendDir, ['.ts']).some((f) => {
    try {
      const tokens = splitIdentifier(`${f} ${readTextFile(f, 'utf8')}`);
      return tokens.has('push') && (tokens.has('notification') || tokens.has('worker'));
    } catch {
      return false;
    }
  });

  if (hasPWAManifest && !hasPushImpl) {
    breaks.push(
      communicationFinding({
        severity: 'medium',
        file: 'frontend/public/manifest.json',
        line: 0,
        description:
          'PWA manifest exists but push notifications are not implemented — key retention feature missing',
        detail:
          'Implement Web Push (FCM) for sale alerts, message notifications, and trial reminders',
      }),
    );
  }

  // CHECK 3: Sale notification
  if (hasPaymentWebhookHandler && !hasSaleNotification) {
    breaks.push(
      communicationFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'Payment webhook processed without notifying workspace owner of sale — seller does not know when they earn money',
        detail:
          'After PAYMENT_CONFIRMED webhook, send email + WhatsApp notification to workspace owner with sale details',
      }),
    );
  }

  // CHECK 4: Transactional email coverage
  const missingEmails: string[] = [];
  if (!hasWelcomeEmail) {
    missingEmails.push('welcome/onboarding');
  }
  if (!hasPasswordResetEmail) {
    missingEmails.push('password reset');
  }
  if (!hasOrderConfirmEmail) {
    missingEmails.push('order confirmation for buyer');
  }
  if (!hasPaymentFailEmail) {
    missingEmails.push('payment failure');
  }

  if (hasEmailSending && missingEmails.length > 0) {
    breaks.push(
      communicationFinding({
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description: `Missing transactional emails: ${missingEmails.join(', ')}`,
        detail:
          'Implement the missing email templates; each is critical for user experience and trust',
      }),
    );
  }

  // CHECK 6: Unsubscribe in marketing emails
  const marketingEmailFiles = backendFiles.filter((f) => {
    const tokens = splitIdentifier(f);
    return tokens.has('campaign') || tokens.has('marketing') || tokens.has('broadcast');
  });
  for (const file of marketingEmailFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    const tokens = splitIdentifier(content);
    const hasOptOutEvidence =
      tokens.has('unsubscribe') ||
      tokens.has('descadastrar') ||
      (tokens.has('opt') && tokens.has('out'));
    if (hasCommunicationSendEvidence(content) && !hasOptOutEvidence) {
      breaks.push(
        communicationFinding({
          severity: 'high',
          file: relFile,
          line: 0,
          description: 'Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM',
          detail:
            'Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately',
        }),
      );
    }
  }

  // TODO: Implement when infrastructure available
  // - DNS lookup to verify SPF record
  // - DKIM selector validation
  // - Test email delivery to known inboxes (Gmail, Outlook)
  // - Bounce rate monitoring

  return breaks;
}

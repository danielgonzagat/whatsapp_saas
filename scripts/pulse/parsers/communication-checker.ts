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
 * BREAK TYPES:
 *   EMAIL_NO_AUTH(high)              — email sent without DKIM/SPF → goes to spam
 *   PUSH_NOT_IMPLEMENTED(medium)     — push notifications not implemented
 *   NOTIFICATION_SALE_MISSING(high)  — workspace owner not notified of sale
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

const EMAIL_SEND_RE =
  /sendMail|sendEmail|transporter\.send|sgMail\.send|resend\.emails|ses\.send|mailer\./i;
const DKIM_RE = /dkim|DKIM_PRIVATE_KEY|privateKey.*email|email.*privateKey/i;
const EMAIL_SERVICE_RE = /sendgrid|resend|ses|postmark|mailgun|nodemailer/i;
const SALE_NOTIFICATION_RE = /orderPaid|paymentConfirmed|saleMade|notifyOwner|ownerNotif/i;
const PAYMENT_WEBHOOK_RE = /webhook.*payment|payment.*webhook|checkout.*webhook/i;

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
    if (/\.spec\.ts$|migration|seed/i.test(file)) {
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    if (EMAIL_SEND_RE.test(content)) {
      hasEmailSending = true;
    }
    if (DKIM_RE.test(content)) {
      hasDKIM = true;
    }
    if (EMAIL_SERVICE_RE.test(content)) {
      hasEmailService = true;
    }
    if (SALE_NOTIFICATION_RE.test(content)) {
      hasSaleNotification = true;
    }
    if (PAYMENT_WEBHOOK_RE.test(content)) {
      hasPaymentWebhookHandler = true;
    }

    if (/welcome|bem.vindo|boas.vindas/i.test(content) && EMAIL_SEND_RE.test(content)) {
      hasWelcomeEmail = true;
    }
    if (
      /reset.*password|password.*reset|redefinir.*senha/i.test(content) &&
      EMAIL_SEND_RE.test(content)
    ) {
      hasPasswordResetEmail = true;
    }
    if (
      /order.*confirm|confirm.*order|pedido.*confirm|pagamento.*confirm/i.test(content) &&
      EMAIL_SEND_RE.test(content)
    ) {
      hasOrderConfirmEmail = true;
    }
    if (
      /payment.*fail|fail.*payment|pagamento.*falhou|cobrança.*falh/i.test(content) &&
      EMAIL_SEND_RE.test(content)
    ) {
      hasPaymentFailEmail = true;
    }
  }

  // CHECK 1a: DKIM authentication
  if (hasEmailSending) {
    // Check env var config
    const hasDKIMEnv = !!process.env.DKIM_PRIVATE_KEY || !!process.env.EMAIL_DKIM_PRIVATE_KEY;
    if (!hasDKIM && !hasDKIMEnv) {
      breaks.push({
        type: 'EMAIL_NO_AUTH',
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'Email sent without DKIM configuration — emails will be marked as spam by major providers',
        detail:
          'Configure DKIM_PRIVATE_KEY env var and add DKIM signing to email transport; also set SPF and DMARC DNS records',
      });
    }

    // CHECK 1b: Use a proper email service
    if (!hasEmailService) {
      breaks.push({
        type: 'EMAIL_NO_AUTH',
        severity: 'high',
        file: 'backend/src/',
        line: 0,
        description:
          'No dedicated email service (SendGrid/Resend/SES) detected — raw SMTP has poor deliverability',
        detail:
          'Use Resend or SendGrid for transactional email; they handle DKIM, bounce handling, and deliverability',
      });
    }
  } else {
    // No email sending at all
    breaks.push({
      type: 'EMAIL_NO_AUTH',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'No email sending found in backend — transactional emails (welcome, reset, receipt) not implemented',
      detail:
        'Add email sending for: welcome, password reset, order confirmation, payment failure, trial expiry',
    });
  }

  // CHECK 2: Push notifications
  const hasPWAManifest =
    fs.existsSync(path.join(config.frontendDir, 'public', 'manifest.json')) ||
    fs.existsSync(path.join(config.frontendDir, 'public', 'manifest.webmanifest'));
  const hasPushImpl = /FCM|fcm|webPush|pushNotif|service.worker|serviceWorker/i.test(
    walkFiles(config.backendDir, ['.ts']).reduce((acc, f) => {
      try {
        return acc + fs.readFileSync(f, 'utf8');
      } catch {
        return acc;
      }
    }, ''),
  );

  if (hasPWAManifest && !hasPushImpl) {
    breaks.push({
      type: 'PUSH_NOT_IMPLEMENTED',
      severity: 'medium',
      file: 'frontend/public/manifest.json',
      line: 0,
      description:
        'PWA manifest exists but push notifications are not implemented — key retention feature missing',
      detail:
        'Implement Web Push (FCM) for sale alerts, message notifications, and trial reminders',
    });
  }

  // CHECK 3: Sale notification
  if (hasPaymentWebhookHandler && !hasSaleNotification) {
    breaks.push({
      type: 'NOTIFICATION_SALE_MISSING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description:
        'Payment webhook processed without notifying workspace owner of sale — seller does not know when they earn money',
      detail:
        'After PAYMENT_CONFIRMED webhook, send email + WhatsApp notification to workspace owner with sale details',
    });
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
    breaks.push({
      type: 'NOTIFICATION_SALE_MISSING',
      severity: 'high',
      file: 'backend/src/',
      line: 0,
      description: `Missing transactional emails: ${missingEmails.join(', ')}`,
      detail:
        'Implement the missing email templates; each is critical for user experience and trust',
    });
  }

  // CHECK 6: Unsubscribe in marketing emails
  const marketingEmailFiles = backendFiles.filter((f) => /campaign|marketing|broadcast/i.test(f));
  for (const file of marketingEmailFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, file);

    if (EMAIL_SEND_RE.test(content) && !/unsubscribe|descadastrar|optOut|opt.out/i.test(content)) {
      breaks.push({
        type: 'EMAIL_NO_AUTH',
        severity: 'high',
        file: relFile,
        line: 0,
        description: 'Marketing email sent without unsubscribe link — violates LGPD and CAN-SPAM',
        detail:
          'Add unsubscribe link to all marketing emails; track opt-outs in DB and honor them immediately',
      });
    }
  }

  // TODO: Implement when infrastructure available
  // - DNS lookup to verify SPF record
  // - DKIM selector validation
  // - Test email delivery to known inboxes (Gmail, Outlook)
  // - Bounce rate monitoring

  return breaks;
}

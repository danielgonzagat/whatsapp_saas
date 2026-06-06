/**
 * TransactionalEmailDispatchAdapter — implements `ChannelDispatchPort` for the
 * TRANSACTIONAL email channel (`ChannelKind.EMAIL_TRANSACTIONAL`).
 *
 * Unlike {@link EmailDispatchAdapter} (which routes through the workspace's
 * CONNECTED mailbox — Gmail / Microsoft / IMAP-SMTP), this adapter routes
 * through the platform's transactional sender: it delegates to the SAME
 * `EmailService.sendEmail` (Resend / SendGrid / env-SMTP from
 * `noreply@kloel.com`) used by auth, checkout and onboarding mail. Routing a
 * campaign send through this adapter therefore preserves the EXACT provider
 * and sender identity — no provider swap, no behavioral change to the
 * underlying sender.
 *
 * This unblocks census P2-2: campaign email can now flow through the canonical
 * `ChannelDispatchRegistry.send()` front door, using a distinct channel kind so
 * it never collides with the connected-mailbox `email` adapter.
 *
 * ADDITIVE: new adapter, new channel kind. No existing dispatch path changes.
 *
 * @cluster Marketing/Channels/Email
 * @see backend/src/common/channel-dispatch/channel-dispatch.port.ts
 * @see backend/src/auth/email.service.ts
 * @see docs/adr/0012-kloel-omnicore-channel-unification.md
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ChannelDispatchPort,
  ChannelKind,
  ChannelSendInput,
  ChannelSendResult,
} from '../../../common/channel-dispatch/channel-dispatch.port';
import { EmailService } from '../../../auth/email.service';

@Injectable()
export class TransactionalEmailDispatchAdapter implements ChannelDispatchPort {
  readonly channelKind = ChannelKind.EMAIL_TRANSACTIONAL;

  private readonly logger = new Logger(TransactionalEmailDispatchAdapter.name);

  constructor(@Optional() private readonly email: EmailService | null = null) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (input.channelKind !== ChannelKind.EMAIL_TRANSACTIONAL) {
      return { success: false, provider: 'email_transactional', error: 'wrong channel kind' };
    }

    if (!this.email) {
      return {
        success: false,
        provider: 'email_transactional',
        error: 'transactional email service not configured',
        blocked: true,
        blockedReason: 'channel_email_transactional_not_configured',
      };
    }

    try {
      const ok = await this.email.sendEmail({
        to: input.toEmail,
        subject: input.subject,
        html: input.html,
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
      });

      if (!ok) {
        return {
          success: false,
          provider: 'email_transactional',
          error: 'transactional_send_failed',
        };
      }

      return {
        success: true,
        provider: 'email_transactional',
        delivery: 'direct',
      };
    } catch (error) {
      this.logger.error(
        `Transactional email send failed for workspace=${input.workspaceId} to=${input.toEmail}: ${
          error instanceof Error ? error.message : 'unknown_error'
        }`,
      );
      return {
        success: false,
        provider: 'email_transactional',
        error: error instanceof Error ? error.message : 'transactional_email_send_failed',
      };
    }
  }

  /** Canonical alias of {@link send} (Wave 21 unification — task d). */
  sendMessage(input: ChannelSendInput): Promise<ChannelSendResult> {
    return this.send(input);
  }

  isConfigured(): boolean {
    return Boolean(this.email);
  }
}

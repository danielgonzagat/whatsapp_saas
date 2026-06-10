import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MindMemoryItemService } from '../kloel/mind/aliases/mind-memory-item.service';

/**
 * Per-user e-mail notification preferences, persisted in the EXISTING
 * KloelMemory key-value table (`@@unique([workspaceId, key])`, category
 * `preferences`) — no new Prisma model / migration.
 *
 * Honest scope: the only automatic, optional e-mail category the platform
 * sends to the account owner today is the onboarding/tips sequence
 * (day 1/3/7, dispatched by WelcomeAndOnboardingEmailService). Security and
 * legal e-mails (verification, password reset, magic link, GDPR receipts)
 * are intentionally NOT represented here — they must never be disabled.
 */
export const NOTIFICATION_PREFERENCES_KEY_PREFIX = 'notification-prefs:user:';

/** Toggleable e-mail notification categories for one user. */
export interface EmailNotificationPreferences {
  /** Onboarding/tips sequence (day 1/3/7) + product tips e-mails. */
  emailTips: boolean;
}

/**
 * Defaults mirror the live behavior before this feature existed: the
 * onboarding sequence was sent unconditionally, so an absent preference
 * means "enabled".
 */
export const DEFAULT_EMAIL_NOTIFICATION_PREFERENCES: EmailNotificationPreferences = {
  emailTips: true,
};

/** KloelMemory key for one agent's notification preferences. */
export function notificationPreferencesKey(agentId: string): string {
  return `${NOTIFICATION_PREFERENCES_KEY_PREFIX}${agentId}`;
}

/** Coerce a stored JSON value into a complete preferences object. */
export function parseStoredNotificationPreferences(value: unknown): EmailNotificationPreferences {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    emailTips:
      typeof record.emailTips === 'boolean'
        ? record.emailTips
        : DEFAULT_EMAIL_NOTIFICATION_PREFERENCES.emailTips,
  };
}

/** Keep only known boolean toggles from an untrusted partial payload. */
export function sanitizeNotificationPreferencesUpdate(
  partial: Record<string, unknown> | null | undefined,
): Partial<EmailNotificationPreferences> {
  const updates: Partial<EmailNotificationPreferences> = {};
  if (partial && typeof partial.emailTips === 'boolean') {
    updates.emailTips = partial.emailTips;
  }
  return updates;
}

/** Reads/writes per-user e-mail notification preferences. */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly mindMemory?: MindMemoryItemService,
  ) {}

  /**
   * Canonical memory accessor — the alias `.items` getter IS the
   * `prisma.kloelMemory` delegate (same RAC_KloelMemory table), so reads and
   * writes stay on the canonical Mind surface while remaining byte-identical.
   */
  private get kloelMemoryItems() {
    return this.mindMemory?.items ?? this.prisma.kloelMemory;
  }

  /** Current preferences for one user (defaults when never saved). */
  async getPreferences(
    workspaceId: string,
    agentId: string,
  ): Promise<EmailNotificationPreferences> {
    const row = await this.kloelMemoryItems.findUnique({
      where: { workspaceId_key: { workspaceId, key: notificationPreferencesKey(agentId) } },
      select: { value: true },
    });
    if (!row) {
      return { ...DEFAULT_EMAIL_NOTIFICATION_PREFERENCES };
    }
    return parseStoredNotificationPreferences(row.value);
  }

  /** Merge + persist a partial update; returns the full saved preferences. */
  async updatePreferences(
    workspaceId: string,
    agentId: string,
    partial: Partial<EmailNotificationPreferences>,
  ): Promise<EmailNotificationPreferences> {
    const current = await this.getPreferences(workspaceId, agentId);
    const next: EmailNotificationPreferences = {
      ...current,
      ...sanitizeNotificationPreferencesUpdate(partial),
    };
    const key = notificationPreferencesKey(agentId);
    await this.kloelMemoryItems.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      update: { value: next as unknown as Prisma.InputJsonValue },
      create: {
        workspaceId,
        key,
        value: next as unknown as Prisma.InputJsonValue,
        category: 'preferences',
        type: 'notification-preferences',
      },
    });
    return next;
  }

  /**
   * ENFORCEMENT hook for the onboarding/tips e-mail sender. Resolves the
   * agent by (workspaceId, email) — the only identity the queued job
   * carries — then answers whether the `emailTips` category is enabled.
   *
   * Fail-open on infrastructure errors: an unreachable preferences read
   * must not silently kill onboarding e-mails for everyone (that would be
   * a behavior change nobody asked for); the toggle's OFF state is only
   * honored when it was actually read.
   */
  async isOnboardingEmailAllowed(workspaceId: string | undefined, email: string): Promise<boolean> {
    try {
      const agent = await this.prisma.agent.findFirst({
        where: workspaceId ? { workspaceId, email } : { email },
        select: { id: true, workspaceId: true },
      });
      if (!agent) {
        return true;
      }
      const preferences = await this.getPreferences(agent.workspaceId, agent.id);
      return preferences.emailTips;
    } catch (error: unknown) {
      this.logger.warn(
        `Notification preference lookup failed for ${email}: ${
          error instanceof Error ? error.message : 'unknown_error'
        } — defaulting to send`,
      );
      return true;
    }
  }
}

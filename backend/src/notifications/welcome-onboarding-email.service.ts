import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { EmailService } from '../auth/email.service';
import { getRedisUrl } from '../common/redis/redis.util';
import { OpsAlertService } from '../observability/ops-alert.service';

type OnboardingEmailJob = {
  email: string;
  agentName: string;
  template: 'onboarding-day1' | 'onboarding-day3' | 'onboarding-day7';
  workspaceId?: string;
};

const QUEUE_NAME = 'onboarding-email-jobs';

/**
 * Handles welcome and onboarding transactional emails.
 *
 * Welcome email is sent immediately via EmailService.
 * Onboarding sequence (day 1, 3, 7) is scheduled via BullMQ delayed jobs.
 */
@Injectable()
export class WelcomeAndOnboardingEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WelcomeAndOnboardingEmailService.name);
  private queue: Queue<OnboardingEmailJob> | null = null;
  private worker: Worker<OnboardingEmailJob> | null = null;

  constructor(
    private readonly emailService: EmailService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  onModuleInit() {
    void this.initWorker();
  }

  private initWorker() {
    try {
      const connection = { url: getRedisUrl() };
      this.queue = new Queue<OnboardingEmailJob>(QUEUE_NAME, { connection });
      this.worker = new Worker<OnboardingEmailJob>(
        QUEUE_NAME,
        async (job) => {
          const { email, agentName, template, workspaceId } = job.data;
          this.logger.log(`Processing onboarding email: ${template} for ${email}`);
          await this.emailService.sendOnboardingEmail(email, agentName, template, workspaceId);
        },
        {
          connection,
          concurrency: 2,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Onboarding email sent: ${job.data.template} to ${job.data.email}`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `Onboarding email failed: ${job?.data.template} to ${job?.data.email}: ${err.message}`,
        );
      });

      this.logger.log('Onboarding email queue worker started');
    } catch (err) {
      void this.opsAlert?.alertOnCriticalError(err, 'WelcomeAndOnboardingEmailService.async');
      this.logger.warn(
        `Redis not available — onboarding email scheduling disabled (${(err as Error)?.message})`,
      );
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
  }

  /** Send immediate welcome email (fire-and-forget, errors logged). */
  async sendWelcomeEmail(
    email: string,
    agentName: string,
    workspaceName: string,
    workspaceId?: string,
  ): Promise<void> {
    try {
      await this.emailService.sendWelcomeEmail(email, agentName, workspaceName, workspaceId);
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (err) {
      void this.opsAlert?.alertOnCriticalError(
        err,
        'WelcomeAndOnboardingEmailService.sendWelcomeEmail',
      );
      this.logger.error(`Welcome email failed for ${email}: ${(err as Error)?.message}`);
    }
  }

  /**
   * Schedule the 3-email onboarding sequence: day 1 (24h), day 3 (72h), day 7 (168h).
   * Delays are in milliseconds.
   */
  async scheduleOnboardingSequence(
    email: string,
    agentName: string,
    workspaceId?: string,
  ): Promise<void> {
    if (!this.queue) {
      this.logger.warn('Queue not available — skipping onboarding schedule');
      return;
    }

    const templates: Array<{
      template: OnboardingEmailJob['template'];
      delayMs: number;
    }> = [
      { template: 'onboarding-day1', delayMs: 24 * 60 * 60 * 1000 },
      { template: 'onboarding-day3', delayMs: 3 * 24 * 60 * 60 * 1000 },
      { template: 'onboarding-day7', delayMs: 7 * 24 * 60 * 60 * 1000 },
    ];

    for (const { template, delayMs } of templates) {
      await this.queue.add(
        template,
        { email, agentName, template, workspaceId },
        { delay: delayMs, jobId: `onboarding:${template}:${email}` },
      );
    }

    this.logger.log(`Onboarding sequence scheduled for ${email}`);
  }
}

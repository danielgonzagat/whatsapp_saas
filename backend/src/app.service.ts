import { Injectable, Logger } from '@nestjs/common';

/** App service. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/app.service.ts
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class AppService {
  private readonly logger = new Logger(AppService.name);

  /** Get hello. */
  getHello(): string {
    this.logger.log('AppService initialized');
    return 'Hello World!';
  }
}

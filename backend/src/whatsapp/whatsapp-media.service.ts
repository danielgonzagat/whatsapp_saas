import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { NON_DIGIT_RE } from '../common/phone';

@Injectable()
export class WhatsappMediaService {
  private readonly logger = StructuredLogger.from(WhatsappMediaService.name);

  constructor() {
    this.logger.debug?.(`WhatsappMediaService initialized`);
  }

  normalizeNumber(num: string): string {
    return num.replace(NON_DIGIT_RE, '');
  }

  normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
}

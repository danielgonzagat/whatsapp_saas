import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { normalizeNumber } from './whatsapp-service.helpers';

@Injectable()
export class WhatsappMediaService {
  private readonly logger = StructuredLogger.from(WhatsappMediaService.name);

  constructor() {
    this.logger.debug?.(`WhatsappMediaService initialized`);
  }

  normalizeNumber(num: string): string {
    return normalizeNumber(num);
  }

  normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
}

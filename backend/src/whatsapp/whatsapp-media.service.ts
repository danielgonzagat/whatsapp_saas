import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';

const D_RE = /\D/g;

@Injectable()
export class WhatsappMediaService {
  private readonly logger = StructuredLogger.from(WhatsappMediaService.name);

  constructor() {
    this.logger.debug?.(`WhatsappMediaService initialized`);
  }

  normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }

  normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
}

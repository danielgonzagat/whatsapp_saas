import { Injectable, Logger } from '@nestjs/common';

const D_RE = /\D/g;

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);

  normalizeNumber(num: string): string {
    return num.replace(D_RE, '');
  }

  normalizeChatId(chatId: string): string {
    return String(chatId || '').includes('@') ? chatId : `${this.normalizeNumber(chatId)}@c.us`;
  }
}

import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { createRedisClient } from '../common/redis/redis.util';

@Injectable()
export class MassSendService {
  private queue: Queue;

  constructor(private readonly whatsappService: WhatsappService) {
    this.queue = new Queue('mass-send', {
      connection: createRedisClient(),
    });
  }

  async enqueueCampaign(
    workspaceId: string,
    user: string,
    numbers: string[],
    message: string,
  ) {
    if (!workspaceId) {
      throw new Error('workspaceId é obrigatório');
    }
    if (!Array.isArray(numbers) || numbers.length === 0) {
      throw new Error('Lista de números é obrigatória');
    }
    if (!message || !message.trim()) {
      throw new Error('Mensagem não pode ser vazia');
    }

    // Sanitiza e remove duplicados
    const sanitized = Array.from(
      new Set(
        numbers
          .map((n) => (n || '').replace(/\D/g, ''))
          .filter((n) => n.length > 5),
      ),
    );

    if (sanitized.length === 0) {
      throw new Error('Nenhum número válido após sanitização');
    }

    const job = await this.queue.add('dispatch', {
      workspaceId,
      user,
      numbers: sanitized,
      message,
    });
    return { jobId: job.id };
  }
}

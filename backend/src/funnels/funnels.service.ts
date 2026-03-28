import { Injectable, Logger } from '@nestjs/common';
import { WhatsappService } from '../whatsapp/whatsapp.service';

// Tipagem profissional
interface FunnelStep {
  type: 'message' | 'delay';
  text?: string;
  seconds?: number;
}

interface Funnel {
  name: string;
  trigger: string;
  steps: FunnelStep[];
}

@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);
  private funnels: Funnel[] = [];

  constructor(private readonly whatsappService: WhatsappService) {}

  registerFunnel(funnel: Funnel) {
    this.logger.log('Registrando funil: ' + funnel.name);
    this.funnels.push(funnel);
  }

  async handleIncomingMessage(msg: any) {
    const user = 'Daniel'; // sessão fixa por enquanto
    const text = msg.body.toLowerCase();

    for (const funnel of this.funnels) {
      if (text.includes(funnel.trigger.toLowerCase())) {
        this.logger.log('Ativando funil: ' + funnel.name);

        for (const step of funnel.steps) {
          if (step.type === 'message') {
            await this.whatsappService.sendMessage(
              user,
              msg.from,
              step.text ?? '',
            );
          }

          if (step.type === 'delay') {
            await new Promise((r) => setTimeout(r, (step.seconds ?? 1) * 1000));
          }
        }
      }
    }
  }
}

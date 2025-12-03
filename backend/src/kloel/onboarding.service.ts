import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly steps = [
    { id: 'welcome', question: 'Bem-vindo ao KLOEL! Qual é o nome do seu negócio?', field: 'businessName' },
    { id: 'segment', question: 'Qual é o segmento? (1. E-commerce, 2. Serviços, 3. Infoprodutos)', field: 'segment' },
    { id: 'whatsapp', question: 'Qual é o WhatsApp do seu negócio? (Ex: 11999999999)', field: 'whatsappNumber' },
    { id: 'products', question: 'Quais são seus principais produtos/serviços?', field: 'products' },
    { id: 'goal', question: 'Qual seu objetivo principal? (1. Vendas, 2. Leads, 3. Atendimento)', field: 'mainGoal' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async startOnboarding(workspaceId: string) {
    await this.saveState(workspaceId, { currentStep: 0, data: {}, completed: false });
    return { message: this.steps[0].question, step: 1, total: this.steps.length };
  }

  async processResponse(workspaceId: string, response: string) {
    const state = await this.getState(workspaceId);
    if (!state || state.completed) {
      return { message: 'Onboarding já concluído!', completed: true, step: this.steps.length, total: this.steps.length };
    }

    const currentStep = this.steps[state.currentStep];
    state.data[currentStep.field] = response;
    state.currentStep++;

    if (state.currentStep >= this.steps.length) {
      state.completed = true;
      await this.saveState(workspaceId, state);
      await this.finalize(workspaceId, state.data);
      return {
        message: `Onboarding concluído! Seu negócio "${state.data.businessName}" está configurado.`,
        step: this.steps.length,
        total: this.steps.length,
        completed: true,
        data: state.data,
      };
    }

    await this.saveState(workspaceId, state);
    return {
      message: this.steps[state.currentStep].question,
      step: state.currentStep + 1,
      total: this.steps.length,
      completed: false,
    };
  }

  async getStatus(workspaceId: string) {
    const state = await this.getState(workspaceId);
    return { started: !!state, completed: state?.completed || false, currentStep: state?.currentStep || 0, totalSteps: this.steps.length };
  }

  private async saveState(workspaceId: string, state: any) {
    const prismaAny = this.prisma as any;
    await prismaAny.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'onboarding_state' } },
      create: { workspaceId, key: 'onboarding_state', value: state, category: 'system' },
      update: { value: state },
    });
  }

  private async getState(workspaceId: string) {
    const prismaAny = this.prisma as any;
    const memory = await prismaAny.kloelMemory.findUnique({ where: { workspaceId_key: { workspaceId, key: 'onboarding_state' } } });
    return memory?.value as any;
  }

  private async finalize(workspaceId: string, data: any) {
    const prismaAny = this.prisma as any;
    for (const [key, value] of Object.entries(data)) {
      await prismaAny.kloelMemory.create({ data: { workspaceId, key, value, category: 'business' } }).catch(() => {});
    }
    this.logger.log(`Onboarding finalizado para ${workspaceId}`);
  }
}

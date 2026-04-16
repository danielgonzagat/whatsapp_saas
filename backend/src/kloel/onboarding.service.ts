import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shape persistido em `kloelMemory.value` para a chave `onboarding_state`.
 * `kloelMemory.value` é `Prisma.JsonValue`, então a narrowing é feita em
 * `getState()` antes do retorno. Qualquer outra chave de kloelMemory tem
 * shape diferente e não deve usar esse tipo.
 */
interface OnboardingState {
  currentStep: number;
  data: Record<string, string>;
  completed: boolean;
}

function isOnboardingState(value: unknown): value is OnboardingState {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.currentStep === 'number' &&
    typeof v.completed === 'boolean' &&
    typeof v.data === 'object' &&
    v.data !== null
  );
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly steps = [
    {
      id: 'welcome',
      question: 'Bem-vindo ao KLOEL! Qual é o nome do seu negócio?',
      field: 'businessName',
    },
    {
      id: 'segment',
      question: 'Qual é o segmento? (1. E-commerce, 2. Serviços, 3. Infoprodutos)',
      field: 'segment',
    },
    {
      id: 'whatsapp',
      question: 'Qual é o WhatsApp do seu negócio? (Ex: 11999999999)',
      field: 'whatsappNumber',
    },
    {
      id: 'products',
      question: 'Quais são seus principais produtos/serviços?',
      field: 'products',
    },
    {
      id: 'goal',
      question: 'Qual seu objetivo principal? (1. Vendas, 2. Leads, 3. Atendimento)',
      field: 'mainGoal',
    },
  ];

  constructor(private readonly prisma: PrismaService) {}

  async startOnboarding(workspaceId: string) {
    await this.saveState(workspaceId, {
      currentStep: 0,
      data: {},
      completed: false,
    });
    return {
      message: this.steps[0].question,
      step: 1,
      total: this.steps.length,
    };
  }

  async processResponse(workspaceId: string, response: string) {
    const state = await this.getState(workspaceId);
    if (!state || state.completed) {
      return {
        message: 'Onboarding já concluído!',
        completed: true,
        step: this.steps.length,
        total: this.steps.length,
      };
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
    return {
      started: !!state,
      completed: state?.completed || false,
      currentStep: state?.currentStep || 0,
      totalSteps: this.steps.length,
    };
  }

  private async saveState(workspaceId: string, state: OnboardingState): Promise<void> {
    await this.prisma.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key: 'onboarding_state' } },
      create: {
        workspaceId,
        key: 'onboarding_state',
        value: state as unknown as Prisma.InputJsonValue,
        category: 'system',
      },
      update: { value: state as unknown as Prisma.InputJsonValue },
    });
  }

  private async getState(workspaceId: string): Promise<OnboardingState | null> {
    const memory = await this.prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'onboarding_state' } },
    });
    if (!memory?.value) return null;
    if (!isOnboardingState(memory.value)) {
      this.logger.warn(
        `kloelMemory[onboarding_state] for workspace=${workspaceId} has unexpected shape; treating as uninitialised.`,
      );
      return null;
    }
    return memory.value;
  }

  private async finalize(workspaceId: string, data: Record<string, string>): Promise<void> {
    // biome-ignore lint/performance/noAwaitInLoops: sequential workspace settings update
    for (const [key, value] of Object.entries(data)) {
      await this.prisma.kloelMemory
        .create({
          data: {
            workspaceId,
            key,
            value: value satisfies Prisma.InputJsonValue,
            category: 'business',
          },
        })
        .catch((err) => this.logger.warn('Failed to save onboarding memory', err.message));
    }
    this.logger.log(`Onboarding finalizado para ${workspaceId}`);
  }
}

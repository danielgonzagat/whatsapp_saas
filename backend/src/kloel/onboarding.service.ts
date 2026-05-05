import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { forEachSequential } from '../common/async-sequence';
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

interface OnboardingProfileInput {
  userType: string;
  productType: string;
  primaryChannel: string;
  hasProduct: boolean;
  hasCheckout: boolean;
  aiUseCase: string;
}

const SETUP_CHECKLIST_KEYS = [
  'profile',
  'product',
  'checkout',
  'payment',
  'channel',
  'ai',
] as const;

function isOnboardingState(value: unknown): value is OnboardingState {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.currentStep === 'number' &&
    typeof v.completed === 'boolean' &&
    typeof v.data === 'object' &&
    v.data !== null
  );
}

/** Onboarding service. */
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

  async saveProfile(workspaceId: string, input: OnboardingProfileInput) {
    const profile = {
      userType: input.userType,
      productType: input.productType,
      primaryChannel: input.primaryChannel,
      hasProduct: input.hasProduct,
      hasCheckout: input.hasCheckout,
      aiUseCase: input.aiUseCase,
      savedAt: new Date().toISOString(),
    };
    const checklist = this.buildChecklist(profile);

    await this.prisma.$transaction(async (tx) => {
      await tx.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_profile' } },
        create: {
          workspaceId,
          key: 'onboarding_profile',
          value: profile,
          category: 'system',
          type: 'onboarding_profile',
        },
        update: {
          value: profile,
          category: 'system',
          type: 'onboarding_profile',
        },
      });

      await tx.kloelMemory.upsert({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_setup_checklist' } },
        create: {
          workspaceId,
          key: 'onboarding_setup_checklist',
          value: checklist,
          category: 'system',
          type: 'setup_checklist',
        },
        update: {
          value: checklist,
          category: 'system',
          type: 'setup_checklist',
        },
      });
    });

    return {
      completed: false,
      profile,
      checklist,
      nextMissingStep: checklist.find((item) => item.completed === false)?.key ?? null,
    };
  }

  /** Start onboarding. */
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

  /** Process response. */
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

  /** Get status. */
  async getStatus(workspaceId: string) {
    const [state, profileMemory, checklistMemory] = await Promise.all([
      this.getState(workspaceId),
      this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_profile' } },
      }),
      this.prisma.kloelMemory.findUnique({
        where: { workspaceId_key: { workspaceId, key: 'onboarding_setup_checklist' } },
      }),
    ]);
    return {
      started: !!state,
      completed: state?.completed || false,
      currentStep: state?.currentStep || 0,
      totalSteps: this.steps.length,
      profile: profileMemory?.value ?? null,
      checklist: checklistMemory?.value ?? this.buildChecklist(null),
    };
  }

  private buildChecklist(profile: OnboardingProfileInput | null) {
    const completed = {
      profile: Boolean(profile),
      product: Boolean(profile?.hasProduct),
      checkout: Boolean(profile?.hasCheckout),
      payment: false,
      channel: Boolean(profile?.primaryChannel),
      ai: Boolean(profile?.aiUseCase),
    };

    return SETUP_CHECKLIST_KEYS.map((key) => ({
      key,
      completed: completed[key],
    }));
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
    if (!memory?.value) {
      return null;
    }
    if (!isOnboardingState(memory.value)) {
      this.logger.warn(
        `kloelMemory[onboarding_state] for workspace=${workspaceId} has unexpected shape; treating as uninitialised.`,
      );
      return null;
    }
    return memory.value;
  }

  private async finalize(workspaceId: string, data: Record<string, string>): Promise<void> {
    await forEachSequential(Object.entries(data), async ([key, value]) => {
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
    });
    this.logger.log(`Onboarding finalizado para ${workspaceId}`);
  }
}

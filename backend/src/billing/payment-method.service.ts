import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

/**
 * 💳 Payment Method Service
 * 
 * Gerencia métodos de pagamento (cartões) via Stripe.
 * Permite criar Setup Intents, anexar cartões e listar métodos salvos.
 */
@Injectable()
export class PaymentMethodService {
  private stripe: Stripe | null = null;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      // Evita travar em versões específicas tipadas pelo SDK.
      this.stripe = new Stripe(secretKey);
    }
  }

  /**
   * Obtém ou cria um Stripe Customer para o workspace
   */
  async getOrCreateCustomerId(workspaceId: string): Promise<string> {
    // O schema atual persiste customerId no próprio Workspace.
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, stripeCustomerId: true },
    });

    if (!workspace) {
      throw new Error('Workspace não encontrado');
    }

    if (workspace.stripeCustomerId) {
      return workspace.stripeCustomerId;
    }

    if (!this.stripe) {
      throw new Error('Stripe não configurado');
    }

    // Criar customer no Stripe
    const customer = await this.stripe.customers.create({
      name: workspace.name,
      metadata: {
        workspaceId,
        workspaceName: workspace.name,
      },
    });

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  /**
   * Cria um Setup Intent para adicionar cartão
   */
  async createSetupIntent(workspaceId: string) {
    if (!this.stripe) {
      throw new Error('Stripe não configurado');
    }

    const customerId = await this.getOrCreateCustomerId(workspaceId);

    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        workspaceId,
      },
    });

    return {
      clientSecret: setupIntent.client_secret,
      customerId,
    };
  }

  /**
   * Anexa um Payment Method ao customer e define como padrão
   */
  async attachPaymentMethod(workspaceId: string, paymentMethodId: string) {
    if (!this.stripe) {
      throw new Error('Stripe não configurado');
    }

    const customerId = await this.getOrCreateCustomerId(workspaceId);

    // Anexar método ao cliente
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Definir como método padrão para faturas
    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Buscar detalhes do método
    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

    return {
      ok: true,
      paymentMethod: {
        id: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
      },
    };
  }

  /**
   * Lista todos os métodos de pagamento do workspace
   */
  async listPaymentMethods(workspaceId: string) {
    if (!this.stripe) {
      return { paymentMethods: [] };
    }

    try {
      const customerId = await this.getOrCreateCustomerId(workspaceId);

      const methods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      // Buscar método padrão
      const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer;
      const defaultMethodId = typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id;

      return {
        paymentMethods: methods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
          isDefault: pm.id === defaultMethodId,
        })),
      };
    } catch (error: any) {
      console.error('Erro ao listar payment methods:', error.message);
      return { paymentMethods: [] };
    }
  }

  /**
   * Define um método de pagamento como padrão
   */
  async setDefaultPaymentMethod(workspaceId: string, paymentMethodId: string) {
    if (!this.stripe) {
      throw new Error('Stripe não configurado');
    }

    const customerId = await this.getOrCreateCustomerId(workspaceId);

    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return { ok: true };
  }

  /**
   * Remove um método de pagamento
   */
  async detachPaymentMethod(workspaceId: string, paymentMethodId: string) {
    if (!this.stripe) {
      throw new Error('Stripe não configurado');
    }

    // Verificar se o método pertence ao workspace
    const customerId = await this.getOrCreateCustomerId(workspaceId);
    const paymentMethod = await this.stripe.paymentMethods.retrieve(paymentMethodId);

    if (paymentMethod.customer !== customerId) {
      throw new Error('Método de pagamento não pertence a este workspace');
    }

    await this.stripe.paymentMethods.detach(paymentMethodId);

    return { ok: true };
  }
}

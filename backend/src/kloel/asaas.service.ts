import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpfCnpj?: string;
}

interface AsaasPayment {
  id: string;
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  dueDate: string;
  description: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  status: string;
}

interface AsaasConfig {
  apiKey: string;
  environment: 'sandbox' | 'production';
}

/** Dynamic Prisma accessor — bypasses generated types for models/relations not yet in schema. */

type PrismaDynamic = Record<string, Record<string, (...args: any[]) => any>>;

interface AsaasPaymentWebhook {
  id: string;
  value: number;
  confirmedDate?: string;
  paymentDate?: string;
}

@Injectable()
export class AsaasService implements OnModuleInit {
  private readonly logger = new Logger(AsaasService.name);
  private configs: Map<string, AsaasConfig> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const prismaAny = this.prisma as unknown as PrismaDynamic;
      const configs = await prismaAny.kloelConfig.findMany({
        where: { key: 'asaas_api_key' },
        take: 500,
      });
      if (configs.length > 0) {
        // Batch-fetch environment configs to avoid N+1
        const workspaceIds = configs.map((c: any) => c.workspaceId);
        const envConfigs = await prismaAny.kloelConfig.findMany({
          where: { workspaceId: { in: workspaceIds }, key: 'asaas_environment' },
          select: { workspaceId: true, value: true },
          take: 500,
        }).catch(() => []);
        const envByWorkspace = new Map(
          (envConfigs as any[]).map((c: any) => [c.workspaceId, c.value]),
        );
        for (const config of configs) {
          this.configs.set(config.workspaceId, {
            apiKey: config.value,
            environment:
              (envByWorkspace.get(config.workspaceId) as 'sandbox' | 'production') || 'sandbox',
          });
        }
      }
      if (configs.length > 0) {
        this.logger.log(
          `Loaded Asaas configs for ${configs.length} workspace(s) from database`,
        );
      }
    } catch {
      this.logger.warn('Could not load Asaas configs from database on startup');
    }
  }

  private getBaseUrl(environment: 'sandbox' | 'production'): string {
    return environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  private getEnvFallbackConfig(): AsaasConfig | null {
    const apiKey = process.env.ASAAS_API_KEY;
    if (!apiKey) {
      return null;
    }

    const environment =
      process.env.ASAAS_ENVIRONMENT === 'production'
        ? 'production'
        : 'sandbox';

    return { apiKey, environment };
  }

  private getConfig(workspaceId: string): AsaasConfig | null {
    return this.configs.get(workspaceId) || this.getEnvFallbackConfig();
  }

  async connectWorkspace(
    workspaceId: string,
    apiKey: string,
    environment: 'sandbox' | 'production' = 'sandbox',
  ): Promise<{ success: boolean; accountInfo?: Record<string, unknown> }> {
    const baseUrl = this.getBaseUrl(environment);

    try {
      // Validate API key by fetching account info
      const response = await fetch(`${baseUrl}/myAccount`, {
        headers: {
          access_token: apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new HttpException(
          'Invalid Asaas API key',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const accountInfo = (await response.json()) as Record<string, unknown>;

      // Store config in memory (in production, save to database)
      this.configs.set(workspaceId, { apiKey, environment });

      // Save to database
      const prismaAny = this.prisma as unknown as PrismaDynamic;
      await prismaAny.kloelConfig
        .upsert({
          where: { workspaceId_key: { workspaceId, key: 'asaas_api_key' } },
          update: { value: apiKey },
          create: { workspaceId, key: 'asaas_api_key', value: apiKey },
        })
        .catch(() => {
          // Table might not exist, just log
          this.logger.warn('Could not save Asaas config to database');
        });

      await prismaAny.kloelConfig
        .upsert({
          where: { workspaceId_key: { workspaceId, key: 'asaas_environment' } },
          update: { value: environment },
          create: { workspaceId, key: 'asaas_environment', value: environment },
        })
        .catch(() => {
          this.logger.warn('Could not save Asaas environment to database');
        });

      this.logger.log(
        `Workspace ${workspaceId} connected to Asaas (${environment})`,
      );

      return {
        success: true,
        accountInfo: {
          name: accountInfo.name,
          email: accountInfo.email,
          company: accountInfo.company,
          environment,
        },
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect Asaas: ${errMsg}`);
      throw new HttpException(
        errMsg || 'Failed to connect to Asaas',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async disconnectWorkspace(workspaceId: string): Promise<void> {
    this.configs.delete(workspaceId);

    try {
      const prismaAny = this.prisma as unknown as PrismaDynamic;
      await prismaAny.kloelConfig.deleteMany({
        where: {
          workspaceId,
          key: { in: ['asaas_api_key', 'asaas_environment'] },
        },
      });
    } catch {
      /* table might not exist */
    }

    this.logger.log(`Workspace ${workspaceId} disconnected from Asaas`);
  }

  async getConnectionStatus(workspaceId: string): Promise<{
    connected: boolean;
    environment?: string;
    accountName?: string;
  }> {
    const config = this.getConfig(workspaceId);

    if (!config) {
      return { connected: false };
    }

    try {
      const baseUrl = this.getBaseUrl(config.environment);
      const response = await fetch(`${baseUrl}/myAccount`, {
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        this.configs.delete(workspaceId);
        return { connected: false };
      }

      const account = await response.json();
      return {
        connected: true,
        environment: config.environment,
        accountName: account.name || account.company,
      };
    } catch {
      return { connected: false };
    }
  }

  async createOrGetCustomer(
    workspaceId: string,
    data: { name: string; phone: string; email?: string; cpfCnpj?: string },
  ): Promise<AsaasCustomer> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    // First, try to find existing customer by phone
    const searchResponse = await fetch(
      `${baseUrl}/customers?mobilePhone=${data.phone}`,
      {
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.data && searchResult.data.length > 0) {
        return searchResult.data[0];
      }
    }

    // Create new customer
    const createResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        mobilePhone: data.phone,
        email: data.email,
        cpfCnpj: data.cpfCnpj,
        notificationDisabled: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create customer',
        HttpStatus.BAD_REQUEST,
      );
    }

    return createResponse.json();
  }

  async createPixPayment(
    workspaceId: string,
    data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      amount: number;
      description: string;
      externalReference?: string;
    },
  ): Promise<{
    id: string;
    pixQrCodeUrl: string;
    pixCopyPaste: string;
    dueDate: string;
    status: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    // Create or get customer
    const customer = await this.createOrGetCustomer(workspaceId, {
      name: data.customerName,
      phone: data.customerPhone,
      email: data.customerEmail,
    });

    // Create PIX payment
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: customer.id,
        billingType: 'PIX',
        value: data.amount,
        dueDate: dueDate.toISOString().split('T')[0],
        description: data.description,
        externalReference: data.externalReference,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create payment',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payment = await paymentResponse.json();

    // Get PIX QR Code
    const qrCodeResponse = await fetch(
      `${baseUrl}/payments/${payment.id}/pixQrCode`,
      {
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    let pixData = { encodedImage: '', payload: '' };
    if (qrCodeResponse.ok) {
      pixData = await qrCodeResponse.json();
    }

    this.logger.log(`PIX payment created: ${payment.id} for ${data.amount}`);

    return {
      id: payment.id,
      pixQrCodeUrl: `data:image/png;base64,${pixData.encodedImage}`,
      pixCopyPaste: pixData.payload,
      dueDate: payment.dueDate,
      status: payment.status,
    };
  }

  async createBoletoPayment(
    workspaceId: string,
    data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerCpfCnpj: string;
      amount: number;
      description: string;
      externalReference?: string;
    },
  ): Promise<{
    id: string;
    bankSlipUrl: string;
    barCode: string;
    dueDate: string;
    status: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    // Create or get customer with CPF/CNPJ (required for boleto)
    const customer = await this.createOrGetCustomer(workspaceId, {
      name: data.customerName,
      phone: data.customerPhone,
      email: data.customerEmail,
      cpfCnpj: data.customerCpfCnpj,
    });

    // Create Boleto payment
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3); // Due in 3 days

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: customer.id,
        billingType: 'BOLETO',
        value: data.amount,
        dueDate: dueDate.toISOString().split('T')[0],
        description: data.description,
        externalReference: data.externalReference,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create payment',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payment = await paymentResponse.json();

    this.logger.log(`Boleto payment created: ${payment.id} for ${data.amount}`);

    return {
      id: payment.id,
      bankSlipUrl: payment.bankSlipUrl,
      barCode: payment.nossoNumero,
      dueDate: payment.dueDate,
      status: payment.status,
    };
  }

  async createCardPayment(
    workspaceId: string,
    data: {
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      customerCpfCnpj: string;
      amount: number;
      description: string;
      installments?: number;
      cardNumber: string;
      cardExpiryMonth: string;
      cardExpiryYear: string;
      cardCcv: string;
      cardHolderName: string;
      externalReference?: string;
    },
  ): Promise<{
    id: string;
    status: string;
    cardBrand?: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    const customer = await this.createOrGetCustomer(workspaceId, {
      name: data.customerName,
      phone: data.customerPhone,
      email: data.customerEmail,
      cpfCnpj: data.customerCpfCnpj,
    });

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: customer.id,
        billingType: 'CREDIT_CARD',
        value: data.amount,
        dueDate: new Date().toISOString().split('T')[0],
        description: data.description,
        externalReference: data.externalReference,
        installmentCount: data.installments || 1,
        creditCard: {
          holderName: data.cardHolderName,
          number: data.cardNumber,
          expiryMonth: data.cardExpiryMonth,
          expiryYear: data.cardExpiryYear,
          ccv: data.cardCcv,
        },
        creditCardHolderInfo: {
          name: data.customerName,
          email: data.customerEmail,
          cpfCnpj: data.customerCpfCnpj,
          phone: data.customerPhone,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Card payment failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    const payment = await paymentResponse.json();

    this.logger.log(
      `Card payment created: ${payment.id} status=${payment.status}`,
    );

    return {
      id: payment.id,
      status: payment.status,
      cardBrand: payment.creditCard?.creditCardBrand,
    };
  }

  async getPaymentStatus(
    workspaceId: string,
    paymentId: string,
  ): Promise<{
    id: string;
    status: string;
    value: number;
    paidValue?: number;
    paidDate?: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    const response = await fetch(`${baseUrl}/payments/${paymentId}`, {
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }

    const payment = await response.json();

    return {
      id: payment.id,
      status: payment.status,
      value: payment.value,
      paidValue: payment.confirmedDate ? payment.value : undefined,
      paidDate: payment.confirmedDate,
    };
  }

  async handleWebhook(
    workspaceId: string,
    event: string,
    payment: AsaasPaymentWebhook,
  ): Promise<void> {
    this.logger.log(
      `Asaas webhook received: ${event} for payment ${payment.id}`,
    );

    const prismaAny = this.prisma as unknown as PrismaDynamic;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        // 1. Atualizar status da venda
        const updatedSales = await prismaAny.kloelSale
          .updateMany({
            where: { externalPaymentId: payment.id },
            data: {
              status: 'paid',
              paidAt: new Date(payment.confirmedDate || payment.paymentDate),
            },
          })
          .catch(() => {
            this.logger.warn('Could not update sale status');
            return { count: 0 };
          });

        // 2. Update wallet balance
        await prismaAny.kloelWalletTransaction
          .updateMany({
            where: { externalId: payment.id },
            data: { status: 'confirmed' },
          })
          .catch(() => {
            this.logger.warn('Could not update wallet transaction');
          });

        // 3. 🔥 P0: Notificar cliente do pagamento confirmado
        if (updatedSales?.count > 0) {
          await this.notifyPaymentConfirmed(workspaceId, payment);
        }
        break;

      case 'PAYMENT_OVERDUE':
        await prismaAny.kloelSale
          .updateMany({
            where: { externalPaymentId: payment.id },
            data: { status: 'overdue' },
          })
          .catch((err) =>
            this.logger.warn('Failed to update sale to overdue', err.message),
          );
        break;

      case 'PAYMENT_REFUNDED':
        await prismaAny.kloelSale
          .updateMany({
            where: { externalPaymentId: payment.id },
            data: { status: 'refunded' },
          })
          .catch((err) =>
            this.logger.warn('Failed to update sale to refunded', err.message),
          );
        break;
    }
  }

  async listPayments(
    workspaceId: string,
    filters?: { status?: string; startDate?: string; endDate?: string },
  ): Promise<Record<string, unknown>[]> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);
    const params = new URLSearchParams();

    if (filters?.status) params.append('status', filters.status);
    if (filters?.startDate) params.append('dateCreated[ge]', filters.startDate);
    if (filters?.endDate) params.append('dateCreated[le]', filters.endDate);

    const response = await fetch(`${baseUrl}/payments?${params.toString()}`, {
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new HttpException(
        'Failed to list payments',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await response.json();
    return result.data || [];
  }

  async getBalance(
    workspaceId: string,
  ): Promise<{ balance: number; pending: number }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    const response = await fetch(`${baseUrl}/finance/balance`, {
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new HttpException('Failed to get balance', HttpStatus.BAD_REQUEST);
    }

    const result = await response.json();
    return {
      balance: result.balance || 0,
      pending: result.pending || 0,
    };
  }

  async refundPayment(
    workspaceId: string,
    paymentId: string,
    amount?: number,
  ): Promise<any> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    try {
      const options: RequestInit = {
        method: 'POST',
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      };

      if (amount !== undefined) {
        options.body = JSON.stringify({ value: amount });
      }

      const response = await fetch(
        `${baseUrl}/payments/${paymentId}/refund`,
        options,
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.errors?.[0]?.description || 'Failed to refund payment',
        );
      }

      const result = await response.json();
      this.logger.log(`Payment ${paymentId} refunded successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to refund payment ${paymentId}: ${errMsg}`);
      throw error;
    }
  }

  async updateSubscription(
    workspaceId: string,
    subscriptionId: string,
    data: Record<string, any>,
  ): Promise<any> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    try {
      const response = await fetch(
        `${baseUrl}/subscriptions/${subscriptionId}`,
        {
          method: 'PUT',
          headers: {
            access_token: config.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.errors?.[0]?.description || 'Failed to update subscription',
        );
      }

      const result = await response.json();
      this.logger.log(`Subscription ${subscriptionId} updated successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to update subscription ${subscriptionId}: ${errMsg}`,
      );
      throw error;
    }
  }

  async cancelSubscription(
    workspaceId: string,
    subscriptionId: string,
  ): Promise<any> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    try {
      const response = await fetch(
        `${baseUrl}/subscriptions/${subscriptionId}`,
        {
          method: 'DELETE',
          headers: {
            access_token: config.apiKey,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.errors?.[0]?.description || 'Failed to cancel subscription',
        );
      }

      const result = await response.json();
      this.logger.log(`Subscription ${subscriptionId} cancelled successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to cancel subscription ${subscriptionId}: ${errMsg}`,
      );
      throw error;
    }
  }

  /**
   * 🔥 P0: Notifica cliente via WhatsApp quando pagamento é confirmado
   */
  private async notifyPaymentConfirmed(
    workspaceId: string,
    payment: AsaasPaymentWebhook,
  ): Promise<void> {
    try {
      const prismaAny = this.prisma as unknown as PrismaDynamic;

      // Buscar a venda para obter os dados do cliente
      const sale = await prismaAny.kloelSale.findFirst({
        where: { externalPaymentId: payment.id },
        include: {
          contact: true,
          product: true,
        },
      });

      if (!sale?.contact?.phone) {
        this.logger.warn(
          `[ASAAS] Venda sem contato ou telefone para pagamento ${payment.id}`,
        );
        return;
      }

      const productName = sale.product?.name || 'seu produto';
      const customerName = sale.contact.name || 'Cliente';
      const value = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(payment.value);

      // Mensagem de confirmação de pagamento
      const message =
        `✅ *Pagamento Confirmado!*\n\n` +
        `Olá ${customerName},\n\n` +
        `Recebemos seu pagamento de ${value} referente a "${productName}".\n\n` +
        `Obrigado pela confiança! 🎉\n\n` +
        `Em breve você receberá mais informações sobre seu acesso.`;

      // Enfileirar envio via WhatsApp
      await flowQueue.add('send-message', {
        workspaceId,
        to: sale.contact.phone.replace(/\D/g, ''),
        user: sale.contact.phone.replace(/\D/g, ''),
        message,
      });

      this.logger.log(
        `💳 [ASAAS] Notificação de pagamento enviada para ${sale.contact.phone}`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `[ASAAS] Erro ao notificar pagamento: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

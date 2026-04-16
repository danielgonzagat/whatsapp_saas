import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

const D_RE = /\D/g;

interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpfCnpj?: string;
}

interface AsaasConfig {
  apiKey: string;
  environment: 'sandbox' | 'production';
}

/**
 * Shape persistido em `Workspace.providerSettings.asaas` para credenciais
 * Asaas do workspace. O campo `Workspace.providerSettings` é
 * `Prisma.JsonValue`; a leitura narrow para esse shape em
 * `loadWorkspaceAsaasSettings`.
 */
interface ProviderSettingsAsaasSlot {
  apiKey?: string;
  environment?: 'sandbox' | 'production';
}

interface ProviderSettingsShape {
  asaas?: ProviderSettingsAsaasSlot;
  [key: string]: unknown;
}

function narrowProviderSettings(value: Prisma.JsonValue | null | undefined): ProviderSettingsShape {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ProviderSettingsShape;
}

interface AsaasPaymentWebhook {
  id: string;
  value: number;
  confirmedDate?: string;
  paymentDate?: string;
}

// cache.invalidate — Asaas configs held in-memory Map; invalidated on disconnect/reconnect
@Injectable()
export class AsaasService implements OnModuleInit {
  private readonly logger = new Logger(AsaasService.name);
  private configs: Map<string, AsaasConfig> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Load all workspaces that have Asaas credentials embedded in
    // `providerSettings.asaas`. Previously this looked up a `kloelConfig`
    // table that never existed in the schema — so Asaas credentials were
    // silently lost on every restart (the catch block swallowed it). The
    // storage now lives in `Workspace.providerSettings.asaas` which is
    // Json and already used for other provider configs.
    try {
      const workspaces = await this.prisma.workspace.findMany({
        select: { id: true, providerSettings: true },
        take: 500,
      });
      let loaded = 0;
      for (const ws of workspaces) {
        const settings = narrowProviderSettings(ws.providerSettings);
        const asaas = settings.asaas;
        if (asaas?.apiKey) {
          this.configs.set(ws.id, {
            apiKey: asaas.apiKey,
            environment: asaas.environment === 'production' ? 'production' : 'sandbox',
          });
          loaded++;
        }
      }
      if (loaded > 0) {
        this.logger.log(`Loaded Asaas configs for ${loaded} workspace(s) from providerSettings`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`Failed to load Asaas configs on startup: ${errorMessage}`);
    }
  }

  /**
   * Mescla o slot `asaas` em `Workspace.providerSettings`, preservando
   * as outras chaves que possam existir. Único ponto de escrita tipado
   * — qualquer outro caminho de persistência deve passar por aqui.
   */
  private async mergeAsaasIntoProviderSettings(
    workspaceId: string,
    asaasSlot: ProviderSettingsAsaasSlot | null,
  ): Promise<void> {
    const existing = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });
    const current = narrowProviderSettings(existing?.providerSettings);
    const next = { ...current };
    if (asaasSlot === null) {
      delete next.asaas;
    } else {
      next.asaas = { ...current.asaas, ...asaasSlot };
    }
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: toPrismaJsonValue(next) },
    });
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

    const environment = process.env.ASAAS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

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
        throw new HttpException('Invalid Asaas API key', HttpStatus.UNAUTHORIZED);
      }

      const accountInfo = (await response.json()) as Record<string, unknown>;

      // Store config in memory for immediate use.
      this.configs.set(workspaceId, { apiKey, environment });

      // Persist to Workspace.providerSettings.asaas so credentials survive
      // a process restart. Failures here are genuine errors (the workspace
      // row must exist and be writable for this call to even be reached).
      await this.mergeAsaasIntoProviderSettings(workspaceId, { apiKey, environment });

      this.logger.log(`Workspace ${workspaceId} connected to Asaas (${environment})`);

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
      const errMsg = error instanceof Error ? error.message : 'Failed to connect to Asaas';
      this.logger.error(`Failed to connect Asaas: ${errMsg}`);
      throw new HttpException(errMsg || 'Failed to connect to Asaas', HttpStatus.BAD_REQUEST);
    }
  }

  async disconnectWorkspace(workspaceId: string): Promise<void> {
    this.configs.delete(workspaceId);

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'Workspace.providerSettings.asaas',
      details: {
        deletedBy: 'user',
      },
    });

    await this.mergeAsaasIntoProviderSettings(workspaceId, null);

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
    const searchResponse = await fetch(`${baseUrl}/customers?mobilePhone=${data.phone}`, {
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

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
      idempotencyKey?: string;
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

    // Build headers with optional Asaas native idempotency key
    const headers: Record<string, string> = {
      access_token: config.apiKey,
      'Content-Type': 'application/json',
    };
    const idemKey = data.idempotencyKey || data.externalReference || undefined;
    if (idemKey) {
      headers['X-Idempotency-Key'] = idemKey;
    }

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers,
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
    const qrCodeResponse = await fetch(`${baseUrl}/payments/${payment.id}/pixQrCode`, {
      headers: {
        access_token: config.apiKey,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    let pixData: { encodedImage: string; payload: string } = { encodedImage: '', payload: '' };
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
      idempotencyKey?: string;
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

    // Build headers with optional Asaas native idempotency key
    const headers: Record<string, string> = {
      access_token: config.apiKey,
      'Content-Type': 'application/json',
    };
    const idemKey = data.idempotencyKey || data.externalReference || undefined;
    if (idemKey) {
      headers['X-Idempotency-Key'] = idemKey;
    }

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers,
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
      idempotencyKey?: string;
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

    // Build headers with optional Asaas native idempotency key
    const headers: Record<string, string> = {
      access_token: config.apiKey,
      'Content-Type': 'application/json',
    };
    const idemKey = data.idempotencyKey || data.externalReference || undefined;
    if (idemKey) {
      headers['X-Idempotency-Key'] = idemKey;
    }

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers,
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

    this.logger.log(`Card payment created: ${payment.id} status=${payment.status}`);

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
    this.logger.log(`Asaas webhook received: ${event} for payment ${payment.id}`);

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        // Wrap sale + wallet balance updates in prisma.$transaction to prevent
        // partial state when one succeeds and the other fails (double-spend guard).
        const updatedSales = await this.prisma
          .$transaction(async (tx: any) => {
            // 1. Atualizar status da venda
            const salesResult = await tx.kloelSale
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
            await tx.kloelWalletTransaction
              .updateMany({
                where: { externalId: payment.id },
                data: { status: 'confirmed' },
              })
              .catch(() => {
                this.logger.warn('Could not update wallet transaction');
              });

            return salesResult;
          })
          .catch((txErr: any) => {
            this.logger.error(`Transaction failed for webhook ${event}: ${txErr?.message}`);
            return { count: 0 };
          });

        // 3. Notificar cliente do pagamento confirmado (outside tx — non-critical)
        if (updatedSales?.count > 0) {
          await this.notifyPaymentConfirmed(workspaceId, payment);
        }
        break;
      }

      case 'PAYMENT_OVERDUE':
        await (this.prisma as any).kloelSale
          .updateMany({
            where: { externalPaymentId: payment.id },
            data: { status: 'overdue' },
          })
          .catch((err: any) => this.logger.warn('Failed to update sale to overdue', err.message));
        break;

      case 'PAYMENT_REFUNDED':
        await (this.prisma as any).kloelSale
          .updateMany({
            where: { externalPaymentId: payment.id },
            data: { status: 'refunded' },
          })
          .catch((err: any) => this.logger.warn('Failed to update sale to refunded', err.message));
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
      throw new HttpException('Failed to list payments', HttpStatus.BAD_REQUEST);
    }

    const result = await response.json();
    return result.data || [];
  }

  async getBalance(workspaceId: string): Promise<{ balance: number; pending: number }> {
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

  async refundPayment(workspaceId: string, paymentId: string, amount?: number): Promise<unknown> {
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

      const response = await fetch(`${baseUrl}/payments/${paymentId}/refund`, options);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.description || 'Failed to refund payment');
      }

      const result = await response.json();
      this.logger.log(`Payment ${paymentId} refunded successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to refund payment';
      this.logger.error(`Failed to refund payment ${paymentId}: ${errMsg}`);
      throw error;
    }
  }

  async updateSubscription(
    workspaceId: string,
    subscriptionId: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    try {
      const response = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'PUT',
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.description || 'Failed to update subscription');
      }

      const result = await response.json();
      this.logger.log(`Subscription ${subscriptionId} updated successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to update subscription';
      this.logger.error(`Failed to update subscription ${subscriptionId}: ${errMsg}`);
      throw error;
    }
  }

  async cancelSubscription(workspaceId: string, subscriptionId: string): Promise<unknown> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    try {
      const response = await fetch(`${baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          access_token: config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.description || 'Failed to cancel subscription');
      }

      const result = await response.json();
      this.logger.log(`Subscription ${subscriptionId} cancelled successfully`);
      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Failed to cancel subscription';
      this.logger.error(`Failed to cancel subscription ${subscriptionId}: ${errMsg}`);
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
      // `KloelSale` does NOT have `contact` or `product` relations in the
      // schema — the previous prismaAny cast was silencing a runtime
      // failure that would have hit the `sale?.contact?.phone` check and
      // returned early every single time. The real data we have inline is
      // `leadPhone` and `productName` on the sale row itself.
      const sale = await this.prisma.kloelSale.findFirst({
        where: { externalPaymentId: payment.id, workspaceId },
      });

      if (!sale?.leadPhone) {
        this.logger.warn(`[ASAAS] Venda sem leadPhone para pagamento ${payment.id}`);
        return;
      }

      const productName = sale.productName || 'seu produto';
      const value = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(payment.value);

      // Mensagem de confirmação de pagamento
      const message = `✅ *Pagamento Confirmado!*\n\nRecebemos seu pagamento de ${value} referente a "${productName}".\n\nObrigado pela confiança! 🎉\n\nSeu acesso e os próximos passos serão enviados pelo canal cadastrado.`;

      const normalizedPhone = sale.leadPhone.replace(D_RE, '');

      // Enfileirar envio via WhatsApp
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await flowQueue.add('send-message', {
        workspaceId,
        to: normalizedPhone,
        user: normalizedPhone,
        message,
      });

      this.logger.log(`💳 [ASAAS] Notificação de pagamento enviada para ${sale.leadPhone}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'unknown_error';
      this.logger.error(`[ASAAS] Erro ao notificar pagamento: ${errorMessage}`);
    }
  }
}

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private configs: Map<string, AsaasConfig> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  private getBaseUrl(environment: 'sandbox' | 'production'): string {
    return environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  private getConfig(workspaceId: string): AsaasConfig | null {
    return this.configs.get(workspaceId) || null;
  }

  async connectWorkspace(workspaceId: string, apiKey: string, environment: 'sandbox' | 'production' = 'sandbox'): Promise<{ success: boolean; accountInfo?: any }> {
    const baseUrl = this.getBaseUrl(environment);
    
    try {
      // Validate API key by fetching account info
      const response = await fetch(`${baseUrl}/myAccount`, {
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpException('Invalid Asaas API key', HttpStatus.UNAUTHORIZED);
      }

      const accountInfo = await response.json();

      // Store config in memory (in production, save to database)
      this.configs.set(workspaceId, { apiKey, environment });

      // Save to database
      const prismaAny = this.prisma as any;
      await prismaAny.kloelConfig.upsert({
        where: { workspaceId_key: { workspaceId, key: 'asaas_api_key' } },
        update: { value: apiKey },
        create: { workspaceId, key: 'asaas_api_key', value: apiKey },
      }).catch(() => {
        // Table might not exist, just log
        this.logger.warn('Could not save Asaas config to database');
      });

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
    } catch (error) {
      this.logger.error(`Failed to connect Asaas: ${error.message}`);
      throw new HttpException(
        error.message || 'Failed to connect to Asaas',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async disconnectWorkspace(workspaceId: string): Promise<void> {
    this.configs.delete(workspaceId);
    this.logger.log(`Workspace ${workspaceId} disconnected from Asaas`);
  }

  async getConnectionStatus(workspaceId: string): Promise<{ connected: boolean; environment?: string; accountName?: string }> {
    const config = this.getConfig(workspaceId);
    
    if (!config) {
      return { connected: false };
    }

    try {
      const baseUrl = this.getBaseUrl(config.environment);
      const response = await fetch(`${baseUrl}/myAccount`, {
        headers: {
          'access_token': config.apiKey,
          'Content-Type': 'application/json',
        },
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

  async createOrGetCustomer(workspaceId: string, data: { name: string; phone: string; email?: string; cpfCnpj?: string }): Promise<AsaasCustomer> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    // First, try to find existing customer by phone
    const searchResponse = await fetch(`${baseUrl}/customers?mobilePhone=${data.phone}`, {
      headers: {
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
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
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: data.name,
        mobilePhone: data.phone,
        email: data.email,
        cpfCnpj: data.cpfCnpj,
        notificationDisabled: false,
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create customer',
        HttpStatus.BAD_REQUEST
      );
    }

    return createResponse.json();
  }

  async createPixPayment(workspaceId: string, data: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    amount: number;
    description: string;
    externalReference?: string;
  }): Promise<{ id: string; pixQrCodeUrl: string; pixCopyPaste: string; dueDate: string; status: string }> {
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
        'access_token': config.apiKey,
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
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create payment',
        HttpStatus.BAD_REQUEST
      );
    }

    const payment = await paymentResponse.json();

    // Get PIX QR Code
    const qrCodeResponse = await fetch(`${baseUrl}/payments/${payment.id}/pixQrCode`, {
      headers: {
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
    });

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

  async createBoletoPayment(workspaceId: string, data: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerCpfCnpj: string;
    amount: number;
    description: string;
    externalReference?: string;
  }): Promise<{ id: string; bankSlipUrl: string; barCode: string; dueDate: string; status: string }> {
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
        'access_token': config.apiKey,
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
    });

    if (!paymentResponse.ok) {
      const error = await paymentResponse.json();
      throw new HttpException(
        error.errors?.[0]?.description || 'Failed to create payment',
        HttpStatus.BAD_REQUEST
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

  async getPaymentStatus(workspaceId: string, paymentId: string): Promise<{ id: string; status: string; value: number; paidValue?: number; paidDate?: string }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Asaas not connected', HttpStatus.BAD_REQUEST);
    }

    const baseUrl = this.getBaseUrl(config.environment);

    const response = await fetch(`${baseUrl}/payments/${paymentId}`, {
      headers: {
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
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

  async handleWebhook(workspaceId: string, event: string, payment: any): Promise<void> {
    this.logger.log(`Asaas webhook received: ${event} for payment ${payment.id}`);

    const prismaAny = this.prisma as any;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        await prismaAny.kloelSale.updateMany({
          where: { externalPaymentId: payment.id },
          data: { 
            status: 'paid', 
            paidAt: new Date(payment.confirmedDate || payment.paymentDate),
          },
        }).catch(() => {
          this.logger.warn('Could not update sale status');
        });

        // Update wallet balance
        await prismaAny.kloelWalletTransaction.updateMany({
          where: { externalId: payment.id },
          data: { status: 'confirmed' },
        }).catch(() => {
          this.logger.warn('Could not update wallet transaction');
        });
        break;

      case 'PAYMENT_OVERDUE':
        await prismaAny.kloelSale.updateMany({
          where: { externalPaymentId: payment.id },
          data: { status: 'overdue' },
        }).catch(() => {});
        break;

      case 'PAYMENT_REFUNDED':
        await prismaAny.kloelSale.updateMany({
          where: { externalPaymentId: payment.id },
          data: { status: 'refunded' },
        }).catch(() => {});
        break;
    }
  }

  async listPayments(workspaceId: string, filters?: { status?: string; startDate?: string; endDate?: string }): Promise<any[]> {
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
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
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
        'access_token': config.apiKey,
        'Content-Type': 'application/json',
      },
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
}

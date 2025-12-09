import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

interface MercadoPagoConfig {
  accessToken: string;
  publicKey?: string;
  environment: 'sandbox' | 'production';
}

interface MercadoPagoPreference {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
  }>;
}

export interface MercadoPagoPayment {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  payer: {
    email: string;
    phone?: { number: string };
  };
  payment_type_id: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private configs: Map<string, MercadoPagoConfig> = new Map();
  private readonly baseUrl = 'https://api.mercadopago.com';

  constructor(private readonly prisma: PrismaService) {}

  private getConfig(workspaceId: string): MercadoPagoConfig | null {
    return this.configs.get(workspaceId) || null;
  }

  /**
   * Conecta workspace ao Mercado Pago
   */
  async connectWorkspace(
    workspaceId: string,
    accessToken: string,
    publicKey?: string,
    environment: 'sandbox' | 'production' = 'sandbox',
  ): Promise<{ success: boolean; accountInfo?: any }> {
    try {
      // Validar token buscando informações do usuário
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new HttpException(
          'Token de acesso do Mercado Pago inválido',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const userInfo = await response.json();

      // Armazenar config
      this.configs.set(workspaceId, { accessToken, publicKey, environment });

      // Salvar no banco
      const prismaAny = this.prisma as any;
      await prismaAny.kloelConfig
        .upsert({
          where: { workspaceId_key: { workspaceId, key: 'mercadopago_access_token' } },
          update: { value: accessToken },
          create: { workspaceId, key: 'mercadopago_access_token', value: accessToken },
        })
        .catch(() => {
          this.logger.warn('Não foi possível salvar config do Mercado Pago no banco');
        });

      this.logger.log(`Workspace ${workspaceId} conectado ao Mercado Pago`);

      return {
        success: true,
        accountInfo: {
          id: userInfo.id,
          nickname: userInfo.nickname,
          email: userInfo.email,
          site_id: userInfo.site_id,
          environment,
        },
      };
    } catch (error: any) {
      this.logger.error(`Falha ao conectar Mercado Pago: ${error.message}`);
      throw new HttpException(
        error.message || 'Falha ao conectar com Mercado Pago',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Desconecta workspace do Mercado Pago
   */
  async disconnectWorkspace(workspaceId: string): Promise<void> {
    this.configs.delete(workspaceId);
    this.logger.log(`Workspace ${workspaceId} desconectado do Mercado Pago`);
  }

  /**
   * Verifica status da conexão
   */
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
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        this.configs.delete(workspaceId);
        return { connected: false };
      }

      const userInfo = await response.json();
      return {
        connected: true,
        environment: config.environment,
        accountName: userInfo.nickname || userInfo.email,
      };
    } catch {
      return { connected: false };
    }
  }

  /**
   * Cria link de pagamento PIX
   */
  async createPixPayment(
    workspaceId: string,
    params: {
      amount: number;
      description: string;
      email: string;
      externalReference?: string;
    },
  ): Promise<{
    id: number;
    qrCode: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    status: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Mercado Pago não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `${workspaceId}-${Date.now()}`,
        },
        body: JSON.stringify({
          transaction_amount: params.amount,
          description: params.description,
          payment_method_id: 'pix',
          payer: {
            email: params.email,
          },
          external_reference: params.externalReference,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new HttpException(
          error.message || 'Erro ao criar pagamento PIX',
          HttpStatus.BAD_REQUEST,
        );
      }

      const payment: MercadoPagoPayment = await response.json();
      const pixData = payment.point_of_interaction?.transaction_data;

      this.logger.log(`Pagamento PIX ${payment.id} criado para workspace ${workspaceId}`);

      return {
        id: payment.id,
        qrCode: pixData?.qr_code || '',
        qrCodeBase64: pixData?.qr_code_base64,
        ticketUrl: pixData?.ticket_url,
        status: payment.status,
      };
    } catch (error: any) {
      this.logger.error(`Erro criando PIX: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cria preferência de pagamento (checkout)
   */
  async createPreference(
    workspaceId: string,
    params: {
      items: Array<{
        title: string;
        quantity: number;
        unitPrice: number;
        id?: string;
      }>;
      backUrls?: {
        success?: string;
        failure?: string;
        pending?: string;
      };
      externalReference?: string;
      notificationUrl?: string;
    },
  ): Promise<{
    id: string;
    initPoint: string;
    sandboxInitPoint: string;
  }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Mercado Pago não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: params.items.map((item) => ({
            id: item.id || crypto.randomUUID(),
            title: item.title,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            currency_id: 'BRL',
          })),
          back_urls: params.backUrls
            ? {
                success: params.backUrls.success,
                failure: params.backUrls.failure,
                pending: params.backUrls.pending,
              }
            : undefined,
          auto_return: 'approved',
          external_reference: params.externalReference,
          notification_url: params.notificationUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new HttpException(
          error.message || 'Erro ao criar preferência',
          HttpStatus.BAD_REQUEST,
        );
      }

      const preference: MercadoPagoPreference = await response.json();

      this.logger.log(`Preferência ${preference.id} criada para workspace ${workspaceId}`);

      return {
        id: preference.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
      };
    } catch (error: any) {
      this.logger.error(`Erro criando preferência: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca pagamento por ID
   */
  async getPayment(workspaceId: string, paymentId: number): Promise<MercadoPagoPayment | null> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Processa webhook do Mercado Pago
   */
  async handleWebhook(
    workspaceId: string,
    payload: {
      action: string;
      data: { id: string };
      type: string;
    },
  ): Promise<{ processed: boolean; action?: string }> {
    this.logger.log(
      `Webhook MP recebido: ${payload.type}/${payload.action} - ${payload.data?.id}`,
    );

    if (payload.type !== 'payment') {
      return { processed: false };
    }

    const paymentId = parseInt(payload.data.id, 10);
    const payment = await this.getPayment(workspaceId, paymentId);

    if (!payment) {
      this.logger.warn(`Pagamento ${paymentId} não encontrado`);
      return { processed: false };
    }

    // Mapear status do MP para status interno
    const statusMap: Record<string, string> = {
      approved: 'CONFIRMED',
      pending: 'PENDING',
      in_process: 'PENDING',
      rejected: 'FAILED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'CHARGEBACK',
    };

    const internalStatus = statusMap[payment.status] || 'UNKNOWN';

    // Se aprovado, disparar flow de confirmação
    if (payment.status === 'approved') {
      try {
        await flowQueue.add('payment-confirmed', {
          workspaceId,
          paymentId: payment.id.toString(),
          amount: payment.transaction_amount,
          payerEmail: payment.payer?.email,
          payerPhone: payment.payer?.phone?.number,
          provider: 'mercadopago',
        });
      } catch (err) {
        this.logger.warn(`Erro ao enfileirar confirmação: ${(err as Error).message}`);
      }
    }

    return {
      processed: true,
      action: internalStatus,
    };
  }

  /**
   * Lista pagamentos do workspace
   */
  async listPayments(
    workspaceId: string,
    params?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ results: MercadoPagoPayment[]; total: number }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      return { results: [], total: 0 };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      queryParams.append('limit', String(params?.limit || 30));
      queryParams.append('offset', String(params?.offset || 0));

      const response = await fetch(
        `${this.baseUrl}/v1/payments/search?${queryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        return { results: [], total: 0 };
      }

      const data = await response.json();
      return {
        results: data.results || [],
        total: data.paging?.total || 0,
      };
    } catch {
      return { results: [], total: 0 };
    }
  }

  /**
   * Cria reembolso
   */
  async createRefund(
    workspaceId: string,
    paymentId: number,
    amount?: number,
  ): Promise<{ success: boolean; refundId?: number }> {
    const config = this.getConfig(workspaceId);
    if (!config) {
      throw new HttpException('Mercado Pago não configurado', HttpStatus.BAD_REQUEST);
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/v1/payments/${paymentId}/refunds`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: amount ? JSON.stringify({ amount }) : undefined,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new HttpException(
          error.message || 'Erro ao criar reembolso',
          HttpStatus.BAD_REQUEST,
        );
      }

      const refund = await response.json();
      this.logger.log(`Reembolso ${refund.id} criado para pagamento ${paymentId}`);

      return {
        success: true,
        refundId: refund.id,
      };
    } catch (error: any) {
      this.logger.error(`Erro criando reembolso: ${error.message}`);
      throw error;
    }
  }
}

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptString, encryptString, isEncrypted } from '../lib/crypto';
import { getRequestOrigin } from '../common/storage/public-storage-url.util';
import { MercadoPagoConfig, OAuth, Order, Payment, PaymentRefund, User } from 'mercadopago';
import * as crypto from 'crypto';
import type { OrderResponse } from 'mercadopago/dist/clients/order/commonTypes';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes';
import type { PaymentCreateRequest } from 'mercadopago/dist/clients/payment/create/types';
import {
  buildCheckoutMarketplacePricing,
  type CheckoutMarketplacePaymentMethod,
  type CheckoutMarketplacePricingSummary,
} from '../checkout/checkout-marketplace-pricing.util';
import {
  buildMercadoPagoOrderPaymentRequest,
  normalizeMercadoPagoOrderPayment,
  normalizeMercadoPagoPayerAddress,
  type NormalizedMercadoPagoOrderPayment,
} from './mercado-pago-order.util';

type MercadoPagoStoredCredentials = {
  accessToken?: string;
  refreshToken?: string;
  publicKey?: string;
  mercadoPagoUserId?: number | string;
  liveMode?: boolean;
  scope?: string;
  tokenType?: string;
  expiresAt?: string;
  connectedAt?: string;
  seller?: {
    id?: number;
    nickname?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    countryId?: string;
    status?: string;
  };
};

type OAuthStatePayload = {
  workspaceId: string;
  returnUrl: string;
  exp: number;
};

type ConnectedSeller = {
  integration: {
    id: string;
    workspaceId: string;
    name: string;
    credentials: unknown;
  };
  credentials: MercadoPagoStoredCredentials;
  client: MercadoPagoConfig;
};

type MercadoPagoPaymentMethodSummary = {
  id: string;
  paymentTypeId: string | null;
  name: string | null;
  status: string | null;
};

type CreateMarketplaceOrderParams = {
  workspaceId: string;
  orderId: string;
  orderNumber: string;
  baseTotalInCents: number;
  chargedTotalInCents: number;
  marketplaceFeeInCents: number;
  customerName: string;
  customerEmail: string;
  customerCPF?: string;
  customerPhone?: string;
  shippingAddress?: unknown;
  productName: string;
  productDescription?: string;
  productImage?: string;
  paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  cardToken?: string;
  cardPaymentMethodId?: string;
  cardPaymentType?: string;
  installments?: number;
};

const MERCADO_PAGO_TYPE = 'MERCADO_PAGO';
const DEFAULT_PLATFORM_FEE_PERCENT = 9.9;
const DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT = 3.99;
const STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_CALLBACK_PATH = '/kloel/wallet/mercado-pago/callback';
const MERCADO_PAGO_WEBHOOK_PATH = '/checkout/webhooks/mercado-pago';

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function centsToMercadoPagoAmount(value: number) {
  return (Math.max(0, value) / 100).toFixed(2);
}

function normalizePhone(phone?: string | null) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return undefined;

  const areaCode = digits.length >= 10 ? digits.slice(0, 2) : undefined;
  const number = digits.slice(2, 11);

  if (!areaCode || number.length < 8) return undefined;
  return { area_code: areaCode, number };
}

function normalizeIdentification(raw?: string | null) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11) return { type: 'CPF', number: digits };
  if (digits.length === 14) return { type: 'CNPJ', number: digits };
  return undefined;
}

function coerceMercadoPagoString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get platformAccessToken() {
    return process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || '';
  }

  private get clientId() {
    return process.env.MERCADOPAGO_CLIENT_ID?.trim() || '';
  }

  private get clientSecret() {
    return process.env.MERCADOPAGO_CLIENT_SECRET?.trim() || '';
  }

  private get platformPublicKey() {
    return process.env.MERCADOPAGO_PUBLIC_KEY?.trim() || '';
  }

  private get cryptoKey() {
    return (
      process.env.ENCRYPTION_KEY?.trim() ||
      process.env.PROVIDER_SECRET_KEY?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      ''
    );
  }

  private get stateSecret() {
    return (
      process.env.JWT_SECRET?.trim() ||
      process.env.HOOKS_WEBHOOK_SECRET?.trim() ||
      this.clientSecret ||
      'kloel-mercadopago-state'
    );
  }

  private get platformFeePercent() {
    const raw = Number(process.env.KLOEL_MARKETPLACE_FEE_PERCENT || DEFAULT_PLATFORM_FEE_PERCENT);
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PLATFORM_FEE_PERCENT;
  }

  private get installmentInterestMonthlyPercent() {
    const raw = Number(
      process.env.KLOEL_INSTALLMENT_INTEREST_MONTHLY_PERCENT ||
        DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT,
    );
    return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_INSTALLMENT_INTEREST_MONTHLY_PERCENT;
  }

  private getGatewayFeePercent(paymentMethod: CheckoutMarketplacePaymentMethod) {
    const envKey =
      paymentMethod === 'CREDIT_CARD'
        ? 'KLOEL_MERCADOPAGO_GATEWAY_FEE_PERCENT_CREDIT_CARD'
        : paymentMethod === 'PIX'
          ? 'KLOEL_MERCADOPAGO_GATEWAY_FEE_PERCENT_PIX'
          : 'KLOEL_MERCADOPAGO_GATEWAY_FEE_PERCENT_BOLETO';

    const fallback = paymentMethod === 'CREDIT_CARD' ? 4.99 : paymentMethod === 'BOLETO' ? 0 : 0;

    const raw = Number(process.env[envKey] || fallback);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
  }

  private buildPlatformClient() {
    if (!this.platformAccessToken) {
      throw new InternalServerErrorException(
        'MERCADOPAGO_ACCESS_TOKEN não está configurado no backend.',
      );
    }

    return new MercadoPagoConfig({ accessToken: this.platformAccessToken });
  }

  private buildOauthClient() {
    return new OAuth(this.buildPlatformClient());
  }

  private encodeState(payload: OAuthStatePayload) {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = crypto
      .createHmac('sha256', this.stateSecret)
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  private decodeState(rawState: string) {
    const [encodedPayload, signature] = String(rawState || '').split('.');
    if (!encodedPayload || !signature) {
      throw new BadRequestException('OAuth state inválido.');
    }

    const expected = crypto
      .createHmac('sha256', this.stateSecret)
      .update(encodedPayload)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new BadRequestException('OAuth state inválido.');
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as OAuthStatePayload;
    if (!payload.workspaceId || !payload.returnUrl || !payload.exp) {
      throw new BadRequestException('OAuth state inválido.');
    }

    if (Date.now() > payload.exp) {
      throw new BadRequestException('A autorização do Mercado Pago expirou. Tente novamente.');
    }

    return payload;
  }

  private encryptIfPossible(value?: string | null) {
    if (!value) return undefined;
    if (!this.cryptoKey) return value;
    return encryptString(value, this.cryptoKey);
  }

  private decryptIfPossible(value?: string | null) {
    if (!value) return undefined;
    if (!this.cryptoKey) return value;
    if (!isEncrypted(value)) return value;
    return decryptString(value, this.cryptoKey);
  }

  private serializeCredentials(credentials: MercadoPagoStoredCredentials) {
    return {
      ...credentials,
      accessToken: this.encryptIfPossible(credentials.accessToken),
      refreshToken: this.encryptIfPossible(credentials.refreshToken),
    };
  }

  private parseCredentials(raw: unknown): MercadoPagoStoredCredentials {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const value = raw as MercadoPagoStoredCredentials;
    return {
      ...value,
      accessToken: this.decryptIfPossible(value.accessToken),
      refreshToken: this.decryptIfPossible(value.refreshToken),
    };
  }

  private normalizeFrontAppOrigin() {
    const fallback = 'https://app.kloel.com';
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) return fallback;

    try {
      const url = new URL(raw);
      if (url.hostname === 'kloel.com' || url.hostname === 'www.kloel.com') {
        url.hostname = 'app.kloel.com';
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      return fallback;
    }
  }

  private sanitizeReturnUrl(candidate?: string | null) {
    if (!candidate) {
      return `${this.normalizeFrontAppOrigin()}/carteira?mercadoPago=connected`;
    }

    try {
      const parsed = new URL(candidate, this.normalizeFrontAppOrigin());
      const hostname = parsed.hostname.toLowerCase();
      const allowed =
        hostname === 'kloel.com' ||
        hostname.endsWith('.kloel.com') ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.127.0.0.1');

      if (!allowed) {
        return `${this.normalizeFrontAppOrigin()}/carteira?mercadoPago=connected`;
      }

      return parsed.toString();
    } catch {
      return `${this.normalizeFrontAppOrigin()}/carteira?mercadoPago=connected`;
    }
  }

  private resolveCallbackUrl(req?: any) {
    const backendOrigin =
      process.env.BACKEND_URL?.trim().replace(/\/+$/, '') || getRequestOrigin(req);

    if (!backendOrigin) {
      throw new InternalServerErrorException(
        'BACKEND_URL não está configurado para concluir o OAuth do Mercado Pago.',
      );
    }

    return `${backendOrigin}${OAUTH_CALLBACK_PATH}`;
  }

  private async findWorkspaceIntegration(workspaceId: string) {
    return this.prisma.integration.findFirst({
      where: {
        workspaceId,
        type: MERCADO_PAGO_TYPE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async upsertWorkspaceIntegration(
    workspaceId: string,
    credentials: MercadoPagoStoredCredentials,
  ) {
    const existing = await this.findWorkspaceIntegration(workspaceId);
    const name =
      credentials.seller?.nickname || credentials.seller?.email || 'Mercado Pago conectado';

    if (existing) {
      return this.prisma.integration.update({
        where: { id: existing.id },
        data: {
          name,
          isActive: true,
          credentials: this.serializeCredentials(credentials),
        },
      });
    }

    return this.prisma.integration.create({
      data: {
        workspaceId,
        type: MERCADO_PAGO_TYPE,
        name,
        isActive: true,
        credentials: this.serializeCredentials(credentials),
      },
    });
  }

  private async loadSellerProfile(accessToken: string) {
    const client = new MercadoPagoConfig({ accessToken });
    const userClient = new User(client);
    const seller = await userClient.get({});

    return {
      id: seller.id,
      nickname: seller.nickname,
      email: seller.email,
      firstName: seller.first_name,
      lastName: seller.last_name,
      countryId: seller.country_id,
      status: seller.status?.site_status,
    };
  }

  private isExpiringSoon(credentials: MercadoPagoStoredCredentials) {
    if (!credentials.expiresAt) return false;
    const expiresAt = new Date(credentials.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt - Date.now() < 5 * 60 * 1000;
  }

  private resolveWebhookNotificationUrl() {
    const raw = process.env.BACKEND_URL?.trim();
    if (!raw) return undefined;

    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return normalized.replace(/\/+$/, '') + MERCADO_PAGO_WEBHOOK_PATH;
  }

  private async fetchSellerPaymentMethods(
    credentials: MercadoPagoStoredCredentials,
  ): Promise<MercadoPagoPaymentMethodSummary[]> {
    if (!credentials.accessToken) {
      return [];
    }

    const response = await fetch('https://api.mercadopago.com/v1/payment_methods', {
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Mercado Pago recusou a listagem de meios de pagamento (${response.status}).`,
      );
    }

    const payload = (await response.json()) as Array<Record<string, unknown>>;

    return payload
      .map((entry) => ({
        id: coerceMercadoPagoString(entry.id)?.trim() || '',
        paymentTypeId: coerceMercadoPagoString(entry.payment_type_id) || null,
        name: coerceMercadoPagoString(entry.name) || null,
        status: coerceMercadoPagoString(entry.status) || null,
      }))
      .filter((entry) => entry.id);
  }

  private summarizeAvailablePaymentMethods(methods: MercadoPagoPaymentMethodSummary[]) {
    const activeMethods = methods.filter(
      (method) => !method.status || method.status.toLowerCase() === 'active',
    );
    const ids = activeMethods.map((method) => method.id);
    const types = Array.from(
      new Set(activeMethods.map((method) => method.paymentTypeId).filter(Boolean)),
    );

    return {
      ids,
      types,
      supportsCreditCard: types.includes('credit_card'),
      supportsPix: ids.includes('pix') || types.includes('bank_transfer'),
      supportsBoleto:
        ids.includes('boleto') || ids.includes('bolbradesco') || types.includes('ticket'),
    };
  }

  private async resolveWorkspacePaymentMethodSupport(workspaceId: string) {
    const seller = await this.getConnectedSellerClient(workspaceId);
    const methods = await this.fetchSellerPaymentMethods(seller.credentials);
    return this.summarizeAvailablePaymentMethods(methods);
  }

  async assertPaymentMethodAvailable(
    workspaceId: string,
    paymentMethod: CheckoutMarketplacePaymentMethod,
  ) {
    try {
      const support = await this.resolveWorkspacePaymentMethodSupport(workspaceId);
      const available =
        paymentMethod === 'CREDIT_CARD'
          ? support.supportsCreditCard
          : paymentMethod === 'PIX'
            ? support.supportsPix
            : support.supportsBoleto;

      if (available) {
        return;
      }

      if (paymentMethod === 'PIX') {
        throw new BadRequestException(
          'A conta Mercado Pago conectada ainda não tem Pix habilitado para este checkout.',
        );
      }

      if (paymentMethod === 'BOLETO') {
        throw new BadRequestException(
          'A conta Mercado Pago conectada ainda não tem boleto habilitado para este checkout.',
        );
      }

      throw new BadRequestException(
        'A conta Mercado Pago conectada ainda não tem cartão habilitado para este checkout.',
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.warn(
        `Mercado Pago payment-method discovery failed for workspace ${workspaceId}: ${String(
          (error as Error)?.message || error,
        )}`,
      );
    }
  }

  private async refreshConnectionIfNeeded(
    integration: { id: string; workspaceId: string; credentials: unknown; name: string },
    credentials: MercadoPagoStoredCredentials,
  ) {
    if (!this.isExpiringSoon(credentials) || !credentials.refreshToken) {
      return credentials;
    }

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        `Mercado Pago OAuth refresh skipped for workspace ${integration.workspaceId}: missing client credentials`,
      );
      return credentials;
    }

    const oauth = this.buildOauthClient();
    const refreshed = await oauth.refresh({
      body: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: credentials.refreshToken,
      },
    });

    const nextCredentials: MercadoPagoStoredCredentials = {
      ...credentials,
      accessToken: refreshed.access_token || credentials.accessToken,
      refreshToken: refreshed.refresh_token || credentials.refreshToken,
      tokenType: refreshed.token_type || credentials.tokenType,
      scope: refreshed.scope || credentials.scope,
      liveMode: refreshed.live_mode ?? credentials.liveMode,
      expiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : credentials.expiresAt,
      connectedAt: credentials.connectedAt || new Date().toISOString(),
      publicKey: refreshed.public_key || credentials.publicKey,
    };

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { credentials: this.serializeCredentials(nextCredentials) },
    });

    return nextCredentials;
  }

  async getWorkspaceConnectionStatus(workspaceId: string) {
    const integration = await this.findWorkspaceIntegration(workspaceId);
    if (!integration || !integration.isActive) {
      return {
        connected: false,
        provider: 'mercado_pago',
        checkoutEnabled: false,
        reason: 'Conecte seu Mercado Pago para começar a vender.',
      };
    }

    const credentials = await this.refreshConnectionIfNeeded(
      integration,
      this.parseCredentials(integration.credentials),
    );

    return {
      connected: Boolean(credentials.accessToken && credentials.publicKey),
      provider: 'mercado_pago',
      checkoutEnabled: Boolean(credentials.accessToken && credentials.publicKey),
      marketplaceFeePercent: this.platformFeePercent,
      installmentInterestMonthlyPercent: this.installmentInterestMonthlyPercent,
      seller: credentials.seller || null,
      publicKey: credentials.publicKey || null,
      liveMode: credentials.liveMode ?? null,
      connectedAt: credentials.connectedAt || null,
      expiresAt: credentials.expiresAt || null,
      integrationId: integration.id,
    };
  }

  getAuthorizationUrl(workspaceId: string, req?: any, returnUrl?: string) {
    if (!this.clientId || !this.clientSecret) {
      throw new InternalServerErrorException(
        'MERCADOPAGO_CLIENT_ID e MERCADOPAGO_CLIENT_SECRET precisam estar configurados.',
      );
    }

    const state = this.encodeState({
      workspaceId,
      returnUrl: this.sanitizeReturnUrl(returnUrl),
      exp: Date.now() + STATE_TTL_MS,
    });

    const oauth = this.buildOauthClient();
    const authUrl = oauth.getAuthorizationURL({
      options: {
        client_id: this.clientId,
        redirect_uri: this.resolveCallbackUrl(req),
        state,
      },
    });

    return { authUrl };
  }

  async handleOAuthCallback(code: string, state: string, req?: any) {
    if (!code) {
      throw new BadRequestException('Mercado Pago não retornou o código de autorização.');
    }

    const payload = this.decodeState(state);
    const oauth = this.buildOauthClient();
    const authResponse = await oauth.create({
      body: {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.resolveCallbackUrl(req),
      },
    });

    const accessToken = authResponse.access_token;
    if (!accessToken) {
      throw new InternalServerErrorException(
        'Mercado Pago não retornou um access_token válido para a conta conectada.',
      );
    }

    const seller = await this.loadSellerProfile(accessToken);

    await this.upsertWorkspaceIntegration(payload.workspaceId, {
      accessToken,
      refreshToken: authResponse.refresh_token,
      publicKey: authResponse.public_key || this.platformPublicKey,
      mercadoPagoUserId: authResponse.user_id || seller.id,
      liveMode: authResponse.live_mode,
      scope: authResponse.scope,
      tokenType: authResponse.token_type,
      expiresAt: authResponse.expires_in
        ? new Date(Date.now() + authResponse.expires_in * 1000).toISOString()
        : undefined,
      connectedAt: new Date().toISOString(),
      seller,
    });

    return {
      redirectUrl: this.sanitizeReturnUrl(payload.returnUrl),
      workspaceId: payload.workspaceId,
    };
  }

  async disconnectWorkspace(workspaceId: string) {
    const integration = await this.findWorkspaceIntegration(workspaceId);
    if (!integration) {
      return { disconnected: true };
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: { isActive: false },
    });

    return { disconnected: true };
  }

  async getPublicCheckoutConfig(workspaceId: string) {
    const status = await this.getWorkspaceConnectionStatus(workspaceId);
    let paymentMethodSupport: {
      ids: string[];
      types: string[];
      supportsCreditCard: boolean;
      supportsPix: boolean;
      supportsBoleto: boolean;
    } | null = null;

    if (status.connected) {
      try {
        paymentMethodSupport = await this.resolveWorkspacePaymentMethodSupport(workspaceId);
      } catch (error) {
        this.logger.warn(
          `Mercado Pago public checkout capability discovery failed for ${workspaceId}: ${String(
            (error as Error)?.message || error,
          )}`,
        );
      }
    }

    return {
      provider: 'mercado_pago',
      connected: status.connected,
      publicKey: status.publicKey || null,
      checkoutEnabled: status.checkoutEnabled,
      unavailableReason: status.connected
        ? null
        : 'O produtor ainda precisa conectar o Mercado Pago para receber pagamentos.',
      marketplaceFeePercent: status.marketplaceFeePercent,
      installmentInterestMonthlyPercent: status.installmentInterestMonthlyPercent,
      availablePaymentMethodIds: paymentMethodSupport?.ids || [],
      availablePaymentMethodTypes: paymentMethodSupport?.types || [],
      supportsCreditCard: paymentMethodSupport?.supportsCreditCard ?? true,
      supportsPix: paymentMethodSupport?.supportsPix ?? true,
      supportsBoleto: paymentMethodSupport?.supportsBoleto ?? true,
    };
  }

  async getConnectedSellerClient(workspaceId: string): Promise<ConnectedSeller> {
    const integration = await this.findWorkspaceIntegration(workspaceId);
    if (!integration || !integration.isActive) {
      throw new BadRequestException('Conecte seu Mercado Pago para começar a vender.');
    }

    const credentials = await this.refreshConnectionIfNeeded(
      integration,
      this.parseCredentials(integration.credentials),
    );

    if (!credentials.accessToken || !credentials.publicKey) {
      throw new BadRequestException(
        'A conexão do Mercado Pago está incompleta. Reconecte a conta.',
      );
    }

    return {
      integration: {
        id: integration.id,
        workspaceId: integration.workspaceId,
        name: integration.name,
        credentials: integration.credentials,
      },
      credentials,
      client: new MercadoPagoConfig({ accessToken: credentials.accessToken }),
    };
  }

  buildChargeSummary(params: {
    baseTotalInCents: number;
    paymentMethod: CheckoutMarketplacePaymentMethod;
    installments?: number;
  }): CheckoutMarketplacePricingSummary {
    return buildCheckoutMarketplacePricing({
      baseTotalInCents: params.baseTotalInCents,
      paymentMethod: params.paymentMethod,
      installments: params.installments,
      platformFeePercent: this.platformFeePercent,
      installmentInterestMonthlyPercent: this.installmentInterestMonthlyPercent,
      gatewayFeePercent: this.getGatewayFeePercent(params.paymentMethod),
    });
  }

  extractPrimaryOrderPayment(order: OrderResponse): NormalizedMercadoPagoOrderPayment {
    return normalizeMercadoPagoOrderPayment(order);
  }

  async createMarketplaceOrder(params: CreateMarketplaceOrderParams) {
    if (params.paymentMethod !== 'CREDIT_CARD') {
      return this.createMarketplaceOfflinePayment(params);
    }

    const seller = await this.getConnectedSellerClient(params.workspaceId);
    const orderClient = new Order(seller.client);
    const payment = buildMercadoPagoOrderPaymentRequest({
      paymentMethod: params.paymentMethod,
      amountInCents: params.chargedTotalInCents,
      cardToken: params.cardToken,
      cardPaymentMethodId: params.cardPaymentMethodId,
      cardPaymentType: params.cardPaymentType,
      installments: params.installments,
    });

    const orderBody = {
      type: 'online',
      processing_mode: 'automatic',
      capture_mode: 'automatic',
      external_reference: params.orderId,
      total_amount: centsToMercadoPagoAmount(params.chargedTotalInCents),
      description: params.productDescription || params.productName,
      marketplace: 'Kloel',
      marketplace_fee: centsToMercadoPagoAmount(params.marketplaceFeeInCents),
      payer: {
        email: params.customerEmail,
        first_name: params.customerName.split(' ')[0] || params.customerName,
        last_name:
          params.customerName.split(' ').slice(1).join(' ') || params.customerName.split(' ')[0],
        phone: normalizePhone(params.customerPhone),
        identification: normalizeIdentification(params.customerCPF),
        address: normalizeMercadoPagoPayerAddress(params.shippingAddress),
      },
      items: [
        {
          title: params.productName,
          description: params.productDescription,
          quantity: 1,
          unit_price: centsToMercadoPagoAmount(params.chargedTotalInCents),
          picture_url: params.productImage,
          category_id: 'digital_goods',
          external_code: params.orderNumber,
          warranty: false,
        },
      ],
      transactions: {
        payments: [payment],
      },
    };

    const response = await orderClient.create({
      body: orderBody,
      requestOptions: { idempotencyKey: params.orderId },
    });

    return {
      order: response,
      seller,
      split: {
        baseTotalInCents: params.baseTotalInCents,
        chargedTotalInCents: params.chargedTotalInCents,
        marketplaceFeeInCents: params.marketplaceFeeInCents,
      },
    };
  }

  private async createMarketplaceOfflinePayment(params: CreateMarketplaceOrderParams) {
    const seller = await this.getConnectedSellerClient(params.workspaceId);
    const paymentClient = new Payment(seller.client);
    const paymentMethodId = params.paymentMethod === 'PIX' ? 'pix' : 'bolbradesco';
    const payerAddress = normalizeMercadoPagoPayerAddress(params.shippingAddress);
    const notificationUrl = this.resolveWebhookNotificationUrl();
    const paymentBody: PaymentCreateRequest = {
      transaction_amount: Number(centsToMercadoPagoAmount(params.chargedTotalInCents)),
      description: params.productDescription || params.productName,
      external_reference: params.orderId,
      payment_method_id: paymentMethodId,
      date_of_expiration:
        params.paymentMethod === 'PIX'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      application_fee: Number(centsToMercadoPagoAmount(params.marketplaceFeeInCents)),
      statement_descriptor: 'KLOEL',
      payer: {
        email: params.customerEmail,
        first_name: params.customerName.split(' ')[0] || params.customerName,
        last_name:
          params.customerName.split(' ').slice(1).join(' ') || params.customerName.split(' ')[0],
        phone: normalizePhone(params.customerPhone),
        identification: normalizeIdentification(params.customerCPF),
        address: payerAddress
          ? {
              zip_code: payerAddress.zip_code,
              street_name: payerAddress.street_name,
              street_number: payerAddress.street_number,
              neighborhood: payerAddress.neighborhood,
              city: payerAddress.city,
              federal_unit: payerAddress.state,
            }
          : undefined,
      },
      additional_info: {
        items: [
          {
            id: params.orderNumber,
            title: params.productName,
            description: params.productDescription,
            quantity: 1,
            unit_price: Number(centsToMercadoPagoAmount(params.chargedTotalInCents)),
            picture_url: params.productImage,
            category_id: 'digital_goods',
          },
        ],
        payer: {
          first_name: params.customerName.split(' ')[0] || params.customerName,
          last_name:
            params.customerName.split(' ').slice(1).join(' ') || params.customerName.split(' ')[0],
          phone: normalizePhone(params.customerPhone),
          address: payerAddress,
        },
      },
    };

    if (notificationUrl) {
      paymentBody.notification_url = notificationUrl;
    }

    if (params.paymentMethod === 'PIX') {
      paymentBody.point_of_interaction = {
        type: 'CHECKOUT',
      };
    }

    const response = await paymentClient.create({
      body: paymentBody,
      requestOptions: { idempotencyKey: params.orderId },
    });

    return {
      order: {
        id: response.order?.id ? String(response.order.id) : String(response.id || params.orderId),
        status: response.status || 'pending',
        status_detail: response.status_detail || undefined,
        external_reference: response.external_reference || params.orderId,
        expiration_time: response.date_of_expiration || undefined,
        transactions: {
          payments: [
            {
              id: response.id ? String(response.id) : undefined,
              status: response.status || undefined,
              status_detail: response.status_detail || undefined,
              amount: response.transaction_amount?.toFixed(2),
              paid_amount: response.transaction_details?.total_paid_amount?.toFixed(2),
              payment_method: {
                id: response.payment_method_id || undefined,
                type: response.payment_type_id || undefined,
                ticket_url: response.point_of_interaction?.transaction_data?.ticket_url,
                qr_code: response.point_of_interaction?.transaction_data?.qr_code,
                qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
                digitable_line: response.transaction_details?.digitable_line,
                barcode_content: response.transaction_details?.barcode?.content,
              },
              date_of_expiration: response.date_of_expiration || undefined,
            },
          ],
        },
      } as OrderResponse,
      seller,
      split: {
        baseTotalInCents: params.baseTotalInCents,
        chargedTotalInCents: params.chargedTotalInCents,
        marketplaceFeeInCents: params.marketplaceFeeInCents,
      },
      payment: response,
    };
  }

  async getPaymentById(workspaceId: string, paymentId: string) {
    const seller = await this.getConnectedSellerClient(workspaceId);
    const paymentClient = new Payment(seller.client);
    return await paymentClient.get({ id: paymentId });
  }

  async getOrderById(workspaceId: string, orderId: string) {
    const seller = await this.getConnectedSellerClient(workspaceId);
    const orderClient = new Order(seller.client);
    return await orderClient.get({ id: orderId });
  }

  async refundPayment(workspaceId: string, paymentId: string, amountInCents?: number) {
    const seller = await this.getConnectedSellerClient(workspaceId);
    const refundClient = new PaymentRefund(seller.client);

    return refundClient.create({
      payment_id: paymentId,
      body: amountInCents ? { amount: Number((amountInCents / 100).toFixed(2)) } : undefined,
    });
  }

  async findWorkspaceIdByMercadoPagoUserId(userId?: string | number | null) {
    if (!userId) return null;

    const integrations = await this.prisma.integration.findMany({
      where: { type: MERCADO_PAGO_TYPE, isActive: true },
      select: { id: true, workspaceId: true, credentials: true, name: true },
      take: 500,
    });

    const target = String(userId);
    const match = integrations.find((integration) => {
      const credentials = this.parseCredentials(integration.credentials);
      return String(credentials.mercadoPagoUserId || '') === target;
    });

    return match?.workspaceId || null;
  }
}

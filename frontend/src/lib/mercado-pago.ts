import { loadMercadoPago } from '@mercadopago/sdk-js';

type MercadoPagoConstructor = new (
  publicKey: string,
  options?: { locale?: string; advancedFraudPrevention?: boolean; trackingDisabled?: boolean },
) => unknown;

type CardTokenApiResponse = {
  id?: string;
  last_four_digits?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  bin?: string;
  first_six_digits?: string;
  error?: string;
  message?: string;
  cause?: Array<{ code?: string; description?: string }>;
};

type PaymentMethodSearchResponse = {
  results?: Array<{
    id?: string;
    name?: string;
    payment_type_id?: string;
  }>;
};

export type MercadoPagoTokenResult = {
  token: string;
  paymentMethodId: string;
  paymentType: string;
  last4: string;
};

type MercadoPagoCardInput = {
  cardNumber: string;
  cardholderName: string;
  identificationNumber?: string;
  securityCode: string;
  cardExpirationMonth: string;
  cardExpirationYear: string;
};

let sdkReadyPromise: Promise<void> | null = null;
let securityScriptReadyPromise: Promise<void> | null = null;
const sdkInstances = new Map<string, unknown>();

function asDigits(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function buildMercadoPagoError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return new Error(fallback);
  }

  const value = payload as {
    error?: string;
    message?: string;
    cause?: Array<{ code?: string; description?: string }>;
  };

  const causes = Array.isArray(value.cause)
    ? value.cause
        .map((item) => item?.description || item?.code)
        .filter((entry): entry is string => Boolean(entry))
    : [];

  const message = [value.error, value.message, ...causes].filter(Boolean).join(' | ');
  return new Error(message || fallback);
}

async function ensureMercadoPagoSdk() {
  if (typeof window === 'undefined') {
    throw new Error('Mercado Pago só pode ser inicializado no navegador.');
  }

  if (!sdkReadyPromise) {
    sdkReadyPromise = loadMercadoPago().then(() => undefined);
  }

  await sdkReadyPromise;
}

function ensureMercadoPagoSecurityScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Mercado Pago só pode ser inicializado no navegador.');
  }

  if (!securityScriptReadyPromise) {
    securityScriptReadyPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-mercadopago-security="true"]',
      );

      if (existing) {
        resolve();
        return;
      }

      const script =
        existing ||
        Object.assign(document.createElement('script'), {
          src: 'https://www.mercadopago.com/v2/security.js',
          async: true,
        });

      script.setAttribute('view', 'checkout');
      script.setAttribute('output', 'deviceId');
      script.setAttribute('data-mercadopago-security', 'true');

      const finish = () => resolve();
      script.addEventListener('load', finish, { once: true });
      script.addEventListener(
        'error',
        () =>
          reject(
            new Error('Não foi possível carregar o validador de dispositivo do Mercado Pago.'),
          ),
        { once: true },
      );

      document.body.appendChild(script);
    });
  }

  return securityScriptReadyPromise;
}

export async function preloadMercadoPagoDeviceSession() {
  await ensureMercadoPagoSecurityScript();
}

export async function getMercadoPagoDeviceSessionId() {
  await ensureMercadoPagoSecurityScript();

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const sessionId = (
      window as Window & {
        MP_DEVICE_SESSION_ID?: string;
      }
    ).MP_DEVICE_SESSION_ID;
    if (typeof sessionId === 'string' && sessionId.trim()) {
      return sessionId.trim();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  return null;
}

async function getMercadoPagoInstance(publicKey: string) {
  await ensureMercadoPagoSdk();

  if (!sdkInstances.has(publicKey)) {
    const ctor = (window as Window & { MercadoPago?: MercadoPagoConstructor }).MercadoPago;
    if (typeof ctor !== 'function') {
      throw new Error('Mercado Pago SDK não carregou corretamente no frontend.');
    }

    sdkInstances.set(
      publicKey,
      new ctor(publicKey, {
        locale: 'pt-BR',
        advancedFraudPrevention: true,
      }),
    );
  }

  return sdkInstances.get(publicKey);
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    throw buildMercadoPagoError(payload, 'Mercado Pago recusou a requisição.');
  }

  if (!payload) {
    throw new Error('Mercado Pago retornou uma resposta vazia.');
  }

  return payload;
}

async function resolvePaymentMethod(
  publicKey: string,
  cardNumber: string,
): Promise<{ paymentMethodId: string; paymentType: string }> {
  const bin = asDigits(cardNumber).slice(0, 6);
  if (bin.length < 6) {
    throw new Error('Número do cartão inválido para detectar a bandeira.');
  }

  const url = new URL('https://api.mercadopago.com/v1/payment_methods/search');
  url.searchParams.set('public_key', publicKey);
  url.searchParams.set('bin', bin);

  const payload = await fetchJson<PaymentMethodSearchResponse>(url);
  const creditCardMethod = payload.results?.find(
    (result) => result.payment_type_id === 'credit_card' && result.id,
  );

  if (!creditCardMethod?.id) {
    throw new Error('Mercado Pago não identificou a bandeira do cartão.');
  }

  return {
    paymentMethodId: creditCardMethod.id,
    paymentType: creditCardMethod.payment_type_id || 'credit_card',
  };
}

export async function tokenizeMercadoPagoCard(
  publicKey: string,
  card: MercadoPagoCardInput,
): Promise<MercadoPagoTokenResult> {
  const normalizedPublicKey = String(publicKey || '').trim();
  if (!normalizedPublicKey) {
    throw new Error('Public Key do Mercado Pago não configurada.');
  }

  await getMercadoPagoInstance(normalizedPublicKey);

  const cardNumber = asDigits(card.cardNumber);
  const securityCode = asDigits(card.securityCode);
  const identificationNumber = asDigits(card.identificationNumber);
  const expirationMonth = Number(asDigits(card.cardExpirationMonth));
  const expirationYear = Number(asDigits(card.cardExpirationYear));

  if (cardNumber.length < 13) {
    throw new Error('Número do cartão inválido.');
  }
  if (securityCode.length < 3) {
    throw new Error('Código de segurança inválido.');
  }
  if (!card.cardholderName?.trim()) {
    throw new Error('Nome do titular é obrigatório.');
  }
  if (!identificationNumber) {
    throw new Error('Documento do titular é obrigatório.');
  }
  if (!expirationMonth || !expirationYear) {
    throw new Error('Validade do cartão inválida.');
  }

  const url = new URL('https://api.mercadopago.com/v1/card_tokens');
  url.searchParams.set('public_key', normalizedPublicKey);

  const payload = await fetchJson<CardTokenApiResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      card_number: cardNumber,
      security_code: securityCode,
      expiration_month: expirationMonth,
      expiration_year: expirationYear,
      cardholder: {
        name: card.cardholderName.trim(),
        identification: {
          type: identificationNumber.length === 14 ? 'CNPJ' : 'CPF',
          number: identificationNumber,
        },
      },
    }),
  });

  if (!payload.id) {
    throw buildMercadoPagoError(payload, 'Mercado Pago não retornou o token do cartão.');
  }

  const resolvedMethod =
    payload.payment_method_id && payload.payment_type_id
      ? {
          paymentMethodId: payload.payment_method_id,
          paymentType: payload.payment_type_id,
        }
      : await resolvePaymentMethod(normalizedPublicKey, cardNumber);

  return {
    token: payload.id,
    paymentMethodId: resolvedMethod.paymentMethodId,
    paymentType: resolvedMethod.paymentType,
    last4: payload.last_four_digits || cardNumber.slice(-4),
  };
}

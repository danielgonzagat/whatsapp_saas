const { PrismaClient } = require('@prisma/client');
const { chromium } = require('playwright');
const { MercadoPagoConfig, Order } = require('mercadopago');
const util = require('util');

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function resolveDeviceSessionId() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body><div id="app">kloel</div></body></html>');
    await page.addScriptTag({
      url: 'https://www.mercadopago.com/v2/security.js',
      type: 'text/javascript',
    });
    await page.evaluate(() => {
      const script = document.querySelector(
        'script[src="https://www.mercadopago.com/v2/security.js"]',
      );
      if (script) {
        script.setAttribute('view', 'checkout');
        script.setAttribute('output', 'deviceId');
      }
    });

    await page.waitForFunction(
      () =>
        typeof window.MP_DEVICE_SESSION_ID === 'string' && window.MP_DEVICE_SESSION_ID.length > 8,
      { timeout: 15000 },
    );

    return await page.evaluate(() => window.MP_DEVICE_SESSION_ID);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function createCardToken(publicKey) {
  const cardPayload = {
    card_number: required('MP_TEST_CARD_NUMBER'),
    security_code: required('MP_TEST_CARD_CVV'),
    expiration_month: Number(required('MP_TEST_CARD_EXP_MONTH')),
    expiration_year: Number(required('MP_TEST_CARD_EXP_YEAR')),
    cardholder: {
      name: required('MP_TEST_CARDHOLDER_NAME'),
      identification: {
        type: required('MP_TEST_DOC_TYPE'),
        number: required('MP_TEST_DOC_NUMBER'),
      },
    },
  };

  const response = await fetch(
    `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardPayload),
    },
  );
  const payload = await response.json();

  if (!response.ok || !payload.id) {
    throw new Error(`Tokenização falhou: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const accessToken = required('MP_TEST_ACCESS_TOKEN');
    const publicKey = required('MP_TEST_PUBLIC_KEY');
    const checkoutCode = String(process.env.MP_TEST_CHECKOUT_CODE || 'MPX9Q2Z7')
      .trim()
      .toUpperCase();

    const plan = await prisma.checkoutProductPlan.findFirst({
      where: { referenceCode: checkoutCode },
      include: { product: true },
    });

    if (!plan) {
      throw new Error(`Checkout code not found: ${checkoutCode}`);
    }
    console.log(`plan:${plan.referenceCode}`);

    const deviceSessionId = await resolveDeviceSessionId();
    console.log(`device:${deviceSessionId ? 'ok' : 'missing'}`);
    const tokenPayload = await createCardToken(publicKey);
    console.log(`token:${tokenPayload.id ? 'ok' : 'missing'}`);

    const buyerEmail = required('MP_TEST_BUYER_EMAIL');
    const buyerPhone = String(process.env.MP_TEST_BUYER_PHONE || '11999998888').replace(/\D/g, '');
    const areaCode = buyerPhone.slice(0, 2);
    const phoneNumber = buyerPhone.slice(2, 11);
    const baseTotalInCents = Math.round(Number(plan.priceInCents || 0));
    const platformFeeInCents = Math.round(baseTotalInCents * 0.099);
    const estimatedGatewayFeeInCents = Math.round(baseTotalInCents * 0.0499);
    const marketplaceFeeInCents = Math.max(0, platformFeeInCents - estimatedGatewayFeeInCents);
    const orderNumber = `KLTEST-${Date.now()}`;
    const client = new MercadoPagoConfig({ accessToken });
    const orderClient = new Order(client);

    const order = await orderClient.create({
      body: {
        type: 'online',
        processing_mode: 'automatic',
        capture_mode: 'automatic',
        external_reference: `smoke-${orderNumber}`,
        total_amount: (baseTotalInCents / 100).toFixed(2),
        description: plan.product?.description || plan.product?.name || plan.name,
        marketplace: 'Kloel',
        marketplace_fee: (marketplaceFeeInCents / 100).toFixed(2),
        payer: {
          email: buyerEmail,
          first_name: 'Comprador',
          last_name: 'Teste',
          identification: {
            type: required('MP_TEST_DOC_TYPE'),
            number: required('MP_TEST_DOC_NUMBER'),
          },
          phone: { area_code: areaCode, number: phoneNumber },
          address: {
            zip_code: '01310100',
            street_name: 'Avenida Paulista',
            street_number: '1000',
            neighborhood: 'Bela Vista',
            city: 'São Paulo',
            state: 'SP',
          },
        },
        items: [
          {
            title: plan.name || plan.product?.name || 'Produto Kloel',
            description: plan.product?.description || plan.name,
            quantity: Math.max(1, Number(plan.quantity || 1)),
            unit_price: (baseTotalInCents / 100).toFixed(2),
            category_id: 'digital_goods',
            external_code: plan.referenceCode || plan.id,
            warranty: false,
          },
        ],
        transactions: {
          payments: [
            {
              amount: (baseTotalInCents / 100).toFixed(2),
              payment_method: {
                id: tokenPayload.payment_method_id || 'visa',
                type: tokenPayload.payment_type_id || 'credit_card',
                token: tokenPayload.id,
                installments: 1,
                statement_descriptor: 'KLOEL',
              },
            },
          ],
        },
      },
      requestOptions: {
        idempotencyKey: `smoke-${orderNumber}`,
        meliSessionId: deviceSessionId,
      },
    });
    console.log('order:create:ok');

    const payment = order?.transactions?.payments?.[0] || null;
    console.log(
      JSON.stringify(
        {
          checkoutCode: plan.referenceCode,
          localPlanId: plan.id,
          productName: plan.product?.name || plan.name,
          deviceSessionId,
          orderId: order.id,
          orderStatus: order.status,
          paymentId: payment?.id || null,
          paymentStatus: payment?.status || null,
          paymentStatusDetail: payment?.status_detail || null,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((error) => {
  console.error(util.inspect(error, { depth: 10, colors: false, breakLength: 120 }));
  process.exit(1);
});

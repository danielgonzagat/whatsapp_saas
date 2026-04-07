require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function deriveKey(keyMaterial) {
  if (/^[a-f0-9]{64}$/i.test(keyMaterial)) {
    return Buffer.from(keyMaterial, 'hex');
  }

  try {
    const decoded = Buffer.from(keyMaterial, 'base64');
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // noop
  }

  return crypto.createHash('sha256').update(keyMaterial).digest();
}

function encryptMaybe(value) {
  if (!value) return undefined;

  const key =
    String(process.env.ENCRYPTION_KEY || '').trim() ||
    String(process.env.PROVIDER_SECRET_KEY || '').trim() ||
    String(process.env.JWT_SECRET || '').trim();

  if (!key) return value;

  const derivedKey = deriveKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

async function loadSellerProfile(accessToken) {
  const response = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Mercado Pago seller profile lookup failed: ${payload?.message || response.statusText}`,
    );
  }

  return payload;
}

async function main() {
  const workspaceId = required('MP_CONNECT_WORKSPACE_ID');
  const accessToken = required('MP_CONNECT_ACCESS_TOKEN');
  const publicKey = required('MP_CONNECT_PUBLIC_KEY');
  const refreshToken = String(process.env.MP_CONNECT_REFRESH_TOKEN || '').trim() || undefined;
  const integrationType = 'MERCADO_PAGO';

  const seller = await loadSellerProfile(accessToken);
  const name = seller.nickname || seller.email || 'Mercado Pago conectado';

  const credentials = {
    accessToken: encryptMaybe(accessToken),
    refreshToken: refreshToken ? encryptMaybe(refreshToken) : undefined,
    publicKey,
    mercadoPagoUserId: seller.id,
    liveMode: !String(seller.nickname || '').startsWith('TESTUSER'),
    scope: seller.scope || undefined,
    tokenType: 'bearer',
    connectedAt: new Date().toISOString(),
    seller: {
      id: seller.id,
      nickname: seller.nickname,
      email: seller.email,
      firstName: seller.first_name,
      lastName: seller.last_name,
      countryId: seller.country_id,
      status: seller.status?.site_status,
    },
  };

  const existing = await prisma.integration.findFirst({
    where: { workspaceId, type: integrationType },
    orderBy: { createdAt: 'desc' },
  });

  const result = existing
    ? await prisma.integration.update({
        where: { id: existing.id },
        data: {
          name,
          isActive: true,
          credentials,
        },
      })
    : await prisma.integration.create({
        data: {
          workspaceId,
          type: integrationType,
          name,
          isActive: true,
          credentials,
        },
      });

  console.log(
    JSON.stringify(
      {
        integrationId: result.id,
        workspaceId,
        sellerId: seller.id,
        sellerNickname: seller.nickname,
        liveMode: credentials.liveMode,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

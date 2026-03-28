-- CreateEnum: ProductStatus
DO $$ BEGIN
  CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: CheckoutTheme
DO $$ BEGIN
  CREATE TYPE "CheckoutTheme" AS ENUM ('NOIR', 'BLANC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: TimerType
DO $$ BEGIN
  CREATE TYPE "TimerType" AS ENUM ('COUNTDOWN', 'EXPIRATION', 'STOCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: UpsellChargeType
DO $$ BEGIN
  CREATE TYPE "UpsellChargeType" AS ENUM ('ONE_CLICK', 'NEW_PAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: DiscountType
DO $$ BEGIN
  CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: PixelType
DO $$ BEGIN
  CREATE TYPE "PixelType" AS ENUM ('FACEBOOK', 'GOOGLE_ADS', 'GOOGLE_ANALYTICS', 'TIKTOK', 'KWAI', 'TABOOLA', 'CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: PaymentMethod
DO $$ BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'PIX', 'BOLETO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: OrderStatus
DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELED', 'REFUNDED', 'CHARGEBACK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum: PaymentStatus
DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'DECLINED', 'CANCELED', 'REFUNDED', 'CHARGEBACK', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: PhysicalProduct
CREATE TABLE IF NOT EXISTS "PhysicalProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "images" JSONB NOT NULL DEFAULT '[]',
    "weight" DOUBLE PRECISION,
    "dimensions" JSONB,
    "sku" TEXT,
    "stock" INTEGER,
    "category" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhysicalProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutProductPlan
CREATE TABLE IF NOT EXISTS "CheckoutProductPlan" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "maxInstallments" INTEGER NOT NULL DEFAULT 12,
    "installmentsFee" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "freeShipping" BOOLEAN NOT NULL DEFAULT false,
    "shippingPrice" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutProductPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutConfig
CREATE TABLE IF NOT EXISTS "CheckoutConfig" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "theme" "CheckoutTheme" NOT NULL DEFAULT 'BLANC',
    "accentColor" TEXT,
    "accentColor2" TEXT,
    "backgroundColor" TEXT,
    "cardColor" TEXT,
    "textColor" TEXT,
    "mutedTextColor" TEXT,
    "fontBody" TEXT,
    "fontDisplay" TEXT,
    "brandName" TEXT NOT NULL,
    "brandLogo" TEXT,
    "headerMessage" TEXT,
    "headerSubMessage" TEXT,
    "productImage" TEXT,
    "productDisplayName" TEXT,
    "btnStep1Text" TEXT NOT NULL DEFAULT 'Ir para Entrega',
    "btnStep2Text" TEXT NOT NULL DEFAULT 'Ir para Pagamento',
    "btnFinalizeText" TEXT NOT NULL DEFAULT 'Finalizar compra',
    "btnFinalizeIcon" TEXT NOT NULL DEFAULT 'lock',
    "requireCPF" BOOLEAN NOT NULL DEFAULT true,
    "requirePhone" BOOLEAN NOT NULL DEFAULT true,
    "phoneLabel" TEXT NOT NULL DEFAULT 'Celular / WhatsApp',
    "enableCreditCard" BOOLEAN NOT NULL DEFAULT true,
    "enablePix" BOOLEAN NOT NULL DEFAULT true,
    "enableBoleto" BOOLEAN NOT NULL DEFAULT false,
    "enableCoupon" BOOLEAN NOT NULL DEFAULT true,
    "showCouponPopup" BOOLEAN NOT NULL DEFAULT true,
    "couponPopupDelay" INTEGER NOT NULL DEFAULT 2400,
    "couponPopupTitle" TEXT NOT NULL DEFAULT 'Presente especial para voce',
    "couponPopupDesc" TEXT NOT NULL DEFAULT 'Um desconto exclusivo para sua primeira compra.',
    "couponPopupBtnText" TEXT NOT NULL DEFAULT 'Aplicar desconto',
    "couponPopupDismiss" TEXT NOT NULL DEFAULT 'Nao, obrigado',
    "autoCouponCode" TEXT,
    "enableTimer" BOOLEAN NOT NULL DEFAULT false,
    "timerType" "TimerType",
    "timerMinutes" INTEGER,
    "timerMessage" TEXT,
    "timerExpiredMessage" TEXT,
    "timerPosition" TEXT NOT NULL DEFAULT 'top',
    "showStockCounter" BOOLEAN NOT NULL DEFAULT false,
    "stockMessage" TEXT,
    "fakeStockCount" INTEGER,
    "enableTestimonials" BOOLEAN NOT NULL DEFAULT true,
    "testimonials" JSONB NOT NULL DEFAULT '[]',
    "enableGuarantee" BOOLEAN NOT NULL DEFAULT true,
    "guaranteeTitle" TEXT NOT NULL DEFAULT 'Garantia de 30 dias',
    "guaranteeText" TEXT NOT NULL DEFAULT 'Nao gostou? Devolvemos 100% do seu dinheiro.',
    "guaranteeDays" INTEGER NOT NULL DEFAULT 30,
    "enableTrustBadges" BOOLEAN NOT NULL DEFAULT true,
    "trustBadges" JSONB NOT NULL DEFAULT '["Compra protegida","Dados criptografados"]',
    "footerText" TEXT NOT NULL DEFAULT 'Checkout seguro por Kloel',
    "showPaymentIcons" BOOLEAN NOT NULL DEFAULT true,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaImage" TEXT,
    "favicon" TEXT,
    "customCSS" TEXT,
    "enableExitIntent" BOOLEAN NOT NULL DEFAULT false,
    "exitIntentTitle" TEXT,
    "exitIntentDescription" TEXT,
    "exitIntentCouponCode" TEXT,
    "enableFloatingBar" BOOLEAN NOT NULL DEFAULT false,
    "floatingBarMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: OrderBump
CREATE TABLE IF NOT EXISTS "OrderBump" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "image" TEXT,
    "priceInCents" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "highlightColor" TEXT,
    "checkboxLabel" TEXT NOT NULL DEFAULT 'Sim, eu quero!',
    "position" TEXT NOT NULL DEFAULT 'before_payment',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderBump_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Upsell
CREATE TABLE IF NOT EXISTS "Upsell" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "image" TEXT,
    "priceInCents" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,
    "acceptBtnText" TEXT NOT NULL DEFAULT 'Sim, quero essa oferta!',
    "declineBtnText" TEXT NOT NULL DEFAULT 'Nao, obrigado',
    "timerSeconds" INTEGER,
    "chargeType" "UpsellChargeType" NOT NULL DEFAULT 'ONE_CLICK',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upsell_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutCoupon
CREATE TABLE IF NOT EXISTS "CheckoutCoupon" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "minOrderValue" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerUser" INTEGER,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "appliesTo" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutPixel
CREATE TABLE IF NOT EXISTS "CheckoutPixel" (
    "id" TEXT NOT NULL,
    "checkoutConfigId" TEXT NOT NULL,
    "type" "PixelType" NOT NULL,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT,
    "trackPageView" BOOLEAN NOT NULL DEFAULT true,
    "trackInitiateCheckout" BOOLEAN NOT NULL DEFAULT true,
    "trackAddPaymentInfo" BOOLEAN NOT NULL DEFAULT true,
    "trackPurchase" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutPixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutOrder
CREATE TABLE IF NOT EXISTS "CheckoutOrder" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerCPF" TEXT,
    "customerPhone" TEXT,
    "shippingAddress" JSONB NOT NULL,
    "shippingMethod" TEXT,
    "shippingPrice" INTEGER NOT NULL DEFAULT 0,
    "subtotalInCents" INTEGER NOT NULL,
    "discountInCents" INTEGER NOT NULL DEFAULT 0,
    "bumpTotalInCents" INTEGER NOT NULL DEFAULT 0,
    "totalInCents" INTEGER NOT NULL,
    "couponCode" TEXT,
    "couponDiscount" INTEGER,
    "acceptedBumps" JSONB NOT NULL DEFAULT '[]',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "affiliateId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CheckoutPayment
CREATE TABLE IF NOT EXISTS "CheckoutPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "externalId" TEXT,
    "pixQrCode" TEXT,
    "pixCopyPaste" TEXT,
    "pixExpiresAt" TIMESTAMP(3),
    "boletoUrl" TEXT,
    "boletoBarcode" TEXT,
    "boletoExpiresAt" TIMESTAMP(3),
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "webhookData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UpsellOrder
CREATE TABLE IF NOT EXISTS "UpsellOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "upsellId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceInCents" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UpsellOrder_pkey" PRIMARY KEY ("id")
);

-- Unique indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "PhysicalProduct_slug_key" ON "PhysicalProduct"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutProductPlan_slug_key" ON "CheckoutProductPlan"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutProductPlan_referenceCode_key" ON "CheckoutProductPlan"("referenceCode");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutConfig_planId_key" ON "CheckoutConfig"("planId");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutCoupon_workspaceId_code_key" ON "CheckoutCoupon"("workspaceId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutOrder_orderNumber_key" ON "CheckoutOrder"("orderNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "CheckoutPayment_orderId_key" ON "CheckoutPayment"("orderId");

-- Regular indexes (idempotent)
CREATE INDEX IF NOT EXISTS "PhysicalProduct_workspaceId_idx" ON "PhysicalProduct"("workspaceId");
CREATE INDEX IF NOT EXISTS "PhysicalProduct_slug_idx" ON "PhysicalProduct"("slug");
CREATE INDEX IF NOT EXISTS "CheckoutProductPlan_productId_idx" ON "CheckoutProductPlan"("productId");
CREATE INDEX IF NOT EXISTS "CheckoutProductPlan_slug_idx" ON "CheckoutProductPlan"("slug");
CREATE INDEX IF NOT EXISTS "CheckoutProductPlan_referenceCode_idx" ON "CheckoutProductPlan"("referenceCode");
CREATE INDEX IF NOT EXISTS "OrderBump_planId_idx" ON "OrderBump"("planId");
CREATE INDEX IF NOT EXISTS "Upsell_planId_idx" ON "Upsell"("planId");
CREATE INDEX IF NOT EXISTS "CheckoutCoupon_workspaceId_idx" ON "CheckoutCoupon"("workspaceId");
CREATE INDEX IF NOT EXISTS "CheckoutCoupon_code_idx" ON "CheckoutCoupon"("code");
CREATE INDEX IF NOT EXISTS "CheckoutPixel_checkoutConfigId_idx" ON "CheckoutPixel"("checkoutConfigId");
CREATE INDEX IF NOT EXISTS "CheckoutOrder_workspaceId_idx" ON "CheckoutOrder"("workspaceId");
CREATE INDEX IF NOT EXISTS "CheckoutOrder_planId_idx" ON "CheckoutOrder"("planId");
CREATE INDEX IF NOT EXISTS "CheckoutOrder_customerEmail_idx" ON "CheckoutOrder"("customerEmail");
CREATE INDEX IF NOT EXISTS "CheckoutOrder_orderNumber_idx" ON "CheckoutOrder"("orderNumber");
CREATE INDEX IF NOT EXISTS "CheckoutOrder_status_idx" ON "CheckoutOrder"("status");
CREATE INDEX IF NOT EXISTS "CheckoutPayment_externalId_idx" ON "CheckoutPayment"("externalId");
CREATE INDEX IF NOT EXISTS "UpsellOrder_orderId_idx" ON "UpsellOrder"("orderId");

-- Foreign Keys (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE "PhysicalProduct" ADD CONSTRAINT "PhysicalProduct_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutProductPlan" ADD CONSTRAINT "CheckoutProductPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "PhysicalProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutConfig" ADD CONSTRAINT "CheckoutConfig_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrderBump" ADD CONSTRAINT "OrderBump_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Upsell" ADD CONSTRAINT "Upsell_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutPixel" ADD CONSTRAINT "CheckoutPixel_checkoutConfigId_fkey" FOREIGN KEY ("checkoutConfigId") REFERENCES "CheckoutConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutOrder" ADD CONSTRAINT "CheckoutOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CheckoutPayment" ADD CONSTRAINT "CheckoutPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CheckoutOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UpsellOrder" ADD CONSTRAINT "UpsellOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CheckoutOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

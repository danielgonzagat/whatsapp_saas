-- CreateTable: KloelSite
CREATE TABLE IF NOT EXISTS "KloelSite" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Site sem titulo',
  "slug" TEXT,
  "htmlContent" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "productId" TEXT,
  "visits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KloelSite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KloelSite_slug_key" ON "KloelSite"("slug");
CREATE INDEX IF NOT EXISTS "KloelSite_workspaceId_idx" ON "KloelSite"("workspaceId");
CREATE INDEX IF NOT EXISTS "KloelSite_slug_idx" ON "KloelSite"("slug");

-- CreateTable: KloelDesign
CREATE TABLE IF NOT EXISTS "KloelDesign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'Design sem titulo',
  "format" TEXT NOT NULL DEFAULT 'post-ig',
  "width" INTEGER NOT NULL DEFAULT 1080,
  "height" INTEGER NOT NULL DEFAULT 1080,
  "productId" TEXT,
  "elements" JSONB NOT NULL DEFAULT '[]',
  "background" TEXT NOT NULL DEFAULT '#0A0A0C',
  "thumbnailUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "KloelDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KloelDesign_workspaceId_idx" ON "KloelDesign"("workspaceId");
CREATE INDEX IF NOT EXISTS "KloelDesign_workspaceId_productId_idx" ON "KloelDesign"("workspaceId", "productId");

-- CreateTable: CustomerSubscription
CREATE TABLE IF NOT EXISTS "CustomerSubscription" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT,
  "productId" TEXT,
  "planName" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "interval" TEXT NOT NULL DEFAULT 'MONTHLY',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextBillingAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "paymentsCount" INTEGER NOT NULL DEFAULT 0,
  "failedPayments" INTEGER NOT NULL DEFAULT 0,
  "externalId" TEXT,
  "paymentMethod" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerSubscription_workspaceId_status_idx" ON "CustomerSubscription"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_workspaceId_nextBillingAt_idx" ON "CustomerSubscription"("workspaceId", "nextBillingAt");

-- CreateTable: PhysicalOrder
CREATE TABLE IF NOT EXISTS "PhysicalOrder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT,
  "customerPhone" TEXT,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "trackingCode" TEXT,
  "trackingUrl" TEXT,
  "shippingMethod" TEXT,
  "shippingCost" DOUBLE PRECISION,
  "addressStreet" TEXT,
  "addressCity" TEXT,
  "addressState" TEXT,
  "addressZip" TEXT,
  "addressCountry" TEXT NOT NULL DEFAULT 'BR',
  "weight" DOUBLE PRECISION,
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "estimatedDelivery" TIMESTAMP(3),
  "paymentMethod" TEXT,
  "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
  "saleId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PhysicalOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhysicalOrder_workspaceId_status_idx" ON "PhysicalOrder"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "PhysicalOrder_workspaceId_createdAt_idx" ON "PhysicalOrder"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "PhysicalOrder_trackingCode_idx" ON "PhysicalOrder"("trackingCode");

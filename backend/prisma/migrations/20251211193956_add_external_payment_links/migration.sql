-- CreateTable
CREATE TABLE "ExternalPaymentLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "paymentUrl" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "affiliateUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSaleAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalPaymentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalPaymentLink_workspaceId_idx" ON "ExternalPaymentLink"("workspaceId");

-- CreateIndex
CREATE INDEX "ExternalPaymentLink_workspaceId_platform_idx" ON "ExternalPaymentLink"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "ExternalPaymentLink_workspaceId_productName_idx" ON "ExternalPaymentLink"("workspaceId", "productName");

-- AddForeignKey
ALTER TABLE "ExternalPaymentLink" ADD CONSTRAINT "ExternalPaymentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

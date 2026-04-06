-- CreateEnum
CREATE TYPE "CheckoutResourceKind" AS ENUM ('PLAN', 'CHECKOUT');

-- AlterTable
ALTER TABLE "CheckoutProductPlan"
ADD COLUMN "kind" "CheckoutResourceKind" NOT NULL DEFAULT 'PLAN',
ADD COLUMN "legacyCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CheckoutPlanLink" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slug" TEXT,
    "referenceCode" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutPlanLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutPlanLink_slug_key" ON "CheckoutPlanLink"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutPlanLink_referenceCode_key" ON "CheckoutPlanLink"("referenceCode");

-- CreateIndex
CREATE INDEX "CheckoutProductPlan_productId_kind_idx" ON "CheckoutProductPlan"("productId", "kind");

-- CreateIndex
CREATE INDEX "CheckoutPlanLink_checkoutId_idx" ON "CheckoutPlanLink"("checkoutId");

-- CreateIndex
CREATE INDEX "CheckoutPlanLink_planId_idx" ON "CheckoutPlanLink"("planId");

-- CreateIndex
CREATE INDEX "CheckoutPlanLink_referenceCode_idx" ON "CheckoutPlanLink"("referenceCode");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutPlanLink_checkoutId_planId_key" ON "CheckoutPlanLink"("checkoutId", "planId");

-- AddForeignKey
ALTER TABLE "CheckoutPlanLink" ADD CONSTRAINT "CheckoutPlanLink_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "CheckoutProductPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutPlanLink" ADD CONSTRAINT "CheckoutPlanLink_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CheckoutProductPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

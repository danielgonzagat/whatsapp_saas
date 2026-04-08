-- AlterTable
ALTER TABLE "CheckoutConfig"
ADD COLUMN "shippingMode" TEXT,
ADD COLUMN "shippingOriginZip" TEXT,
ADD COLUMN "shippingVariableMinInCents" INTEGER,
ADD COLUMN "shippingVariableMaxInCents" INTEGER,
ADD COLUMN "shippingUseKloelCalculator" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "affiliateCustomCommissionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "affiliateCustomCommissionType" TEXT,
ADD COLUMN "affiliateCustomCommissionAmountInCents" INTEGER,
ADD COLUMN "affiliateCustomCommissionPercent" DOUBLE PRECISION;

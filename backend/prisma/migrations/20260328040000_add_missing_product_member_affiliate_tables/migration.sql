-- CreateTable: FollowUp
CREATE TABLE IF NOT EXISTS "FollowUp" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "reason" TEXT,
    "flowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductPlan
CREATE TABLE IF NOT EXISTS "ProductPlan" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "billingType" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "itemsPerPlan" INTEGER NOT NULL DEFAULT 1,
    "maxInstallments" INTEGER,
    "maxNoInterest" INTEGER,
    "discountByPayment" BOOLEAN NOT NULL DEFAULT false,
    "recurringInterval" TEXT,
    "trialEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER,
    "trialPrice" DOUBLE PRECISION,
    "visibleToAffiliates" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "packagingConfig" JSONB,
    "shippingConfig" JSONB,
    "deliveryFiles" JSONB,
    "orderBumpPlanId" TEXT,
    "orderBumpText" TEXT,
    "termsUrl" TEXT,
    "checkoutImages" JSONB,
    "thankyouUrl" TEXT,
    "thankyouBoletoUrl" TEXT,
    "thankyouPixUrl" TEXT,
    "aiConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductCheckout
CREATE TABLE IF NOT EXISTS "ProductCheckout" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "uniqueVisits" INTEGER NOT NULL DEFAULT 0,
    "totalVisits" INTEGER NOT NULL DEFAULT 0,
    "abandonRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cancelRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conversionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductCoupon
CREATE TABLE IF NOT EXISTS "ProductCoupon" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductReview
CREATE TABLE IF NOT EXISTS "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "authorName" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductCommission
CREATE TABLE IF NOT EXISTS "ProductCommission" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "agentName" TEXT,
    "agentEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductUrl
CREATE TABLE IF NOT EXISTS "ProductUrl" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "aiLearning" BOOLEAN NOT NULL DEFAULT false,
    "aiTopics" JSONB,
    "aiLearnFreq" TEXT,
    "aiLearnStatus" TEXT,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chatConfig" JSONB,
    "salesFromUrl" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductAIConfig
CREATE TABLE IF NOT EXISTS "ProductAIConfig" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerProfile" JSONB,
    "positioning" JSONB,
    "objections" JSONB,
    "salesArguments" JSONB,
    "upsellConfig" JSONB,
    "downsellConfig" JSONB,
    "tone" TEXT DEFAULT 'CONSULTIVE',
    "persistenceLevel" INTEGER DEFAULT 3,
    "messageLimit" INTEGER DEFAULT 10,
    "followUpConfig" JSONB,
    "technicalInfo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAIConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MemberArea
CREATE TABLE IF NOT EXISTS "MemberArea" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'COURSE',
    "template" TEXT NOT NULL DEFAULT 'academy',
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#E85D30',
    "customDomain" TEXT,
    "certificates" BOOLEAN NOT NULL DEFAULT true,
    "quizzes" BOOLEAN NOT NULL DEFAULT true,
    "community" BOOLEAN NOT NULL DEFAULT true,
    "gamification" BOOLEAN NOT NULL DEFAULT true,
    "progressTrack" BOOLEAN NOT NULL DEFAULT true,
    "downloads" BOOLEAN NOT NULL DEFAULT true,
    "comments" BOOLEAN NOT NULL DEFAULT true,
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "totalModules" INTEGER NOT NULL DEFAULT 0,
    "totalLessons" INTEGER NOT NULL DEFAULT 0,
    "avgCompletion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MemberModule
CREATE TABLE IF NOT EXISTS "MemberModule" (
    "id" TEXT NOT NULL,
    "memberAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "releaseType" TEXT NOT NULL DEFAULT 'IMMEDIATE',
    "releaseDate" TIMESTAMP(3),
    "releaseDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MemberLesson
CREATE TABLE IF NOT EXISTS "MemberLesson" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'VIDEO',
    "position" INTEGER NOT NULL DEFAULT 0,
    "videoUrl" TEXT,
    "textContent" TEXT,
    "downloadUrl" TEXT,
    "quizData" JSONB,
    "durationMin" INTEGER,
    "transcription" TEXT,
    "aiSummary" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AffiliateProduct
CREATE TABLE IF NOT EXISTS "AffiliateProduct" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "commissionType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
    "commissionFixed" DOUBLE PRECISION,
    "cookieDays" INTEGER NOT NULL DEFAULT 30,
    "approvalMode" TEXT NOT NULL DEFAULT 'AUTO',
    "totalAffiliates" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temperature" INTEGER NOT NULL DEFAULT 50,
    "thumbnailUrl" TEXT,
    "promoMaterials" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AffiliateRequest
CREATE TABLE IF NOT EXISTS "AffiliateRequest" (
    "id" TEXT NOT NULL,
    "affiliateProductId" TEXT NOT NULL,
    "affiliateWorkspaceId" TEXT NOT NULL,
    "affiliateName" TEXT,
    "affiliateEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AffiliateLink
CREATE TABLE IF NOT EXISTS "AffiliateLink" (
    "id" TEXT NOT NULL,
    "affiliateProductId" TEXT NOT NULL,
    "affiliateWorkspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateLink_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- UNIQUE CONSTRAINTS (idempotent)
-- ============================================

-- ProductCheckout.code unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCheckout_code_key'
  ) THEN
    ALTER TABLE "ProductCheckout" ADD CONSTRAINT "ProductCheckout_code_key" UNIQUE ("code");
  END IF;
END $$;

-- ProductCoupon (productId, code) unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCoupon_productId_code_key'
  ) THEN
    ALTER TABLE "ProductCoupon" ADD CONSTRAINT "ProductCoupon_productId_code_key" UNIQUE ("productId", "code");
  END IF;
END $$;

-- ProductAIConfig.productId unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductAIConfig_productId_key'
  ) THEN
    ALTER TABLE "ProductAIConfig" ADD CONSTRAINT "ProductAIConfig_productId_key" UNIQUE ("productId");
  END IF;
END $$;

-- MemberArea (workspaceId, slug) unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MemberArea_workspaceId_slug_key'
  ) THEN
    ALTER TABLE "MemberArea" ADD CONSTRAINT "MemberArea_workspaceId_slug_key" UNIQUE ("workspaceId", "slug");
  END IF;
END $$;

-- AffiliateProduct.productId unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateProduct_productId_key'
  ) THEN
    ALTER TABLE "AffiliateProduct" ADD CONSTRAINT "AffiliateProduct_productId_key" UNIQUE ("productId");
  END IF;
END $$;

-- AffiliateRequest (affiliateProductId, affiliateWorkspaceId) unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateRequest_affiliateProductId_affiliateWorkspaceId_key'
  ) THEN
    ALTER TABLE "AffiliateRequest" ADD CONSTRAINT "AffiliateRequest_affiliateProductId_affiliateWorkspaceId_key" UNIQUE ("affiliateProductId", "affiliateWorkspaceId");
  END IF;
END $$;

-- AffiliateLink.code unique
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateLink_code_key'
  ) THEN
    ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_code_key" UNIQUE ("code");
  END IF;
END $$;

-- ============================================
-- INDEXES (idempotent)
-- ============================================

CREATE INDEX IF NOT EXISTS "FollowUp_workspaceId_status_scheduledFor_idx" ON "FollowUp"("workspaceId", "status", "scheduledFor");
CREATE INDEX IF NOT EXISTS "FollowUp_workspaceId_contactId_idx" ON "FollowUp"("workspaceId", "contactId");

CREATE INDEX IF NOT EXISTS "ProductPlan_productId_active_idx" ON "ProductPlan"("productId", "active");

CREATE INDEX IF NOT EXISTS "ProductCheckout_productId_idx" ON "ProductCheckout"("productId");

CREATE INDEX IF NOT EXISTS "ProductReview_productId_idx" ON "ProductReview"("productId");

CREATE INDEX IF NOT EXISTS "ProductCommission_productId_idx" ON "ProductCommission"("productId");

CREATE INDEX IF NOT EXISTS "ProductUrl_productId_active_idx" ON "ProductUrl"("productId", "active");

CREATE INDEX IF NOT EXISTS "MemberArea_workspaceId_active_idx" ON "MemberArea"("workspaceId", "active");

CREATE INDEX IF NOT EXISTS "MemberModule_memberAreaId_position_idx" ON "MemberModule"("memberAreaId", "position");

CREATE INDEX IF NOT EXISTS "MemberLesson_moduleId_position_idx" ON "MemberLesson"("moduleId", "position");

CREATE INDEX IF NOT EXISTS "AffiliateProduct_listed_category_idx" ON "AffiliateProduct"("listed", "category");
CREATE INDEX IF NOT EXISTS "AffiliateProduct_temperature_idx" ON "AffiliateProduct"("temperature");

CREATE INDEX IF NOT EXISTS "AffiliateRequest_status_idx" ON "AffiliateRequest"("status");

CREATE INDEX IF NOT EXISTS "AffiliateLink_affiliateWorkspaceId_idx" ON "AffiliateLink"("affiliateWorkspaceId");
CREATE INDEX IF NOT EXISTS "AffiliateLink_code_idx" ON "AffiliateLink"("code");

-- ============================================
-- FOREIGN KEYS (idempotent)
-- ============================================

-- FollowUp -> Workspace (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_workspaceId_fkey'
  ) THEN
    ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- FollowUp -> Contact
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_contactId_fkey'
  ) THEN
    ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- FollowUp -> Flow (optional)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FollowUp_flowId_fkey'
  ) THEN
    ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_flowId_fkey"
      FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductPlan -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductPlan_productId_fkey'
  ) THEN
    ALTER TABLE "ProductPlan" ADD CONSTRAINT "ProductPlan_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductCheckout -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCheckout_productId_fkey'
  ) THEN
    ALTER TABLE "ProductCheckout" ADD CONSTRAINT "ProductCheckout_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductCoupon -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCoupon_productId_fkey'
  ) THEN
    ALTER TABLE "ProductCoupon" ADD CONSTRAINT "ProductCoupon_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductReview -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductReview_productId_fkey'
  ) THEN
    ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductCommission -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductCommission_productId_fkey'
  ) THEN
    ALTER TABLE "ProductCommission" ADD CONSTRAINT "ProductCommission_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductUrl -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductUrl_productId_fkey'
  ) THEN
    ALTER TABLE "ProductUrl" ADD CONSTRAINT "ProductUrl_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ProductAIConfig -> Product (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductAIConfig_productId_fkey'
  ) THEN
    ALTER TABLE "ProductAIConfig" ADD CONSTRAINT "ProductAIConfig_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- MemberModule -> MemberArea (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MemberModule_memberAreaId_fkey'
  ) THEN
    ALTER TABLE "MemberModule" ADD CONSTRAINT "MemberModule_memberAreaId_fkey"
      FOREIGN KEY ("memberAreaId") REFERENCES "MemberArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- MemberLesson -> MemberModule (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MemberLesson_moduleId_fkey'
  ) THEN
    ALTER TABLE "MemberLesson" ADD CONSTRAINT "MemberLesson_moduleId_fkey"
      FOREIGN KEY ("moduleId") REFERENCES "MemberModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AffiliateRequest -> AffiliateProduct (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateRequest_affiliateProductId_fkey'
  ) THEN
    ALTER TABLE "AffiliateRequest" ADD CONSTRAINT "AffiliateRequest_affiliateProductId_fkey"
      FOREIGN KEY ("affiliateProductId") REFERENCES "AffiliateProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AffiliateLink -> AffiliateProduct (onDelete: Cascade)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateLink_affiliateProductId_fkey'
  ) THEN
    ALTER TABLE "AffiliateLink" ADD CONSTRAINT "AffiliateLink_affiliateProductId_fkey"
      FOREIGN KEY ("affiliateProductId") REFERENCES "AffiliateProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

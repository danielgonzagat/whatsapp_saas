import { z } from 'zod';

// ════════════════════════════════════════════
// PRODUCT CREATION SCHEMA (7-Step Form)
// ════════════════════════════════════════════

export const productDetailsSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(5000, 'Máximo 5000 caracteres').optional(),
  category: z.string().min(1, 'Categoria é obrigatória'),
  tags: z.array(z.string()).max(5, 'Máximo 5 tags'),
  format: z.enum(['PHYSICAL', 'DIGITAL', 'HYBRID']),
  imageUrl: z.string().url().optional().or(z.literal('')),
  productType: z.string().optional(),
});

export const salesConfigSchema = z.object({
  price: z.number().positive('Preço deve ser positivo').min(0.01),
  currency: z.string().default('BRL'),
  paymentType: z.enum(['ONE_TIME', 'SUBSCRIPTION', 'INSTALLMENT']),
  affiliateCommission: z.number().min(0).max(100).optional(),
  salesPageUrl: z.string().url().optional().or(z.literal('')),
  guaranteeDays: z.number().min(0).max(365).optional(),
  checkoutType: z.enum(['STANDARD', 'CONVERSATIONAL']).default('STANDARD'),
  facebookPixelId: z.string().optional(),
  googleTagManagerId: z.string().optional(),
});

export const packagingSchema = z.object({
  packageType: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  depth: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

export const deliverySchema = z.object({
  shipper: z.enum(['PRODUCER', 'SUPPLIER', 'FULFILLMENT', 'DROPSHIPPING']).optional(),
  dispatchTime: z.string().optional(),
  carriers: z.array(z.string()).optional(),
});

export const affiliationSchema = z.object({
  enabled: z.boolean().default(false),
  commissionPercent: z.number().min(0).max(100).optional(),
  approvalMode: z.enum(['AUTO', 'MANUAL']).default('AUTO'),
});

export const paymentSchema = z.object({
  billingType: z.enum(['ONE_TIME', 'RECURRING', 'FREE']),
  maxInstallments: z.number().min(1).max(12).default(1),
  interestFreeInstallments: z.number().min(0).max(12).default(0),
});

export const productCreateSchema = z.object({
  details: productDetailsSchema,
  salesConfig: salesConfigSchema,
  packaging: packagingSchema.optional(),
  delivery: deliverySchema.optional(),
  affiliation: affiliationSchema,
  payment: paymentSchema,
});

export type ProductCreateData = z.infer<typeof productCreateSchema>;

// ════════════════════════════════════════════
// AI CONFIG SCHEMA (7 Sections)
// ════════════════════════════════════════════

export const aiCustomerProfileSchema = z.object({
  gender: z.enum(['MALE', 'FEMALE', 'ALL']).default('ALL'),
  ageRanges: z.array(z.string()),
  lifeMoments: z.array(z.string()),
  knowledgeLevel: z.string().optional(),
  purchasingPower: z.string().optional(),
  mainProblem: z.string().optional(),
});

export const aiPositioningSchema = z.object({
  planType: z.string().optional(),
  whenToOffer: z.array(z.string()),
  comparisonPlanId: z.string().optional(),
  differentiators: z.array(z.string()),
  scarcityType: z.string().optional(),
});

export const aiObjectionSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  response: z.string().optional(),
});

export const aiSalesArgumentSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
  value: z.number().optional(),
});

export const aiUpsellSchema = z.object({
  enabled: z.boolean().default(false),
  targetPlanId: z.string().optional(),
  triggers: z.array(z.string()),
  argument: z.string().optional(),
});

export const aiBehaviorSchema = z.object({
  tone: z.string().default('CONSULTIVE'),
  persistenceLevel: z.number().min(1).max(5).default(3),
  messageLimit: z.number().min(0).max(100).default(0), // 0 = unlimited
  followUpInterval: z.string().optional(),
  followUpMaxAttempts: z.number().min(1).max(5).default(3),
});

export const aiTechnicalSchema = z.object({
  usageDosage: z.string().optional(),
  duration: z.string().optional(),
  contraindications: z.array(z.string()),
  resultsTimeline: z.string().optional(),
});

export const aiConfigSchema = z.object({
  customerProfile: aiCustomerProfileSchema,
  positioning: aiPositioningSchema,
  objections: z.array(aiObjectionSchema),
  salesArguments: z.array(aiSalesArgumentSchema),
  upsellConfig: aiUpsellSchema,
  downsellConfig: aiUpsellSchema,
  behavior: aiBehaviorSchema,
  technical: aiTechnicalSchema,
});

export type AIConfigData = z.infer<typeof aiConfigSchema>;

// ════════════════════════════════════════════
// URL MANAGEMENT SCHEMA
// ════════════════════════════════════════════

export const productUrlSchema = z.object({
  description: z.string().min(1, 'Descrição é obrigatória').max(255),
  url: z.string().url('URL inválida').max(255),
  isPrivate: z.boolean().default(false),
  aiLearningEnabled: z.boolean().default(false),
  aiLearningTopics: z.array(z.string()).optional(),
  aiLearningFrequency: z.enum(['MANUAL', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),
  chatEnabled: z.boolean().default(false),
  chatPosition: z.enum(['bottom-right', 'bottom-left']).optional(),
  chatColor: z.string().optional(),
  chatInitialMessage: z.string().optional(),
  chatTrigger: z.enum(['IMMEDIATE', '3S', '5S', '10S', '30S', 'EXIT_INTENT']).optional(),
  chatCheckoutRedirect: z.string().url().optional().or(z.literal('')),
});

export type ProductUrlData = z.infer<typeof productUrlSchema>;

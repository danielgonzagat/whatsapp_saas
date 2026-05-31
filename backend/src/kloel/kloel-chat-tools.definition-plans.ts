import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Wave7 L2 — fine-grained plan capability tool definitions (Y-1/Y-2).
 *
 * Each tool here mirrors a capability registered in the CapabilityRegistryV2
 * `TIER_2_PLANS_CAPABILITIES` partition. The `function.name` MUST equal the
 * capability `id` so `KloelDomainServiceResolver.tryExecute` can look the
 * capability up by tool name, parse its `domainService` (`PlanService.*FromArgs`)
 * and invoke the resolver-compatible `(workspaceId, args)` adapter.
 *
 * All are `MUTATION_SENSITIVE` + `requiresConfirmation: true` in the registry,
 * so the dispatcher / mind-guard enforces a confirmation gate before execution.
 * Wiring is additive — no new dispatcher branch, no Prisma-direct access.
 *
 * NOTE: this array is exported for the shared aggregator
 * (`kloel-chat-tools.definition.ts`) to spread into the LLM tool list. This
 * file does NOT mutate that aggregator itself.
 */
export const KLOEL_CHAT_TOOLS_PLANS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'plans.set_payment_methods',
      description: 'Define quais métodos de pagamento um plano aceita (cartão, PIX, boleto)',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          card: { type: 'boolean', description: 'Aceitar cartão de crédito' },
          pix: { type: 'boolean', description: 'Aceitar PIX' },
          boleto: { type: 'boolean', description: 'Aceitar boleto' },
        },
        required: ['planId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_installments',
      description: 'Define o número máximo de parcelas de um plano',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          maxInstallments: { type: 'number', description: 'Número máximo de parcelas (>= 1)' },
        },
        required: ['planId', 'maxInstallments'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_coupons',
      description: 'Habilita ou desabilita o uso de cupons de desconto em um plano',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          acceptCoupons: { type: 'boolean', description: 'Aceitar cupons de desconto' },
        },
        required: ['planId', 'acceptCoupons'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_shipping_mode',
      description:
        'Define o modo de frete de um plano: fixo, variável ou grátis (com CEP de origem e valor)',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          type: {
            type: 'string',
            enum: ['FIXED', 'VARIABLE', 'FREE', 'NONE'],
            description: 'Tipo de frete: FIXED (fixo), VARIABLE (variável), FREE (grátis), NONE',
          },
          fixedValue: { type: 'number', description: 'Valor fixo do frete em reais (modo FIXED)' },
          originCep: { type: 'string', description: 'CEP de origem (modo VARIABLE)' },
        },
        required: ['planId', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_visibility_for_affiliates',
      description: 'Define se um plano fica visível para afiliados promoverem',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          visibleToAffiliates: { type: 'boolean', description: 'Visível para afiliados' },
        },
        required: ['planId', 'visibleToAffiliates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_custom_commission',
      description: 'Define a comissão personalizada de afiliados para um plano (em %)',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          customCommission: { type: 'number', description: 'Comissão personalizada em % (>= 0)' },
        },
        required: ['planId', 'customCommission'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.set_order_bump',
      description: 'Configura o order bump (oferta adicional no checkout) de um plano',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          enabled: { type: 'boolean', description: 'Ativar order bump' },
          bumpProductId: { type: 'string', description: 'ID do produto ofertado no bump' },
          bumpPlanId: { type: 'string', description: 'ID do plano ofertado no bump' },
          title: { type: 'string', description: 'Título da oferta do order bump' },
          discountPercent: { type: 'number', description: 'Desconto da oferta em %' },
        },
        required: ['planId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plans.upload_image',
      description: 'Define a imagem (URL) exibida para um plano no checkout',
      parameters: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'ID do plano' },
          imageUrl: { type: 'string', description: 'URL da imagem do plano' },
        },
        required: ['planId', 'imageUrl'],
      },
    },
  },
];

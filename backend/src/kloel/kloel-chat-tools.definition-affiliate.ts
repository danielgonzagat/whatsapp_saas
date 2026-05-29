import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Wave7 L4 — fine-grained affiliate + marketplace chat tool definitions.
 *
 * These OpenAI function definitions mirror the canonical capabilities declared
 * in capability-registry-v2 partition `tier-7-affiliates`. Each tool resolves
 * to a real AffiliateService / MarketplaceService method via
 * KloelDomainServiceResolver — never Prisma-direct.
 *
 * NOTE: this array is intentionally NOT spread into the shared KLOEL_CHAT_TOOLS
 * aggregator here. The aggregator owner wires it by name (see RETURN list).
 */
export const KLOEL_CHAT_TOOLS_AFFILIATE: ChatCompletionTool[] = [
  // ── Affiliate program controls ──
  {
    type: 'function',
    function: {
      name: 'affiliates.toggle_program',
      description: 'Liga ou desliga o programa de afiliados de um produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          enabled: { type: 'boolean', description: 'true para ativar, false para desativar' },
        },
        required: ['productId', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_visibility',
      description: 'Define se o produto aparece na vitrine pública de afiliados',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          visible: { type: 'boolean', description: 'true para visível na vitrine' },
        },
        required: ['productId', 'visible'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_auto_approval',
      description: 'Liga ou desliga a aprovação automática de novos afiliados',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          autoApprove: { type: 'boolean', description: 'true para aprovar automaticamente' },
        },
        required: ['productId', 'autoApprove'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_data_access',
      description: 'Define se o afiliado pode acessar os dados dos compradores',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          accessData: { type: 'boolean', description: 'true para liberar acesso aos dados' },
        },
        required: ['productId', 'accessData'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_abandonment_access',
      description: 'Define se o afiliado pode acessar carrinhos abandonados',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          accessAbandoned: {
            type: 'boolean',
            description: 'true para liberar acesso a abandonos',
          },
        },
        required: ['productId', 'accessAbandoned'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_first_installment_commission',
      description: 'Define se a comissão do afiliado incide sobre a primeira parcela',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          firstInstallment: {
            type: 'boolean',
            description: 'true para comissionar a 1ª parcela',
          },
        },
        required: ['productId', 'firstInstallment'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_attribution_model',
      description:
        'Define o modelo de atribuição da comissão: primeiro clique, último clique ou proporcional',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          model: {
            type: 'string',
            description: 'Modelo de atribuição',
            enum: ['primeiro clique', 'último clique', 'proporcional'],
          },
        },
        required: ['productId', 'model'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_cookie_days',
      description: 'Define por quantos dias o cookie de atribuição do afiliado vale',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          cookieDays: { type: 'number', description: 'Dias de validade do cookie (0 a 3650)' },
        },
        required: ['productId', 'cookieDays'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.set_commission_pct',
      description: 'Define o percentual de comissão pago aos afiliados',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          commissionPercent: { type: 'number', description: 'Percentual (0 a 100)' },
        },
        required: ['productId', 'commissionPercent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.list',
      description: 'Lista os afiliados do workspace, opcionalmente filtrados por produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto (filtro opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.list_merchants',
      description: 'Lista os produtores cujos produtos este workspace promove como afiliado',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.update_terms',
      description: 'Atualiza os termos/regulamento do programa de afiliados do produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          terms: { type: 'string', description: 'Texto do regulamento' },
        },
        required: ['productId', 'terms'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'affiliates.manage_coproduction',
      description: 'Adiciona ou remove um coprodutor (divisão de comissão) do produto',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          action: {
            type: 'string',
            description: 'add para adicionar/atualizar, remove para remover',
            enum: ['add', 'remove'],
          },
          agentEmail: { type: 'string', description: 'Email do coprodutor' },
          agentName: { type: 'string', description: 'Nome do coprodutor' },
          percentage: { type: 'number', description: 'Percentual de comissão (0 a 100)' },
        },
        required: ['productId', 'agentEmail'],
      },
    },
  },

  // ── Affiliate marketplace (consumer side) ──
  {
    type: 'function',
    function: {
      name: 'marketplace.list_public_products',
      description: 'Lista produtos disponíveis no marketplace de afiliados',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Categoria (filtro opcional)' },
          search: { type: 'string', description: 'Termo de busca (filtro opcional)' },
          limit: { type: 'number', description: 'Quantidade máxima retornada' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marketplace.apply_as_affiliate',
      description: 'Solicita afiliação a um produto do marketplace de afiliados',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto do marketplace' },
          affiliateName: { type: 'string', description: 'Nome do afiliado' },
          affiliateEmail: { type: 'string', description: 'Email do afiliado' },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'marketplace.get_affiliate_link',
      description: 'Retorna o link de afiliado deste workspace para um produto do marketplace',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto do marketplace' },
        },
        required: ['productId'],
      },
    },
  },
];

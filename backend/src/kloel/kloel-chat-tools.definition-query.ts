import { ChatCompletionTool } from 'openai/resources/chat';

/**
 * Canonical read-only QUERY capability tool definitions (L14 — "verbalização do
 * código"). These capabilities already exist in the CapabilityRegistryV2 and are
 * executable through the canonical dispatch path
 * (`KloelToolDispatcherService.runDirectDispatch` →
 * `KloelDomainServiceResolver.tryExecute`), but had no `ChatCompletionTool`
 * schema, so the chat LLM could never emit a tool_call for them.
 *
 * Every tool here maps to a registry capability whose `domainService` resolves
 * to a service registered in `KloelDomainServiceResolver.SERVICE_TOKEN_MAP` and
 * whose method has the resolver-compatible `(workspaceId, args?)` signature.
 * All are `category: 'QUERY'` and `requiresConfirmation: false` — read-only, no
 * destructive op exposed to the LLM. Wiring is additive: no new dispatcher.
 *
 * SSE tool_call / tool_result events are emitted generically by
 * `KloelToolRouter.executeAssistantToolCalls` for any allowed tool, so the
 * frontend renders these the same as the pre-existing tools.
 */
export const KLOEL_CHAT_TOOLS_QUERY: ChatCompletionTool[] = [
  // === CARTEIRA (read-only) ===
  {
    type: 'function',
    function: {
      name: 'get_wallet_balance',
      description:
        'Retorna o saldo atual da carteira do workspace (disponível, pendente e bloqueado)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wallet_statement',
      description: 'Lista o extrato de transações da carteira (entradas, saídas, saques)',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Página do extrato (paginação)' },
          limit: { type: 'number', description: 'Quantidade máxima de transações' },
          type: { type: 'string', description: 'Filtra por tipo de transação' },
        },
      },
    },
  },
  // === ANALYTICS / CONFIG (read-only) ===
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description:
        'Retorna métricas analíticas agregadas do workspace (visitas, conversões, receita)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_settings',
      description: 'Mostra as configurações atuais do workspace',
      parameters: { type: 'object', properties: {} },
    },
  },
  // === PEDIDOS / CHECKOUTS (read-only) ===
  {
    type: 'function',
    function: {
      name: 'list_orders',
      description: 'Lista os pedidos do workspace',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de pedidos retornados' },
          status: { type: 'string', description: 'Filtra por status do pedido' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_details',
      description: 'Retorna os detalhes de um pedido específico',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'ID do pedido' },
        },
        required: ['orderId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_checkouts',
      description: 'Lista os checkouts configurados no workspace',
      parameters: { type: 'object', properties: {} },
    },
  },
  // === PRODUTO (read-only detalhe) ===
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Retorna os detalhes completos de um produto específico',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
        },
        required: ['productId'],
      },
    },
  },
  // === VENDAS / ASSINATURAS / ABANDONOS / CUPOM (read-only) ===
  {
    type: 'function',
    function: {
      name: 'get_sales_summary',
      description:
        'Retorna o resumo de vendas do workspace (total, receita, ticket médio, pagas e pendentes)',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Janela em dias para o resumo (padrão 7)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_subscriptions',
      description: 'Lista as assinaturas ativas do workspace',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_abandonments',
      description: 'Lista os carrinhos/checkouts abandonados recentes do workspace',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'number', description: 'Janela em dias para os abandonos (padrão 7)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_coupon',
      description: 'Verifica se um cupom é válido para um produto específico do workspace',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          code: { type: 'string', description: 'Código do cupom' },
        },
        required: ['productId', 'code'],
      },
    },
  },
];

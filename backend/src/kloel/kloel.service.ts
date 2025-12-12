import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat';
import {
  KLOEL_SYSTEM_PROMPT,
  KLOEL_ONBOARDING_PROMPT,
  KLOEL_SALES_PROMPT,
} from './kloel.prompts';
import { Response } from 'express';
import { SmartPaymentService } from './smart-payment.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { UnifiedAgentService } from './unified-agent.service';
import { AudioService } from './audio.service';
import {
  chatCompletionWithFallback,
  callOpenAIWithRetry,
} from './openai-wrapper';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ThinkRequest {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  companyContext?: string;
}

// Ferramentas disponíveis no chat principal da KLOEL
const KLOEL_CHAT_TOOLS: ChatCompletionTool[] = [
  // === PRODUTOS ===
  {
    type: 'function',
    function: {
      name: 'save_product',
      description: 'Cadastra um novo produto no catálogo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do produto' },
          price: { type: 'number', description: 'Preço em reais' },
          description: { type: 'string', description: 'Descrição do produto' },
        },
        required: ['name', 'price'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_products',
      description: 'Lista todos os produtos cadastrados',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_product',
      description: 'Remove um produto do catálogo',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID do produto' },
          productName: {
            type: 'string',
            description: 'Nome do produto (alternativa ao ID)',
          },
        },
      },
    },
  },
  // === AUTOMAÇÃO ===
  {
    type: 'function',
    function: {
      name: 'toggle_autopilot',
      description: 'Liga ou desliga o Autopilot (IA de vendas automáticas)',
      parameters: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'true para ligar, false para desligar',
          },
        },
        required: ['enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_brand_voice',
      description: 'Define o tom de voz e personalidade da IA',
      parameters: {
        type: 'object',
        properties: {
          tone: {
            type: 'string',
            description: 'Tom de voz (ex: formal, casual, amigável)',
          },
          personality: {
            type: 'string',
            description: 'Descrição da personalidade',
          },
        },
        required: ['tone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_flow',
      description: 'Cria um fluxo de automação simples',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do fluxo' },
          trigger: {
            type: 'string',
            description: 'Gatilho (ex: nova_mensagem, nova_venda)',
          },
          actions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista de ações do fluxo',
          },
        },
        required: ['name', 'trigger'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_flows',
      description: 'Lista todos os fluxos de automação',
      parameters: { type: 'object', properties: {} },
    },
  },
  // === MÉTRICAS ===
  {
    type: 'function',
    function: {
      name: 'get_dashboard_summary',
      description: 'Retorna resumo de métricas do dashboard',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['today', 'week', 'month'],
            description: 'Período',
          },
        },
      },
    },
  },
  // === PAGAMENTOS ===
  {
    type: 'function',
    function: {
      name: 'create_payment_link',
      description: 'Cria um link de pagamento PIX',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Valor em reais' },
          description: {
            type: 'string',
            description: 'Descrição do pagamento',
          },
          customerName: { type: 'string', description: 'Nome do cliente' },
        },
        required: ['amount', 'description'],
      },
    },
  },
  // === WHATSAPP ===
  {
    type: 'function',
    function: {
      name: 'connect_whatsapp',
      description: 'Inicia o processo de conexão do WhatsApp via QR Code',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_whatsapp_status',
      description: 'Verifica o status da conexão do WhatsApp',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_message',
      description: 'Envia uma mensagem via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description: 'Número do telefone (apenas números)',
          },
          message: { type: 'string', description: 'Mensagem a enviar' },
        },
        required: ['phone', 'message'],
      },
    },
  },
  // === LEADS/CRM ===
  {
    type: 'function',
    function: {
      name: 'list_leads',
      description: 'Lista os leads/contatos recentes',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Quantidade máxima de leads' },
          status: {
            type: 'string',
            description:
              'Filtrar por status (new, contacted, qualified, converted)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lead_details',
      description: 'Retorna detalhes de um lead específico',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Telefone do lead' },
          leadId: {
            type: 'string',
            description: 'ID do lead (alternativa ao phone)',
          },
        },
      },
    },
  },
  // === CONFIGURAÇÕES ===
  {
    type: 'function',
    function: {
      name: 'save_business_info',
      description: 'Salva informações do negócio',
      parameters: {
        type: 'object',
        properties: {
          businessName: { type: 'string', description: 'Nome do negócio' },
          description: { type: 'string', description: 'Descrição do negócio' },
          segment: {
            type: 'string',
            description: 'Segmento (ecommerce, serviços, etc)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_business_hours',
      description: 'Define o horário de funcionamento',
      parameters: {
        type: 'object',
        properties: {
          weekdayStart: {
            type: 'string',
            description: 'Horário início dias úteis (ex: 09:00)',
          },
          weekdayEnd: {
            type: 'string',
            description: 'Horário fim dias úteis (ex: 18:00)',
          },
          saturdayStart: {
            type: 'string',
            description: 'Horário início sábado',
          },
          saturdayEnd: { type: 'string', description: 'Horário fim sábado' },
          workOnSunday: {
            type: 'boolean',
            description: 'Funciona aos domingos?',
          },
        },
      },
    },
  },
  // === CAMPANHAS ===
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Cria uma campanha de mensagens em massa',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da campanha' },
          message: { type: 'string', description: 'Mensagem da campanha' },
          targetAudience: {
            type: 'string',
            description: 'Público-alvo (ex: todos, leads_quentes)',
          },
        },
        required: ['name', 'message'],
      },
    },
  },
  // === MÍDIA ===
  {
    type: 'function',
    function: {
      name: 'send_audio',
      description:
        'Gera um áudio com a resposta e envia para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Texto a ser convertido em áudio',
          },
          phone: {
            type: 'string',
            description: 'Número do telefone do contato',
          },
          voice: {
            type: 'string',
            enum: ['nova', 'alloy', 'echo', 'fable', 'onyx', 'shimmer'],
            description: 'Voz a usar',
          },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_document',
      description:
        'Envia um documento (PDF, catálogo, contrato) para o contato via WhatsApp',
      parameters: {
        type: 'object',
        properties: {
          documentName: {
            type: 'string',
            description:
              'Nome do documento cadastrado (ex: "catálogo", "contrato")',
          },
          url: {
            type: 'string',
            description: 'URL direta do documento (alternativa ao nome)',
          },
          phone: {
            type: 'string',
            description: 'Número do telefone do contato',
          },
          caption: { type: 'string', description: 'Legenda opcional' },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_voice_note',
      description: 'Gera e envia uma nota de voz personalizada para o contato',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Texto para converter em voz' },
          phone: { type: 'string', description: 'Número do telefone' },
        },
        required: ['text', 'phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transcribe_audio',
      description:
        'Transcreve um áudio recebido (de URL ou base64) para texto usando Whisper',
      parameters: {
        type: 'object',
        properties: {
          audioUrl: {
            type: 'string',
            description: 'URL do áudio para transcrever',
          },
          audioBase64: {
            type: 'string',
            description: 'Áudio em base64 (alternativa à URL)',
          },
          language: {
            type: 'string',
            description: 'Idioma do áudio (pt, en, es)',
            default: 'pt',
          },
        },
      },
    },
  },
  // ============ BILLING TOOLS ============
  {
    type: 'function',
    function: {
      name: 'update_billing_info',
      description:
        'Atualiza as informações de cobrança do cliente. Gera um link seguro do Stripe para adicionar/atualizar cartão de crédito.',
      parameters: {
        type: 'object',
        properties: {
          returnUrl: {
            type: 'string',
            description: 'URL para redirecionar após atualizar (opcional)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_billing_status',
      description:
        'Retorna o status atual de cobrança: plano ativo, data de renovação, uso, limites e se está suspenso.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'change_plan',
      description:
        'Altera o plano do cliente (upgrade/downgrade). Planos disponíveis: starter, pro, enterprise.',
      parameters: {
        type: 'object',
        properties: {
          newPlan: {
            type: 'string',
            description: 'Novo plano desejado',
            enum: ['starter', 'pro', 'enterprise'],
          },
          immediate: {
            type: 'boolean',
            description:
              'Se true, aplica imediatamente. Se false, aplica na próxima renovação.',
          },
        },
        required: ['newPlan'],
      },
    },
  },
];

@Injectable()
export class KloelService {
  private readonly logger = new Logger(KloelService.name);
  private openai: OpenAI;
  private prismaAny: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    @Inject(forwardRef(() => WhatsAppConnectionService))
    private readonly whatsappConnectionService: WhatsAppConnectionService,
    private readonly unifiedAgentService: UnifiedAgentService,
    private readonly audioService: AudioService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    // Cast para any para acessar novos modelos enquanto tipos não são regenerados
    this.prismaAny = prisma as any;
  }

  /**
   * 🧠 KLOEL THINKER - Processa mensagens com streaming
   * Retorna resposta em tempo real via SSE
   */
  async think(
    request: ThinkRequest,
    res: Response,
    opts?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<void> {
    const { message, workspaceId, mode = 'chat', companyContext } = request;

    const signal = opts?.signal;
    const isAborted = () => !!signal?.aborted;
    const safeWrite = (data: any) => {
      if (isAborted()) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        // ignore
      }
    };

    // Configurar headers para SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      if (isAborted()) {
        try {
          res.end();
        } catch {
          // ignore
        }
        return;
      }

      // Buscar contexto da empresa se tiver workspaceId
      let context = companyContext || '';
      let companyName = 'sua empresa';

      if (workspaceId) {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (workspace) {
          companyName = workspace.name;
          // Buscar memória/contexto salvo
          context = await this.getWorkspaceContext(workspaceId);
        }
      }

      // Selecionar o system prompt baseado no modo
      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = KLOEL_SYSTEM_PROMPT;
      }

      // Buscar histórico da conversa (últimas 10 mensagens)
      const history = await this.getConversationHistory(workspaceId);

      // Montar mensagens para a API
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user', content: message },
      ];

      // No modo 'chat', habilitar tool-calling para executar ações
      const executedToolReceipts: Array<{
        callId: string;
        name: string;
        args: any;
        success: boolean;
        result: any;
        error?: string;
      }> = [];

      if (mode === 'chat' && workspaceId) {
        // Primeira chamada sempre com tools habilitadas (sem stream) para decidir tool-calls
        const initialResponse = await chatCompletionWithFallback(
          this.openai,
          {
            model: 'gpt-4o',
            messages,
            tools: KLOEL_CHAT_TOOLS,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 2000,
          },
          'gpt-4o-mini',
          { maxRetries: 3, initialDelayMs: 500 },
          signal ? { signal } : undefined,
        );

        const assistantMessage = initialResponse.choices[0]?.message;
        const assistantText = assistantMessage?.content || '';

        // Se houver tool_calls, executá-las e depois pedir ao modelo a resposta final usando os resultados
        if (
          assistantMessage?.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          const toolResults: Array<{
            callId: string;
            name: string;
            result: any;
          }> = [];

          for (const toolCall of assistantMessage.tool_calls) {
            const tc = toolCall as any;
            const toolName = tc.function?.name || '';
            let toolArgs = {};
            const callId =
              tc.id ||
              `${toolName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

            try {
              toolArgs = JSON.parse(tc.function?.arguments || '{}');
            } catch {
              this.logger.warn(`Failed to parse tool args for ${toolName}`);
            }

            // Notifica início da execução
            safeWrite({
              type: 'tool_call',
              callId,
              tool: toolName,
              args: toolArgs,
              done: false,
            });

            let result: any = null;

            // Prefer unified agent tools (cobre WhatsApp/conexões e automações globais)
            try {
              result = await this.unifiedAgentService.executeTool(
                toolName,
                toolArgs,
                {
                  workspaceId,
                  phone: (toolArgs as any)?.phone || '',
                  contactId: (toolArgs as any)?.contactId || '',
                },
              );
            } catch (agentErr: any) {
              this.logger.warn(
                `UnifiedAgent tool ${toolName} falhou: ${agentErr?.message}`,
              );
            }

            // Fallback para ferramentas locais do chat
            if (!result || result?.error === 'Unknown tool') {
              result = await this.executeTool(workspaceId, toolName, toolArgs);
            }

            const success =
              !!result &&
              (result.success === true ||
                result.ok === true ||
                result.status === 'success') &&
              !result.error;
            const error = !success
              ? result?.error || result?.message || 'tool_failed'
              : undefined;

            executedToolReceipts.push({
              callId,
              name: toolName,
              args: toolArgs,
              success,
              result,
              error,
            });

            toolResults.push({ callId, name: toolName, result });

            // Notifica resultado
            safeWrite({
              type: 'tool_result',
              callId,
              tool: toolName,
              success,
              result,
              error,
              done: false,
            });
          }

          // Montar uma segunda chamada ao modelo incluindo tool results para resposta final
          const toolMessages = toolResults.map((tr) => ({
            role: 'tool',
            tool_call_id: tr.callId,
            name: tr.name,
            content: JSON.stringify(tr.result ?? null),
          }));

          const finalCompletion = await chatCompletionWithFallback(
            this.openai,
            {
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                ...history.map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                })),
                { role: 'user', content: message },
                assistantMessage as any,
                ...(toolMessages as any),
              ] as any,
              tools: KLOEL_CHAT_TOOLS,
              tool_choice: 'auto',
              temperature: 0.7,
              max_tokens: 1000,
            },
            'gpt-4o-mini',
            { maxRetries: 2, initialDelayMs: 300 },
            signal ? { signal } : undefined,
          );

          const finalResponse =
            finalCompletion.choices[0]?.message?.content || '';

          // Stream manual da resposta final
          const chunkSize = 140;
          for (let i = 0; i < finalResponse.length; i += chunkSize) {
            const contentChunk = finalResponse.slice(i, i + chunkSize);
            safeWrite({ content: contentChunk, done: false });
          }

          // Persistir histórico
          await this.saveMessage(workspaceId, 'user', message);
          await this.saveMessage(workspaceId, 'assistant', finalResponse);

          safeWrite({ content: '', done: true });
          try {
            res.end();
          } catch {
            // ignore
          }
          return;
        }

        // Sem tool_calls: ainda assim responde a partir da completion com tools (stream manual)
        const chunkSize = 140;
        for (let i = 0; i < assistantText.length; i += chunkSize) {
          const contentChunk = assistantText.slice(i, i + chunkSize);
          safeWrite({ content: contentChunk, done: false });
        }

        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', assistantText);

        safeWrite({ content: '', done: true });
        try {
          res.end();
        } catch {
          // ignore
        }
        return;
      }

      // Chamar OpenAI com streaming para a resposta final
      const stream = await callOpenAIWithRetry<AsyncIterable<any>>(
        () =>
          this.openai.chat.completions.create(
            {
              model: 'gpt-4o',
              messages,
              stream: true,
              temperature: 0.7,
              max_tokens: 2000,
            },
            signal ? ({ signal } as any) : undefined,
          ) as any,
        { maxRetries: 2, initialDelayMs: 300 },
      );

      let fullResponse = '';

      // Processar stream e enviar para o cliente
      for await (const chunk of stream) {
        if (isAborted()) {
          try {
            res.end();
          } catch {
            // ignore
          }
          return;
        }
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          // Enviar chunk via SSE
          safeWrite({ content, done: false });
        }
      }

      // Salvar a mensagem e resposta no histórico
      if (workspaceId) {
        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', fullResponse);
      }

      // Sinalizar fim do stream
      safeWrite({ content: '', done: true });
      try {
        res.end();
      } catch {
        // ignore
      }
    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker:', error);
      if (!isAborted()) {
        safeWrite({ error: 'Erro ao processar mensagem', done: true });
      }
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  }

  /**
   * 🔧 Executa uma ferramenta do chat
   */
  private async executeTool(
    workspaceId: string,
    toolName: string,
    args: any,
  ): Promise<any> {
    this.logger.log(`🔧 Executando ferramenta: ${toolName}`, args);

    try {
      switch (toolName) {
        case 'save_product':
          return await this.toolSaveProduct(workspaceId, args);

        case 'list_products':
          return await this.toolListProducts(workspaceId);

        case 'delete_product':
          return await this.toolDeleteProduct(workspaceId, args);

        case 'toggle_autopilot':
          return await this.toolToggleAutopilot(workspaceId, args);

        case 'set_brand_voice':
          return await this.toolSetBrandVoice(workspaceId, args);

        case 'create_flow':
          return await this.toolCreateFlow(workspaceId, args);

        case 'list_flows':
          return await this.toolListFlows(workspaceId);

        case 'get_dashboard_summary':
          return await this.toolGetDashboardSummary(workspaceId, args);

        case 'create_payment_link':
          return await this.smartPaymentService.createSmartPayment({
            workspaceId,
            amount: args.amount,
            productName: args.description,
            customerName: args.customerName || 'Cliente',
            phone: '',
          });

        case 'connect_whatsapp':
          return await this.toolConnectWhatsapp(workspaceId);

        case 'get_whatsapp_status':
          return await this.toolGetWhatsAppStatus(workspaceId);

        case 'send_whatsapp_message':
          return await this.toolSendWhatsAppMessage(workspaceId, args);

        case 'list_leads':
          return await this.toolListLeads(workspaceId, args);

        case 'get_lead_details':
          return await this.toolGetLeadDetails(workspaceId, args);

        case 'save_business_info':
          return await this.toolSaveBusinessInfo(workspaceId, args);

        case 'set_business_hours':
          return await this.toolSetBusinessHours(workspaceId, args);

        case 'create_campaign':
          return await this.toolCreateCampaign(workspaceId, args);

        // === MÍDIA (AUDIO/DOCUMENTO/VOZ) ===
        case 'send_audio':
          return await this.toolSendAudio(workspaceId, args);

        case 'send_document':
          return await this.toolSendDocument(workspaceId, args);

        case 'send_voice_note':
          return await this.toolSendVoiceNote(workspaceId, args);

        case 'transcribe_audio':
          return await this.toolTranscribeAudio(args);

        // === BILLING ===
        case 'update_billing_info':
          return await this.toolUpdateBillingInfo(workspaceId, args);

        case 'get_billing_status':
          return await this.toolGetBillingStatus(workspaceId);

        case 'change_plan':
          return await this.toolChangePlan(workspaceId, args);

        default:
          return {
            success: false,
            error: `Ferramenta desconhecida: ${toolName}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`Erro ao executar ferramenta ${toolName}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📦 Cadastrar produto
   */
  private async toolSaveProduct(workspaceId: string, args: any): Promise<any> {
    const product = await this.prisma.product.create({
      data: {
        workspaceId,
        name: args.name,
        price: args.price,
        description: args.description || '',
        active: true,
      },
    });
    return {
      success: true,
      product,
      message: `Produto "${args.name}" cadastrado com sucesso!`,
    };
  }

  /**
   * 📋 Listar produtos
   */
  private async toolListProducts(workspaceId: string): Promise<any> {
    const products = await this.prisma.product.findMany({
      where: { workspaceId, active: true },
      orderBy: { name: 'asc' },
    });

    if (products.length === 0) {
      return { success: true, message: 'Nenhum produto cadastrado ainda.' };
    }

    const list = products.map((p) => `- ${p.name}: R$ ${p.price}`).join('\n');
    return {
      success: true,
      products,
      message: `Aqui estão seus produtos:\n\n${list}`,
    };
  }

  /**
   * 🗑️ Deletar produto
   */
  private async toolDeleteProduct(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { productId, productName } = args;

    const where: any = { workspaceId };
    if (productId) where.id = productId;
    else if (productName)
      where.name = { contains: productName, mode: 'insensitive' };

    const product = await this.prisma.product.findFirst({ where });

    if (!product) {
      return { success: false, error: 'Produto não encontrado.' };
    }

    await this.prisma.product.update({
      where: { id: product.id },
      data: { active: false }, // Soft delete
    });

    return {
      success: true,
      message: `Produto "${product.name}" removido com sucesso.`,
    };
  }

  /**
   * 🤖 Toggle Autopilot
   */
  private async toolToggleAutopilot(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    const currentSettings = (workspace?.providerSettings as any) || {};

    if (args.enabled && currentSettings.billingSuspended === true) {
      return {
        success: false,
        enabled: false,
        error: 'Autopilot suspenso: regularize cobrança para ativar.',
      };
    }

    const newSettings = {
      ...currentSettings,
      autopilot: {
        ...(currentSettings.autopilot || {}),
        enabled: args.enabled,
      },
      autopilotEnabled: args.enabled, // compat
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { providerSettings: newSettings },
    });

    return {
      success: true,
      enabled: args.enabled,
      message: args.enabled ? 'Autopilot ativado! 🤖' : 'Autopilot desativado.',
    };
  }

  /**
   * 🎭 Definir tom de voz
   */
  private async toolSetBrandVoice(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    await this.prismaAny.kloelMemory.create({
      data: {
        workspaceId,
        type: 'persona',
        content: `Tom: ${args.tone}. ${args.personality || ''}`,
        metadata: { tone: args.tone, personality: args.personality },
      },
    });
    return {
      success: true,
      message: `Tom de voz definido como "${args.tone}"`,
    };
  }

  /**
   * ⚡ Criar fluxo simples
   */
  private async toolCreateFlow(workspaceId: string, args: any): Promise<any> {
    // Criar um fluxo básico com nó de mensagem
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];

    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];

    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });

    return {
      success: true,
      flow,
      message: `Fluxo "${args.name}" criado com sucesso!`,
    };
  }

  /**
   * 📊 Resumo do dashboard
   */
  private async toolGetDashboardSummary(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const period = args.period || 'today';
    let dateFilter: Date;

    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
    }

    const [contacts, messages, flows] = await Promise.all([
      this.prisma.contact.count({
        where: { workspaceId, createdAt: { gte: dateFilter } },
      }),
      this.prisma.message.count({
        where: { workspaceId, createdAt: { gte: dateFilter } },
      }),
      this.prisma.flow.count({ where: { workspaceId, isActive: true } }),
    ]);

    return {
      success: true,
      period,
      stats: {
        newContacts: contacts,
        messages,
        activeFlows: flows,
      },
    };
  }

  /**
   * 📋 Lista fluxos de automação
   */
  private async toolListFlows(workspaceId: string): Promise<any> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      success: true,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        active: f.isActive,
        executions: f._count.executions,
      })),
      message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
    };
  }

  /**
   * 📱 Conectar WhatsApp (Gera QR Code)
   */
  private async toolConnectWhatsapp(workspaceId: string): Promise<any> {
    try {
      const result =
        await this.whatsappConnectionService.initiateConnection(workspaceId);

      if (
        result.status === 'already_connected' ||
        result.status === 'connected'
      ) {
        return {
          success: true,
          connected: true,
          message: result.message || '✅ WhatsApp já conectado.',
        };
      }

      if (result.qrCode) {
        return {
          success: true,
          qrCode: result.qrCode,
          message:
            result.message ||
            '📱 Escaneie o QR Code abaixo para conectar seu WhatsApp.',
        };
      }

      return {
        success: false,
        message:
          result.message ||
          'Não foi possível gerar o QR Code. Tente novamente em instantes.',
      };
    } catch (error: any) {
      this.logger.error('Erro ao conectar WhatsApp:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📱 Status do WhatsApp
   */
  private async toolGetWhatsAppStatus(workspaceId: string): Promise<any> {
    const connStatus =
      this.whatsappConnectionService.getConnectionStatus(workspaceId);
    const connected = connStatus?.status === 'connected';

    if (connected) {
      return {
        success: true,
        connected: true,
        phoneNumber: connStatus?.phoneNumber || null,
        status: connStatus?.status,
        message: `✅ WhatsApp conectado${connStatus?.phoneNumber ? ` (${connStatus.phoneNumber})` : ''}.`,
      };
    }

    return {
      success: true,
      connected: false,
      status: connStatus?.status || 'disconnected',
      qrCode: connStatus?.qrCode,
      message: '❌ WhatsApp não conectado. Gere o QR para conectar.',
    };
  }

  /**
   * 💬 Enviar mensagem WhatsApp
   */
  private async toolSendWhatsAppMessage(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { phone, message } = args;

    // Normalizar telefone
    const normalizedPhone = phone.replace(/\D/g, '');

    const status = await this.whatsappService.getConnectionStatus(workspaceId);
    if (status.status !== 'connected') {
      return {
        success: false,
        error:
          'WhatsApp não está conectado. Gere o QR e conecte antes de enviar.',
        qrCode:
          status.qrCode || (await this.whatsappService.getQrCode(workspaceId)),
      };
    }

    // Buscar ou criar contato
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: { contains: normalizedPhone } },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { workspaceId, phone: normalizedPhone, name: 'Via KLOEL' },
      });
    }

    // Criar mensagem no banco
    const msg = await this.prisma.message.create({
      data: {
        workspaceId,
        contactId: contact.id,
        direction: 'OUTBOUND',
        type: 'TEXT',
        content: message,
        status: 'PENDING',
      },
    });

    // Enviar via WhatsappService (que coloca na fila)
    try {
      await this.whatsappService.sendMessage(
        workspaceId,
        normalizedPhone,
        message,
      );

      await this.prisma.message.update({
        where: { id: msg.id },
        data: { status: 'SENT' },
      });

      return {
        success: true,
        messageId: msg.id,
        message: `📤 Mensagem enviada para ${normalizedPhone}.`,
      };
    } catch (error: any) {
      await this.prisma.message.update({
        where: { id: msg.id },
        data: { status: 'FAILED' },
      });

      return {
        success: false,
        error: `Falha ao enviar mensagem: ${error.message}`,
      };
    }
  }

  /**
   * 👥 Listar leads
   */
  private async toolListLeads(workspaceId: string, args: any): Promise<any> {
    const { limit = 10, status } = args;

    const where: any = { workspaceId };
    // Filtrar por score ao invés de status (Contact não tem campo status)
    if (status === 'qualified' || status === 'hot') {
      where.leadScore = { gte: 70 };
    } else if (status === 'cold') {
      where.leadScore = { lt: 30 };
    }

    const contacts = await this.prisma.contact.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        sentiment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      count: contacts.length,
      leads: contacts.map((c) => ({
        id: c.id,
        name: c.name || 'Sem nome',
        phone: c.phone,
        score: c.leadScore || 0,
        sentiment: c.sentiment,
        lastUpdate: c.updatedAt,
      })),
      message: `Encontrei ${contacts.length} lead(s).`,
    };
  }

  /**
   * 👤 Detalhes do lead
   */
  private async toolGetLeadDetails(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { phone, leadId } = args;

    let contact;
    if (leadId) {
      contact = await this.prisma.contact.findFirst({
        where: { id: leadId, workspaceId },
        include: {
          tags: true,
          conversations: {
            take: 1,
            orderBy: { updatedAt: 'desc' },
            include: { messages: { take: 5, orderBy: { createdAt: 'desc' } } },
          },
        },
      });
    } else if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      contact = await this.prisma.contact.findFirst({
        where: { phone: { contains: normalizedPhone }, workspaceId },
        include: {
          tags: true,
          conversations: {
            take: 1,
            orderBy: { updatedAt: 'desc' },
            include: { messages: { take: 5, orderBy: { createdAt: 'desc' } } },
          },
        },
      });
    }

    if (!contact) {
      return { success: false, error: 'Lead não encontrado.' };
    }

    return {
      success: true,
      lead: {
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        sentiment: contact.sentiment,
        score: contact.leadScore,
        tags: contact.tags.map((t) => t.name),
        recentMessages:
          contact.conversations[0]?.messages.map((m) => ({
            content: m.content?.substring(0, 100),
            direction: m.direction,
            date: m.createdAt,
          })) || [],
      },
    };
  }

  /**
   * 🏢 Salvar info do negócio
   */
  private async toolSaveBusinessInfo(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { businessName, description, segment } = args;

    const updateData: any = {};
    if (businessName) updateData.name = businessName;
    if (segment) updateData.segment = segment;

    if (description || segment) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
      });
      const currentSettings = (workspace?.providerSettings as any) || {};
      updateData.providerSettings = {
        ...currentSettings,
        businessDescription: description,
        businessSegment: segment,
      };
    }

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: updateData,
    });

    return {
      success: true,
      message: '✅ Informações do negócio salvas com sucesso!',
    };
  }

  /**
   * 🕐 Definir horário de funcionamento
   */
  private async toolSetBusinessHours(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    const currentSettings = (workspace?.providerSettings as any) || {};
    const businessHours = {
      weekday: {
        start: args.weekdayStart || '09:00',
        end: args.weekdayEnd || '18:00',
      },
      saturday: args.saturdayStart
        ? { start: args.saturdayStart, end: args.saturdayEnd }
        : null,
      sunday: args.workOnSunday ? { start: '09:00', end: '13:00' } : null,
    };

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        providerSettings: {
          ...currentSettings,
          businessHours,
        },
      },
    });

    return {
      success: true,
      businessHours,
      message: '🕐 Horário de funcionamento configurado!',
    };
  }

  /**
   * 📢 Criar campanha
   */
  private async toolCreateCampaign(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { name, message, targetAudience } = args;

    // Buscar contatos baseado no público-alvo
    const contactFilter: any = { workspaceId };
    if (targetAudience === 'leads_quentes') {
      contactFilter.leadScore = { gte: 70 };
    } else if (targetAudience === 'novos') {
      contactFilter.createdAt = {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      };
    }

    const contactCount = await this.prisma.contact.count({
      where: contactFilter,
    });

    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name,
        messageTemplate: message,
        status: 'DRAFT',
        scheduledAt: null,
        filters: {
          targetAudience: targetAudience || 'all',
          createdByKloel: true,
          estimatedRecipients: contactCount,
        },
      },
    });

    return {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        estimatedRecipients: contactCount,
      },
      message: `📢 Campanha "${name}" criada! Atingirá aproximadamente ${contactCount} contato(s). Acesse /campaigns para agendar ou enviar.`,
    };
  }

  // ============ MÍDIA TOOLS ============

  /**
   * 🔊 Gera e envia áudio via TTS
   */
  private async toolSendAudio(workspaceId: string, args: any): Promise<any> {
    const { phone, text, voice = 'nova' } = args;

    if (!phone || !text) {
      return { success: false, error: 'Parâmetros obrigatórios: phone e text' };
    }

    try {
      // Gerar áudio com TTS
      const audioBuffer = await this.audioService.textToSpeech(text, voice);
      const audioBase64 = audioBuffer.toString('base64');
      const dataUri = `data:audio/mpeg;base64,${audioBase64}`;

      // Normalizar telefone
      const normalizedPhone = phone.replace(/\D/g, '');

      // Enviar via WhatsApp usando sendMessage com opts de mídia
      await this.whatsappService.sendMessage(workspaceId, normalizedPhone, '', {
        mediaUrl: dataUri,
        mediaType: 'audio',
      });

      return {
        success: true,
        message: `🔊 Áudio enviado para ${normalizedPhone}`,
      };
    } catch (error: any) {
      this.logger.error('Erro ao enviar áudio:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📄 Envia documento/PDF
   */
  private async toolSendDocument(workspaceId: string, args: any): Promise<any> {
    const { phone, documentName, url, caption } = args;

    if (!phone) {
      return { success: false, error: 'Parâmetro obrigatório: phone' };
    }

    try {
      const normalizedPhone = phone.replace(/\D/g, '');
      let documentUrl = url;

      // Se não tem URL direta, buscar documento por nome
      if (!documentUrl && documentName) {
        const doc = await this.prismaAny.document?.findFirst({
          where: {
            workspaceId,
            name: { contains: documentName, mode: 'insensitive' },
          },
        });
        documentUrl = doc?.url;
      }

      if (!documentUrl) {
        return {
          success: false,
          error: 'Documento não encontrado. Forneça URL ou nome cadastrado.',
        };
      }

      await this.whatsappService.sendMessage(
        workspaceId,
        normalizedPhone,
        caption || '',
        {
          mediaUrl: documentUrl,
          mediaType: 'document',
          caption: caption,
        },
      );

      return {
        success: true,
        message: `📄 Documento enviado para ${normalizedPhone}`,
      };
    } catch (error: any) {
      this.logger.error('Erro ao enviar documento:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🎤 Envia nota de voz (voice note)
   */
  private async toolSendVoiceNote(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    // Voice note é essencialmente um áudio curto
    return this.toolSendAudio(workspaceId, args);
  }

  /**
   * 🎧 Transcreve áudio para texto
   */
  private async toolTranscribeAudio(args: any): Promise<any> {
    const { audioUrl, audioBase64, language = 'pt' } = args;

    try {
      let result;

      if (audioUrl) {
        result = await this.audioService.transcribeFromUrl(audioUrl, language);
      } else if (audioBase64) {
        result = await this.audioService.transcribeFromBase64(
          audioBase64,
          language,
        );
      } else {
        return { success: false, error: 'Forneça audioUrl ou audioBase64' };
      }

      return {
        success: true,
        transcript: result.text,
        language: result.language,
      };
    } catch (error: any) {
      this.logger.error('Erro ao transcrever áudio:', error);
      return { success: false, error: error.message };
    }
  }

  // ============ BILLING TOOLS ============

  /**
   * 💳 Atualiza informações de cobrança
   */
  private async toolUpdateBillingInfo(
    workspaceId: string,
    args: any,
  ): Promise<any> {
    const { returnUrl } = args;

    try {
      // Gerar link do Stripe para atualizar cartão
      const workspace = await this.prismaAny.workspace.findUnique({
        where: { id: workspaceId },
        select: { stripeCustomerId: true },
      });

      if (workspace?.stripeCustomerId) {
        // Se tiver Stripe, criar session de setup
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.billingPortal.sessions.create({
          customer: workspace.stripeCustomerId,
          return_url:
            returnUrl ||
            process.env.FRONTEND_URL ||
            'http://localhost:3000/billing',
        });

        return {
          success: true,
          url: session.url,
          message: '🔗 Clique no link para atualizar seus dados de pagamento',
        };
      }

      return {
        success: false,
        error:
          'Nenhum método de pagamento configurado ainda. Acesse /billing para configurar.',
      };
    } catch (error: any) {
      this.logger.error('Erro ao gerar link de billing:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 📊 Retorna status de cobrança
   */
  private async toolGetBillingStatus(workspaceId: string): Promise<any> {
    try {
      const workspace = await this.prismaAny.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          plan: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          providerSettings: true,
        },
      });

      if (!workspace) {
        return { success: false, error: 'Workspace não encontrado' };
      }

      const settings = workspace.providerSettings || {};

      return {
        success: true,
        plan: workspace.plan || 'FREE',
        status: settings.billingSuspended ? 'SUSPENDED' : 'ACTIVE',
        hasPaymentMethod: !!workspace.stripeCustomerId,
        subscriptionId: workspace.stripeSubscriptionId,
        message: settings.billingSuspended
          ? '⚠️ Cobrança suspensa. Regularize para continuar usando.'
          : `✅ Plano ${workspace.plan || 'FREE'} ativo`,
      };
    } catch (error: any) {
      this.logger.error('Erro ao buscar status billing:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🔄 Altera plano (upgrade/downgrade)
   */
  private async toolChangePlan(workspaceId: string, args: any): Promise<any> {
    const { newPlan, immediate = true } = args;

    if (!newPlan) {
      return {
        success: false,
        error: 'Parâmetro obrigatório: newPlan (starter, pro, enterprise)',
      };
    }

    const validPlans = ['starter', 'pro', 'enterprise', 'free'];
    if (!validPlans.includes(newPlan.toLowerCase())) {
      return {
        success: false,
        error: `Plano inválido. Opções: ${validPlans.join(', ')}`,
      };
    }

    try {
      const workspace = await this.prismaAny.workspace.findUnique({
        where: { id: workspaceId },
        select: { plan: true, stripeSubscriptionId: true },
      });

      const currentPlan = workspace?.plan || 'FREE';
      const targetPlan = newPlan.toUpperCase();

      // Se tem subscription Stripe, redirecionar para portal
      if (workspace?.stripeSubscriptionId) {
        return {
          success: true,
          requiresAction: true,
          currentPlan,
          targetPlan,
          message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
        };
      }

      // Se não tem Stripe, atualizar direto (free → paid precisa checkout)
      if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
        return {
          success: true,
          requiresCheckout: true,
          targetPlan,
          message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
        };
      }

      // Atualizar no banco (downgrade para free)
      await this.prismaAny.workspace.update({
        where: { id: workspaceId },
        data: { plan: targetPlan },
      });

      return {
        success: true,
        previousPlan: currentPlan,
        newPlan: targetPlan,
        message: `✅ Plano alterado de ${currentPlan} para ${targetPlan}`,
      };
    } catch (error: any) {
      this.logger.error('Erro ao alterar plano:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 🧠 KLOEL THINKER (versão sem streaming para APIs internas)
   */
  async thinkSync(request: ThinkRequest): Promise<string> {
    const { message, workspaceId, mode = 'chat', companyContext } = request;

    try {
      let context = companyContext || '';
      let companyName = 'sua empresa';

      if (workspaceId) {
        const workspace = await this.prisma.workspace.findUnique({
          where: { id: workspaceId },
        });
        if (workspace) {
          companyName = workspace.name;
          context = await this.getWorkspaceContext(workspaceId);
        }
      }

      let systemPrompt: string;
      switch (mode) {
        case 'onboarding':
          systemPrompt = KLOEL_ONBOARDING_PROMPT;
          break;
        case 'sales':
          systemPrompt = KLOEL_SALES_PROMPT(companyName, context);
          break;
        default:
          systemPrompt = KLOEL_SYSTEM_PROMPT;
      }

      const history = await this.getConversationHistory(workspaceId);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const assistantMessage = response.choices[0]?.message?.content || '';

      if (workspaceId) {
        await this.saveMessage(workspaceId, 'user', message);
        await this.saveMessage(workspaceId, 'assistant', assistantMessage);
      }

      return assistantMessage;
    } catch (error) {
      this.logger.error('Erro no KLOEL Thinker Sync:', error);
      throw error;
    }
  }

  /**
   * 📚 Buscar contexto do workspace (produtos, memória, etc)
   */
  private async getWorkspaceContext(workspaceId: string): Promise<string> {
    try {
      // Buscar memórias salvas
      const memories = await this.prismaAny.kloelMemory.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      if (memories.length === 0) {
        return '';
      }

      // Formatar contexto
      const contextParts: string[] = [];

      for (const memory of memories) {
        switch (memory.type) {
          case 'product':
            contextParts.push(`PRODUTO: ${memory.content}`);
            break;
          case 'company_info':
            contextParts.push(`INFO DA EMPRESA: ${memory.content}`);
            break;
          case 'persona':
            contextParts.push(`PERSONA/TOM DE VOZ: ${memory.content}`);
            break;
          case 'objection':
            contextParts.push(`OBJEÇÃO COMUM: ${memory.content}`);
            break;
          case 'script':
            contextParts.push(`SCRIPT DE VENDA: ${memory.content}`);
            break;
          default:
            contextParts.push(memory.content);
        }
      }

      return contextParts.join('\n\n');
    } catch (error) {
      this.logger.warn('Erro ao buscar contexto:', error);
      return '';
    }
  }

  /**
   * 📜 Public API to get history
   */
  async getHistory(workspaceId: string): Promise<any[]> {
    if (!workspaceId) return [];
    try {
      const messages = await this.prismaAny.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      return messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.createdAt,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * 💬 Buscar histórico de conversa
   */
  private async getConversationHistory(
    workspaceId?: string,
  ): Promise<ChatMessage[]> {
    if (!workspaceId) return [];

    try {
      const messages = await this.prismaAny.kloelMessage.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'asc' },
        take: 20, // Últimas 20 mensagens
      });

      return messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } catch (error) {
      // Tabela pode não existir ainda
      return [];
    }
  }

  /**
   * 💾 Salvar mensagem no histórico
   */
  private async saveMessage(
    workspaceId: string,
    role: string,
    content: string,
  ): Promise<void> {
    try {
      await this.prismaAny.kloelMessage.create({
        data: {
          workspaceId,
          role,
          content,
        },
      });
    } catch (error) {
      // Tabela pode não existir ainda
      this.logger.warn('Erro ao salvar mensagem:', error);
    }
  }

  /**
   * 🧠 Salvar memória/aprendizado
   */
  async saveMemory(
    workspaceId: string,
    type: string,
    content: string,
    metadata?: any,
  ): Promise<void> {
    try {
      await this.prismaAny.kloelMemory.create({
        data: {
          workspaceId,
          type,
          content,
          metadata: metadata || {},
        },
      });
    } catch (error) {
      this.logger.error('Erro ao salvar memória:', error);
    }
  }

  /**
   * 📄 Processar PDF e extrair informações
   */
  async processPdf(workspaceId: string, pdfContent: string): Promise<string> {
    try {
      const extractionPrompt = `Analise o seguinte conteúdo de um PDF e extraia:
1. Lista de produtos com preços
2. Benefícios principais
3. Diferenciais da empresa
4. Políticas importantes (troca, garantia, frete)
5. Tom de voz/estilo de comunicação

Retorne em formato estruturado.

CONTEÚDO:
${pdfContent}`;

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente de análise de documentos comerciais.',
          },
          { role: 'user', content: extractionPrompt },
        ],
        temperature: 0.3,
      });

      const analysis = response.choices[0]?.message?.content || '';

      // Salvar na memória
      await this.saveMemory(workspaceId, 'pdf_analysis', analysis, {
        source: 'pdf',
      });

      return analysis;
    } catch (error) {
      this.logger.error('Erro ao processar PDF:', error);
      throw error;
    }
  }

  /**
   * 📱 Processar mensagem WhatsApp recebida e responder autonomamente
   * Este é o core da KLOEL - vendedor autônomo
   */
  async processWhatsAppMessage(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<string> {
    this.logger.log(`🧠 KLOEL processando mensagem de ${senderPhone}`);

    try {
      const normalizedPhone = String(senderPhone || '').replace(/\D/g, '');

      // 1) Buscar workspace e checar se autopilot está habilitado
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { providerSettings: true, name: true },
      });
      const providerSettings = (workspace?.providerSettings as any) || {};
      const autopilotEnabled =
        providerSettings?.autopilot?.enabled === true ||
        providerSettings?.autopilotEnabled === true;

      // 2) Buscar/criar lead e registrar mensagem inbound
      const lead = await this.getOrCreateLead(
        workspaceId,
        normalizedPhone || senderPhone,
      );
      await this.saveLeadMessage(lead.id, 'user', message);

      // 3) Garantir Contact (tabela padrão) para contexto do UnifiedAgent
      let contactId: string | null = null;
      try {
        if (normalizedPhone) {
          const contact = await this.prisma.contact.upsert({
            where: {
              workspaceId_phone: { workspaceId, phone: normalizedPhone },
            },
            update: {},
            create: {
              workspaceId,
              phone: normalizedPhone,
              name: `Contato ${normalizedPhone.slice(-4)}`,
            },
            select: { id: true },
          });
          contactId = contact.id;
        }
      } catch (err: any) {
        this.logger.warn(`Falha ao upsert contact: ${err?.message}`);
      }

      // 4) Se autopilot habilitado: delega ao UnifiedAgentService
      if (autopilotEnabled) {
        try {
          const unifiedResult =
            await this.unifiedAgentService.processIncomingMessage({
              workspaceId,
              contactId: contactId || undefined,
              phone: normalizedPhone || senderPhone,
              message,
              channel: 'whatsapp',
            });

          const agentResponse =
            unifiedResult?.reply ||
            unifiedResult?.response ||
            'Olá! Como posso ajudar?';

          await this.saveLeadMessage(lead.id, 'assistant', agentResponse);
          await this.updateLeadFromConversation(
            lead.id,
            message,
            agentResponse,
          );

          return agentResponse;
        } catch (agentErr: any) {
          this.logger.warn(`UnifiedAgentService falhou: ${agentErr?.message}`);
          // fallback para prompt tradicional
        }
      }

      // ===== Fallback tradicional (prompt de vendas) =====
      const conversationHistory = await this.getLeadConversationHistory(
        lead.id,
      );
      const context = await this.getWorkspaceContext(workspaceId);

      const salesSystemPrompt = KLOEL_SALES_PROMPT(
        workspace?.name || 'nossa empresa',
        context,
      );

      const messages: ChatMessage[] = [
        { role: 'system', content: salesSystemPrompt },
        ...conversationHistory,
        { role: 'user', content: message },
      ];

      const response = await chatCompletionWithFallback(this.openai, {
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      const kloelResponse =
        response.choices[0]?.message?.content ||
        'Olá! Como posso ajudá-lo hoje?';

      await this.saveLeadMessage(lead.id, 'assistant', kloelResponse);
      await this.updateLeadFromConversation(lead.id, message, kloelResponse);

      return kloelResponse;
    } catch (error: any) {
      this.logger.error(
        `Erro processando mensagem WhatsApp: ${error?.message}`,
      );
      return 'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?';
    }
  }

  /**
   * 📋 Buscar ou criar lead pelo telefone
   */
  private async getOrCreateLead(
    workspaceId: string,
    phone: string,
  ): Promise<any> {
    let lead = await this.prismaAny.kloelLead.findFirst({
      where: { workspaceId, phone },
    });

    if (!lead) {
      lead = await this.prismaAny.kloelLead.create({
        data: {
          workspaceId,
          phone,
          name: 'Lead ' + phone.slice(-4),
          stage: 'new',
          score: 0,
        },
      });
      this.logger.log(`Novo lead criado: ${lead.id}`);
    }

    return lead;
  }

  /**
   * 💬 Buscar histórico de conversa do lead
   */
  private async getLeadConversationHistory(
    leadId: string,
  ): Promise<ChatMessage[]> {
    try {
      const messages = await this.prismaAny.kloelConversation.findMany({
        where: { leadId },
        orderBy: { createdAt: 'asc' },
        take: 30, // Últimas 30 mensagens
      });

      return messages.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * 💾 Salvar mensagem do lead
   */
  private async saveLeadMessage(
    leadId: string,
    role: string,
    content: string,
  ): Promise<void> {
    try {
      await this.prismaAny.kloelConversation.create({
        data: {
          leadId,
          role,
          content,
        },
      });
    } catch (error) {
      this.logger.warn('Erro ao salvar mensagem do lead:', error);
    }
  }

  /**
   * 📊 Atualizar lead baseado na conversa (score, stage)
   */
  private async updateLeadFromConversation(
    leadId: string,
    userMessage: string,
    assistantResponse: string,
  ): Promise<void> {
    try {
      // Detectar intenção de compra
      const buyIntent = this.detectBuyIntent(userMessage);

      // Atualizar score e stage
      const updateData: any = {
        lastMessage: userMessage,
        lastIntent: buyIntent,
        updatedAt: new Date(),
      };

      if (buyIntent === 'high') {
        updateData.score = { increment: 20 };
        updateData.stage = 'negotiation';
      } else if (buyIntent === 'medium') {
        updateData.score = { increment: 10 };
        updateData.stage = 'interested';
      } else if (buyIntent === 'objection') {
        updateData.stage = 'objection';
      }

      await this.prismaAny.kloelLead.update({
        where: { id: leadId },
        data: updateData,
      });
    } catch (error) {
      this.logger.warn('Erro ao atualizar lead:', error);
    }
  }

  /**
   * 💳 Gerar link de pagamento automaticamente quando detectar intenção de compra
   * Integração direta com SmartPaymentService
   */
  async generatePaymentForLead(
    workspaceId: string,
    leadId: string,
    phone: string,
    productName: string,
    amount: number,
    conversation: string,
  ): Promise<{
    paymentUrl: string;
    pixQrCode?: string;
    message: string;
  } | null> {
    try {
      const lead = await this.prismaAny.kloelLead.findUnique({
        where: { id: leadId },
      });

      const result = await this.smartPaymentService.createSmartPayment({
        workspaceId,
        contactId: leadId,
        phone,
        customerName: lead?.name || 'Cliente',
        productName,
        amount,
        conversation,
      });

      this.logger.log(
        `💳 Pagamento gerado para lead ${leadId}: ${result.paymentUrl}`,
      );

      return {
        paymentUrl: result.paymentUrl,
        pixQrCode: result.pixQrCode,
        message: result.suggestedMessage,
      };
    } catch (error) {
      this.logger.error(`Erro ao gerar pagamento para lead: ${error.message}`);
      return null;
    }
  }

  /**
   * 🤖 Processar mensagem WhatsApp com suporte automático a pagamentos
   * Versão aprimorada que detecta intenção de compra e gera link de pagamento
   */
  async processWhatsAppMessageWithPayment(
    workspaceId: string,
    senderPhone: string,
    message: string,
  ): Promise<{ response: string; paymentLink?: string; pixQrCode?: string }> {
    const baseResponse = await this.processWhatsAppMessage(
      workspaceId,
      senderPhone,
      message,
    );

    // Verificar se há intenção de compra alta
    const buyIntent = this.detectBuyIntent(message);

    if (buyIntent === 'high') {
      // Tentar buscar produto mencionado e gerar pagamento
      const productMention = await this.extractProductFromMessage(
        workspaceId,
        message,
      );

      if (productMention) {
        const lead = await this.prismaAny.kloelLead.findFirst({
          where: { workspaceId, phone: senderPhone },
        });

        if (lead) {
          const paymentResult = await this.generatePaymentForLead(
            workspaceId,
            lead.id,
            senderPhone,
            productMention.name,
            productMention.price,
            message,
          );

          if (paymentResult) {
            return {
              response: `${baseResponse}\n\n💳 Aqui está o link para finalizar sua compra:\n${paymentResult.paymentUrl}`,
              paymentLink: paymentResult.paymentUrl,
              pixQrCode: paymentResult.pixQrCode,
            };
          }
        }
      }
    }

    return { response: baseResponse };
  }

  /**
   * 🔍 Extrair produto mencionado na mensagem
   */
  private async extractProductFromMessage(
    workspaceId: string,
    message: string,
  ): Promise<{ name: string; price: number } | null> {
    try {
      // Buscar produtos do workspace
      const products = await this.prismaAny.kloelMemory.findMany({
        where: { workspaceId, type: 'product' },
      });

      const lowerMessage = message.toLowerCase();

      for (const product of products) {
        const productData = product.value;
        const productName = (productData.name || '').toLowerCase();

        if (productName && lowerMessage.includes(productName)) {
          return {
            name: productData.name,
            price: productData.price || 0,
          };
        }
      }

      // Se não encontrou, tentar buscar do modelo Product
      const dbProducts = await this.prisma.product
        ?.findMany?.({
          where: { workspaceId, active: true },
        })
        .catch(() => []);

      for (const product of dbProducts || []) {
        if (lowerMessage.includes(product.name.toLowerCase())) {
          return {
            name: product.name,
            price: product.price,
          };
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 🎯 Detectar intenção de compra
   */
  private detectBuyIntent(
    message: string,
  ): 'high' | 'medium' | 'low' | 'objection' {
    const lowerMessage = message.toLowerCase();

    // Alta intenção de compra
    const highIntentKeywords = [
      'quero comprar',
      'vou comprar',
      'pode enviar',
      'manda o link',
      'aceito',
      'fechado',
      'como pago',
      'pix',
      'cartão',
      'boleto',
      'quero esse',
      'vou levar',
      'me envia',
      'pode mandar',
    ];

    // Média intenção
    const mediumIntentKeywords = [
      'quanto custa',
      'qual o valor',
      'tem desconto',
      'parcelado',
      'como funciona',
      'me conta mais',
      'interessado',
      'gostei',
    ];

    // Objeções
    const objectionKeywords = [
      'tá caro',
      'muito caro',
      'não tenho',
      'vou pensar',
      'depois',
      'não sei',
      'não posso',
      'não quero',
      'sem interesse',
    ];

    for (const keyword of highIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'high';
    }

    for (const keyword of mediumIntentKeywords) {
      if (lowerMessage.includes(keyword)) return 'medium';
    }

    for (const keyword of objectionKeywords) {
      if (lowerMessage.includes(keyword)) return 'objection';
    }

    return 'low';
  }

  /**
   * 📅 Lista follow-ups programados do workspace
   * @param workspaceId ID do workspace
   * @param contactId Opcional - filtrar por contato específico
   */
  async listFollowups(workspaceId: string, contactId?: string) {
    try {
      // Buscar da tabela KloelMemory onde category = 'followups'
      const whereClause: any = {
        workspaceId,
        category: 'followups',
      };

      // Se tiver contactId, filtrar no metadata
      if (contactId) {
        whereClause.metadata = {
          path: ['contactId'],
          equals: contactId,
        };
      }

      const followups = await this.prismaAny.kloelMemory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Formatar resposta
      return {
        total: followups.length,
        followups: followups.map((f: any) => ({
          id: f.id,
          key: f.key,
          phone: f.metadata?.phone,
          contactId: f.metadata?.contactId,
          message: f.metadata?.message || f.value,
          scheduledFor: f.metadata?.scheduledFor,
          delayMinutes: f.metadata?.delayMinutes,
          status: f.metadata?.status || 'pending',
          createdAt: f.createdAt,
          executedAt: f.metadata?.executedAt,
        })),
      };
    } catch (error: any) {
      this.logger.error(`Erro ao listar follow-ups: ${error.message}`);
      return { total: 0, followups: [] };
    }
  }
}

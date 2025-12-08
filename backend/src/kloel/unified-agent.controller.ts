import {
  Controller,
  Post,
  Body,
  Param,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UnifiedAgentService } from './unified-agent.service';

@ApiTags('unified-agent')
@Controller('kloel/agent')
export class UnifiedAgentController {
  constructor(private readonly agent: UnifiedAgentService) {}

  @Post(':workspaceId/process')
  @ApiOperation({ 
    summary: 'Processa mensagem com o agente unificado IA+Autopilot',
    description: 'Analisa a mensagem e executa ações automaticamente usando tool calling'
  })
  async processMessage(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      contactId?: string;
      phone: string;
      message: string;
      context?: Record<string, any>;
    },
  ) {
    const result = await this.agent.processMessage({
      workspaceId,
      contactId: body.contactId || '',
      phone: body.phone,
      message: body.message,
      context: body.context,
    });

    return {
      success: true,
      ...result,
    };
  }

  @Post(':workspaceId/simulate')
  @ApiOperation({ 
    summary: 'Simula processamento sem executar ações',
    description: 'Útil para testes e debugging'
  })
  async simulateMessage(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      contactId?: string;
      phone: string;
      message: string;
      context?: Record<string, any>;
    },
  ) {
    // Por enquanto, usa o mesmo método
    // Em produção, poderia ter um flag para não executar ações
    const result = await this.agent.processMessage({
      workspaceId,
      contactId: body.contactId || '',
      phone: body.phone,
      message: body.message,
      context: { ...body.context, simulate: true },
    });

    return {
      success: true,
      simulated: true,
      ...result,
    };
  }

  @Get(':workspaceId/tools')
  @ApiOperation({ summary: 'Lista todas as ferramentas disponíveis do agente' })
  async listTools(@Param('workspaceId') workspaceId: string) {
    // Retorna a lista de ferramentas disponíveis
    return {
      workspaceId,
      tools: [
        // Vendas
        { name: 'send_product_info', category: 'sales', description: 'Envia informações de produto' },
        { name: 'create_payment_link', category: 'sales', description: 'Cria link de pagamento' },
        { name: 'apply_discount', category: 'sales', description: 'Aplica desconto' },
        { name: 'handle_objection', category: 'sales', description: 'Trata objeção' },
        // Leads
        { name: 'qualify_lead', category: 'leads', description: 'Qualifica lead' },
        { name: 'update_lead_status', category: 'leads', description: 'Atualiza status do lead' },
        { name: 'add_tag', category: 'leads', description: 'Adiciona tag ao contato' },
        // Agendamento
        { name: 'schedule_meeting', category: 'scheduling', description: 'Agenda reunião' },
        { name: 'schedule_followup', category: 'scheduling', description: 'Agenda follow-up' },
        // Comunicação
        { name: 'send_message', category: 'communication', description: 'Envia mensagem' },
        { name: 'send_media', category: 'communication', description: 'Envia mídia' },
        { name: 'send_voice_note', category: 'communication', description: 'Envia nota de voz' },
        // Atendimento
        { name: 'transfer_to_human', category: 'support', description: 'Transfere para humano' },
        { name: 'search_knowledge_base', category: 'support', description: 'Busca na base de conhecimento' },
        // Retenção
        { name: 'anti_churn_action', category: 'retention', description: 'Ação anti-churn' },
        { name: 'reactivate_ghost', category: 'retention', description: 'Reativa lead fantasma' },
        // Fluxos
        { name: 'trigger_flow', category: 'flows', description: 'Inicia fluxo automatizado' },
        // Analytics
        { name: 'log_event', category: 'analytics', description: 'Registra evento' },
      ],
    };
  }
}

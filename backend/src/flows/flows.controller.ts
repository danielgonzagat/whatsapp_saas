import {
  Put,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { FlowsService } from './flows.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { flowQueue } from '../queue/queue';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RunFlowDto } from './dto/run-flow.dto';
import { FlowTemplateService } from './flow-template.service';

@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly workspaces: WorkspaceService,
    private readonly planLimits: PlanLimitsService,
    private readonly flowTemplates: FlowTemplateService,
  ) {}

  @Get('templates')
  async getTemplates() {
    const { FLOW_TEMPLATES } = await import('./templates');
    return FLOW_TEMPLATES;
  }

  @Post('run')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async runFlow(@Req() req: any, @Body() body: RunFlowDto) {
    return this.handleRunFlow(req, body);
  }

  @Post(':workspaceId/:flowId/run')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async runFlowWithParams(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: RunFlowDto,
  ) {
    return this.handleRunFlow(req, { ...body, workspaceId, flowId });
  }

  private async handleRunFlow(req: any, body: any) {
    const { flow, startNode, user, flowId } = body ?? {};
    const workspaceId = resolveWorkspaceId(req, body?.workspaceId);

    await this.planLimits.ensureSubscriptionActive(workspaceId);
    await this.planLimits.ensureFlowRunRate(workspaceId);

    if (!flow || !startNode || !user) {
      return {
        error: true,
        message: 'Campos obrigatórios: flow, startNode e user',
      };
    }

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const workspace = this.workspaces.toEngineWorkspace(ws);

    const targetFlowId = flowId || 'temp';

    // Se estamos rodando um flow salvo (sem payload inline), validamos existência
    if (flowId && !flow) {
      const existing = await this.flows.get(workspaceId, flowId);
      if (!existing) {
        throw new BadRequestException(
          'Flow não encontrado ou não pertence a este workspace',
        );
      }
    }

    // Para execuções inline (payload do flow enviado), garantimos que existe um registro
    // de Flow para satisfazer a FK de FlowExecution.
    if (flow) {
      await this.flows.save(workspaceId, targetFlowId, {
        nodes: flow.nodes,
        edges: flow.edges,
        name: flow.name || 'Runtime Flow',
      });
    }

    // Validação básica de estrutura
    if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
      return {
        error: true,
        message: 'flow.nodes e flow.edges devem ser arrays',
      };
    }
    const startExists = flow.nodes.some((n: any) => n.id === startNode);
    if (!startExists) {
      return { error: true, message: 'startNode não existe no flow' };
    }

    const execution = await this.flows.createExecution(
      workspaceId,
      targetFlowId,
      user,
    );

    await flowQueue.add('run-flow', {
      flow,
      startNode,
      user,
      workspace,
      flowId,
      executionId: execution.id,
    });

    return { ok: true, executionId: execution.id };
  }

  @Post('save/:workspaceId/:flowId')
  @Roles('ADMIN')
  async saveFlow(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const existing = await this.flows.get(effectiveWorkspaceId, flowId);
    if (!existing) {
      await this.planLimits.ensureFlowLimit(effectiveWorkspaceId);
    }
    return this.flows.save(effectiveWorkspaceId, flowId, body);
  }

  @Put(':workspaceId/:flowId')
  async updateFlow(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body,
  ) {
    return this.saveFlow(req, workspaceId, flowId, body);
  }

  @Post('version/:workspaceId/:flowId')
  @Roles('ADMIN')
  async saveFlowVersion(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: any,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const { nodes, edges, label } = body || {};
    return this.flows.saveVersion({
      workspaceId: effectiveWorkspaceId,
      flowId,
      nodes,
      edges,
      label,
      createdById: req?.user?.sub,
    });
  }
  @Post('log/:workspaceId/:flowId')
  async logExecution(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: any,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const { logs, user } = body || {};
    return this.flows.logExecution({
      workspaceId: effectiveWorkspaceId,
      flowId,
      user,
      logs: Array.isArray(logs) ? logs : [],
    });
  }

  @Get('log/:workspaceId/:flowId')
  async listExecutionLogs(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.listExecutionLogs(effectiveWorkspaceId, flowId);
  }

  @Get('execution/:executionId')
  async getExecution(
    @Req() req: any,
    @Param('executionId') executionId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.flows.getExecution(workspaceId, executionId);
  }

  @Post('execution/:executionId/retry')
  async retryExecution(
    @Req() req: any,
    @Param('executionId') executionId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const execution = await this.flows.retryExecution(workspaceId, executionId);

    const flow = execution.flow;
    const user = execution.contact.phone;
    const ws = await this.workspaces.getWorkspace(workspaceId);
    const workspace = this.workspaces.toEngineWorkspace(ws);

    await flowQueue.add('run-flow', {
      flowId: flow.id,
      user,
      workspace,
      executionId: execution.id, // Pass existing ID to resume/retry
    });

    return { ok: true, executionId: execution.id };
  }

  @Get(':workspaceId/:flowId')
  async getFlow(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.get(effectiveWorkspaceId, flowId);
  }

  @Get(':workspaceId')
  async listFlows(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.list(effectiveWorkspaceId);
  }

  @Get(':workspaceId/executions')
  async listExecutions(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.listExecutions(
      effectiveWorkspaceId,
      limit ? parseInt(limit) : 50,
    );
  }

  @Get(':workspaceId/:flowId/versions')
  async listFlowVersions(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.listVersions(effectiveWorkspaceId, flowId);
  }

  @Get(':workspaceId/:flowId/versions/:versionId')
  async getFlowVersion(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Param('versionId') versionId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.getVersion(effectiveWorkspaceId, versionId);
  }

  @Post(':workspaceId/from-template/:templateId')
  @Roles('ADMIN')
  async createFromTemplate(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() body: { flowId?: string; name?: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    await this.planLimits.ensureFlowLimit(effectiveWorkspaceId);

    const tpl = await this.flowTemplates.get(templateId);
    const targetFlowId = body?.flowId || `${templateId}-${Date.now()}`;
    const name = body?.name || tpl.name;

    return this.flows.save(effectiveWorkspaceId, targetFlowId, {
      nodes: tpl.nodes,
      edges: tpl.edges,
      name,
    });
  }
}

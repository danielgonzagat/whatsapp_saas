import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { flowQueue } from '../queue/queue';
import { WorkspaceService } from '../workspaces/workspace.service';
import { LogExecutionDto } from './dto/log-execution.dto';
import { RunFlowDto } from './dto/run-flow.dto';
import { SaveFlowVersionDto } from './dto/save-flow-version.dto';
import { FlowTemplateService } from './flow-template.service';
import { FlowsService } from './flows.service';

/** Flows controller. */
@Controller('flows')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class FlowsController {
  constructor(
    private readonly flows: FlowsService,
    private readonly workspaces: WorkspaceService,
    private readonly planLimits: PlanLimitsService,
    private readonly flowTemplates: FlowTemplateService,
  ) {}

  /** Get templates. */
  @Get('templates')
  async getTemplates() {
    const { FLOW_TEMPLATES } = await import('./templates');
    return FLOW_TEMPLATES;
  }

  /** Run flow. */
  @Post('run')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async runFlow(@Req() req: AuthenticatedRequest, @Body() body: RunFlowDto) {
    return this.handleRunFlow(req, body);
  }

  /** Run flow with params. */
  @Post(':workspaceId/:flowId/run')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async runFlowWithParams(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: RunFlowDto,
  ) {
    return this.handleRunFlow(req, { ...body, workspaceId, flowId });
  }

  private async handleRunFlow(
    req: AuthenticatedRequest,
    body: RunFlowDto & { workspaceId?: string; flowId?: string },
  ) {
    const { flow, startNode, user, flowId } = body ?? {};
    const workspaceId = resolveWorkspaceId(req, body?.workspaceId);

    await this.planLimits.ensureSubscriptionActive(workspaceId);
    await this.planLimits.ensureFlowRunRate(workspaceId);

    if (!flow || !startNode || !user) {
      throw new BadRequestException('Campos obrigatórios: flow, startNode e user');
    }

    const ws = await this.workspaces.getWorkspace(workspaceId);
    const workspace = this.workspaces.toEngineWorkspace(ws);

    const targetFlowId = flowId || 'temp';

    // Se estamos rodando um flow salvo (sem payload inline), validamos existência
    if (flowId && !flow) {
      const existing = await this.flows.get(workspaceId, flowId);
      if (!existing) {
        throw new BadRequestException('Flow não encontrado ou não pertence a este workspace');
      }
    }

    // Para execuções inline (payload do flow enviado), garantimos que existe um registro
    // de Flow para satisfazer a FK de FlowExecution.
    if (flow) {
      await this.flows.save(workspaceId, targetFlowId, {
        nodes: flow.nodes,
        edges: flow.edges,
        name: (flow.name as string) || 'Runtime Flow',
      });
    }

    // Validação básica de estrutura
    if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) {
      throw new BadRequestException('flow.nodes e flow.edges devem ser arrays');
    }
    const startExists = flow.nodes.some((n: Record<string, unknown>) => n.id === startNode);
    if (!startExists) {
      throw new BadRequestException('startNode não existe no flow');
    }

    const execution = await this.flows.createExecution(workspaceId, targetFlowId, user);

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

  /** Save flow. */
  @Post('save/:workspaceId/:flowId')
  @Roles('ADMIN')
  async saveFlow(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: { nodes: unknown; edges: unknown; name?: string },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const existingRecord = await this.flows.get(effectiveWorkspaceId, flowId);
    if (!existingRecord) {
      await this.planLimits.ensureFlowLimit(effectiveWorkspaceId);
    }
    return this.flows.save(effectiveWorkspaceId, flowId, body);
  }

  /** Update flow. */
  @Put(':workspaceId/:flowId')
  async updateFlow(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: { nodes: unknown; edges: unknown; name?: string },
  ) {
    return this.saveFlow(req, workspaceId, flowId, body);
  }

  /** Save flow version. */
  @Post('version/:workspaceId/:flowId')
  @Roles('ADMIN')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async saveFlowVersion(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: SaveFlowVersionDto,
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
  /** Log execution. */
  @Post('log/:workspaceId/:flowId')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async logExecution(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
    @Body() body: LogExecutionDto,
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

  /** List execution logs. */
  @Get('log/:workspaceId/:flowId')
  async listExecutionLogs(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.listExecutionLogs(effectiveWorkspaceId, flowId);
  }

  /** Get execution. */
  @Get('execution/:executionId')
  async getExecution(@Req() req: AuthenticatedRequest, @Param('executionId') executionId: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.flows.getExecution(workspaceId, executionId);
  }

  /** Retry execution. */
  @Post('execution/:executionId/retry')
  async retryExecution(
    @Req() req: AuthenticatedRequest,
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

  /** Get flow. */
  @Get(':workspaceId/:flowId')
  async getFlow(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.get(effectiveWorkspaceId, flowId);
  }

  /** List flows. */
  @Get(':workspaceId')
  async listFlows(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.list(effectiveWorkspaceId);
  }

  /** List executions. */
  @Get(':workspaceId/executions')
  async listExecutions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return this.flows.listExecutions(effectiveWorkspaceId, clampedLimit);
  }

  /** List flow versions. */
  @Get(':workspaceId/:flowId/versions')
  async listFlowVersions(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') flowId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.listVersions(effectiveWorkspaceId, flowId);
  }

  /** Get flow version. */
  @Get(':workspaceId/:flowId/versions/:versionId')
  async getFlowVersion(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('flowId') _flowId: string,
    @Param('versionId') versionId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.flows.getVersion(effectiveWorkspaceId, versionId);
  }

  /** Create from template. */
  @Post(':workspaceId/from-template/:templateId')
  @Roles('ADMIN')
  async createFromTemplate(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Param('templateId') templateId: string,
    @Body() body: { flowId?: string; name?: string; idempotencyKey?: string },
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

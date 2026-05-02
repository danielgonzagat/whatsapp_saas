import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import {
  executeNode,
  type FlowNodeExecutorDeps,
} from './__companions__/flow-node-executor.companion';
import { sendMessage as sendMessageCompanion } from './__companions__/flow-message-sender.companion';
import { ContextStore } from './context-store';
import { prisma } from './db';
import {
  appendLog as appendLogExternal,
  failExecution as failExecutionExternal,
  markStatus as markStatusExternal,
} from './flow-engine-lifecycle';
import {
  parseFlowDefinition as parseFlowDefinitionExternal,
  parseTimeoutMember as parseTimeoutMemberExternal,
} from './flow-engine-parse';
import { readOptionalString } from './flow-engine.helpers';
import type {
  ExecutionState,
  FlowDefinition,
  FlowNode,
  FlowVariables,
  PersistedFlowLogEntry,
  RawFlowEdge,
  RawFlowNode,
} from './flow-engine.types';
import { buildQueueJobId } from './job-id';
import { WorkerLogger } from './logger';
import { CRM } from './providers/crm';
import { Queue } from './queue';
// Segurança
import { forEachSequential } from './utils/async-sequence';
import { safeEvaluateBoolean } from './utils/safe-eval';

const D_RE = /\D/g;

/** Maximum number of node transitions before the flow is forcefully aborted. */
const MAX_ITERATIONS = 1000;
/** Maximum wall-clock duration (ms) a single flow execution may run. 10 minutes. */
const MAX_FLOW_DURATION_MS = 10 * 60_000;
/** Per-node step timeout (ms). If a node handler takes longer it is aborted. */
const STEP_TIMEOUT_MS = 60_000;
/** Maximum automatic retries for a single node before escalating the error. */
const MAX_RETRIES = 3;

/** Flow engine global. */
export class FlowEngineGlobal {
  private static instance: FlowEngineGlobal;
  private queue: Queue;
  private context: ContextStore;
  private log = new WorkerLogger('flow-engine');
  private timeoutChecker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.queue = new Queue('flow-engine');
    this.context = new ContextStore('flow-context');

    // Worker central — consome jobs de execução
    this.queue.on<{ user: string; workspaceId?: string }>('job', (job) => this.run(job));

    // Monitor de Timeouts (World Class Reliability)
    this.timeoutChecker = setInterval(() => this.checkTimeouts(), 5000);
  }

  /** Shutdown. */
  async shutdown(): Promise<void> {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
    await this.queue.close();
  }

  /** Get. */
  static get(): FlowEngineGlobal {
    if (!FlowEngineGlobal.instance) {
      FlowEngineGlobal.instance = new FlowEngineGlobal();
    }
    return FlowEngineGlobal.instance;
  }

  /**
   * Dispara um fluxo para um usuário específico
   */
  async startFlow(
    user: string,
    flow: FlowDefinition,
    initialVars: FlowVariables = {},
    executionId?: string,
  ) {
    const normalizedUser = this.normalizeUser(user);
    this.log.info('start_flow', { user: normalizedUser, flowId: flow.id, executionId });
    // Carrega dados do CRM
    const workspaceId = flow.workspaceId || 'default';
    let contact = await CRM.getContact(workspaceId, normalizedUser);
    if (!contact) {
      await CRM.addContact(workspaceId, { phone: normalizedUser, name: normalizedUser });
      contact = await CRM.getContact(workspaceId, normalizedUser);
    }

    const contactVars = contact
      ? {
          contact_name: contact.name,
          contact_email: contact.email,
          ...(contact.customFields as object),
        }
      : {};

    const state: ExecutionState = {
      user: normalizedUser,
      flowId: flow.id,
      workspaceId,
      contactId: contact?.id,
      nodeId: flow.startNode,
      variables: { ...contactVars, ...initialVars },
      logs: [],
      startedAt: Date.now(),
      stack: [],
    };

    // Cria ou reutiliza registro de execução
    if (executionId) {
      state.executionId = executionId;

      // Reidrata logs/estado existentes para evitar overwrite ao reprocessar
      const existingExec = await prisma.flowExecution.findFirst({
        where: { id: executionId, workspaceId: state.workspaceId },
        select: { logs: true, state: true, currentNodeId: true },
      });

      if (existingExec?.state && typeof existingExec.state === 'object') {
        state.variables = {
          ...(existingExec.state as Record<string, unknown>),
          ...state.variables,
        };
      }

      state.logs = (existingExec?.logs as PersistedFlowLogEntry[]) || [];
      // Se já havia nó atual, retoma dele; caso contrário usa startNode
      state.nodeId = existingExec?.currentNodeId || flow.startNode;

      await prisma.flowExecution.updateMany({
        where: { id: executionId, workspaceId: state.workspaceId },
        data: {
          status: 'RUNNING',
          currentNodeId: state.nodeId,
          state: state.variables as Prisma.InputJsonValue,
          logs: (state.logs ?? []) as never as Prisma.InputJsonValue,
        },
      });
    } else {
      const exec = await prisma.flowExecution.create({
        data: {
          flowId: flow.id,
          workspaceId,
          contactId: contact?.id,
          status: 'RUNNING',
          currentNodeId: flow.startNode,
          state: state.variables as Prisma.InputJsonValue,
          logs: [],
        },
      });
      state.executionId = exec.id;
    }

    // Real-time Log: Start
    await this.context.publish(`flow:log:${workspaceId}`, {
      id: uuid(),
      timestamp: Date.now(),
      type: 'flow_start',
      message: `Fluxo iniciado para ${normalizedUser}`,
      data: { flowId: flow.id, executionId: state.executionId },
    });

    await this.context.set(this.key(normalizedUser, workspaceId), state);
    await this.queue.push({ user: normalizedUser, workspaceId });
  }

  /**
   * Retoma execução quando usuário responde
   */
  async onUserResponse(user: string, message: string, workspaceId?: string) {
    const normalizedUser = this.normalizeUser(user);
    this.log.info('user_response', { user: normalizedUser, message, workspaceId });

    let state = await this.context.get<ExecutionState>(this.key(normalizedUser, workspaceId));
    if (!state && !workspaceId) {
      state = await this.context.get<ExecutionState>(this.key(normalizedUser));
    }

    // --- NEURO CRM TRIGGER ---
    try {
      const { memoryQueue } = await import('./queue');
      const triggerWorkspaceId = state?.workspaceId || workspaceId || 'default';
      (async () => {
        const contact = await prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId: triggerWorkspaceId, phone: normalizedUser } },
        });
        if (contact) {
          await memoryQueue.add('analyze-contact', {
            workspaceId: triggerWorkspaceId,
            contactId: contact.id,
          });

          // --- AUTOPILOT TRIGGER ---
          const { autopilotQueue } = await import('./queue');
          await autopilotQueue.add(
            'scan-contact',
            {
              workspaceId: triggerWorkspaceId,
              contactId: contact.id,
              phone: normalizedUser,
              messageContent: message,
            },
            {
              jobId: buildQueueJobId('scan-contact', triggerWorkspaceId, contact.id, Date.now()),
              removeOnComplete: true,
            },
          );
        }
      })();
    } catch (e) {
      this.log.warn('NeuroTrigger Failed', e);
      this.log.warn('Context', e);
    }
    // -------------------------

    if (!state) {
      return;
    }

    // Remove timeout
    await this.context.zrem('timeouts', this.timeoutMember(normalizedUser, state.workspaceId));

    state.variables.last_user_message = message;
    state.waitingForResponse = false;
    state.timeoutAt = undefined;

    await this.context.set(this.key(normalizedUser, state.workspaceId), state);
    await this.queue.push({ user: normalizedUser, workspaceId: state.workspaceId });
  }

  /**
   * Loop principal de execução
   */
  private async run(job: { user: string; workspaceId?: string }) {
    this.log.info('run_job', { user: job.user, workspaceId: job.workspaceId });

    let state = await this.context.get<ExecutionState>(this.key(job.user, job.workspaceId));
    if (!state && !job.workspaceId) {
      // Fallback compat (chave antiga sem workspace)
      state = await this.context.get<ExecutionState>(this.key(job.user));
    }
    if (!state) {
      return;
    }

    const flow = await this.loadFlow(state.flowId, state.workspaceId);
    if (!flow) {
      return;
    }

    let iterations = 0;

    const executeNodeWithTimeout = async (
      currentState: ExecutionState,
      node: FlowNode,
    ): Promise<string | 'WAIT' | 'END'> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Step timeout: node ${node.id} (${node.type}) exceeded ${STEP_TIMEOUT_MS}ms`,
              ),
            ),
          STEP_TIMEOUT_MS,
        ).unref(),
      );

      const execute = executeNodeWithRetry(currentState, node);
      return Promise.race([execute, timeout]);
    };

    const executeNodeWithRetry = async (
      currentState: ExecutionState,
      node: FlowNode,
      retryCount = 0,
    ): Promise<string | 'WAIT' | 'END' | undefined> => {
      try {
        return await this.executeNode(currentState, node);
      } catch (nodeErr) {
        const nextRetryCount = retryCount + 1;
        if (nextRetryCount >= MAX_RETRIES) {
          throw nodeErr;
        }

        this.log.warn('node_retry', {
          nodeId: node.id,
          attempt: nextRetryCount,
          error: nodeErr instanceof Error ? nodeErr.message : String(nodeErr),
        });
        await appendLogExternal(this.context, currentState, {
          event: 'retry',
          nodeId: node.id,
          attempt: nextRetryCount,
          message: nodeErr instanceof Error ? nodeErr.message : String(nodeErr),
        });
        await this.sleep(1000 * 2 ** nextRetryCount);
        return executeNodeWithRetry(currentState, node, nextRetryCount);
      }
    };

    const runNextNode = async (): Promise<void> => {
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        this.log.error('flow_iteration_limit', {
          user: state.user,
          flowId: state.flowId,
          nodeId: state.nodeId,
          iterations,
        });
        await failExecutionExternal(
          this.context,
          this.log,
          state,
          `Flow execution aborted: exceeded ${MAX_ITERATIONS} iterations (possible infinite loop)`,
        );
        return;
      }

      // Max flow duration guard
      if (state.startedAt && Date.now() - state.startedAt > MAX_FLOW_DURATION_MS) {
        this.log.error('flow_duration_limit', {
          user: state.user,
          flowId: state.flowId,
          nodeId: state.nodeId,
          durationMs: Date.now() - state.startedAt,
        });
        await failExecutionExternal(
          this.context,
          this.log,
          state,
          `Flow execution aborted: exceeded ${MAX_FLOW_DURATION_MS}ms total duration`,
        );
        return;
      }

      const node = flow.nodes[state.nodeId];
      if (!node) {
        this.log.error('node_missing', { user: state.user, nodeId: state.nodeId });
        await failExecutionExternal(
          this.context,
          this.log,
          state,
          `Node ${state.nodeId} não encontrado`,
        );
        return;
      }

      try {
        this.log.info('node_start', { user: state.user, nodeId: node.id, type: node.type });
        await appendLogExternal(this.context, state, {
          event: 'node_start',
          nodeId: node.id,
          type: node.type,
        });

        const result = await executeNodeWithTimeout(state, node);

        this.log.info('node_end', { user: state.user, nodeId: node.id, result });
        await appendLogExternal(this.context, state, {
          event: 'node_end',
          nodeId: node.id,
          result,
        });

        // WAIT — aguarda resposta do usuário
        if (result === 'WAIT') {
          await markStatusExternal(this.context, this.log, state, 'WAITING_INPUT');
          await this.context.set(this.key(state.user, state.workspaceId), state);
          return;
        }

        // END — fluxo finalizado
        if (result === 'END') {
          await markStatusExternal(this.context, this.log, state, 'COMPLETED');
          await this.context.delete(this.key(state.user, state.workspaceId));
          return;
        }

        // NEXT NODE
        state.nodeId = result ?? state.nodeId;
        await markStatusExternal(this.context, this.log, state, 'RUNNING');
        await this.context.set(this.key(state.user, state.workspaceId), state);
        return runNextNode();
      } catch (err) {
        this.log.error('node_error', {
          nodeId: node.id,
          user: state.user,
          error: err instanceof Error ? err.message : String(err),
        });
        await appendLogExternal(this.context, state, {
          event: 'error',
          nodeId: node.id,
          message: err instanceof Error ? err.message : String(err),
        });

        // try/catch interno do fluxo
        const fallback = readOptionalString(node.data, 'onError');
        if (fallback) {
          state.nodeId = fallback;
          return runNextNode();
        }

        await failExecutionExternal(
          this.context,
          this.log,
          state,
          (err instanceof Error ? err.message : String(err)) || 'Erro no fluxo',
        );
        return;
      }
    };

    await runNextNode();
  }

  private get nodeExecutorDeps(): FlowNodeExecutorDeps {
    return {
      sendMessage: (user, text, workspaceId) => this.sendMessage(user, text, workspaceId),
      context: this.context,
      log: this.log,
      timeoutMember: (user, workspaceId) => this.timeoutMember(user, workspaceId),
      sleep: (ms) => this.sleep(ms),
      evaluate: (expr, vars) => safeEvaluateBoolean(expr, vars),
    };
  }

  private async executeNode(
    state: ExecutionState,
    node: FlowNode,
  ): Promise<string | 'WAIT' | 'END'> {
    return executeNode(this.nodeExecutorDeps, state, node);
  }

  private async sendMessage(user: string, text: string, workspaceId?: string) {
    return sendMessageCompanion(
      { log: this.log, sleep: (ms) => this.sleep(ms) },
      user,
      text,
      workspaceId,
    );
  }

  /** Parse flow definition. */
  public parseFlowDefinition = parseFlowDefinitionExternal;

  /** Load flow. */
  public async loadFlow(id: string, workspaceId?: string): Promise<FlowDefinition | null> {
    try {
      // 1. Fetch from DB
      const flow = await prisma.flow.findFirst({
        where: {
          id,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });
      if (!flow) {
        return null;
      }

      if (workspaceId && flow.workspaceId !== workspaceId) {
        this.log.warn('flow_workspace_mismatch', {
          flowId: id,
          expected: workspaceId,
          actual: flow.workspaceId,
        });
        // Optional: return null or throw error if strict security needed
      }

      return this.parseFlowDefinition(
        flow.id,
        flow.nodes as never as RawFlowNode[],
        flow.edges as never as RawFlowEdge[],
        flow.workspaceId,
      );
    } catch (err) {
      console.error('[ENGINE] Error loading flow %s: %O', id, err);
      return null;
    }
  }

  /**
   * Busca uma execução existente (usado para idempotência no processor)
   */
  public async getExecution(id: string, workspaceId?: string) {
    return prisma.flowExecution.findFirst({
      where: {
        id,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });
  }

  private key(user: string, workspaceId?: string) {
    const normalized = this.normalizeUser(user);
    return workspaceId ? `flow:${workspaceId}:${normalized}` : `flow:${normalized}`; // fallback compat
  }

  private normalizeUser(user: string) {
    return (user || '').replace(D_RE, '');
  }

  private timeoutMember(user: string, workspaceId?: string) {
    const normalized = this.normalizeUser(user);
    return workspaceId ? `${workspaceId}:${normalized}` : normalized;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((res) => {
      setTimeout(res, ms);
    });
  }

  /**
   * Monitor de Timeouts
   * Verifica fluxos que excederam o tempo de espera
   */
  private async checkTimeouts() {
    const now = Date.now();
    const expiredMembers = await this.context.zrangeByScore('timeouts', 0, now);

    await forEachSequential(expiredMembers, async (member) => {
      const { user, workspaceId } = parseTimeoutMemberExternal(member);
      this.log.warn('timeout_detected', { user, workspaceId });
      await this.context.zrem('timeouts', member);

      let state = await this.context.get<ExecutionState>(this.key(user, workspaceId));
      if (!state && !workspaceId) {
        state = await this.context.get<ExecutionState>(this.key(user));
      }
      if (!state) {
        return;
      }

      state.waitingForResponse = false;
      state.timeoutAt = undefined;
      state.variables.timeout_triggered = true;

      // Se o nó tiver configuração de timeout, poderíamos redirecionar
      // Por enquanto, retomamos o fluxo, permitindo que o próximo nó decida (ex: Condition Node checando 'timeout_triggered')

      await this.context.set(this.key(user, state.workspaceId), state);
      await this.queue.push({ user, workspaceId: state.workspaceId });
    });
  }
}

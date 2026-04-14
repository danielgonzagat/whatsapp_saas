import { planCiaActions } from './brain';
import { type CiaSeedConversation, buildCiaWorkspaceStateFromSeed } from './build-state';
import { type CiaGuaranteeReport, assertCiaGuarantees, buildCiaGuaranteeReport } from './contracts';

export interface CiaHarnessContact extends CiaSeedConversation {
  saleValue?: number;
  pendingPaymentAmount?: number;
  failuresBeforeSuccess?: number;
}

export interface CiaHarnessArrival {
  cycle: number;
  contact: CiaHarnessContact;
}

export interface CiaHarnessEvent {
  type: 'status' | 'thought' | 'contact' | 'sale' | 'payment' | 'error' | 'summary';
  cycle: number;
  message: string;
  contactId?: string;
  phone?: string;
  meta?: Record<string, any>;
}

export interface CiaHarnessSummary {
  initialBacklog: number;
  finalBacklog: number;
  repliedContacts: number;
  followupsSent: number;
  paymentRecoveries: number;
  errors: number;
  approvedRevenue: number;
  recoveredRevenue: number;
  cyclesRun: number;
}

export interface CiaHarnessResult {
  workspaceId: string;
  timeline: CiaHarnessEvent[];
  guaranteeReports: CiaGuaranteeReport[];
  summary: CiaHarnessSummary;
  contacts: Array<
    CiaHarnessContact & {
      unreadCount: number;
      pendingPaymentAmount: number;
      failuresBeforeSuccess: number;
      repliesSent: number;
      followupsSent: number;
      salesApproved: number;
      paymentsRecovered: number;
      failedActions: number;
    }
  >;
}

interface MutableHarnessContact extends CiaHarnessContact {
  unreadCount: number;
  pendingPaymentAmount: number;
  failuresBeforeSuccess: number;
  repliesSent: number;
  followupsSent: number;
  salesApproved: number;
  paymentsRecovered: number;
  failedActions: number;
}

function cloneContacts(input: CiaHarnessContact[]): MutableHarnessContact[] {
  return input.map((contact) => ({
    ...contact,
    unreadCount: Number(contact.unreadCount || 0) || 0,
    pendingPaymentAmount: Number(contact.pendingPaymentAmount || 0) || 0,
    failuresBeforeSuccess: Number(contact.failuresBeforeSuccess || 0) || 0,
    repliesSent: 0,
    followupsSent: 0,
    salesApproved: 0,
    paymentsRecovered: 0,
    failedActions: 0,
  }));
}

function pendingCount(contacts: MutableHarnessContact[]) {
  return contacts.filter((contact) => contact.unreadCount > 0 || contact.pendingPaymentAmount > 0)
    .length;
}

function pushEvent(timeline: CiaHarnessEvent[], event: CiaHarnessEvent) {
  timeline.push(event);
}

function shouldApproveSale(contact: MutableHarnessContact) {
  return (
    Number(contact.saleValue || 0) > 0 &&
    (contact.unreadCount > 0 ||
      /compr|fechar|pix|boleto|cart[aã]o|pre[cç]o|valor/i.test(
        String(contact.lastMessageText || ''),
      ))
  );
}

export function runCiaMissionHarness(input: {
  workspaceId: string;
  workspaceName?: string | null;
  contacts: CiaHarnessContact[];
  arrivals?: CiaHarnessArrival[];
  maxCycles?: number;
  maxActionsPerCycle?: number;
}): CiaHarnessResult {
  const contacts = cloneContacts(input.contacts);
  const arrivals = [...(input.arrivals || [])].sort((a, b) => a.cycle - b.cycle);
  const timeline: CiaHarnessEvent[] = [];
  const guaranteeReports: CiaGuaranteeReport[] = [];
  const maxCycles = Math.max(1, Number(input.maxCycles || 20) || 20);
  const maxActionsPerCycle = Math.max(1, Math.min(10, Number(input.maxActionsPerCycle || 5) || 5));

  const summary: CiaHarnessSummary = {
    initialBacklog: pendingCount(contacts),
    finalBacklog: 0,
    repliedContacts: 0,
    followupsSent: 0,
    paymentRecoveries: 0,
    errors: 0,
    approvedRevenue: 0,
    recoveredRevenue: 0,
    cyclesRun: 0,
  };

  pushEvent(timeline, {
    type: 'thought',
    cycle: 0,
    message: 'Acessando seu WhatsApp fake',
  });
  pushEvent(timeline, {
    type: 'thought',
    cycle: 0,
    message: 'Sincronizando conversas no simulador',
  });
  pushEvent(timeline, {
    type: 'status',
    cycle: 0,
    message: `Encontrei ${summary.initialBacklog} conversas pendentes para a missão fake.`,
  });

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    for (const arrival of arrivals.filter((item) => item.cycle === cycle)) {
      contacts.push(
        ...cloneContacts([
          {
            ...arrival.contact,
            unreadCount: Number(arrival.contact.unreadCount || 1) || 1,
          },
        ]),
      );
      pushEvent(timeline, {
        type: 'status',
        cycle,
        message: `Chegou uma nova conversa durante a execução: ${arrival.contact.contactName || arrival.contact.phone || arrival.contact.contactId || 'contato'}.`,
        contactId: arrival.contact.contactId,
        phone: arrival.contact.phone,
      });
    }

    const active = contacts.filter(
      (contact) => contact.unreadCount > 0 || contact.pendingPaymentAmount > 0,
    );

    const state = buildCiaWorkspaceStateFromSeed({
      workspaceId: input.workspaceId,
      workspaceName: input.workspaceName,
      openBacklog: active.length,
      approvedSalesAmount: summary.approvedRevenue,
      approvedSalesCount: contacts.reduce((acc, contact) => acc + contact.salesApproved, 0),
      conversations: active.map((contact) => ({
        conversationId: contact.conversationId,
        contactId: contact.contactId,
        phone: contact.phone,
        contactName: contact.contactName,
        unreadCount: contact.unreadCount,
        lastMessageAt: contact.lastMessageAt,
        lastMessageText: contact.lastMessageText,
        leadScore: contact.leadScore,
      })),
    });

    const batch = planCiaActions(state, { maxActionsPerCycle });
    const report = buildCiaGuaranteeReport(state, batch, maxActionsPerCycle);
    assertCiaGuarantees(report);
    guaranteeReports.push(report);

    pushEvent(timeline, {
      type: 'thought',
      cycle,
      message: batch.summary,
      meta: {
        actions: batch.actions.length,
        ignored: batch.ignoredCount,
      },
    });

    if (!batch.actions.length) {
      summary.cyclesRun = cycle;
      break;
    }

    for (const action of batch.actions) {
      const target = contacts.find(
        (contact) =>
          contact.conversationId === action.conversationId ||
          (!!action.contactId && contact.contactId === action.contactId) ||
          (!!action.phone && contact.phone === action.phone),
      );
      if (!target) continue;

      if (target.failuresBeforeSuccess > 0) {
        target.failuresBeforeSuccess -= 1;
        target.failedActions += 1;
        summary.errors += 1;
        pushEvent(timeline, {
          type: 'error',
          cycle,
          contactId: target.contactId,
          phone: target.phone,
          message: `Falhei ao executar ${action.type.toLowerCase()} para ${target.contactName || target.phone || 'contato'}, mas a missão continuou.`,
        });
        continue;
      }

      if (action.type === 'RESPOND') {
        target.unreadCount = 0;
        target.repliesSent += 1;
        summary.repliedContacts += 1;
        pushEvent(timeline, {
          type: 'contact',
          cycle,
          contactId: target.contactId,
          phone: target.phone,
          message: `Respondi ${target.contactName || target.phone || 'contato'}.`,
        });

        if (shouldApproveSale(target)) {
          target.salesApproved += 1;
          summary.approvedRevenue += Number(target.saleValue || 0) || 0;
          pushEvent(timeline, {
            type: 'sale',
            cycle,
            contactId: target.contactId,
            phone: target.phone,
            message: `Venda aprovada de R$${Number(target.saleValue || 0).toFixed(2)} para ${target.contactName || target.phone || 'contato'}.`,
            meta: {
              amount: Number(target.saleValue || 0) || 0,
            },
          });
          target.saleValue = 0;
        }
      } else if (action.type === 'PAYMENT_RECOVERY') {
        const recovered = Number(target.pendingPaymentAmount || 0) || 0;
        target.pendingPaymentAmount = 0;
        target.followupsSent += 1;
        target.paymentsRecovered += recovered > 0 ? 1 : 0;
        summary.followupsSent += 1;
        if (recovered > 0) {
          summary.paymentRecoveries += 1;
          summary.recoveredRevenue += recovered;
        }
        pushEvent(timeline, {
          type: 'payment',
          cycle,
          contactId: target.contactId,
          phone: target.phone,
          message:
            recovered > 0
              ? `Recuperei R$${recovered.toFixed(2)} de pagamento pendente para ${target.contactName || target.phone || 'contato'}.`
              : `Enviei uma cobrança para ${target.contactName || target.phone || 'contato'}.`,
          meta: {
            amount: recovered,
          },
        });
      } else {
        target.followupsSent += 1;
        summary.followupsSent += 1;
        pushEvent(timeline, {
          type: 'contact',
          cycle,
          contactId: target.contactId,
          phone: target.phone,
          message: `Enviei um follow-up para ${target.contactName || target.phone || 'contato'}.`,
        });
      }
    }

    summary.cyclesRun = cycle;
    if (pendingCount(contacts) === 0 && arrivals.every((arrival) => arrival.cycle <= cycle)) {
      break;
    }
  }

  summary.finalBacklog = pendingCount(contacts);
  pushEvent(timeline, {
    type: 'summary',
    cycle: summary.cyclesRun,
    message: `Missão fake concluída com ${summary.repliedContacts} respostas, ${summary.paymentRecoveries} cobranças recuperadas e R$${summary.approvedRevenue.toFixed(2)} aprovados.`,
    meta: summary,
  });

  return {
    workspaceId: input.workspaceId,
    timeline,
    guaranteeReports,
    summary,
    contacts,
  };
}

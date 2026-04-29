import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { prisma } from '../db';
import { CRM } from './crm';
import { StripeRuntime } from './stripe-runtime';

/** Tool definition type. */
export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ToolContext = { workspaceId: string; user: string };
type ToolArgs = Record<string, unknown>;
type ToolHandler = (args: ToolArgs, ctx: ToolContext) => Promise<string> | string;

function asString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return String(value ?? '');
}

async function handleUpdateContactField(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const field = asString(args.field);
  const value = asString(args.value);
  const updateData: Record<string, unknown> = {};
  if (field.startsWith('customFields.')) {
    const key = field.split('.')[1];
    updateData.customFields = { [key]: value };
  } else {
    updateData[field] = value;
  }
  await CRM.updateContact(ctx.workspaceId, ctx.user, updateData);
  return `Successfully updated ${field} to ${value}`;
}

async function handleAddTag(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const tag = asString(args.tag);
  await CRM.addTag(ctx.workspaceId, ctx.user, tag);
  return `Tag ${tag} added.`;
}

function handleCheckAvailability(args: ToolArgs): string {
  const dateStr = asString(args.date);
  const day = new Date(dateStr).getDay();
  if (day === 0 || day === 6) {
    return 'No slots available (Weekend).';
  }
  return 'Available slots: 10:00, 14:00, 16:00';
}

async function createStripePaymentLink(
  stripe: Stripe.Stripe,
  productName: string,
  amount: number,
): Promise<string> {
  try {
    const frontendUrl =
      process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: { name: productName },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${frontendUrl}/checkout/success`,
      cancel_url: `${frontendUrl}/checkout/cancel`,
    });
    return session.url || 'Error generating link';
  } catch (stripeError: unknown) {
    const err =
      stripeError instanceof Error
        ? stripeError
        : new Error(typeof stripeError === 'string' ? stripeError : 'unknown error');
    console.error('Stripe Error:', stripeError);
    return `Stripe Error: ${err.message}`;
  }
}

function mockPaymentLink(productName: string, amount: number): string {
  const linkId = randomUUID().slice(0, 12);
  return `(MOCK) https://checkout.stripe.com/pay/${linkId}?amount=${amount}&product=${encodeURIComponent(productName)}`;
}

const stripeClient: Stripe.Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new StripeRuntime(process.env.STRIPE_SECRET_KEY)
  : null;

async function handleCreatePaymentLink(args: ToolArgs): Promise<string> {
  const productName = asString(args.productName);
  const amount = Number(args.amount) || 0;
  if (stripeClient) {
    return createStripePaymentLink(stripeClient, productName, amount);
  }
  return mockPaymentLink(productName, amount);
}

async function resolveDefaultStageId(workspaceId: string): Promise<string | undefined> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { workspaceId, isDefault: true },
    include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
  });
  const stageId = pipeline?.stages[0]?.id;
  if (stageId) {
    return stageId;
  }

  const anyStage = await prisma.stage.findFirst({
    where: { pipeline: { workspaceId } },
  });
  return anyStage?.id;
}

async function handleCreateCrmDeal(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const dealTitle = asString(args.title);
  const dealValue = Number(args.value) || 0;
  const contact = await CRM.getContact(ctx.workspaceId, ctx.user);
  if (!contact) {
    return 'Contact not found.';
  }

  const stageId = await resolveDefaultStageId(ctx.workspaceId);
  if (!stageId) {
    return 'No CRM pipeline configured.';
  }

  await prisma.deal.create({
    data: {
      title: dealTitle,
      value: dealValue,
      contactId: contact.id,
      stageId,
      priority: 'MEDIUM',
      status: 'OPEN',
    },
  });
  return `Deal '${dealTitle}' created successfully.`;
}

async function handleUpdateDealStage(args: ToolArgs, ctx: ToolContext): Promise<string> {
  const stageNameArg = asString(args.stageName);
  const stageName = stageNameArg.toLowerCase();
  const contact = await CRM.getContact(ctx.workspaceId, ctx.user);
  if (!contact) {
    return 'Contact not found.';
  }

  const stages = await prisma.stage.findMany({
    where: { pipeline: { workspaceId: ctx.workspaceId } },
  });

  const targetStage = stages.find((s) => s.name.toLowerCase().includes(stageName));
  if (!targetStage) {
    return `Stage '${stageNameArg}' not found. Available: ${stages.map((s) => s.name).join(', ')}`;
  }

  const { count } = await prisma.deal.updateMany({
    where: { contactId: contact.id, status: 'OPEN' },
    data: { stageId: targetStage.id },
  });

  return `Moved ${count} deal(s) to stage '${targetStage.name}'.`;
}

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  get_current_time: () => new Date().toISOString(),
  update_contact_field: handleUpdateContactField,
  add_tag: handleAddTag,
  check_availability: (args) => handleCheckAvailability(args),
  create_payment_link: (args) => handleCreatePaymentLink(args),
  create_crm_deal: handleCreateCrmDeal,
  update_deal_stage: handleUpdateDealStage,
};

function getStripe(): Stripe.Stripe | null {
  return stripeClient;
}

function getDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: 'Get the current date and time in ISO format.',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_contact_field',
        description: "Update a specific field in the contact's CRM profile.",
        parameters: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              description: 'The field name (e.g., email, customFields.interest)',
            },
            value: { type: 'string', description: 'The value to set' },
          },
          required: ['field', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_tag',
        description: 'Add a tag to the current contact.',
        parameters: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: "The tag to add (e.g., 'interested', 'vip')" },
          },
          required: ['tag'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check availability for a meeting on a specific date.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          },
          required: ['date'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_payment_link',
        description: 'Create a Stripe payment link for a product.',
        parameters: {
          type: 'object',
          properties: {
            productName: { type: 'string', description: 'Name of the product' },
            amount: { type: 'number', description: 'Amount in BRL (e.g. 100.00)' },
          },
          required: ['productName', 'amount'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_crm_deal',
        description: 'Create a new sales deal for the current contact.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: "Deal title (e.g. 'Interested in Enterprise Plan')",
            },
            value: { type: 'number', description: 'Estimated value in BRL' },
          },
          required: ['title', 'value'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_deal_stage',
        description: "Move the contact's open deals to a new stage in the CRM pipeline.",
        parameters: {
          type: 'object',
          properties: {
            stageName: {
              type: 'string',
              description: "Name of the target stage (e.g. 'Negotiation', 'Closed Won')",
            },
          },
          required: ['stageName'],
        },
      },
    },
  ];
}

async function execute(
  name: string,
  args: Record<string, unknown>,
  context: { workspaceId: string; user: string },
): Promise<string> {
  console.log('[Tools] Executing %s with args: %O', name, args);

  try {
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return 'Tool not found.';
    }
    return await handler(args, context);
  } catch (err: unknown) {
    console.error('Tool execution error:', err);
    return `Error executing tool: ${err instanceof Error ? err.message : 'unknown_error'}`;
  }
}

/** Tools registry. */
export const ToolsRegistry = {
  getStripe,
  getDefinitions,
  execute,
} as const;

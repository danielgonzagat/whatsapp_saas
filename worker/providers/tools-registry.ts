import { CRM } from "./crm";
import Stripe from "stripe";
import { prisma } from "../db";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
};

export class ToolsRegistry {
  private static stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

  static getDefinitions(): ToolDefinition[] {
    return [
      {
        type: "function",
        function: {
          name: "get_current_time",
          description: "Get the current date and time in ISO format.",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "update_contact_field",
          description: "Update a specific field in the contact's CRM profile.",
          parameters: {
            type: "object",
            properties: {
              field: { type: "string", description: "The field name (e.g., email, customFields.interest)" },
              value: { type: "string", description: "The value to set" },
            },
            required: ["field", "value"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "add_tag",
          description: "Add a tag to the current contact.",
          parameters: {
            type: "object",
            properties: {
              tag: { type: "string", description: "The tag to add (e.g., 'interested', 'vip')" },
            },
            required: ["tag"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "check_availability",
          description: "Check availability for a meeting on a specific date.",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date in YYYY-MM-DD format" },
            },
            required: ["date"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_payment_link",
          description: "Create a Stripe payment link for a product.",
          parameters: {
            type: "object",
            properties: {
              productName: { type: "string", description: "Name of the product" },
              amount: { type: "number", description: "Amount in BRL (e.g. 100.00)" },
            },
            required: ["productName", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "create_crm_deal",
          description: "Create a new sales deal for the current contact.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Deal title (e.g. 'Interested in Enterprise Plan')" },
              value: { type: "number", description: "Estimated value in BRL" },
            },
            required: ["title", "value"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "update_deal_stage",
          description: "Move the contact's open deals to a new stage in the CRM pipeline.",
          parameters: {
            type: "object",
            properties: {
              stageName: { type: "string", description: "Name of the target stage (e.g. 'Negotiation', 'Closed Won')" },
            },
            required: ["stageName"],
          },
        },
      },
    ];
  }

  static async execute(name: string, args: any, context: { workspaceId: string; user: string }): Promise<string> {
    console.log(`[Tools] Executing ${name} with args:`, args);

    try {
      switch (name) {
        case "get_current_time":
          return new Date().toISOString();

        case "update_contact_field":
          // Simple mapping for custom fields vs root fields
          const updateData: any = {};
          if (args.field.startsWith("customFields.")) {
             const key = args.field.split(".")[1];
             updateData.customFields = { [key]: args.value };
          } else {
             updateData[args.field] = args.value;
          }
          await CRM.updateContact(context.workspaceId, context.user, updateData);
          return `Successfully updated ${args.field} to ${args.value}`;

        case "add_tag":
          await CRM.addTag(context.workspaceId, context.user, args.tag);
          return `Tag ${args.tag} added.`;

        case "check_availability":
          // Mock availability logic
          const day = new Date(args.date).getDay();
          if (day === 0 || day === 6) return "No slots available (Weekend).";
          return "Available slots: 10:00, 14:00, 16:00";

        case "create_payment_link":
           if (this.stripe) {
             try {
               const frontendUrl =
                 process.env.FRONTEND_URL ||
                 process.env.NEXT_PUBLIC_APP_URL ||
                 "http://localhost:3000";
               const session = await this.stripe.checkout.sessions.create({
                 payment_method_types: ["card"],
                 line_items: [
                   {
                     price_data: {
                       currency: "brl",
                       product_data: {
                         name: args.productName,
                       },
                       unit_amount: Math.round(args.amount * 100), // Stripe expects cents
                     },
                     quantity: 1,
                 },
                 ],
                 mode: "payment",
                 success_url: `${frontendUrl}/checkout/success`,
                 cancel_url: `${frontendUrl}/checkout/cancel`,
               });
               return session.url || "Error generating link";
             } catch (stripeError: any) {
               console.error("Stripe Error:", stripeError);
               return `Stripe Error: ${stripeError.message}`;
             }
           } else {
             // Mock Fallback
             const linkId = Math.random().toString(36).substring(7);
             return `(MOCK) https://checkout.stripe.com/pay/${linkId}?amount=${args.amount}&product=${encodeURIComponent(args.productName)}`;
           }

        case "create_crm_deal": {
            const contact = await CRM.getContact(context.workspaceId, context.user);
            if (!contact) return "Contact not found.";
            
            // Get default pipeline stage
            const pipeline = await prisma.pipeline.findFirst({
                where: { workspaceId: context.workspaceId, isDefault: true },
                include: { stages: { orderBy: { order: 'asc' }, take: 1 } }
            });
            
            let stageId = pipeline?.stages[0]?.id;
            if (!stageId) {
                // Fallback: find any stage
                const anyStage = await prisma.stage.findFirst({ where: { pipeline: { workspaceId: context.workspaceId } } });
                stageId = anyStage?.id;
            }
            
            if (!stageId) return "No CRM pipeline configured.";

            await prisma.deal.create({
                data: {
                    title: args.title,
                    value: Number(args.value),
                    contactId: contact.id,
                    stageId: stageId,
                    priority: "MEDIUM",
                    status: "OPEN"
                }
            });
            return `Deal '${args.title}' created successfully.`;
        }

        case "update_deal_stage": {
            const stageName = args.stageName.toLowerCase();
            const contact = await CRM.getContact(context.workspaceId, context.user);
            if (!contact) return "Contact not found.";

            // Find target stage by fuzzy name matching
            const stages = await prisma.stage.findMany({
                where: { pipeline: { workspaceId: context.workspaceId } }
            });
            
            const targetStage = stages.find(s => s.name.toLowerCase().includes(stageName));
            if (!targetStage) return `Stage '${args.stageName}' not found. Available: ${stages.map(s => s.name).join(", ")}`;

            // Update all open deals for this contact
            const { count } = await prisma.deal.updateMany({
                where: { 
                    contactId: contact.id, 
                    status: "OPEN" 
                },
                data: { stageId: targetStage.id }
            });

            return `Moved ${count} deal(s) to stage '${targetStage.name}'.`;
        }

        default:
          return "Tool not found.";
      }
    } catch (err: any) {
      return `Error executing tool: ${err.message}`;
    }
  }
}

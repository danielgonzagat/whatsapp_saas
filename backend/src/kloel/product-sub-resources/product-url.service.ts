import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { coerceString, removeUndefined } from './helpers/common.helpers';

type Args = Record<string, unknown>;

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'sim';
  }
  return fallback;
}

function optionalBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalStr(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Canonical domain service for product URLs (sales pages, landing pages).
 *
 * Both the REST controller (`ProductUrlController`) and the Kloel chat
 * capability layer (tier-6 `urls.*`, dispatched via
 * {@link KloelDomainServiceResolver}) route product-URL mutations through this
 * service so that workspace isolation, validation, and audit logging happen in
 * exactly one place — never via direct Prisma in a tool handler
 * (anti-pattern 2.2).
 *
 * Methods follow the resolver call convention `(workspaceId, args)` and return
 * a `{ success, data }` envelope so the dispatcher can pass them straight back
 * to the chat as a receipt.
 */
@Injectable()
export class ProductUrlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Assert the actor's workspace owns the product before touching its URLs. */
  private async assertProductAccess(workspaceId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, workspaceId },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }
    return product;
  }

  /** Resolve a URL by id, asserting its product belongs to the workspace. */
  private async resolveOwnedUrl(workspaceId: string, urlId: string) {
    const url = await this.prisma.productUrl.findFirst({
      where: { id: urlId, product: { workspaceId } },
    });
    if (!url) {
      throw new NotFoundException('URL não encontrada');
    }
    return url;
  }

  /** Add a URL to a product. args: { productId, url, description? }. */
  async add(workspaceId: string, args: Args) {
    const productId = coerceString(args.productId).trim();
    const url = coerceString(args.url).trim();
    const description = coerceString(args.description).trim() || url;
    if (!productId || !url) {
      throw new BadRequestException('productId e url são obrigatórios');
    }

    await this.assertProductAccess(workspaceId, productId);

    const created = await this.prisma.productUrl.create({
      data: {
        productId,
        description,
        url,
        isPrivate: toBool(args.isPrivate, false),
        active: toBool(args.active, true),
        aiLearning: toBool(args.aiLearning, false),
        chatEnabled: toBool(args.chatEnabled, false),
      },
    });

    return { success: true, data: created };
  }

  /**
   * List the URLs registered for a product (sales/landing pages).
   *
   * domainService alias: `ProductUrlService.list` — backs the deprecated query
   * capability `get_product_urls`. Workspace-isolated: asserts the product
   * belongs to the actor's workspace before reading, so URLs from other
   * workspaces can never leak into a chat receipt. args: { productId }.
   */
  async list(workspaceId: string, args: Args) {
    const productId = coerceString(args.productId).trim();
    if (!productId) {
      throw new BadRequestException('productId é obrigatório');
    }

    await this.assertProductAccess(workspaceId, productId);

    const urls = await this.prisma.productUrl.findMany({
      where: { productId, product: { workspaceId } },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: urls };
  }

  /** Edit an existing URL. args: { urlId, url?, description?, active?, ... }. */
  async update(workspaceId: string, args: Args) {
    const urlId = coerceString(args.urlId).trim();
    if (!urlId) {
      throw new BadRequestException('urlId é obrigatório');
    }

    await this.resolveOwnedUrl(workspaceId, urlId);

    const updated = await this.prisma.productUrl.update({
      where: { id: urlId },
      data: removeUndefined({
        url: optionalStr(args.url),
        description: optionalStr(args.description),
        isPrivate: optionalBool(args.isPrivate),
        active: optionalBool(args.active),
        aiLearning: optionalBool(args.aiLearning),
        chatEnabled: optionalBool(args.chatEnabled),
      }),
    });

    return { success: true, data: updated };
  }

  /** Remove a URL. args: { urlId }. Sensitive — audited. */
  async delete(workspaceId: string, args: Args) {
    const urlId = coerceString(args.urlId).trim();
    if (!urlId) {
      throw new BadRequestException('urlId é obrigatório');
    }

    await this.resolveOwnedUrl(workspaceId, urlId);

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'ProductUrl',
      resourceId: urlId,
      details: { deletedBy: 'kloel-capability' },
    });

    const deleted = await this.prisma.productUrl.delete({ where: { id: urlId } });
    return { success: true, data: deleted };
  }

  /** Shared toggle for the boolean flag capabilities. args: { urlId, enabled }. */
  private async toggleFlag(
    workspaceId: string,
    args: Args,
    field: 'isPrivate' | 'aiLearning' | 'chatEnabled',
  ) {
    const urlId = coerceString(args.urlId).trim();
    if (!urlId) {
      throw new BadRequestException('urlId é obrigatório');
    }

    await this.resolveOwnedUrl(workspaceId, urlId);

    const updated = await this.prisma.productUrl.update({
      where: { id: urlId },
      data: { [field]: toBool(args.enabled, true) },
    });

    return { success: true, data: updated };
  }

  /** urls.toggle_private */
  togglePrivate(workspaceId: string, args: Args) {
    return this.toggleFlag(workspaceId, args, 'isPrivate');
  }

  /** urls.toggle_kloel_learning */
  toggleKloelLearning(workspaceId: string, args: Args) {
    return this.toggleFlag(workspaceId, args, 'aiLearning');
  }

  /** urls.toggle_kloel_chat_embed */
  toggleKloelChatEmbed(workspaceId: string, args: Args) {
    return this.toggleFlag(workspaceId, args, 'chatEnabled');
  }
}

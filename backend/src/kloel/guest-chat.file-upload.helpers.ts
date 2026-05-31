import { randomIdSegment } from '../common/random-id';
import type { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
/**
 * Handle file upload from chat — store file and link to product.
 * Extracted from GuestChatService to keep the service below the 500 LOC cap.
 */
export async function handleGuestFileUpload(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  workspaceId: string,
  productName: string,
  toolDispatcher: KloelToolDispatcherService | undefined,
): Promise<{ url?: string; message: string }> {
  void mimetype;
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const uploadDir = path.join(process.cwd(), '..', 'uploads', workspaceId || 'guest');
    await fs.mkdir(uploadDir, { recursive: true });
    const ext = path.extname(originalname) || '.bin';
    const filename = `${Date.now().toString(36)}_${randomIdSegment(6)}${ext}`;
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);
    const url = `/uploads/${workspaceId || 'guest'}/${filename}`;

    if (productName && toolDispatcher) {
      try {
        await toolDispatcher.executeTool(workspaceId, 'update_product', {
          productName,
          imageUrl: url,
        });
      } catch {
        /* non-blocking */
      }
    }
    return {
      url,
      message: `Arquivo ${originalname} enviado${productName ? ` e vinculado ao produto ${productName}` : ''}.`,
    };
  } catch (e: unknown) {
    return { message: `Erro: ${e instanceof Error ? e.message : 'desconhecido'}` };
  }
}

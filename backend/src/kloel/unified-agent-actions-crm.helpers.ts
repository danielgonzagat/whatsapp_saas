import { forEachSequential } from '../common/async-sequence';
import { PrismaService } from '../prisma/prisma.service';

const D_RE = /\D/g;

export async function actionImportContacts(
  prisma: PrismaService,
  workspaceId: string,
  args: { source?: unknown; csvData?: unknown },
) {
  const { source, csvData } = args;
  if (source === 'csv' && csvData) {
    const csv = typeof csvData === 'string' ? csvData : '';
    const lines = csv.split('\n').filter((l: string) => l.trim());
    const headerRow = lines[0];
    if (!headerRow) {
      return { success: false, error: 'CSV vazio' };
    }
    const header = headerRow.split(',').map((h: string) => h.trim().toLowerCase());
    const contacts: Array<{ phone: string; name?: string; email?: string }> = [];
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) {
        continue;
      }
      const values = line.split(',').map((v: string) => v.trim());
      const contact: { phone?: string; name?: string; email?: string } = {};
      header.forEach((h, idx) => {
        const val = values[idx];
        if (val !== undefined) {
          if (h.includes('phone') || h.includes('telefone') || h.includes('whatsapp')) {
            contact.phone = val.replace(D_RE, '');
          } else if (h.includes('name') || h.includes('nome')) {
            contact.name = val;
          } else if (h.includes('email')) {
            contact.email = val;
          }
        }
      });
      if (contact.phone) {
        contacts.push({
          phone: contact.phone,
          ...(contact.name !== undefined ? { name: contact.name } : {}),
          ...(contact.email !== undefined ? { email: contact.email } : {}),
        });
      }
    }
    let created = 0;
    await forEachSequential(contacts, async (c) => {
      try {
        await prisma.contact.upsert({
          where: { workspaceId_phone: { workspaceId, phone: c.phone } },
          create: {
            workspaceId,
            phone: c.phone,
            ...(c.name !== undefined ? { name: c.name } : {}),
            ...(c.email !== undefined ? { email: c.email } : {}),
          },
          update: {
            ...(c.name ? { name: c.name } : {}),
            ...(c.email ? { email: c.email } : {}),
          },
        });
        created += 1;
      } catch {
        /* expected on re-import */
      }
    });
    return {
      success: true,
      message: `${created} contatos importados com sucesso`,
      total: contacts.length,
      created,
    };
  }
  return { success: false, error: 'Fonte de importação não suportada ou dados inválidos' };
}

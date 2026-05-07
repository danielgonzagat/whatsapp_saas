import { forEachSequential } from '../../common/async-sequence';
import { PrismaService } from '../../prisma/prisma.service';

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
    const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
    const contacts: Array<{ phone: string; name?: string; email?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v: string) => v.trim());
      const contact: { phone?: string; name?: string; email?: string } = {};
      header.forEach((h, idx) => {
        if (h.includes('phone') || h.includes('telefone') || h.includes('whatsapp'))
          contact.phone = values[idx]?.replace(D_RE, '');
        else if (h.includes('name') || h.includes('nome')) contact.name = values[idx];
        else if (h.includes('email')) contact.email = values[idx];
      });
      if (contact.phone) contacts.push(contact as { phone: string; name?: string; email?: string });
    }
    let created = 0;
    await forEachSequential(contacts, async (c) => {
      try {
        await prisma.contact.upsert({
          where: { workspaceId_phone: { workspaceId, phone: c.phone } },
          create: { workspaceId, phone: c.phone, name: c.name, email: c.email },
          update: { name: c.name || undefined, email: c.email || undefined },
        });
        created++;
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

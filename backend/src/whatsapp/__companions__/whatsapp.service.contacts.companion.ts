export type ContactManager = {
  optInContact(workspaceId: string, phone: string): Promise<{ ok: boolean }>;
  optOutContact(workspaceId: string, phone: string): Promise<{ ok: boolean }>;
};

export async function resolveOptInStatus(
  prisma: { contact: { findUnique: (args: any) => Promise<any> } },
  workspaceId: string,
  phone: string,
) {
  const contact = await prisma.contact.findUnique({
    where: { workspaceId_phone: { workspaceId, phone } },
    select: { id: true, tags: { select: { name: true } } },
  });
  if (!contact) {
    return { optIn: false, contactExists: false };
  }
  const optIn = contact.tags.some((t: { name: string }) => t.name === 'optin_whatsapp');
  return { optIn, contactExists: true };
}

export async function isPublicCodeTaken(prisma: any, code: string) {
  const [plan, checkoutLink, affiliateLink] = await Promise.all([
    prisma.checkoutProductPlan.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.checkoutPlanLink.findFirst({
      where: { referenceCode: code },
      select: { id: true },
    }),
    prisma.affiliateLink.findFirst({
      where: { code },
      select: { id: true },
    }),
  ]);

  return Boolean(plan || checkoutLink || affiliateLink);
}

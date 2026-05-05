interface CodeLookupDelegates {
  checkoutProductPlan: {
    findFirst(args: {
      where: { referenceCode: string };
      select: { id: boolean };
    }): Promise<{ id: string } | null>;
  };
  checkoutPlanLink: {
    findFirst(args: {
      where: { referenceCode: string };
      select: { id: boolean };
    }): Promise<{ id: string } | null>;
  };
  affiliateLink: {
    findFirst(args: {
      where: { code: string };
      select: { id: boolean };
    }): Promise<{ id: string } | null>;
  };
}

export async function isPublicCodeTaken(prisma: CodeLookupDelegates, code: string) {
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

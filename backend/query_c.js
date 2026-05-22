
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
(async() => {
  const cols = await p.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND (table_name = 'RAC_CheckoutCoupon' OR table_name = 'RAC_ProductCoupon') ORDER BY table_name, ordinal_position");
  for (const c of cols) console.log(c.table_name, c.column_name, c.data_type);
  
  const coupons = await p.$queryRawUnsafe('SELECT id, code, "discountType", value, "usageLimit", "expiresAt" FROM "RAC_CheckoutCoupon" WHERE "workspaceId" = \'ws-test-001\' LIMIT 5');
  console.log("COUPONS found:", coupons.length);
  for (const c of coupons) console.log(JSON.stringify(c));
  
  await p.$disconnect();
})();

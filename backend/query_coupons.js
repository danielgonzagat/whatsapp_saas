
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // Check coupons
  try {
    const coupons=await p.$queryRawUnsafe('SELECT id, code, type, value, "usageLimit", "expiresAt", "workspaceId", "createdAt" FROM "RAC_CheckoutCoupon" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
    console.log('COUPONS:', coupons.length);
    for (const c of coupons) console.log(' ', c.id, c.code, c.type, c.value, 'limit='+c.usageLimit);
  } catch(e) { console.log('COUPON ERROR:', e.message?.substring(0,200)); }
  
  // Also check if there's a Coupon table
  const tables=await p.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename ILIKE '%coupon%' ORDER BY tablename");
  console.log('COUPON TABLES:', tables.map(t=>t.tablename));
  
  await p.$disconnect();
})();

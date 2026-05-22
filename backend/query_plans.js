
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // Check product plans
  const plans=await p.$queryRawUnsafe('SELECT id, "productId", name, price, status, "createdAt" FROM "RAC_ProductPlan" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('PRODUCT PLANS:', JSON.stringify(plans, null, 2));
  
  // Check payment links
  const links=await p.$queryRawUnsafe('SELECT id, "productId", amount, status, url, "createdAt" FROM "RAC_ExternalPaymentLink" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('PAYMENT LINKS:', JSON.stringify(links, null, 2));
  
  // Check invoices
  const inv=await p.$queryRawUnsafe('SELECT id, amount, status, "createdAt" FROM "RAC_Invoice" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('INVOICES:', JSON.stringify(inv, null, 2));
  
  // Check payments
  const pay=await p.$queryRawUnsafe('SELECT id, amount, status, method, "createdAt" FROM "RAC_Payment" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('PAYMENTS:', JSON.stringify(pay, null, 2));
  
  await p.$disconnect();
})();

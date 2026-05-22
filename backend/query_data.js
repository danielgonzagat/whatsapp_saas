
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // Product plans  
  const plans=await p.$queryRawUnsafe('SELECT id, name, price, "billingType", "itemsPerPlan", active, "productId", "createdAt" FROM "RAC_ProductPlan" WHERE "productId"=\'c5859b94-298e-4e26-9805-477bdd7991e6\'');
  console.log('PRODUCT PLANS:', plans.length);
  for (const pl of plans) console.log(' ', pl.id, pl.name, 'price='+pl.price, pl.billingType, 'items='+pl.itemsPerPlan, 'active='+pl.active);
  
  // Payment links
  const links=await p.$queryRawUnsafe('SELECT id, "productName", price, "paymentUrl", "isActive", "createdAt" FROM "RAC_ExternalPaymentLink" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('\nPAYMENT LINKS:', links.length);
  for (const l of links) console.log(' ', l.id, l.productName, 'price='+l.price, 'url='+l.paymentUrl?.substring(0,50));
  
  // Checkouts
  const chk=await p.$queryRawUnsafe('SELECT id, "planId", "brandName", "enablePix", "enableCreditCard", "enableBoleto", "createdAt" FROM "RAC_CheckoutConfig" LIMIT 5');
  console.log('\nCHECKOUTS:', chk.length);
  for (const c of chk) console.log(' ', c.id, c.brandName, 'pix='+c.enablePix, 'card='+c.enableCreditCard, 'boleto='+c.enableBoleto);
  
  // Payments
  const payments=await p.$queryRawUnsafe('SELECT id, amount, status, method, "customerEmail", "createdAt" FROM "RAC_Payment" WHERE "workspaceId"=\'ws-test-001\' ORDER BY "createdAt" DESC LIMIT 5');
  console.log('\nPAYMENTS:', payments.length);
  for (const p of payments) console.log(' ', p.id, 'amount='+p.amount, p.status, p.method, p.customerEmail);
  
  await p.$disconnect();
})();

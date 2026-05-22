
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  // Plans
  const plans=await p.productPlan.findMany({where:{productId:{in:(await p.product.findMany({where:{workspaceId:'ws-test-001'},select:{id:true}})).map(x=>x.id)}},orderBy:{createdAt:'desc'},take:5});
  console.log('PLANS:', plans.length);
  plans.forEach(x=>console.log(' -', x.id.substring(0,20), x.name, 'R$'+x.price, 'items:'+x.itemsPerPlan));
  
  // Checkouts
  const checkouts=await p.checkoutConfig.findMany({orderBy:{createdAt:'desc'},take:5});
  console.log('CHECKOUTS:', checkouts.length);
  checkouts.forEach(x=>console.log(' -', x.id.substring(0,20), x.brandName, x.planId?.substring(0,20)));
  
  await p.$disconnect();
})();

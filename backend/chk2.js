
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const plans=await p.productPlan.findMany({orderBy:{createdAt:'desc'},take:10,
    include:{product:{select:{name:true}}}
  });
  console.log('PLANS:', plans.length);
  plans.forEach(x=>console.log(' -', x.id.substring(0,16), x.name, 'R$'+x.price, '| product:', x.product?.name));
  
  const checkout=await p.$queryRawUnsafe('SELECT COUNT(*) as c FROM "RAC_ProductCheckout"');
  console.log('CHECKOUTS:', checkout[0]?.c||0);
  
  await p.$disconnect();
})();

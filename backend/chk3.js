
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const plans=await p.productPlan.findMany({orderBy:{createdAt:'desc'},take:10,include:{product:{select:{name:true}}}});
  console.log('PLANOS:', plans.length);
  plans.forEach(x=>console.log(' -', x.name, 'R$'+x.price, '|', x.product?.name));
  
  const prod = await p.product.findFirst({where:{name:{contains:'Curso VIP',mode:'insensitive'}},select:{name:true,price:true}});
  console.log('\nCurso VIP price:', prod?.price, '(R$' + (prod?.price/100||0) + ')');
  
  const totalProds = await p.product.count({where:{workspaceId:'ws-test-001'}});
  console.log('Total products:', totalProds);
  
  await p.$disconnect();
})();

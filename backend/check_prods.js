
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const prods=await p.product.findMany({where:{workspaceId:'ws-test-001'},orderBy:{createdAt:'desc'},take:5});
  prods.forEach(x=>console.log(x.id.substring(0,20),'|',x.name,'| R$',x.price,'|',x.status,'|',x.createdAt?.toISOString()?.substring(0,19)));
  console.log('TOTAL:',prods.length,'products');
  await p.$disconnect();
})();

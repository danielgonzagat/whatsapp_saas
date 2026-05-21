
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const prod = await p.product.findFirst({
    where: { workspaceId:'ws-test-001', name: { contains: 'Frasco PDRN', mode: 'insensitive' } },
    select: { id:true, name:true }
  });
  console.log('FOUND:', prod ? prod.name + ' - ' + prod.id : 'NOT FOUND');
  
  const allNames = await p.product.findMany({where:{workspaceId:'ws-test-001'},select:{name:true}});
  console.log('ALL:', allNames.map(x=>x.name));
  await p.$disconnect();
})();

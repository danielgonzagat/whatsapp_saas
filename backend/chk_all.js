
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
(async()=>{
  const tables=await p.$queryRawUnsafe("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename ILIKE '%checkout%' ORDER BY tablename");
  console.log('CHECKOUT TABLES:', tables.map(t=>t.tablename));
  
  for (const t of tables) {
    const count=await p.$queryRawUnsafe('SELECT COUNT(*) as c FROM "' + t.tablename + '"');
    console.log(' ', t.tablename, ':', count[0]?.c || 0, 'rows');
  }
  
  await p.$disconnect();
})();
